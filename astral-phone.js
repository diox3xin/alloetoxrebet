var AstralPhone = (() => {
  // apps/phone-core.js
  var ICONS = {
    home: `<svg viewBox="0 0 24 24"><path d="M12 3.2l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 13.7 7.8 16.2l1.1-4.8L5.2 8.2l4.9-.4z"/></svg>`,
    messages: `<svg viewBox="0 0 24 24"><path d="M20.5 12.2c0 4-3.8 7.2-8.5 7.2-1 0-2-.1-2.9-.4L4 20.5l1.3-3.5C4.2 15.6 3.5 14 3.5 12.2c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke-width="2"/></svg>`,
    gallery: `<svg viewBox="0 0 24 24"><rect x="3.2" y="5.4" width="17.6" height="13.2" rx="3"/><circle cx="12" cy="12" r="3.6"/><path d="M17.4 8.4h.01" stroke-width="2.4"/></svg>`,
    spicy: `<svg viewBox="0 0 24 24"><path d="M12 21c3.6 0 6.4-2.6 6.4-6.2 0-4.4-4.3-6.6-4.3-10.8-2.2 1-3.3 3-3.3 5.2 0 1.4.4 2.2.4 2.2-1.4-.6-2.4-2-2.4-3.6-1.6 1.6-2.6 3.9-2.6 6.4C6.2 18.2 8.6 21 12 21z"/></svg>`,
    creator: `<svg viewBox="0 0 24 24"><path d="M12 2.8l3.1 5.9 6.3 1-4.6 4.4 1.1 6.4-5.9-3.2-5.9 3.2 1.1-6.4L2.6 9.7l6.3-1z"/></svg>`
  };
  var PhoneCore = class {
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.apps = /* @__PURE__ */ new Map();
      this.currentAppId = null;
      this.overlay = null;
      this.bodyEl = null;
      this.titleEl = null;
      this.iconEl = null;
      this.backEl = null;
      this.timeEl = null;
      this.isOpen = false;
      this._clockTimer = null;
      this._onKeyDown = (e) => {
        if (e.key === "Escape") {
          if (this.currentAppId) this.showHome();
          else this.close();
        }
      };
    }
    registerApp(id, appInstance) {
      if (typeof appInstance.render !== "function") {
        throw new Error(`App "${id}" must implement render(container, params)`);
      }
      this.apps.set(id, appInstance);
    }
    /* ─────────────────────────── open / close ─────────────────────────── */
    open() {
      if (!this.overlay) this._build();
      this.overlay.classList.add("active");
      this.isOpen = true;
      this.showHome();
      this._startClock();
      document.addEventListener("keydown", this._onKeyDown);
      document.body.style.overflow = "hidden";
    }
    close() {
      if (!this.isOpen) return;
      this.overlay.classList.remove("active");
      this.isOpen = false;
      this._stopClock();
      document.removeEventListener("keydown", this._onKeyDown);
      document.body.style.overflow = "";
    }
    toggle() {
      this.isOpen ? this.close() : this.open();
    }
    /* ─────────────────────────── navigation ─────────────────────────── */
    showHome() {
      this.currentAppId = null;
      if (!this.overlay) return;
      this.backEl.style.visibility = "hidden";
      this.iconEl.innerHTML = ICONS.home;
      this.titleEl.textContent = "Astral";
      this.bodyEl.innerHTML = "";
      this._renderHome();
    }
    openApp(appId, params = {}) {
      const app = this.apps.get(appId);
      if (!app) {
        console.warn(`[Astral Phone] App "${appId}" is not registered`);
        return;
      }
      this.currentAppId = appId;
      this.backEl.style.visibility = "visible";
      this.iconEl.innerHTML = app.icon || ICONS.home;
      this.titleEl.textContent = app.title || appId;
      this.bodyEl.innerHTML = "";
      this.bodyEl.scrollTop = 0;
      try {
        app.render(this.bodyEl, params);
      } catch (err) {
        console.error(`[Astral Phone] App "${appId}" failed to render:`, err);
        this.bodyEl.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">\u26A0</div>
                    <div>${this._esc(err.message)}</div>
                </div>`;
      }
    }
    /** Re-render the currently open app (used after an event lands). */
    refresh() {
      if (this.isOpen && this.currentAppId) this.openApp(this.currentAppId);
    }
    /* ─────────────────────────── DOM ─────────────────────────── */
    _build() {
      const overlay = document.createElement("div");
      overlay.id = "astral-phone-overlay";
      overlay.innerHTML = `
            <div class="astral-phone">
                <div class="astral-nebula"></div>
                <div class="astral-phone-notch"></div>

                <div class="astral-phone-statusbar">
                    <span class="astral-sb-time">--:--</span>
                    <div class="astral-sb-right">
                        <span class="astral-signal-bars"><i></i><i></i><i></i><i></i></span>
                        <span class="astral-battery"></span>
                    </div>
                </div>

                <div class="astral-phone-header">
                    <span class="astral-back-btn">\u2039</span>
                    <div class="astral-app-icon">${ICONS.home}</div>
                    <div class="astral-app-title">Astral</div>
                    <div class="astral-phone-close" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">\u2715</div>
                </div>

                <div class="astral-phone-body"></div>
            </div>
        `;
      document.body.appendChild(overlay);
      this.overlay = overlay;
      this.bodyEl = overlay.querySelector(".astral-phone-body");
      this.titleEl = overlay.querySelector(".astral-app-title");
      this.iconEl = overlay.querySelector(".astral-app-icon");
      this.backEl = overlay.querySelector(".astral-back-btn");
      this.timeEl = overlay.querySelector(".astral-sb-time");
      overlay.querySelector(".astral-phone-close").addEventListener("click", () => this.close());
      this.backEl.addEventListener("click", () => {
        if (this.currentAppId) this.showHome();
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.close();
      });
    }
    _renderHome() {
      const grid = document.createElement("div");
      grid.className = "astral-home-grid";
      for (const [id, app] of this.apps.entries()) {
        const card = document.createElement("div");
        card.className = "astral-app-card";
        card.innerHTML = `
                <div class="astral-app-card-icon">${app.icon || ICONS.home}</div>
                <div class="astral-app-card-label">${this._esc(app.title || id)}</div>
            `;
        card.addEventListener("click", () => this.openApp(id));
        grid.appendChild(card);
      }
      this.bodyEl.appendChild(grid);
    }
    _startClock() {
      this._tick();
      if (!this._clockTimer) this._clockTimer = setInterval(() => this._tick(), 2e4);
    }
    _stopClock() {
      if (this._clockTimer) {
        clearInterval(this._clockTimer);
        this._clockTimer = null;
      }
    }
    _tick() {
      if (!this.timeEl) return;
      this.timeEl.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    /* ─────────────────────────── events from the model ─────────────────────────── */
    async handleEvent(eventData) {
      const { type, ...data } = eventData || {};
      const routing = {
        photo_taken: "gallery",
        message_received: "messages",
        content_posted: "creator",
        donation_received: "creator",
        subscriber_joined: "creator",
        spicy_posted: "spicy"
      };
      const appId = routing[type];
      if (!appId) return { success: false, error: `Unknown event type: ${type}` };
      const app = this.apps.get(appId);
      if (!app || typeof app.handleEvent !== "function") {
        return { success: false, error: `App "${appId}" cannot handle events` };
      }
      try {
        const result = await app.handleEvent({ type, ...data });
        this.refresh();
        return result || { success: true };
      } catch (err) {
        console.error("[Astral Phone] Event handling failed:", err);
        return { success: false, error: err.message };
      }
    }
    /* ─────────────────────────── utils ─────────────────────────── */
    _esc(str) {
      return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  };

  // apps/storage.js
  var PhoneStorage = class {
    constructor(context) {
      this.context = context;
      this.key = "astral_phone";
    }
    _root() {
      if (!this.context.chat_metadata) {
        this.context.chat_metadata = {};
      }
      if (!this.context.chat_metadata[this.key]) {
        this.context.chat_metadata[this.key] = {};
      }
      return this.context.chat_metadata[this.key];
    }
    _defaults() {
      return {
        messages: [],
        gallery: [],
        spicy: [],
        creator: {
          posts: [],
          subscribers: 0,
          revenue: 0,
          fans: []
        }
      };
    }
    /**
     * Get state. The chat is implicit — chat_metadata is already per-chat,
     * so the `chatId` argument is accepted for API compatibility and ignored.
     */
    getState() {
      const root = this._root();
      if (!root.state) root.state = this._defaults();
      const d = this._defaults();
      for (const k of Object.keys(d)) {
        if (root.state[k] === void 0) root.state[k] = d[k];
      }
      if (!root.state.creator) root.state.creator = d.creator;
      for (const k of Object.keys(d.creator)) {
        if (root.state.creator[k] === void 0) root.state.creator[k] = d.creator[k];
      }
      return root.state;
    }
    setState(_chatId, state) {
      this._root().state = state;
      this.save();
    }
    updateState(_chatId, partial) {
      const state = this.getState();
      for (const key of Object.keys(partial)) {
        const val = partial[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          state[key] = { ...state[key] || {}, ...val };
        } else {
          state[key] = val;
        }
      }
      this.save();
      return state;
    }
    save() {
      try {
        this.context.updateChatMetadata?.(null, true);
      } catch (err) {
        console.warn("[Astral Phone] Could not persist chat metadata:", err);
      }
    }
    reset() {
      this._root().state = this._defaults();
      this.save();
    }
  };

  // apps/image-gen.js
  var MODULE_NAME = "inline_image_gen";
  var VALID_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
  var VALID_IMAGE_SIZES = ["1K", "2K", "4K"];
  var NAISTERA_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
  var NOVELAI_MODELS = [
    "nai-diffusion-5-full",
    "nai-diffusion-5-curated",
    "nai-diffusion-4-5-full",
    "nai-diffusion-4-5-curated",
    "nai-diffusion-4-full",
    "nai-diffusion-4-curated-preview",
    "nai-diffusion-3",
    "nai-diffusion-2",
    "nai-diffusion-furry-3"
  ];
  var DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    apiType: "openai",
    endpoint: "",
    apiKey: "",
    model: "",
    naisteraModel: "",
    naisteraAspectRatio: "1:1",
    naisteraNegativePrompt: "",
    naisteraPreset: "",
    naisteraCharacterDescriptionsMode: "as-is",
    naisteraPolling: false,
    naisteraPollIntervalMs: 3e3,
    naisteraPollTimeoutMs: 6e5,
    novelaiModel: "nai-diffusion-5-full",
    novelaiApiKey: "",
    novelaiWidth: 832,
    novelaiHeight: 1216,
    novelaiSteps: 28,
    novelaiScale: 5,
    novelaiSampler: "k_dpmpp_2m",
    novelaiScheduler: "karras",
    novelaiNegativePrompt: "",
    novelaiSeed: -1,
    novelaiSm: false,
    novelaiSmDyn: false,
    novelaiDecrisper: false,
    novelaiVarietyBoost: false,
    size: "1024x1024",
    quality: "standard",
    maxRetries: 0,
    retryDelay: 1e3,
    requestTimeout: 120,
    aspectRatio: "1:1",
    imageSize: "1K",
    geminiRandomFormat: false,
    negativeGalleryItems: [],
    activeNegativeId: ""
  });
  var EMPTY_REFS = Object.freeze({ imageRefs: [], textOnlyClothing: [], textDirectives: [] });
  function isGeminiModel(modelId) {
    return /nano-banana|gemini|flash-image|imagen/i.test(String(modelId || ""));
  }
  function normalizeOpenAIBaseUrl(endpoint) {
    return (endpoint || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
  }
  function buildOpenAIUrl(endpoint, path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return `${normalizeOpenAIBaseUrl(endpoint)}/v1/${cleanPath}`;
  }
  function isRouterEndpoint(endpoint) {
    const lower = (endpoint || "").toLowerCase();
    return lower.includes("closerouter") || lower.includes("openrouter") || lower.includes("rout.my");
  }
  function normalizeApiKey(apiKey) {
    return String(apiKey ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/^Bearer\s+/i, "").replace(/\s+/g, "").trim();
  }
  function buildAuthHeaders(apiKey, extra = {}) {
    return {
      ...extra,
      "Authorization": `Bearer ${normalizeApiKey(apiKey)}`
    };
  }
  function buildGeminiRequestCandidates(baseUrl, model, apiKey) {
    const clean = String(baseUrl || "").replace(/\/$/, "");
    const lower = clean.toLowerCase();
    const cleanApiKey = normalizeApiKey(apiKey);
    if (lower.includes("googleapis.com")) {
      return [{
        url: `${clean}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanApiKey)}`,
        headers: { "Content-Type": "application/json" }
      }];
    }
    const candidates = [];
    const pushCandidate = (url) => {
      if (!candidates.some((candidate) => candidate.url === url)) {
        candidates.push({
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cleanApiKey}`
          }
        });
      }
    };
    if (/\/v1beta$/i.test(clean)) {
      pushCandidate(`${clean}/models/${model}:generateContent`);
      pushCandidate(`${clean.replace(/\/v1beta$/i, "")}/v1/models/${model}:generateContent`);
    } else if (/\/v1$/i.test(clean)) {
      pushCandidate(`${clean.replace(/\/v1$/i, "")}/v1beta/models/${model}:generateContent`);
      pushCandidate(`${clean}/models/${model}:generateContent`);
    } else {
      pushCandidate(`${clean}/v1beta/models/${model}:generateContent`);
      pushCandidate(`${clean}/v1/models/${model}:generateContent`);
      pushCandidate(`${clean}/models/${model}:generateContent`);
    }
    return candidates;
  }
  function normalizeNaisteraModel(model) {
    return String(model || "").trim();
  }
  function isNaisteraNovelAIModel(model) {
    return /^novelai(?:-|$)/i.test(normalizeNaisteraModel(model));
  }
  function normalizeNaisteraCharacterDescriptionsMode(value) {
    return ["none", "as-is", "character-prompt"].includes(value) ? value : "as-is";
  }
  function normalizeNaisteraEndpoint(endpoint) {
    const value = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!value) return "https://naistera.org";
    return value.replace(/\/api\/(?:generate|models)$/i, "");
  }
  function formatNaisteraDescription(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (value.charName || value.description) {
        return `[CLOTHING: ${value.charName || "Character"} is wearing: ${value.description || ""}]`;
      }
      return Object.values(value).filter(Boolean).join(" ");
    }
    return String(value);
  }
  function normalizeReturnedImage(value) {
    if (!value) return null;
    if (typeof value !== "string") return null;
    const clean = value.trim();
    if (!clean) return null;
    if (clean.startsWith("data:image/")) return clean;
    if (/^https?:\/\//i.test(clean)) return clean;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(clean) && clean.length > 100) {
      const compact = clean.replace(/\s+/g, "");
      let mimeType = "image/png";
      if (compact.startsWith("/9j/")) mimeType = "image/jpeg";
      else if (compact.startsWith("UklGR")) mimeType = "image/webp";
      return `data:${mimeType};base64,${compact}`;
    }
    return null;
  }
  function extractImageFromText(text) {
    if (!text || typeof text !== "string") return null;
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
      if (typeof value === "string") candidates.push(value);
      else if (typeof value === "object") {
        candidates.push(value.url, value.uri, value.b64_json, value.b64, value.base64, value.image);
        candidates.push(value.image_url?.url, value.image_url);
        if (value.data) candidates.push(value.data);
      }
    };
    push(result?.url);
    push(result?.uri);
    push(result?.image);
    push(result?.b64_json);
    for (const item of result?.data || []) push(item);
    for (const item of result?.images || []) push(item);
    for (const choice of result?.choices || []) {
      const message = choice?.message || choice?.delta || {};
      push(message.image);
      push(message.image_url);
      for (const image of message.images || []) push(image);
      const content = message.content;
      if (typeof content === "string") candidates.push(content);
      else if (Array.isArray(content)) {
        for (const part of content) {
          push(part);
          push(part?.image_url);
          push(part?.image);
          if (part?.type === "text") push(part.text);
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
    const push = (value) => {
      if (value == null) return;
      if (typeof value === "string") candidates.push(value);
      if (typeof value === "object") {
        candidates.push(
          value.data_url,
          value.url,
          value.uri,
          value.image,
          value.b64_json,
          value.b64,
          value.base64
        );
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
      if (typeof candidate === "string" && /^[A-Za-z0-9+/=\r\n]+$/.test(candidate) && candidate.length > 100) {
        return `data:image/png;base64,${candidate.replace(/\s+/g, "")}`;
      }
    }
    return null;
  }
  async function extractNovelAIPng(archive) {
    const bytes = new Uint8Array(archive);
    if (bytes.length < 22 || bytes.length > 60 * 1024 * 1024) throw new Error("NovelAI \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B ZIP \u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C.");
    const view = new DataView(archive);
    const uint16 = (offset2) => view.getUint16(offset2, true);
    const uint32 = (offset2) => view.getUint32(offset2, true);
    let end = -1;
    for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
      if (uint32(pos) === 101010256 && pos + 22 + uint16(pos + 20) === bytes.length) {
        end = pos;
        break;
      }
    }
    if (end < 0) throw new Error("NovelAI \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B ZIP \u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C.");
    const entries = uint16(end + 10);
    let offset = uint32(end + 16);
    if (entries > 100 || offset >= end) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ZIP-\u043E\u0442\u0432\u0435\u0442 NovelAI.");
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > end || uint32(offset) !== 33639248) break;
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
      if (name.toLowerCase().endsWith(".png") && !name.startsWith("__MACOSX/")) {
        if (flags & 1 || ![0, 8].includes(method) || localOffset + 30 > bytes.length || uint32(localOffset) !== 67324752) break;
        const start = localOffset + 30 + uint16(localOffset + 26) + uint16(localOffset + 28);
        if (start + length > bytes.length || length > 50 * 1024 * 1024) break;
        const compressed = bytes.subarray(start, start + length);
        const png = method === 0 ? compressed : new Uint8Array(await new Response(
          new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
        ).arrayBuffer());
        if (png.length > 50 * 1024 * 1024 || png.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => png[i] === byte)) {
          throw new Error("NovelAI \u0432\u0435\u0440\u043D\u0443\u043B ZIP \u0431\u0435\u0437 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0433\u043E PNG.");
        }
        let base64 = "";
        for (let i = 0; i < png.length; i += 24576) {
          base64 += String.fromCharCode(...png.subarray(i, i + 24576));
        }
        return btoa(base64);
      }
      offset = next;
    }
    throw new Error("NovelAI \u0432\u0435\u0440\u043D\u0443\u043B ZIP \u0431\u0435\u0437 PNG.");
  }
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 24576;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }
  var ImageGenerator = class {
    /**
     * @param {object} context SillyTavern context (getContext()) — provides
     *   getRequestHeaders(), characters, characterId, extensionSettings.
     */
    constructor(context) {
      this.context = context || null;
      this._naisteraCatalog = /* @__PURE__ */ new Map();
      this._naisteraCatalogFetchedAt = 0;
      this._naisteraCatalogFetchedFor = "";
    }
    /* ─────────────────────────── settings access ─────────────────────────── */
    _ctx() {
      if (this.context) return this.context;
      try {
        const st = globalThis.SillyTavern?.getContext?.();
        if (st) return st;
      } catch (_) {
      }
      return null;
    }
    /** Raw haruspics settings object, or null when the extension is not installed. */
    _rawSettings() {
      try {
        const bag = globalThis.extension_settings;
        if (bag && typeof bag === "object") {
          const s = bag[MODULE_NAME];
          if (s && typeof s === "object") return s;
        }
      } catch (_) {
      }
      try {
        const s = this._ctx()?.extensionSettings?.[MODULE_NAME];
        if (s && typeof s === "object") return s;
      } catch (_) {
      }
      return null;
    }
    /** Settings merged with defaults; throws when haruspics is missing. */
    _settings() {
      const raw = this._rawSettings();
      if (!raw) throw this._notInstalledError();
      const merged = { ...DEFAULT_SETTINGS, ...raw };
      if (merged.apiType === "novelai-custom") merged.apiType = "novelai-direct";
      return merged;
    }
    _notInstalledError() {
      return new Error("Haruspics \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D: \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 inline_image_gen \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E. \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 haruspics-naistera \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.");
    }
    getEffectiveNegativePrompt(tagNegativePrompt = "") {
      let settings;
      try {
        settings = this._settings();
      } catch (_) {
        return String(tagNegativePrompt || "").trim();
      }
      const item = (settings.negativeGalleryItems || []).find((candidate) => candidate.id === settings.activeNegativeId);
      return String(tagNegativePrompt || "").trim() || String(item?.prompt || "").trim();
    }
    /* ─────────────────────────── availability ─────────────────────────── */
    /**
     * True when the haruspics extension is present and its current provider has
     * a model plus usable credentials — mirrors haruspics validateSettings().
     */
    isAvailable() {
      const s = this._rawSettings();
      if (!s) return false;
      const apiType = s.apiType === "novelai-custom" ? "novelai-direct" : s.apiType || "openai";
      if (apiType === "naistera") {
        if (!normalizeNaisteraModel(s.naisteraModel)) return false;
        return Boolean(String(s.apiKey || "").trim());
      }
      if (apiType === "novelai") {
        return NOVELAI_MODELS.includes(String(s.novelaiModel || "").trim());
      }
      if (apiType === "novelai-direct") {
        return NOVELAI_MODELS.includes(String(s.novelaiModel || "").trim()) && Boolean(normalizeApiKey(s.novelaiApiKey));
      }
      if (!String(s.endpoint || "").trim()) return false;
      if (!String(s.apiKey || "").trim()) return false;
      if (!String(s.model || "").trim()) return false;
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
      const text = String(prompt ?? "").trim();
      if (!text) throw new Error("\u041F\u0443\u0441\u0442\u043E\u0439 \u043F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F.");
      const dataUrl = await this._generateWithTimeout(text, settings);
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
        throw new Error("SillyTavern context \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435.");
      }
      if (dataUrl && !dataUrl.startsWith("data:") && (dataUrl.startsWith("http://") || dataUrl.startsWith("https://"))) {
        try {
          const remoteResponse = await fetch(dataUrl);
          if (!remoteResponse.ok) throw new Error(`HTTP ${remoteResponse.status}`);
          const mimeType = (remoteResponse.headers.get("content-type") || "image/png").split(";")[0].trim() || "image/png";
          const buf = await remoteResponse.arrayBuffer();
          dataUrl = `data:${mimeType};base64,${arrayBufferToBase64(buf)}`;
        } catch (err) {
          throw new Error(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043F\u043E URL: ${err?.message || err}`);
        }
      }
      const match = String(dataUrl || "").match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!match) throw new Error("\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0432 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u043C \u0444\u043E\u0440\u043C\u0430\u0442\u0435 (\u043E\u0436\u0438\u0434\u0430\u043B\u0441\u044F data URL \u0438\u043B\u0438 http(s) URL).");
      const format = match[1];
      const base64Data = match[2];
      let charName = "generated";
      if (chName && String(chName).trim()) {
        charName = String(chName).trim();
      } else if (context.characterId !== void 0 && context.characters?.[context.characterId]) {
        charName = context.characters[context.characterId].name || "generated";
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const filename = `astral_${timestamp}`;
      const response = await fetch("/api/images/upload", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body: JSON.stringify({ image: base64Data, format, ch_name: charName, filename })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Upload failed: ${response.status}`);
      }
      const result = await response.json();
      if (!result?.path) throw new Error("SillyTavern \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0443\u0442\u044C \u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u043E\u043C\u0443 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044E.");
      return result.path;
    }
    /* ─────────────────────────── dispatch + timeout ─────────────────────────── */
    /** Port of generateImageWithRetry (3136-3213) with retries and toasts removed. */
    async _generateWithTimeout(prompt, settings) {
      const timeoutMs = Math.max(5, Number(settings.requestTimeout) || 120) * 1e3;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const options = { signal: controller.signal };
      try {
        const isRouterApi = isRouterEndpoint(settings.endpoint);
        const useGeminiApi = settings.apiType === "gemini" && !isRouterApi;
        if (settings.apiType === "naistera") {
          return await this.generateImageNaistera(prompt, "", settings, options);
        }
        if (["novelai", "novelai-direct"].includes(settings.apiType)) {
          return await this.generateImageNovelAI(prompt, "", settings, options);
        }
        const useChatApi = settings.apiType === "openai-chat" || isRouterApi && (settings.apiType === "openai" || settings.apiType === "gemini");
        if (useGeminiApi) {
          return await this.generateImageGemini(prompt, "", settings, options);
        }
        if (useChatApi) {
          return await this.generateImageOpenAIChat(prompt, "", settings, options);
        }
        return await this.generateImageOpenAI(prompt, "", settings, options);
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error(`\u0422\u0430\u0439\u043C\u0430\u0443\u0442: \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u0437\u0430 ${Math.round(timeoutMs / 1e3)}\u0441`);
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
      const fresh = Date.now() - this._naisteraCatalogFetchedAt < 5 * 60 * 1e3;
      if (fresh && this._naisteraCatalogFetchedFor === endpoint && this._naisteraCatalog.size > 0) return;
      const headers = { Accept: "application/json" };
      if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
      try {
        const response = await fetch(`${endpoint}/api/models`, { method: "GET", headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const models = (Array.isArray(payload?.models) ? payload.models : []).filter((model) => model?.id && model.visible !== false && model.deprecated !== true).map((model) => ({
          id: String(model.id),
          name: String(model.name || model.id),
          references: model.references !== false,
          negativePrompt: model.negative_prompt === true
        }));
        this._naisteraCatalog = new Map(models.map((model) => [model.id, model]));
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
      const intervalMs = Math.max(1e3, Math.min(3e4, Number(settings.naisteraPollIntervalMs) || 3e3));
      const timeoutMs = Math.max(3e4, Math.min(9e5, Number(settings.naisteraPollTimeoutMs) || 6e5));
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (signal?.aborted) throw new Error("\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430 (\u0442\u0430\u0439\u043C\u0430\u0443\u0442)");
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            Accept: "application/json"
          },
          signal
        });
        const text = await response.text().catch(() => "");
        let result = null;
        try {
          result = text ? JSON.parse(text) : null;
        } catch (_) {
        }
        if (!response.ok) {
          throw new Error(`Naistera polling error (${response.status}): ${text.slice(0, 800)}`);
        }
        if (extractNaisteraDataUrl(result)) return result;
        const status = String(result?.status || "").toLowerCase();
        if (status === "failed" || result?.error) {
          throw new Error(`Naistera generation failed: ${result?.detail || result?.error?.detail || result?.error || "Unknown error"}`);
        }
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, intervalMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
      throw new Error(`Naistera polling timed out after ${Math.round(timeoutMs / 1e3)}s`);
    }
    /** Port of generateImageNaistera (2394-2494). refData is always empty here. */
    async generateImageNaistera(prompt, style, settings, options = {}) {
      const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
      const model = normalizeNaisteraModel(settings.naisteraModel);
      if (!model) throw new Error("Naistera: \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 (\u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 haruspics).");
      if (!this.getNaisteraModelInfo(model)) {
        await this._ensureNaisteraCatalog(settings);
      }
      const modelInfo = this.getNaisteraModelInfo(model);
      const descriptionMode = normalizeNaisteraCharacterDescriptionsMode(settings.naisteraCharacterDescriptionsMode);
      const { imageRefs, textOnlyClothing, textDirectives } = EMPTY_REFS;
      const promptParts = [];
      if (style) promptParts.push(isNaisteraNovelAIModel(model) ? style : `[Style: ${style}]`);
      if (descriptionMode === "as-is") {
        promptParts.push(...textDirectives);
        for (const clothing of textOnlyClothing) {
          promptParts.push(`[CLOTHING: ${clothing.charName || "Character"} is wearing: ${clothing.description || ""}]`);
        }
      }
      if (descriptionMode === "character-prompt") {
        const descriptions = [...textDirectives, ...textOnlyClothing].map(formatNaisteraDescription).filter(Boolean);
        if (descriptions.length > 0) promptParts.push(`[CHARACTER DESCRIPTIONS]
${descriptions.join("\n")}`);
      }
      promptParts.push(prompt);
      let aspectRatio = options.aspectRatio || settings.naisteraAspectRatio || "1:1";
      const isNaisteraNanaBanana = isGeminiModel(model);
      if (isNaisteraNanaBanana && settings.geminiRandomFormat && !options.aspectRatio) {
        aspectRatio = NAISTERA_RATIOS[Math.floor(Math.random() * NAISTERA_RATIOS.length)];
        console.log(`[AstralImageGen] Naistera random format (nano-banana): ${aspectRatio}`);
      }
      const body = {
        prompt: promptParts.join("\n\n"),
        aspect_ratio: aspectRatio,
        model
      };
      const selectedGalleryNegative = options.negativePrompt == null ? this.getEffectiveNegativePrompt("") : String(options.negativePrompt || "").trim();
      const negativePrompt = selectedGalleryNegative || String(settings.naisteraNegativePrompt || "").trim();
      if (negativePrompt && modelInfo?.negativePrompt === true) body.negative_prompt = negativePrompt;
      const preset = String(options.preset ?? settings.naisteraPreset ?? "").trim();
      if (preset) body.preset = preset;
      if (imageRefs.length > 0 && modelInfo?.references !== false) {
        body.reference_objects = imageRefs.map((ref) => ({
          image: `data:${ref.mimeType || "image/png"};base64,${ref.data}`,
          description: descriptionMode === "none" ? "" : ref.description || ref.outfitName || ref.name || ""
        })).filter((ref) => ref.image);
      }
      if (settings.naisteraPolling) body.sync = false;
      console.log(`[AstralImageGen] Naistera request: endpoint=${endpoint}, model=${model}, polling=${!!settings.naisteraPolling}`);
      const response = await fetch(`${endpoint}/api/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: options.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Naistera API error (${response.status}): ${text.slice(0, 800)}`);
      }
      let result = await response.json();
      if (result?.job_id && !extractNaisteraDataUrl(result)) {
        result = await this.pollNaisteraJob(endpoint, result.job_id, settings, options.signal);
      }
      const dataUrl = extractNaisteraDataUrl(result);
      if (!dataUrl) throw new Error("Naistera response does not contain an image");
      return dataUrl;
    }
    /* ─────────────────────────── NovelAI ─────────────────────────── */
    /** Port of generateImageNovelAI (2545-2633). refData is always empty here. */
    async generateImageNovelAI(prompt, style, settings, options = {}) {
      const parts = [];
      if (style) parts.push(style);
      parts.push(...EMPTY_REFS.textDirectives);
      for (const clothing of EMPTY_REFS.textOnlyClothing) {
        if (clothing.description) parts.push(`${clothing.charName || "Character"} is wearing: ${clothing.description}`);
      }
      for (const ref of EMPTY_REFS.imageRefs) {
        if (ref.type === "clothing" && ref.description) parts.push(`${ref.name || "Character"} is wearing: ${ref.description}`);
      }
      parts.push(prompt);
      const ratio = String(options.aspectRatio || "");
      let width = Number(settings.novelaiWidth);
      let height = Number(settings.novelaiHeight);
      if (/^\d+:\d+$/.test(ratio)) {
        const [w, h] = ratio.split(":").map(Number);
        if (w > 0 && h > 0 && w / h >= 0.4 && w / h <= 2.5) {
          const area = width * height;
          width = Math.round(Math.sqrt(area * w / h) / 64) * 64;
          height = Math.round(Math.sqrt(area * h / w) / 64) * 64;
        }
      }
      const body = {
        prompt: parts.filter(Boolean).join(", "),
        model: settings.novelaiModel,
        negative_prompt: (options.negativePrompt == null ? this.getEffectiveNegativePrompt("") : String(options.negativePrompt || "").trim()) || String(settings.novelaiNegativePrompt || "").trim(),
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
        variety_boost: settings.novelaiVarietyBoost
      };
      const direct = settings.apiType === "novelai-direct";
      const token = direct ? normalizeApiKey(settings.novelaiApiKey) : "";
      if (direct && !token) throw new Error("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 NovelAI Access Token \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 haruspics.");
      console.log(`[AstralImageGen] NovelAI ${direct ? "direct" : "SillyTavern"}: model=${body.model}, size=${width}x${height}, text=${body.prompt.length} chars`);
      const negative = body.negative_prompt || "";
      const directBody = direct ? {
        action: "generate",
        input: body.prompt,
        model: body.model,
        parameters: {
          params_version: body.model.startsWith("nai-diffusion-5-") ? 4 : 3,
          prefer_brownian: true,
          negative_prompt: negative,
          width,
          height,
          steps: body.steps,
          scale: body.scale,
          seed: body.seed >= 0 ? body.seed : Math.floor(Math.random() * 9999999999),
          sampler: body.sampler,
          noise_schedule: body.scheduler,
          n_samples: 1,
          ucPreset: 0,
          qualityToggle: false,
          add_original_image: false,
          controlnet_strength: 1,
          deliberate_euler_ancestral_bug: false,
          dynamic_thresholding: body.decrisper,
          legacy: false,
          legacy_v3_extend: false,
          sm: body.sm,
          sm_dyn: body.sm_dyn,
          uncond_scale: 1,
          skip_cfg_above_sigma: null,
          use_coords: false,
          characterPrompts: [],
          reference_image_multiple: [],
          reference_information_extracted_multiple: [],
          reference_strength_multiple: [],
          v4_negative_prompt: { caption: { base_caption: negative, char_captions: [] } },
          v4_prompt: { caption: { base_caption: body.prompt, char_captions: [] }, use_coords: false, use_order: true }
        }
      } : null;
      const requestHeaders = direct ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : this._ctx()?.getRequestHeaders?.() || {};
      const response = await fetch(direct ? "https://image.novelai.net/ai/generate-image" : "/api/novelai/generate-image", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(direct ? directBody : body),
        signal: options.signal
      });
      if (!response.ok) {
        if (direct) {
          const detail = (await response.text().catch(() => "")).slice(0, 1e3);
          throw new Error(`NovelAI HTTP ${response.status}: ${detail.replaceAll(token, "[redacted]") || response.statusText}`);
        }
        if (response.status === 400) throw new Error("NovelAI: \u0443\u043A\u0430\u0436\u0438\u0442\u0435 Access Token \u0432 \u0441\u0435\u043A\u0440\u0435\u0442\u0430\u0445 SillyTavern.");
        if (response.status === 404) throw new Error("NovelAI: \u0441\u0435\u0440\u0432\u0435\u0440 SillyTavern \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 /api/novelai/generate-image. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 SillyTavern.");
        throw new Error(`NovelAI \u0447\u0435\u0440\u0435\u0437 SillyTavern: HTTP ${response.status}. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0442\u043E\u043A\u0435\u043D, \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u0436\u0443\u0440\u043D\u0430\u043B \u0441\u0435\u0440\u0432\u0435\u0440\u0430.`);
      }
      if (direct) return `data:image/png;base64,${await extractNovelAIPng(await response.arrayBuffer())}`;
      const base64 = (await response.text()).trim();
      if (!base64.startsWith("iVBORw0KGgo") || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error("NovelAI: SillyTavern \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435.");
      }
      return `data:image/png;base64,${base64}`;
    }
    /* ─────────────────────────── OpenAI images API ─────────────────────────── */
    /** Port of generateImageOpenAI (2635-2736). refData is always empty here. */
    async generateImageOpenAI(prompt, style, settings, options = {}) {
      const url = buildOpenAIUrl(settings.endpoint, "images/generations");
      const { imageRefs, textOnlyClothing, textDirectives } = EMPTY_REFS;
      const promptParts = [];
      if (style) promptParts.push(`[Style: ${style}]`);
      for (const directive of textDirectives) promptParts.push(directive);
      for (const c of textOnlyClothing) promptParts.push(`[CLOTHING: ${c.charName} is wearing: ${c.description}]`);
      for (const ref of imageRefs) {
        if (ref.type === "clothing" && ref.description) {
          promptParts.push(`[CLOTHING for ${ref.name}: ${ref.description}]`);
        }
      }
      promptParts.push(prompt);
      const fullPrompt = promptParts.join("\n\n");
      let size = settings.size;
      if (options.aspectRatio) {
        const [w, h] = String(options.aspectRatio).split(":").map(Number);
        if (w > 0 && h > 0) {
          if (w > h) size = "1536x1024";
          else if (w < h) size = "1024x1536";
          else size = "1024x1024";
        }
      }
      const body = {
        model: settings.model,
        prompt: fullPrompt,
        n: 1,
        response_format: "b64_json"
      };
      const galleryNegative = options.negativePrompt == null ? this.getEffectiveNegativePrompt("") : String(options.negativePrompt || "").trim();
      if (galleryNegative) body.negative_prompt = galleryNegative;
      if (size && size !== "auto") body.size = size;
      if (imageRefs.length === 1) {
        body.image = `data:${imageRefs[0].mimeType};base64,${imageRefs[0].data}`;
      } else if (imageRefs.length > 1) {
        body.image = imageRefs.map((ref) => `data:${ref.mimeType};base64,${ref.data}`);
      }
      console.log(`[AstralImageGen] OpenAI Request: url=${url}, model=${body.model}, size=${body.size || "auto"}, prompt=${fullPrompt.length} chars`);
      const response = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(settings.apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
        signal: options.signal
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error (${response.status}): ${text}`);
      }
      const result = await response.json();
      const dataList = result.data || result.images || [];
      if (dataList.length === 0) {
        if (result.url) return result.url;
        if (result.image) return result.image.startsWith("data:") ? result.image : `data:image/png;base64,${result.image}`;
        if (result.b64_json) return `data:image/png;base64,${result.b64_json}`;
        throw new Error("No image data in response");
      }
      const imageObj = dataList[0];
      const b64Data = imageObj.b64_json || imageObj.b64 || imageObj.base64 || imageObj.image;
      const urlData = imageObj.url || imageObj.uri;
      if (b64Data) {
        if (b64Data.startsWith("data:")) return b64Data;
        let mimeType = "image/png";
        if (b64Data.startsWith("/9j/")) mimeType = "image/jpeg";
        else if (b64Data.startsWith("UklGR")) mimeType = "image/webp";
        return `data:${mimeType};base64,${b64Data}`;
      }
      if (urlData) return urlData;
      throw new Error("Unexpected image response format");
    }
    /* ─────────────────────────── OpenAI chat / routers ─────────────────────────── */
    /** Port of generateImageOpenAIChat (2809-2911). refData is always empty here. */
    async generateImageOpenAIChat(prompt, style, settings, options = {}) {
      const url = buildOpenAIUrl(settings.endpoint, "chat/completions");
      const { imageRefs, textOnlyClothing, textDirectives } = EMPTY_REFS;
      let aspectRatio = options.aspectRatio || settings.aspectRatio || "1:1";
      if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = "1:1";
      let imageSize = options.imageSize || settings.imageSize || "1K";
      if (!VALID_IMAGE_SIZES.includes(imageSize)) imageSize = "1K";
      const isGemini = isGeminiModel(settings.model || "") || settings.apiType === "gemini";
      if (isGemini && settings.geminiRandomFormat && !options.aspectRatio) {
        aspectRatio = VALID_ASPECT_RATIOS[Math.floor(Math.random() * VALID_ASPECT_RATIOS.length)];
        console.log(`[AstralImageGen] Gemini random format (router): ${aspectRatio} ${imageSize}`);
      }
      const promptParts = [];
      promptParts.push("Generate an image from the following instruction. Return the generated image in the response.");
      promptParts.push(`[IMAGE SPECIFICATIONS: aspect ratio ${aspectRatio}, do NOT copy the aspect ratio from reference images, use ${aspectRatio} for the final output]`);
      if (style) promptParts.push(`[Art Style: ${style}]`);
      for (const directive of textDirectives) promptParts.push(directive);
      for (const c of textOnlyClothing) promptParts.push(`[CLOTHING: ${c.charName} is wearing: ${c.description}]`);
      for (const ref of imageRefs) {
        if (ref.type === "face") promptParts.push(`[FACE REFERENCE: ${ref.name}] Copy this character's face and identity as closely as possible.`);
        if (ref.type === "clothing") promptParts.push(`[CLOTHING REFERENCE for ${ref.name}: ${ref.description || ref.outfitName || "copy the outfit only, not the face"}]`);
        if (ref.type === "hairstyle") promptParts.push(`[HAIRSTYLE REFERENCE for ${ref.name}: copy only the hair, not the face]`);
      }
      promptParts.push(`[SCENE TO GENERATE]
${prompt}`);
      const galleryNegative = options.negativePrompt == null ? this.getEffectiveNegativePrompt("") : String(options.negativePrompt || "").trim();
      if (galleryNegative) promptParts.push(`[NEGATIVE PROMPT: ${galleryNegative}]`);
      const fullPrompt = promptParts.join("\n\n");
      const content = [{ type: "text", text: fullPrompt }];
      for (const ref of imageRefs) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${ref.mimeType};base64,${ref.data}` }
        });
      }
      const body = {
        model: settings.model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"]
      };
      if (isRouterEndpoint(settings.endpoint)) {
        body.image_config = {
          aspect_ratio: aspectRatio,
          image_size: imageSize
        };
      }
      console.log(`[AstralImageGen] OpenAI Chat/Router Request: url=${url}, model=${body.model}, aspect=${aspectRatio}, size=${imageSize}, prompt=${fullPrompt.length} chars`);
      const response = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(settings.apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
        signal: options.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`API Error (${response.status}): ${text.slice(0, 500)}`);
      }
      const result = await response.json().catch(() => null);
      if (!result) {
        throw new Error(`API returned non-JSON response (status ${response.status})`);
      }
      const image = parseImageFromApiResponse(result);
      if (!image) throw new Error("No image data in chat/completions response");
      return image;
    }
    /* ─────────────────────────── Gemini ─────────────────────────── */
    /** Port of generateImageGemini (2913-3114). refData is always empty here. */
    async generateImageGemini(prompt, style, settings, options = {}) {
      const model = settings.model;
      if (!model) throw new Error("Gemini: \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 (\u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 haruspics).");
      const baseUrl = String(settings.endpoint || "").replace(/\/$/, "");
      const requestCandidates = buildGeminiRequestCandidates(baseUrl, model, settings.apiKey);
      let aspectRatio = options.aspectRatio || settings.aspectRatio || "1:1";
      if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) aspectRatio = "1:1";
      let imageSize = options.imageSize || settings.imageSize || "1K";
      if (!VALID_IMAGE_SIZES.includes(imageSize)) imageSize = "1K";
      if (settings.apiType === "gemini" && settings.geminiRandomFormat && !options.aspectRatio) {
        aspectRatio = VALID_ASPECT_RATIOS[Math.floor(Math.random() * VALID_ASPECT_RATIOS.length)];
        console.log(`[AstralImageGen] Gemini random format: ${aspectRatio} ${imageSize}`);
      }
      const { imageRefs, textOnlyClothing, textDirectives } = EMPTY_REFS;
      const faceRefs = imageRefs.filter((r) => r.type === "face");
      const clothingImageRefs = imageRefs.filter((r) => r.type === "clothing");
      const hairstyleRefs = imageRefs.filter((r) => r.type === "hairstyle");
      const parts = [];
      if (imageRefs.length > 0) {
        let preInstruction = `[CRITICAL INSTRUCTIONS FOR REFERENCE IMAGES]
`;
        preInstruction += `You will receive ${imageRefs.length} reference image(s).
`;
        preInstruction += `RULES:
`;
        preInstruction += `1. FACE references have ABSOLUTE PRIORITY. Copy faces EXACTLY from face reference images.
`;
        preInstruction += `2. CLOTHING references show ONLY the outfit design. Do NOT copy faces or body shapes from clothing images.
`;
        preInstruction += `3. If a face in a clothing reference conflicts with a face reference, ALWAYS use the FACE reference.
`;
        parts.push({ text: preInstruction });
      }
      let refCounter = 0;
      for (const ref of faceRefs) {
        refCounter++;
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        parts.push({
          text: `[FACE REFERENCE #${refCounter}: "${ref.name}"]
This is the EXACT face and appearance of "${ref.name}".
COPY IDENTICALLY: face shape, eye shape & color, nose, mouth, jawline, hair color & style, skin tone.
Include ALL distinctive features (freckles, scars, moles, etc).
DO NOT modify, stylize, or "improve" this face. REPRODUCE IT EXACTLY AS SHOWN.
`
        });
      }
      for (const ref of clothingImageRefs) {
        refCounter++;
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        let clothingLabel = `[CLOTHING-ONLY REFERENCE #${refCounter} for "${ref.name}": "${ref.outfitName || "outfit"}"]
`;
        clothingLabel += `\u26A0\uFE0F THIS IMAGE SHOWS ONLY CLOTHING/OUTFIT DESIGN.
`;
        clothingLabel += `DO NOT copy any face, body shape, or person from this image.
`;
        clothingLabel += `ONLY copy: garment type, fabric, colors, patterns, accessories, and overall style.
`;
        clothingLabel += `"${ref.name}" MUST be wearing exactly this outfit.
`;
        if (ref.description) clothingLabel += `Outfit details: ${ref.description}
`;
        parts.push({ text: clothingLabel });
      }
      for (const ref of hairstyleRefs) {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        parts.push({ text: `[HAIRSTYLE REFERENCE for "${ref.name}"]: Copy only the hair, not the face. ${ref.description || ""}` });
      }
      let fullPrompt = "";
      if (imageRefs.length > 0) {
        fullPrompt += `[CHARACTER & CLOTHING MAPPING]
`;
        let idx = 0;
        for (const ref of faceRefs) {
          idx++;
          fullPrompt += `\u2022 "${ref.name}" = Face Reference #${idx} (COPY FACE EXACTLY)
`;
        }
        for (const ref of clothingImageRefs) {
          idx++;
          fullPrompt += `\u2022 "${ref.name}'s outfit" = Clothing Reference #${idx} (COPY GARMENT ONLY, NOT FACE)
`;
        }
        fullPrompt += `
CRITICAL: Face features must be IDENTICAL to face references. Clothing references affect ONLY what characters wear.

`;
      }
      if (textOnlyClothing.length > 0) {
        for (const c of textOnlyClothing) {
          fullPrompt += `[CLOTHING INSTRUCTION for "${c.charName}"]: ${c.charName} is wearing: ${c.description}

`;
        }
      }
      if (textDirectives.length > 0) {
        for (const directive of textDirectives) fullPrompt += `${directive}

`;
      }
      if (style) fullPrompt += `[Art Style: ${style}]

`;
      const galleryNegative = this.getEffectiveNegativePrompt(options.negativePrompt);
      if (galleryNegative) fullPrompt += `[NEGATIVE PROMPT: ${galleryNegative}]

`;
      fullPrompt += `[SCENE TO GENERATE]
${prompt}
[END SCENE]`;
      if (faceRefs.length > 0) {
        fullPrompt += `

[FINAL REMINDER]
`;
        fullPrompt += `The characters in this scene MUST look EXACTLY like their face reference images.
`;
        fullPrompt += `Check each character's face against their reference before finalizing.
`;
        if (clothingImageRefs.length > 0) {
          fullPrompt += `Clothing references affect ONLY the garments, NOT faces or body shapes.
`;
        }
      }
      parts.push({ text: fullPrompt });
      const body = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio, imageSize }
        }
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
      let lastText = "";
      for (const candidate of requestCandidates) {
        console.log(`[AstralImageGen] Gemini endpoint candidate: ${candidate.url}`);
        const res = await fetch(candidate.url, {
          method: "POST",
          headers: candidate.headers,
          body: bodyString,
          signal: options.signal
        });
        if (res.ok) {
          response = res;
          break;
        }
        lastStatus = res.status;
        lastText = await res.text().catch(() => "");
        console.warn(`[AstralImageGen] Gemini endpoint failed (${res.status}) ${candidate.url} :: ${lastText.substring(0, 200)}`);
      }
      if (!response) {
        throw new Error(`API Error (${lastStatus || "?"}): ${lastText || "All Gemini endpoints failed"}`);
      }
      const result = await response.json();
      const candidates = result.candidates || [];
      if (candidates.length === 0) throw new Error("No candidates in response");
      const responseParts = candidates[0].content?.parts || [];
      for (const part of responseParts) {
        if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        if (part.inline_data) return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
      }
      throw new Error("No image found in Gemini response");
    }
  };

  // apps/messages.js
  var MessagesApp = class {
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "messages";
      this.title = "Messages";
      this.icon = ICONS.messages;
    }
    render(container, params = {}) {
      const state = this.storage.getState();
      const messages = state.messages || [];
      container.innerHTML = "";
      if (params.character) {
        this._renderThread(container, messages, params.character);
        return;
      }
      if (messages.length === 0) {
        container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.messages}</div>
                    <div>\u041D\u0435\u0442 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438</div>
                    <div style="margin-top:10px;opacity:.7">\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043D\u0430\u043F\u0438\u0448\u0435\u0442</div>
                </div>`;
        return;
      }
      const grouped = /* @__PURE__ */ new Map();
      for (const msg of messages) {
        const key = msg.character || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(msg);
      }
      const list = document.createElement("div");
      list.className = "astral-thread-list";
      for (const [char, msgs] of grouped) {
        const last = msgs[msgs.length - 1];
        const item = document.createElement("div");
        item.className = "astral-msg-item";
        item.innerHTML = `
                <div class="astral-msg-avatar">${this._esc((char[0] || "?").toUpperCase())}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name">${this._esc(char)}</div>
                    <div class="astral-msg-preview">${this._esc(last.text)}</div>
                </div>
                <div class="astral-msg-time">${this._time(last.timestamp)}</div>
            `;
        item.addEventListener("click", () => {
          const core2 = this._core();
          core2?.openApp("messages", { character: char });
        });
        list.appendChild(item);
      }
      container.appendChild(list);
    }
    _renderThread(container, messages, character) {
      const msgs = messages.filter((m) => m.character === character);
      const wrap = document.createElement("div");
      wrap.className = "astral-thread";
      if (msgs.length === 0) {
        wrap.innerHTML = `<div class="astral-empty-state"><div>\u041F\u0443\u0441\u0442\u043E</div></div>`;
      }
      for (const msg of msgs) {
        const bubble = document.createElement("div");
        bubble.className = msg.fromUser ? "astral-bubble astral-bubble--out" : "astral-bubble astral-bubble--in";
        bubble.innerHTML = `
                <div class="astral-bubble-text">${this._esc(msg.text)}</div>
                <div class="astral-bubble-time">${this._time(msg.timestamp, true)}</div>
            `;
        wrap.appendChild(bubble);
      }
      container.appendChild(wrap);
      container.scrollTop = container.scrollHeight;
    }
    async handleEvent(eventData) {
      const state = this.storage.getState();
      state.messages.push({
        character: eventData.character || this.context.name2 || "",
        text: eventData.description || "",
        timestamp: Date.now(),
        fromUser: false
      });
      this.storage.save();
      return { success: true, message: "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E" };
    }
    _core() {
      return window.__astralPhoneCore || null;
    }
    _time(ts, short = false) {
      const d = new Date(ts);
      const today = (/* @__PURE__ */ new Date()).toDateString() === d.toDateString();
      if (short || today) {
        return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/gallery.js
  var GalleryApp = class {
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "gallery";
      this.title = "Gallery";
      this.icon = ICONS.gallery;
      this._busy = /* @__PURE__ */ new Set();
    }
    render(container) {
      const state = this.storage.getState();
      const photos = state.gallery || [];
      container.innerHTML = "";
      if (photos.length === 0) {
        container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.gallery}</div>
                    <div>\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E</div>
                    <div style="margin-top:10px;opacity:.7">\u0424\u043E\u0442\u043E \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0447\u0442\u043E-\u043D\u0438\u0431\u0443\u0434\u044C \u0441\u043D\u0438\u043C\u0435\u0442</div>
                </div>`;
        return;
      }
      const grid = document.createElement("div");
      grid.className = "astral-gallery-grid";
      photos.forEach((photo, idx) => this._renderTile(grid, photo, idx));
      container.appendChild(grid);
      container.appendChild(this._buildActions(photos));
    }
    _renderTile(grid, photo, idx) {
      const tile = document.createElement("div");
      tile.className = "astral-tile";
      if (photo.imageUrl) {
        tile.classList.add("astral-tile--filled");
        tile.innerHTML = `
                <img src="${photo.imageUrl}" alt="" loading="lazy">
                <div class="astral-tile-overlay">
                    <div class="astral-tile-text">${this._esc(photo.description)}</div>
                    <div class="astral-tile-meta">${this._time(photo.timestamp)}</div>
                </div>`;
        tile.addEventListener("click", () => this._openViewer(photo));
      } else {
        const busy = this._busy.has(idx);
        tile.innerHTML = `
                <div class="astral-tile-empty">
                    <div class="astral-tile-empty-icon">${ICONS.gallery}</div>
                    <div class="astral-tile-text">${this._esc(photo.description)}</div>
                    <button class="astral-btn" ${busy ? "disabled" : ""} data-gen="${idx}">
                        ${busy ? "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\u2026" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0444\u043E\u0442\u043E"}
                    </button>
                </div>`;
        const btn = tile.querySelector(`[data-gen="${idx}"]`);
        if (btn && !busy) {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this._generate(idx);
          });
        }
      }
      grid.appendChild(tile);
    }
    _buildActions(photos) {
      const bar = document.createElement("div");
      bar.className = "astral-action-bar";
      const pending = photos.filter((p) => !p.imageUrl).length;
      const label = pending > 1 ? `\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0432\u0441\u0435 \u0444\u043E\u0442\u043E (${pending})` : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0444\u043E\u0442\u043E";
      const btn = document.createElement("button");
      btn.className = "astral-btn astral-btn-primary astral-btn-wide";
      btn.textContent = label;
      btn.disabled = pending === 0;
      if (pending === 0) btn.style.opacity = ".45";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\u2026";
        const indexes = photos.map((p, i) => !p.imageUrl ? i : -1).filter((i) => i >= 0);
        for (const i of indexes) await this._generate(i, true);
        this.render(document.querySelector(".astral-phone-body"));
      });
      bar.appendChild(btn);
      return bar;
    }
    async _generate(index, silent = false) {
      if (!this.imageGen.isAvailable()) {
        this._toast("Haruspics \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u2014 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430", "error");
        return;
      }
      if (this._busy.has(index)) return;
      this._busy.add(index);
      this._toast("\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E\u2026", "info");
      try {
        const state = this.storage.getState();
        const photo = state.gallery[index];
        if (!photo) return;
        const prompt = this._buildPrompt(photo);
        const url = await this.imageGen.generate(prompt, {
          character: photo.character,
          type: "gallery_photo"
        });
        state.gallery[index].imageUrl = url;
        this.storage.save();
        this._toast("\u0413\u043E\u0442\u043E\u0432\u043E", "success");
        if (!silent) this.render(document.querySelector(".astral-phone-body"));
      } catch (err) {
        console.error("[Gallery] generation failed:", err);
        this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
      } finally {
        this._busy.delete(index);
        if (!silent) this.render(document.querySelector(".astral-phone-body"));
      }
    }
    _buildPrompt(photo) {
      const parts = [];
      if (photo.character) parts.push(photo.character);
      if (photo.description) parts.push(photo.description);
      return parts.join(" \u2014 ");
    }
    _openViewer(photo) {
      const viewer = document.createElement("div");
      viewer.className = "astral-viewer";
      viewer.innerHTML = `
            <img src="${photo.imageUrl}" alt="">
            <div class="astral-viewer-caption">${this._esc(photo.description)}</div>
        `;
      viewer.addEventListener("click", () => viewer.remove());
      document.querySelector(".astral-phone").appendChild(viewer);
    }
    async handleEvent(eventData) {
      const state = this.storage.getState();
      state.gallery.push({
        character: eventData.character || this.context.name2 || "",
        description: eventData.description || "",
        timestamp: Date.now(),
        imageUrl: null
      });
      this.storage.save();
      return { success: true, message: "\u0424\u043E\u0442\u043E \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0433\u0430\u043B\u0435\u0440\u0435\u044E" };
    }
    _toast(text, kind = "info") {
      if (window.toastr) {
        (toastr[kind] || toastr.info)(text);
      } else {
        console.log(`[Gallery] ${text}`);
      }
    }
    _time(ts) {
      return new Date(ts).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/spicy.js
  var CATEGORIES = ["\u0412\u0441\u0435", "\u041D\u043E\u0432\u043E\u0435", "\u0422\u0440\u0435\u043D\u0434\u044B", "\u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u043E\u0437\u0436\u0435"];
  var SpicyApp = class {
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "spicy";
      this.title = "Spicy Hub";
      this.icon = ICONS.spicy;
      this._filter = "\u0412\u0441\u0435";
      this._busy = /* @__PURE__ */ new Set();
    }
    render(container) {
      const state = this.storage.getState();
      const items = state.spicy || [];
      container.innerHTML = "";
      container.appendChild(this._buildTopBar());
      if (items.length === 0) {
        container.innerHTML += `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.spicy}</div>
                    <div>\u041B\u0435\u043D\u0442\u0430 \u043F\u0443\u0441\u0442\u0430</div>
                    <div style="margin-top:10px;opacity:.7">\u0420\u043E\u043B\u0438\u043A\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0447\u0442\u043E-\u043D\u0438\u0431\u0443\u0434\u044C \u0432\u044B\u043B\u043E\u0436\u0438\u0442</div>
                </div>`;
        return;
      }
      const filtered = this._applyFilter(items);
      const feed = document.createElement("div");
      feed.className = "astral-card-feed";
      filtered.forEach((item) => feed.appendChild(this._renderCard(item, items.indexOf(item))));
      container.appendChild(feed);
    }
    _buildTopBar() {
      const bar = document.createElement("div");
      bar.className = "astral-chips";
      for (const cat of CATEGORIES) {
        const chip = document.createElement("button");
        chip.className = "astral-chip" + (cat === this._filter ? " astral-chip--on" : "");
        chip.textContent = cat;
        chip.addEventListener("click", () => {
          this._filter = cat;
          this.render(document.querySelector(".astral-phone-body"));
        });
        bar.appendChild(chip);
      }
      return bar;
    }
    _applyFilter(items) {
      if (this._filter === "\u041D\u043E\u0432\u043E\u0435") return [...items].sort((a, b) => b.timestamp - a.timestamp);
      if (this._filter === "\u0422\u0440\u0435\u043D\u0434\u044B") return [...items].sort((a, b) => (b.views || 0) - (a.views || 0));
      return items;
    }
    _renderCard(item, idx) {
      const card = document.createElement("div");
      card.className = "astral-card";
      const busy = this._busy.has(idx);
      const media = item.thumbnailUrl ? `<img class="astral-card-media" src="${item.thumbnailUrl}" alt="" loading="lazy">
               <div class="astral-card-duration">${this._esc(item.duration || "12:04")}</div>` : `<div class="astral-card-media astral-card-media--empty">
                    <div class="astral-card-empty-inner">
                        <div class="astral-card-empty-icon">${ICONS.spicy}</div>
                        <button class="astral-btn" data-gen="${idx}" ${busy ? "disabled" : ""}>
                            ${busy ? "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\u2026" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u0435\u0432\u044C\u044E"}
                        </button>
                    </div>
               </div>`;
      card.innerHTML = `
            ${media}
            <div class="astral-card-body">
                <div class="astral-card-title">${this._esc(item.title || item.description)}</div>
                <div class="astral-card-meta">
                    <span>${this._n(item.views)} \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u043E\u0432</span>
                    <span>${this._n(item.likes)} \u2764</span>
                    <span>${this._ago(item.timestamp)}</span>
                </div>
                ${item.tags?.length ? `<div class="astral-card-tags">${item.tags.map((t) => `<span class="astral-tag">#${this._esc(t)}</span>`).join("")}</div>` : ""}
            </div>
        `;
      const btn = card.querySelector(`[data-gen="${idx}"]`);
      if (btn && !busy) {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this._generate(idx);
        });
      }
      return card;
    }
    async _generate(index) {
      if (!this.imageGen.isAvailable()) {
        this._toast("Haruspics \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D", "error");
        return;
      }
      if (this._busy.has(index)) return;
      this._busy.add(index);
      this._toast("\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E \u043F\u0440\u0435\u0432\u044C\u044E\u2026", "info");
      try {
        const state = this.storage.getState();
        const item = state.spicy[index];
        if (!item) return;
        const prompt = [item.character, item.description].filter(Boolean).join(" \u2014 ");
        const url = await this.imageGen.generate(prompt, {
          character: item.character,
          type: "spicy_thumbnail",
          nsfw: true
        });
        state.spicy[index].thumbnailUrl = url;
        this.storage.save();
        this._toast("\u0413\u043E\u0442\u043E\u0432\u043E", "success");
      } catch (err) {
        console.error("[Spicy] generation failed:", err);
        this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
      } finally {
        this._busy.delete(index);
        this.render(document.querySelector(".astral-phone-body"));
      }
    }
    async handleEvent(eventData) {
      const state = this.storage.getState();
      const meta = eventData.metadata || {};
      state.spicy.push({
        character: eventData.character || this.context.name2 || "",
        title: meta.title || this._titleFrom(eventData.description),
        description: eventData.description || "",
        timestamp: Date.now(),
        thumbnailUrl: null,
        views: this._rand(400, 4e4),
        likes: this._rand(10, 2400),
        duration: `${this._rand(3, 24)}:${String(this._rand(0, 59)).padStart(2, "0")}`,
        tags: meta.tags || []
      });
      this.storage.save();
      return { success: true, message: "\u0420\u043E\u043B\u0438\u043A \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 Spicy Hub" };
    }
    _titleFrom(desc = "") {
      const clean = String(desc).trim();
      if (!clean) return "\u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F";
      const first = clean.split(/[.,;—]/)[0].trim();
      return first.length > 42 ? first.slice(0, 42) + "\u2026" : first;
    }
    _rand(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    _n(num) {
      if (!num) return "0";
      if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
      if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
      return String(num);
    }
    _ago(ts) {
      const diff = Date.now() - ts;
      if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u043C\u0438\u043D`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)} \u0447`;
      return `${Math.floor(diff / 864e5)} \u0434\u043D`;
    }
    _toast(text, kind = "info") {
      if (window.toastr) (toastr[kind] || toastr.info)(text);
      else console.log(`[Spicy] ${text}`);
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/creator.js
  var TABS = [
    { id: "profile", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C" },
    { id: "feed", label: "\u041B\u0435\u043D\u0442\u0430" },
    { id: "stats", label: "\u0421\u0442\u0430\u0442\u044B" },
    { id: "fans", label: "\u0424\u0430\u043D\u044B" }
  ];
  var CreatorApp = class {
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "creator";
      this.title = "Creator Studio";
      this.icon = ICONS.creator;
      this._tab = "profile";
      this._busy = /* @__PURE__ */ new Set();
    }
    render(container, params = {}) {
      if (params.tab) this._tab = params.tab;
      const state = this.storage.getState();
      const creator = state.creator || {};
      container.innerHTML = "";
      container.appendChild(this._buildTabs());
      const body = document.createElement("div");
      body.className = "astral-creator-body";
      if (this._tab === "profile") this._renderProfile(body, creator);
      else if (this._tab === "feed") this._renderFeed(body, creator);
      else if (this._tab === "stats") this._renderStats(body, creator);
      else this._renderFans(body, creator);
      container.appendChild(body);
    }
    _buildTabs() {
      const bar = document.createElement("div");
      bar.className = "astral-tabs";
      for (const tab of TABS) {
        const btn = document.createElement("button");
        btn.className = "astral-tab" + (tab.id === this._tab ? " astral-tab--on" : "");
        btn.textContent = tab.label;
        btn.addEventListener("click", () => {
          this._tab = tab.id;
          this.render(document.querySelector(".astral-phone-body"));
        });
        bar.appendChild(btn);
      }
      return bar;
    }
    /* ─────────────────────────── profile ─────────────────────────── */
    _renderProfile(body, creator) {
      const name = this.context.name2 || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
      const posts = creator.posts || [];
      body.innerHTML = `
            <div class="astral-profile">
                <div class="astral-profile-ava">${this._esc((name[0] || "?").toUpperCase())}</div>
                <div class="astral-profile-name">${this._esc(name)}</div>
                <div class="astral-profile-handle">@${this._slug(name)}</div>

                <div class="astral-stats-row">
                    <div class="astral-stat">
                        <div class="astral-stat-value">${this._n(creator.subscribers || 0)}</div>
                        <div class="astral-stat-label">\u041F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0438</div>
                    </div>
                    <div class="astral-stat">
                        <div class="astral-stat-value">${posts.length}</div>
                        <div class="astral-stat-label">\u041F\u043E\u0441\u0442\u044B</div>
                    </div>
                    <div class="astral-stat">
                        <div class="astral-stat-value">$${this._n(creator.revenue || 0)}</div>
                        <div class="astral-stat-label">\u0414\u043E\u0445\u043E\u0434</div>
                    </div>
                </div>

                <button class="astral-btn astral-btn-primary astral-btn-wide" id="astral-new-post">
                    \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u043E\u0441\u0442
                </button>
            </div>
        `;
      body.querySelector("#astral-new-post").addEventListener("click", () => this._openComposer());
    }
    /* ─────────────────────────── feed ─────────────────────────── */
    _renderFeed(body, creator) {
      const posts = creator.posts || [];
      if (posts.length === 0) {
        body.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.creator}</div>
                    <div>\u041F\u043E\u0441\u0442\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442</div>
                    <div style="margin-top:10px;opacity:.7">\u0421\u043E\u0437\u0434\u0430\u0439 \u043F\u0435\u0440\u0432\u044B\u0439 \u2014 \u0438 \u043D\u0430\u0447\u043D\u0451\u0448\u044C \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0442\u044C</div>
                </div>`;
        return;
      }
      const feed = document.createElement("div");
      feed.className = "astral-card-feed";
      posts.forEach((post, idx) => {
        const card = document.createElement("div");
        card.className = "astral-card";
        const busy = this._busy.has(idx);
        const media = post.imageUrl ? `<img class="astral-card-media" src="${post.imageUrl}" alt="" loading="lazy">` : `<div class="astral-card-media astral-card-media--empty">
                        <div class="astral-card-empty-inner">
                            <div class="astral-card-empty-icon">${ICONS.creator}</div>
                            <button class="astral-btn" data-gen="${idx}" ${busy ? "disabled" : ""}>
                                ${busy ? "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\u2026" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0444\u043E\u0442\u043E"}
                            </button>
                        </div>
                   </div>`;
        card.innerHTML = `
                ${media}
                <div class="astral-card-body">
                    <div class="astral-card-title">${this._esc(post.caption || post.description)}</div>
                    <div class="astral-card-meta">
                        <span>\u2764 ${this._n(post.likes || 0)}</span>
                        <span>\u{1F4AC} ${this._n(post.comments || 0)}</span>
                        <span>${this._ago(post.timestamp)}</span>
                    </div>
                </div>
            `;
        const btn = card.querySelector(`[data-gen="${idx}"]`);
        if (btn && !busy) {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this._generate(idx);
          });
        }
        feed.appendChild(card);
      });
      body.appendChild(feed);
    }
    /* ─────────────────────────── stats ─────────────────────────── */
    _renderStats(body, creator) {
      const posts = creator.posts || [];
      const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
      const avg = posts.length ? Math.round(likes / posts.length) : 0;
      const top = posts.length ? posts.reduce((a, b) => (b.likes || 0) > (a.likes || 0) ? b : a) : null;
      body.innerHTML = `
            <div class="astral-stat-cards">
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">\u0412\u0441\u0435\u0433\u043E \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E</div>
                    <div class="astral-stat-card-value">$${this._n(creator.revenue || 0)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">\u041B\u0430\u0439\u043A\u043E\u0432 \u043D\u0430 \u043F\u043E\u0441\u0442</div>
                    <div class="astral-stat-card-value">${this._n(avg)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">\u0412\u0441\u0435\u0433\u043E \u043B\u0430\u0439\u043A\u043E\u0432</div>
                    <div class="astral-stat-card-value">${this._n(likes)}</div>
                </div>
                <div class="astral-stat-card">
                    <div class="astral-stat-card-label">\u041B\u0443\u0447\u0448\u0438\u0439 \u043F\u043E\u0441\u0442</div>
                    <div class="astral-stat-card-value astral-stat-card-value--sm">
                        ${top ? this._esc((top.caption || top.description || "").slice(0, 40)) : "\u2014"}
                    </div>
                </div>
            </div>
        `;
    }
    /* ─────────────────────────── fans ─────────────────────────── */
    _renderFans(body, creator) {
      const fans = creator.fans || [];
      if (fans.length === 0) {
        body.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.creator}</div>
                    <div>\u0424\u0430\u043D\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442</div>
                    <div style="margin-top:10px;opacity:.7">\u0414\u043E\u043D\u0430\u0442\u044B \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C</div>
                </div>`;
        return;
      }
      const list = document.createElement("div");
      list.className = "astral-fan-list";
      for (const fan of fans) {
        const row = document.createElement("div");
        row.className = "astral-fan-row";
        row.innerHTML = `
                <div class="astral-msg-avatar">${this._esc((fan.name || "?")[0].toUpperCase())}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name">${this._esc(fan.name || "\u0410\u043D\u043E\u043D\u0438\u043C")}</div>
                    <div class="astral-msg-preview">${this._esc(fan.note || (fan.amount ? `$${fan.amount}` : "\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043B\u0441\u044F"))}</div>
                </div>
                <div class="astral-msg-time">${this._ago(fan.timestamp)}</div>
            `;
        list.appendChild(row);
      }
      body.appendChild(list);
    }
    /* ─────────────────────────── composer ─────────────────────────── */
    _openComposer() {
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">\u041D\u043E\u0432\u044B\u0439 \u043F\u043E\u0441\u0442</div>
                <textarea class="astral-textarea" id="astral-post-text"
                    placeholder="\u041E\u043F\u0438\u0448\u0438, \u0447\u0442\u043E \u043D\u0430 \u0444\u043E\u0442\u043E \u2014 \u043F\u043E\u0437\u0430, \u043E\u0434\u0435\u0436\u0434\u0430, \u043C\u0435\u0441\u0442\u043E, \u0441\u0432\u0435\u0442. \u0427\u0435\u043C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0435\u0435, \u0442\u0435\u043C \u043B\u0443\u0447\u0448\u0435 \u0432\u044B\u0439\u0434\u0435\u0442 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430."></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-post-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-post-go">\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C</button>
                </div>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector("#astral-post-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-post-go").addEventListener("click", async () => {
        const text = overlay.querySelector("#astral-post-text").value.trim();
        if (!text) return;
        close();
        await this._createPost(text);
      });
      overlay.querySelector("#astral-post-text").focus();
    }
    async _createPost(caption) {
      const state = this.storage.getState();
      if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
      state.creator.posts.unshift({
        caption,
        description: caption,
        timestamp: Date.now(),
        imageUrl: null,
        likes: this._rand(5, 60),
        comments: this._rand(0, 14)
      });
      state.creator.revenue = (state.creator.revenue || 0) + this._rand(12, 70);
      this.storage.save();
      this._tab = "feed";
      this.render(document.querySelector(".astral-phone-body"));
      if (this.imageGen.isAvailable()) await this._generate(0, true);
      this.render(document.querySelector(".astral-phone-body"));
    }
    async _generate(index, silent = false) {
      if (!this.imageGen.isAvailable()) {
        this._toast("Haruspics \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D", "error");
        return;
      }
      if (this._busy.has(index)) return;
      this._busy.add(index);
      this._toast("\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E \u0444\u043E\u0442\u043E\u2026", "info");
      try {
        const state = this.storage.getState();
        const post = state.creator?.posts?.[index];
        if (!post) return;
        const prompt = [this.context.name2 || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436", post.description].filter(Boolean).join(" \u2014 ");
        const url = await this.imageGen.generate(prompt, {
          character: this.context.name2,
          type: "creator_post",
          nsfw: true
        });
        state.creator.posts[index].imageUrl = url;
        this.storage.save();
        this._toast("\u0413\u043E\u0442\u043E\u0432\u043E", "success");
      } catch (err) {
        console.error("[Creator] generation failed:", err);
        this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
      } finally {
        this._busy.delete(index);
        if (!silent) this.render(document.querySelector(".astral-phone-body"));
      }
    }
    /* ─────────────────────────── events ─────────────────────────── */
    async handleEvent(eventData) {
      const state = this.storage.getState();
      if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
      const meta = eventData.metadata || {};
      if (eventData.type === "content_posted") {
        state.creator.posts.unshift({
          caption: eventData.description,
          description: eventData.description,
          timestamp: Date.now(),
          imageUrl: null,
          likes: this._rand(5, 60),
          comments: this._rand(0, 14)
        });
      } else if (eventData.type === "donation_received") {
        const amount = Number(meta.amount) || 25;
        state.creator.revenue = (state.creator.revenue || 0) + amount;
        state.creator.fans.unshift({
          name: meta.fan || "\u0410\u043D\u043E\u043D\u0438\u043C",
          amount,
          note: `$${amount}`,
          timestamp: Date.now()
        });
        state.creator.fans = state.creator.fans.slice(0, 40);
      } else if (eventData.type === "subscriber_joined") {
        const count = Number(meta.count) || 1;
        state.creator.subscribers = (state.creator.subscribers || 0) + count;
        state.creator.fans.unshift({
          name: meta.fan || "\u041D\u043E\u0432\u044B\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A",
          note: "\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043B\u0441\u044F",
          timestamp: Date.now()
        });
        state.creator.fans = state.creator.fans.slice(0, 40);
      }
      this.storage.save();
      return { success: true, message: "\u0421\u043E\u0431\u044B\u0442\u0438\u0435 Creator Studio \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E" };
    }
    /* ─────────────────────────── utils ─────────────────────────── */
    _rand(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    _n(num) {
      if (!num) return "0";
      if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
      if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
      return String(num);
    }
    _ago(ts) {
      const diff = Date.now() - ts;
      if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u043C\u0438\u043D`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)} \u0447`;
      return `${Math.floor(diff / 864e5)} \u0434\u043D`;
    }
    _slug(name) {
      const slug = String(name).toLowerCase().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "");
      return slug || "creator";
    }
    _toast(text, kind = "info") {
      if (window.toastr) (toastr[kind] || toastr.info)(text);
      else console.log(`[Creator] ${text}`);
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // index.js
  var MODULE_NAME2 = "astral-phone";
  var EVENT_TAG_RE = /<phone-event\b([^>]*?)\/?>/gi;
  var ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
  var core = null;
  var storage = null;
  var imageGen = null;
  var initialized = false;
  var PROMPT_BLOCK = `[Astral Phone \u2014 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430]

\u0423 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0435\u0441\u0442\u044C \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: Messages (\u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430), Gallery (\u0444\u043E\u0442\u043E), Spicy Hub (\u0430\u043D\u043E\u043D\u0438\u043C\u043D\u0430\u044F \u043B\u0435\u043D\u0442\u0430), Creator Studio (\u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u0441 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0430\u043C\u0438 \u0438 \u0434\u043E\u0445\u043E\u0434\u043E\u043C).

\u041A\u043E\u0433\u0434\u0430 \u0432 \u0441\u0446\u0435\u043D\u0435 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442 \u0442\u043E, \u0447\u0442\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0437\u0430\u0441\u043D\u044F\u043B \u0431\u044B, \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u043B \u0438\u043B\u0438 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043B \u2014 \u0432\u044B\u0437\u044B\u0432\u0430\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 phone_event. \u041D\u0435 \u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0439 \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u0432 \u0442\u0435\u043A\u0441\u0442\u0435 \u043E\u0442\u0432\u0435\u0442\u0430, \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u044B\u0437\u044B\u0432\u0430\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442.

\u0422\u0438\u043F\u044B \u0441\u043E\u0431\u044B\u0442\u0438\u0439:
- photo_taken \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0441\u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0440\u043E\u0432\u0430\u043B \u0447\u0442\u043E-\u0442\u043E \u0438\u043B\u0438 \u0441\u0434\u0435\u043B\u0430\u043B \u0441\u0435\u043B\u0444\u0438. description = \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u0444\u043E\u0442\u043E, \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E \u0438 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E (\u0432\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C, \u043E\u0434\u0435\u0436\u0434\u0430, \u043F\u043E\u0437\u0430, \u043C\u0435\u0441\u0442\u043E, \u0441\u0432\u0435\u0442) \u2014 \u044D\u0442\u043E \u043F\u043E\u0439\u0434\u0451\u0442 \u0432 \u043F\u0440\u043E\u043C\u043F\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0438.
- message_received \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043D\u0430\u043F\u0438\u0441\u0430\u043B \u0442\u0435\u0431\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435. description = \u0442\u0435\u043A\u0441\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F.
- spicy_posted \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0432\u044B\u043B\u043E\u0436\u0438\u043B \u043E\u0442\u043A\u0440\u043E\u0432\u0435\u043D\u043D\u044B\u0439 \u0440\u043E\u043B\u0438\u043A \u0432 Spicy Hub. description = \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0441\u0443\u0442\u044C \u0440\u043E\u043B\u0438\u043A\u0430 \u043F\u043B\u044E\u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430 \u0434\u043B\u044F \u043F\u0440\u0435\u0432\u044C\u044E.
- content_posted \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0432\u044B\u043B\u043E\u0436\u0438\u043B \u043F\u043E\u0441\u0442 \u0432 Creator Studio. description = \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043A \u043F\u043E\u0441\u0442\u0443 \u043F\u043B\u044E\u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430.
- donation_received \u2014 \u0444\u0430\u043D\u0430\u0442 \u0437\u0430\u0434\u043E\u043D\u0430\u0442\u0438\u043B. metadata.amount = \u0441\u0443\u043C\u043C\u0430 \u0432 \u0434\u043E\u043B\u043B\u0430\u0440\u0430\u0445.
- subscriber_joined \u2014 \u043D\u043E\u0432\u044B\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A. metadata.count = \u0441\u043A\u043E\u043B\u044C\u043A\u043E.

\u0415\u0441\u043B\u0438 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B, \u0432\u043C\u0435\u0441\u0442\u043E \u0432\u044B\u0437\u043E\u0432\u0430 \u043D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u0433, \u043E\u043D \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u0440\u0435\u0437\u0430\u043D \u0438\u0437 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:
<phone-event type="photo_taken" character="\u0418\u043C\u044F" description="\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" />

description \u043F\u0438\u0448\u0438 \u043A\u0430\u043A \u043F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0445\u0443\u0434\u043E\u0436\u043D\u0438\u043A\u0430: \u0431\u0435\u0437 \u043C\u0435\u0442\u0430-\u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432, \u0431\u0435\u0437 \u0441\u043B\u043E\u0432 \xAB\u0444\u043E\u0442\u043E\xBB \u0438 \xAB\u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430\xBB.`;
  function init() {
    if (initialized) return;
    const context = SillyTavern.getContext();
    storage = new PhoneStorage(context);
    imageGen = new ImageGenerator(context);
    core = new PhoneCore(context, storage, imageGen);
    core.registerApp("messages", new MessagesApp(context, storage, imageGen));
    core.registerApp("gallery", new GalleryApp(context, storage, imageGen));
    core.registerApp("spicy", new SpicyApp(context, storage, imageGen));
    core.registerApp("creator", new CreatorApp(context, storage, imageGen));
    window.__astralPhoneCore = core;
    injectLauncher();
    registerFunctionTool(context);
    registerSlashCommands(context);
    registerEventTagFallback(context);
    injectPromptBlock(context);
    initialized = true;
    console.log("[Astral Phone] ready");
  }
  function injectLauncher() {
    if (document.getElementById("astral-phone-launcher")) return;
    const btn = document.createElement("div");
    btn.id = "astral-phone-launcher";
    btn.title = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D";
    btn.innerHTML = "<span>\u{1F4F1}</span>";
    btn.addEventListener("click", () => core.toggle());
    document.body.appendChild(btn);
    const menu = document.getElementById("extensionsMenu");
    if (menu) {
      const item = document.createElement("div");
      item.className = "list-group-item flex-container flexGap5 interactable";
      item.tabIndex = 0;
      item.innerHTML = '<div class="fa-solid fa-mobile-screen extensionsMenuExtensionButton"></div><span>Astral Phone</span>';
      item.addEventListener("click", () => core.toggle());
      menu.appendChild(item);
    }
  }
  function registerFunctionTool(context) {
    if (typeof context.registerFunctionTool !== "function") {
      console.warn("[Astral Phone] registerFunctionTool unavailable \u2014 using tag fallback only");
      return;
    }
    context.registerFunctionTool({
      name: "phone_event",
      displayName: "Phone Event",
      description: "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0432 \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430: \u0444\u043E\u0442\u043E, \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043F\u043E\u0441\u0442 \u0432 Spicy Hub \u0438\u043B\u0438 Creator Studio, \u0434\u043E\u043D\u0430\u0442, \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430. description \u0432\u0441\u0435\u0433\u0434\u0430 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u043C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435\u043C, \u043F\u0440\u0438\u0433\u043E\u0434\u043D\u044B\u043C \u043A\u0430\u043A \u043F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F.",
      parameters: {
        $schema: "http://json-schema.org/draft-04/schema#",
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "photo_taken",
              "message_received",
              "spicy_posted",
              "content_posted",
              "donation_received",
              "subscriber_joined"
            ],
            description: "\u0422\u0438\u043F \u0441\u043E\u0431\u044B\u0442\u0438\u044F"
          },
          character: { type: "string", description: "\u0418\u043C\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430" },
          description: {
            type: "string",
            description: "\u0422\u0435\u043A\u0441\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043B\u0438\u0431\u043E \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430"
          },
          metadata: {
            type: "object",
            description: "\u0414\u043E\u043F. \u0434\u0430\u043D\u043D\u044B\u0435: amount \u0434\u043B\u044F \u0434\u043E\u043D\u0430\u0442\u0430, count \u0434\u043B\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438, title \u0434\u043B\u044F \u0440\u043E\u043B\u0438\u043A\u0430",
            properties: {
              amount: { type: "number" },
              count: { type: "number" },
              title: { type: "string" }
            }
          }
        },
        required: ["type", "description"]
      },
      action: async (args) => {
        try {
          const result = await core.handleEvent(args);
          return JSON.stringify(result);
        } catch (err) {
          console.error("[Astral Phone] tool action failed:", err);
          return JSON.stringify({ success: false, error: String(err?.message || err) });
        }
      }
    });
  }
  function parseAttrs(str) {
    const out = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while (m = ATTR_RE.exec(str)) out[m[1]] = m[2];
    return out;
  }
  function registerEventTagFallback(context) {
    const { eventSource, event_types } = context;
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
      try {
        const message = context.chat?.[messageId];
        if (!message || message.is_user) return;
        const text = message.mes || "";
        if (!text.includes("<phone-event")) return;
        EVENT_TAG_RE.lastIndex = 0;
        let match;
        while (match = EVENT_TAG_RE.exec(text)) {
          const attrs = parseAttrs(match[1]);
          if (!attrs.type) continue;
          core.handleEvent({
            type: attrs.type,
            character: attrs.character || context.name2 || "",
            description: attrs.description || ""
          });
        }
        message.mes = text.replace(EVENT_TAG_RE, "").trim();
        const el = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
        if (el) {
          el.innerHTML = context.messageFormatting(
            message.mes,
            message.name,
            message.is_system,
            message.is_user,
            messageId
          );
        }
      } catch (err) {
        console.warn("[Astral Phone] tag fallback error:", err);
      }
    });
  }
  function injectPromptBlock(context) {
    try {
      context.setExtensionPrompt(
        MODULE_NAME2,
        PROMPT_BLOCK,
        context.extension_prompt_types?.IN_CHAT ?? 1,
        1,
        false
      );
    } catch (err) {
      console.warn("[Astral Phone] prompt injection failed:", err);
    }
  }
  function registerSlashCommands(context) {
    if (typeof context.registerSlashCommand !== "function") return;
    context.registerSlashCommand(
      "phone",
      async (args) => {
        const arg = String(args || "").trim();
        if (!arg || arg === "open") {
          core.open();
          return "";
        }
        if (arg === "close") {
          core.close();
          return "";
        }
        if (arg === "reset") {
          storage.reset();
          if (window.toastr) toastr.success("\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043E\u0447\u0438\u0449\u0435\u043D");
          return "";
        }
        if (arg.startsWith("event ")) {
          try {
            const data = JSON.parse(arg.slice(6));
            const res = await core.handleEvent(data);
            return JSON.stringify(res);
          } catch (err) {
            if (window.toastr) toastr.error(`\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 JSON: ${err.message}`);
            return "";
          }
        }
        return "";
      },
      [],
      '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430. /phone open | close | reset | event {"type":"photo_taken",...}',
      true,
      true
    );
  }
  jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.event_types.APP_INITIALIZED, init);
  });
})();
