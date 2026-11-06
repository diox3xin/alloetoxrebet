/**
 * PhoneStorage — per-chat state persistence.
 *
 * Two ST facts drive this implementation:
 *
 * 1. `SillyTavern.getContext()` exposes the live metadata object as
 *    **`chatMetadata`** (camelCase). There is no `chat_metadata` key on the
 *    context, so reading that name yielded `undefined` and every call built a
 *    throwaway `{}` — writes vanished and reads looked empty.
 * 2. ST reassigns its module-level `chat_metadata` variable when chats are
 *    switched, so a context snapshot taken at init points at the OLD chat.
 *    Always call `getContext()` again; never cache it.
 *
 * Writes mutate the live metadata object in place, then persist via
 * `saveMetadata()` (debounced fallback) so chat_metadata reaches the file.
 */

export class PhoneStorage {
    constructor(context) {
        this._seed = context || null;
        this.key = 'astral_phone';
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

    /** The live per-chat metadata object. */
    _meta() {
        const ctx = this._ctx();
        return ctx.chatMetadata || ctx.chat_metadata || {};
    }

    /** Identity of the loaded chat — used to detect switches. */
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
            return `${ctx.characterId ?? 0}:${ctx.chat.length}:${stamp}`;
        }
        return `${ctx.characterId ?? 0}:empty`;
    }

    _root() {
        const meta = this._meta();
        if (!meta[this.key]) meta[this.key] = {};
        return meta[this.key];
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
     * Get state. The chat is implicit — metadata is already per-chat, so the
     * `chatId` argument exists only for API compatibility and is ignored.
     */
    getState() {
        const root = this._root();
        if (!root.state) root.state = this._defaults();

        const d = this._defaults();
        for (const k of Object.keys(d)) {
            if (root.state[k] === undefined) root.state[k] = d[k];
        }
        if (!root.state.creator) root.state.creator = d.creator;
        for (const k of Object.keys(d.creator)) {
            if (root.state.creator[k] === undefined) root.state.creator[k] = d.creator[k];
        }
        for (const list of ['messages', 'gallery', 'spicy']) {
            if (!Array.isArray(root.state[list])) root.state[list] = [];
        }
        if (!Array.isArray(root.state.creator.posts)) root.state.creator.posts = [];
        if (!Array.isArray(root.state.creator.fans)) root.state.creator.fans = [];

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

    /**
     * Persist. State is mutated in place inside the live metadata object, so a
     * chat save writes it to disk. `saveMetadata` = saveChatConditional, which
     * rewrites the whole chat file — throttle it so a burst of clicks doesn't
     * hammer the disk, with a trailing flush so nothing is lost.
     */
    save() {
        this._pending = true;
        if (this._timer) return;

        const delay = 800;
        const flush = () => {
            this._timer = null;
            if (!this._pending) return;
            this._pending = false;
            const ctx = this._ctx();
            try {
                if (typeof ctx.saveMetadata === 'function') {
                    Promise.resolve(ctx.saveMetadata()).catch((err) =>
                        console.warn('[Astral Phone] metadata save failed:', err));
                } else if (typeof ctx.saveMetadataDebounced === 'function') {
                    ctx.saveMetadataDebounced();
                }
            } catch (err) {
                console.warn('[Astral Phone] could not persist chat metadata:', err);
            }
        };

        this._timer = setTimeout(flush, delay);
    }

    /** Force an immediate write — call before the phone closes. */
    flush() {
        if (!this._pending) return;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        this._pending = false;
        const ctx = this._ctx();
        try {
            if (typeof ctx.saveMetadata === 'function') {
                Promise.resolve(ctx.saveMetadata()).catch((err) =>
                    console.warn('[Astral Phone] metadata save failed:', err));
            } else if (typeof ctx.saveMetadataDebounced === 'function') {
                ctx.saveMetadataDebounced();
            }
        } catch (err) {
            console.warn('[Astral Phone] could not persist chat metadata:', err);
        }
    }

    reset() {
        this._root().state = this._defaults();
        this.save();
    }
}