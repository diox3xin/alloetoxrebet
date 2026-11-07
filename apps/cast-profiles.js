/**
 * CastProfiles — маленькие анкеты персонажей, которые модель ведёт сама.
 *
 * Раз в N сообщений (настраивается) модель перечитывает свежий кусок РП и
 * обновляет компактные карточки: кто это, как относится к юзеру, что движет,
 * что происходит с ним сейчас. Карточки хранятся в состоянии чата и
 * подставляются в промпт — так персонажи не «забывают» побочных лиц,
 * которых модель никогда не видела в карточке.
 *
 * Анкеты намеренно крошечные (по несколько коротких полей), иначе они
 * раздувают контекст сильнее, чем помогают.
 */

import { ask } from './prompt-llm.js';
import { resolveName } from './character-gen.js';

const MODULE = '[AstralCast]';

/** Сколько сообщений по умолчанию между анализами. */
export const DEFAULT_INTERVAL = 5;

/* ─────────────────────────── настройки ─────────────────────────── */

/** Интервал анализа из настроек расширения (0 = выключено). */
export function analysisInterval() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        const raw = bag?.['astral-phone']?.castInterval;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) return n;
    } catch (_) { /* ignore */ }
    return DEFAULT_INTERVAL;
}

export function setAnalysisInterval(value) {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (!bag) return false;
        if (!bag['astral-phone']) bag['astral-phone'] = {};
        bag['astral-phone'].castInterval = Math.max(0, Math.min(50, Number(value) || 0));

        const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
        if (typeof persist === 'function') persist();
        return true;
    } catch (_) {
        return false;
    }
}

/* ─────────────────────────── хранение ─────────────────────────── */

/** Карточки из состояния чата: { name: profile }. */
export function loadCast(storage) {
    const state = storage?.getState?.() || {};
    const cast = state.castProfiles;
    return (cast && typeof cast === 'object') ? cast : {};
}

function saveCast(storage, cast) {
    storage.updateState(null, { castProfiles: cast });
}

/* ─────────────────────────── анализ ─────────────────────────── */

/**
 * Разобрать свежие сообщения и обновить анкеты.
 *
 * @param {object} ctx контекст SillyTavern
 * @param {object} storage PhoneStorage
 * @param {{silent?: boolean, force?: boolean}} [opts]
 * @returns {Promise<{updated: number, names: string[]}>}
 */
export async function analyseCast(ctx, storage, opts = {}) {
    const interval = analysisInterval();
    if (interval === 0 && !opts.force) return { updated: 0, names: [] };

    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    if (chat.length < 2) return { updated: 0, names: [] };

    // ── сколько сообщений прошло с прошлого анализа ──
    const state = storage.getState();
    const lastCount = Number(state.castAnalysedAt) || 0;
    const fresh = chat.length - lastCount;

    if (!opts.force && fresh < interval) {
        return { updated: 0, names: [] };
    }

    const slice = chat.slice(Math.max(0, chat.length - Math.max(interval * 3, 12)));
    const transcript = slice
        .filter(m => m && !m.is_system && typeof m.mes === 'string')
        .map(m => {
            const who = m.is_user ? resolveName(ctx, 'user') : (m.name || resolveName(ctx, 'char'));
            const text = String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
            return `${who}: ${text}`;
        })
        .join('\n');

    if (!transcript.trim()) return { updated: 0, names: [] };

    const existing = loadCast(storage);
    const known = Object.keys(existing);
    const charName = resolveName(ctx, 'char');
    const userName = resolveName(ctx, 'user');

    const prompt = `You maintain compact character profiles for a roleplay.

RECENT SCENE:
${transcript}

${known.length ? `PROFILES ALREADY ON FILE: ${known.join(', ')}\n` : ''}
TASK: for every named character who appears or is meaningfully discussed in the scene, write or refresh a TINY profile.
Main character is "${charName}", the player is "${userName}".

Return ONLY valid JSON, no markdown, no explanation:
{
  "characters": [
    {
      "name": "exact name as it appears",
      "role": "1-3 words, e.g. best friend / rival / stranger",
      "attitude": "how they feel about ${userName} right now, max 8 words",
      "wants": "what they are after, max 10 words",
      "state": "what they are doing or feeling in this moment, max 12 words",
      "secret": "one thing they hide, max 10 words, or empty string"
    }
  ]
}

RULES:
- Write the VALUES in the SAME LANGUAGE as the scene. Russian scene → Russian values.
- Names stay exactly as written in the scene.
- Describe ONLY what the scene actually shows or strongly implies. Never invent facts.
- Skip the player (${userName}) — only other characters.
- 1 to 6 characters. Keep every field short.
- If a character already has a profile, update it rather than duplicating.`;

    let raw;
    try {
        raw = await ask(prompt, {
            system: 'You extract compact roleplay character facts as JSON. You never narrate.',
            responseLength: 900,
        });
    } catch (err) {
        console.warn(`${MODULE} analysis failed:`, err?.message || err);
        return { updated: 0, names: [] };
    }

    const parsed = parseCastJson(raw);
    if (!parsed.length) {
        console.warn(`${MODULE} model returned no usable profiles`);
        return { updated: 0, names: [] };
    }

    const merged = { ...existing };
    const names = [];

    for (const row of parsed) {
        const name = String(row.name || '').trim();
        if (!name || name.toLowerCase() === String(userName).toLowerCase()) continue;

        merged[name] = {
            name,
            role: clean(row.role, 40),
            attitude: clean(row.attitude, 80),
            wants: clean(row.wants, 90),
            state: clean(row.state, 110),
            secret: clean(row.secret, 90),
            updatedAt: Date.now(),
        };
        names.push(name);
    }

    if (!names.length) return { updated: 0, names: [] };

    saveCast(storage, merged);
    storage.updateState(null, { castAnalysedAt: chat.length });

    if (!opts.silent) {
        console.log(`${MODULE} обновлены анкеты: ${names.join(', ')}`);
    }

    return { updated: names.length, names };
}

/** Достать JSON из ответа модели. */
function parseCastJson(raw) {
    const text = String(raw || '').replace(/```[a-z]*\n?/gi, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return [];

    try {
        const data = JSON.parse(text.slice(start, end + 1));
        return Array.isArray(data?.characters) ? data.characters : [];
    } catch (_) {
        return [];
    }
}

/** Обрезка и очистка одного поля. */
function clean(value, max) {
    let s = String(value ?? '').replace(/\s+/g, ' ').trim();
    // значения пишутся на языке сцены — кириллицу не выкидываем,
    // но убираем служебные пометки модели
    s = s.replace(/^["'«]|["'»]$/g, '').replace(/^(нет|none|null|n\/a|-)$/i, '');
    return s.slice(0, max);
}

/* ─────────────────────────── промпт ─────────────────────────── */

/**
 * Блок анкет для системного промпта.
 * Компактно: только имена и по одному короткому полю на строку.
 *
 * @param {object} storage
 * @param {number} limit максимум персонажей
 * @returns {string}
 */
export function buildCastPromptBlock(storage, limit = 8) {
    const cast = loadCast(storage);
    const rows = Object.values(cast)
        .filter(c => c && c.name)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, limit);

    if (!rows.length) return '';

    const lines = rows.map(c => {
        const bits = [];
        if (c.role) bits.push(c.role);
        if (c.attitude) bits.push(`→ user: ${c.attitude}`);
        if (c.wants) bits.push(`хочет: ${c.wants}`);
        if (c.state) bits.push(`сейчас: ${c.state}`);
        if (c.secret) bits.push(`скрывает: ${c.secret}`);
        return `- ${c.name}${bits.length ? ` — ${bits.join('; ')}` : ''}`;
    });

    return `[Astral Phone — карточки персонажей]\n${lines.join('\n')}`;
}