/**
 * PromptLLM — генерация промптов через отдельную модель.
 *
 * Пользователь может указать свой endpoint/ключ/модель в настройках
 * («Настройки API»). Тогда промпты для картинок пишет выбранная модель, а не
 * основная модель чата — она не отвлекается на РП и не смешивает языки.
 *
 * Если настройки пусты, всё откатывается на generateRaw / generateQuietPrompt,
 * поэтому расширение работает и без отдельного ключа.
 */

import { cleanTags } from './prompt-builder.js';

const MODULE = '[AstralLLM]';
export const SETTINGS_KEY = 'astral-phone';

/* ─────────────────────────── настройки ─────────────────────────── */

/**
 * @returns {{endpoint: string, apiKey: string, model: string, temperature: number, maxTokens: number}}
 */
export function loadApiSettings() {
    const empty = { endpoint: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 600 };
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        const raw = bag?.[SETTINGS_KEY]?.promptApi;
        if (!raw || typeof raw !== 'object') return empty;
        return {
            endpoint: String(raw.endpoint || '').trim(),
            apiKey: String(raw.apiKey || '').trim(),
            model: String(raw.model || '').trim(),
            temperature: Number.isFinite(Number(raw.temperature)) ? Number(raw.temperature) : 0.7,
            maxTokens: Number.isFinite(Number(raw.maxTokens)) ? Number(raw.maxTokens) : 600,
        };
    } catch (_) {
        return empty;
    }
}

export function saveApiSettings(patch) {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (!bag) return false;
        if (!bag[SETTINGS_KEY]) bag[SETTINGS_KEY] = {};
        bag[SETTINGS_KEY].promptApi = { ...loadApiSettings(), ...patch };

        const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
        if (typeof persist === 'function') persist();
        return true;
    } catch (err) {
        console.warn(`${MODULE} save failed:`, err?.message || err);
        return false;
    }
}

/** Настроена ли отдельная модель. */
export function isApiConfigured() {
    const s = loadApiSettings();
    return Boolean(s.endpoint && s.model);
}

/* ─────────────────────────── запросы ─────────────────────────── */

function normalizeEndpoint(endpoint) {
    const clean = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!clean) return '';
    // уже полный путь — не трогаем
    if (/\/(chat\/completions|completions)$/i.test(clean)) return clean;
    if (/\/v1$/i.test(clean)) return `${clean}/chat/completions`;
    return `${clean}/v1/chat/completions`;
}

/**
 * Прямой запрос к OpenAI-совместимому endpoint.
 * @returns {Promise<string>} текст ответа
 */
async function callOpenAICompatible(prompt, systemPrompt, settings) {
    const url = normalizeEndpoint(settings.endpoint);
    if (!url) throw new Error('endpoint не задан');

    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                model: settings.model,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
            }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const data = await res.json();

        // чат-формат
        const msg = data?.choices?.[0]?.message?.content;
        if (typeof msg === 'string' && msg.trim()) return msg.trim();
        if (Array.isArray(msg)) {
            const joined = msg.map(p => (typeof p === 'string' ? p : p?.text || '')).join(' ').trim();
            if (joined) return joined;
        }

        // текстовый completion-формат
        const text = data?.choices?.[0]?.text;
        if (typeof text === 'string' && text.trim()) return text.trim();

        // Gemini-подобный
        const parts = data?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
            const joined = parts.map(p => p?.text || '').join(' ').trim();
            if (joined) return joined;
        }

        throw new Error('пустой ответ модели');
    } finally {
        clearTimeout(timer);
    }
}

/* ─────────────────────────── публичный API ─────────────────────────── */

/**
 * Спросить модель. Порядок: настроенный API → generateRaw → generateQuietPrompt.
 *
 * @param {string} prompt
 * @param {{system?: string, responseLength?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function ask(prompt, opts = {}) {
    const system = opts.system || 'You output English only. You never narrate or roleplay.';
    const settings = loadApiSettings();

    if (settings.endpoint && settings.model) {
        try {
            const out = await callOpenAICompatible(prompt, system, settings);
            if (out) return out;
        } catch (err) {
            console.warn(`${MODULE} настроенный API не ответил, откат на ST:`, err?.message || err);
        }
    }

    const ctx = globalThis.SillyTavern?.getContext?.();

    if (typeof ctx?.generateRaw === 'function') {
        try {
            const out = await ctx.generateRaw({
                prompt,
                systemPrompt: system,
                responseLength: opts.responseLength || 600,
            });
            if (String(out || '').trim()) return String(out).trim();
        } catch (err) {
            console.warn(`${MODULE} generateRaw failed:`, err?.message || err);
        }
    }

    if (typeof ctx?.generateQuietPrompt === 'function') {
        const out = await ctx.generateQuietPrompt(`[ENGLISH ONLY — NO PROSE]\n${prompt}`, false, false);
        if (String(out || '').trim()) return String(out).trim();
    }

    throw new Error('Нет доступной модели для генерации промпта');
}

/**
 * «Улучшить промпт»: из свободного текста пользователя делает структурированный
 * промпт NovelAI v5 — теги через запятую, без прозы.
 *
 * @param {string} input черновик пользователя
 * @param {{character?: string, style?: string}} [opts]
 * @returns {Promise<string>}
 */
export async function enhancePrompt(input, opts = {}) {
    const draft = String(input || '').trim();
    if (!draft) throw new Error('Пустой текст для улучшения');

    const char = String(opts.character || '').trim();

    const request = `Rewrite the draft below into a NovelAI v5 image prompt.

DRAFT${char ? ` (post by ${char})` : ''}:
${draft}

RULES:
- Output ENGLISH ONLY. Translate any Russian or other language into English.
- Comma-separated visual tags, no sentences, no story, no dialogue, no feelings in prose.
- Describe: framing/shot, subject${char ? ` (${char})` : ''}, appearance, clothing, pose/expression, action, setting, lighting, mood.
- No quality tags (masterpiece, best quality) — they are added automatically.
- No quotes, no labels, no markdown, no explanation. Output the prompt only.

PROMPT:`;

    const raw = await ask(request, {
        system: 'You are an image-prompt engineer. You output English tag lists only. You never narrate.',
        responseLength: 400,
    });

    return normalizePromptOutput(raw);
}

/**
 * Приводит ответ модели к аккуратной строке тегов.
 */
export function normalizePromptOutput(raw) {
    let text = String(raw || '');

    text = text.replace(/```[a-z]*\n?/gi, ' ');
    text = text.replace(/<[^>]*>/g, ' ');
    text = text.replace(/\[[A-Z_]{3,}[^\]]*\]/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    // срезаем метку в начале, в том числе склейки вида «girl, Prompt: ...»
    text = text.replace(/^(prompt|tags?|description|answer|output)\s*:\s*/i, '');
    text = text.replace(/^["'«]|["'»]$/g, '').trim();

    // если модель всё же написала предложения — режем на теги по запятым,
    // выбрасывая всё нелатинское
    const chunks = text
        .split(/[,;]\s*|\n+/)
        // убираем ведущий мусор: маркеры списка и числа от тегов дат
        .map(c => c.replace(/^[\s\-•*]+/, '').replace(/^\d[\d\s:/.-]*\s+/, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter(c => !/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(c))
        .filter(c => /[A-Za-z]{2,}/.test(c))
        // чисто числовые/датовые чанки — мусор от тегов вроде <horae>
        .filter(c => !/^[\d\s:/.,-]+$/.test(c));

    return chunks.join(', ').trim();
}

/**
 * Стиль из Haruspics — единый источник для галереи и creator studio.
 * Если настроенный API не задан, читаем активный пресет из inline_image_gen.
 *
 * @param {object} imageGen экземпляр ImageGenerator
 * @returns {string}
 */
export function resolveStyle(imageGen) {
    try {
        const own = String(imageGen?.getStyle?.() || '').trim();
        if (own) return cleanTags(own);
    } catch (_) { /* ignore */ }
    return '';
}