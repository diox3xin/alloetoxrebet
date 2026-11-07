/**
 * CharacterGen — генерация контента «от лица персонажа» для приложений телефона.
 *
 * Один вход для трёх задач: пост в соцсети, заметка, сообщение. Отличие от
 * generateQuietPrompt напрямую в том, что здесь задаётся жёсткая рамка
 * (только текст, без предисловий, на языке сцены) и есть разбор участников
 * сюжета — чтобы модель выбирала реальных персонажей, а не выдумывала имена.
 */

import { ask } from './prompt-llm.js';

/* ─────────────────────────── участники сюжета ─────────────────────────── */

/**
 * Кто есть в сюжете: карточка персонажа, юзер и все, кто встречался в чате.
 * Имена вытаскиваются из текста сообщений — так в список попадают и НПС.
 *
 * @param {object} ctx контекст SillyTavern
 * @returns {{charName: string, userName: string, cast: string[]}}
 */
export function collectCast(ctx) {
    const charName = resolveName(ctx, 'char');
    const userName = resolveName(ctx, 'user');

    const known = new Set();
    if (charName) known.add(charName);
    if (userName) known.add(userName);

    // имена из карточки: description и scenario часто содержат «Имя — роль»
    try {
        const card = ctx?.characters?.[ctx?.characterId] || {};
        const text = `${card.description || ''} ${card.scenario || ''} ${card.personality || ''}`;
        for (const m of text.matchAll(/\b([A-ZА-ЯЁ][a-zа-яё]{2,15})\b/g)) {
            const name = m[1];
            if (/^(Она|Он|Оно|Это|Тот|Эта|Все|Они|Ты|Вы|The|And|But|She|He|They)$/i.test(name)) continue;
            known.add(name);
        }
    } catch (_) { /* ignore */ }

    // имена из переписки телефона
    try {
        const state = globalThis.__astralPhoneCore?.storage?.getState?.() || {};
        for (const m of (state.messages || [])) {
            if (m.character) known.add(String(m.character).trim());
        }
    } catch (_) { /* ignore */ }

    // убираем мусор и себя
    const cast = [...known]
        .map(n => String(n).trim())
        .filter(n => n && n.length <= 24)
        .filter(n => !/sillytavern/i.test(n))
        .filter((n, i, arr) => arr.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i);

    return { charName, userName, cast };
}

/** Имя из карточки, с защитой от «SillyTavern System». */
export function resolveName(ctx, which) {
    if (which === 'char') {
        const fromCard = String(ctx?.characters?.[ctx?.characterId]?.name || '').trim();
        const fallback = String(ctx?.name2 || '').trim();
        const pick = fromCard || fallback;
        if (!pick || /sillytavern/i.test(pick)) return fromCard || 'Персонаж';
        return pick;
    }
    const pick = String(ctx?.name1 || '').trim();
    return (!pick || /sillytavern/i.test(pick)) ? 'Ты' : pick;
}

/** Последние сообщения сцены как контекст. */
export function sceneContext(ctx, limit = 4, chars = 500) {
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    const lines = chat
        .filter(m => m && !m.is_system && typeof m.mes === 'string')
        .slice(-limit)
        .map(m => {
            const who = m.is_user ? resolveName(ctx, 'user') : (m.name || resolveName(ctx, 'char'));
            const text = String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, chars);
            return `${who}: ${text}`;
        })
        .filter(Boolean);
    return lines.join('\n') || '(сцена только начинается)';
}

/* ─────────────────────────── очистка вывода ─────────────────────────── */

/**
 * Модель любит добавлять предисловия, кавычки и подписи. Здесь оставляем
 * только сам текст — он уходит прямо в интерфейс.
 */
export function cleanOutput(raw, maxLen = 400) {
    let text = String(raw || '').trim();
    if (!text) return '';

    text = text.replace(/```[a-z]*\n?/gi, '').trim();
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/^\[[A-Z_]{3,}[^\]]*\]\s*/g, '');

    // убираем типичные ярлыки модели
    text = text.replace(/^(пост|заметка|запись|сообщение|text|post|note|output|answer)\s*[:：]\s*/i, '');
    // убираем обрамляющие кавычки
    text = text.replace(/^["'«„]/, '').replace(/["'»“]$/, '');
    // убираем подпись вида «— Мира» в конце, если она дублирует автора
    text = text.replace(/\s*[—–-]\s*[A-ZА-ЯЁ][\wА-Яа-яЁё]{1,15}\s*$/, '');

    return text.trim().slice(0, maxLen);
}

/* ─────────────────────────── генерация поста ─────────────────────────── */

/**
 * Пост в соцсеть от лица выбранного персонажа.
 *
 * @param {object} ctx
 * @param {{author?: string}} opts если author не задан — модель выбирает из состава сцены
 * @returns {Promise<{author: string, text: string}>}
 */
export async function generateSocialPost(ctx, opts = {}) {
    const { charName, userName, cast } = collectCast(ctx);
    const scene = sceneContext(ctx);

    const others = cast.filter(n => n !== userName);
    const requested = String(opts.author || '').trim();

    const whoRule = requested
        ? `Write the post as "${requested}".`
        : `Pick ONE character from this cast who would plausibly post right now: ${others.join(', ')}.
Prefer someone whose current state in the scene makes a post natural. Return their name in the first line of your answer as "${'AUTHOR'}: name".`;

    const prompt = `You write social-media posts for a roleplay.

SCENE (what is happening right now):
${scene}

${whoRule}

RULES:
- Write in the SAME LANGUAGE as the scene. Russian scene → Russian post.
- 1-3 short sentences. Casual, first person, like a real tweet.
- In character: their voice, their mood, their preoccupations.
- No hashtags unless they fit, no emoji spam (max one).
- No quotes around the text, no "Post:" label, no explanation.
- Do NOT mention that this is a roleplay, phone, or app.

${requested ? 'TEXT:' : 'AUTHOR: <name>\nTEXT:'}`;

    const raw = await ask(prompt, {
        system: 'You write short in-character social media posts. You never explain or narrate.',
        responseLength: 300,
    });

    let author = requested;
    let body = String(raw);

    // Модель иногда возвращает «AUTHOR: имя» даже когда автор задан явно —
    // эту строку надо срезать в любом случае, иначе она попадёт в пост.
    const authorLine = String(raw).match(/^\s*AUTHOR\s*[:：]\s*(.+)$/im);
    if (authorLine) {
        body = String(raw).replace(authorLine[0], '');
        if (!requested) {
            const parsed = cleanOutput(authorLine[1], 40).replace(/[,.].*$/, '').trim();
            const match = cast.find(n => n.toLowerCase() === parsed.toLowerCase());
            author = match || others[0] || charName;
        }
    }

    if (!author) author = others[0] || charName;

    return { author, text: cleanOutput(body, 400) };
}

/* ─────────────────────────── генерация заметки ─────────────────────────── */

/**
 * Приватная запись персонажа. Ключевое: это внутренний голос, не пост и не
 * сообщение — модель об этом прямо предупреждается, иначе получается
 * публичное «я устал», вместо честного дневника.
 *
 * @param {object} ctx
 * @param {{kind?: 'diary'|'plan'|'secret'|'note', count?: number}} opts
 * @returns {Promise<Array<{kind: string, title: string, text: string}>>}
 */
export async function generateNotes(ctx, opts = {}) {
    const kinds = ['diary', 'plan', 'secret', 'note'];
    const kind = kinds.includes(opts.kind) ? opts.kind : 'diary';
    const count = Math.max(1, Math.min(3, Number(opts.count) || 1));

    const { charName, userName } = collectCast(ctx);
    const scene = sceneContext(ctx);

    /*
     * Заметка всегда ПРО юзера — иначе модель уходит в абстрактные
     * размышления о себе. Угол задаётся по типу записи, и {{user}}
     * подставляется в инструкцию явно, чтобы он был в каждом варианте.
     */
    const angles = {
        diary: `What ${userName} means to ${charName} right now — what ${charName} felt about ${userName} today, what ${userName} said or did that stuck.`,
        plan: `What ${charName} plans to do about ${userName} — what ${charName} intends to tell, ask or do to ${userName} next.`,
        secret: `What ${charName} hides from ${userName} — something ${charName} would never say to ${userName} out loud.`,
        note: `What ${charName} thinks about ${userName} in this exact minute — a passing thought about ${userName}.`,
    };

    const prompt = `You write a PRIVATE note in the voice of ${charName}.

Nobody will ever read this. ${charName} writes it for ${charName} alone.

SCENE (what is happening right now):
${scene}

ANGLE FOR THIS NOTE:
${angles[kind]}

TASK: write ${count === 1 ? 'this note' : `${count} variants of this note`} about ${userName}.

RULES:
- ${userName} MUST be the subject. Every sentence should be about ${userName} or addressed to ${userName}.
- Refer to ${userName} by name (${userName}) or as "you" if writing it like a letter.
- Write in the SAME LANGUAGE as the scene. Russian scene → Russian note.
- First person, ${charName}'s own voice and vocabulary.
- Be concrete: reference what ${userName} actually said or did in the scene, not generic feelings.
- 1-4 sentences per note. ${count > 1 ? 'Variants must differ in what they focus on.' : ''}
- ${kind === 'secret' ? `This is hidden — write what ${charName} would never tell ${userName}.` : `Honest, but not necessarily dark.`}
- No labels, no quotes, no bullet points, no explanation.

Return ONLY the ${count > 1 ? 'notes separated by a line containing only ---' : 'note text'}.`;

    const raw = await ask(prompt, {
        system: `You write private in-character notes about the player character. You never explain or add commentary.`,
        responseLength: 500,
    });

    const chunks = String(raw).split(/^\s*---\s*$/m).map(c => cleanOutput(c, 600)).filter(Boolean);
    const texts = chunks.length ? chunks : [cleanOutput(raw, 600)];

    return texts.slice(0, count).map(text => ({
        kind,
        title: '',
        text,
    }));
}

/* ─────────────────────────── генерация сообщения ─────────────────────────── */

/**
 * Входящее сообщение от персонажа — для кнопки «написать мне».
 *
 * @param {object} ctx
 * @param {{character: string, thread?: Array}} opts
 * @returns {Promise<string>}
 */
export async function generateMessage(ctx, opts = {}) {
    const character = String(opts.character || '').trim() || collectCast(ctx).charName;
    const thread = (opts.thread || []).slice(-8)
        .map(m => `${m.from === 'me' ? 'Ты' : character}: ${m.text}`)
        .join('\n');

    const prompt = `You write a text message from ${character} to the user.

${thread ? `RECENT CONVERSATION:\n${thread}\n` : ''}
SCENE (broader context):
${sceneContext(ctx, 3, 300)}

TASK: write ONE short message ${character} sends right now.

RULES:
- Same language as the scene.
- 1-2 sentences, casual, like a real text.
- In character — their way of typing, their mood.
- No quotes, no name prefix, no explanation.

MESSAGE:`;

    const raw = await ask(prompt, {
        system: 'You write short in-character text messages. You never explain.',
        responseLength: 200,
    });

    return cleanOutput(raw, 300);
}

/* ─────────────────────────── индикатор «печатает» ─────────────────────────── */

/**
 * Показывает «<имя> печатает…» и возвращает функцию для снятия.
 *
 * Ставится в поток документа, а не внутрь приложения: генерация может
 * закончиться после перерисовки, и тогда удалять было бы нечего.
 *
 * @param {string} name
 * @param {{container?: HTMLElement}} [opts] куда вставить (по умолчанию — тело телефона)
 * @returns {() => void} остановить
 */
export function showTyping(name, opts = {}) {
    const host = opts.container
        || document.querySelector('.astral-phone-body')
        || document.querySelector('.astral-phone');
    if (!host) return () => {};

    const el = document.createElement('div');
    el.className = 'astral-typing';
    el.dataset.typing = '1';
    el.innerHTML = `
        <span class="astral-typing-name">${escapeHtml(name)}</span>
        <span class="astral-typing-word">печатает</span>
        <span class="astral-typing-dots"><i></i><i></i><i></i></span>
    `;

    host.appendChild(el);

    let stopped = false;
    return () => {
        if (stopped) return;
        stopped = true;
        el.classList.add('astral-typing--out');
        setTimeout(() => el.remove(), 220);
    };
}

/** Индикатор в конкретной карточке поста (для соцсети). */
export function showTypingInCard(card, name) {
    if (!card) return () => {};
    const el = document.createElement('div');
    el.className = 'astral-typing astral-typing--inline';
    el.innerHTML = `
        <span class="astral-typing-name">${escapeHtml(name)}</span>
        <span class="astral-typing-word">печатает</span>
        <span class="astral-typing-dots"><i></i><i></i><i></i></span>
    `;
    card.appendChild(el);
    return () => el.remove();
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}