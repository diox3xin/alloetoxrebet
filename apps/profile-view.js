/**
 * profile-view.js — универсальные страницы профилей.
 *
 * openUserProfile(storage, context)   — профиль юзера (аватар, bio, посты, счётчики)
 * openNPCProfile(author, storage, context, coreRef) — профиль НПС (посты + переписка)
 *
 * Вызываются из Social, Messages, и любого другого места через глобальный хук.
 */

import { success } from './notifications.js';

/* ───────────────────────── helpers ───────────────────────── */

function esc(str) {
    return String(str ?? '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
}

function ago(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'сейчас';
    if (m < 60) return `${m}м`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}ч`;
    return `${Math.floor(h / 24)}д`;
}

function phone() {
    return document.querySelector('.astral-phone');
}

/* ───────────────────────── профиль юзера ───────────────────────── */

export function openUserProfile(storage, context) {
    const ph = phone();
    if (!ph) return;

    const state = storage.getState();
    const saved = state.socialProfile || {};
    const account = state.account || {};

    const name = String(saved.displayName || account.name || context?.name1 || 'Ты').trim();
    const handle = String(saved.handle || '').trim() || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const bio = String(saved.bio || account.bio || '').trim();
    const avatar = account.avatar || null;

    // Живые счётчики из реального состояния
    const myPosts = (state.social || []).filter(p => p.author === name || p.mine);
    const followers = (state.socialFollowers || []).length;
    const following = (state.socialFollowing || []).length;
    const totalReacts = myPosts.reduce((sum, p) => {
        return sum + Object.entries(p.reactions || {})
            .filter(([k]) => k !== 'me')
            .reduce((s, [, arr]) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    }, 0);

    // Аватар
    const avatarHtml = avatar
        ? `<img src="${esc(avatar)}" class="astral-up-avatar astral-up-avatar--img" alt="" />`
        : `<div class="astral-up-avatar">${esc((name[0] || '?').toUpperCase())}</div>`;

    // Галерея последних постов
    const postsGrid = myPosts.length
        ? `<div class="astral-up-posts-grid">
            ${myPosts.slice(0, 9).map(p => `
                <div class="astral-up-post-thumb ${p.imageUrl ? 'astral-up-post-thumb--img' : ''}">
                    ${p.imageUrl
                        ? `<img src="${esc(p.imageUrl)}" alt="" />`
                        : `<div class="astral-up-post-text-thumb">${esc((p.text || '').slice(0, 60))}</div>`
                    }
                </div>
            `).join('')}
           </div>`
        : `<div class="astral-nc-empty" style="padding:20px 0">Нет публикаций</div>`;

    const overlay = document.createElement('div');
    overlay.className = 'astral-modal';
    overlay.innerHTML = `
        <div class="astral-modal-card astral-modal-card--profile astral-up">
            <button class="astral-modal-close" id="astral-up-close">✕</button>

            <div class="astral-up-hero">
                <div class="astral-up-avatar-wrap">
                    ${avatarHtml}
                    <button class="astral-up-avatar-edit" id="astral-up-avatar-btn" title="Сменить аватар">✎</button>
                </div>
                <div class="astral-up-info">
                    <div class="astral-up-name" id="astral-up-name-view">${esc(name)}</div>
                    <div class="astral-up-handle">@${esc(handle)}</div>
                    ${bio ? `<div class="astral-up-bio">${esc(bio)}</div>` : ''}
                    <button class="astral-up-edit-btn" id="astral-up-edit-btn">Редактировать</button>
                </div>
            </div>

            <div class="astral-up-stats">
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${myPosts.length}</span>
                    <span class="astral-up-stat-label">постов</span>
                </div>
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${followers}</span>
                    <span class="astral-up-stat-label">подписчиков</span>
                </div>
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${following}</span>
                    <span class="astral-up-stat-label">подписок</span>
                </div>
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${totalReacts}</span>
                    <span class="astral-up-stat-label">реакций</span>
                </div>
            </div>

            <div class="astral-up-posts-section">
                <div class="astral-up-section-title">Публикации</div>
                ${postsGrid}
            </div>
        </div>
    `;

    ph.appendChild(overlay);
    const close = () => overlay.remove();

    overlay.querySelector('#astral-up-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Редактирование профиля
    overlay.querySelector('#astral-up-edit-btn').addEventListener('click', () => {
        close();
        _openUserProfileEditor(storage, context);
    });

    // Смена аватара из галереи
    overlay.querySelector('#astral-up-avatar-btn').addEventListener('click', () => {
        _openAvatarPickerForUser(storage, context, overlay, close);
    });
}

function _openUserProfileEditor(storage, context) {
    const ph = phone();
    if (!ph) return;

    const state = storage.getState();
    const saved = state.socialProfile || {};
    const account = state.account || {};

    const name = String(saved.displayName || account.name || context?.name1 || 'Ты').trim();
    const handle = String(saved.handle || '').trim();
    const bio = String(saved.bio || account.bio || '').trim();

    const overlay = document.createElement('div');
    overlay.className = 'astral-modal';
    overlay.innerHTML = `
        <div class="astral-modal-card astral-modal-card--sheet">
            <div class="astral-modal-title">Редактировать профиль</div>

            <label class="astral-field-label">Отображаемое имя</label>
            <input class="astral-text-input" id="astral-upe-name" type="text"
                   value="${esc(name)}" placeholder="Имя" />

            <label class="astral-field-label">Ник</label>
            <div class="astral-handle-input-row">
                <span class="astral-handle-at">@</span>
                <input class="astral-text-input" id="astral-upe-handle" type="text"
                       value="${esc(handle)}" placeholder="${esc(name.toLowerCase().replace(/\s+/g, '_'))}" />
            </div>

            <label class="astral-field-label">О себе</label>
            <textarea class="astral-text-input astral-text-input--area" id="astral-upe-bio"
                      rows="3" placeholder="Пара слов о себе">${esc(bio)}</textarea>

            <div class="astral-modal-actions">
                <button class="astral-btn" id="astral-upe-cancel">Отмена</button>
                <button class="astral-btn astral-btn-primary" id="astral-upe-save">Сохранить</button>
            </div>
        </div>
    `;

    ph.appendChild(overlay);
    const close = () => { overlay.remove(); openUserProfile(storage, context); };

    overlay.querySelector('#astral-upe-cancel').addEventListener('click', () => { overlay.remove(); openUserProfile(storage, context); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#astral-upe-save').addEventListener('click', () => {
        const newName = overlay.querySelector('#astral-upe-name').value.trim();
        const rawHandle = overlay.querySelector('#astral-upe-handle').value.trim();
        const newBio = overlay.querySelector('#astral-upe-bio').value.trim();

        if (!newName) return;

        const newHandle = rawHandle
            .replace(/^@/, '')
            .replace(/\s+/g, '_')
            .replace(/[^\p{L}\p{N}_]/gu, '')
            .toLowerCase() || newName.toLowerCase().replace(/\s+/g, '_');

        const s = storage.getState();
        s.socialProfile = { displayName: newName, handle: newHandle, bio: newBio };
        if (s.account) {
            s.account.name = newName;
            s.account.bio = newBio;
        }
        storage.save();
        try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }
        success('Профиль сохранён');
        overlay.remove();
        openUserProfile(storage, context);
    });

    overlay.querySelector('#astral-upe-name').focus();
}

function _openAvatarPickerForUser(storage, context, profileOverlay, closeProfile) {
    const ph = phone();
    if (!ph) return;

    const state = storage.getState();
    const gallery = (state.gallery || []).filter(p => p.imageUrl);

    const overlay = document.createElement('div');
    overlay.className = 'astral-modal';
    overlay.innerHTML = `
        <div class="astral-modal-card">
            <div class="astral-modal-title">Аватар</div>

            <label class="astral-field-label">Загрузить с устройства</label>
            <label class="astral-upload-btn" style="display:block;margin-bottom:12px">
                <input type="file" accept="image/*" id="astral-ava-file" style="display:none" />
                <span>Выбрать файл</span>
            </label>

            ${gallery.length ? `
                <label class="astral-field-label">Из галереи</label>
                <div class="astral-composer-gallery-row">
                    ${gallery.slice(0, 12).map((p, i) => `
                        <button class="astral-composer-thumb" data-idx="${i}">
                            <img src="${esc(p.imageUrl)}" alt="" />
                        </button>
                    `).join('')}
                </div>` : ''}

            <div class="astral-modal-actions">
                <button class="astral-btn" id="astral-ava-cancel">Отмена</button>
            </div>
        </div>
    `;

    ph.appendChild(overlay);
    const close = () => { overlay.remove(); closeProfile(); openUserProfile(storage, context); };

    overlay.querySelector('#astral-ava-cancel').addEventListener('click', () => {
        overlay.remove();
        openUserProfile(storage, context);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#astral-ava-file').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const s = storage.getState();
            if (!s.account) s.account = {};
            s.account.avatar = ev.target.result;
            storage.save();
            close();
        };
        reader.readAsDataURL(file);
    });

    overlay.querySelectorAll('.astral-composer-thumb').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            const url = gallery[idx]?.imageUrl;
            if (!url) return;
            const s = storage.getState();
            if (!s.account) s.account = {};
            s.account.avatar = url;
            storage.save();
            close();
        });
    });
}

/* ───────────────────────── профиль НПС ───────────────────────── */

export function openNPCProfile(author, storage, context, coreRef) {
    const ph = phone();
    if (!ph) return;

    const state = storage.getState();

    // Посты из Social
    const posts = (state.social || []).filter(p => p.author === author);
    const totalReacts = posts.reduce((sum, p) => {
        return sum + Object.entries(p.reactions || {})
            .filter(([k]) => k !== 'me')
            .reduce((s, [, arr]) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    }, 0);

    // Переписка из Messages
    const thread = (state.messages || []).filter(m => m.character === author);
    const role = thread.find(m => m.role)?.role || '';

    // Подписки
    const isFollowing = (state.socialFollowing || []).includes(author);
    const isFollower = (state.socialFollowers || []).includes(author);

    const handle = posts[0]?.handle || author.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const avatarLetter = (author[0] || '?').toUpperCase();

    const overlay = document.createElement('div');
    overlay.className = 'astral-modal';
    overlay.innerHTML = `
        <div class="astral-modal-card astral-modal-card--profile astral-npc-full">
            <button class="astral-modal-close" id="astral-npc-full-close">✕</button>

            <div class="astral-up-hero">
                <div class="astral-npc-avatar astral-npc-avatar--lg">${esc(avatarLetter)}</div>
                <div class="astral-up-info">
                    <div class="astral-up-name">${esc(author)}</div>
                    <div class="astral-up-handle">@${esc(handle)}</div>
                    ${role ? `<div class="astral-up-bio astral-up-bio--role">${esc(role)}</div>` : ''}
                    ${isFollower ? `<div class="astral-npc-follows-you">Подписан на тебя</div>` : ''}
                    <button class="astral-btn ${isFollowing ? '' : 'astral-btn-primary'} astral-npc-follow-btn" id="astral-npc-full-follow">
                        ${isFollowing ? 'Отписаться' : 'Подписаться'}
                    </button>
                </div>
            </div>

            <div class="astral-up-stats">
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${posts.length}</span>
                    <span class="astral-up-stat-label">постов</span>
                </div>
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${totalReacts}</span>
                    <span class="astral-up-stat-label">реакций</span>
                </div>
                <div class="astral-up-stat">
                    <span class="astral-up-stat-val">${thread.length}</span>
                    <span class="astral-up-stat-label">сообщений</span>
                </div>
            </div>

            <div class="astral-npc-tabs">
                <button class="astral-npc-tab active" data-tab="posts">Посты</button>
                <button class="astral-npc-tab" data-tab="messages">Переписка</button>
            </div>

            <div class="astral-npc-tab-body" id="astral-npc-tab-body"></div>
        </div>
    `;

    ph.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#astral-npc-full-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Подписка / отписка
    overlay.querySelector('#astral-npc-full-follow').addEventListener('click', (e) => {
        const s = storage.getState();
        if (!Array.isArray(s.socialFollowing)) s.socialFollowing = [];
        const idx = s.socialFollowing.indexOf(author);
        if (idx >= 0) s.socialFollowing.splice(idx, 1);
        else s.socialFollowing.push(author);
        storage.save();

        const btn = e.currentTarget;
        const nowFollowing = s.socialFollowing.includes(author);
        btn.textContent = nowFollowing ? 'Отписаться' : 'Подписаться';
        btn.classList.toggle('astral-btn-primary', !nowFollowing);
    });

    // Вкладки
    const tabBody = overlay.querySelector('#astral-npc-tab-body');
    const renderTab = (tab) => {
        overlay.querySelectorAll('.astral-npc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        if (tab === 'posts') {
            if (!posts.length) {
                tabBody.innerHTML = `<div class="astral-nc-empty" style="padding:20px">Нет постов</div>`;
                return;
            }
            tabBody.innerHTML = '';
            for (const p of posts) {
                const item = document.createElement('div');
                item.className = 'astral-npc-post';
                item.innerHTML = `
                    <div class="astral-npc-post-text">${esc(p.text || '')}</div>
                    <div class="astral-npc-post-meta">
                        ${totalReacts ? `❤ ${Object.entries(p.reactions || {}).filter(([k]) => k !== 'me').reduce((s, [, a]) => s + (Array.isArray(a) ? a.length : 0), 0)}` : ''}
                        ${p.replies?.length ? `💬 ${p.replies.length}` : ''}
                        <span class="astral-npc-post-time">${ago(p.timestamp)}</span>
                    </div>
                `;
                tabBody.appendChild(item);
            }
        } else {
            if (!thread.length) {
                tabBody.innerHTML = `<div class="astral-nc-empty" style="padding:20px">Нет переписки</div>`;
                return;
            }
            tabBody.innerHTML = '';
            for (const m of thread.slice(-20)) {
                const isOut = m.from === 'me' || m.fromUser;
                const item = document.createElement('div');
                item.className = `astral-npc-msg ${isOut ? 'astral-npc-msg--out' : 'astral-npc-msg--in'}`;
                item.innerHTML = `
                    <div class="astral-npc-msg-text">${esc(m.text || '')}</div>
                    <div class="astral-npc-msg-time">${ago(m.timestamp)}</div>
                `;
                tabBody.appendChild(item);
            }

            // Кнопка «Написать»
            if (coreRef) {
                const writeBtn = document.createElement('button');
                writeBtn.className = 'astral-btn astral-btn-primary astral-npc-write-btn';
                writeBtn.textContent = 'Написать';
                writeBtn.addEventListener('click', () => {
                    close();
                    coreRef.openApp('messages', { character: author });
                });
                tabBody.appendChild(writeBtn);
            }
        }
    };

    renderTab('posts');
    overlay.querySelectorAll('.astral-npc-tab').forEach(t => {
        t.addEventListener('click', () => renderTab(t.dataset.tab));
    });
}
