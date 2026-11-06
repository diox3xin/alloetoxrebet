/**
 * Settings — управление аккаунтом пользователя.
 * Contract: constructor sets this.title / this.icon, render(container) writes into container.
 */

import { renderCharacterBookHTML, bindCharacterBook } from './character-book.js';

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