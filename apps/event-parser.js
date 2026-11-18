/**
 * Разбор событий телефона, которые модель пишет в ответ.
 *
 * Модель может сообщить о событии двумя способами:
 *   1. вызвать инструмент `phone_event` (основной путь);
 *   2. написать в текст ответа тег `<phone-event ... />` (фоллбэк).
 *
 * Второй путь — основная причина «в чате есть, в телефоне пусто»: тег
 * дописывался в текст ответа, но не распознавался, и оставался в сообщении.
 *
 * Почему старый парсер не справлялся:
 *   - `([^>]*?)` обрывался на первом `>` — стрелка «->» в описании или
 *     сравнение «больше, чем» убивали событие наполовину;
 *   - атрибуты читались только в двойных кавычках — одинарные или совсем
 *     без кавычек давали пустой объект, и событие уходило в никуда;
 *   - если сообщение ещё не лежало в `context.chat`, событие отбрасывалось.
 *
 * Здесь разбор сделан как маленький конечный автомат: атрибуты читаются
 * по кавычкам любого вида, значение «заканчивается» на закрывающей кавычке
 * или на `>` перед следующим атрибутом.
 */

/** Имя тега, который пишет модель. */
const TAG_NAME = 'phone-event';

/**
 * Атрибуты события. `char`/`desc` — сокращения, которые модель тоже
 * использует; приводим к полным именам.
 */
const ATTR_ALIASES = {
    type: 'type',
    character: 'character',
    char: 'character',
    name: 'character',
    description: 'description',
    desc: 'description',
    text: 'description',
    title: 'title',
    kind: 'kind',
    amount: 'amount',
    count: 'count',
    photo: 'photo',
    image: 'photo',
    pic: 'photo',
};

/** События, которые телефон умеет принимать. */
export const KNOWN_EVENT_TYPES = new Set([
    'photo_taken',
    'message_received',
    'social_post',
    'social_like',
    'social_comment',
    'social_follow',
]);

/**
 * Найти открывающий тег `<phone-event` в тексте.
 * Возвращает индексы: `start` — с `<`, `openEnd` — после `>` (или после
 * `/>`), `selfClosing` — закрывающий ли это тег.
 */
function findOpenTag(text, from) {
    const lower = text.toLowerCase();
    const needle = `<${TAG_NAME}`;
    let idx = lower.indexOf(needle, from);
    while (idx !== -1) {
        const after = idx + needle.length;
        const next = text[after];
        // после имени тега обязательно пробел, `>` или `/`
        if (next === undefined || /[\s/>]/.test(next)) {
            const gt = text.indexOf('>', after);
            if (gt === -1) return null; // не закрыт — это не наш тег
            const selfClosing = text[gt - 1] === '/';
            return { start: idx, openEnd: gt + 1, selfClosing };
        }
        idx = lower.indexOf(needle, idx + 1);
    }
    return null;
}

/**
 * Разобрать одну пару «имя=значение» из тела тега.
 * Возвращает { name, value, next } либо null.
 */
function readAttr(body, pos) {
    // пропускаем пробелы
    let i = pos;
    while (i < body.length && /\s/.test(body[i])) i++;

    const nameStart = i;
    while (i < body.length && /[\w:-]/.test(body[i])) i++;
    if (i === nameStart) return null;

    const name = body.slice(nameStart, i);

    // пропускаем пробелы и знак =
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '=') return { name, value: '', next: i };
    i++;
    while (i < body.length && /\s/.test(body[i])) i++;

    const quote = body[i];
    if (quote === '"' || quote === "'") {
        const close = body.indexOf(quote, i + 1);
        if (close === -1) {
            // кавычка не закрыта — берём остаток до конца тела
            return { name, value: body.slice(i + 1), next: body.length };
        }
        return { name, value: body.slice(i + 1, close), next: close + 1 };
    }

    // без кавычек: значение кончается на `>` или на начале следующего атрибута
    const rest = body.slice(i);
    const nextAttr = rest.search(/\s+[\w:-]+\s*=/);
    let end;
    if (nextAttr !== -1) {
        end = i + nextAttr;
    } else {
        const gt = body.indexOf('>', i);
        end = gt === -1 ? body.length : gt;
    }
    return { name, value: body.slice(i, end).trim(), next: end };
}

/**
 * Разобрать тело тега (всё между `<phone-event` и `>`) в объект атрибутов.
 */
export function parseAttributes(body) {
    const raw = {};
    let pos = 0;
    while (pos < body.length) {
        const attr = readAttr(body, pos);
        if (!attr) break;
        const canonical = ATTR_ALIASES[attr.name.toLowerCase()];
        if (canonical) raw[canonical] = attr.value;
        pos = attr.next;
        if (pos <= attr.next && attr.next === 0) break;
    }
    return raw;
}

/**
 * Вытащить из текста все события телефона и убрать сами теги.
 *
 * @param {string} text текст сообщения модели
 * @returns {{events: Array<object>, text: string}} события и текст без тегов
 */
export function extractPhoneEvents(text) {
    const source = String(text ?? '');
    const events = [];
    let cursor = 0;
    let plain = '';

    while (cursor < source.length) {
        const tag = findOpenTag(source, cursor);
        if (!tag) {
            plain += source.slice(cursor);
            break;
        }

        plain += source.slice(cursor, tag.start);

        if (tag.selfClosing) {
            const body = source.slice(tag.start + 1 + TAG_NAME.length, tag.openEnd - 2);
            const attrs = parseAttributes(body);
            if (attrs.type) {
                events.push({
                    type: String(attrs.type).trim(),
                    character: (attrs.character || '').trim(),
                    description: (attrs.description || '').trim(),
                    title: (attrs.title || '').trim(),
                    kind: (attrs.kind || '').trim(),
                    amount: attrs.amount !== undefined ? Number(attrs.amount) : undefined,
                    count: attrs.count !== undefined ? Number(attrs.count) : undefined,
                    photo: (attrs.photo || '').trim(),
                });
            }
            cursor = tag.openEnd;
            continue;
        }

        // Открывающий/закрывающий тег: <phone-event ...> ... </phone-event>
        const closeIdx = source.toLowerCase().indexOf(`</${TAG_NAME}`, tag.openEnd);
        const bodyEnd = closeIdx === -1 ? source.length : closeIdx;
        const body = source.slice(tag.start + 1 + TAG_NAME.length, bodyEnd);

        const attrs = parseAttributes(body);
        if (attrs.type) {
            events.push({
                type: String(attrs.type).trim(),
                character: (attrs.character || '').trim(),
                description: (attrs.description || attrs.text || '').trim(),
                title: (attrs.title || '').trim(),
                kind: (attrs.kind || '').trim(),
                amount: attrs.amount !== undefined ? Number(attrs.amount) : undefined,
                count: attrs.count !== undefined ? Number(attrs.count) : undefined,
                    photo: (attrs.photo || '').trim(),
            });
        }

        cursor = closeIdx === -1 ? source.length : source.indexOf('>', closeIdx) + 1 || source.length;
    }

    return { events, text: plain.replace(/[ \t]+\n/g, '\n').trim() };
}

/**
 * Привести событие к виду, который понимает PhoneCore.handleEvent:
 * числовые поля — числа, лишние ключи выкинуты.
 */
export function normaliseEvent(event) {
    const out = {
        type: String(event.type || '').trim(),
        character: String(event.character || '').trim(),
        description: String(event.description || '').trim(),
    };
    if (event.title) out.metadata = { ...(out.metadata || {}), title: String(event.title) };
    if (event.kind) out.metadata = { ...(out.metadata || {}), kind: String(event.kind) };
    if (Number.isFinite(event.amount)) out.metadata = { ...(out.metadata || {}), amount: event.amount };
    if (Number.isFinite(event.count)) out.metadata = { ...(out.metadata || {}), count: event.count };
    if (event.photo) out.photo = String(event.photo).trim();
    return out;
}
