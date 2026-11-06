/**
 * Settings — управление аккаунтом пользователя и настройками телефона.
 */

export class SettingsApp {
    constructor(context, storage, accountManager) {
        this.context = context;
        this.storage = storage;
        this.accountManager = accountManager;
    }

    render() {
        const account = this.accountManager.getCurrentAccount();
        
        return `
            <div class="astral-app astral-settings">
                <div class="astral-settings-section">
                    <h3 class="astral-section-title">Профиль</h3>
                    
                    <div class="astral-profile-edit">
                        <div class="astral-avatar-edit">
                            <img src="${this._esc(account.avatar)}" alt="Avatar" class="astral-avatar-preview" />
                            <button class="astral-btn-icon" data-action="change-avatar">
                                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none">
                                    <circle cx="12" cy="12" r="3"/>
                                    <path d="M3 16.8V9.2c0-.56 0-.84.109-1.054a1 1 0 01.437-.437C3.76 7.6 4.04 7.6 4.6 7.6h1.173c.356 0 .534 0 .697-.064a1 1 0 00.34-.248c.121-.13.188-.312.321-.675l.57-1.553c.133-.363.2-.546.32-.675a1 1 0 01.34-.248c.164-.064.341-.064.698-.064h3.882c.356 0 .534 0 .697.064a1 1 0 01.34.248c.121.13.188.312.321.675l.57 1.553c.133.363.2.546.32.675a1 1 0 00.34.248c.164.064.341.064.698.064h1.173c.56 0 .84 0 1.054.109a1 1 0 01.437.437c.109.214.109.494.109 1.054v7.6c0 .56 0 .84-.109 1.054a1 1 0 01-.437.437C19.24 18.4 18.96 18.4 18.4 18.4H5.6c-.56 0-.84 0-1.054-.109a1 1 0 01-.437-.437C4 17.64 4 17.36 4 16.8z"/>
                                </svg>
                            </button>
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
                            <span>Аккаунт создан</span>
                            <span>${new Date(account.createdAt).toLocaleDateString('ru-RU')}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEvents(container) {
        container.querySelector('[data-action="save-profile"]')?.addEventListener('click', () => {
            const name = container.querySelector('#astral-account-name')?.value || '';
            const bio = container.querySelector('#astral-account-bio')?.value || '';
            
            this.accountManager.updateAccount({ name, bio });
            
            // Feedback
            const btn = container.querySelector('[data-action="save-profile"]');
            const orig = btn.textContent;
            btn.textContent = '✓ Сохранено';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        });

        container.querySelector('[data-action="change-avatar"]')?.addEventListener('click', () => {
            const url = prompt('Введите URL аватара (прямая ссылка на .jpg/.png):');
            if (!url) return;
            
            this.accountManager.updateAccount({ avatar: url });
            container.querySelector('.astral-avatar-preview').src = url;
        });
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}
