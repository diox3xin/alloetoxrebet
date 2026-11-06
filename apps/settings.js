/**
 * Settings — управление аккаунтом пользователя.
 * Contract: constructor sets this.title / this.icon, render(container) writes into container.
 */

import { renderCharacterBookHTML, bindCharacterBook } from './character-book.js';
import {
    loadApiSettings, saveApiSettings, isApiConfigured,
    listProfiles, addProfile, activateProfile, removeProfile, renameProfile,
    testConnection, cachedModels,
} from './prompt-llm.js';

export class SettingsApp {
    constructor(context, storage, accountManager) {
        this.context = context;
        this.storage = storage;
        this.accountManager = accountManager;
        this.title = 'Settings';
        this.icon = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>`;
    }

    render(container) {
        if (!this.accountManager) {
            container.innerHTML = '<div class="astral-empty-state"><div class="astral-empty-state-icon">⚠</div><div>Аккаунт недоступен</div></div>';
            return;
        }
        const account = this.accountManager.getCurrentAccount();

        container.innerHTML = `
            <div class="astral-app astral-settings">
                <div class="astral-settings-section">
                    <h3 class="astral-section-title">Профиль</h3>

                    <div class="astral-profile-edit">
                        <div class="astral-avatar-edit">
                            <img src="${this._esc(account.avatar)}" alt="Avatar" class="astral-avatar-preview" />
                            <button class="astral-btn-icon" data-action="change-avatar">✎</button>
                        </div>

                        <div class="astral-form-group">
                            <label>Имя</label>
                            <input type="text" id="astral-account-name" value="${this._esc(account.name)}" placeholder="Ваше имя" />
                        </div>

                        <div class="astral-form-group">
                            <label>Биография</label>
                            <textarea id="astral-account-bio" placeholder="Расскажите о себе..." rows="3">${this._esc(account.bio)}</textarea>
                        </div>

                        <button class="astral-btn-primary" data-action="save-profile">Сохранить</button>
                    </div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">Настройки API</h3>
                    <div class="astral-form-group">
                        <label>Профиль</label>
                        <div class="astral-api-profile-bar">
                            <select id="astral-api-profile"></select>
                            <button class="astral-btn-icon" data-act="profile-new" title="Новый">+</button>
                            <button class="astral-btn-icon" data-act="profile-del" title="Удалить">✕</button>
                        </div>
                    </div>
                    <div class="astral-form-group">
                        <label>Endpoint</label>
                        <input type="text" id="astral-api-endpoint" placeholder="https://api.openai.com/v1" />
                    </div>
                    <div class="astral-form-group">
                        <label>API ключ</label>
                        <input type="password" id="astral-api-key" placeholder="sk-..." />
                    </div>
                    <div class="astral-form-group">
                        <label>Модель</label>
                        <div class="astral-api-model-bar">
                            <select id="astral-api-model"></select>
                            <button class="astral-btn-icon" data-act="api-connect" title="Подключиться">⟳</button>
                        </div>
                        <input type="text" id="astral-api-model-manual" placeholder="или ввести вручную" />
                    </div>
                    <div class="astral-form-group">
                        <label>Температура</label>
                        <input type="number" id="astral-api-temp" min="0" max="2" step="0.1" value="0.7" />
                    </div>
                    <div class="astral-api-note" id="astral-api-status"></div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">Внешность персонажей</h3>
                    <div id="astral-app-charbook"></div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">Статистика</h3>
                    <div class="astral-stats-grid">
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.followers}</div>
                            <div class="astral-stat-label">Подписчики</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.following}</div>
                            <div class="astral-stat-label">Подписки</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.posts}</div>
                            <div class="astral-stat-label">Публикации</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.likes}</div>
                            <div class="astral-stat-label">Лайки</div>
                        </div>
                    </div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">О телефоне</h3>
                    <div class="astral-about">
                        <div class="astral-about-line">
                            <span>Версия</span>
                            <span>1.0.0</span>
                        </div>
                        <div class="astral-about-line">
                            <span>Создан</span>
                            <span>${new Date(account.createdAt).toLocaleDateString('ru-RU')}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.attachEvents(container);
    }

    attachEvents(container) {
        // ── Настройки API для модели, которая пишет промпты ──
        const q = (sel) => container.querySelector(sel);
        const api = {
            endpoint: q('#astral-api-endpoint'),
            apiKey: q('#astral-api-key'),
            profile: q('#astral-api-profile'),
            model: q('#astral-api-model'),
            manual: q('#astral-api-model-manual'),
            temperature: q('#astral-api-temp'),
        };
        const status = q('#astral-api-status');

        const fillModels = (models, selected) => {
            if (!api.model) return;
            const list = models.length ? models : cachedModels();
            api.model.innerHTML = '';
            if (!list.length) {
                api.model.innerHTML = '<option value="">— нажмите ⟳ —</option>';
                return;
            }
            for (const id of list) {
                const o = document.createElement('option');
                o.value = id; o.textContent = id;
                if (id === selected) o.selected = true;
                api.model.appendChild(o);
            }
            if (selected && !list.includes(selected)) {
                const o = document.createElement('option');
                o.value = selected; o.textContent = selected; o.selected = true;
                api.model.appendChild(o);
            }
        };

        const fillProfiles = () => {
            if (!api.profile) return;
            const { profiles, activeId } = listProfiles();
            api.profile.innerHTML = '';
            if (!profiles.length) {
                api.profile.innerHTML = '<option value="">— нет —</option>';
                return;
            }
            for (const p of profiles) {
                const o = document.createElement('option');
                o.value = p.id; o.textContent = p.name || p.id;
                if (p.id === activeId) o.selected = true;
                api.profile.appendChild(o);
            }
        };

        const fillFields = () => {
            const cur = loadApiSettings();
            if (api.endpoint) api.endpoint.value = cur.endpoint;
            if (api.apiKey) api.apiKey.value = cur.apiKey;
            if (api.temperature) api.temperature.value = cur.temperature;
            if (api.manual) api.manual.value = '';
            fillModels(cachedModels(), cur.model);
        };

        const refresh = () => {
            if (!status) return;
            const s = loadApiSettings();
            status.textContent = (s.endpoint && s.model)
                ? `✓ Промпты пишет: ${s.model}`
                : 'Промпты пишет основная модель чата';
        };

        const save = () => {
            saveApiSettings({
                endpoint: api.endpoint?.value || '',
                apiKey: api.apiKey?.value || '',
                model: api.manual?.value.trim() || api.model?.value || '',
                temperature: Number(api.temperature?.value) || 0.7,
            });
            refresh();
        };

        fillProfiles();
        fillFields();
        refresh();

        container.querySelector('[data-act="api-connect"]')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            if (status) status.textContent = 'Проверяю подключение…';

            const res = await testConnection({
                endpoint: api.endpoint?.value.trim() || '',
                apiKey: api.apiKey?.value.trim() || '',
            });

            btn.disabled = false;

            if (res.ok) {
                fillModels(res.models, api.model?.value || '');
                if (api.model && !api.model.value) api.model.value = res.models[0];
                save();
                if (status) status.textContent = `✓ Подключено, моделей: ${res.models.length}`;
            } else if (status) {
                status.textContent = `✗ ${res.error}`;
            }
        });

        api.model?.addEventListener('change', () => {
            if (api.manual) api.manual.value = '';
            save();
        });
        api.manual?.addEventListener('input', save);
        api.endpoint?.addEventListener('change', save);
        api.apiKey?.addEventListener('change', save);
        api.temperature?.addEventListener('change', save);

        api.profile?.addEventListener('change', (e) => {
            activateProfile(e.target.value);
            fillFields();
            refresh();
        });

        container.querySelector('[data-act="profile-new"]')?.addEventListener('click', () => {
            const name = prompt('Название профиля:', `Профиль ${listProfiles().profiles.length + 1}`);
            if (name === null) return;
            addProfile(String(name || '').trim());
            fillProfiles();
            fillFields();
            refresh();
        });

        container.querySelector('[data-act="profile-del"]')?.addEventListener('click', () => {
            const { profiles, activeId } = listProfiles();
            if (profiles.length <= 1) return;
            if (!confirm('Удалить профиль подключения?')) return;
            removeProfile(activeId);
            fillProfiles();
            fillFields();
            refresh();
        });

        // Справочник внешности — работает независимо от аккаунта
        const bookHost = container.querySelector('#astral-app-charbook');
        if (bookHost) {
            bookHost.innerHTML = renderCharacterBookHTML();
            bindCharacterBook(bookHost);
        }

        if (!this.accountManager) return;
        container.querySelector('[data-action="save-profile"]')?.addEventListener('click', () => {
            const name = container.querySelector('#astral-account-name')?.value || '';
            const bio = container.querySelector('#astral-account-bio')?.value || '';

            this.accountManager.updateAccount({ name, bio });

            const btn = container.querySelector('[data-action="save-profile"]');
            const orig = btn.textContent;
            btn.textContent = '✓ Сохранено';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        });

        container.querySelector('[data-action="change-avatar"]')?.addEventListener('click', () => {
            // Hidden file input for local upload
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*';
            inp.onchange = async () => {
                const file = inp.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const url = e.target.result;
                    this.accountManager.updateAccount({ avatar: url });
                    const img = container.querySelector('.astral-avatar-preview');
                    if (img) img.src = url;
                };
                reader.readAsDataURL(file);
            };
            inp.click();
        });
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}