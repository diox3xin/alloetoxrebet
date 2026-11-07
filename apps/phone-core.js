/**
 * PhoneCore — phone shell, home screen, app navigation, event routing.
 * Builds the exact DOM that style.css targets.
 */

import { LockScreen } from './lockscreen.js';
import { AccountManager } from './account-manager.js';

/** Line icons drawn in the accent colour — one visual system instead of emoji. */
export const ICONS = {
    home: `<svg viewBox="0 0 24 24"><path d="M12 3.2l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 13.7 7.8 16.2l1.1-4.8L5.2 8.2l4.9-.4z"/></svg>`,
    messages: `<svg viewBox="0 0 24 24"><path d="M20.5 12.2c0 4-3.8 7.2-8.5 7.2-1 0-2-.1-2.9-.4L4 20.5l1.3-3.5C4.2 15.6 3.5 14 3.5 12.2c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke-width="2"/></svg>`,
    gallery: `<svg viewBox="0 0 24 24"><rect x="3.2" y="5.4" width="17.6" height="13.2" rx="3"/><circle cx="12" cy="12" r="3.6"/><path d="M17.4 8.4h.01" stroke-width="2.4"/></svg>`,
    spicy: `<svg viewBox="0 0 24 24"><path d="M12 21c3.6 0 6.4-2.6 6.4-6.2 0-4.4-4.3-6.6-4.3-10.8-2.2 1-3.3 3-3.3 5.2 0 1.4.4 2.2.4 2.2-1.4-.6-2.4-2-2.4-3.6-1.6 1.6-2.6 3.9-2.6 6.4C6.2 18.2 8.6 21 12 21z"/></svg>`,
    creator: `<svg viewBox="0 0 24 24"><path d="M12 2.8l3.1 5.9 6.3 1-4.6 4.4 1.1 6.4-5.9-3.2-5.9 3.2 1.1-6.4L2.6 9.7l6.3-1z"/></svg>`,
    notes: `<svg viewBox="0 0 24 24"><path d="M5 3.5h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M15.5 3.5V8h4.5M8.5 12h7M8.5 16h4.5"/></svg>`,
    social: `<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M8.4 7.2l3.2 8.6M15.6 7.2l-3.2 8.6M8.6 6h6.8"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>`,
};

export class PhoneCore {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.accountManager = null;
                try {
                    this.accountManager = new AccountManager(context, storage);
                    this.accountManager.getOrCreateAccount();
                } catch (err) {
                    console.error('[Astral Phone] AccountManager init failed (phone still usable):', err);
                }

        this.apps = new Map();
        this.currentAppId = null;
        this.overlay = null;
        this.bodyEl = null;
        this.titleEl = null;
        this.iconEl = null;
        this.backEl = null;
        this.timeEl = null;
        this.isOpen = false;
        this._clockTimer = null;
        this.lockScreen = new LockScreen(context, storage);

        this._onKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (this.currentAppId) this.showHome();
                else this.close();
            }
        };
    }

    registerApp(id, appInstance) {
        if (typeof appInstance.render !== 'function') {
            throw new Error(`App "${id}" must implement render(container, params)`);
        }
        this.apps.set(id, appInstance);
    }

    /* ─────────────────────────── open / close ─────────────────────────── */

    open() {
        if (!this.overlay) this._build();

        this._ensureOnTop();

        this.overlay.classList.add('active');
        this.isOpen = true;
        this.showHome();
        this._startClock();
        document.addEventListener('keydown', this._onKeyDown);
        document.body.style.overflow = 'hidden';

        // Локскрин монтируется ВНУТРЬ рамки телефона. Раньше он был отдельным
        // fixed-элементом на весь экран с z-index выше оверлея: на телефоне это
        // выглядело как «расширение закрыло пол-экрана и не закрывается».
        this._showLockScreen();
    }

    /**
     * Держит оверлей последним ребёнком body и блокирует прокрутку страницы.
     *
     * На мобильном ST встречаются два эффекта: (1) оверлей остаётся внутри
     * контейнера с transform — тогда fixed считается от него, и «телефон»
     * занимает часть экрана; (2) другие элементы перекрывают его по z-index.
     * Перенос в конец body решает оба.
     */
    _ensureOnTop() {
        try {
            const el = this.overlay;
            if (!el) return;
            if (el.parentElement !== document.body) {
                document.body.appendChild(el);
            } else if (document.body.lastElementChild !== el) {
                document.body.appendChild(el);
            }
        } catch (err) {
            console.warn('[Astral Phone] could not reattach overlay:', err);
        }
    }

    /** Показать локскрин в рамке устройства. */
    _showLockScreen() {
        try {
            this._removeLockScreen();

            const phone = this.overlay?.querySelector('.astral-phone');
            if (!phone) return;

            this.lockScreen.onCloseRequest = () => this.close();
            const lockEl = this.lockScreen.build();
            lockEl.classList.add('astral-lockscreen--in-frame');
            phone.appendChild(lockEl);
        } catch (err) {
            console.warn('[Astral Phone] lockscreen failed, skipping:', err);
        }
    }

    /** Убрать локскрин, если он есть. */
    _removeLockScreen() {
        try {
            this.lockScreen.destroy?.();
        } catch (_) { /* ignore */ }
        this.overlay?.querySelector('#astral-phone-lockscreen')?.remove();
    }

    close() {
        if (!this.isOpen) return;
        try { this.storage?.flush?.(); } catch (err) { console.warn('[Astral Phone] flush failed:', err); }
        this._removeLockScreen();
        this.overlay.classList.remove('active');
        this.isOpen = false;
        this._stopClock();
        document.removeEventListener('keydown', this._onKeyDown);
        document.body.style.overflow = '';
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    /* ─────────────────────────── navigation ─────────────────────────── */

    showHome() {
        this.currentAppId = null;
        if (!this.overlay) return;
        this.backEl.style.visibility = 'hidden';
        this.iconEl.innerHTML = ICONS.home;
        this.titleEl.textContent = 'Astral';
        this.bodyEl.innerHTML = '';
        this._renderHome();
    }

    openApp(appId, params = {}) {
        const app = this.apps.get(appId);
        if (!app) {
            console.warn(`[Astral Phone] App "${appId}" is not registered`);
            return;
        }

        this.currentAppId = appId;
        this._clearUnread(appId);
        this.backEl.style.visibility = 'visible';
        this.iconEl.innerHTML = app.icon || ICONS.home;
        this.titleEl.textContent = app.title || appId;
        this.bodyEl.innerHTML = '';
        this.bodyEl.scrollTop = 0;

        try {
            app.render(this.bodyEl, params);
        } catch (err) {
            console.error(`[Astral Phone] App "${appId}" failed to render:`, err);
            this.bodyEl.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">⚠</div>
                    <div>${this._esc(err.message)}</div>
                </div>`;
        }
    }

    /** Re-render the currently open app (used after an event lands). */
    refresh() {
        if (this.isOpen && this.currentAppId) this.openApp(this.currentAppId);
    }

    /* ─────────────────────────── DOM ─────────────────────────── */

    _build() {
        const overlay = document.createElement('div');
        overlay.id = 'astral-phone-overlay';
        overlay.innerHTML = `
            <div class="astral-phone">
                <div class="astral-nebula"></div>
                <div class="astral-phone-notch"></div>

                <div class="astral-phone-statusbar">
                    <span class="astral-sb-time">--:--</span>
                    <div class="astral-sb-right">
                        <span class="astral-signal-bars"><i></i><i></i><i></i><i></i></span>
                        <span class="astral-battery"></span>
                    </div>
                </div>

                <div class="astral-phone-header">
                    <span class="astral-back-btn">‹</span>
                    <div class="astral-app-icon">${ICONS.home}</div>
                    <div class="astral-app-title">Astral</div>
                    <div class="astral-phone-close" title="Закрыть">✕</div>
                </div>

                <div class="astral-phone-body"></div>
            </div>
        `;

        // Портал: оверлей всегда последним ребёнком body. Если ST отрисует
        // что-то после, оверлей поднимется наверх при открытии (_ensureOnTop).
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.bodyEl = overlay.querySelector('.astral-phone-body');
        this.titleEl = overlay.querySelector('.astral-app-title');
        this.iconEl = overlay.querySelector('.astral-app-icon');
        this.backEl = overlay.querySelector('.astral-back-btn');
        this.timeEl = overlay.querySelector('.astral-sb-time');

        overlay.querySelector('.astral-phone-close').addEventListener('click', () => this.close());
        this.backEl.addEventListener('click', () => {
            if (this.currentAppId) this.showHome();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        this._bindCloseGestures(overlay);
    }

    /**
     * Жесты закрытия для тача.
     *
     * Кнопка ✕ на мобильном может оказаться под системной панелью, поэтому
     * добавляем два привычных способа: свайп вниз по шапке и свайп вправо по
     * левому краю (как «назад» в iOS).
     */
    _bindCloseGestures(overlay) {
        const header = overlay.querySelector('.astral-phone-header');
        if (!header) return;

        let startY = 0;
        let startX = 0;
        let tracking = false;

        const onStart = (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            tracking = true;
            startY = t.clientY;
            startX = t.clientX;
        };

        const onMove = (e) => {
            if (!tracking) return;
            const t = e.touches?.[0];
            if (!t) return;
            const dy = t.clientY - startY;
            const dx = t.clientX - startX;

            // свайп вниз по шапке
            if (dy > 90 && Math.abs(dx) < 70) {
                tracking = false;
                this.close();
            }
        };

        const onEnd = () => { tracking = false; };

        header.addEventListener('touchstart', onStart, { passive: true });
        header.addEventListener('touchmove', onMove, { passive: true });
        header.addEventListener('touchend', onEnd, { passive: true });

        // свайп вправо от левого края
        const phone = overlay.querySelector('.astral-phone');
        if (!phone) return;

        let edgeX = 0;
        let edgeTracking = false;

        phone.addEventListener('touchstart', (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            edgeTracking = t.clientX < 32;
            edgeX = t.clientX;
        }, { passive: true });

        phone.addEventListener('touchmove', (e) => {
            if (!edgeTracking) return;
            const t = e.touches?.[0];
            if (!t) return;
            if (t.clientX - edgeX > 70) {
                edgeTracking = false;
                this.close();
            }
        }, { passive: true });

        phone.addEventListener('touchend', () => { edgeTracking = false; }, { passive: true });
    }

    _renderHome() {
        const grid = document.createElement('div');
        grid.className = 'astral-home-grid';

        const unread = this.storage.getState().unread || {};

        for (const [id, app] of this.apps.entries()) {
            const card = document.createElement('div');
            card.className = 'astral-app-card';
            const badgeCount = Number(unread[id]) || 0;
            const badge = badgeCount > 0
                ? `<span class="astral-app-badge">${badgeCount > 99 ? '99+' : badgeCount}</span>`
                : '';
            card.innerHTML = `
                <div class="astral-app-card-icon">${app.icon || ICONS.home}${badge}</div>
                <div class="astral-app-card-label">${this._esc(app.title || id)}</div>
            `;
            card.addEventListener('click', () => this.openApp(id));
            grid.appendChild(card);
        }

        this.bodyEl.appendChild(grid);
    }

    _startClock() {
        this._tick();
        if (!this._clockTimer) this._clockTimer = setInterval(() => this._tick(), 20000);
    }

    _stopClock() {
        if (this._clockTimer) {
            clearInterval(this._clockTimer);
            this._clockTimer = null;
        }
    }

    _tick() {
        if (!this.timeEl) return;
        this.timeEl.textContent = new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    /* ─────────────────────────── events from the model ─────────────────────────── */

    async handleEvent(eventData) {
        const { type, ...data } = eventData || {};

        const routing = {
            photo_taken: 'gallery',
            message_received: 'messages',
            content_posted: 'creator',
            donation_received: 'creator',
            subscriber_joined: 'creator',
            spicy_posted: 'spicy',
            note_written: 'notes',
            social_post: 'social',
        };

        const appId = routing[type];
        if (!appId) return { success: false, error: `Unknown event type: ${type}` };

        const app = this.apps.get(appId);
        if (!app || typeof app.handleEvent !== 'function') {
            return { success: false, error: `App "${appId}" cannot handle events` };
        }

        try {
            const result = await app.handleEvent({ type, ...data });
            this.bumpUnread(appId);
            this.pushNotification({
                app: appId,
                title: app.title || appId,
                text: data.description || data.text || '',
            });
            try {
                const st = this.storage.getState();
                st.sinceEvent = 0;
                this.storage.save();
            } catch { /* ignore */ }
            this.refresh();
            return result || { success: true };
        } catch (err) {
            console.error('[Astral Phone] Event handling failed:', err);
            return { success: false, error: err.message };
        }
    }

    /* ─────────────────────────── unread / notifications ─────────────────────────── */

    /** Clear the unread badge for an app (called when it is opened). */
    _clearUnread(appId) {
        try {
            const state = this.storage.getState();
            if (state.unread && state.unread[appId]) {
                state.unread[appId] = 0;
                this.storage.save();
            }
            // Notifications belong to the app that was opened
            if (Array.isArray(state.notifications) && state.notifications.length) {
                const kept = state.notifications.filter(n => n.app !== appId);
                if (kept.length !== state.notifications.length) {
                    state.notifications = kept;
                    this.storage.save();
                }
            }
        } catch (err) {
            console.warn('[Astral Phone] clear unread failed:', err);
        }
    }

    /** Bump the unread counter for an app. */
    bumpUnread(appId, by = 1) {
        try {
            const state = this.storage.getState();
            if (!state.unread) state.unread = {};
            state.unread[appId] = (Number(state.unread[appId]) || 0) + by;
            this.storage.save();
        } catch (err) {
            console.warn('[Astral Phone] bump unread failed:', err);
        }
    }

    /** Push a notification onto the lock-screen queue (capped at 5). */
    pushNotification({ app, title, text }) {
        try {
            const state = this.storage.getState();
            if (!Array.isArray(state.notifications)) state.notifications = [];
            state.notifications.push({
                app,
                title: String(title || ''),
                text: String(text || '').slice(0, 140),
                timestamp: Date.now(),
            });
            if (state.notifications.length > 5) {
                state.notifications = state.notifications.slice(-5);
            }
            this.storage.save();
        } catch (err) {
            console.warn('[Astral Phone] push notification failed:', err);
        }
    }

    /* ─────────────────────────── utils ─────────────────────────── */

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
