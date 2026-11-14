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
    const totalLikes = myPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
    const recentPosts = social.slice(-3).map(p => 
        `"${(p.text || '').slice(0, 40)}" от ${p.author} (${p.likes || 0} лайков)`
    );
    
    return {
        totalPosts: social.length,
        myPosts: myPosts.length,
        totalLikes,
        recentPosts,
    };
}

/**
 * Собрать метрики Creator Studio.
 */
function buildCreatorMetrics(state) {
    const creator = state.creator || {};
    const account = creator.account || {};
    const posts = creator.posts || [];
    
    return {
        subscribers: account.subscribers || 0,
        balance: account.balance || 0,
        totalPosts: posts.length,
        totalEarned: account.totalEarned || 0,
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
                `Всего постов: ${social.totalPosts} (из них твоих: ${social.myPosts})`,
                social.totalLikes > 0 ? `Лайков на твоих постах: ${social.totalLikes}` : null,
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
                `Баланс: $${creator.balance.toFixed(2)}`,
                `Постов опубликовано: ${creator.totalPosts}`,
                creator.totalEarned > 0 ? `Всего заработано: $${creator.totalEarned.toFixed(2)}` : null,
            ].filter(Boolean).join('\n');
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

SOCIAL (посты):
- НПС публикуют посты о своей жизни или реакциях на события
- Частота: 1-2 поста на 8-12 сообщений чата (рандомно)
- Посты связаны с текущими событиями или их повседневной жизнью
- Тег: <phone-event type="social_post" character="Имя" description="текст поста" />

MESSAGES (сообщения):
- НПС пишут сообщения юзеру, если:
  * Что-то важное случилось в сцене и они хотят обсудить
  * Прошло время и они хотят узнать как дела
  * Есть конкретная причина связаться (план, встреча, вопрос)
- Частота: не чаще 1 сообщения на 10-15 сообщений чата
- Тег: <phone-event type="message_received" character="Имя" description="текст сообщения" />

CREATOR STUDIO (подписчики и донаты):
- Подписчики растут постепенно: <phone-event type="subscriber_joined" count="N" />
  * Когда персонаж публикует контент
  * Редко и рандомно (1-5 подписчиков)
- Донаты случаются редко: <phone-event type="donation_received" amount="N" from="Имя фаната" />
  * Малые суммы ($5-$50) чаще, крупные ($100+) очень редко
  * Обычно после публикации нового контента

ВАЖНО:
- Не спамить событиями — они дополняют сцену, а не заменяют её
- События должны быть уместны по контексту и времени
- НПС не знают о приватных заметках персонажа
- Один тег = одно событие, не группировать несколько в одном сообщении`;

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