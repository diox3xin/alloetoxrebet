/**
 * Builds the dynamic half of the phone prompt: the recent phone transcript and
 * a nudge when the phone has been silent for a while.
 *
 * Kept separate from index.js so it can be unit-tested without booting the
 * whole extension (index.js has top-level side effects).
 */

/** Message is outgoing if it came from the user, either field works. */
function isOutgoing(m) {
    if (m.from === 'me') return true;
    if (m.from === 'them') return false;
    return Boolean(m.fromUser);
}

/**
 * Pure: build the context block from a phone state snapshot.
 * @param {object} state phone state (messages, sinceEvent)
 * @returns {string}
 */
export function buildPhoneContext(state) {
    const msgs = Array.isArray(state?.messages) ? state.messages : [];
    const recent = msgs.slice(-24);

    const lines = recent.map((m) => {
        const who = isOutgoing(m) ? 'Ты' : (m.character || 'Контакт');
        return `${who}: ${String(m.text || '').slice(0, 160)}`;
    });

    const sinceEvent = Number(state?.sinceEvent) || 0;
    const nudge = sinceEvent >= 4
        ? `\nТелефон молчит уже ${sinceEvent} сообщений — уместно добавить событие.`
        : '';

    const body = lines.length
        ? `Последние сообщения в телефоне (старые выше):\n${lines.join('\n')}${nudge}`
        : `Переписки пока нет.${nudge}`;

    return `[Astral Phone — переписка]\n${body}`;
}

/**
 * Push the current transcript into the prompt via setExtensionPrompt.
 * Safe to call often — every chat message and every phone write triggers it.
 */
export function refreshPhonePrompt(storage) {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context || typeof context.setExtensionPrompt !== 'function' || !storage) return;

    try {
        const state = storage.getState();
        context.setExtensionPrompt(
            'astral-phone-context',
            buildPhoneContext(state),
            context.extension_prompt_types?.IN_CHAT ?? 1,
            2,
            false,
        );
    } catch (err) {
        console.warn('[Astral Phone] dynamic prompt refresh failed:', err);
    }
}