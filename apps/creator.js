/**
 * Creator Studio — paid content: profile, feed, analytics, fan messages.
 *
 * Post model:
 *   { id, caption, prompt, timestamp, imageUrl, imageW, imageH, likes, comments: [] }
 *
 * `caption` is plain text shown to the reader and never mixed into the image
 * prompt; `prompt` is what the generator sees. Cards adapt to the image's real
 * aspect ratio once it loads.
 */

import { ICONS } from './phone-core.js';

const TABS = [
    { id: 'profile', label: 'Профиль' },
    { id: 'feed', label: 'Лента' },
    { id: 'stats', label: 'Статы' },
    { id: 'fans', label: 'Фаны' },
];

const FAN_NAMES = [
    'shadow_kitten', 'velvet_noir', 'midnight_owl', 'lunarpixie', 'crash_and_burn',
    'sugarstatic', 'emptyrooms', 'ghost_of_you', 'poison_ivy', 'static_bloom',
    'neon_widow', 'dollparts', 'cinematic', 'wires_and_bones', 'soft_error',
];

const COMMENT_TEXTS = [
    'Это просто нереально 🖤',
    'Сохранил себе, буду смотреть ночью',
    'Как ты это делаешь?',
    'Хочу ещё',
    'Свет идеальный',
    'Взгляд убивает',
    'Лучший пост за неделю',
    'Не могу перестать листать',
    'Что за объектив?',
    'Атмосфера — 10/10',
    'Слишком красиво для этого мира',
    'Жду продолжения',
];

export class CreatorApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'creator';
        this.title = 'Creator Studio';
        this.icon = ICONS.creator;
        this._tab = 'profile';
        this._busy = new Set();
    }

    render(container, params = {}) {
        if (params.tab) this._tab = params.tab;

        const state = this.storage.getState();
        const creator = state.creator || {};

        container.innerHTML = '';
        container.appendChild(this._buildTabs());

        const body = document.createElement('div');
        body.className = 'astral-creator-body';

        if (this._tab === 'profile') this._renderProfile(body, creator);
        else if (this._tab === 'feed') this._renderFeed(body, creator);
        else if (this._tab === 'stats') this._renderStats(body, creator);
        else this._renderFans(body, creator);

        container.appendChild(body);
    }

    _buildTabs() {
        const bar = document.createElement('div');
        bar.className = 'astral-tabs';
        for (const tab of TABS) {
            const btn = document.createElement('button');
            btn.className = 'astral-tab' + (tab.id === this._tab ? ' astral-tab--on' : '');
            btn.textContent = tab.label;
            btn.addEventListener('click', () => {
                this._tab = tab.id;
                this.render(document.querySelector('.astral-phone-body'));
            });
            bar.appendChild(btn);
        }
        return bar;
    }

    /* ─────────────────────────── profile ─────────────────────────── */

    _renderProfile(body, creator) {
        const name = creator.displayName || this.context.name2 || 'Персонаж';
        const handle = creator.handle || this._slug(name);
        const avatar = creator.avatar || null;
        const posts = creator.posts || [];

        const avaHtml = avatar
            ? `<img src="${this._esc(avatar)}" class="astral-profile-ava astral-profile-ava--img" alt="avatar">`
            : `<div class="astral-profile-ava">${this._esc((name[0] || '?').toUpperCase())}</div>`;

        body.innerHTML = `
            <div class="astral-profile">
                <div class="astral-profile-ava-wrap">
                    ${avaHtml}
                    <button class="astral-ava-edit-btn" id="astral-ava-btn" title="Изменить аватар">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                    </button>
                </div>

                <div class="astral-profile-name-row">
                    <div class="astral-profile-name" id="astral-cname-view">${this._esc(name)}</div>
                    <button class="astral-inline-edit-btn" id="astral-edit-name-btn" title="Изменить">✎</button>
                </div>
                <div class="astral-profile-handle-row">
                    <div class="astral-profile-handle" id="astral-chandle-view">@${this._esc(handle)}</div>
                    <button class="astral-inline-edit-btn" id="astral-edit-handle-btn" title="Изменить">✎</button>
                </div>

                <div class="astral-stats-row">
                    <div class="astral-stat">
                        <div class="astral-stat-value">${this._n(creator.subscribers || 0)}</div>
                        <div class="astral-stat-label">Подписчики</div>
                    </div>
                    <div class="astral-stat">
                        <div class="astral-stat-value">${posts.length}</div>
                        <div class="astral-stat-label">Посты</div>
                    </div>
                    <div class="astral-stat">
                        <div class="astral-stat-value">$${this._n(creator.revenue || 0)}</div>
                        <div class="astral-stat-label">Доход</div>
                    </div>
                </div>

                <button class="astral-btn astral-btn-primary astral-btn-wide" id="astral-new-post">
                    Создать пост
                </button>
            </div>
        `;

        body.querySelector('#astral-new-post').addEventListener('click', () => this._openComposer());
        body.querySelector('#astral-ava-btn').addEventListener('click', () => this._openAvatarPicker());
        body.querySelector('#astral-edit-name-btn').addEventListener('click', () => this._openInlineEdit('name', name));
        body.querySelector('#astral-edit-handle-btn').addEventListener('click', () => this._openInlineEdit('handle', handle));
    }

    /* ─────────────────────────── avatar picker ─────────────────────────── */

    _openAvatarPicker() {
        const gallery = (this.storage.getState().gallery || []).filter(p => p.imageUrl);

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';

        const galleryItems = gallery.slice(0, 20).map((p, i) => `
            <button class="astral-ava-pick" data-gidx="${i}">
                <img src="${this._esc(p.imageUrl)}" alt="">
            </button>
        `).join('');

        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--ava-picker">
                <div class="astral-modal-title">Аватар</div>

                <div class="astral-ava-picker-section">
                    <div class="astral-ava-picker-label">Загрузить с устройства</div>
                    <label class="astral-upload-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                        </svg>
                        Выбрать файл
                        <input type="file" id="astral-ava-file" accept="image/*" style="display:none">
                    </label>
                </div>

                ${gallery.length > 0 ? `
                <div class="astral-ava-picker-section">
                    <div class="astral-ava-picker-label">Из галереи телефона</div>
                    <div class="astral-ava-grid">${galleryItems}</div>
                </div>` : ''}

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-ava-cancel">Отмена</button>
                </div>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);
        const close = () => overlay.remove();

        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#astral-ava-cancel').addEventListener('click', close);

        // File upload
        overlay.querySelector('#astral-ava-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const dataUrl = await this._fileToDataUrl(file);
            close();
            this._saveCreatorAvatar(dataUrl);
        });

        // From gallery
        overlay.querySelectorAll('[data-gidx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.gidx);
                const url = gallery[idx]?.imageUrl;
                if (url) { close(); this._saveCreatorAvatar(url); }
            });
        });
    }

    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _saveCreatorAvatar(url) {
        const state = this.storage.getState();
        if (!state.creator) state.creator = {};
        state.creator.avatar = url;
        this.storage.save();
        this.render(document.querySelector('.astral-phone-body'));
    }

    /* ─────────────────────────── inline edit (name / handle) ─────────────────────────── */

    _openInlineEdit(field, current) {
        const labels = { name: 'Имя', handle: 'Ник (без @)' };

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <div class="astral-modal-title">${labels[field]}</div>
                <input class="astral-textarea astral-inline-input" id="astral-inline-val"
                    value="${this._esc(current)}" placeholder="${labels[field]}">
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-inline-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-inline-save">Сохранить</button>
                </div>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);
        const close = () => overlay.remove();
        const inp = overlay.querySelector('#astral-inline-val');
        inp.focus();
        inp.select();

        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#astral-inline-cancel').addEventListener('click', close);
        overlay.querySelector('#astral-inline-save').addEventListener('click', () => {
            let val = inp.value.trim();
            if (!val) return;
            if (field === 'handle') val = val.replace(/^@/, '').replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase();
            close();
            this._saveCreatorField(field, val);
        });

        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') overlay.querySelector('#astral-inline-save').click();
            if (e.key === 'Escape') close();
        });
    }

    _saveCreatorField(field, value) {
        const state = this.storage.getState();
        if (!state.creator) state.creator = {};
        if (field === 'name') state.creator.displayName = value;
        if (field === 'handle') state.creator.handle = value;
        this.storage.save();
        this.render(document.querySelector('.astral-phone-body'));
    }

    /* ─────────────────────────── feed ─────────────────────────── */

    _renderFeed(body, creator) {
        const posts = creator.posts || [];

        if (posts.length === 0) {
            body.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.creator}</div>
                    <div>Постов пока нет</div>
                    <div style="margin-top:10px;opacity:.7">Создай первый — и начнёшь зарабатывать</div>
                </div>`;
            return;
        }

        const feed = document.createElement('div');
        feed.className = 'astral-card-feed';

        posts.forEach((post, idx) => {
            feed.appendChild(this._buildCard(post, idx));
        });

        body.appendChild(feed);
    }

    _buildCard(post, idx) {
        const card = document.createElement('div');
        card.className = 'astral-card astral-card--creator';
        const busy = this._busy.has(idx);
        const comments = Array.isArray(post.comments) ? post.comments : [];

        const media = post.imageUrl
            ? `<img class="astral-card-media" src="${this._esc(post.imageUrl)}" alt="" loading="lazy">`
            : `<div class="astral-card-media astral-card-media--empty">
                    <div class="astral-card-empty-inner">
                        <div class="astral-card-empty-icon">${ICONS.creator}</div>
                        <button class="astral-btn" data-gen="${idx}" ${busy ? 'disabled' : ''}>
                            ${busy ? 'Генерация…' : 'Создать фото'}
                        </button>
                    </div>
               </div>`;

        card.innerHTML = `
            ${media}
            <div class="astral-card-body">
                <div class="astral-card-title">${this._esc(post.caption || '')}</div>
                <div class="astral-card-meta">
                    <span>❤ ${this._n(post.likes || 0)}</span>
                    <button class="astral-card-meta-btn" data-comments="${idx}">
                        💬 ${this._n(comments.length)}
                    </button>
                    <span class="astral-card-meta-time">${this._ago(post.timestamp)}</span>
                    <button class="astral-card-menu" data-menu="${idx}" title="Действия">⋯</button>
                </div>
            </div>
        `;

        // Adaptive media: fit the real aspect ratio once the image is decoded.
        const img = card.querySelector('.astral-card-media');
        if (img && post.imageUrl) {
            const apply = (w, h) => {
                if (!w || !h) return;
                img.style.aspectRatio = `${w} / ${h}`;
                img.classList.remove('astral-card-media--portrait', 'astral-card-media--landscape', 'astral-card-media--square');
                const ratio = w / h;
                const kind = ratio > 1.15 ? 'landscape' : (ratio < 0.87 ? 'portrait' : 'square');
                img.classList.add(`astral-card-media--${kind}`);
                card.dataset.orientation = kind;
                this._rememberSize(idx, w, h);
            };

            if (post.imageW && post.imageH) {
                apply(post.imageW, post.imageH);
            } else if (img.complete && img.naturalWidth) {
                apply(img.naturalWidth, img.naturalHeight);
            } else {
                img.addEventListener('load', () => apply(img.naturalWidth, img.naturalHeight), { once: true });
            }
        }

        const genBtn = card.querySelector(`[data-gen="${idx}"]`);
        if (genBtn && !busy) {
            genBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this._generate(idx);
            });
        }

        card.querySelector(`[data-comments="${idx}"]`)?.addEventListener('click', () => this._openComments(idx));
        card.querySelector(`[data-menu="${idx}"]`)?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openPostMenu(idx);
        });

        return card;
    }

    /** Persist measured dimensions so the card doesn't reflow on every render. */
    _rememberSize(idx, w, h) {
        const state = this.storage.getState();
        const post = state.creator?.posts?.[idx];
        if (!post || (post.imageW === w && post.imageH === h)) return;
        post.imageW = w;
        post.imageH = h;
        this.storage.save();
    }

    /* ─────────────────────────── stats ─────────────────────────── */

    _renderStats(body, creator) {
        const posts = creator.posts || [];
        const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
        const avg = posts.length ? Math.round(likes / posts.length) : 0;
        const top = posts.length ? posts.reduce((a, b) => ((b.likes || 0) > (a.likes || 0) ? b : a)) : null;
        const comments = posts.reduce((s, p) => s + (Array.isArray(p.comments) ? p.comments.length : 0), 0);

        body.innerHTML = `
            <div class="astral-stat-cards">
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">Всего заработано</div>
                    <div class="astral-stat-card-value">$${this._n(creator.revenue || 0)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">Лайков на пост</div>
                    <div class="astral-stat-card-value">${this._n(avg)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">Всего лайков</div>
                    <div class="astral-stat-card-value">${this._n(likes)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">Комментариев</div>
                    <div class="astral-stat-card-value">${this._n(comments)}</div>
                </div>
                <div class="astral-stat-card astral-stat-card--wide">
                    <div class="astral-stat-card-label">Лучший пост</div>
                    <div class="astral-stat-card-value astral-stat-card-value--sm">
                        ${top ? this._esc((top.caption || '').slice(0, 48) || '—') : '—'}
                    </div>
                </div>
            </div>
        `;
    }

    /* ─────────────────────────── fans ─────────────────────────── */

    _renderFans(body, creator) {
        const fans = creator.fans || [];

        if (fans.length === 0) {
            body.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.creator}</div>
                    <div>Фанов пока нет</div>
                    <div style="margin-top:10px;opacity:.7">Донаты и подписки появятся здесь</div>
                </div>`;
            return;
        }

        const list = document.createElement('div');
        list.className = 'astral-fan-list';

        for (const fan of fans) {
            const row = document.createElement('div');
            row.className = 'astral-fan-row';
            row.innerHTML = `
                <div class="astral-msg-avatar">${this._esc((fan.name || '?')[0].toUpperCase())}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name">${this._esc(fan.name || 'Аноним')}</div>
                    <div class="astral-msg-preview">${this._esc(fan.note || (fan.amount ? `$${fan.amount}` : 'подписался'))}</div>
                </div>
                <div class="astral-msg-time">${this._ago(fan.timestamp)}</div>
            `;
            list.appendChild(row);
        }

        body.appendChild(list);
    }

    /* ─────────────────────────── composer ─────────────────────────── */

    /**
     * @param {number|null} editIndex  Index of the post being edited, or null to create.
     */
    _openComposer(editIndex = null) {
        const state = this.storage.getState();
        const post = editIndex === null ? null : state.creator?.posts?.[editIndex];
        if (editIndex !== null && !post) return;

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">${post ? 'Редактировать пост' : 'Новый пост'}</div>

                <label class="astral-field-label" for="astral-post-caption">Подпись</label>
                <textarea class="astral-textarea astral-textarea--short" id="astral-post-caption"
                    placeholder="Текст под постом — что угодно, это просто подпись.">${this._esc(post?.caption || '')}</textarea>

                <label class="astral-field-label" for="astral-post-text">Промпт для фото</label>
                <textarea class="astral-textarea" id="astral-post-text"
                    placeholder="Что на фото — поза, одежда, место, свет. На подпись не влияет.">${this._esc(post?.prompt || '')}</textarea>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-post-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-post-go">
                        ${post ? 'Сохранить' : 'Опубликовать'}
                    </button>
                </div>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#astral-post-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('#astral-post-go').addEventListener('click', async () => {
            const caption = overlay.querySelector('#astral-post-caption').value.trim();
            const prompt = overlay.querySelector('#astral-post-text').value.trim();
            if (!caption && !prompt) return;

            close();

            if (post) this._updatePost(editIndex, { caption, prompt });
            else await this._createPost(caption, prompt);
        });

        overlay.querySelector('#astral-post-caption').focus();
    }

    /* ─────────────────────────── create / update / delete ─────────────────────────── */

    async _createPost(caption, prompt) {
        const state = this.storage.getState();
        if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
        if (!Array.isArray(state.creator.posts)) state.creator.posts = [];

        state.creator.posts.unshift({
            id: this._uid(),
            caption,
            prompt,
            timestamp: Date.now(),
            imageUrl: null,
            imageW: 0,
            imageH: 0,
            likes: this._rand(5, 60),
            comments: this._seedComments(),
        });

        state.creator.revenue = (state.creator.revenue || 0) + this._rand(12, 70);
        this.storage.save();

        this._tab = 'feed';
        this.render(document.querySelector('.astral-phone-body'));

        if (prompt && this.imageGen.isAvailable()) await this._generate(0, true);

        this.render(document.querySelector('.astral-phone-body'));
    }

    _updatePost(index, patch) {
        const state = this.storage.getState();
        const post = state.creator?.posts?.[index];
        if (!post) return;

        Object.assign(post, patch);
        this.storage.save();

        this.render(document.querySelector('.astral-phone-body'));
        this._toast('Пост обновлён', 'success');
    }

    _deletePost(index) {
        const state = this.storage.getState();
        if (!Array.isArray(state.creator?.posts) || !state.creator.posts[index]) return;

        state.creator.posts.splice(index, 1);
        this.storage.save();

        this.render(document.querySelector('.astral-phone-body'));
        this._toast('Пост удалён', 'success');
    }

    /** Small action sheet for a post: edit, delete. */
    _openPostMenu(index) {
        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <button class="astral-sheet-btn" data-act="edit">Редактировать</button>
                <button class="astral-sheet-btn astral-sheet-btn--danger" data-act="delete">Удалить</button>
                <button class="astral-sheet-btn astral-sheet-btn--cancel" data-act="cancel">Отмена</button>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-act="edit"]').addEventListener('click', () => {
            close();
            this._openComposer(index);
        });
        overlay.querySelector('[data-act="delete"]').addEventListener('click', () => {
            close();
            this._confirmDelete(index);
        });
    }

    _confirmDelete(index) {
        const state = this.storage.getState();
        const post = state.creator?.posts?.[index];
        const preview = (post?.caption || '').slice(0, 60) || 'без подписи';

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <div class="astral-confirm-text">Удалить пост «${this._esc(preview)}»? Это необратимо.</div>
                <button class="astral-sheet-btn astral-sheet-btn--danger" data-act="yes">Удалить</button>
                <button class="astral-sheet-btn astral-sheet-btn--cancel" data-act="no">Отмена</button>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('[data-act="no"]').addEventListener('click', close);
        overlay.querySelector('[data-act="yes"]').addEventListener('click', () => {
            close();
            this._deletePost(index);
        });
    }

    /* ─────────────────────────── comments ─────────────────────────── */

    _openComments(index) {
        const state = this.storage.getState();
        const post = state.creator?.posts?.[index];
        if (!post) return;

        const comments = Array.isArray(post.comments) ? post.comments : [];

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--comments">
                <div class="astral-modal-title">Комментарии (${comments.length})</div>
                <div class="astral-comment-list" id="astral-comment-list"></div>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-comments-close">Закрыть</button>
                </div>
            </div>
        `;

        document.querySelector('.astral-phone').appendChild(overlay);

        const list = overlay.querySelector('#astral-comment-list');
        if (comments.length === 0) {
            list.innerHTML = `<div class="astral-comment-empty">Комментариев пока нет</div>`;
        } else {
            for (const c of comments) {
                const row = document.createElement('div');
                row.className = 'astral-comment';
                row.innerHTML = `
                    <div class="astral-comment-ava">${this._esc((c.author || '?')[0].toUpperCase())}</div>
                    <div class="astral-comment-main">
                        <div class="astral-comment-head">
                            <span class="astral-comment-author">${this._esc(c.author || 'Аноним')}</span>
                            <span class="astral-comment-time">${this._ago(c.timestamp)}</span>
                        </div>
                        <div class="astral-comment-text">${this._esc(c.text || '')}</div>
                    </div>
                `;
                list.appendChild(row);
            }
        }

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('#astral-comments-close').addEventListener('click', close);
    }

    /** Fan comments seeded onto a fresh post. */
    _seedComments() {
        const count = this._rand(1, 4);
        const used = new Set();
        const out = [];

        for (let i = 0; i < count; i++) {
            let author = this._pick(FAN_NAMES);
            let guard = 0;
            while (used.has(author) && guard++ < 12) author = this._pick(FAN_NAMES);
            used.add(author);

            out.push({
                id: this._uid(),
                author,
                text: this._pick(COMMENT_TEXTS),
                timestamp: Date.now() - this._rand(1, 90) * 60000,
            });
        }

        return out.sort((a, b) => b.timestamp - a.timestamp);
    }

    /* ─────────────────────────── generation ─────────────────────────── */

    async _generate(index, silent = false) {
        if (!this.imageGen.isAvailable()) {
            this._toast('Haruspics не установлен', 'error');
            return;
        }
        if (this._busy.has(index)) return;

        this._busy.add(index);
        this._toast('Генерирую фото…', 'info');

        try {
            const state = this.storage.getState();
            const post = state.creator?.posts?.[index];
            if (!post) return;

            // Only the prompt reaches the generator — the caption stays plain text.
            const scene = String(post.prompt || '').trim();
            const prompt = [this.context.name2 || 'Персонаж', scene].filter(Boolean).join(' — ');

            const url = await this.imageGen.generate(prompt, {
                character: this.context.name2,
                type: 'creator_post',
                nsfw: true,
            });

            post.imageUrl = url;
            post.imageW = 0;
            post.imageH = 0;
            this.storage.save();
            this._toast('Готово', 'success');
        } catch (err) {
            console.error('[Creator] generation failed:', err);
            this._toast(`Не получилось: ${err.message}`, 'error');
        } finally {
            this._busy.delete(index);
            if (!silent) this.render(document.querySelector('.astral-phone-body'));
        }
    }

    /* ─────────────────────────── events ─────────────────────────── */

    async handleEvent(eventData) {
        const state = this.storage.getState();
        if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
        if (!Array.isArray(state.creator.posts)) state.creator.posts = [];

        const meta = eventData.metadata || {};

        if (eventData.type === 'content_posted') {
            state.creator.posts.unshift({
                id: this._uid(),
                caption: eventData.description || '',
                prompt: meta.prompt || '',
                timestamp: Date.now(),
                imageUrl: null,
                imageW: 0,
                imageH: 0,
                likes: this._rand(5, 60),
                comments: this._seedComments(),
            });
        } else if (eventData.type === 'comment_received') {
            const post = state.creator.posts[Number(meta.post) || 0];
            if (post) {
                if (!Array.isArray(post.comments)) post.comments = [];
                post.comments.unshift({
                    id: this._uid(),
                    author: meta.fan || this._pick(FAN_NAMES),
                    text: eventData.description || this._pick(COMMENT_TEXTS),
                    timestamp: Date.now(),
                });
            }
        } else if (eventData.type === 'donation_received') {
            const amount = Number(meta.amount) || 25;
            state.creator.revenue = (state.creator.revenue || 0) + amount;
            state.creator.fans.unshift({
                name: meta.fan || 'Аноним',
                amount,
                note: `$${amount}`,
                timestamp: Date.now(),
            });
            state.creator.fans = state.creator.fans.slice(0, 40);
        } else if (eventData.type === 'subscriber_joined') {
            const count = Number(meta.count) || 1;
            state.creator.subscribers = (state.creator.subscribers || 0) + count;
            state.creator.fans.unshift({
                name: meta.fan || 'Новый подписчик',
                note: 'подписался',
                timestamp: Date.now(),
            });
            state.creator.fans = state.creator.fans.slice(0, 40);
        }

        this.storage.save();
        return { success: true, message: 'Событие Creator Studio обработано' };
    }

    /* ─────────────────────────── utils ─────────────────────────── */

    _pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    _uid() {
        return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    }

    _rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    _n(num) {
        if (!num) return '0';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return String(num);
    }

    _ago(ts) {
        const diff = Date.now() - ts;
        if (diff < 36e5) return `${Math.floor(diff / 6e4)} мин`;
        if (diff < 864e5) return `${Math.floor(diff / 36e5)} ч`;
        return `${Math.floor(diff / 864e5)} дн`;
    }

    _slug(name) {
        const slug = String(name).toLowerCase().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
        return slug || 'creator';
    }

    _toast(text, kind = 'info') {
        if (window.toastr) (toastr[kind] || toastr.info)(text);
        else console.log(`[Creator] ${text}`);
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}