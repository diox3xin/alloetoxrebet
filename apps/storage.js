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
            social: [],
            socialFollowing: [],
            /** Unread counters per app — drive the home-screen badges. */
            unread: { messages: 0, gallery: 0, social: 0 },
            /** Latest RP events for the lock screen (newest last, capped). */
            notifications: [],
            /** How many model replies have passed since the last phone event. */
            sinceEvent: 0,
            /** Keys of chat tags already turned into phone events (dedupe). */
            seenEvents: [],
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
        for (const list of ['messages', 'gallery', 'social', 'socialFollowing', 'notifications', 'seenEvents']) {
            if (!Array.isArray(root.state[list])) root.state[list] = [];
        }
        if (!root.state.unread || typeof root.state.unread !== 'object') {
            root.state.unread = { messages: 0, gallery: 0, social: 0 };
        }
        for (const key of ['messages', 'gallery', 'social']) {
            if (typeof root.state.unread[key] !== 'number') root.state.unread[key] = 0;
        }
        if (typeof root.state.sinceEvent !== 'number') root.state.sinceEvent = 0;

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

    /**
     * Почистить состояние: убрать дубли, которые плодила старая версия
     * (сканер истории при каждой смене чата), выкинуть данные удалённых
     * приложений и ограничить размер списков — всё это лежит прямо в файле
     * чата и перезаписывается вместе с ним.
     * @returns {number} сколько записей удалено
     */
    compact() {
        const root = this._root();
        if (!root.state) return 0;
        const state = this.getState();
        let removed = 0;

        for (const dead of ['creator', 'notes', 'spicy']) {
            if (dead in state) { delete state[dead]; removed++; }
        }
        for (const key of Object.keys(state.unread)) {
            if (!['messages', 'gallery', 'social'].includes(key)) delete state.unread[key];
        }
        if (Array.isArray(state.notifications)) {
            state.notifications = state.notifications.filter(n => ['messages', 'gallery', 'social'].includes(n.app));
        }

        // Дубли от старого сканера истории помечены id «scan_…». Обычные записи
        // не трогаем: два одинаковых «ок» от одного НПС — нормальная переписка.
        const dedupe = (list, keyOf, cap) => {
            const isScan = (item) => String(item?.id || '').startsWith('scan_');
            const seen = new Set(list.filter(i => !isScan(i)).map(keyOf));
            const out = [];
            for (const item of list) {
                if (isScan(item)) {
                    const k = keyOf(item);
                    if (seen.has(k)) { removed++; continue; }
                    seen.add(k);
                }
                out.push(item);
            }
            if (out.length > cap) { removed += out.length - cap; return out.slice(-cap); }
            return out;
        };
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

        state.messages = dedupe(state.messages,
            m => `${norm(m.character)}|${m.from || (m.fromUser ? 'me' : 'them')}|${norm(m.text)}`, 400);
        state.social = dedupe(state.social, p => `${norm(p.author)}|${norm(p.text)}`, 200);
        state.gallery = dedupe(state.gallery, g => g.imageUrl || `${norm(g.character)}|${norm(g.description)}`, 300);

        if (removed) {
            console.log(`[Astral Phone] compact: убрано ${removed} лишних записей`);
            this.save();
        }
        return removed;
    }

    reset() {
        this._root().state = this._defaults();
        this.save();
    }
}