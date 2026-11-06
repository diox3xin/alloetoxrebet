/**
 * PhoneStorage — per-chat state persistence.
 * Everything lives in chat_metadata so each chat has its own inbox/feed.
 */

export class PhoneStorage {
    constructor(context) {
        this.context = context;
        this.key = 'astral_phone';
    }

    _root() {
        if (!this.context.chat_metadata) {
            this.context.chat_metadata = {};
        }
        if (!this.context.chat_metadata[this.key]) {
            this.context.chat_metadata[this.key] = {};
        }
        return this.context.chat_metadata[this.key];
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
            this.context.updateChatMetadata?.(null, true);
        } catch (err) {
            console.warn('[Astral Phone] Could not persist chat metadata:', err);
        }
    }

    reset() {
        this._root().state = this._defaults();
        this.save();
    }
}
