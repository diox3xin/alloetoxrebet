/**
 * AccountManager — управление пользовательскими аккаунтами.
 * Каждый чат = отдельный аккаунт, на основе User Persona.
 */

export class AccountManager {
    constructor(context, storage) {
        this.context = context;
        this.storage = storage;
        this.currentAccount = null;
    }

    /**
     * Получить или создать аккаунт для текущего чата.
     */
    getOrCreateAccount() {
        const chatId = this._getChatId();
        const accounts = this.storage.getState().accounts || {};
        
        if (accounts[chatId]) {
            this.currentAccount = accounts[chatId];
            return this.currentAccount;
        }
        
        // Auto-create на основе User Persona
        const account = this._createFromPersona(chatId);
        accounts[chatId] = account;
        this.storage.updateState({ accounts });
        this.currentAccount = account;
        return account;
    }

    /**
     * Создать аккаунт из User Persona.
     */
    _createFromPersona(chatId) {
        const personas = this.context?.chat?.[chatId]?.personas || {};
        const userPersona = personas.user || {};
        
        return {
            id: chatId,
            name: userPersona.name || 'You',
            avatar: userPersona.avatar || this._defaultAvatar(),
            bio: userPersona.bio || '',
            createdAt: new Date().toISOString(),
            stats: {
                followers: Math.floor(Math.random() * 5000) + 100,
                following: Math.floor(Math.random() * 500) + 10,
                posts: 0,
                likes: 0,
            }
        };
    }

    /**
     * Обновить текущий аккаунт.
     */
    updateAccount(updates) {
        if (!this.currentAccount) return;
        
        const chatId = this._getChatId();
        const accounts = this.storage.getState().accounts || {};
        
        this.currentAccount = { ...this.currentAccount, ...updates };
        accounts[chatId] = this.currentAccount;
        this.storage.updateState({ accounts });
    }

    /**
     * Получить текущий аккаунт.
     */
    getCurrentAccount() {
        return this.currentAccount || this.getOrCreateAccount();
    }

    /**
     * Получить ID текущего чата.
     */
    _getChatId() {
        return this.context?.chat?.id || 'default';
    }

    /**
     * SVG аватар по умолчанию (инициалы).
     */
    _defaultAvatar() {
        const letters = ['A', 'U'];
        const colors = ['#D99AB5', '#E5AFC5', '#A18D9B'];
        const bg = colors[Math.floor(Math.random() * colors.length)];
        
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='${encodeURIComponent(bg)}'/%3E%3Ctext x='50' y='65' font-size='40' font-weight='bold' text-anchor='middle' fill='%230D0B10'${letters.join(',')}</text%3E%3C/svg%3E`;
    }
}
