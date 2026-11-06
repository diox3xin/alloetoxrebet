/**
 * AccountManager — per-chat user account derived from the ST persona.
 * Storage contract: updateState(chatId, partial) takes TWO args; state key is `account`.
 */

export class AccountManager {
    constructor(context, storage) {
        this.context = context;
        this.storage = storage;
        this.currentAccount = null;
    }

    getOrCreateAccount() {
        if (this.currentAccount) return this.currentAccount;

        const state = this.storage.getState();
        if (state.account) {
            this.currentAccount = state.account;
            return this.currentAccount;
        }

        const account = this._fromPersona();
        this.storage.updateState(null, { account });
        this.currentAccount = account;
        return account;
    }

    _fromPersona() {
        let name = 'You';
        let avatar = this._initialAvatar('Y');
        let bio = '';

        try {
            const ctx = this.context || {};
            const persona = ctx.personas?.[ctx.user_persona] || ctx.persona || null;
            if (persona) {
                name = persona.name || name;
                if (persona.avatar && persona.avatar !== 'none') avatar = persona.avatar;
                if (persona.description) bio = String(persona.description).slice(0, 200);
            } else if (ctx.name1) {
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

    getCurrentAccount() {
        return this.currentAccount || this.getOrCreateAccount();
    }

    updateAccount(partial) {
        const account = { ...this.getCurrentAccount(), ...partial };
        this.currentAccount = account;
        this.storage.updateState(null, { account });
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