/**
 * PhoneStorage — per-chat state persistence.
 * Everything lives in chat_metadata so each chat has its own inbox/feed/account.
 *
 * IMPORTANT: never cache the context object. SillyTavern reassigns its
 * `chat_metadata` variable when the user switches chats, so a snapshot taken at
 * init keeps pointing at the OLD chat — reads and writes then leak between chats.
 * Resolve a fresh context on every access instead.
 */

export class PhoneStorage {
    constructor(context) {
        this._seed = context || null;
        this.key = 'astral_phone';
        this.onChatChanged = null;
    }

    /** Fresh ST context. */
    _ctx() {
        try {
            const live = globalThis.SillyTavern?.getContext?.();
            if (live) return live;
        } catch (err) {
            console.warn('[Astral Phone] getContext failed, using seed context:', err);
        }
        return this._seed || {};
    }

    /** Identity of the chat currently loaded — used to detect switches. */
    chatId() {
        const ctx = this._ctx();
        try {
            if (typeof ctx.getCurrentChatId === 'function') {
                const id = ctx.getCurrentChatId();
                if (id) return String(id);
            }
        } catch { /* fall through */ }
        if (ctx.chatId) return String(ctx.chatId);
        if (Array.isArray(ctx.chat) && ctx.chat.length) {
            const first = ctx.chat[0];
            const stamp = first?.send_date || first?.create_date || '';
            return `${ctx.characterId ?? ctx.this_chid ?? 0}:${ctx.chat.length}:${stamp}`;
        }
        return `${ctx.characterId ?? ctx.this_chid ?? 0}:empty`;
    }

    _root() {
        const ctx = this._ctx();
        if (!ctx.chat_metadata) ctx.chat_metadata = {};
        if (!ctx.chat_metadata[this.key]) ctx.chat_metadata[this.key] = {};
        return ctx.chat_metadata[this.key];
    }

    _defaults() {
        return {
            messages: [],
            gallery: [],
            spicy: [],
            creator: {
                posts: [],
                subscribers: 0,
                revenue: 0,
                fans: [],
            },
        };
    }

    /**
     * Get state. The chat is implicit — chat_metadata is already per-chat,
     * so the `chatId` argument is accepted for API compatibility and ignored.
     */
    getState() {
        const root = this._root();
        if (!root.state) root.state = this._defaults();

        // Defensive: fill in keys added in later versions
        const d = this._defaults();
        for (const k of Object.keys(d)) {
            if (root.state[k] === undefined) root.state[k] = d[k];
        }
        if (!root.state.creator) root.state.creator = d.creator;
        for (const k of Object.keys(d.creator)) {
            if (root.state.creator[k] === undefined) root.state.creator[k] = d.creator[k];
        }

        return root.state;
    }

    setState(_chatId, state) {
        this._root().state = state;
        this.save();
    }

    updateState(_chatId, partial) {
        if (!partial || typeof partial !== 'object') return this.getState();
        const state = this.getState();
        for (const key of Object.keys(partial)) {
            const val = partial[key];
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                state[key] = { ...(state[key] || {}), ...val };
            } else {
                state[key] = val;
            }
        }
        this.save();
        return state;
    }

    save() {
        try {
            this._ctx().updateChatMetadata?.(null, true);
        } catch (err) {
            console.warn('[Astral Phone] Could not persist chat metadata:', err);
        }
    }

    reset() {
        this._root().state = this._defaults();
        this.save();
    }
}