/**
 * LockScreen — экран блокировки с уведомлениями и свайпом вверх.
 */

export class LockScreen {
    constructor(context, storage) {
        this.context = context;
        this.storage = storage;
        this.locked = true;
        this.swipeStart = 0;
        this.overlay = null;
        this.clockEl = null;
    }

    build() {
        const state = this.storage.getState();
        const settings = this.storage._root().settings || {};
        const wallpaper = settings.lockscreenWallpaper || 'default';
        
        const overlay = document.createElement('div');
        overlay.id = 'astral-phone-lockscreen';
        overlay.className = `astral-lockscreen astral-lockscreen-${wallpaper}`;
        
        overlay.innerHTML = `
            <div class="astral-lockscreen-bg"></div>
            
            <div class="astral-lockscreen-content">
                <div class="astral-lockscreen-time" id="astral-lockscreen-time">--:--</div>
                <div class="astral-lockscreen-date" id="astral-lockscreen-date">--</div>
                
                <div class="astral-lockscreen-notifications" id="astral-lockscreen-notifs">
                    ${this._renderNotifications(state)}
                </div>
            </div>
            
            <div class="astral-lockscreen-hint">
                <div class="astral-swipe-indicator">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M12 2v14M19 9l-7-7-7 7"/>
                    </svg>
                </div>
            </div>
        `;
        
        this.overlay = overlay;
        this.clockEl = overlay.querySelector('#astral-lockscreen-time');
        this.dateEl = overlay.querySelector('#astral-lockscreen-date');
        
        // Свайп
        overlay.addEventListener('touchstart', (e) => {
            this.swipeStart = e.touches[0].clientY;
        });
        
        overlay.addEventListener('touchmove', (e) => {
            const current = e.touches[0].clientY;
            const diff = this.swipeStart - current;
            
            if (diff > 80) {
                this.unlock();
            }
        });
        
        // Клик тоже разблокирует (для удобства на десктопе)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.astral-lockscreen-hint')) {
                this.unlock();
            }
        });
        
        this._updateTime();
        this._clockInterval = setInterval(() => this._updateTime(), 20000);
        
        return overlay;
    }

    _renderNotifications(state) {
        const list = Array.isArray(state.notifications) ? state.notifications : [];

        if (list.length === 0) {
            return '<div class="astral-notification astral-notification--empty">Нет уведомлений</div>';
        }

        // Newest first, max 4 bubbles
        return list
            .slice(-4)
            .reverse()
            .map((n) => `
                <div class="astral-notification">
                    <div class="astral-notification-head">
                        <span class="astral-notification-app">${this._esc(this._appLabel(n.app))}</span>
                        <span class="astral-notification-time">${this._ago(n.timestamp)}</span>
                    </div>
                    <div class="astral-notification-title">${this._esc(n.title || '')}</div>
                    <div class="astral-notification-text">${this._esc(n.text || '')}</div>
                </div>
            `)
            .join('');
    }

    _appLabel(app) {
        return ({
            messages: 'Messages',
            gallery: 'Gallery',
            spicy: 'Spicy Hub',
            creator: 'Creator Studio',
        })[app] || app || '';
    }

    _ago(ts) {
        if (!ts) return '';
        const diff = Math.max(0, Date.now() - ts);
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'сейчас';
        if (m < 60) return `${m} мин`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} ч`;
        return `${Math.floor(h / 24)} д`;
    }

    _updateTime() {
        if (!this.clockEl) return;
        const now = new Date();
        
        this.clockEl.textContent = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        });
        
        if (this.dateEl) {
            this.dateEl.textContent = now.toLocaleDateString('ru-RU', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            });
        }
    }

    unlock() {
        if (!this.locked) return;
        this.locked = false;
        this.overlay?.classList.add('astral-lockscreen-unlocked');
        clearInterval(this._clockInterval);
        
        setTimeout(() => {
            this.overlay?.remove();
        }, 400);
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));
    }
}
