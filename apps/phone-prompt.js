/**
 * Промпт телефона.
 *
 * Две части:
 *  - PHONE_RULES — статичные правила, кладутся один раз в системную часть
 *    промпта (не двигаются по чату, хорошо кэшируются провайдером);
 *  - buildPhoneContext — короткая сводка «что сейчас в телефоне», обновляется
 *    после каждого сообщения. Жёстко ограничена по длине.
 *
 * Живость мира достигается без дополнительных запросов: модель сама вставляет
 * скрытые теги в обычный ответ, а сводка подсказывает ей, кто ждёт ответа и
 * как давно телефон молчит.
 */

import { buildCastPromptBlock } from './cast-profiles.js';

export const PHONE_RULES = `[Телефон]
У игрока и у всех персонажей есть смартфоны. Мир живёт и за кадром: знакомые НПС пишут игроку, постят в соцсеть, реагируют на его посты — у каждого свои дела, настроение и причины.
Когда это естественно по сюжету, добавь в САМЫЙ КОНЕЦ ответа скрытый тег (игрок его не увидит, событие появится в телефоне):
<phone-event type="message_received" character="Имя" description="текст смс"/>
<phone-event type="social_post" character="Имя" description="текст поста" photo="что на фото"/>
<phone-event type="social_comment" character="Имя" description="коммент к последнему посту игрока"/>
<phone-event type="social_like" character="Имя"/>
<phone-event type="social_follow" character="Имя"/>
<phone-event type="photo_taken" character="Имя" description="что в кадре"/>
Правила:
- Не описывай телефон прозой («пришло сообщение») — только тег.
- Обычно тегов 0, иногда 1–2. Не каждый ответ.
- Пиши как настоящие смс и посты: коротко, живым языком, голосом персонажа, на языке сцены.
- Писать может любой знакомый НПС, даже если его нет в сцене. Повод — его жизнь или то, что случилось в сюжете.
- photo и description для фото — визуально: кто, внешность, одежда, поза, место, свет. photo у поста необязателен.
- Если игрок написал кому-то с телефона и ему не ответили — этот НПС отвечает (message_received), когда может.
- Телефонная жизнь влияет на сцену: персонажи помнят переписку и посты.`;

/** Message is outgoing if it came from the user, either field works. */
function isOutgoing(m) {
    if (m.from === 'me') return true;
    if (m.from === 'them') return false;
    return Boolean(m.fromUser);
}

/** Настройки расширения (живость). */
function phoneSettings() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        return ctx?.extensionSettings?.['astral-phone'] || {};
    } catch {
        return {};
    }
}

/** Через сколько ответов без событий подтолкнуть модель. */
const NUDGE_AFTER = { calm: 14, normal: 7, busy: 3 };

const cut = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Pure: build the context block from a phone state snapshot.
 * @param {object} state phone state
 * @returns {string}
 */
export function buildPhoneContext(state, storageRef, settings = phoneSettings()) {
    if (state?.quietMode) {
        return '[Телефон — беззвучный режим] Сейчас не добавляй входящие phone-event (смс, посты, реакции). photo_taken можно.';
    }

    const msgs = Array.isArray(state?.messages) ? state.messages : [];
    const social = Array.isArray(state?.social) ? state.social : [];
    const parts = [];

    // Контакты: кто вообще есть в телефоне — чтобы модель знала, кому писать.
    const contacts = [];
    for (let i = msgs.length - 1; i >= 0 && contacts.length < 8; i--) {
        const name = String(msgs[i]?.character || '').trim();
        if (name && !contacts.includes(name)) contacts.push(name);
    }
    if (contacts.length) parts.push(`Контакты: ${contacts.join(', ')}`);

    // Последние сообщения — коротко.
    const recent = msgs.slice(-6).map((m) => {
        const who = m.character || 'Контакт';
        return isOutgoing(m) ? `Игрок → ${who}: ${cut(m.text, 110)}` : `${who}: ${cut(m.text, 110)}`;
    });
    if (recent.length) parts.push(`Переписка (последнее):\n${recent.join('\n')}`);

    // Кто ждёт ответа: последний сообщение в треде — от игрока.
    const lastByThread = new Map();
    for (const m of msgs) {
        const name = String(m?.character || '').trim();
        if (name) lastByThread.set(name, m);
    }
    const waiting = [...lastByThread.entries()].filter(([, m]) => isOutgoing(m)).map(([n]) => n);
    if (waiting.length) parts.push(`Ждут ответа игроку: ${waiting.slice(0, 4).join(', ')}`);

    // Соцсеть: последний пост игрока и пара свежих чужих.
    const mine = [...social].reverse().find(p => p.mine || p.isOwn);
    if (mine) {
        const likes = mine.likedBy?.length || mine.likes || 0;
        const replies = mine.replies?.length || 0;
        parts.push(`Последний пост игрока: «${cut(mine.text, 90)}» (❤${likes}, 💬${replies})`);
    }
    const others = social.filter(p => !(p.mine || p.isOwn)).slice(-2)
        .map(p => `${p.author}: «${cut(p.text, 70)}»`);
    if (others.length) parts.push(`Лента: ${others.join('; ')}`);

    try {
        const castBlock = buildCastPromptBlock(storageRef, 5);
        if (castBlock) parts.push(castBlock);
    } catch (_) { /* ignore */ }

    // Подталкивание: телефон давно молчит — пусть мир напомнит о себе.
    const level = NUDGE_AFTER[settings?.liveliness] ? settings.liveliness : 'normal';
    const sinceEvent = Number(state?.sinceEvent) || 0;
    if (sinceEvent >= NUDGE_AFTER[level]) {
        parts.push(`Телефон молчит уже ${sinceEvent} ответов — если уместно, пусть кто-то напишет или запостит.`);
    }

    if (!parts.length) return '';
    return `[Телефон — сейчас]\n${parts.join('\n')}`;
}

/**
 * Push the current phone summary into the prompt via setExtensionPrompt.
 * Safe to call often — it only builds a short string.
 */
export function refreshPhonePrompt(storage) {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context || typeof context.setExtensionPrompt !== 'function' || !storage) return;

    try {
        const state = storage.getState();
        context.setExtensionPrompt(
            'astral-phone-context',
            buildPhoneContext(state, storage),
            context.extension_prompt_types?.IN_CHAT ?? 1,
            1,
            false,
        );
    } catch (err) {
        console.warn('[Astral Phone] dynamic prompt refresh failed:', err);
    }
}
