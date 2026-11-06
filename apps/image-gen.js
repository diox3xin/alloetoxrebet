/**
 * ImageGenerator — standalone port of the Haruspics Fusion ("inline_image_gen")
 * image-generation providers, callable directly instead of via [IMG:GEN:...] chat tags.
 *
 * Ported from haruspics index.js (line ranges verified against the source):
 *   isGeminiModel                                196-198
 *   buildGeminiRequestCandidates                 200-238
 *   normalizeOpenAIBaseUrl                       240-242
 *   buildOpenAIUrl                               244-247
 *   isRouterEndpoint                             249-252
 *   normalizeApiKey                              254-261
 *   buildAuthHeaders                             263-268
 *   normalizeNaisteraModel                       347-349
 *   isNaisteraNovelAIModel                       351-353
 *   normalizeNaisteraCharacterDescriptionsMode   355-357
 *   normalizeNaisteraEndpoint                    359-363
 *   formatNaisteraDescription                    381-391
 *   fetchNaisteraModels (metadata only)          714-739
 *   saveImageToFile                              960-1005
 *   getEffectiveNegativePrompt                   1136-1141
 *   getNaisteraModelInfo                         2319-2321
 *   extractNaisteraDataUrl                       2323-2349
 *   pollNaisteraJob                              2355-2392
 *   generateImageNaistera                        2394-2493
 *   extractNovelAIPng                            2496-2542
 *   generateImageNovelAI                         2545-2633
 *   generateImageOpenAI                          2635-2736
 *   normalizeReturnedImage                       2738-2753
 *   extractImageFromText                         2755-2764
 *   parseImageFromApiResponse                    2766-2807
 *   generateImageOpenAIChat                      2809-2904
 *   VALID_ASPECT_RATIOS / VALID_IMAGE_SIZES      2910-2911
 *   generateImageGemini                          2913-3110
 *   validateSettings (behaviour, for isAvailable) 3116-3134
 *   generateImageWithRetry (dispatch + timeout)  3136-3209
 *
 * Deliberately NOT ported: collectReferenceImages / wardrobe / hairstyle /
 * character-profile collection (refData is always EMPTY_REFS), maxRetries and
 * exponential backoff, AbortController plumbing for user cancellation, toastr
 * notifications and the iigLog ring buffer. Logging goes to console instead.
 */

const HARUSPICS_MODULE_NAME = 'inline_image_gen';

const VALID_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const VALID_IMAGE_SIZES = ['1K', '2K', '4K'];

const NAISTERA_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

const NOVELAI_MODELS = [
    'nai-diffusion-5-full',
    'nai-diffusion-5-curated',
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full',
    'nai-diffusion-4-curated-preview',
    'nai-diffusion-3',
    'nai-diffusion-2',
    'nai-diffusion-furry-3',
];

/** Fallback values, mirroring haruspics defaultSettings for the fields we read. */
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    apiType: 'openai',
    endpoint: '',
    apiKey: '',
    model: '',
    naisteraModel: '',
    naisteraAspectRatio: '1:1',
    naisteraNegativePrompt: '',
    naisteraPreset: '',
    naisteraCharacterDescriptionsMode: 'as-is',
    naisteraPolling: false,
    naisteraPollIntervalMs: 3000,
    naisteraPollTimeoutMs: 600000,
    novelaiModel: 'nai-diffusion-5-full',
    novelaiApiKey: '',
    novelaiWidth: 832,
    novelaiHeight: 1216,
    novelaiSteps: 28,
    novelaiScale: 5,
    novelaiSampler: 'k_dpmpp_2m',
    novelaiScheduler: 'karras',
    novelaiNegativePrompt: '',
    novelaiSeed: -1,
    novelaiSm: false,
    novelaiSmDyn: false,
    novelaiDecrisper: false,
    novelaiVarietyBoost: false,
    size: '1024x1024',
    quality: 'standard',
    maxRetries: 0,
    retryDelay: 1000,
    requestTimeout: 120,
    aspectRatio: '1:1',
    imageSize: '1K',
    geminiRandomFormat: false,
    negativeGalleryItems: [],
    activeNegativeId: '',
});

const EMPTY_REFS = Object.freeze({ imageRefs: [], textOnlyClothing: [], textDirectives: [] });

/* ─────────────────────────── generic helpers ─────────────────────────── */

function isGeminiModel(modelId) {
    return /nano-banana|gemini|flash-image|imagen/i.test(String(modelId || ''));
}

function normalizeOpenAIBaseUrl(endpoint) {
    return (endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function buildOpenAIUrl(endpoint, path) {
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return `${normalizeOpenAIBaseUrl(endpoint)}/v1/${cleanPath}`;
}

function isRouterEndpoint(endpoint) {
    const lower = (endpoint || '').toLowerCase();
    return lower.includes('closerouter') || lower.includes('openrouter') || lower.includes('rout.my');
}

function normalizeApiKey(apiKey) {
    return String(apiKey ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^Bearer\s+/i, '')
        .replace(/\s+/g, '')
        .trim();
}

function buildAuthHeaders(apiKey, extra = {}) {
    return {
        ...extra,
        'Authorization': `Bearer ${normalizeApiKey(apiKey)}`,
    };
}

function buildGeminiRequestCandidates(baseUrl, model, apiKey) {
    const clean = String(baseUrl || '').replace(/\/$/, '');
    const lower = clean.toLowerCase();
    const cleanApiKey = normalizeApiKey(apiKey);

    if (lower.includes('googleapis.com')) {
        return [{
            url: `${clean}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanApiKey)}`,
            headers: { 'Content-Type': 'application/json' },
        }];
    }

    const candidates = [];
    const pushCandidate = (url) => {
        if (!candidates.some(candidate => candidate.url === url)) {
            candidates.push({
                url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cleanApiKey}`,
                },
            });
        }
    };

    if (/\/v1beta$/i.test(clean)) {
        pushCandidate(`${clean}/models/${model}:generateContent`);
        pushCandidate(`${clean.replace(/\/v1beta$/i, '')}/v1/models/${model}:generateContent`);
    } else if (/\/v1$/i.test(clean)) {
        pushCandidate(`${clean.replace(/\/v1$/i, '')}/v1beta/models/${model}:generateContent`);
        pushCandidate(`${clean}/models/${model}:generateContent`);
    } else {
        pushCandidate(`${clean}/v1beta/models/${model}:generateContent`);
        pushCandidate(`${clean}/v1/models/${model}:generateContent`);
        pushCandidate(`${clean}/models/${model}:generateContent`);
    }

    return candidates;
}

/* ─────────────────────── Naistera-specific helpers ───────────────────── */

function normalizeNaisteraModel(model) {
    return String(model || '').trim();
}

function isNaisteraNovelAIModel(model) {
    return /^novelai(?:-|$)/i.test(normalizeNaisteraModel(model));
}

function normalizeNaisteraCharacterDescriptionsMode(value) {
    return ['none', 'as-is', 'character-prompt'].includes(value) ? value : 'as-is';
}

function normalizeNaisteraEndpoint(endpoint) {
    const value = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!value) return 'https://naistera.org';
    return value.replace(/\/api\/(?:generate|models)$/i, '');
}

function formatNaisteraDescription(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        if (value.charName || value.description) {
            return `[CLOTHING: ${value.charName || 'Character'} is wearing: ${value.description || ''}]`;
        }
        return Object.values(value).filter(Boolean).join(' ');
    }
    return String(value);
}

/* ─────────────────── image payload normalisation helpers ─────────────── */

function normalizeReturnedImage(value) {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    const clean = value.trim();
    if (!clean) return null;
    if (clean.startsWith('data:image/')) return clean;
    if (/^https?:\/\//i.test(clean)) return clean;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(clean) && clean.length > 100) {
        const compact = clean.replace(/\s+/g, '');
        let mimeType = 'image/png';
        if (compact.startsWith('/9j/')) mimeType = 'image/jpeg';
        else if (compact.startsWith('UklGR')) mimeType = 'image/webp';
        return `data:${mimeType};base64,${compact}`;
    }
    return null;
}

function extractImageFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const dataUrl = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/);
    if (dataUrl) return normalizeReturnedImage(dataUrl[0]);
    const markdownImage = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
    if (markdownImage) return markdownImage[1];
    const plainImageUrl = text.match(/https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"']*)?/i);
    if (plainImageUrl) return plainImageUrl[0];
    return null;
}

function parseImageFromApiResponse(result) {
    const candidates = [];
    const push = (value) => {
        if (value == null) return;
        if (typeof value === 'string') candidates.push(value);
        else if (typeof value === 'object') {
            candidates.push(value.url, value.uri, value.b64_json, value.b64, value.base64, value.image);
            candidates.push(value.image_url?.url, value.image_url);
            if (value.data) candidates.push(value.data);
        }
    };

    push(result?.url);
    push(result?.uri);
    push(result?.image);
    push(result?.b64_json);
    for (const item of (result?.data || [])) push(item);
    for (const item of (result?.images || [])) push(item);

    for (const choice of (result?.choices || [])) {
        const message = choice?.message || choice?.delta || {};
        push(message.image);
        push(message.image_url);
        for (const image of (message.images || [])) push(image);
        const content = message.content;
        if (typeof content === 'string') candidates.push(content);
        else if (Array.isArray(content)) {
            for (const part of content) {
                push(part);
                push(part?.image_url);
                push(part?.image);
                if (part?.type === 'text') push(part.text);
            }
        }
    }

    for (const candidate of candidates) {
        const normalized = normalizeReturnedImage(candidate) || extractImageFromText(candidate);
        if (normalized) return normalized;
    }
    return null;
}

function extractNaisteraDataUrl(result) {
    const candidates = [];
    const push = value => {
        if (value == null) return;
        if (typeof value === 'string') candidates.push(value);
        if (typeof value === 'object') {
            candidates.push(value.data_url, value.url, value.uri, value.image,
                value.b64_json, value.b64, value.base64);
        }
    };

    push(result?.data_url);
    push(result?.image);
    push(result?.url);
    push(result?.images?.[0]);
    push(result?.data?.[0]);
    push(result?.result);

    for (const candidate of candidates) {
        const normalized = normalizeReturnedImage(candidate);
        if (normalized) return normalized;
        if (typeof candidate === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(candidate) && candidate.length > 100) {
            return `data:image/png;base64,${candidate.replace(/\s+/g, '')}`;
        }
    }
    return null;
}

/** Direct NovelAI returns a ZIP; pull the first PNG out of it without dependencies. */
async function extractNovelAIPng(archive) {
    const bytes = new Uint8Array(archive);
    if (bytes.length < 22 || bytes.length > 60 * 1024 * 1024) throw new Error('NovelAI не вернул ZIP с изображением.');
    const view = new DataView(archive);
    const uint16 = offset => view.getUint16(offset, true);
    const uint32 = offset => view.getUint32(offset, true);
    let end = -1;
    for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
        if (uint32(pos) === 0x06054b50 && pos + 22 + uint16(pos + 20) === bytes.length) { end = pos; break; }
    }
    if (end < 0) throw new Error('NovelAI не вернул ZIP с изображением.');
    const entries = uint16(end + 10);
    let offset = uint32(end + 16);
    if (entries > 100 || offset >= end) throw new Error('Некорректный ZIP-ответ NovelAI.');
    for (let index = 0; index < entries; index++) {
        if (offset + 46 > end || uint32(offset) !== 0x02014b50) break;
        const flags = uint16(offset + 8);
        const method = uint16(offset + 10);
        const length = uint32(offset + 20);
        const nameLength = uint16(offset + 28);
        const extraLength = uint16(offset + 30);
        const commentLength = uint16(offset + 32);
        const localOffset = uint32(offset + 42);
        const next = offset + 46 + nameLength + extraLength + commentLength;
        if (next > end) break;
        const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
        if (name.toLowerCase().endsWith('.png') && !name.startsWith('__MACOSX/')) {
            if (flags & 1 || ![0, 8].includes(method) || localOffset + 30 > bytes.length || uint32(localOffset) !== 0x04034b50) break;
            const start = localOffset + 30 + uint16(localOffset + 26) + uint16(localOffset + 28);
            if (start + length > bytes.length || length > 50 * 1024 * 1024) break;
            const compressed = bytes.subarray(start, start + length);
            const png = method === 0 ? compressed : new Uint8Array(await new Response(
                new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
            ).arrayBuffer());
            if (png.length > 50 * 1024 * 1024 || png.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => png[i] === byte)) {
                throw new Error('NovelAI вернул ZIP без корректного PNG.');
            }
            let base64 = '';
            for (let i = 0; i < png.length; i += 0x6000) {
                base64 += String.fromCharCode(...png.subarray(i, i + 0x6000));
            }
            return btoa(base64);
        }
        offset = next;
    }
    throw new Error('NovelAI вернул ZIP без PNG.');
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x6000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/* ─────────────────────────── the module ─────────────────────────── */

export class ImageGenerator {
    /**
     * @param {object} context SillyTavern context (getContext()) — provides
     *   getRequestHeaders(), characters, characterId, extensionSettings.
     */
    constructor(context) {
        this.context = context || null;
        /** Cached Naistera model capability metadata: id -> {id,name,references,negativePrompt} */
        this._naisteraCatalog = new Map();
        this._naisteraCatalogFetchedAt = 0;
        this._naisteraCatalogFetchedFor = '';
    }

    /* ─────────────────────────── settings access ─────────────────────────── */

    _ctx() {
        if (this.context) return this.context;
        try {
            const st = globalThis.SillyTavern?.getContext?.();
            if (st) return st;
        } catch (_) { /* ignore */ }
        return null;
    }

    /** Raw haruspics settings object, or null when the extension is not installed. */
    _rawSettings() {
        try {
            const bag = globalThis.extension_settings;
            if (bag && typeof bag === 'object') {
                const s = bag[HARUSPICS_MODULE_NAME];
                if (s && typeof s === 'object') return s;
            }
        } catch (_) { /* ignore */ }
        try {
            const s = this._ctx()?.extensionSettings?.[HARUSPICS_MODULE_NAME];
            if (s && typeof s === 'object') return s;
        } catch (_) { /* ignore */ }
        return null;
    }

    /** Settings merged with defaults; throws when haruspics is missing. */
    _settings() {
        const raw = this._rawSettings();
        if (!raw) throw this._notInstalledError();
        const merged = { ...DEFAULT_SETTINGS, ...raw };
        // Legacy alias kept by haruspics.
        if (merged.apiType === 'novelai-custom') merged.apiType = 'novelai-direct';
        return merged;
    }

    _notInstalledError() {
        return new Error('Haruspics не установлен: расширение inline_image_gen не найдено. Установите haruspics-naistera и настройте провайдера.');
    }

    getEffectiveNegativePrompt(tagNegativePrompt = '') {
        let settings;
        try { settings = this._settings(); } catch (_) { return String(tagNegativePrompt || '').trim(); }
        const item = (settings.negativeGalleryItems || []).find(candidate => candidate.id === settings.activeNegativeId);
        return String(tagNegativePrompt || '').trim() || String(item?.prompt || '').trim();
    }

    /* ─────────────────────────── haruspics sync ─────────────────────────── */

    /**
     * Read the active style tag from Haruspics settings.
     * Haruspics stores the selected style in `extension_settings.inline_image_gen.style`.
     * Falls back to an empty string if not configured.
     */
    getStyle() {
        try {
            const s = this._rawSettings();
            if (!s) return '';
            // activeStyleId points into stylePresets array
            const activeId = String(s.activeStyleId || '').trim();
            if (!activeId) return '';
            const presets = s.stylePresets;
            if (!Array.isArray(presets)) return '';
            const active = presets.find(p => p.id === activeId);
            return String(active?.text || active?.prompt || active?.name || '').trim();
        } catch (_) { return ''; }
    }

    _collectRefs() {
        try {
            const s = this._rawSettings();
            if (!s) return EMPTY_REFS;

            const textDirectives = [];
            const textOnlyClothing = [];

            const ctx = this._ctx();
            const charName = ctx?.name2 || '';
            const userName = ctx?.name1 || '';

            // ── Character / user appearance library ──────────────────────
            // structure: characterReferenceLibrary.characters[charName].appearanceItems[]
            const charLib = s.characterReferenceLibrary;
            if (charLib && typeof charLib === 'object') {
                const addItems = (bucket, displayName) => {
                    if (!displayName) return;
                    const entry = charLib[bucket]?.[displayName];
                    if (!entry) return;
                    for (const item of (entry.appearanceItems || [])) {
                        if (item.enabled === false) continue;
                        if (item.type !== 'text') continue;
                        const desc = String(item.description || '').trim();
                        if (desc) textOnlyClothing.push({ charName: displayName, description: desc });
                    }
                };
                addItems('characters', charName);
                addItems('users', userName);
            }

            // ── Lorebooks ─────────────────────────────────────────────────
            // structure: lorebooks[].refs[].{ name, description, enabled, matchMode }
            const lorebooks = s.lorebooks;
            if (Array.isArray(lorebooks)) {
                for (const lb of lorebooks) {
                    if (lb.enabled === false) continue;
                    for (const ref of (lb.refs || [])) {
                        if (ref.enabled === false) continue;
                        const name = String(ref.name || '').trim();
                        const desc = String(ref.description || '').trim();
                        if (!desc) continue;
                        if (name) textOnlyClothing.push({ charName: name, description: desc });
                        else textDirectives.push(desc);
                    }
                }
            }

            if (textDirectives.length === 0 && textOnlyClothing.length === 0) return EMPTY_REFS;

            const style = this.getStyle();
            console.log(`[AstralImageGen] Synced from IIG — style="${style}", directives=${textDirectives.length}, clothing=${textOnlyClothing.length}`);
            return { imageRefs: [], textDirectives, textOnlyClothing };
        } catch (_) {
            return EMPTY_REFS;
        }
    }

    /* ─────────────────────────── availability ─────────────────────────── */

    /**
     * True when the haruspics extension is present and its current provider has
     * a model plus usable credentials — mirrors haruspics validateSettings().
     */
    isAvailable() {
        const s = this._rawSettings();
        if (!s) return false;
        const apiType = s.apiType === 'novelai-custom' ? 'novelai-direct' : (s.apiType || 'openai');

        if (apiType === 'naistera') {
            if (!normalizeNaisteraModel(s.naisteraModel)) return false;
            return Boolean(String(s.apiKey || '').trim());
        }

        if (apiType === 'novelai') {
            return NOVELAI_MODELS.includes(String(s.novelaiModel || '').trim());
        }

        if (apiType === 'novelai-direct') {
            return NOVELAI_MODELS.includes(String(s.novelaiModel || '').trim())
                && Boolean(normalizeApiKey(s.novelaiApiKey));
        }

        // openai / openai-chat / gemini (and any router variants)
        if (!String(s.endpoint || '').trim()) return false;
        if (!String(s.apiKey || '').trim()) return false;
        if (!String(s.model || '').trim()) return false;
        return true;
    }

    /* ─────────────────────────── public API ─────────────────────────── */

    /**
     * Generate an image and store it in SillyTavern's user images folder.
     *
     * @param {string} prompt Scene prompt.
     * @param {{character?: string, nsfw?: boolean, [key: string]: any}} metadata
     *   `character` is used as the uploaded image's ch_name.
     * @returns {Promise<string>} ST-hosted path (e.g. /user/images/...) ready for <img src>.
     */
    async generate(prompt, metadata = {}) {
        const settings = this._settings();
        const text = String(prompt ?? '').trim();
        if (!text) throw new Error('Пустой промпт для генерации изображения.');

        // Auto-sync style and character refs from Haruspics unless overridden
        const style = metadata.style !== undefined ? String(metadata.style) : this.getStyle();
        const refs = metadata.refs !== undefined ? metadata.refs : this._collectRefs();

        const dataUrl = await this._generateWithTimeout(text, settings, style, refs, metadata.negativePrompt);
        return this.saveImageToFile(dataUrl, metadata?.character);
    }

    /* ─────────────────────── save to ST images folder ─────────────────────── */

    /**
     * Port of haruspics saveImageToFile (index.js 960-1009).
     * Accepts a `data:` URL or a plain http(s) URL; uploads to /api/images/upload.
     */
    async saveImageToFile(dataUrl, chName = null) {
        const context = this._ctx();
        if (!context?.getRequestHeaders) {
            throw new Error('SillyTavern context недоступен: не удалось сохранить изображение.');
        }

        if (dataUrl && !dataUrl.startsWith('data:') && (dataUrl.startsWith('http://') || dataUrl.startsWith('https://'))) {
            try {
                const remoteResponse = await fetch(dataUrl);
                if (!remoteResponse.ok) throw new Error(`HTTP ${remoteResponse.status}`);
                const mimeType = (remoteResponse.headers.get('content-type') || 'image/png').split(';')[0].trim() || 'image/png';
                const buf = await remoteResponse.arrayBuffer();
                dataUrl = `data:${mimeType};base64,${arrayBufferToBase64(buf)}`;
            } catch (err) {
                throw new Error(`Не удалось скачать изображение по URL: ${err?.message || err}`);
            }
        }

        const match = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/s);
        if (!match) throw new Error('Провайдер вернул изображение в неизвестном формате (ожидался data URL или http(s) URL).');

        const format = match[1];
        const base64Data = match[2];

        let charName = 'generated';
        if (chName && String(chName).trim()) {
            charName = String(chName).trim();
        } else if (context.characterId !== undefined && context.characters?.[context.characterId]) {
            charName = context.characters[context.characterId].name || 'generated';
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `astral_${timestamp}`;

        const response = await fetch('/api/images/upload', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({ image: base64Data, format, ch_name: charName, filename }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Upload failed: ${response.status}`);
        }

        const result = await response.json();
        if (!result?.path) throw new Error('SillyTavern не вернул путь к сохранённому изображению.');
        return result.path;
    }

    /* ─────────────────────────── dispatch + timeout ─────────────────────────── */

    /** Port of generateImageWithRetry (3136-3213) with retries and toasts removed. */
    async _generateWithTimeout(prompt, settings, style = '', refs = EMPTY_REFS, negativePrompt = undefined) {
        const timeoutMs = Math.max(5, Number(settings.requestTimeout) || 120) * 1000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const options = { signal: controller.signal, _refs: refs };
        // An explicit negative from the prompt builder must win over the
        // gallery default read inside each provider.
        if (negativePrompt != null && String(negativePrompt).trim() !== '') {
            options.negativePrompt = String(negativePrompt).trim();
        }

        try {
            const isRouterApi = isRouterEndpoint(settings.endpoint);
            const useGeminiApi = settings.apiType === 'gemini' && !isRouterApi;

            if (settings.apiType === 'naistera') {
                return await this.generateImageNaistera(prompt, style, settings, options);
            }
            if (['novelai', 'novelai-direct'].includes(settings.apiType)) {
                return await this.generateImageNovelAI(prompt, style, settings, options);
            }
            const useChatApi = settings.apiType === 'openai-chat'
                || (isRouterApi && (settings.apiType === 'openai' || settings.apiType === 'gemini'));

            if (useGeminiApi) {
                return await this.generateImageGemini(prompt, style, settings, options);
            }
            if (useChatApi) {
                return await this.generateImageOpenAIChat(prompt, style, settings, options);
            }
            return await this.generateImageOpenAI(prompt, style, settings, options);
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`Таймаут: провайдер не ответил за ${Math.round(timeoutMs / 1000)}с`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /* ─────────────────────────── Naistera ─────────────────────────── */

    /** Port of fetchNaisteraModels (714-739): capability metadata only. */
    async _ensureNaisteraCatalog(settings) {
        const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
        const fresh = Date.now() - this._naisteraCatalogFetchedAt < 5 * 60 * 1000;
        if (fresh && this._naisteraCatalogFetchedFor === endpoint && this._naisteraCatalog.size > 0) return;
        const headers = { Accept: 'application/json' };
        if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
        try {
            const response = await fetch(`${endpoint}/api/models`, { method: 'GET', headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            const models = (Array.isArray(payload?.models) ? payload.models : [])
                .filter(model => model?.id && model.visible !== false && model.deprecated !== true)
                .map(model => ({
                    id: String(model.id),
                    name: String(model.name || model.id),
                    references: model.references !== false,
                    negativePrompt: model.negative_prompt === true,
                }));
            this._naisteraCatalog = new Map(models.map(model => [model.id, model]));
            this._naisteraCatalogFetchedAt = Date.now();
            this._naisteraCatalogFetchedFor = endpoint;
            console.log(`[AstralImageGen] Naistera models loaded: ${models.length}`);
        } catch (error) {
            console.warn(`[AstralImageGen] Naistera model metadata unavailable: ${error?.message || error}`);
        }
    }

    getNaisteraModelInfo(model) {
        return this._naisteraCatalog.get(normalizeNaisteraModel(model)) || null;
    }

    /** Bounded port of pollNaisteraJob (2355-2392). */
    async pollNaisteraJob(endpoint, jobId, settings, signal) {
        const base = normalizeNaisteraEndpoint(endpoint);
        const url = `${base}/api/generate/jobs/${encodeURIComponent(jobId)}`;
        const intervalMs = Math.max(1000, Math.min(30000, Number(settings.naisteraPollIntervalMs) || 3000));
        const timeoutMs = Math.max(30000, Math.min(900000, Number(settings.naisteraPollTimeoutMs) || 600000));
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            if (signal?.aborted) throw new Error('Генерация отменена (таймаут)');
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${settings.apiKey}`,
                    Accept: 'application/json',
                },
                signal,
            });
            const text = await response.text().catch(() => '');
            let result = null;
            try { result = text ? JSON.parse(text) : null; } catch (_) { /* handled below */ }

            if (!response.ok) {
                throw new Error(`Naistera polling error (${response.status}): ${text.slice(0, 800)}`);
            }
            if (extractNaisteraDataUrl(result)) return result;

            const status = String(result?.status || '').toLowerCase();
            if (status === 'failed' || result?.error) {
                throw new Error(`Naistera generation failed: ${result?.detail || result?.error?.detail || result?.error || 'Unknown error'}`);
            }

            await new Promise(resolve => {
                const timer = setTimeout(resolve, intervalMs);
                signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
            });
        }
        throw new Error(`Naistera polling timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    /** Port of generateImageNaistera (2394-2494). refData is always empty here. */
    async generateImageNaistera(prompt, style, settings, options = {}) {
        const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
        const model = normalizeNaisteraModel(settings.naisteraModel);
        if (!model) throw new Error('Naistera: модель не выбрана (настройки haruspics).');

        if (!this.getNaisteraModelInfo(model)) {
            await this._ensureNaisteraCatalog(settings);
        }
        const modelInfo = this.getNaisteraModelInfo(model);
        const descriptionMode = normalizeNaisteraCharacterDescriptionsMode(settings.naisteraCharacterDescriptionsMode);
        const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;

        const promptParts = [];
        // sillyimages sends NovelAI styles as ordinary prompt text, while other
        // Naistera models receive the explicit style marker.
        if (style) promptParts.push(isNaisteraNovelAIModel(model) ? style : `[Style: ${style}]`);
        if (descriptionMode === 'as-is') {
            promptParts.push(...textDirectives);
            for (const clothing of textOnlyClothing) {
                promptParts.push(`[CLOTHING: ${clothing.charName || 'Character'} is wearing: ${clothing.description || ''}]`);
            }
        }
        if (descriptionMode === 'character-prompt') {
            const descriptions = [...textDirectives, ...textOnlyClothing]
                .map(formatNaisteraDescription)
                .filter(Boolean);
            if (descriptions.length > 0) promptParts.push(`[CHARACTER DESCRIPTIONS]\n${descriptions.join('\n')}`);
        }
        promptParts.push(prompt);

        // Random aspect ratio for nano-banana models in Naistera (respects prompt-specified ratio)
        let aspectRatio = options.aspectRatio || settings.naisteraAspectRatio || '1:1';
        const isNaisteraNanaBanana = isGeminiModel(model);
        if (isNaisteraNanaBanana && settings.geminiRandomFormat && !options.aspectRatio) {
            aspectRatio = NAISTERA_RATIOS[Math.floor(Math.random() * NAISTERA_RATIOS.length)];
            console.log(`[AstralImageGen] Naistera random format (nano-banana): ${aspectRatio}`);
        }

        const body = {
            prompt: promptParts.join('\n\n'),
            aspect_ratio: aspectRatio,
            model,
        };

        const selectedGalleryNegative = options.negativePrompt == null
            ? this.getEffectiveNegativePrompt('')
            : String(options.negativePrompt || '').trim();
        const negativePrompt = selectedGalleryNegative || String(settings.naisteraNegativePrompt || '').trim();
        if (negativePrompt && modelInfo?.negativePrompt === true) body.negative_prompt = negativePrompt;
        const preset = String(options.preset ?? settings.naisteraPreset ?? '').trim();
        if (preset) body.preset = preset;

        if (imageRefs.length > 0 && modelInfo?.references !== false) {
            body.reference_objects = imageRefs.map(ref => ({
                image: `data:${ref.mimeType || 'image/png'};base64,${ref.data}`,
                description: descriptionMode === 'none'
                    ? ''
                    : (ref.description || ref.outfitName || ref.name || ''),
            })).filter(ref => ref.image);
        }
        if (settings.naisteraPolling) body.sync = false;

        console.log(`[AstralImageGen] Naistera request: endpoint=${endpoint}, model=${model}, polling=${!!settings.naisteraPolling}`);

        const response = await fetch(`${endpoint}/api/generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: options.signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Naistera API error (${response.status}): ${text.slice(0, 800)}`);
        }

        let result = await response.json();
        if (result?.job_id && !extractNaisteraDataUrl(result)) {
            result = await this.pollNaisteraJob(endpoint, result.job_id, settings, options.signal);
        }
        const dataUrl = extractNaisteraDataUrl(result);
        if (!dataUrl) throw new Error('Naistera response does not contain an image');
        return dataUrl;
    }

    /* ─────────────────────────── NovelAI ─────────────────────────── */

    /** Port of generateImageNovelAI (2545-2633). refData is always empty here. */
    async generateImageNovelAI(prompt, style, settings, options = {}) {
        const parts = [];
        if (style) parts.push(style);
        const { textDirectives, textOnlyClothing } = options._refs || EMPTY_REFS;
        parts.push(...textDirectives);
        for (const clothing of textOnlyClothing) {
            if (clothing.description) parts.push(`${clothing.charName || 'Character'} is wearing: ${clothing.description}`);
        }
        for (const ref of (options._refs || EMPTY_REFS).imageRefs) {
            if (ref.type === 'clothing' && ref.description) parts.push(`${ref.name || 'Character'} is wearing: ${ref.description}`);
        }
        parts.push(prompt);

        const ratio = String(options.aspectRatio || '');
        let width = Number(settings.novelaiWidth);
        let height = Number(settings.novelaiHeight);
        if (/^\d+:\d+$/.test(ratio)) {
            const [w, h] = ratio.split(':').map(Number);
            if (w > 0 && h > 0 && w / h >= 0.4 && w / h <= 2.5) {
                const area = width * height;
                width = Math.round(Math.sqrt(area * w / h) / 64) * 64;
                height = Math.round(Math.sqrt(area * h / w) / 64) * 64;
            }
        }

        const body = {
            prompt: parts.filter(Boolean).join(', '),
            model: settings.novelaiModel,
            negative_prompt: (options.negativePrompt == null
                ? this.getEffectiveNegativePrompt('')
                : String(options.negativePrompt || '').trim()) || String(settings.novelaiNegativePrompt || '').trim(),
            width,
            height,
            steps: Number(settings.novelaiSteps),
            scale: Number(settings.novelaiScale),
            sampler: settings.novelaiSampler,
            scheduler: settings.novelaiScheduler,
            seed: Number(settings.novelaiSeed),
            sm: settings.novelaiSm,
            sm_dyn: settings.novelaiSmDyn,
            decrisper: settings.novelaiDecrisper,
            variety_boost: settings.novelaiVarietyBoost,
        };

        const direct = settings.apiType === 'novelai-direct';
        const token = direct ? normalizeApiKey(settings.novelaiApiKey) : '';
        if (direct && !token) throw new Error('Введите NovelAI Access Token в настройках haruspics.');

        console.log(`[AstralImageGen] NovelAI ${direct ? 'direct' : 'SillyTavern'}: model=${body.model}, size=${width}x${height}, text=${body.prompt.length} chars`);

        const negative = body.negative_prompt || '';
        const directBody = direct ? {
            action: 'generate', input: body.prompt, model: body.model,
            parameters: {
                params_version: body.model.startsWith('nai-diffusion-5-') ? 4 : 3,
                prefer_brownian: true, negative_prompt: negative,
                width, height, steps: body.steps, scale: body.scale,
                seed: body.seed >= 0 ? body.seed : Math.floor(Math.random() * 9999999999),
                sampler: body.sampler, noise_schedule: body.scheduler, n_samples: 1,
                ucPreset: 0, qualityToggle: false, add_original_image: false,
                controlnet_strength: 1, deliberate_euler_ancestral_bug: false,
                dynamic_thresholding: body.decrisper, legacy: false, legacy_v3_extend: false,
                sm: body.sm, sm_dyn: body.sm_dyn, uncond_scale: 1,
                skip_cfg_above_sigma: null, use_coords: false, characterPrompts: [],
                reference_image_multiple: [], reference_information_extracted_multiple: [], reference_strength_multiple: [],
                v4_negative_prompt: { caption: { base_caption: negative, char_captions: [] } },
                v4_prompt: { caption: { base_caption: body.prompt, char_captions: [] }, use_coords: false, use_order: true },
            },
        } : null;

        const requestHeaders = direct
            ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            : this._ctx()?.getRequestHeaders?.() || {};

        const response = await fetch(direct ? 'https://image.novelai.net/ai/generate-image' : '/api/novelai/generate-image', {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(direct ? directBody : body),
            signal: options.signal,
        });

        if (!response.ok) {
            if (direct) {
                const detail = (await response.text().catch(() => '')).slice(0, 1000);
                throw new Error(`NovelAI HTTP ${response.status}: ${detail.replaceAll(token, '[redacted]') || response.statusText}`);
            }
            if (response.status === 400) throw new Error('NovelAI: укажите Access Token в секретах SillyTavern.');
            if (response.status === 404) throw new Error('NovelAI: сервер SillyTavern не поддерживает /api/novelai/generate-image. Обновите SillyTavern.');
            throw new Error(`NovelAI через SillyTavern: HTTP ${response.status}. Проверьте токен, модель и журнал сервера.`);
        }

        if (direct) return `data:image/png;base64,${await extractNovelAIPng(await response.arrayBuffer())}`;

        const base64 = (await response.text()).trim();
        if (!base64.startsWith('iVBORw0KGgo') || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
            throw new Error('NovelAI: SillyTavern вернул некорректное изображение.');
        }
        return `data:image/png;base64,${base64}`;
    }

    /* ─────────────────────────── OpenAI images API ─────────────────────────── */

    /** Port of generateImageOpenAI (2635-2736). refData is always empty here. */
    async generateImageOpenAI(prompt, style, settings, options = {}) {
        const url = buildOpenAIUrl(settings.endpoint, 'images/generations');
        const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;

        const promptParts = [];
        if (style) promptParts.push(`[Style: ${style}]`);
        for (const directive of textDirectives) promptParts.push(directive);
        for (const c of textOnlyClothing) promptParts.push(`[CLOTHING: ${c.charName} is wearing: ${c.description}]`);
        for (const ref of imageRefs) {
            if (ref.type === 'clothing' && ref.description) {
                promptParts.push(`[CLOTHING for ${ref.name}: ${ref.description}]`);
            }
        }
        promptParts.push(prompt);
        const fullPrompt = promptParts.join('\n\n');

        let size = settings.size;
        if (options.aspectRatio) {
            const [w, h] = String(options.aspectRatio).split(':').map(Number);
            if (w > 0 && h > 0) {
                if (w > h) size = '1536x1024';
                else if (w < h) size = '1024x1536';
                else size = '1024x1024';
            }
        }

        const body = {
            model: settings.model,
            prompt: fullPrompt,
            n: 1,
            response_format: 'b64_json',
        };

        const galleryNegative = options.negativePrompt == null
            ? this.getEffectiveNegativePrompt('')
            : String(options.negativePrompt || '').trim();
        if (galleryNegative) body.negative_prompt = galleryNegative;
        if (size && size !== 'auto') body.size = size;

        if (imageRefs.length === 1) {
            body.image = `data:${imageRefs[0].mimeType};base64,${imageRefs[0].data}`;
        } else if (imageRefs.length > 1) {
            body.image = imageRefs.map(ref => `data:${ref.mimeType};base64,${ref.data}`);
        }

        console.log(`[AstralImageGen] OpenAI Request: url=${url}, model=${body.model}, size=${body.size || 'auto'}, prompt=${fullPrompt.length} chars`);

        const response = await fetch(url, {
            method: 'POST',
            headers: buildAuthHeaders(settings.apiKey, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
            signal: options.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error (${response.status}): ${text}`);
        }

        const result = await response.json();
        const dataList = result.data || result.images || [];

        if (dataList.length === 0) {
            if (result.url) return result.url;
            if (result.image) return result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
            if (result.b64_json) return `data:image/png;base64,${result.b64_json}`;
            throw new Error('No image data in response');
        }

        const imageObj = dataList[0];
        const b64Data = imageObj.b64_json || imageObj.b64 || imageObj.base64 || imageObj.image;
        const urlData = imageObj.url || imageObj.uri;

        if (b64Data) {
            if (b64Data.startsWith('data:')) return b64Data;
            let mimeType = 'image/png';
            if (b64Data.startsWith('/9j/')) mimeType = 'image/jpeg';
            else if (b64Data.startsWith('UklGR')) mimeType = 'image/webp';
            return `data:${mimeType};base64,${b64Data}`;
        }

        if (urlData) return urlData;
        throw new Error('Unexpected image response format');
    }

    /* ─────────────────────────── OpenAI chat / routers ─────────────────────────── */

    /** Port of generateImageOpenAIChat (2809-2911). refData is always empty here. */
    async generateImageOpenAIChat(prompt, style, settings, options = {}) {
        const url = buildOpenAIUrl(settings.endpoint, 'chat/completions');
        const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;

        let aspectRatio = options.aspectRatio || settings.aspectRatio || '1:1';
        if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = '1:1';
        let imageSize = options.imageSize || settings.imageSize || '1K';
        if (!VALID_IMAGE_SIZES.includes(imageSize)) imageSize = '1K';

        const isGemini = isGeminiModel(settings.model || '') || settings.apiType === 'gemini';
        if (isGemini && settings.geminiRandomFormat && !options.aspectRatio) {
            aspectRatio = VALID_ASPECT_RATIOS[Math.floor(Math.random() * VALID_ASPECT_RATIOS.length)];
            console.log(`[AstralImageGen] Gemini random format (router): ${aspectRatio} ${imageSize}`);
        }

        const promptParts = [];
        promptParts.push('Generate an image from the following instruction. Return the generated image in the response.');
        promptParts.push(`[IMAGE SPECIFICATIONS: aspect ratio ${aspectRatio}, do NOT copy the aspect ratio from reference images, use ${aspectRatio} for the final output]`);
        if (style) promptParts.push(`[Art Style: ${style}]`);
        for (const directive of textDirectives) promptParts.push(directive);
        for (const c of textOnlyClothing) promptParts.push(`[CLOTHING: ${c.charName} is wearing: ${c.description}]`);
        for (const ref of imageRefs) {
            if (ref.type === 'face') promptParts.push(`[FACE REFERENCE: ${ref.name}] Copy this character's face and identity as closely as possible.`);
            if (ref.type === 'clothing') promptParts.push(`[CLOTHING REFERENCE for ${ref.name}: ${ref.description || ref.outfitName || 'copy the outfit only, not the face'}]`);
            if (ref.type === 'hairstyle') promptParts.push(`[HAIRSTYLE REFERENCE for ${ref.name}: copy only the hair, not the face]`);
        }
        promptParts.push(`[SCENE TO GENERATE]\n${prompt}`);

        const galleryNegative = options.negativePrompt == null
            ? this.getEffectiveNegativePrompt('')
            : String(options.negativePrompt || '').trim();
        if (galleryNegative) promptParts.push(`[NEGATIVE PROMPT: ${galleryNegative}]`);
        const fullPrompt = promptParts.join('\n\n');

        const content = [{ type: 'text', text: fullPrompt }];
        for (const ref of imageRefs) {
            content.push({
                type: 'image_url',
                image_url: { url: `data:${ref.mimeType};base64,${ref.data}` },
            });
        }

        const body = {
            model: settings.model,
            messages: [{ role: 'user', content }],
            modalities: ['image', 'text'],
        };

        // image_config for Gemini models via a router (OpenRouter, CloseRouter, rout.my)
        if (isRouterEndpoint(settings.endpoint)) {
            body.image_config = {
                aspect_ratio: aspectRatio,
                image_size: imageSize,
            };
        }

        console.log(`[AstralImageGen] OpenAI Chat/Router Request: url=${url}, model=${body.model}, aspect=${aspectRatio}, size=${imageSize}, prompt=${fullPrompt.length} chars`);

        const response = await fetch(url, {
            method: 'POST',
            headers: buildAuthHeaders(settings.apiKey, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
            signal: options.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`API Error (${response.status}): ${text.slice(0, 500)}`);
        }

        const result = await response.json().catch(() => null);
        if (!result) {
            throw new Error(`API returned non-JSON response (status ${response.status})`);
        }
        const image = parseImageFromApiResponse(result);
        if (!image) throw new Error('No image data in chat/completions response');
        return image;
    }

    /* ─────────────────────────── Gemini ─────────────────────────── */

    /** Port of generateImageGemini (2913-3114). refData is always empty here. */
    async generateImageGemini(prompt, style, settings, options = {}) {
        const model = settings.model;
        if (!model) throw new Error('Gemini: модель не выбрана (настройки haruspics).');
        const baseUrl = String(settings.endpoint || '').replace(/\/$/, '');
        const requestCandidates = buildGeminiRequestCandidates(baseUrl, model, settings.apiKey);

        let aspectRatio = options.aspectRatio || settings.aspectRatio || '1:1';
        if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = '1:1';
        let imageSize = options.imageSize || settings.imageSize || '1K';
        if (!VALID_IMAGE_SIZES.includes(imageSize)) imageSize = '1K';

        if (settings.apiType === 'gemini' && settings.geminiRandomFormat && !options.aspectRatio) {
            aspectRatio = VALID_ASPECT_RATIOS[Math.floor(Math.random() * VALID_ASPECT_RATIOS.length)];
            console.log(`[AstralImageGen] Gemini random format: ${aspectRatio} ${imageSize}`);
        }

        const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;
        const faceRefs = imageRefs.filter(r => r.type === 'face');
        const clothingImageRefs = imageRefs.filter(r => r.type === 'clothing');
        const hairstyleRefs = imageRefs.filter(r => r.type === 'hairstyle');

        const parts = [];

        // ===== PRE-INSTRUCTION (only with reference images) =====
        if (imageRefs.length > 0) {
            let preInstruction = `[CRITICAL INSTRUCTIONS FOR REFERENCE IMAGES]\n`;
            preInstruction += `You will receive ${imageRefs.length} reference image(s).\n`;
            preInstruction += `RULES:\n`;
            preInstruction += `1. FACE references have ABSOLUTE PRIORITY. Copy faces EXACTLY from face reference images.\n`;
            preInstruction += `2. CLOTHING references show ONLY the outfit design. Do NOT copy faces or body shapes from clothing images.\n`;
            preInstruction += `3. If a face in a clothing reference conflicts with a face reference, ALWAYS use the FACE reference.\n`;
            parts.push({ text: preInstruction });
        }

        // ===== FACE REFERENCES =====
        let refCounter = 0;
        for (const ref of faceRefs) {
            refCounter++;
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
            parts.push({
                text: `[FACE REFERENCE #${refCounter}: "${ref.name}"]\n`
                    + `This is the EXACT face and appearance of "${ref.name}".\n`
                    + `COPY IDENTICALLY: face shape, eye shape & color, nose, mouth, jawline, hair color & style, skin tone.\n`
                    + `Include ALL distinctive features (freckles, scars, moles, etc).\n`
                    + `DO NOT modify, stylize, or "improve" this face. REPRODUCE IT EXACTLY AS SHOWN.\n`,
            });
        }

        // ===== CLOTHING IMAGE REFERENCES =====
        for (const ref of clothingImageRefs) {
            refCounter++;
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
            let clothingLabel = `[CLOTHING-ONLY REFERENCE #${refCounter} for "${ref.name}": "${ref.outfitName || 'outfit'}"]\n`;
            clothingLabel += `⚠️ THIS IMAGE SHOWS ONLY CLOTHING/OUTFIT DESIGN.\n`;
            clothingLabel += `DO NOT copy any face, body shape, or person from this image.\n`;
            clothingLabel += `ONLY copy: garment type, fabric, colors, patterns, accessories, and overall style.\n`;
            clothingLabel += `"${ref.name}" MUST be wearing exactly this outfit.\n`;
            if (ref.description) clothingLabel += `Outfit details: ${ref.description}\n`;
            parts.push({ text: clothingLabel });
        }

        for (const ref of hairstyleRefs) {
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
            parts.push({ text: `[HAIRSTYLE REFERENCE for "${ref.name}"]: Copy only the hair, not the face. ${ref.description || ''}` });
        }

        // ===== BUILD MAIN PROMPT =====
        let fullPrompt = '';

        if (imageRefs.length > 0) {
            fullPrompt += `[CHARACTER & CLOTHING MAPPING]\n`;
            let idx = 0;
            for (const ref of faceRefs) {
                idx++;
                fullPrompt += `• "${ref.name}" = Face Reference #${idx} (COPY FACE EXACTLY)\n`;
            }
            for (const ref of clothingImageRefs) {
                idx++;
                fullPrompt += `• "${ref.name}'s outfit" = Clothing Reference #${idx} (COPY GARMENT ONLY, NOT FACE)\n`;
            }
            fullPrompt += `\nCRITICAL: Face features must be IDENTICAL to face references. Clothing references affect ONLY what characters wear.\n\n`;
        }

        if (textOnlyClothing.length > 0) {
            for (const c of textOnlyClothing) {
                fullPrompt += `[CLOTHING INSTRUCTION for "${c.charName}"]: ${c.charName} is wearing: ${c.description}\n\n`;
            }
        }

        if (textDirectives.length > 0) {
            for (const directive of textDirectives) fullPrompt += `${directive}\n\n`;
        }

        if (style) fullPrompt += `[Art Style: ${style}]\n\n`;

        const galleryNegative = this.getEffectiveNegativePrompt(options.negativePrompt);
        if (galleryNegative) fullPrompt += `[NEGATIVE PROMPT: ${galleryNegative}]\n\n`;

        fullPrompt += `[SCENE TO GENERATE]\n${prompt}\n[END SCENE]`;

        if (faceRefs.length > 0) {
            fullPrompt += `\n\n[FINAL REMINDER]\n`;
            fullPrompt += `The characters in this scene MUST look EXACTLY like their face reference images.\n`;
            fullPrompt += `Check each character's face against their reference before finalizing.\n`;
            if (clothingImageRefs.length > 0) {
                fullPrompt += `Clothing references affect ONLY the garments, NOT faces or body shapes.\n`;
            }
        }

        parts.push({ text: fullPrompt });

        const body = {
            contents: [{ role: 'user', parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio, imageSize },
            },
        };

        let bodyString;
        try {
            bodyString = JSON.stringify(body);
        } catch (serializeError) {
            throw new Error(`Failed to serialize request body: ${serializeError.message}`);
        }

        console.log(`[AstralImageGen] Gemini request: model=${model}, aspect=${aspectRatio}, size=${imageSize}, prompt=${fullPrompt.length} chars, body=${(bodyString.length / 1024).toFixed(1)}KB`);

        let response = null;
        let lastStatus = 0;
        let lastText = '';

        for (const candidate of requestCandidates) {
            console.log(`[AstralImageGen] Gemini endpoint candidate: ${candidate.url}`);
            const res = await fetch(candidate.url, {
                method: 'POST',
                headers: candidate.headers,
                body: bodyString,
                signal: options.signal,
            });

            if (res.ok) {
                response = res;
                break;
            }

            lastStatus = res.status;
            lastText = await res.text().catch(() => '');
            console.warn(`[AstralImageGen] Gemini endpoint failed (${res.status}) ${candidate.url} :: ${lastText.substring(0, 200)}`);
        }

        if (!response) {
            throw new Error(`API Error (${lastStatus || '?'}): ${lastText || 'All Gemini endpoints failed'}`);
        }

        const result = await response.json();
        const candidates = result.candidates || [];
        if (candidates.length === 0) throw new Error('No candidates in response');

        const responseParts = candidates[0].content?.parts || [];
        for (const part of responseParts) {
            if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            if (part.inline_data) return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
        }
        throw new Error('No image found in Gemini response');
    }
}

export default ImageGenerator;