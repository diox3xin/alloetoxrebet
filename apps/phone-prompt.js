/**
 * Builds the dynamic half of the phone prompt: the recent phone transcript,
 * social metrics, creator stats, and autonomous NPC activity rules.
 *
 * Kept separate from index.js so it can be unit-tested without booting the
 * whole extension (index.js has top-level side effects).
 */

import { buildNotesPromptBlock } from './notes.js';
import { buildCastPromptBlock } from './cast-profiles.js';

/** Message is outgoing if it came from the user, either field works. */
function isOutgoing(m) {
    if (m.from === 'me') return true;
    if (m.from === 'them') return false;
    return Boolean(m.fromUser);
}

/**
 * Собрать метрики социальных сетей из состояния.
 */
function buildSocialMetrics(state) {
    const social = state.social || [];
    const myPosts = social.filter(p => p.isOwn);
    const totalLikes = myPosts.reduce((sum, p) => sum + (p.likedBy?.length || p.likes || 0), 0);
    const followers = (state.socialFollowers || []).length;
    const following = (state.socialFollowing || []).length;
    const recentPosts = social.slice(-3).map(p =>
        `"${(p.text || '').slice(0, 40)}" от ${p.author} (❤${p.likedBy?.length || p.likes || 0}${p.replies?.length ? ` 💬${p.replies.length}` : ''})`
    );

    return { totalPosts: social.length, myPosts: myPosts.length, totalLikes, followers, following, recentPosts };
}

/**
 * Собрать метрики Creator Studio.
 */
function buildCreatorMetrics(state) {
    const creator = state.creator || {};
    return {
        subscribers: creator.subscribers || 0,
        revenue: creator.revenue || 0,
        totalPosts: (creator.posts || []).length,
    };
}

/**
 * Pure: build the context block from a phone state snapshot.
 * @param {object} state phone state (messages, sinceEvent)
 * @returns {string}
 */
export function buildPhoneContext(state, storageRef) {
    const msgs = Array.isArray(state?.messages) ? state.messages : [];
    const recent = msgs.slice(-24);

    // Quiet Mode: короткий блок вместо полного промпта
    if (state?.quietMode) {
        return `[Astral Phone — ПАУЗА]
Входящая активность телефона приостановлена пользователем. НЕ генерируй:
- входящие сообщения (message_received)
- посты НПС (social_post)
- лайки и комменты (social_like, social_comment, social_follow)
- донаты и подписчики (donation_received, subscriber_joined)
Телефон существует, photo_taken и note_written — по-прежнему работают.`;
    }

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

    const parts = [`[Astral Phone — переписка]\n${body}`];
    
    // Метрики социальных сетей
    try {
        const social = buildSocialMetrics(state);
        if (social.totalPosts > 0) {
            const metrics = [
                `Всего постов: ${social.totalPosts}`,
                social.followers > 0 ? `Подписчиков: ${social.followers}` : null,
                social.following > 0 ? `Подписок: ${social.following}` : null,
                social.totalLikes > 0 ? `Лайков на постах юзера: ${social.totalLikes}` : null,
                social.recentPosts.length ? `Последние посты: ${social.recentPosts.join('; ')}` : null,
            ].filter(Boolean).join('\n');
            parts.push(`[Astral Phone — Social]\n${metrics}`);
        }
    } catch (_) { /* ignore */ }
    
    // Метрики Creator Studio
    try {
        const creator = buildCreatorMetrics(state);
        if (creator.subscribers > 0 || creator.totalPosts > 0) {
            const metrics = [
                `Подписчиков: ${creator.subscribers}`,
                `Заработано: $${(creator.revenue || 0).toFixed(2)}`,
                `Постов опубликовано: ${creator.totalPosts}`,
            ].join('\n');
            parts.push(`[Astral Phone — Creator Studio]\n${metrics}`);
        }
    } catch (_) { /* ignore */ }

    // Заметки персонажа: он должен помнить, что сам записал — это его
    // приватные мысли, и они влияют на поведение в сцене.
    try {
        const notesBlock = buildNotesPromptBlock(state);
        if (notesBlock) parts.push(notesBlock);
    } catch (_) { /* ignore */ }

    // Анкеты персонажей: модель видит, кем были побочные лица, даже если
    // их нет в карточке — иначе она выдумывает их заново каждый раз.
    try {
        const castBlock = buildCastPromptBlock(storageRef);
        if (castBlock) parts.push(castBlock);
    } catch (_) { /* ignore */ }
    
    // ПРАВИЛА ДЛЯ АВТОНОМНЫХ НПС
    const npcRules = `[Astral Phone — автономная активность НПС]

НПС и персонажи могут взаимодействовать с телефоном САМОСТОЯТЕЛЬНО, когда это уместно по сцене:

SOCIAL — посты:
- НПС публикуют посты о своей жизни или реакциях на события
- Частота: 1-2 поста на 8-12 сообщений чата (рандомно)
- Тег: <phone-event type="social_post" character="Имя" description="текст поста" />

SOCIAL — лайки и комменты (только под постами юзера):
- НПС могут лайкнуть пост юзера: <phone-event type="social_like" character="Имя" description="" />
- НПС могут прокомментировать: <phone-event type="social_comment" character="Имя" description="текст комментария" />
- Лайки и комменты приходят через 1-3 сообщения после публикации поста юзера
- Частота: 1-3 реакции на новый пост, не из каждого сообщения

SOCIAL — подписки на юзера:
- НПС могут подписаться: <phone-event type="social_follow" character="Имя" description="" />
- Только когда это органично — после интересного поста или события в сцене

MESSAGES — сообщения:
- НПС пишут сообщения юзеру, если есть конкретная причина
- Частота: не чаще 1 сообщения на 10-15 сообщений чата
- Тег: <phone-event type="message_received" character="Имя" description="текст сообщения" />

CREATOR STUDIO — только если аккаунт активен:
- Подписчики: <phone-event type="subscriber_joined" count="N" />
- Донаты: <phone-event type="donation_received" amount="N" character="Имя фаната" />

ВАЖНО:
- Не спамить — события дополняют сцену, не заменяют её
- Один тег = одно событие
- НПС не знают о приватных заметках персонажа`;

    parts.push(npcRules);

    return parts.join('\n\n');
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
            buildPhoneContext(state, storage),
            context.extension_prompt_types?.IN_CHAT ?? 1,
            2,
            false,
        );
    } catch (err) {
        console.warn('[Astral Phone] dynamic prompt refresh failed:', err);
    }
}