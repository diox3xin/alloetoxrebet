/**
 * Creator Studio — paid content: profile, feed, analytics, fan messages.
 * Images for posts are generated through the Haruspics bridge.
 */

import { ICONS } from './phone-core.js';

const TABS = [
    { id: 'profile', label: 'Профиль' },
    { id: 'feed', label: 'Лента' },
    { id: 'stats', label: 'Статы' },
    { id: 'fans', label: 'Фаны' },
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
        const name = this.context.name2 || 'Персонаж';
        const posts = creator.posts || [];

        body.innerHTML = `
            <div class="astral-profile">
                <div class="astral-profile-ava">${this._esc((name[0] || '?').toUpperCase())}</div>
                <div class="astral-profile-name">${this._esc(name)}</div>
                <div class="astral-profile-handle">@${this._slug(name)}</div>

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
            const card = document.createElement('div');
            card.className = 'astral-card';
            const busy = this._busy.has(idx);

            const media = post.imageUrl
                ? `<img class="astral-card-media" src="${post.imageUrl}" alt="" loading="lazy">`
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
                    <div class="astral-card-title">${this._esc(post.caption || post.description)}</div>
                    <div class="astral-card-meta">
                        <span>❤ ${this._n(post.likes || 0)}</span>
                        <span>💬 ${this._n(post.comments || 0)}</span>
                        <span>${this._ago(post.timestamp)}</span>
                    </div>
                </div>
            `;

            const btn = card.querySelector(`[data-gen="${idx}"]`);
            if (btn && !busy) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this._generate(idx);
                });
            }

            feed.appendChild(card);
        });

        body.appendChild(feed);
    }

    /* ─────────────────────────── stats ─────────────────────────── */

    _renderStats(body, creator) {
        const posts = creator.posts || [];
        const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
        const avg = posts.length ? Math.round(likes / posts.length) : 0;
        const top = posts.length ? posts.reduce((a, b) => ((b.likes || 0) > (a.likes || 0) ? b : a)) : null;

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
                    <div class="astral-stat-card-label">Лучший пост</div>
                    <div class="astral-stat-card-value astral-stat-card-value--sm">
                        ${top ? this._esc((top.caption || top.description || '').slice(0, 40)) : '—'}
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

    _openComposer() {
        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">Новый пост</div>
                <textarea class="astral-textarea" id="astral-post-text"
                    placeholder="Опиши, что на фото — поза, одежда, место, свет. Чем конкретнее, тем лучше выйдет картинка."></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-post-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-post-go">Опубликовать</button>
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
            const text = overlay.querySelector('#astral-post-text').value.trim();
            if (!text) return;
            close();
            await this._createPost(text);
        });

        overlay.querySelector('#astral-post-text').focus();
    }

    async _createPost(caption) {
        const state = this.storage.getState();
        if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };

        state.creator.posts.unshift({
            caption,
            description: caption,
            timestamp: Date.now(),
            imageUrl: null,
            likes: this._rand(5, 60),
            comments: this._rand(0, 14),
        });

        state.creator.revenue = (state.creator.revenue || 0) + this._rand(12, 70);
        this.storage.save();

        this._tab = 'feed';
        this.render(document.querySelector('.astral-phone-body'));

        if (this.imageGen.isAvailable()) await this._generate(0, true);

        this.render(document.querySelector('.astral-phone-body'));
    }

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

            const prompt = [this.context.name2 || 'Персонаж', post.description].filter(Boolean).join(' — ');
            const url = await this.imageGen.generate(prompt, {
                character: this.context.name2,
                type: 'creator_post',
                nsfw: true,
            });

            state.creator.posts[index].imageUrl = url;
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

        const meta = eventData.metadata || {};

        if (eventData.type === 'content_posted') {
            state.creator.posts.unshift({
                caption: eventData.description,
                description: eventData.description,
                timestamp: Date.now(),
                imageUrl: null,
                likes: this._rand(5, 60),
                comments: this._rand(0, 14),
            });
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