/**
 * Social — публичная лента в духе Twitter.
 *
 * Отличается от Creator Studio: там аккаунт персонажа как автора контента
 * (подписчики, доход), здесь — общая публичная лента, где пишут разные
 * персонажи, ставят лайки, отвечают и репостят.
 *
 * Записи приходят из RP (phone_event: social_post) и создаются пользователем.
 * Ветка комментариев живёт внутри поста, реакции — лайк/репост.
 */

import { ICONS } from './phone-core.js';
import { generateSocialPost, showTyping, collectCast } from './character-gen.js';

export class SocialApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'social';
        this.title = 'Social';
        this.icon = ICONS.social;
        this._replyTo = null;
        this._filter = 'all';   // all | following
    }

    render(container) {
        const state = this.storage.getState();
        const posts = this._sortedPosts(state);

        container.innerHTML = '';
        container.appendChild(this._buildTopBar(container));

        if (posts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'astral-empty-state';
            empty.innerHTML = `
                <div class="astral-empty-state-icon">${ICONS.social}</div>
                <div>Лента пуста</div>
                <div class="astral-empty-hint">Персонажи начнут писать, когда в сцене что-то произойдёт</div>`;
            container.appendChild(empty);
        } else {
            const feed = document.createElement('div');
            feed.className = 'astral-social-feed';
            for (const post of posts) feed.appendChild(this._buildPost(post, state, container));
            container.appendChild(feed);
        }

        container.appendChild(this._buildComposerBar(container));
    }

    _sortedPosts(state) {
        const posts = Array.isArray(state.social) ? [...state.social] : [];
        if (this._filter === 'following') {
            const following = new Set(state.socialFollowing || []);
            return posts
                .filter(p => following.has(p.author))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
        return posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    _buildTopBar(container) {
        const bar = document.createElement('div');
        bar.className = 'astral-social-top';

        const all = document.createElement('button');
        all.className = `astral-social-tab ${this._filter === 'all' ? 'active' : ''}`;
        all.textContent = 'Все';
        all.addEventListener('click', () => { this._filter = 'all'; this.render(container); });

        const following = document.createElement('button');
        following.className = `astral-social-tab ${this._filter === 'following' ? 'active' : ''}`;
        following.textContent = 'Подписки';
        following.addEventListener('click', () => { this._filter = 'following'; this.render(container); });

        const profile = document.createElement('button');
        profile.className = 'astral-social-tab astral-social-tab--icon';
        profile.title = 'Профиль';
        profile.textContent = '◍';
        profile.addEventListener('click', () => this._openProfile(container));

        bar.appendChild(all);
        bar.appendChild(following);
        bar.appendChild(profile);
        return bar;
    }

    /* ─────────────────────────── профиль персоны ─────────────────────────── */

    _profile() {
        const state = this.storage.getState();
        const saved = state.socialProfile || {};
        return {
            displayName: String(saved.displayName || this._userName()).trim(),
            handle: String(saved.handle || this._handle(this._userName())).trim(),
            bio: String(saved.bio || '').trim(),
        };
    }

    _openProfile(container) {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const p = this._profile();

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">Профиль</div>

                <label class="astral-field-label">Отображаемое имя</label>
                <input type="text" class="astral-input" id="astral-profile-name"
                       value="${this._esc(p.displayName)}" placeholder="Как тебя видят">

                <label class="astral-field-label">Ник</label>
                <input type="text" class="astral-input" id="astral-profile-handle"
                       value="${this._esc(p.handle)}" placeholder="username">

                <label class="astral-field-label">О себе</label>
                <textarea class="astral-textarea" id="astral-profile-bio" rows="3"
                          placeholder="Пара слов о себе">${this._esc(p.bio)}</textarea>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-profile-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-profile-save">Сохранить</button>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        overlay.querySelector('#astral-profile-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#astral-profile-save').addEventListener('click', () => {
            const displayName = overlay.querySelector('#astral-profile-name').value.trim();
            const handle = overlay.querySelector('#astral-profile-handle').value.trim().replace(/^@/, '');
            const bio = overlay.querySelector('#astral-profile-bio').value.trim();

            const state = this.storage.getState();
            state.socialProfile = {
                displayName: displayName || this._userName(),
                handle: handle || this._handle(displayName || this._userName()),
                bio,
            };
            this.storage.save();
            close();
            this._toast('Профиль сохранён');
            this.render(container);
        });

        overlay.querySelector('#astral-profile-name').focus();
    }

    /* ─────────────────────────── пост ─────────────────────────── */

    _buildPost(post, state, container) {
        const card = document.createElement('div');
        card.className = 'astral-social-post';

        const liked = Array.isArray(post.likedBy) && post.likedBy.includes('me');
        const reposted = Array.isArray(post.repostedBy) && post.repostedBy.includes('me');
        const replies = Array.isArray(post.replies) ? post.replies : [];
        const avatarLetter = (post.author || '?')[0].toUpperCase();

        card.innerHTML = `
            <div class="astral-social-head">
                <div class="astral-social-avatar">${this._esc(avatarLetter)}</div>
                <div class="astral-social-who">
                    <span class="astral-social-name">${this._esc(post.author || 'Неизвестный')}</span>
                    ${post.handle ? `<span class="astral-social-handle">@${this._esc(post.handle)}</span>` : ''}
                    <span class="astral-social-dot">·</span>
                    <span class="astral-social-time">${this._ago(post.timestamp)}</span>
                </div>
            </div>

            <div class="astral-social-body">${this._esc(post.text || '').replace(/\n/g, '<br>')}</div>

            ${post.imageUrl ? `<div class="astral-social-media"><img src="${post.imageUrl}" alt="" loading="lazy"></div>` : ''}

            <div class="astral-social-actions">
                <button class="astral-social-act ${replies.length ? 'has-count' : ''}" data-act="reply">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9">
                        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.7-.8L3 21l1.9-4.7A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>
                    </svg>
                    <span>${replies.length || ''}</span>
                </button>
                <button class="astral-social-act ${reposted ? 'active' : ''}" data-act="repost">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9">
                        <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                    <span>${Array.isArray(post.repostedBy) ? post.repostedBy.length || '' : ''}</span>
                </button>
                <button class="astral-social-act ${liked ? 'active astral-social-act--liked' : ''}" data-act="like">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9">
                        <path d="M12 21s-7.2-4.5-9.4-8.6A5.3 5.3 0 0 1 12 6.4a5.3 5.3 0 0 1 9.4 6c-2.2 4.1-9.4 8.6-9.4 8.6z"/>
                    </svg>
                    <span>${Array.isArray(post.likedBy) ? post.likedBy.length || '' : ''}</span>
                </button>
            </div>

            ${replies.length ? `
                <div class="astral-social-replies">
                    ${replies.slice(-3).map(r => `
                        <div class="astral-social-reply">
                            <span class="astral-social-reply-name">${this._esc(r.author || '')}</span>
                            <span class="astral-social-reply-text">${this._esc(r.text || '')}</span>
                        </div>
                    `).join('')}
                    ${replies.length > 3 ? `<div class="astral-social-more">ещё ${replies.length - 3}…</div>` : ''}
                </div>` : ''}
        `;

        card.querySelector('[data-act="like"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle(post.id, 'likedBy');
            this.render(container);
        });

        card.querySelector('[data-act="repost"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle(post.id, 'repostedBy');
            this.render(container);
        });

        card.querySelector('[data-act="reply"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._openReply(post.id, container);
        });

        return card;
    }

    _toggle(postId, field) {
        const state = this.storage.getState();
        const post = (state.social || []).find(p => p.id === postId);
        if (!post) return;
        if (!Array.isArray(post[field])) post[field] = [];

        const i = post[field].indexOf('me');
        if (i >= 0) post[field].splice(i, 1);
        else post[field].push('me');

        this.storage.save();
    }

    /* ─────────────────────────── ответ ─────────────────────────── */

    _openReply(postId, container) {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">Ответить</div>
                <textarea class="astral-textarea" id="astral-social-reply-text" rows="3"
                          placeholder="Твой ответ…"></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-social-reply-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-social-reply-go">Отправить</button>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        overlay.querySelector('#astral-social-reply-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#astral-social-reply-go').addEventListener('click', () => {
            const text = overlay.querySelector('#astral-social-reply-text').value.trim();
            if (!text) return;

            const state = this.storage.getState();
            const post = (state.social || []).find(p => p.id === postId);
            if (!post) { close(); return; }

            if (!Array.isArray(post.replies)) post.replies = [];
            post.replies.push({
                author: this._userName(),
                text,
                timestamp: Date.now(),
                mine: true,
            });

            this.storage.save();
            close();
            this._toast('Ответ добавлен');
            this.render(container);
        });

        overlay.querySelector('#astral-social-reply-text').focus();
    }

    /* ─────────────────────────── создание поста ─────────────────────────── */

    _buildComposerBar(container) {
        const bar = document.createElement('div');
        bar.className = 'astral-action-bar astral-social-bar';

        const write = document.createElement('button');
        write.className = 'astral-btn astral-btn-primary';
        write.textContent = '✎ Написать';
        write.addEventListener('click', () => this._openComposer(container));
        bar.appendChild(write);

        const summon = document.createElement('button');
        summon.className = 'astral-btn';
        summon.textContent = '◈ Пост персонажа';
        summon.title = 'Модель выберет, кто из сцены напишет пост';
        summon.addEventListener('click', () => this._openSummon(container));
        bar.appendChild(summon);

        return bar;
    }

    /* ─────────────────────────── вызов поста персонажа ─────────────────────────── */

    _openSummon(container) {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const { cast, charName, userName } = collectCast(this.context || {});
        const candidates = cast.filter(n => n !== userName);
        const list = candidates.length ? candidates : [charName];

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">Кто пишет пост?</div>
                <div class="astral-summon-list">
                    <button class="astral-summon-opt astral-summon-opt--random" data-author="">
                        <span class="astral-summon-name">🎲 Рандом</span>
                        <span class="astral-summon-hint">модель выберет по сцене</span>
                    </button>
                    ${list.map(name => `
                        <button class="astral-summon-opt" data-author="${this._esc(name)}">
                            <span class="astral-summon-name">${this._esc(name)}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-summon-cancel">Отмена</button>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        overlay.querySelector('#astral-summon-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelectorAll('.astral-summon-opt').forEach(btn => {
            btn.addEventListener('click', async () => {
                const author = btn.dataset.author || '';
                close();
                await this._summonPost(author, container);
            });
        });
    }

    /** Запросить пост у модели и показать «<имя> печатает…» */
    async _summonPost(author, container) {
        // имя для индикатора: если рандом — показываем первого кандидата сцены,
        // после ответа индикатор заменится реальным постом
        const { cast, charName, userName } = collectCast(this.context || {});
        const guess = String(author || '').trim()
            || cast.find(n => n !== userName)
            || charName;

        const stopTyping = showTyping(guess);

        try {
            const result = await generateSocialPost(this.context || {}, { author });
            stopTyping();

            if (!result.text) {
                this._toast('Модель ничего не написала', 'error');
                return;
            }

            const state = this.storage.getState();
            if (!Array.isArray(state.social)) state.social = [];

            state.social.push({
                id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                author: result.author,
                handle: this._handle(result.author),
                text: result.text,
                timestamp: Date.now(),
                likedBy: [],
                repostedBy: [],
                replies: [],
            });

            this.storage.save();
            this._toast(`${result.author}: пост опубликован`);
            this.render(container);
        } catch (err) {
            stopTyping();
            console.error('[Social] summon failed:', err);
            this._toast(`Не получилось: ${err.message}`, 'error');
        }
    }

    _openComposer(container) {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">Новый пост</div>
                <textarea class="astral-textarea" id="astral-social-text" rows="5"
                          placeholder="Что происходит?"></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-social-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-social-go">Опубликовать</button>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        overlay.querySelector('#astral-social-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#astral-social-go').addEventListener('click', () => {
            const text = overlay.querySelector('#astral-social-text').value.trim();
            if (!text) return;

            const state = this.storage.getState();
            if (!Array.isArray(state.social)) state.social = [];

            state.social.push({
                id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                author: this._userName(),
                handle: this._myHandle(),
                text,
                timestamp: Date.now(),
                mine: true,
                likedBy: [],
                repostedBy: [],
                replies: [],
            });

            this.storage.save();
            close();
            this._toast('Опубликовано');
            this.render(container);
        });

        overlay.querySelector('#astral-social-text').focus();
    }

    /* ─────────────────────────── события ─────────────────────────── */

    async handleEvent(eventData) {
        const state = this.storage.getState();
        if (!Array.isArray(state.social)) state.social = [];

        const text = String(eventData.description || eventData.text || '').trim();
        if (!text) return { success: false, message: 'Пустой пост' };

        const author = String(eventData.character || this.context?.name2 || '').trim() || 'Неизвестный';

        state.social.push({
            id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            author,
            handle: this._handle(author),
            text,
            timestamp: Date.now(),
            likedBy: [],
            repostedBy: [],
            replies: [],
        });

        this.storage.save();
        return { success: true, message: 'Пост опубликован' };
    }

    /* ─────────────────────────── утилиты ─────────────────────────── */

    /** Имя для своих постов — из профиля соцсети, иначе из персоны. */
    _userName() {
        const state = this.storage?.getState?.() || {};
        const saved = String(state.socialProfile?.displayName || '').trim();
        if (saved) return saved;

        const ctx = this.context || {};
        const name = String(ctx.name1 || '').trim();
        return (!name || /sillytavern/i.test(name)) ? 'Ты' : name;
    }

    /** Ник для своих постов — из профиля, иначе сгенерированный. */
    _myHandle() {
        const state = this.storage?.getState?.() || {};
        const saved = String(state.socialProfile?.handle || '').trim();
        return saved || this._handle(this._userName());
    }

    _handle(name) {
        return String(name || 'user')
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 18) || 'user';
    }

    _ago(ts) {
        if (!ts) return '';
        const diff = Math.max(0, Date.now() - ts);
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'сейчас';
        if (m < 60) return `${m}м`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}ч`;
        return `${Math.floor(h / 24)}д`;
    }

    _toast(text, kind = 'info') {
        if (window.toastr) (toastr[kind] || toastr.info)(text);
        else console.log(`[Social] ${text}`);
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}