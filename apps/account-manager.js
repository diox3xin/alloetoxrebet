/**
 * AccountManager — one user account per chat, seeded from the ST persona.
 *
 * No cross-chat caching: the account is always resolved from the CURRENT chat's
 * state, keyed by the live chat id. Switching chats therefore switches accounts.
 */

export class AccountManager {
    constructor(context, storage) {
        this._seed = context || null;
        this.storage = storage;
        this._cachedChatId = null;
        this._cached = null;
    }

    _ctx() {
        try {
            const live = globalThis.SillyTavern?.getContext?.();
            if (live) return live;
        } catch { /* ignore */ }
        return this._seed || {};
    }

    /** Current chat id, via storage (single source of truth). */
    _chatId() {
        return this.storage.chatId();
    }

    /** Account for the chat that is loaded right now. */
    getCurrentAccount() {
        const chatId = this._chatId();

        if (this._cached && this._cachedChatId === chatId) return this._cached;

        const state = this.storage.getState();
        if (state.account) {
            this._cached = state.account;
            this._cachedChatId = chatId;
            return this._cached;
        }

        const account = this._fromPersona();
        this.storage.updateState(null, { account });
        this._cached = account;
        this._cachedChatId = chatId;
        return account;
    }

    /** Drop the in-memory cache — call on chat switch. */
    invalidate() {
        this._cached = null;
        this._cachedChatId = null;
    }

    _fromPersona() {
        let name = 'You';
        let avatar = this._initialAvatar('Y');
        let bio = '';

        try {
            const ctx = this._ctx();
            const persona = ctx.personas?.[ctx.user_persona] || ctx.persona || null;
            if (persona) {
                name = persona.name || name;
                if (persona.avatar && persona.avatar !== 'none') avatar = persona.avatar;
                if (persona.description) bio = String(persona.description).slice(0, 200);
            }
            if (name === 'You' && ctx.name1) {
                name = ctx.name1;
                avatar = this._initialAvatar(String(name).charAt(0).toUpperCase());
            }
        } catch (err) {
            console.warn('[Astral Phone] persona read failed:', err);
        }

        return {
            name,
            avatar,
            bio,
            createdAt: new Date().toISOString(),
            stats: {
                followers: 1240,
                following: 87,
                posts: 0,
                likes: 0,
            },
        };
    }

    updateAccount(partial) {
        const account = { ...this.getCurrentAccount(), ...partial };
        this.storage.updateState(null, { account });
        this._cached = account;
        this._cachedChatId = this._chatId();
        return account;
    }

    bumpStat(key, by = 1) {
        const account = this.getCurrentAccount();
        const stats = { ...(account.stats || {}), [key]: (account.stats?.[key] || 0) + by };
        return this.updateAccount({ stats });
    }

    _initialAvatar(letter) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#D99AB5"/><text x="50" y="66" font-size="44" font-family="sans-serif" font-weight="600" text-anchor="middle" fill="#0D0B10">${letter}</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
}