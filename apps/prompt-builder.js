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

import { loadCharacters, matchCharacters } from './character-book.js';

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
 * Ключ записи в библиотеке — ровно как в Haruspics (references.js:112-121):
 *   avatar:<avatar filename>  →  name:<name>  →  id:<index>
 * Раньше я искал по имени персонажа и всегда промахивался: записи лежат под
 * ключом `avatar:Mira.png`, а не `Mira`.
 */
export function charLibraryKey(character, fallbackIndex = 0) {
    const avatar = String(character?.avatar || '').trim();
    if (avatar) return `avatar:${avatar}`;
    const name = String(character?.name || '').trim();
    if (name) return `name:${name}`;
    return `id:${fallbackIndex}`;
}

/** Все ключи, под которыми может лежать запись персонажа. */
function candidateKeys(character, name, extra = []) {
    const keys = [];
    const avatar = String(character?.avatar || '').trim();
    if (avatar) {
        keys.push(`avatar:${avatar}`);
        // на случай если хранится без префикса или без расширения
        keys.push(avatar);
        keys.push(avatar.replace(/\.[a-z0-9]{2,5}$/i, ''));
        keys.push(`avatar:${avatar.replace(/\.[a-z0-9]{2,5}$/i, '')}`);
    }
    if (name) {
        keys.push(`name:${name}`);
        keys.push(name);
    }
    keys.push(...extra.filter(Boolean));
    return [...new Set(keys)];
}

/**
 * Внешность из записи библиотеки.
 *
 * Основной путь повторяет Haruspics: primary.description + текстовые
 * appearanceItems. Но формат библиотеки пережил несколько миграций
 * (descriptions[] / references[] → appearanceItems[]), поэтому в конце
 * работает «сборщик текста»: он вытаскивает любые человекочитаемые строки
 * из записи. Иначе заполненная в UI внешность молча теряется.
 */
function extractAppearance(entry) {
    if (!entry || typeof entry !== 'object') return { appearance: '', refs: [] };

    const parts = [];
    const refs = [];

    const pushText = (value) => {
        const s = String(value ?? '').replace(/\s+/g, ' ').trim();
        if (s && !parts.includes(s)) parts.push(s);
    };

    // primary — отдельный объект, не входит в appearanceItems
    const primary = entry.primary;
    if (primary && typeof primary === 'object' && primary.enabled !== false) {
        pushText(primary.description || primary.text);
        const p = String(primary.imagePath || '').trim();
        if (p) refs.push(p);
    }

    // текущий формат
    for (const item of (entry.appearanceItems || [])) {
        if (!item || typeof item !== 'object') continue;
        if (item.enabled === false) continue;
        if (item.type === 'image') {
            const p = String(item.imagePath || item.path || '').trim();
            if (p) refs.push(p);
            continue;
        }
        pushText(item.description || item.text);
    }

    // legacy: descriptions[] — массив строк или {text}
    for (const d of (entry.descriptions || [])) {
        if (typeof d === 'string') { pushText(d); continue; }
        if (d && typeof d === 'object' && d.enabled !== false) pushText(d.text || d.description);
    }

    // legacy: references[] — только текстовые описания
    for (const r of (entry.references || [])) {
        if (!r || typeof r !== 'object') continue;
        if (r.enabled === false) continue;
        const p = String(r.imagePath || '').trim();
        if (p) refs.push(p);
        pushText(r.description || r.text);
    }

    // страховка: если ничего не собрали — вытаскиваем человекочитаемые строки
    if (parts.length === 0) {
        const skipKey = /^(id|type|imagePath|path|name|displayName|mimeType|kind|source)$/i;
        const walk = (node, depth) => {
            if (!node || depth > 3) return;
            if (typeof node === 'string') return;
            if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
            if (typeof node !== 'object') return;
            for (const [k, v] of Object.entries(node)) {
                if (skipKey.test(k)) continue;
                if (typeof v === 'string') {
                    // отбрасываем служебные значения: пути, id, enum-токены
                    if (/[\/\\]/.test(v) && v.length < 200 && !/\s/.test(v)) continue;
                    if (/^[a-z0-9_-]{1,24}$/i.test(v)) continue;
                    pushText(v);
                } else if (v && typeof v === 'object') {
                    walk(v, depth + 1);
                }
            }
        };
        walk(entry, 0);
    }

    const appearance = parts.join(', ').replace(/,\s*,/g, ',').trim();
    return { appearance, refs: [...new Set(refs)] };
}

/** Достаёт запись из библиотеки по списку ключей, с мягким фолбэком. */
function lookupEntry(library, bucketName, keys, displayName) {
    const bucket = library?.[bucketName];
    if (!bucket || typeof bucket !== 'object') return null;

    for (const key of keys) {
        const hit = bucket[key];
        if (hit && typeof hit === 'object') return hit;
    }

    const all = Object.entries(bucket).filter(([, v]) => v && typeof v === 'object');
    const wanted = normName(displayName);

    // точное совпадение displayName
    if (wanted) {
        const byDisplay = all.find(([, v]) => normName(v.displayName) === wanted);
        if (byDisplay) return byDisplay[1];
    }

    // ключ без префикса и расширения
    if (wanted) {
        const bareOf = (k) => normName(String(k).split(':').pop());
        const byBare = all.find(([k]) => {
            const bare = bareOf(k);
            return bare === wanted || bare.includes(wanted) || wanted.includes(bare);
        });
        if (byBare) return byBare[1];
    }

    // ключ содержит имя персонажа где угодно
    if (wanted) {
        const bySubstring = all.find(([k]) => normName(k).includes(wanted));
        if (bySubstring) return bySubstring[1];
    }

    // единственная запись в бакете — берём её: почти всегда это и есть наш перс
    if (all.length === 1) {
        console.warn(`${MODULE} ключ не совпал, использую единственную запись bucket="${bucketName}": ${all[0][0]}`);
        return all[0][1];
    }

    return null;
}

/**
 * Активный аватар персоны — ключ юзера в Haruspics тоже строится от него.
 * Читаем из модуля personas, как это делает references.js:178-190.
 */
async function resolveUserAvatar() {
    try {
        const mod = await import('/scripts/personas.js');
        const avatar = String(mod?.user_avatar || '').trim();
        if (avatar) return avatar;
    } catch (_) { /* ignore */ }

    // запасной путь: активная персона из контекста
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const persona = String(ctx?.power_user?.persona || '').trim();
        if (persona) return persona;
    } catch (_) { /* ignore */ }

    return '';
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

    // активный аватар персоны: Haruspics строит ключ юзера от него
    let userAvatar = '';
    try {
        userAvatar = String(globalThis.SillyTavern?.getContext?.()?.user_avatar || '').trim();
    } catch (_) { /* ignore */ }
    if (!userAvatar) {
        try {
            userAvatar = String(raw.userAvatarFile || '').trim();
        } catch (_) { /* ignore */ }
    }

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

    /* ── внешность: собственный справочник расширения ── */
    try {
        const book = loadCharacters();
        const pick = (name) => {
            const wanted = String(name || '').trim().toLowerCase();
            if (!wanted) return null;
            return book.find(row => row.enabled
                && (row.name.toLowerCase() === wanted
                    || row.aliases.toLowerCase().split(',').map(a => a.trim()).includes(wanted)));
        };

        const charRow = pick(charName);
        if (charRow) out.chars.push({ name: charName, appearance: charRow.appearance, refs: [] });

        const userRow = pick(userName);
        if (userRow && userRow !== charRow) {
            out.chars.push({ name: userName, appearance: userRow.appearance, refs: [] });
        }

        if (book.length) {
            console.log(`${MODULE} справочник: ${book.length} записей, `
                + `совпало ${out.chars.length}`);
        }
    } catch (_) { /* ignore */ }

    /* ── лорбуки ── */
    out.lorebook = findLorebook(raw);

    /* ── аватарки как референсы ── */
    out.sendCharAvatar = Boolean(raw.sendCharAvatar);
    out.sendUserAvatar = Boolean(raw.sendUserAvatar);

    console.log(`${MODULE} Haruspics: style=${out.style ? 'yes' : 'no'} `
        + `chars=${out.chars.length} lorebook=${out.lorebook.length} `
        + `neg=${out.negative ? 'yes' : 'no'}`);

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
export function buildAsk({ mode, charName, userName, sceneText, knownCharacters, customInstruction }) {
    const who = mode === 'selfie'
        ? `"${charName}" AND "${userName}" (both in frame)`
        : `"${charName}" (alone in frame, "${userName}" holds the camera and is NOT visible)`;

    const locked = Array.isArray(knownCharacters) ? knownCharacters.filter(c => c?.name && c?.appearance) : [];

    // Залоченные персонажи: внешность задана пользователем и подставляется кодом.
    // Модель не должна её придумывать — иначе в промпт попадут противоречивые
    // описания и сгенерируется чужое лицо.
    let appearanceRule;
    if (locked.length) {
        const list = locked.map(c => `  - "${c.name}": ${c.appearance}`).join('\n');
        appearanceRule = `LOCKED APPEARANCE — these characters already have a fixed appearance.
You MUST leave hair, eyes, build and skin EMPTY ("") for them. Do not describe, guess,
paraphrase or contradict the appearance below. It is inserted into the prompt
automatically, word for word:
${list}

For any character NOT in that list, fill hair, eyes, build and skin from the scene.`;
    } else {
        appearanceRule = `No fixed appearance exists for anyone — fill hair, eyes, build and skin from the scene.`;
    }

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

        // Внешность. Для персонажей из справочника берём ТОЛЬКО текст
        // пользователя, дословно; поля модели (hair/eyes/build/skin) при этом
        // полностью игнорируются — так выдуманная внешность не просочится.
        const known = (h.chars || []).find(x => x.name === ref);
        const knownAppearance = known?.appearance ? String(known.appearance).trim() : '';
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

    let prompt = [base.filter(Boolean).join(', '), ...charBlocks.filter(Boolean)].join(' | ');

    // Страховка: даже если модель проигнорировала инструкцию и что-то описала,
    // её описание уже не попало в блок (там внешность из книги). Но она могла
    // вписать внешность в свободные поля — проверяем, что ключевые слова
    // пользователя реально присутствуют, и предупреждаем, если нет.
    for (const lockedChar of (h.chars || [])) {
        if (!lockedChar.appearance) continue;
        if (!prompt.includes(lockedChar.appearance)) {
            prompt = `${lockedChar.appearance}, ${prompt}`;
        }
    }

    // Триггер по имени: любые персонажи справочника, упомянутые в промпте,
    // получают свою внешность. Работает и для тех, кого модель не описала
    // (NPC в кадре), и для тех, кто уже есть в блоках — дублей не будет.
    try {
        const { appearance } = matchCharacters(prompt);
        const missing = appearance.filter(a => !prompt.toLowerCase().includes(a.toLowerCase()));
        if (missing.length) prompt = `${missing.join(', ')}, ${prompt}`;
    } catch (_) { /* ignore */ }

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

    const ask = buildAsk({
        mode,
        charName,
        userName,
        sceneText,
        knownCharacters: haruspics.chars || [],
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