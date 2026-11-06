/**
 * PromptBuilder — синтез Haruspics + сцена РП → промпт NovelAI v5.
 *
 * Ключевая идея: модель НЕ пишет финальный промпт. Она возвращает строгий JSON
 * с короткими английскими тегами, описывающими только то, что зависит от сцены
 * (поза, эмоция, действие, взгляд, тип кадра). Всё, что можно взять из Haruspics
 * (стиль, внешность персонажей, лорбуки, негатив) — берётся из Haruspics в коде.
 *
 * Финальная строка собирается здесь, поэтому:
 *  - русский текст физически не может попасть в промпт (нет свободного текста);
 *  - стиль и внешность гарантированно на месте;
 *  - формат NovelAI v5 (`base | char1 | char2`) соблюдается всегда.
 *
 * Формат v5:
 *   <scene tags>, <quality tags> | <gender>, <position>, <name>, <appearance>,
 *   <outfit>, <expression>, <action>, <gaze> | ...
 */

const MODULE = '[AstralPrompt]';

/** Стандартные quality-теги NovelAI. */
export const QUALITY_TAGS = 'masterpiece, best quality, very aesthetic, absurdres, highly detailed';

/** Дефолтные негативы под фото-сцену на телефоне. */
export const DEFAULT_NEGATIVE = 'lowres, bad anatomy, bad hands, text, watermark, logo, '
    + 'blurry, jpeg artifacts, worst quality, low quality, deformed, '
    + 'extra limbs, extra fingers, cropped, out of frame';

/* ─────────────────────────── Haruspics ─────────────────────────── */

/* ─────────────────────────── обход настроек ─────────────────────────── */

/** Обход объекта настроек по структуре, а не по угаданным ключам. */
function deepWalk(root, visit, maxDepth = 5) {
    const seen = new WeakSet();
    const walk = (node, depth, path) => {
        if (!node || typeof node !== 'object' || depth > maxDepth) return;
        if (seen.has(node)) return;
        seen.add(node);
        visit(node, depth, path);
        for (const [k, v] of Object.entries(node)) {
            if (v && typeof v === 'object') walk(v, depth + 1, path ? `${path}.${k}` : k);
        }
    };
    walk(root, 0, '');
}

const TEXT_KEYS = ['text', 'prompt', 'content', 'value', 'description'];

/** Первое непустое строковое поле из списка. */
function firstText(obj, keys = TEXT_KEYS) {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** Нормализация имени для сравнения: без расширения, регистра, разделителей. */
function normName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\.[a-z0-9]{2,5}$/, '')
        .replace(/[_\s-]+/g, ' ')
        .trim();
}

/* ─────────────────────────── стиль ─────────────────────────── */

/**
 * Ищет активный стиль. Haruspics хранит id активного пресета и массив пресетов,
 * но имена полей зависят от версии, поэтому проверяем несколько вариантов:
 * прямые строковые поля → id + массив → единственный включённый → единственный.
 */
function findStyle(raw) {
    if (!raw) return '';

    // прямые строковые поля
    for (const k of ['style', 'artStyle', 'activeStyle', 'stylePreset', 'promptPrefix']) {
        const v = raw[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }

    // массивы пресетов
    const presetArrays = [];
    for (const [k, v] of Object.entries(raw)) {
        if (!Array.isArray(v) || !/style|preset/i.test(k)) continue;
        const items = v.filter(x => x && typeof x === 'object' && firstText(x));
        if (items.length) presetArrays.push(items);
    }

    // id → элемент массива
    for (const k of Object.keys(raw)) {
        if (!/^active.*(style|preset)/i.test(k)) continue;
        const id = String(raw[k] || '').trim();
        if (!id) continue;
        for (const items of presetArrays) {
            const hit = items.find(x => String(x.id || x.key || x.name || '') === id);
            const text = firstText(hit);
            if (text) return text;
        }
    }

    // единственный включённый / единственный существующий
    const all = presetArrays.flat();
    const enabled = all.filter(x => x.enabled === true || x.active === true || x.selected === true);
    if (enabled.length === 1) return firstText(enabled[0]);
    if (all.length === 1) return firstText(all[0]);

    return '';
}

/* ─────────────────────────── внешность ─────────────────────────── */

/**
 * Собирает записи о внешности из библиотеки персонажей.
 *
 * Ключевой момент: Haruspics индексирует записи по имени файла аватарки
 * (`avatar:Mira.png`) или по имени персоны, а человеческое имя лежит в
 * `displayName`. Поэтому сравнение идёт и по ключу, и по displayName.
 */
function findAppearanceEntries(raw) {
    const entries = [];
    const seenNodes = new WeakSet();

    deepWalk(raw, (node, depth, path) => {
        if (!Array.isArray(node.appearanceItems) || seenNodes.has(node)) return;
        seenNodes.add(node);

        const segs = String(path || '').split('.').filter(Boolean);
        const key = segs[segs.length - 1] || '';
        const displayName = String(node.displayName || '').trim() || key;

        const texts = [];
        const refs = [];
        for (const item of node.appearanceItems) {
            if (!item || item.enabled === false) continue;
            if (item.type === 'image') {
                const p = String(item.imagePath || item.path || '').trim();
                if (p) refs.push(p);
            }
            const d = firstText(item);
            if (d) texts.push(d);
        }

        if (!texts.length && !refs.length) return;
        entries.push({ key, displayName, texts, refs });
    });

    // старый формат: characterReferenceDescriptions.characters[name] = "строка"
    const legacy = raw?.characterReferenceDescriptions;
    if (legacy && typeof legacy === 'object') {
        for (const bucket of ['characters', 'users']) {
            const bag = legacy[bucket];
            if (!bag || typeof bag !== 'object') continue;
            for (const [k, v] of Object.entries(bag)) {
                const text = typeof v === 'string' ? v.trim() : '';
                if (!text) continue;
                const displayName = String(legacy.displayNames?.[bucket]?.[k] || '').trim() || k;
                entries.push({ key: k, displayName, texts: [text], refs: [] });
            }
        }
    }

    return entries;
}

/** Выбирает запись по имени персонажа, имени файла аватарки или частичному совпадению. */
function pickEntry(entries, ...hints) {
    if (!entries.length) return null;
    const targets = hints.map(normName).filter(Boolean);

    for (const t of targets) {
        const exactDisplay = entries.find(e => normName(e.displayName) === t);
        if (exactDisplay) return exactDisplay;
    }
    for (const t of targets) {
        const exactKey = entries.find(e => normName(e.key) === t);
        if (exactKey) return exactKey;
    }
    for (const t of targets) {
        const partial = entries.find(e =>
            normName(e.displayName).includes(t) || normName(e.key).includes(t));
        if (partial) return partial;
    }
    return null;
}

/* ─────────────────────────── лорбуки ─────────────────────────── */

function findLorebook(raw) {
    const out = [];
    const seen = new WeakSet();

    deepWalk(raw, (node) => {
        if (!Array.isArray(node.refs) || seen.has(node)) return;
        seen.add(node);
        if (node.enabled === false) return;
        for (const ref of node.refs) {
            if (!ref || ref.enabled === false) continue;
            const desc = firstText(ref);
            if (!desc) continue;
            const name = String(ref.name || '').trim();
            out.push(name ? `${name}, ${desc}` : desc);
        }
    });

    // плоский список дополнительных референсов
    if (Array.isArray(raw?.additionalReferences)) {
        for (const ref of raw.additionalReferences) {
            if (!ref || ref.enabled === false) continue;
            const desc = firstText(ref);
            if (!desc) continue;
            const name = String(ref.name || '').trim();
            out.push(name ? `${name}, ${desc}` : desc);
        }
    }

    return [...new Set(out)];
}

/* ─────────────────────────── диагностика ─────────────────────────── */

/**
 * Компактное дерево настроек — печатается, только если ничего не нашлось.
 * Нужно, чтобы не угадывать имена полей, а увидеть их.
 */
export function dumpSettingsShape(raw, maxLines = 140) {
    const lines = [];
    const seen = new WeakSet();

    const walk = (node, depth, path) => {
        if (!node || typeof node !== 'object' || depth > 3 || lines.length >= maxLines) return;
        if (seen.has(node)) return;
        seen.add(node);

        for (const [k, v] of Object.entries(node)) {
            if (lines.length >= maxLines) return;
            const p = path ? `${path}.${k}` : k;

            if (Array.isArray(v)) {
                const sample = v.find(x => x && typeof x === 'object');
                lines.push(`${p}[] n=${v.length}${sample ? ` {${Object.keys(sample).slice(0, 8).join(',')}}` : ''}`);
                if (sample) walk(sample, depth + 1, `${p}[0]`);
            } else if (v && typeof v === 'object') {
                lines.push(`${p}{} {${Object.keys(v).slice(0, 10).join(',')}}`);
                walk(v, depth + 1, p);
            } else if (typeof v === 'string' && v.trim()) {
                lines.push(`${p} = "${v.slice(0, 40)}"`);
            } else if (typeof v === 'boolean' || typeof v === 'number') {
                lines.push(`${p} = ${v}`);
            }
        }
    };

    walk(raw, 0, '');
    return lines;
}

/* ─────────────────────────── Haruspics ─────────────────────────── */

/**
 * Собирает всё, что расширение картинок может дать телефону.
 * Никогда не бросает — при отсутствии Haruspics возвращает пустой набор.
 */
export function collectHaruspics(imageGen, ctx) {
    const empty = {
        available: false,
        style: '',
        negative: '',
        refInstruction: '',
        chars: [],
        lorebook: [],
        sendCharAvatar: false,
        sendUserAvatar: false,
    };

    let raw = null;
    try {
        raw = imageGen?._rawSettings?.() || null;
    } catch (_) { /* ignore */ }
    if (!raw) return empty;

    const charName = resolveCharName(ctx);
    const userName = resolveUserName(ctx);
    const avatarHint = String(ctx?.characters?.[ctx?.characterId]?.avatar || '').trim();

    const out = { ...empty, available: true };

    /* ── стиль ── */
    out.style = findStyle(raw);

    /* ── негатив ── */
    try {
        const items = Array.isArray(raw.negativeGalleryItems) ? raw.negativeGalleryItems : [];
        if (items.length) {
            const activeId = String(raw.activeNegativeId || '').trim();
            const active = items.find(i => i.id === activeId)
                || items.find(i => i.enabled === true || i.active === true);
            out.negative = firstText(active) || '';
        }
    } catch (_) { /* ignore */ }

    /* ── инструкция к референсам ── */
    if (raw.refInstructionEnabled !== false) {
        out.refInstruction = String(raw.refInstruction || '').trim();
    }

    /* ── внешность ── */
    const entries = findAppearanceEntries(raw);

    const charEntry = pickEntry(entries, charName, avatarHint);
    if (charEntry) {
        out.chars.push({
            name: charName,
            appearance: charEntry.texts.join(', ').replace(/,\s*,/g, ',').trim(),
            refs: charEntry.refs,
        });
    }

    const userEntry = pickEntry(entries, userName);
    if (userEntry && userEntry !== charEntry) {
        out.chars.push({
            name: userName,
            appearance: userEntry.texts.join(', ').replace(/,\s*,/g, ',').trim(),
            refs: userEntry.refs,
        });
    }

    /* ── лорбуки ── */
    out.lorebook = findLorebook(raw);

    /* ── аватарки как референсы ── */
    out.sendCharAvatar = Boolean(raw.sendCharAvatar);
    out.sendUserAvatar = Boolean(raw.sendUserAvatar);

    console.log(`${MODULE} Haruspics: style=${out.style ? 'yes' : 'no'} `
        + `chars=${out.chars.length} (entries=${entries.length}) `
        + `lorebook=${out.lorebook.length} neg=${out.negative ? 'yes' : 'no'}`);

    // Ничего не нашлось — печатаем реальную структуру, чтобы починить точно
    if (!out.style && !out.chars.length && !out.lorebook.length) {
        console.warn(`${MODULE} ничего не найдено. Реальная структура inline_image_gen:`);
        for (const line of dumpSettingsShape(raw)) console.warn(`  ${line}`);
    }

    return out;
}

/* ─────────────────────────── имена ─────────────────────────── */

/** `ctx.name2` иногда содержит "SillyTavern System" — предпочитаем карточку. */
export function resolveCharName(ctx) {
    const fromCard = String(ctx?.characters?.[ctx?.characterId]?.name || '').trim();
    const fallback = String(ctx?.name2 || '').trim();
    const pick = fromCard || fallback;
    if (!pick || /sillytavern/i.test(pick)) return fromCard || 'the character';
    return pick;
}

export function resolveUserName(ctx) {
    const pick = String(ctx?.name1 || '').trim();
    if (!pick || /sillytavern/i.test(pick)) return 'the viewer';
    return pick;
}

/* ─────────────────────────── запрос к модели ─────────────────────────── */

/**
 * Промпт для модели: строгий JSON, только сценозависимые теги.
 * Всё, что уже есть в Haruspics, помечается как «не описывать».
 */
export function buildAsk({ mode, charName, userName, sceneText, knownAppearance, customInstruction }) {
    const who = mode === 'selfie'
        ? `"${charName}" AND "${userName}" (both in frame)`
        : `"${charName}" (alone in frame, "${userName}" holds the camera and is NOT visible)`;

    const appearanceRule = knownAppearance
        ? `Appearance (hair, eyes, build, skin) is provided separately — do NOT include it.`
        : `No appearance data exists — fill hair, eyes, build, skin, outfit from the scene or the character card.`;

    const custom = customInstruction
        ? `\nUSER'S EXTRA GUIDANCE (follow it, but still answer as JSON):\n${customInstruction}\n`
        : '';

    return `You are an image-prompt tagger for NovelAI v5. You do not write prose.
You read a roleplay scene and return ONLY a JSON object of short English tags.

ROLEPLAY SCENE (may be in any language — read it, do not copy its language):
${sceneText}

What is being photographed: ${who}
${appearanceRule}${custom}
Return exactly this JSON shape, every value a short English tag string, lowercase, comma-separated tags inside each string:

{
  "shot": "camera framing, e.g. chest-up two-shot / close-up selfie / full body shot",
  "setting": "location and time, e.g. cozy kitchen, evening",
  "lighting": "light and mood, e.g. soft window light, warm colors, low contrast",
  "characters": [
    {
      "ref": "${charName}",
      "genderTag": "1girl or 1boy or 1other",
      "position": "e.g. left side",
      "hair": "",
      "eyes": "",
      "build": "",
      "skin": "",
      "outfit": "current clothing",
      "expression": "e.g. open mouth, smiling",
      "action": "e.g. hand gripping coffee cup",
      "gaze": "e.g. looking at ${userName} / looking at viewer"
    }
  ]
}

RULES:
- ENGLISH ONLY. No Cyrillic, no other scripts, no transliteration.
- Tags, not sentences. "long silver hair, blunt bangs" not "she has long silver hair".
- No quality tags, no style tags, no "masterpiece" — those are added separately.
- Reference characters by the exact names given ("${charName}", "${userName}").
- For selfie mode add both characters to the array and make the gaze "looking at viewer".
- Output the JSON only. No markdown fences, no commentary.`;
}

/* ─────────────────────────── парсинг ответа ─────────────────────────── */

/**
 * Достаёт JSON из ответа модели, срезая ```-заборы и болтовню вокруг.
 * Возвращает null, если структуру восстановить не удалось.
 */
export function parseStructured(raw) {
    let text = String(raw || '').trim();
    if (!text) return null;

    text = text.replace(/```[a-z]*\n?/gi, '').trim();

    // первый {...} блок
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    const candidate = text.slice(start, end + 1);
    try {
        const parsed = JSON.parse(candidate);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Array.isArray(parsed.characters)) parsed.characters = [];
        return parsed;
    } catch (_) {
        return null;
    }
}

/* ─────────────────────────── санитайзер тегов ─────────────────────────── */

/**
 * Приводит одно поле к безопасным английским тегам.
 * Кириллица, CJK, markdown и служебные блоки выбрасываются — не заменяются,
 * чтобы мусор не попал в изображение.
 */
export function cleanTags(value) {
    let s = String(value || '');
    if (!s) return '';

    s = s.replace(/```[a-z]*\n?/gi, ' ');
    s = s.replace(/<[^>]*>/g, ' ');
    s = s.replace(/\[[A-Z_]{3,}[^\]]*\]/g, ' ');
    s = s.replace(/^(tags?|prompt|description|answer)\s*:\s*/i, '');

    // выкидываем любые сегменты с не-латиницей
    const chunks = s
        .split(/[,;]\s*|\n+/)
        .map(c => c.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter(c => !/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(c))
        .filter(c => /[A-Za-z]{2,}/.test(c));

    return chunks.join(', ').trim();
}

/* ─────────────────────────── сборка v5 ─────────────────────────── */

/**
 * Собирает финальный промпт NovelAI v5.
 *
 * @param {object} structured результат parseStructured
 * @param {object} haruspics результат collectHaruspics
 * @param {{mode: string, charName: string, userName: string, customInstruction?: string}} opts
 * @returns {{prompt: string, negative: string}}
 */
export function assemble(structured, haruspics, opts) {
    const { mode, charName, userName } = opts;
    const h = haruspics || {};
    const st = structured || {};

    /* ── база ── */
    const base = [];

    if (h.style) base.push(cleanTags(h.style));

    const shot = cleanTags(st.shot) || (mode === 'selfie' ? 'close-up selfie' : 'candid photo, upper body shot');
    base.push(shot);

    if (mode === 'selfie') base.push('selfie, looking at viewer');
    else base.push('shot on smartphone, candid');

    // главные действия в базу — так v5 лучше связывает сцену
    for (const c of (st.characters || [])) {
        const nm = String(c.ref || '').trim();
        const act = cleanTags(c.action);
        if (nm && act) base.push(`${nm} ${act}`);
    }

    const setting = cleanTags(st.setting);
    if (setting) base.push(setting);

    const lighting = cleanTags(st.lighting);
    if (lighting) base.push(lighting);

    if (h.lorebook?.length) base.push(cleanTags(h.lorebook.join(', ')));

    base.push(QUALITY_TAGS);

    /* ── персонажи ── */
    const charBlocks = [];

    for (const c of (st.characters || [])) {
        const ref = String(c.ref || '').trim();
        if (!ref) continue;

        // Доверяем модели: кого она вернула, тот в кадре. В photo-режиме
        // userName не должен появляться, но если модель его описала —
        // значит он реально в сцене (например, two-shot).
        const tags = [];

        const gender = cleanTags(c.genderTag);
        if (gender) tags.push(gender);

        const pos = cleanTags(c.position);
        if (pos) tags.push(pos);

        tags.push(ref);

        // внешность: Haruspics побеждает сцену
        const known = (h.chars || []).find(x => x.name === ref);
        const knownAppearance = cleanTags(known?.appearance || '');
        if (knownAppearance) {
            tags.push(knownAppearance);
        } else {
            for (const k of ['hair', 'eyes', 'build', 'skin']) {
                const t = cleanTags(c[k]);
                if (t) tags.push(t);
            }
        }

        const outfit = cleanTags(c.outfit);
        if (outfit) tags.push(outfit);

        const expr = cleanTags(c.expression);
        if (expr) tags.push(expr);

        const action = cleanTags(c.action);
        if (action) tags.push(action);

        const gaze = cleanTags(c.gaze);
        if (gaze) tags.push(gaze);
        else if (mode === 'selfie') tags.push('looking at viewer');

        charBlocks.push(tags.filter(Boolean).join(', '));
    }

    const prompt = [base.filter(Boolean).join(', '), ...charBlocks.filter(Boolean)].join(' | ');
    const negative = h.negative ? cleanTags(h.negative) : DEFAULT_NEGATIVE;

    return { prompt, negative };
}

/* ─────────────────────────── фасад ─────────────────────────── */

/**
 * Полный цикл: собрать Haruspics → спросить модель → собрать промпт.
 *
 * @param {object} deps { imageGen, ctx, askModel, sceneText, mode, customInstruction }
 * @returns {Promise<{prompt: string, negative: string, structured: object|null, haruspics: object}>}
 */
export async function buildPhotoPrompt({ imageGen, ctx, askModel, sceneText, mode, customInstruction }) {
    const charName = resolveCharName(ctx);
    const userName = resolveUserName(ctx);
    const haruspics = collectHaruspics(imageGen, ctx);

    const knownAppearance = (haruspics.chars || []).some(x => x.name === charName && x.appearance);

    const ask = buildAsk({
        mode,
        charName,
        userName,
        sceneText,
        knownAppearance,
        customInstruction,
    });

    let structured = null;
    try {
        const raw = await askModel(ask);
        structured = parseStructured(raw);
        if (!structured) {
            console.warn(`${MODULE} model returned no parseable JSON:`, String(raw || '').slice(0, 200));
        }
    } catch (err) {
        console.warn(`${MODULE} model call failed:`, err?.message || err);
    }

    // Гарантируем, что основной персонаж в кадре, даже если модель его забыла
    if (!structured || !(structured.characters || []).some(c => c.ref === charName)) {
        structured = structured || {};
        structured.characters = Array.isArray(structured.characters) ? structured.characters : [];
        structured.characters.unshift({
            ref: charName,
            genderTag: '',
            position: mode === 'selfie' ? 'left side' : 'center',
            outfit: '',
            expression: '',
            action: '',
            gaze: mode === 'selfie' ? 'looking at viewer' : '',
        });
    }

    const { prompt, negative } = assemble(structured, haruspics, { mode, charName, userName });

    return { prompt, negative, structured, haruspics };
}