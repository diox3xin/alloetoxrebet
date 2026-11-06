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
        const bgImage = settings.lockscreenBg || '';
        
        const overlay = document.createElement('div');
        overlay.id = 'astral-phone-lockscreen';
        overlay.className = 'astral-lockscreen';
        
        // Фон
        const bgStyle = bgImage 
            ? `background-image: url('${bgImage}'); background-size: cover; background-position: center;`
            : `background: linear-gradient(160deg, rgba(20,15,25,.95), rgba(13,11,16,.98));`;
        
        overlay.innerHTML = `
            <div class="astral-lockscreen-bg" style="${bgStyle}"></div>
            
            <div class="astral-lockscreen-content">
                <div class="astral-lockscreen-time" id="astral-lockscreen-time">--:--</div>
                <div class="astral-lockscreen-date" id="astral-lockscreen-date">--</div>
                
                <div class="astral-lockscreen-notifications">
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
        const messages = state.messages || [];
        const unreadCount = messages.length; // TODO: track unread
        
        if (unreadCount === 0) {
            return '<div class="astral-notification" style="opacity: .5;">Нет уведомлений</div>';
        }
        
        const last = messages[messages.length - 1];
        return `
            <div class="astral-notification">
                <strong>${this._esc(last.character || 'Сообщение')}</strong>
                <div class="astral-notification-text">${this._esc((last.text || '').slice(0, 60))}</div>
            </div>
            ${unreadCount > 1 ? `<div class="astral-notification-badge">${unreadCount}</div>` : ''}
        `;
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
