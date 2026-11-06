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

/** Пустой профиль подключения. */
export function emptyProfile() {
    return { endpoint: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 600 };
}

/** Все сохранённые профили + id активного. */
function readStore() {
    const fallback = { profiles: [], activeId: '' };
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        const raw = bag?.[SETTINGS_KEY]?.promptApi;
        if (!raw || typeof raw !== 'object') return fallback;

        // старый формат — один набор полей без профилей
        if (!Array.isArray(raw.profiles)) {
            const legacy = normalizeProfile(raw);
            if (legacy.endpoint || legacy.model) {
                return { profiles: [{ ...legacy, id: 'default', name: 'Default' }], activeId: 'default' };
            }
            return fallback;
        }

        return {
            profiles: raw.profiles.map(p => ({ ...normalizeProfile(p), id: String(p.id || ''), name: String(p.name || 'Профиль') })),
            activeId: String(raw.activeId || ''),
        };
    } catch (_) {
        return fallback;
    }
}

function normalizeProfile(raw) {
    const base = emptyProfile();
    if (!raw || typeof raw !== 'object') return base;
    return {
        endpoint: String(raw.endpoint || '').trim(),
        apiKey: String(raw.apiKey || '').trim(),
        model: String(raw.model || '').trim(),
        temperature: Number.isFinite(Number(raw.temperature)) ? Number(raw.temperature) : base.temperature,
        maxTokens: Number.isFinite(Number(raw.maxTokens)) ? Number(raw.maxTokens) : base.maxTokens,
    };
}

function writeStore(store) {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (!bag) return false;
        if (!bag[SETTINGS_KEY]) bag[SETTINGS_KEY] = {};
        bag[SETTINGS_KEY].promptApi = {
            profiles: (store.profiles || []).map(p => ({ ...p })),
            activeId: store.activeId || '',
        };
        const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
        if (typeof persist === 'function') persist();
        return true;
    } catch (err) {
        console.warn(`${MODULE} write failed:`, err?.message || err);
        return false;
    }
}

/** Список профилей и активный id. */
export function listProfiles() {
    const store = readStore();
    return { profiles: store.profiles, activeId: store.activeId };
}

/** Настройки активного профиля (или пустые). */
export function loadApiSettings() {
    const { profiles, activeId } = readStore();
    const active = profiles.find(p => p.id === activeId) || profiles[0];
    if (!active) return emptyProfile();
    const { id, name, ...rest } = active;
    return rest;
}

/**
 * Обновить активный профиль. Если профилей нет — создаёт первый.
 * @param {object} patch
 */
export function saveApiSettings(patch) {
    const store = readStore();
    let active = store.profiles.find(p => p.id === store.activeId);

    if (!active) {
        active = { ...emptyProfile(), id: 'default', name: 'Default' };
        store.profiles = [active];
        store.activeId = active.id;
    }

    Object.assign(active, normalizeProfile({ ...active, ...patch }));
    return writeStore(store);
}

/** Сохранить текущие поля как новый профиль. */
export function addProfile(name) {
    const store = readStore();
    const current = loadApiSettings();
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    store.profiles.push({ ...current, id, name: String(name || `Профиль ${store.profiles.length + 1}`) });
    store.activeId = id;
    writeStore(store);
    return id;
}

/** Переключиться на профиль. */
export function activateProfile(id) {
    const store = readStore();
    if (!store.profiles.some(p => p.id === id)) return false;
    store.activeId = id;
    return writeStore(store);
}

/** Удалить профиль. */
export function removeProfile(id) {
    const store = readStore();
    store.profiles = store.profiles.filter(p => p.id !== id);
    if (store.activeId === id) store.activeId = store.profiles[0]?.id || '';
    return writeStore(store);
}

/** Переименовать профиль. */
export function renameProfile(id, name) {
    const store = readStore();
    const p = store.profiles.find(x => x.id === id);
    if (!p) return false;
    p.name = String(name || p.name);
    return writeStore(store);
}

/** Настроена ли отдельная модель. */
export function isApiConfigured() {
    const s = loadApiSettings();
    return Boolean(s.endpoint && s.model);
}

/* ─────────────────────────── подключение и модели ─────────────────────────── */

/** Базовый URL до /v1 — из него строятся и chat, и models. */
function apiRoot(endpoint) {
    const clean = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!clean) return '';
    if (/\/v1$/i.test(clean)) return clean;
    if (/\/(chat\/completions|completions|models)$/i.test(clean)) {
        return clean.replace(/\/(chat\/completions|completions|models)$/i, '');
    }
    return `${clean}/v1`;
}

/**
 * Загрузить список моделей у провайдера.
 * @param {{endpoint: string, apiKey: string}} settings
 * @returns {Promise<string[]>}
 */
export async function fetchModels(settings) {
    const root = apiRoot(settings?.endpoint);
    if (!root) throw new Error('Укажите endpoint');

    const headers = {};
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
        const res = await fetch(`${root}/models`, { headers, signal: controller.signal });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        const raw = data?.data ?? data?.models ?? data;

        const ids = [];
        for (const item of (Array.isArray(raw) ? raw : [])) {
            if (typeof item === 'string') ids.push(item);
            else if (item && typeof item === 'object') {
                const id = item.id || item.name || item.model;
                if (typeof id === 'string' && id.trim()) ids.push(id.trim());
            }
        }

        const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
        if (!unique.length) throw new Error('Провайдер вернул пустой список моделей');
        return unique;
    } catch (err) {
        if (err?.name === 'AbortError') throw new Error('Таймаут подключения (30с)');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Проверить подключение коротким запросом и заодно получить модели.
 * Сохраняет список моделей, чтобы UI мог показать dropdown.
 *
 * @param {{endpoint: string, apiKey: string, model?: string}} settings
 * @returns {Promise<{ok: boolean, models: string[], error?: string}>}
 */
export async function testConnection(settings) {
    try {
        const models = await fetchModels(settings);
        // кэшируем список, чтобы dropdown не дёргал сеть каждый раз
        try {
            const ctx = globalThis.SillyTavern?.getContext?.();
            const bag = ctx?.extensionSettings || globalThis.extension_settings;
            if (bag?.[SETTINGS_KEY]) {
                bag[SETTINGS_KEY].promptApiModels = models;
                const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
                if (typeof persist === 'function') persist();
            }
        } catch (_) { /* ignore */ }
        return { ok: true, models };
    } catch (err) {
        return { ok: false, models: [], error: err?.message || String(err) };
    }
}

/** Последний успешно загруженный список моделей (без сети). */
export function cachedModels() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        const list = bag?.[SETTINGS_KEY]?.promptApiModels;
        return Array.isArray(list) ? list : [];
    } catch (_) {
        return [];
    }
}

/* ─────────────────────────── запросы ─────────────────────────── */

function normalizeEndpoint(endpoint) {
    const clean = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!clean) return '';
    if (/\/(chat\/completions|completions)$/i.test(clean)) return clean;
    const root = apiRoot(clean);
    return root ? `${root}/chat/completions` : '';
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
    const style = String(opts.style || '').trim();
    const appearance = String(opts.appearance || '').trim();

    const contextLines = [];
    if (style) contextLines.push(`STYLE (already applied, do not repeat it in your answer): ${style}`);
    if (appearance) contextLines.push(`FIXED APPEARANCE of ${char || 'the subject'} (do not contradict or repeat): ${appearance}`);

    const request = `Rewrite the draft below into a NovelAI v5 image prompt.

DRAFT${char ? ` (post by ${char})` : ''}:
${draft}
${contextLines.length ? `\n${contextLines.join('\n')}\n` : ''}
RULES:
- Output ENGLISH ONLY. Translate any Russian or other language into English.
- Comma-separated visual tags, no sentences, no story, no dialogue, no feelings in prose.
- Describe: framing/shot, subject${char ? ` (${char})` : ''}, pose/expression, action, outfit, setting, lighting, mood.
${appearance ? '- Do NOT describe hair, eyes, build or skin — the fixed appearance is added separately.' : `- Describe the subject's appearance briefly (hair, eyes, build).`}
- No quality tags (masterpiece, best quality) and no style tags — they are added automatically.
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
        console.warn(`${MODULE} активный стиль в inline_image_gen не найден`);
    } catch (err) {
        console.warn(`${MODULE} resolveStyle failed:`, err?.message || err);
    }
    return '';
}

/**
 * Гарантированно добавить стиль в промпт, если его там ещё нет.
 * Стиль ставится первым тегом — NovelAI придаёт началу строки больший вес.
 *
 * @param {string} prompt
 * @param {string} style
 * @returns {string}
 */
export function ensureStyle(prompt, style) {
    const text = String(prompt || '').trim();
    const st = cleanTags(style || '');
    if (!st) return text;
    if (!text) return st;

    // уже применён (например, промпт собран prompt-builder'ом)
    const firstSegment = text.split('|')[0].slice(0, 200).toLowerCase();
    const styleHead = st.split(',')[0].trim().toLowerCase();
    if (styleHead && firstSegment.includes(styleHead)) return text;

    return `${st}, ${text}`;
}