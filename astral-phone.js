(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // apps/lockscreen.js
  var LockScreen = class {
    static {
      __name(this, "LockScreen");
    }
    constructor(context, storage2) {
      this.context = context;
      this.storage = storage2;
      this.locked = true;
      this.swipeStart = 0;
      this.overlay = null;
      this.clockEl = null;
    }
    build() {
      const state = this.storage.getState();
      const settings = this.storage._root().settings || {};
      const wallpaper = settings.lockscreenWallpaper || "default";
      const overlay = document.createElement("div");
      overlay.id = "astral-phone-lockscreen";
      overlay.className = `astral-lockscreen astral-lockscreen-${wallpaper}`;
      overlay.innerHTML = `
            <div class="astral-lockscreen-bg"></div>
            
            <div class="astral-lockscreen-content">
                <div class="astral-lockscreen-time" id="astral-lockscreen-time">--:--</div>
                <div class="astral-lockscreen-date" id="astral-lockscreen-date">--</div>
                
                <div class="astral-lockscreen-notifications" id="astral-lockscreen-notifs">
                    ${this._renderNotifications(state)}
                </div>
            </div>
            
            <button class="astral-lockscreen-close" id="astral-lockscreen-close" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D">\u2715</button>

            <div class="astral-lockscreen-hint">
                <div class="astral-swipe-indicator">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M12 2v14M19 9l-7-7-7 7"/>
                    </svg>
                </div>
                <button class="astral-lockscreen-unlock" id="astral-lockscreen-unlock">\u041E\u0442\u043A\u0440\u044B\u0442\u044C</button>
            </div>
        `;
      this.overlay = overlay;
      this.clockEl = overlay.querySelector("#astral-lockscreen-time");
      this.dateEl = overlay.querySelector("#astral-lockscreen-date");
      this.locked = true;
      overlay.addEventListener("touchstart", (e) => {
        this.swipeStart = e.touches[0]?.clientY ?? 0;
      }, { passive: true });
      overlay.addEventListener("touchmove", (e) => {
        const current = e.touches[0]?.clientY ?? 0;
        if (this.swipeStart - current > 70) this.unlock();
      }, { passive: true });
      overlay.addEventListener("wheel", (e) => {
        if (e.deltaY > 30) this.unlock();
      }, { passive: true });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.closest(".astral-lockscreen-hint") || e.target.closest(".astral-lockscreen-bg")) {
          this.unlock();
        }
      });
      overlay.querySelector("#astral-lockscreen-unlock")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.unlock();
      });
      overlay.querySelector("#astral-lockscreen-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onCloseRequest?.();
      });
      this._updateTime();
      clearInterval(this._clockInterval);
      this._clockInterval = setInterval(() => this._updateTime(), 2e4);
      return overlay;
    }
    _renderNotifications(state) {
      const list = Array.isArray(state.notifications) ? state.notifications : [];
      if (list.length === 0) {
        return '<div class="astral-notification astral-notification--empty">\u041D\u0435\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439</div>';
      }
      return list.slice(-4).reverse().map((n) => `
                <div class="astral-notification">
                    <div class="astral-notification-head">
                        <span class="astral-notification-app">${this._esc(this._appLabel(n.app))}</span>
                        <span class="astral-notification-time">${this._ago(n.timestamp)}</span>
                    </div>
                    <div class="astral-notification-title">${this._esc(n.title || "")}</div>
                    <div class="astral-notification-text">${this._esc(n.text || "")}</div>
                </div>
            `).join("");
    }
    _appLabel(app) {
      return {
        messages: "Messages",
        gallery: "Gallery",
        spicy: "Spicy Hub",
        creator: "Creator Studio"
      }[app] || app || "";
    }
    _ago(ts) {
      if (!ts) return "";
      const diff = Math.max(0, Date.now() - ts);
      const m = Math.floor(diff / 6e4);
      if (m < 1) return "\u0441\u0435\u0439\u0447\u0430\u0441";
      if (m < 60) return `${m} \u043C\u0438\u043D`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} \u0447`;
      return `${Math.floor(h / 24)} \u0434`;
    }
    _updateTime() {
      if (!this.clockEl) return;
      const now = /* @__PURE__ */ new Date();
      this.clockEl.textContent = now.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });
      if (this.dateEl) {
        this.dateEl.textContent = now.toLocaleDateString("ru-RU", {
          weekday: "short",
          month: "short",
          day: "numeric"
        });
      }
    }
    unlock() {
      if (!this.locked) return;
      this.locked = false;
      this.overlay?.classList.add("astral-lockscreen-unlocked");
      clearInterval(this._clockInterval);
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
    /** Убрать локскрин немедленно (при закрытии телефона). */
    destroy() {
      clearInterval(this._clockInterval);
      this.overlay?.remove();
      this.overlay = null;
      this.locked = true;
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/account-manager.js
  var AccountManager = class {
    static {
      __name(this, "AccountManager");
    }
    constructor(context, storage2) {
      this._seed = context || null;
      this.storage = storage2;
      this._cachedChatId = null;
      this._cached = null;
    }
    _ctx() {
      try {
        const live = globalThis.SillyTavern?.getContext?.();
        if (live) return live;
      } catch {
      }
      return this._seed || {};
    }
    /** Current chat id, via storage (single source of truth). */
    _chatId() {
      return this.storage.chatId();
    }
    /** Account for the chat that is loaded right now. */
    getCurrentAccount() {
      const chatId = this._chatId();
      if (this._cached && this._cachedChatId === chatId) return this._cached;
      const state = this.storage.getState();
      if (state.account) {
        this._cached = state.account;
        this._cachedChatId = chatId;
        return this._cached;
      }
      const account = this._fromPersona();
      this.storage.updateState(null, { account });
      this._cached = account;
      this._cachedChatId = chatId;
      return account;
    }
    /** Drop the in-memory cache — call on chat switch. */
    invalidate() {
      this._cached = null;
      this._cachedChatId = null;
    }
    _fromPersona() {
      let name = "You";
      let avatar = this._initialAvatar("Y");
      let bio = "";
      try {
        const ctx = this._ctx();
        const persona = ctx.personas?.[ctx.user_persona] || ctx.persona || null;
        if (persona) {
          name = persona.name || name;
          if (persona.avatar && persona.avatar !== "none") avatar = persona.avatar;
          if (persona.description) bio = String(persona.description).slice(0, 200);
        }
        if (name === "You" && ctx.name1) {
          name = ctx.name1;
          avatar = this._initialAvatar(String(name).charAt(0).toUpperCase());
        }
      } catch (err) {
        console.warn("[Astral Phone] persona read failed:", err);
      }
      return {
        name,
        avatar,
        bio,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        stats: {
          followers: 1240,
          following: 87,
          posts: 0,
          likes: 0
        }
      };
    }
    updateAccount(partial) {
      const account = { ...this.getCurrentAccount(), ...partial };
      this.storage.updateState(null, { account });
      this._cached = account;
      this._cachedChatId = this._chatId();
      return account;
    }
    bumpStat(key, by = 1) {
      const account = this.getCurrentAccount();
      const stats = { ...account.stats || {}, [key]: (account.stats?.[key] || 0) + by };
      return this.updateAccount({ stats });
    }
    _initialAvatar(letter) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#D99AB5"/><text x="50" y="66" font-size="44" font-family="sans-serif" font-weight="600" text-anchor="middle" fill="#0D0B10">${letter}</text></svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
  };

  // apps/phone-core.js
  var ICONS = {
    home: `<svg viewBox="0 0 24 24"><path d="M12 3.2l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 13.7 7.8 16.2l1.1-4.8L5.2 8.2l4.9-.4z"/></svg>`,
    messages: `<svg viewBox="0 0 24 24"><path d="M20.5 12.2c0 4-3.8 7.2-8.5 7.2-1 0-2-.1-2.9-.4L4 20.5l1.3-3.5C4.2 15.6 3.5 14 3.5 12.2c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke-width="2"/></svg>`,
    gallery: `<svg viewBox="0 0 24 24"><rect x="3.2" y="5.4" width="17.6" height="13.2" rx="3"/><circle cx="12" cy="12" r="3.6"/><path d="M17.4 8.4h.01" stroke-width="2.4"/></svg>`,
    spicy: `<svg viewBox="0 0 24 24"><path d="M12 21c3.6 0 6.4-2.6 6.4-6.2 0-4.4-4.3-6.6-4.3-10.8-2.2 1-3.3 3-3.3 5.2 0 1.4.4 2.2.4 2.2-1.4-.6-2.4-2-2.4-3.6-1.6 1.6-2.6 3.9-2.6 6.4C6.2 18.2 8.6 21 12 21z"/></svg>`,
    creator: `<svg viewBox="0 0 24 24"><path d="M12 2.8l3.1 5.9 6.3 1-4.6 4.4 1.1 6.4-5.9-3.2-5.9 3.2 1.1-6.4L2.6 9.7l6.3-1z"/></svg>`,
    notes: `<svg viewBox="0 0 24 24"><path d="M5 3.5h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M15.5 3.5V8h4.5M8.5 12h7M8.5 16h4.5"/></svg>`,
    social: `<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M8.4 7.2l3.2 8.6M15.6 7.2l-3.2 8.6M8.6 6h6.8"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>`
  };
  var PhoneCore = class {
    static {
      __name(this, "PhoneCore");
    }
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.accountManager = null;
      try {
        this.accountManager = new AccountManager(context, storage2);
        this.accountManager.getOrCreateAccount();
      } catch (err) {
        console.error("[Astral Phone] AccountManager init failed (phone still usable):", err);
      }
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
      this.lockScreen = new LockScreen(context, storage2);
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
      this._ensureOnTop();
      this.overlay.classList.add("active");
      this.isOpen = true;
      this.showHome();
      this._startClock();
      document.addEventListener("keydown", this._onKeyDown);
      document.body.style.overflow = "hidden";
      this._showLockScreen();
    }
    /**
     * Держит оверлей последним ребёнком body и блокирует прокрутку страницы.
     *
     * На мобильном ST встречаются два эффекта: (1) оверлей остаётся внутри
     * контейнера с transform — тогда fixed считается от него, и «телефон»
     * занимает часть экрана; (2) другие элементы перекрывают его по z-index.
     * Перенос в конец body решает оба.
     */
    _ensureOnTop() {
      try {
        const el = this.overlay;
        if (!el) return;
        if (el.parentElement !== document.body) {
          document.body.appendChild(el);
        } else if (document.body.lastElementChild !== el) {
          document.body.appendChild(el);
        }
      } catch (err) {
        console.warn("[Astral Phone] could not reattach overlay:", err);
      }
    }
    /** Показать локскрин в рамке устройства. */
    _showLockScreen() {
      try {
        this._removeLockScreen();
        const phone = this.overlay?.querySelector(".astral-phone");
        if (!phone) return;
        this.lockScreen.onCloseRequest = () => this.close();
        const lockEl = this.lockScreen.build();
        lockEl.classList.add("astral-lockscreen--in-frame");
        phone.appendChild(lockEl);
      } catch (err) {
        console.warn("[Astral Phone] lockscreen failed, skipping:", err);
      }
    }
    /** Убрать локскрин, если он есть. */
    _removeLockScreen() {
      try {
        this.lockScreen.destroy?.();
      } catch (_) {
      }
      this.overlay?.querySelector("#astral-phone-lockscreen")?.remove();
    }
    close() {
      if (!this.isOpen) return;
      try {
        this.storage?.flush?.();
      } catch (err) {
        console.warn("[Astral Phone] flush failed:", err);
      }
      this._removeLockScreen();
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
      this._clearUnread(appId);
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
      this._bindCloseGestures(overlay);
    }
    /**
     * Жесты закрытия для тача.
     *
     * Кнопка ✕ на мобильном может оказаться под системной панелью, поэтому
     * добавляем два привычных способа: свайп вниз по шапке и свайп вправо по
     * левому краю (как «назад» в iOS).
     */
    _bindCloseGestures(overlay) {
      const header = overlay.querySelector(".astral-phone-header");
      if (!header) return;
      let startY = 0;
      let startX = 0;
      let tracking = false;
      const onStart = /* @__PURE__ */ __name((e) => {
        const t = e.touches?.[0];
        if (!t) return;
        tracking = true;
        startY = t.clientY;
        startX = t.clientX;
      }, "onStart");
      const onMove = /* @__PURE__ */ __name((e) => {
        if (!tracking) return;
        const t = e.touches?.[0];
        if (!t) return;
        const dy = t.clientY - startY;
        const dx = t.clientX - startX;
        if (dy > 90 && Math.abs(dx) < 70) {
          tracking = false;
          this.close();
        }
      }, "onMove");
      const onEnd = /* @__PURE__ */ __name(() => {
        tracking = false;
      }, "onEnd");
      header.addEventListener("touchstart", onStart, { passive: true });
      header.addEventListener("touchmove", onMove, { passive: true });
      header.addEventListener("touchend", onEnd, { passive: true });
      const phone = overlay.querySelector(".astral-phone");
      if (!phone) return;
      let edgeX = 0;
      let edgeTracking = false;
      phone.addEventListener("touchstart", (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        edgeTracking = t.clientX < 32;
        edgeX = t.clientX;
      }, { passive: true });
      phone.addEventListener("touchmove", (e) => {
        if (!edgeTracking) return;
        const t = e.touches?.[0];
        if (!t) return;
        if (t.clientX - edgeX > 70) {
          edgeTracking = false;
          this.close();
        }
      }, { passive: true });
      phone.addEventListener("touchend", () => {
        edgeTracking = false;
      }, { passive: true });
    }
    _renderHome() {
      const grid = document.createElement("div");
      grid.className = "astral-home-grid";
      const unread = this.storage.getState().unread || {};
      for (const [id, app] of this.apps.entries()) {
        const card = document.createElement("div");
        card.className = "astral-app-card";
        const badgeCount = Number(unread[id]) || 0;
        const badge = badgeCount > 0 ? `<span class="astral-app-badge">${badgeCount > 99 ? "99+" : badgeCount}</span>` : "";
        card.innerHTML = `
                <div class="astral-app-card-icon">${app.icon || ICONS.home}${badge}</div>
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
        spicy_posted: "spicy",
        note_written: "notes",
        social_post: "social"
      };
      const appId = routing[type];
      if (!appId) return { success: false, error: `Unknown event type: ${type}` };
      const app = this.apps.get(appId);
      if (!app || typeof app.handleEvent !== "function") {
        return { success: false, error: `App "${appId}" cannot handle events` };
      }
      try {
        const result = await app.handleEvent({ type, ...data });
        this.bumpUnread(appId);
        this.pushNotification({
          app: appId,
          title: app.title || appId,
          text: data.description || data.text || ""
        });
        try {
          const st = this.storage.getState();
          st.sinceEvent = 0;
          this.storage.save();
        } catch {
        }
        this.refresh();
        return result || { success: true };
      } catch (err) {
        console.error("[Astral Phone] Event handling failed:", err);
        return { success: false, error: err.message };
      }
    }
    /* ─────────────────────────── unread / notifications ─────────────────────────── */
    /** Clear the unread badge for an app (called when it is opened). */
    _clearUnread(appId) {
      try {
        const state = this.storage.getState();
        if (state.unread && state.unread[appId]) {
          state.unread[appId] = 0;
          this.storage.save();
        }
        if (Array.isArray(state.notifications) && state.notifications.length) {
          const kept = state.notifications.filter((n) => n.app !== appId);
          if (kept.length !== state.notifications.length) {
            state.notifications = kept;
            this.storage.save();
          }
        }
      } catch (err) {
        console.warn("[Astral Phone] clear unread failed:", err);
      }
    }
    /** Bump the unread counter for an app. */
    bumpUnread(appId, by = 1) {
      try {
        const state = this.storage.getState();
        if (!state.unread) state.unread = {};
        state.unread[appId] = (Number(state.unread[appId]) || 0) + by;
        this.storage.save();
      } catch (err) {
        console.warn("[Astral Phone] bump unread failed:", err);
      }
    }
    /** Push a notification onto the lock-screen queue (capped at 5). */
    pushNotification({ app, title, text }) {
      try {
        const state = this.storage.getState();
        if (!Array.isArray(state.notifications)) state.notifications = [];
        state.notifications.push({
          app,
          title: String(title || ""),
          text: String(text || "").slice(0, 140),
          timestamp: Date.now()
        });
        if (state.notifications.length > 5) {
          state.notifications = state.notifications.slice(-5);
        }
        this.storage.save();
      } catch (err) {
        console.warn("[Astral Phone] push notification failed:", err);
      }
    }
    /* ─────────────────────────── utils ─────────────────────────── */
    _esc(str) {
      return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  };

  // apps/storage.js
  var PhoneStorage = class {
    static {
      __name(this, "PhoneStorage");
    }
    constructor(context) {
      this._seed = context || null;
      this.key = "astral_phone";
    }
    /** Fresh ST context. */
    _ctx() {
      try {
        const live = globalThis.SillyTavern?.getContext?.();
        if (live) return live;
      } catch (err) {
        console.warn("[Astral Phone] getContext failed, using seed context:", err);
      }
      return this._seed || {};
    }
    /** The live per-chat metadata object. */
    _meta() {
      const ctx = this._ctx();
      return ctx.chatMetadata || ctx.chat_metadata || {};
    }
    /** Identity of the loaded chat — used to detect switches. */
    chatId() {
      const ctx = this._ctx();
      try {
        if (typeof ctx.getCurrentChatId === "function") {
          const id = ctx.getCurrentChatId();
          if (id) return String(id);
        }
      } catch {
      }
      if (ctx.chatId) return String(ctx.chatId);
      if (Array.isArray(ctx.chat) && ctx.chat.length) {
        const first = ctx.chat[0];
        const stamp = first?.send_date || first?.create_date || "";
        return `${ctx.characterId ?? 0}:${ctx.chat.length}:${stamp}`;
      }
      return `${ctx.characterId ?? 0}:empty`;
    }
    _root() {
      const meta = this._meta();
      if (!meta[this.key]) meta[this.key] = {};
      return meta[this.key];
    }
    _defaults() {
      return {
        messages: [],
        gallery: [],
        notes: [],
        social: [],
        socialFollowing: [],
        spicy: [],
        creator: {
          posts: [],
          subscribers: 0,
          revenue: 0,
          fans: []
        },
        /** Unread counters per app — drive the home-screen badges. */
        unread: { messages: 0, gallery: 0, notes: 0, social: 0, spicy: 0, creator: 0 },
        /** Latest RP events for the lock screen (newest last, capped). */
        notifications: [],
        /** How many chat messages have passed since the last phone_event. */
        sinceEvent: 0
      };
    }
    /**
     * Get state. The chat is implicit — metadata is already per-chat, so the
     * `chatId` argument exists only for API compatibility and is ignored.
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
      for (const list of ["messages", "gallery", "spicy"]) {
        if (!Array.isArray(root.state[list])) root.state[list] = [];
      }
      if (!Array.isArray(root.state.creator.posts)) root.state.creator.posts = [];
      if (!Array.isArray(root.state.creator.fans)) root.state.creator.fans = [];
      if (!Array.isArray(root.state.notifications)) root.state.notifications = [];
      if (!root.state.unread || typeof root.state.unread !== "object") {
        root.state.unread = { messages: 0, gallery: 0, notes: 0, social: 0, spicy: 0, creator: 0 };
      }
      if (!Array.isArray(root.state.notes)) root.state.notes = [];
      if (!Array.isArray(root.state.social)) root.state.social = [];
      if (!Array.isArray(root.state.socialFollowing)) root.state.socialFollowing = [];
      for (const key of ["messages", "gallery", "notes", "social", "spicy", "creator"]) {
        if (typeof root.state.unread[key] !== "number") root.state.unread[key] = 0;
      }
      if (typeof root.state.sinceEvent !== "number") root.state.sinceEvent = 0;
      return root.state;
    }
    setState(_chatId, state) {
      this._root().state = state;
      this.save();
    }
    updateState(_chatId, partial) {
      if (!partial || typeof partial !== "object") return this.getState();
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
    /**
     * Persist. State is mutated in place inside the live metadata object, so a
     * chat save writes it to disk. `saveMetadata` = saveChatConditional, which
     * rewrites the whole chat file — throttle it so a burst of clicks doesn't
     * hammer the disk, with a trailing flush so nothing is lost.
     */
    save() {
      this._pending = true;
      if (this._timer) return;
      const delay = 800;
      const flush = /* @__PURE__ */ __name(() => {
        this._timer = null;
        if (!this._pending) return;
        this._pending = false;
        const ctx = this._ctx();
        try {
          if (typeof ctx.saveMetadata === "function") {
            Promise.resolve(ctx.saveMetadata()).catch((err) => console.warn("[Astral Phone] metadata save failed:", err));
          } else if (typeof ctx.saveMetadataDebounced === "function") {
            ctx.saveMetadataDebounced();
          }
        } catch (err) {
          console.warn("[Astral Phone] could not persist chat metadata:", err);
        }
      }, "flush");
      this._timer = setTimeout(flush, delay);
    }
    /** Force an immediate write — call before the phone closes. */
    flush() {
      if (!this._pending) return;
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      this._pending = false;
      const ctx = this._ctx();
      try {
        if (typeof ctx.saveMetadata === "function") {
          Promise.resolve(ctx.saveMetadata()).catch((err) => console.warn("[Astral Phone] metadata save failed:", err));
        } else if (typeof ctx.saveMetadataDebounced === "function") {
          ctx.saveMetadataDebounced();
        }
      } catch (err) {
        console.warn("[Astral Phone] could not persist chat metadata:", err);
      }
    }
    reset() {
      this._root().state = this._defaults();
      this.save();
    }
  };

  // apps/character-book.js
  var MODULE = "[AstralCharBook]";
  var SETTINGS_KEY = "astral-phone";
  function readBooks() {
    try {
      const ctx = globalThis.SillyTavern?.getContext?.();
      const bag = ctx?.extensionSettings || globalThis.extension_settings;
      const settings = bag?.[SETTINGS_KEY];
      if (!settings || typeof settings !== "object") return { books: [], activeId: "" };
      if (Array.isArray(settings.characterBooks)) {
        const books = settings.characterBooks.filter((b) => b && typeof b === "object").map((b) => ({
          id: String(b.id || ""),
          name: String(b.name || "\u041F\u0440\u043E\u0444\u0438\u043B\u044C"),
          characters: Array.isArray(b.characters) ? b.characters : []
        }));
        return { books, activeId: String(settings.characterBooksActiveId || books[0]?.id || "") };
      }
      if (Array.isArray(settings.characters) && settings.characters.length) {
        const id = "default";
        const books = [{ id, name: "Default", characters: settings.characters }];
        settings.characterBooks = books;
        settings.characterBooksActiveId = id;
        return { books, activeId: id };
      }
      return { books: [], activeId: "" };
    } catch (_) {
      return { books: [], activeId: "" };
    }
  }
  __name(readBooks, "readBooks");
  function writeBooks(store) {
    try {
      const ctx = globalThis.SillyTavern?.getContext?.();
      const bag = ctx?.extensionSettings || globalThis.extension_settings;
      if (!bag) return false;
      if (!bag[SETTINGS_KEY]) bag[SETTINGS_KEY] = {};
      bag[SETTINGS_KEY].characterBooks = (store.books || []).map((b) => ({
        id: b.id,
        name: b.name,
        characters: b.characters || []
      }));
      bag[SETTINGS_KEY].characterBooksActiveId = store.activeId || "";
      const active = (store.books || []).find((b) => b.id === store.activeId) || store.books?.[0];
      bag[SETTINGS_KEY].characters = active?.characters || [];
      const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
      if (typeof persist === "function") persist();
      return true;
    } catch (err) {
      console.warn(`${MODULE} writeBooks failed:`, err?.message || err);
      return false;
    }
  }
  __name(writeBooks, "writeBooks");
  function listBooks() {
    return readBooks();
  }
  __name(listBooks, "listBooks");
  function addBook(name) {
    const store = readBooks();
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    store.books.push({ id, name: String(name || `\u041F\u0440\u043E\u0444\u0438\u043B\u044C ${store.books.length + 1}`), characters: [] });
    store.activeId = id;
    writeBooks(store);
    return id;
  }
  __name(addBook, "addBook");
  function activateBook(id) {
    const store = readBooks();
    if (!store.books.some((b) => b.id === id)) return false;
    store.activeId = id;
    return writeBooks(store);
  }
  __name(activateBook, "activateBook");
  function renameBook(id, name) {
    const store = readBooks();
    const b = store.books.find((x) => x.id === id);
    if (!b) return false;
    b.name = String(name || b.name);
    return writeBooks(store);
  }
  __name(renameBook, "renameBook");
  function removeBook(id) {
    const store = readBooks();
    if (store.books.length <= 1) return false;
    store.books = store.books.filter((b) => b.id !== id);
    if (store.activeId === id) store.activeId = store.books[0]?.id || "";
    return writeBooks(store);
  }
  __name(removeBook, "removeBook");
  function loadCharacters() {
    try {
      const store = readBooks();
      const active = store.books.find((b) => b.id === store.activeId) || store.books[0];
      const list = active?.characters;
      if (!Array.isArray(list)) return [];
      return list.filter((row) => row && typeof row === "object").map((row) => ({
        name: String(row.name || "").trim(),
        aliases: String(row.aliases || "").trim(),
        appearance: String(row.appearance || "").trim(),
        enabled: row.enabled !== false
      }));
    } catch (err) {
      console.warn(`${MODULE} load failed:`, err?.message || err);
      return [];
    }
  }
  __name(loadCharacters, "loadCharacters");
  function saveCharacters(list) {
    try {
      const store = readBooks();
      if (!store.books.length) {
        const id = "default";
        store.books = [{ id, name: "Default", characters: [] }];
        store.activeId = id;
      }
      const active = store.books.find((b) => b.id === store.activeId) || store.books[0];
      active.characters = (list || []).map((row) => ({
        name: String(row.name || ""),
        aliases: String(row.aliases || ""),
        appearance: String(row.appearance || ""),
        enabled: row.enabled !== false
      }));
      return writeBooks(store);
    } catch (err) {
      console.warn(`${MODULE} save failed:`, err?.message || err);
      return false;
    }
  }
  __name(saveCharacters, "saveCharacters");
  function keysOf(row) {
    const out = [row.name];
    for (const alias of String(row.aliases || "").split(",")) {
      const trimmed = alias.trim();
      if (trimmed) out.push(trimmed);
    }
    return out.filter(Boolean);
  }
  __name(keysOf, "keysOf");
  function escapeRe(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  __name(escapeRe, "escapeRe");
  function mentions(text, name) {
    const n = String(name || "").trim();
    if (!n) return false;
    if (/^[A-Za-z0-9 _.'-]+$/.test(n)) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}($|[^A-Za-z0-9])`, "i");
      return re.test(text);
    }
    return text.toLowerCase().includes(n.toLowerCase());
  }
  __name(mentions, "mentions");
  function matchCharacters(prompt2) {
    const text = String(prompt2 || "");
    if (!text) return { appearance: [], names: [] };
    const list = loadCharacters();
    const appearance = [];
    const names = [];
    for (const row of list) {
      if (!row.enabled) continue;
      if (!row.name || !row.appearance) continue;
      const hit = keysOf(row).some((key) => mentions(text, key));
      if (!hit) continue;
      if (!appearance.includes(row.appearance)) {
        appearance.push(row.appearance);
        names.push(row.name);
      }
    }
    if (appearance.length) {
      console.log(`${MODULE} \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0430 \u0432\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C: ${names.join(", ")}`);
    }
    return { appearance, names };
  }
  __name(matchCharacters, "matchCharacters");
  function injectAppearance(prompt2) {
    const text = String(prompt2 || "").trim();
    if (!text) return text;
    const { appearance } = matchCharacters(text);
    if (!appearance.length) return text;
    const missing = appearance.filter((a) => !text.toLowerCase().includes(a.toLowerCase()));
    if (!missing.length) return text;
    return `${missing.join(", ")}, ${text}`;
  }
  __name(injectAppearance, "injectAppearance");
  function renderCharacterBookHTML() {
    const list = loadCharacters();
    const rows = list.map((row, i) => `
        <div class="astral-charbook-row" data-index="${i}">
            <input type="text" class="text_pole astral-charbook-name"
                   value="${escAttr(row.name)}" placeholder="\u0418\u043C\u044F (\u043A\u0430\u043A \u0432 \u043F\u0440\u043E\u043C\u043F\u0442\u0435)" data-i="${i}" />
            <input type="text" class="text_pole astral-charbook-aliases"
                   value="${escAttr(row.aliases)}" placeholder="\u0410\u043B\u0438\u0430\u0441\u044B, \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E" data-i="${i}" />
            <textarea class="text_pole astral-charbook-appearance" rows="2"
                      placeholder="\u0412\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C: \u0432\u043E\u043B\u043E\u0441\u044B, \u0433\u043B\u0430\u0437\u0430, \u0442\u0435\u043B\u043E\u0441\u043B\u043E\u0436\u0435\u043D\u0438\u0435, \u043E\u0434\u0435\u0436\u0434\u0430" data-i="${i}">${escText(row.appearance)}</textarea>
            <div class="astral-charbook-actions">
                <label class="astral-charbook-toggle">
                    <input type="checkbox" class="astral-charbook-enabled" data-i="${i}" ${row.enabled ? "checked" : ""} />
                    <span>\u0432\u043A\u043B</span>
                </label>
                <button class="menu_button astral-charbook-remove" data-i="${i}" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C">\u2715</button>
            </div>
        </div>
    `).join("");
    const store = readBooks();
    const options = store.books.map((b) => `<option value="${escAttr(b.id)}" ${b.id === store.activeId ? "selected" : ""}>${escText(b.name)}</option>`).join("");
    const profilesBar = `
        <div class="astral-book-profiles">
            <select class="text_pole astral-book-select" title="\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0430">${options}</select>
            <button class="menu_button astral-book-new" title="\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C">+</button>
            <button class="menu_button astral-book-rename" title="\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C">\u270E</button>
            <button class="menu_button astral-book-del" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C" ${store.books.length <= 1 ? "disabled" : ""}>\u2715</button>
        </div>
        <small class="notes">\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u2014 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043D\u0430\u0431\u043E\u0440 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439. \u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0439\u0442\u0435 \u0435\u0433\u043E \u043F\u043E\u0434 \u0440\u0430\u0437\u043D\u044B\u0435 \u0447\u0430\u0442\u044B.</small>
    `;
    return `
        <div class="astral-charbook">
            ${profilesBar}
            <div class="astral-charbook-list">${rows || '<div class="astral-charbook-empty">\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E \u2014 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430</div>'}</div>
            <button class="menu_button astral-charbook-add">+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430</button>
            <small class="notes">\u0418\u043C\u044F \u0438\u0449\u0435\u0442\u0441\u044F \u0432 \u043F\u0440\u043E\u043C\u043F\u0442\u0435 (\u0438 \u0432 \u0430\u043B\u0438\u0430\u0441\u0430\u0445) \u0431\u0435\u0437 \u0443\u0447\u0451\u0442\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430. \u041D\u0430\u0439\u0434\u0435\u043D\u043D\u0430\u044F \u0432\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u043D\u0430\u0447\u0430\u043B\u043E \u043F\u0440\u043E\u043C\u043F\u0442\u0430 \u043F\u0440\u0438 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043B\u044E\u0431\u043E\u0433\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F.</small>
        </div>
    `;
  }
  __name(renderCharacterBookHTML, "renderCharacterBookHTML");
  function reRender(root, onChange) {
    const host = root.querySelector(".astral-charbook");
    if (!host) return;
    host.outerHTML = renderCharacterBookHTML();
    bindCharacterBook(root, onChange);
    onChange?.(loadCharacters());
  }
  __name(reRender, "reRender");
  function bindCharacterBook(root, onChange) {
    const book = root?.querySelector(".astral-charbook");
    if (!book) return;
    const commit = /* @__PURE__ */ __name(() => {
      const list = [];
      book.querySelectorAll(".astral-charbook-row").forEach((row) => {
        list.push({
          name: row.querySelector(".astral-charbook-name")?.value || "",
          aliases: row.querySelector(".astral-charbook-aliases")?.value || "",
          appearance: row.querySelector(".astral-charbook-appearance")?.value || "",
          enabled: row.querySelector(".astral-charbook-enabled")?.checked !== false
        });
      });
      saveCharacters(list);
      onChange?.(list);
    }, "commit");
    book.querySelectorAll(".astral-charbook-name, .astral-charbook-aliases, .astral-charbook-appearance").forEach((el) => el.addEventListener("input", commit));
    book.querySelectorAll(".astral-charbook-enabled").forEach((el) => el.addEventListener("change", commit));
    book.querySelectorAll(".astral-charbook-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const i = Number(btn.dataset.i);
        const list = loadCharacters();
        list.splice(i, 1);
        saveCharacters(list);
        reRender(root, onChange);
      });
    });
    book.querySelector(".astral-book-select")?.addEventListener("change", (e) => {
      activateBook(e.target.value);
      reRender(root, onChange);
    });
    book.querySelector(".astral-book-new")?.addEventListener("click", (e) => {
      e.preventDefault();
      const name = globalThis.prompt?.("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F:", `\u041F\u0440\u043E\u0444\u0438\u043B\u044C ${listBooks().books.length + 1}`);
      if (name === null) return;
      addBook(String(name || "").trim());
      reRender(root, onChange);
    });
    book.querySelector(".astral-book-rename")?.addEventListener("click", (e) => {
      e.preventDefault();
      const store = listBooks();
      const active = store.books.find((b) => b.id === store.activeId);
      if (!active) return;
      const name = globalThis.prompt?.("\u041D\u043E\u0432\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:", active.name);
      if (name === null) return;
      renameBook(active.id, String(name || "").trim());
      reRender(root, onChange);
    });
    book.querySelector(".astral-book-del")?.addEventListener("click", (e) => {
      e.preventDefault();
      const store = listBooks();
      if (store.books.length <= 1) return;
      if (!globalThis.confirm?.("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043E \u0432\u0441\u0435\u043C\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430\u043C\u0438?")) return;
      removeBook(store.activeId);
      reRender(root, onChange);
    });
    book.querySelector(".astral-charbook-add")?.addEventListener("click", (e) => {
      e.preventDefault();
      const list = loadCharacters();
      list.push({ name: "", aliases: "", appearance: "", enabled: true });
      saveCharacters(list);
      reRender(root, onChange);
      const rows = root.querySelectorAll(".astral-charbook-row");
      rows[rows.length - 1]?.querySelector(".astral-charbook-name")?.focus();
    });
  }
  __name(bindCharacterBook, "bindCharacterBook");
  function escAttr(str) {
    return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  __name(escAttr, "escAttr");
  function escText(str) {
    return String(str ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }
  __name(escText, "escText");

  // apps/prompt-builder.js
  var MODULE2 = "[AstralPrompt]";
  var QUALITY_TAGS = "masterpiece, best quality, very aesthetic, absurdres, highly detailed";
  var DEFAULT_NEGATIVE = "lowres, bad anatomy, bad hands, text, watermark, logo, blurry, jpeg artifacts, worst quality, low quality, deformed, extra limbs, extra fingers, cropped, out of frame";
  function deepWalk(root, visit, maxDepth = 5) {
    const seen = /* @__PURE__ */ new WeakSet();
    const walk = /* @__PURE__ */ __name((node, depth, path) => {
      if (!node || typeof node !== "object" || depth > maxDepth) return;
      if (seen.has(node)) return;
      seen.add(node);
      visit(node, depth, path);
      for (const [k, v] of Object.entries(node)) {
        if (v && typeof v === "object") walk(v, depth + 1, path ? `${path}.${k}` : k);
      }
    }, "walk");
    walk(root, 0, "");
  }
  __name(deepWalk, "deepWalk");
  var TEXT_KEYS = ["text", "prompt", "content", "value", "description"];
  function firstText(obj, keys = TEXT_KEYS) {
    if (!obj || typeof obj !== "object") return "";
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }
  __name(firstText, "firstText");
  function findStyle(raw) {
    if (!raw) return "";
    for (const k of ["style", "artStyle", "activeStyle", "stylePreset", "promptPrefix"]) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    const presetArrays = [];
    for (const [k, v] of Object.entries(raw)) {
      if (!Array.isArray(v) || !/style|preset/i.test(k)) continue;
      const items = v.filter((x) => x && typeof x === "object" && firstText(x));
      if (items.length) presetArrays.push(items);
    }
    for (const k of Object.keys(raw)) {
      if (!/^active.*(style|preset)/i.test(k)) continue;
      const id = String(raw[k] || "").trim();
      if (!id) continue;
      for (const items of presetArrays) {
        const hit = items.find((x) => String(x.id || x.key || x.name || "") === id);
        const text = firstText(hit);
        if (text) return text;
      }
    }
    const all = presetArrays.flat();
    const enabled = all.filter((x) => x.enabled === true || x.active === true || x.selected === true);
    if (enabled.length === 1) return firstText(enabled[0]);
    if (all.length === 1) return firstText(all[0]);
    return "";
  }
  __name(findStyle, "findStyle");
  function findLorebook(raw) {
    const out = [];
    const seen = /* @__PURE__ */ new WeakSet();
    deepWalk(raw, (node) => {
      if (!Array.isArray(node.refs) || seen.has(node)) return;
      seen.add(node);
      if (node.enabled === false) return;
      for (const ref of node.refs) {
        if (!ref || ref.enabled === false) continue;
        const desc = firstText(ref);
        if (!desc) continue;
        const name = String(ref.name || "").trim();
        out.push(name ? `${name}, ${desc}` : desc);
      }
    });
    if (Array.isArray(raw?.additionalReferences)) {
      for (const ref of raw.additionalReferences) {
        if (!ref || ref.enabled === false) continue;
        const desc = firstText(ref);
        if (!desc) continue;
        const name = String(ref.name || "").trim();
        out.push(name ? `${name}, ${desc}` : desc);
      }
    }
    return [...new Set(out)];
  }
  __name(findLorebook, "findLorebook");
  function dumpSettingsShape(raw, maxLines = 140) {
    const lines = [];
    const seen = /* @__PURE__ */ new WeakSet();
    const walk = /* @__PURE__ */ __name((node, depth, path) => {
      if (!node || typeof node !== "object" || depth > 3 || lines.length >= maxLines) return;
      if (seen.has(node)) return;
      seen.add(node);
      for (const [k, v] of Object.entries(node)) {
        if (lines.length >= maxLines) return;
        const p = path ? `${path}.${k}` : k;
        if (Array.isArray(v)) {
          const sample = v.find((x) => x && typeof x === "object");
          lines.push(`${p}[] n=${v.length}${sample ? ` {${Object.keys(sample).slice(0, 8).join(",")}}` : ""}`);
          if (sample) walk(sample, depth + 1, `${p}[0]`);
        } else if (v && typeof v === "object") {
          lines.push(`${p}{} {${Object.keys(v).slice(0, 10).join(",")}}`);
          walk(v, depth + 1, p);
        } else if (typeof v === "string" && v.trim()) {
          lines.push(`${p} = "${v.slice(0, 40)}"`);
        } else if (typeof v === "boolean" || typeof v === "number") {
          lines.push(`${p} = ${v}`);
        }
      }
    }, "walk");
    walk(raw, 0, "");
    return lines;
  }
  __name(dumpSettingsShape, "dumpSettingsShape");
  function collectHaruspics(imageGen2, ctx) {
    const empty = {
      available: false,
      style: "",
      negative: "",
      refInstruction: "",
      chars: [],
      lorebook: [],
      sendCharAvatar: false,
      sendUserAvatar: false
    };
    let raw = null;
    try {
      raw = imageGen2?._rawSettings?.() || null;
    } catch (_) {
    }
    if (!raw) return empty;
    const charName = resolveCharName(ctx);
    const userName = resolveUserName(ctx);
    const avatarHint = String(ctx?.characters?.[ctx?.characterId]?.avatar || "").trim();
    let userAvatar = "";
    try {
      userAvatar = String(globalThis.SillyTavern?.getContext?.()?.user_avatar || "").trim();
    } catch (_) {
    }
    if (!userAvatar) {
      try {
        userAvatar = String(raw.userAvatarFile || "").trim();
      } catch (_) {
      }
    }
    const out = { ...empty, available: true };
    out.style = findStyle(raw);
    try {
      const items = Array.isArray(raw.negativeGalleryItems) ? raw.negativeGalleryItems : [];
      if (items.length) {
        const activeId = String(raw.activeNegativeId || "").trim();
        const active = items.find((i) => i.id === activeId) || items.find((i) => i.enabled === true || i.active === true);
        out.negative = firstText(active) || "";
      }
    } catch (_) {
    }
    if (raw.refInstructionEnabled !== false) {
      out.refInstruction = String(raw.refInstruction || "").trim();
    }
    try {
      const book = loadCharacters();
      const pick = /* @__PURE__ */ __name((name) => {
        const wanted = String(name || "").trim().toLowerCase();
        if (!wanted) return null;
        return book.find((row) => row.enabled && (row.name.toLowerCase() === wanted || row.aliases.toLowerCase().split(",").map((a) => a.trim()).includes(wanted)));
      }, "pick");
      const charRow = pick(charName);
      if (charRow) out.chars.push({ name: charName, appearance: charRow.appearance, refs: [] });
      const userRow = pick(userName);
      if (userRow && userRow !== charRow) {
        out.chars.push({ name: userName, appearance: userRow.appearance, refs: [] });
      }
      if (book.length) {
        console.log(`${MODULE2} \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A: ${book.length} \u0437\u0430\u043F\u0438\u0441\u0435\u0439, \u0441\u043E\u0432\u043F\u0430\u043B\u043E ${out.chars.length}`);
      }
    } catch (_) {
    }
    out.lorebook = findLorebook(raw);
    out.sendCharAvatar = Boolean(raw.sendCharAvatar);
    out.sendUserAvatar = Boolean(raw.sendUserAvatar);
    console.log(`${MODULE2} Haruspics: style=${out.style ? "yes" : "no"} chars=${out.chars.length} lorebook=${out.lorebook.length} neg=${out.negative ? "yes" : "no"}`);
    if (!out.style && !out.chars.length && !out.lorebook.length) {
      console.warn(`${MODULE2} \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E. \u0420\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 inline_image_gen:`);
      for (const line of dumpSettingsShape(raw)) console.warn(`  ${line}`);
    }
    return out;
  }
  __name(collectHaruspics, "collectHaruspics");
  function resolveCharName(ctx) {
    const fromCard = String(ctx?.characters?.[ctx?.characterId]?.name || "").trim();
    const fallback = String(ctx?.name2 || "").trim();
    const pick = fromCard || fallback;
    if (!pick || /sillytavern/i.test(pick)) return fromCard || "the character";
    return pick;
  }
  __name(resolveCharName, "resolveCharName");
  function resolveUserName(ctx) {
    const pick = String(ctx?.name1 || "").trim();
    if (!pick || /sillytavern/i.test(pick)) return "the viewer";
    return pick;
  }
  __name(resolveUserName, "resolveUserName");
  function buildAsk({ mode, charName, userName, sceneText, knownCharacters, customInstruction }) {
    const who = mode === "selfie" ? `"${charName}" AND "${userName}" (both in frame)` : `"${charName}" (alone in frame, "${userName}" holds the camera and is NOT visible)`;
    const locked = Array.isArray(knownCharacters) ? knownCharacters.filter((c) => c?.name && c?.appearance) : [];
    let appearanceRule;
    if (locked.length) {
      const list = locked.map((c) => `  - "${c.name}": ${c.appearance}`).join("\n");
      appearanceRule = `LOCKED APPEARANCE \u2014 these characters already have a fixed appearance.
You MUST leave hair, eyes, build and skin EMPTY ("") for them. Do not describe, guess,
paraphrase or contradict the appearance below. It is inserted into the prompt
automatically, word for word:
${list}

For any character NOT in that list, fill hair, eyes, build and skin from the scene.`;
    } else {
      appearanceRule = `No fixed appearance exists for anyone \u2014 fill hair, eyes, build and skin from the scene.`;
    }
    const custom = customInstruction ? `
USER'S EXTRA GUIDANCE (follow it, but still answer as JSON):
${customInstruction}
` : "";
    return `You are an image-prompt tagger for NovelAI v5. You do not write prose.
You read a roleplay scene and return ONLY a JSON object of short English tags.

ROLEPLAY SCENE (may be in any language \u2014 read it, do not copy its language):
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
- No quality tags, no style tags, no "masterpiece" \u2014 those are added separately.
- Reference characters by the exact names given ("${charName}", "${userName}").
- For selfie mode add both characters to the array and make the gaze "looking at viewer".
- Output the JSON only. No markdown fences, no commentary.`;
  }
  __name(buildAsk, "buildAsk");
  function parseStructured(raw) {
    let text = String(raw || "").trim();
    if (!text) return null;
    text = text.replace(/```[a-z]*\n?/gi, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const candidate = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object") return null;
      if (!Array.isArray(parsed.characters)) parsed.characters = [];
      return parsed;
    } catch (_) {
      return null;
    }
  }
  __name(parseStructured, "parseStructured");
  function cleanTags(value) {
    let s = String(value || "");
    if (!s) return "";
    s = s.replace(/```[a-z]*\n?/gi, " ");
    s = s.replace(/<[^>]*>/g, " ");
    s = s.replace(/\[[A-Z_]{3,}[^\]]*\]/g, " ");
    s = s.replace(/^(tags?|prompt|description|answer)\s*:\s*/i, "");
    const chunks = s.split(/[,;]\s*|\n+/).map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean).filter((c) => !/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(c)).filter((c) => /[A-Za-z]{2,}/.test(c));
    return chunks.join(", ").trim();
  }
  __name(cleanTags, "cleanTags");
  function assemble(structured, haruspics, opts) {
    const { mode, charName, userName } = opts;
    const h = haruspics || {};
    const st = structured || {};
    const base = [];
    if (h.style) base.push(cleanTags(h.style));
    const shot = cleanTags(st.shot) || (mode === "selfie" ? "close-up selfie" : "candid photo, upper body shot");
    base.push(shot);
    if (mode === "selfie") base.push("selfie, looking at viewer");
    else base.push("shot on smartphone, candid");
    for (const c of st.characters || []) {
      const nm = String(c.ref || "").trim();
      const act = cleanTags(c.action);
      if (nm && act) base.push(`${nm} ${act}`);
    }
    const setting = cleanTags(st.setting);
    if (setting) base.push(setting);
    const lighting = cleanTags(st.lighting);
    if (lighting) base.push(lighting);
    if (h.lorebook?.length) base.push(cleanTags(h.lorebook.join(", ")));
    base.push(QUALITY_TAGS);
    const charBlocks = [];
    for (const c of st.characters || []) {
      const ref = String(c.ref || "").trim();
      if (!ref) continue;
      const tags = [];
      const gender = cleanTags(c.genderTag);
      if (gender) tags.push(gender);
      const pos = cleanTags(c.position);
      if (pos) tags.push(pos);
      tags.push(ref);
      const known = (h.chars || []).find((x) => x.name === ref);
      const knownAppearance = known?.appearance ? String(known.appearance).trim() : "";
      if (knownAppearance) {
        tags.push(knownAppearance);
      } else {
        for (const k of ["hair", "eyes", "build", "skin"]) {
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
      else if (mode === "selfie") tags.push("looking at viewer");
      charBlocks.push(tags.filter(Boolean).join(", "));
    }
    let prompt2 = [base.filter(Boolean).join(", "), ...charBlocks.filter(Boolean)].join(" | ");
    for (const lockedChar of h.chars || []) {
      if (!lockedChar.appearance) continue;
      if (!prompt2.includes(lockedChar.appearance)) {
        prompt2 = `${lockedChar.appearance}, ${prompt2}`;
      }
    }
    try {
      const { appearance } = matchCharacters(prompt2);
      const missing = appearance.filter((a) => !prompt2.toLowerCase().includes(a.toLowerCase()));
      if (missing.length) prompt2 = `${missing.join(", ")}, ${prompt2}`;
    } catch (_) {
    }
    const negative = h.negative ? cleanTags(h.negative) : DEFAULT_NEGATIVE;
    return { prompt: prompt2, negative };
  }
  __name(assemble, "assemble");
  async function buildPhotoPrompt({ imageGen: imageGen2, ctx, askModel, sceneText, mode, customInstruction }) {
    const charName = resolveCharName(ctx);
    const userName = resolveUserName(ctx);
    const haruspics = collectHaruspics(imageGen2, ctx);
    const ask2 = buildAsk({
      mode,
      charName,
      userName,
      sceneText,
      knownCharacters: haruspics.chars || [],
      customInstruction
    });
    let structured = null;
    try {
      const raw = await askModel(ask2);
      structured = parseStructured(raw);
      if (!structured) {
        console.warn(`${MODULE2} model returned no parseable JSON:`, String(raw || "").slice(0, 200));
      }
    } catch (err) {
      console.warn(`${MODULE2} model call failed:`, err?.message || err);
    }
    if (!structured || !(structured.characters || []).some((c) => c.ref === charName)) {
      structured = structured || {};
      structured.characters = Array.isArray(structured.characters) ? structured.characters : [];
      structured.characters.unshift({
        ref: charName,
        genderTag: "",
        position: mode === "selfie" ? "left side" : "center",
        outfit: "",
        expression: "",
        action: "",
        gaze: mode === "selfie" ? "looking at viewer" : ""
      });
    }
    const { prompt: prompt2, negative } = assemble(structured, haruspics, { mode, charName, userName });
    return { prompt: prompt2, negative, structured, haruspics };
  }
  __name(buildPhotoPrompt, "buildPhotoPrompt");

  // apps/image-gen.js
  var HARUSPICS_MODULE_NAME = "inline_image_gen";
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
  __name(isGeminiModel, "isGeminiModel");
  function normalizeOpenAIBaseUrl(endpoint) {
    return (endpoint || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
  }
  __name(normalizeOpenAIBaseUrl, "normalizeOpenAIBaseUrl");
  function buildOpenAIUrl(endpoint, path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return `${normalizeOpenAIBaseUrl(endpoint)}/v1/${cleanPath}`;
  }
  __name(buildOpenAIUrl, "buildOpenAIUrl");
  function isRouterEndpoint(endpoint) {
    const lower = (endpoint || "").toLowerCase();
    return lower.includes("closerouter") || lower.includes("openrouter") || lower.includes("rout.my");
  }
  __name(isRouterEndpoint, "isRouterEndpoint");
  function normalizeApiKey(apiKey) {
    return String(apiKey ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/^Bearer\s+/i, "").replace(/\s+/g, "").trim();
  }
  __name(normalizeApiKey, "normalizeApiKey");
  function buildAuthHeaders(apiKey, extra = {}) {
    return {
      ...extra,
      "Authorization": `Bearer ${normalizeApiKey(apiKey)}`
    };
  }
  __name(buildAuthHeaders, "buildAuthHeaders");
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
    const pushCandidate = /* @__PURE__ */ __name((url) => {
      if (!candidates.some((candidate) => candidate.url === url)) {
        candidates.push({
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cleanApiKey}`
          }
        });
      }
    }, "pushCandidate");
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
  __name(buildGeminiRequestCandidates, "buildGeminiRequestCandidates");
  function normalizeNaisteraModel(model) {
    return String(model || "").trim();
  }
  __name(normalizeNaisteraModel, "normalizeNaisteraModel");
  function isNaisteraNovelAIModel(model) {
    return /^novelai(?:-|$)/i.test(normalizeNaisteraModel(model));
  }
  __name(isNaisteraNovelAIModel, "isNaisteraNovelAIModel");
  function normalizeNaisteraCharacterDescriptionsMode(value) {
    return ["none", "as-is", "character-prompt"].includes(value) ? value : "as-is";
  }
  __name(normalizeNaisteraCharacterDescriptionsMode, "normalizeNaisteraCharacterDescriptionsMode");
  function normalizeNaisteraEndpoint(endpoint) {
    const value = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!value) return "https://naistera.org";
    return value.replace(/\/api\/(?:generate|models)$/i, "");
  }
  __name(normalizeNaisteraEndpoint, "normalizeNaisteraEndpoint");
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
  __name(formatNaisteraDescription, "formatNaisteraDescription");
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
  __name(normalizeReturnedImage, "normalizeReturnedImage");
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
  __name(extractImageFromText, "extractImageFromText");
  function parseImageFromApiResponse(result) {
    const candidates = [];
    const push = /* @__PURE__ */ __name((value) => {
      if (value == null) return;
      if (typeof value === "string") candidates.push(value);
      else if (typeof value === "object") {
        candidates.push(value.url, value.uri, value.b64_json, value.b64, value.base64, value.image);
        candidates.push(value.image_url?.url, value.image_url);
        if (value.data) candidates.push(value.data);
      }
    }, "push");
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
  __name(parseImageFromApiResponse, "parseImageFromApiResponse");
  function extractNaisteraDataUrl(result) {
    const candidates = [];
    const push = /* @__PURE__ */ __name((value) => {
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
    }, "push");
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
  __name(extractNaisteraDataUrl, "extractNaisteraDataUrl");
  async function extractNovelAIPng(archive) {
    const bytes = new Uint8Array(archive);
    if (bytes.length < 22 || bytes.length > 60 * 1024 * 1024) throw new Error("NovelAI \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B ZIP \u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C.");
    const view = new DataView(archive);
    const uint16 = /* @__PURE__ */ __name((offset2) => view.getUint16(offset2, true), "uint16");
    const uint32 = /* @__PURE__ */ __name((offset2) => view.getUint32(offset2, true), "uint32");
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
  __name(extractNovelAIPng, "extractNovelAIPng");
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 24576;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }
  __name(arrayBufferToBase64, "arrayBufferToBase64");
  var ImageGenerator = class {
    static {
      __name(this, "ImageGenerator");
    }
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
          const s = bag[HARUSPICS_MODULE_NAME];
          if (s && typeof s === "object") return s;
        }
      } catch (_) {
      }
      try {
        const s = this._ctx()?.extensionSettings?.[HARUSPICS_MODULE_NAME];
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
    /* ─────────────────────────── haruspics sync ─────────────────────────── */
    /**
     * Read the active style tag from Haruspics settings.
     * Haruspics stores the selected style in `extension_settings.inline_image_gen.style`.
     * Falls back to an empty string if not configured.
     */
    /**
     * Активный стиль из Haruspics.
     *
     * Использует тот же структурный поиск, что и prompt-builder: имена полей в
     * inline_image_gen менялись между версиями, поэтому жёсткая привязка к
     * `activeStyleId` находила стиль не всегда — из-за этого в creator studio
     * он молча пропадал, хотя галерея его подхватывала.
     */
    getStyle() {
      try {
        const s = this._rawSettings();
        if (!s) return "";
        const found = findStyle(s);
        return String(found || "").trim();
      } catch (_) {
        return "";
      }
    }
    _collectRefs() {
      try {
        const s = this._rawSettings();
        if (!s) return EMPTY_REFS;
        const textDirectives = [];
        const textOnlyClothing = [];
        const ctx = this._ctx();
        const charName = ctx?.name2 || "";
        const userName = ctx?.name1 || "";
        const charLib = s.characterReferenceLibrary;
        if (charLib && typeof charLib === "object") {
          const addItems = /* @__PURE__ */ __name((bucket, displayName) => {
            if (!displayName) return;
            const entry = charLib[bucket]?.[displayName];
            if (!entry) return;
            for (const item of entry.appearanceItems || []) {
              if (item.enabled === false) continue;
              if (item.type !== "text") continue;
              const desc = String(item.description || "").trim();
              if (desc) textOnlyClothing.push({ charName: displayName, description: desc });
            }
          }, "addItems");
          addItems("characters", charName);
          addItems("users", userName);
        }
        const lorebooks = s.lorebooks;
        if (Array.isArray(lorebooks)) {
          for (const lb of lorebooks) {
            if (lb.enabled === false) continue;
            for (const ref of lb.refs || []) {
              if (ref.enabled === false) continue;
              const name = String(ref.name || "").trim();
              const desc = String(ref.description || "").trim();
              if (!desc) continue;
              if (name) textOnlyClothing.push({ charName: name, description: desc });
              else textDirectives.push(desc);
            }
          }
        }
        if (textDirectives.length === 0 && textOnlyClothing.length === 0) return EMPTY_REFS;
        const style = this.getStyle();
        console.log(`[AstralImageGen] Synced from IIG \u2014 style="${style}", directives=${textDirectives.length}, clothing=${textOnlyClothing.length}`);
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
    async generate(prompt2, metadata = {}) {
      const settings = this._settings();
      let text = String(prompt2 ?? "").trim();
      if (!text) throw new Error("\u041F\u0443\u0441\u0442\u043E\u0439 \u043F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F.");
      try {
        text = injectAppearance(text);
      } catch (err) {
        console.warn("[AstralImageGen] appearance injection skipped:", err?.message);
      }
      const requested = metadata.style !== void 0 ? String(metadata.style).trim() : "";
      const style = requested || this.getStyle();
      const refs = metadata.refs !== void 0 ? metadata.refs : this._collectRefs();
      if (!style) {
        console.warn("[AstralImageGen] \u0441\u0442\u0438\u043B\u044C \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D: \u0432 inline_image_gen \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u043F\u0440\u0435\u0441\u0435\u0442\u0430");
      }
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
    async _generateWithTimeout(prompt2, settings, style = "", refs = EMPTY_REFS, negativePrompt = void 0) {
      const timeoutMs = Math.max(5, Number(settings.requestTimeout) || 120) * 1e3;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const options = { signal: controller.signal, _refs: refs };
      if (negativePrompt != null && String(negativePrompt).trim() !== "") {
        options.negativePrompt = String(negativePrompt).trim();
      }
      try {
        const isRouterApi = isRouterEndpoint(settings.endpoint);
        const useGeminiApi = settings.apiType === "gemini" && !isRouterApi;
        if (settings.apiType === "naistera") {
          return await this.generateImageNaistera(prompt2, style, settings, options);
        }
        if (["novelai", "novelai-direct"].includes(settings.apiType)) {
          return await this.generateImageNovelAI(prompt2, style, settings, options);
        }
        const useChatApi = settings.apiType === "openai-chat" || isRouterApi && (settings.apiType === "openai" || settings.apiType === "gemini");
        if (useGeminiApi) {
          return await this.generateImageGemini(prompt2, style, settings, options);
        }
        if (useChatApi) {
          return await this.generateImageOpenAIChat(prompt2, style, settings, options);
        }
        return await this.generateImageOpenAI(prompt2, style, settings, options);
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
    async generateImageNaistera(prompt2, style, settings, options = {}) {
      const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
      const model = normalizeNaisteraModel(settings.naisteraModel);
      if (!model) throw new Error("Naistera: \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 (\u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 haruspics).");
      if (!this.getNaisteraModelInfo(model)) {
        await this._ensureNaisteraCatalog(settings);
      }
      const modelInfo = this.getNaisteraModelInfo(model);
      const descriptionMode = normalizeNaisteraCharacterDescriptionsMode(settings.naisteraCharacterDescriptionsMode);
      const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;
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
      promptParts.push(prompt2);
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
    async generateImageNovelAI(prompt2, style, settings, options = {}) {
      const parts = [];
      if (style) parts.push(style);
      const { textDirectives, textOnlyClothing } = options._refs || EMPTY_REFS;
      parts.push(...textDirectives);
      for (const clothing of textOnlyClothing) {
        if (clothing.description) parts.push(`${clothing.charName || "Character"} is wearing: ${clothing.description}`);
      }
      for (const ref of (options._refs || EMPTY_REFS).imageRefs) {
        if (ref.type === "clothing" && ref.description) parts.push(`${ref.name || "Character"} is wearing: ${ref.description}`);
      }
      parts.push(prompt2);
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
    async generateImageOpenAI(prompt2, style, settings, options = {}) {
      const url = buildOpenAIUrl(settings.endpoint, "images/generations");
      const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;
      const promptParts = [];
      if (style) promptParts.push(`[Style: ${style}]`);
      for (const directive of textDirectives) promptParts.push(directive);
      for (const c of textOnlyClothing) promptParts.push(`[CLOTHING: ${c.charName} is wearing: ${c.description}]`);
      for (const ref of imageRefs) {
        if (ref.type === "clothing" && ref.description) {
          promptParts.push(`[CLOTHING for ${ref.name}: ${ref.description}]`);
        }
      }
      promptParts.push(prompt2);
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
    async generateImageOpenAIChat(prompt2, style, settings, options = {}) {
      const url = buildOpenAIUrl(settings.endpoint, "chat/completions");
      const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;
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
${prompt2}`);
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
    async generateImageGemini(prompt2, style, settings, options = {}) {
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
      const { imageRefs, textOnlyClothing, textDirectives } = options._refs || EMPTY_REFS;
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
${prompt2}
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

  // apps/prompt-llm.js
  var MODULE3 = "[AstralLLM]";
  var SETTINGS_KEY2 = "astral-phone";
  function emptyProfile() {
    return { endpoint: "", apiKey: "", model: "", temperature: 0.7, maxTokens: 600 };
  }
  __name(emptyProfile, "emptyProfile");
  function readStore() {
    const fallback = { profiles: [], activeId: "" };
    try {
      const ctx = globalThis.SillyTavern?.getContext?.();
      const bag = ctx?.extensionSettings || globalThis.extension_settings;
      const raw = bag?.[SETTINGS_KEY2]?.promptApi;
      if (!raw || typeof raw !== "object") return fallback;
      if (!Array.isArray(raw.profiles)) {
        const legacy = normalizeProfile(raw);
        if (legacy.endpoint || legacy.model) {
          return { profiles: [{ ...legacy, id: "default", name: "Default" }], activeId: "default" };
        }
        return fallback;
      }
      return {
        profiles: raw.profiles.map((p) => ({ ...normalizeProfile(p), id: String(p.id || ""), name: String(p.name || "\u041F\u0440\u043E\u0444\u0438\u043B\u044C") })),
        activeId: String(raw.activeId || "")
      };
    } catch (_) {
      return fallback;
    }
  }
  __name(readStore, "readStore");
  function normalizeProfile(raw) {
    const base = emptyProfile();
    if (!raw || typeof raw !== "object") return base;
    return {
      endpoint: String(raw.endpoint || "").trim(),
      apiKey: String(raw.apiKey || "").trim(),
      model: String(raw.model || "").trim(),
      temperature: Number.isFinite(Number(raw.temperature)) ? Number(raw.temperature) : base.temperature,
      maxTokens: Number.isFinite(Number(raw.maxTokens)) ? Number(raw.maxTokens) : base.maxTokens
    };
  }
  __name(normalizeProfile, "normalizeProfile");
  function writeStore(store) {
    try {
      const ctx = globalThis.SillyTavern?.getContext?.();
      const bag = ctx?.extensionSettings || globalThis.extension_settings;
      if (!bag) return false;
      if (!bag[SETTINGS_KEY2]) bag[SETTINGS_KEY2] = {};
      bag[SETTINGS_KEY2].promptApi = {
        profiles: (store.profiles || []).map((p) => ({ ...p })),
        activeId: store.activeId || ""
      };
      const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
      if (typeof persist === "function") persist();
      return true;
    } catch (err) {
      console.warn(`${MODULE3} write failed:`, err?.message || err);
      return false;
    }
  }
  __name(writeStore, "writeStore");
  function listProfiles() {
    const store = readStore();
    return { profiles: store.profiles, activeId: store.activeId };
  }
  __name(listProfiles, "listProfiles");
  function loadApiSettings() {
    const { profiles, activeId } = readStore();
    const active = profiles.find((p) => p.id === activeId) || profiles[0];
    if (!active) return emptyProfile();
    const { id, name, ...rest } = active;
    return rest;
  }
  __name(loadApiSettings, "loadApiSettings");
  function saveApiSettings(patch) {
    const store = readStore();
    let active = store.profiles.find((p) => p.id === store.activeId);
    if (!active) {
      active = { ...emptyProfile(), id: "default", name: "Default" };
      store.profiles = [active];
      store.activeId = active.id;
    }
    Object.assign(active, normalizeProfile({ ...active, ...patch }));
    return writeStore(store);
  }
  __name(saveApiSettings, "saveApiSettings");
  function addProfile(name) {
    const store = readStore();
    const current = loadApiSettings();
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    store.profiles.push({ ...current, id, name: String(name || `\u041F\u0440\u043E\u0444\u0438\u043B\u044C ${store.profiles.length + 1}`) });
    store.activeId = id;
    writeStore(store);
    return id;
  }
  __name(addProfile, "addProfile");
  function activateProfile(id) {
    const store = readStore();
    if (!store.profiles.some((p) => p.id === id)) return false;
    store.activeId = id;
    return writeStore(store);
  }
  __name(activateProfile, "activateProfile");
  function removeProfile(id) {
    const store = readStore();
    store.profiles = store.profiles.filter((p) => p.id !== id);
    if (store.activeId === id) store.activeId = store.profiles[0]?.id || "";
    return writeStore(store);
  }
  __name(removeProfile, "removeProfile");
  function renameProfile(id, name) {
    const store = readStore();
    const p = store.profiles.find((x) => x.id === id);
    if (!p) return false;
    p.name = String(name || p.name);
    return writeStore(store);
  }
  __name(renameProfile, "renameProfile");
  function apiRoot(endpoint) {
    const clean = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!clean) return "";
    if (/\/v1$/i.test(clean)) return clean;
    if (/\/(chat\/completions|completions|models)$/i.test(clean)) {
      return clean.replace(/\/(chat\/completions|completions|models)$/i, "");
    }
    return `${clean}/v1`;
  }
  __name(apiRoot, "apiRoot");
  async function fetchModels(settings) {
    const root = apiRoot(settings?.endpoint);
    if (!root) throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 endpoint");
    const headers = {};
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3e4);
    try {
      const res = await fetch(`${root}/models`, { headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const raw = data?.data ?? data?.models ?? data;
      const ids = [];
      for (const item of Array.isArray(raw) ? raw : []) {
        if (typeof item === "string") ids.push(item);
        else if (item && typeof item === "object") {
          const id = item.id || item.name || item.model;
          if (typeof id === "string" && id.trim()) ids.push(id.trim());
        }
      }
      const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
      if (!unique.length) throw new Error("\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0443\u0441\u0442\u043E\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u043C\u043E\u0434\u0435\u043B\u0435\u0439");
      return unique;
    } catch (err) {
      if (err?.name === "AbortError") throw new Error("\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F (30\u0441)");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  __name(fetchModels, "fetchModels");
  async function testConnection(settings) {
    try {
      const models = await fetchModels(settings);
      try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (bag?.[SETTINGS_KEY2]) {
          bag[SETTINGS_KEY2].promptApiModels = models;
          const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
          if (typeof persist === "function") persist();
        }
      } catch (_) {
      }
      return { ok: true, models };
    } catch (err) {
      return { ok: false, models: [], error: err?.message || String(err) };
    }
  }
  __name(testConnection, "testConnection");
  function cachedModels() {
    try {
      const ctx = globalThis.SillyTavern?.getContext?.();
      const bag = ctx?.extensionSettings || globalThis.extension_settings;
      const list = bag?.[SETTINGS_KEY2]?.promptApiModels;
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }
  __name(cachedModels, "cachedModels");
  function normalizeEndpoint(endpoint) {
    const clean = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!clean) return "";
    if (/\/(chat\/completions|completions)$/i.test(clean)) return clean;
    const root = apiRoot(clean);
    return root ? `${root}/chat/completions` : "";
  }
  __name(normalizeEndpoint, "normalizeEndpoint");
  async function callOpenAICompatible(prompt2, systemPrompt, settings) {
    const url = normalizeEndpoint(settings.endpoint);
    if (!url) throw new Error("endpoint \u043D\u0435 \u0437\u0430\u0434\u0430\u043D");
    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9e4);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt2 }
          ]
        })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message?.content;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      if (Array.isArray(msg)) {
        const joined = msg.map((p) => typeof p === "string" ? p : p?.text || "").join(" ").trim();
        if (joined) return joined;
      }
      const text = data?.choices?.[0]?.text;
      if (typeof text === "string" && text.trim()) return text.trim();
      const parts = data?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        const joined = parts.map((p) => p?.text || "").join(" ").trim();
        if (joined) return joined;
      }
      throw new Error("\u043F\u0443\u0441\u0442\u043E\u0439 \u043E\u0442\u0432\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u0438");
    } finally {
      clearTimeout(timer);
    }
  }
  __name(callOpenAICompatible, "callOpenAICompatible");
  async function ask(prompt2, opts = {}) {
    const system = opts.system || "You output English only. You never narrate or roleplay.";
    const settings = loadApiSettings();
    if (settings.endpoint && settings.model) {
      try {
        const out = await callOpenAICompatible(prompt2, system, settings);
        if (out) return out;
      } catch (err) {
        console.warn(`${MODULE3} \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u044B\u0439 API \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B, \u043E\u0442\u043A\u0430\u0442 \u043D\u0430 ST:`, err?.message || err);
      }
    }
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (typeof ctx?.generateRaw === "function") {
      try {
        const out = await ctx.generateRaw({
          prompt: prompt2,
          systemPrompt: system,
          responseLength: opts.responseLength || 600
        });
        if (String(out || "").trim()) return String(out).trim();
      } catch (err) {
        console.warn(`${MODULE3} generateRaw failed:`, err?.message || err);
      }
    }
    if (typeof ctx?.generateQuietPrompt === "function") {
      const out = await ctx.generateQuietPrompt(`[ENGLISH ONLY \u2014 NO PROSE]
${prompt2}`, false, false);
      if (String(out || "").trim()) return String(out).trim();
    }
    throw new Error("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043F\u0440\u043E\u043C\u043F\u0442\u0430");
  }
  __name(ask, "ask");
  async function enhancePrompt(input, opts = {}) {
    const draft = String(input || "").trim();
    if (!draft) throw new Error("\u041F\u0443\u0441\u0442\u043E\u0439 \u0442\u0435\u043A\u0441\u0442 \u0434\u043B\u044F \u0443\u043B\u0443\u0447\u0448\u0435\u043D\u0438\u044F");
    const char = String(opts.character || "").trim();
    const style = String(opts.style || "").trim();
    const appearance = String(opts.appearance || "").trim();
    const contextLines = [];
    if (style) contextLines.push(`STYLE (already applied, do not repeat it in your answer): ${style}`);
    if (appearance) contextLines.push(`FIXED APPEARANCE of ${char || "the subject"} (do not contradict or repeat): ${appearance}`);
    const request = `Rewrite the draft below into a NovelAI v5 image prompt.

DRAFT${char ? ` (post by ${char})` : ""}:
${draft}
${contextLines.length ? `
${contextLines.join("\n")}
` : ""}
RULES:
- Output ENGLISH ONLY. Translate any Russian or other language into English.
- Comma-separated visual tags, no sentences, no story, no dialogue, no feelings in prose.
- Describe: framing/shot, subject${char ? ` (${char})` : ""}, pose/expression, action, outfit, setting, lighting, mood.
${appearance ? "- Do NOT describe hair, eyes, build or skin \u2014 the fixed appearance is added separately." : `- Describe the subject's appearance briefly (hair, eyes, build).`}
- No quality tags (masterpiece, best quality) and no style tags \u2014 they are added automatically.
- No quotes, no labels, no markdown, no explanation. Output the prompt only.

PROMPT:`;
    const raw = await ask(request, {
      system: "You are an image-prompt engineer. You output English tag lists only. You never narrate.",
      responseLength: 400
    });
    return normalizePromptOutput(raw);
  }
  __name(enhancePrompt, "enhancePrompt");
  function normalizePromptOutput(raw) {
    let text = String(raw || "");
    text = text.replace(/```[a-z]*\n?/gi, " ");
    text = text.replace(/<[^>]*>/g, " ");
    text = text.replace(/\[[A-Z_]{3,}[^\]]*\]/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    text = text.replace(/^(prompt|tags?|description|answer|output)\s*:\s*/i, "");
    text = text.replace(/^["'«]|["'»]$/g, "").trim();
    const chunks = text.split(/[,;]\s*|\n+/).map((c) => c.replace(/^[\s\-•*]+/, "").replace(/^\d[\d\s:/.-]*\s+/, "").replace(/\s+/g, " ").trim()).filter(Boolean).filter((c) => !/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(c)).filter((c) => /[A-Za-z]{2,}/.test(c)).filter((c) => !/^[\d\s:/.,-]+$/.test(c));
    return chunks.join(", ").trim();
  }
  __name(normalizePromptOutput, "normalizePromptOutput");
  function resolveStyle(imageGen2) {
    try {
      const own = String(imageGen2?.getStyle?.() || "").trim();
      if (own) return cleanTags(own);
      console.warn(`${MODULE3} \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u0442\u0438\u043B\u044C \u0432 inline_image_gen \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D`);
    } catch (err) {
      console.warn(`${MODULE3} resolveStyle failed:`, err?.message || err);
    }
    return "";
  }
  __name(resolveStyle, "resolveStyle");
  function ensureStyle(prompt2, style) {
    const text = String(prompt2 || "").trim();
    const st = cleanTags(style || "");
    if (!st) return text;
    if (!text) return st;
    const firstSegment = text.split("|")[0].slice(0, 200).toLowerCase();
    const styleHead = st.split(",")[0].trim().toLowerCase();
    if (styleHead && firstSegment.includes(styleHead)) return text;
    return `${st}, ${text}`;
  }
  __name(ensureStyle, "ensureStyle");

  // apps/character-gen.js
  function collectCast(ctx) {
    const charName = resolveName(ctx, "char");
    const userName = resolveName(ctx, "user");
    const known = /* @__PURE__ */ new Set();
    if (charName) known.add(charName);
    if (userName) known.add(userName);
    try {
      const card = ctx?.characters?.[ctx?.characterId] || {};
      const text = `${card.description || ""} ${card.scenario || ""} ${card.personality || ""}`;
      for (const m of text.matchAll(/\b([A-ZА-ЯЁ][a-zа-яё]{2,15})\b/g)) {
        const name = m[1];
        if (/^(Она|Он|Оно|Это|Тот|Эта|Все|Они|Ты|Вы|The|And|But|She|He|They)$/i.test(name)) continue;
        known.add(name);
      }
    } catch (_) {
    }
    try {
      const state = globalThis.__astralPhoneCore?.storage?.getState?.() || {};
      for (const m of state.messages || []) {
        if (m.character) known.add(String(m.character).trim());
      }
    } catch (_) {
    }
    const cast = [...known].map((n) => String(n).trim()).filter((n) => n && n.length <= 24).filter((n) => !/sillytavern/i.test(n)).filter((n, i, arr) => arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i);
    return { charName, userName, cast };
  }
  __name(collectCast, "collectCast");
  function resolveName(ctx, which) {
    if (which === "char") {
      const fromCard = String(ctx?.characters?.[ctx?.characterId]?.name || "").trim();
      const fallback = String(ctx?.name2 || "").trim();
      const pick2 = fromCard || fallback;
      if (!pick2 || /sillytavern/i.test(pick2)) return fromCard || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
      return pick2;
    }
    const pick = String(ctx?.name1 || "").trim();
    return !pick || /sillytavern/i.test(pick) ? "\u0422\u044B" : pick;
  }
  __name(resolveName, "resolveName");
  function sceneContext(ctx, limit = 4, chars = 500) {
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    const lines = chat.filter((m) => m && !m.is_system && typeof m.mes === "string").slice(-limit).map((m) => {
      const who = m.is_user ? resolveName(ctx, "user") : m.name || resolveName(ctx, "char");
      const text = String(m.mes).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, chars);
      return `${who}: ${text}`;
    }).filter(Boolean);
    return lines.join("\n") || "(\u0441\u0446\u0435\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F)";
  }
  __name(sceneContext, "sceneContext");
  function cleanOutput(raw, maxLen = 400) {
    let text = String(raw || "").trim();
    if (!text) return "";
    text = text.replace(/```[a-z]*\n?/gi, "").trim();
    text = text.replace(/<[^>]*>/g, "");
    text = text.replace(/^\[[A-Z_]{3,}[^\]]*\]\s*/g, "");
    text = text.replace(/^(пост|заметка|запись|сообщение|text|post|note|output|answer)\s*[:：]\s*/i, "");
    text = text.replace(/^["'«„]/, "").replace(/["'»“]$/, "");
    text = text.replace(/\s*[—–-]\s*[A-ZА-ЯЁ][\wА-Яа-яЁё]{1,15}\s*$/, "");
    return text.trim().slice(0, maxLen);
  }
  __name(cleanOutput, "cleanOutput");
  async function generateSocialPost(ctx, opts = {}) {
    const { charName, userName, cast } = collectCast(ctx);
    const scene = sceneContext(ctx);
    const others = cast.filter((n) => n !== userName);
    const requested = String(opts.author || "").trim();
    const whoRule = requested ? `Write the post as "${requested}".` : `Pick ONE character from this cast who would plausibly post right now: ${others.join(", ")}.
Prefer someone whose current state in the scene makes a post natural. Return their name in the first line of your answer as "${"AUTHOR"}: name".`;
    const prompt2 = `You write social-media posts for a roleplay.

SCENE (what is happening right now):
${scene}

${whoRule}

RULES:
- Write in the SAME LANGUAGE as the scene. Russian scene \u2192 Russian post.
- 1-3 short sentences. Casual, first person, like a real tweet.
- In character: their voice, their mood, their preoccupations.
- No hashtags unless they fit, no emoji spam (max one).
- No quotes around the text, no "Post:" label, no explanation.
- Do NOT mention that this is a roleplay, phone, or app.

${requested ? "TEXT:" : "AUTHOR: <name>\nTEXT:"}`;
    const raw = await ask(prompt2, {
      system: "You write short in-character social media posts. You never explain or narrate.",
      responseLength: 300
    });
    let author = requested;
    let body = String(raw);
    const authorLine = String(raw).match(/^\s*AUTHOR\s*[:：]\s*(.+)$/im);
    if (authorLine) {
      body = String(raw).replace(authorLine[0], "");
      if (!requested) {
        const parsed = cleanOutput(authorLine[1], 40).replace(/[,.].*$/, "").trim();
        const match = cast.find((n) => n.toLowerCase() === parsed.toLowerCase());
        author = match || others[0] || charName;
      }
    }
    if (!author) author = others[0] || charName;
    return { author, text: cleanOutput(body, 400) };
  }
  __name(generateSocialPost, "generateSocialPost");
  async function generateNotes(ctx, opts = {}) {
    const kinds = ["diary", "plan", "secret", "note"];
    const kind = kinds.includes(opts.kind) ? opts.kind : "diary";
    const count = Math.max(1, Math.min(3, Number(opts.count) || 1));
    const { charName } = collectCast(ctx);
    const scene = sceneContext(ctx);
    const kindBrief = {
      diary: "a private diary entry \u2014 how they feel about what happened",
      plan: "a private plan \u2014 what they intend to do next, steps, intentions",
      secret: "a private secret \u2014 something they hide from others",
      note: "a short private note \u2014 a passing thought, an observation"
    }[kind];
    const prompt2 = `You write PRIVATE notes in the voice of ${charName}.

These notes are never seen by anyone. ${charName} writes them honestly, for themselves only.

SCENE (what is happening right now):
${scene}

TASK: write ${count} ${kindBrief}.

RULES:
- Write in the SAME LANGUAGE as the scene. Russian scene \u2192 Russian note.
- First person, ${charName}'s own voice and vocabulary.
- Honest and specific: reference actual things from the scene, not generic feelings.
- Each note is 1-4 sentences. ${count > 1 ? "They should differ in focus." : ""}
- ${kind === "secret" ? "This is hidden \u2014 write what they would never say out loud." : "Private, but not necessarily dark."}
- No labels, no quotes, no bullet points, no explanation.

Return ONLY the ${count > 1 ? "notes separated by a line containing only ---" : "note text"}.`;
    const raw = await ask(prompt2, {
      system: "You write private in-character notes. You never explain or add commentary.",
      responseLength: 500
    });
    const chunks = String(raw).split(/^\s*---\s*$/m).map((c) => cleanOutput(c, 600)).filter(Boolean);
    const texts = chunks.length ? chunks : [cleanOutput(raw, 600)];
    return texts.slice(0, count).map((text) => ({
      kind,
      title: "",
      text
    }));
  }
  __name(generateNotes, "generateNotes");
  async function generateMessage(ctx, opts = {}) {
    const character = String(opts.character || "").trim() || collectCast(ctx).charName;
    const thread = (opts.thread || []).slice(-8).map((m) => `${m.from === "me" ? "\u0422\u044B" : character}: ${m.text}`).join("\n");
    const prompt2 = `You write a text message from ${character} to the user.

${thread ? `RECENT CONVERSATION:
${thread}
` : ""}
SCENE (broader context):
${sceneContext(ctx, 3, 300)}

TASK: write ONE short message ${character} sends right now.

RULES:
- Same language as the scene.
- 1-2 sentences, casual, like a real text.
- In character \u2014 their way of typing, their mood.
- No quotes, no name prefix, no explanation.

MESSAGE:`;
    const raw = await ask(prompt2, {
      system: "You write short in-character text messages. You never explain.",
      responseLength: 200
    });
    return cleanOutput(raw, 300);
  }
  __name(generateMessage, "generateMessage");
  function showTyping(name, opts = {}) {
    const host = opts.container || document.querySelector(".astral-phone-body") || document.querySelector(".astral-phone");
    if (!host) return () => {
    };
    const el = document.createElement("div");
    el.className = "astral-typing";
    el.dataset.typing = "1";
    el.innerHTML = `
        <span class="astral-typing-name">${escapeHtml(name)}</span>
        <span class="astral-typing-word">\u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442</span>
        <span class="astral-typing-dots"><i></i><i></i><i></i></span>
    `;
    host.appendChild(el);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      el.classList.add("astral-typing--out");
      setTimeout(() => el.remove(), 220);
    };
  }
  __name(showTyping, "showTyping");
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  __name(escapeHtml, "escapeHtml");

  // apps/messages.js
  var MessagesApp = class {
    static {
      __name(this, "MessagesApp");
    }
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "messages";
      this.title = "Messages";
      this.icon = ICONS.messages;
      this._thread = null;
    }
    render(container, params = {}) {
      if (params.character !== void 0) this._thread = params.character || null;
      if (this._thread) {
        this._renderThread(container, this._thread);
      } else {
        this._renderList(container);
      }
    }
    /* ─────────────────────────── thread list ─────────────────────────── */
    _renderList(container) {
      const state = this.storage.getState();
      const messages = state.messages || [];
      container.innerHTML = "";
      if (messages.length === 0) {
        const seeding = globalThis.__astralSeeding === true;
        container.innerHTML = seeding ? `
                <div class="astral-empty-state astral-seeding">
                    <div class="astral-seeding-dots"><span></span><span></span><span></span></div>
                    <div>\u041D\u0430\u0431\u0438\u0440\u0430\u044E \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0443\u2026</div>
                    <div class="astral-empty-hint">\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438 \u043F\u0440\u0438\u0434\u0443\u043C\u044B\u0432\u0430\u044E\u0442, \u0447\u0442\u043E \u0442\u0435\u0431\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u0442\u044C</div>
                </div>` : `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.messages}</div>
                    <div>\u041D\u0435\u0442 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438</div>
                    <div class="astral-empty-hint">\u041F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F, \u043A\u043E\u0433\u0434\u0430 \u043E\u0442\u043A\u0440\u043E\u0435\u0448\u044C \u044D\u0442\u043E\u0442 \u044D\u043A\u0440\u0430\u043D \u0432\u043F\u0435\u0440\u0432\u044B\u0435</div>
                </div>`;
        return;
      }
      const threads = /* @__PURE__ */ new Map();
      for (const msg of messages) {
        const key = msg.character || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439";
        const entry = threads.get(key);
        if (!entry || msg.timestamp > entry.last.timestamp) {
          threads.set(key, { last: msg, role: msg.role || entry?.role || "" });
        } else if (!entry.role && msg.role) {
          entry.role = msg.role;
        }
      }
      const list = document.createElement("div");
      list.className = "astral-thread-list";
      for (const [char, { last, role }] of threads) {
        const item = document.createElement("div");
        item.className = "astral-msg-item";
        const isOut = this._isOut(last);
        item.innerHTML = `
                <div class="astral-msg-avatar">${this._esc((char[0] || "?").toUpperCase())}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name-row">
                        <span class="astral-msg-name">${this._esc(char)}</span>
                        ${role ? `<span class="astral-msg-role">${this._esc(role)}</span>` : ""}
                    </div>
                    <div class="astral-msg-preview ${isOut ? "astral-msg-preview--out" : ""}">
                        ${isOut ? "\u2192 " : ""}${this._esc(this._truncate(last.text, 48))}
                    </div>
                </div>
                <div class="astral-msg-time">${this._time(last.timestamp)}</div>
            `;
        item.addEventListener("click", () => {
          this._thread = char;
          this.render(document.querySelector(".astral-phone-body"));
        });
        list.appendChild(item);
      }
      container.appendChild(list);
    }
    /* ─────────────────────────── single thread ─────────────────────────── */
    _renderThread(container, character) {
      const state = this.storage.getState();
      const msgs = (state.messages || []).filter((m) => m.character === character);
      const role = msgs.find((m) => m.role)?.role || "";
      container.innerHTML = "";
      const header = document.createElement("div");
      header.className = "astral-thread-header";
      header.innerHTML = `
            <button class="astral-back-btn" id="astral-thread-back">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.2">
                    <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
                </svg>
            </button>
            <div class="astral-thread-avatar">${this._esc((character[0] || "?").toUpperCase())}</div>
            <div class="astral-thread-info">
                <div class="astral-thread-name">${this._esc(character)}</div>
                ${role ? `<div class="astral-thread-role">${this._esc(role)}</div>` : ""}
            </div>
        `;
      container.appendChild(header);
      const wrap = document.createElement("div");
      wrap.className = "astral-thread";
      if (msgs.length === 0) {
        wrap.innerHTML = `<div class="astral-empty-state"><div>\u041F\u0443\u0441\u0442\u043E</div></div>`;
      }
      for (const msg of msgs) {
        const isOut = this._isOut(msg);
        const bubble = document.createElement("div");
        bubble.className = `astral-bubble ${isOut ? "astral-bubble--out" : "astral-bubble--in"}`;
        bubble.innerHTML = `
                <div class="astral-bubble-text">${this._esc(msg.text)}</div>
                <div class="astral-bubble-time">${this._time(msg.timestamp, true)}</div>
            `;
        wrap.appendChild(bubble);
      }
      container.appendChild(wrap);
      wrap.scrollTop = wrap.scrollHeight;
      header.querySelector("#astral-thread-back").addEventListener("click", () => {
        this._thread = null;
        this.render(document.querySelector(".astral-phone-body"));
      });
      const composer = document.createElement("div");
      composer.className = "astral-msg-composer";
      composer.innerHTML = `
            <input class="astral-msg-input" id="astral-msg-input" type="text"
                   placeholder="\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u2026" autocomplete="off">
            <button class="astral-msg-send" id="astral-msg-send" title="\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C">
                <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor"
                     fill="none" stroke-width="2.2" stroke-linecap="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
                </svg>
            </button>
            <button class="astral-msg-reply-btn" id="astral-msg-reply-btn" title="\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043E\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430">
                <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor"
                     fill="none" stroke-width="2.2">
                    <path d="M20 15a2 2 0 0 1-2 2H4l-5 5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
        `;
      container.appendChild(composer);
      const input = composer.querySelector("#astral-msg-input");
      const send = /* @__PURE__ */ __name(() => {
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        this._sendMessage(character, text);
      }, "send");
      composer.querySelector("#astral-msg-send").addEventListener("click", send);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      composer.querySelector("#astral-msg-reply-btn").addEventListener("click", () => {
        this._requestCharacterReply(character);
      });
    }
    /**
     * Попросить модель написать сообщение от персонажа.
     * Пока идёт генерация, в треде видно «<имя> печатает…».
     */
    async _requestCharacterReply(character) {
      const stopTyping = showTyping(character);
      try {
        const ctx = globalThis.SillyTavern?.getContext?.() || {};
        const state = this.storage.getState();
        const thread = (state.messages || []).filter((m) => m.character === character);
        const text = await generateMessage(ctx, { character, thread });
        stopTyping();
        if (!text) {
          this._toast("\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043F\u0440\u043E\u043C\u043E\u043B\u0447\u0430\u043B", "error");
          return;
        }
        state.messages.push({
          id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          character,
          role: thread.find((m) => m.role)?.role || "",
          text,
          from: "them",
          isIncoming: true,
          fromUser: false,
          timestamp: Date.now()
        });
        this.storage.save();
        try {
          globalThis.__astralRefreshPrompt?.();
        } catch {
        }
        this.render(document.querySelector(".astral-phone-body"), { character });
      } catch (err) {
        stopTyping();
        console.error("[Astral Phone] reply generation failed:", err);
        this._toast(`\u041E\u0448\u0438\u0431\u043A\u0430: ${err.message}`, "error");
      }
    }
    /** Build a prompt asking the character to respond. */
    _buildReplyPrompt(character, lastMsg, state) {
      const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
      const charName = ctx.name2 || "\u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
      const userName = ctx.name1 || "\u0442\u044B";
      const thread = (state.messages || []).filter((m) => m.character === character).slice(-8).map((m) => `${m.from === "me" ? "\u0422\u044B" : "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436"}: ${m.text}`).join("\n");
      return `[MESSAGE_REPLY] Character: ${charName}

You are ${charName} messaging ${userName} on the phone. The last thing they wrote was: "${lastMsg?.text || "(no message)"}".

Write a SHORT, natural TEXT REPLY from ${charName}'s perspective \u2014 one sentence or a few casual words. Keep it in character.

REPLY (text only):`;
    }
    /** Append an outgoing message to the thread and persist it. */
    _sendMessage(character, text) {
      const state = this.storage.getState();
      if (!Array.isArray(state.messages)) state.messages = [];
      const role = state.messages.find((m) => m.character === character && m.role)?.role || "";
      state.messages.push({
        id: `me_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        character,
        role,
        text,
        from: "me",
        isIncoming: false,
        fromUser: true,
        timestamp: Date.now()
      });
      this.storage.save();
      try {
        globalThis.__astralRefreshPrompt?.();
      } catch {
      }
      this.render(document.querySelector(".astral-phone-body"), { character });
    }
    /* ─────────────────────────── event handler ─────────────────────────── */
    async handleEvent(eventData) {
      const state = this.storage.getState();
      if (!Array.isArray(state.messages)) state.messages = [];
      state.messages.push({
        character: eventData.character || this.context.name2 || "",
        text: eventData.description || "",
        timestamp: Date.now(),
        fromUser: false,
        from: "them",
        isIncoming: true
      });
      this.storage.save();
      try {
        globalThis.__astralRefreshPrompt?.();
      } catch {
      }
      return { success: true, message: "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E" };
    }
    /* ─────────────────────────── utils ─────────────────────────── */
    /** Unified check: supports both old `fromUser` flag and new `from` field. */
    _isOut(msg) {
      if (msg.from === "me") return true;
      if (msg.from === "them") return false;
      return Boolean(msg.fromUser);
    }
    _truncate(str, max) {
      const s = String(str ?? "");
      return s.length > max ? s.slice(0, max) + "\u2026" : s;
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
    static {
      __name(this, "GalleryApp");
    }
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
      } else {
        const grid = document.createElement("div");
        grid.className = "astral-gallery-grid";
        photos.forEach((photo, idx) => this._renderTile(grid, photo, idx));
        container.appendChild(grid);
      }
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
                    <div class="astral-tile-meta">${this._time(photo.timestamp)}</div>
                </div>`;
        tile.addEventListener("click", () => this._openViewer(photo, idx));
      } else {
        const busy = this._busy.has(idx);
        tile.innerHTML = `
                <div class="astral-tile-empty">
                    <div class="astral-tile-empty-icon">${ICONS.gallery}</div>
                    <div class="astral-tile-text">${this._esc(this._preview(photo))}</div>
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
      const takeBtn = document.createElement("button");
      takeBtn.className = "astral-btn astral-btn-wide";
      takeBtn.textContent = "\u{1F4F8} \u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A";
      takeBtn.addEventListener("click", () => this._openCamera());
      bar.appendChild(takeBtn);
      const pending = photos.filter((p) => !p.imageUrl).length;
      const genBtn = document.createElement("button");
      genBtn.className = "astral-btn astral-btn-primary astral-btn-wide";
      genBtn.textContent = pending > 1 ? `\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0432\u0441\u0435 \u0444\u043E\u0442\u043E (${pending})` : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0444\u043E\u0442\u043E";
      genBtn.disabled = pending === 0;
      if (pending === 0) genBtn.style.opacity = ".45";
      genBtn.addEventListener("click", async () => {
        genBtn.disabled = true;
        genBtn.textContent = "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\u2026";
        const indexes = photos.map((p, i) => !p.imageUrl ? i : -1).filter((i) => i >= 0);
        for (const i of indexes) await this._generate(i, true);
        this.render(document.querySelector(".astral-phone-body"));
      });
      bar.appendChild(genBtn);
      return bar;
    }
    /** Open camera overlay with mode selector and custom instruction settings. */
    _openCamera() {
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const prefs = this._loadCameraPrefs();
      const overlay = document.createElement("div");
      overlay.className = "astral-camera-overlay";
      overlay.innerHTML = `
            <div class="astral-camera">
                <div class="astral-camera-header">
                    <button class="astral-camera-close" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">\u2715</button>
                    <span class="astral-camera-title">Camera</span>
                    <button class="astral-camera-settings-btn" title="\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438">\u2699</button>
                </div>

                <div class="astral-camera-viewfinder">
                    <div class="astral-camera-vf-inner">
                        <div class="astral-camera-vf-corner tl"></div>
                        <div class="astral-camera-vf-corner tr"></div>
                        <div class="astral-camera-vf-corner bl"></div>
                        <div class="astral-camera-vf-corner br"></div>
                    </div>
                </div>

                <div class="astral-camera-mode-bar">
                    <button class="astral-camera-mode ${prefs.mode === "photo" ? "active" : ""}" data-mode="photo">\u0424\u043E\u0442\u043E</button>
                    <button class="astral-camera-mode ${prefs.mode === "random" ? "active" : ""}" data-mode="random">\u0420\u0430\u043D\u0434\u043E\u043C</button>
                    <button class="astral-camera-mode ${prefs.mode === "selfie" ? "active" : ""}" data-mode="selfie">\u0421\u0435\u043B\u0444\u0438</button>
                </div>

                <div class="astral-camera-shutter-row">
                    <button class="astral-camera-shutter" id="astral-camera-shutter"></button>
                </div>

                <div class="astral-camera-settings" style="display:none">
                    <div class="astral-camera-settings-section">
                        <div class="astral-camera-settings-label">\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0434\u043B\u044F \u0424\u043E\u0442\u043E</div>
                        <textarea class="astral-camera-settings-textarea" id="astral-camera-photo-instr" rows="3" placeholder="\u041E\u0441\u0442\u0430\u0432\u044C \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E">${this._esc(prefs.photoInstruction)}</textarea>
                    </div>
                    <div class="astral-camera-settings-section">
                        <div class="astral-camera-settings-label">\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0434\u043B\u044F \u0421\u0435\u043B\u0444\u0438</div>
                        <textarea class="astral-camera-settings-textarea" id="astral-camera-selfie-instr" rows="3" placeholder="\u041E\u0441\u0442\u0430\u0432\u044C \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E">${this._esc(prefs.selfieInstruction)}</textarea>
                    </div>
                    <button class="astral-btn astral-btn-wide" id="astral-camera-save-settings">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      let currentMode = prefs.mode;
      overlay.querySelectorAll(".astral-camera-mode").forEach((btn) => {
        btn.addEventListener("click", () => {
          overlay.querySelectorAll(".astral-camera-mode").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          currentMode = btn.dataset.mode;
          this._saveCameraPrefs({ ...this._loadCameraPrefs(), mode: currentMode });
        });
      });
      const settingsPanel = overlay.querySelector(".astral-camera-settings");
      overlay.querySelector(".astral-camera-settings-btn").addEventListener("click", () => {
        settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
      });
      overlay.querySelector("#astral-camera-save-settings").addEventListener("click", () => {
        const p = this._loadCameraPrefs();
        p.photoInstruction = overlay.querySelector("#astral-camera-photo-instr").value;
        p.selfieInstruction = overlay.querySelector("#astral-camera-selfie-instr").value;
        this._saveCameraPrefs(p);
        settingsPanel.style.display = "none";
        this._toast("\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B");
      });
      const shutter = overlay.querySelector("#astral-camera-shutter");
      shutter.addEventListener("click", async () => {
        shutter.disabled = true;
        shutter.classList.add("astral-camera-shutter--busy");
        await this._takePhoto(currentMode);
        overlay.remove();
      });
      overlay.querySelector(".astral-camera-close").addEventListener("click", () => overlay.remove());
      phone.appendChild(overlay);
    }
    _loadCameraPrefs() {
      try {
        const raw = localStorage.getItem("astral_camera_prefs");
        const p = raw ? JSON.parse(raw) : {};
        return {
          mode: p.mode || "random",
          photoInstruction: p.photoInstruction || "",
          selfieInstruction: p.selfieInstruction || ""
        };
      } catch {
        return { mode: "random", photoInstruction: "", selfieInstruction: "" };
      }
    }
    _saveCameraPrefs(prefs) {
      try {
        localStorage.setItem("astral_camera_prefs", JSON.stringify(prefs));
      } catch {
      }
    }
    /**
     * Take a photo: the prompt is built by prompt-builder.js, which merges
     * Haruspics (style / appearance / lorebooks / negative) with a strict JSON
     * of scene tags from the model. The model never writes the final prompt.
     */
    async _takePhoto(mode = "random") {
      try {
        const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
        const prefs = this._loadCameraPrefs();
        const resolvedMode = mode === "random" ? Math.random() < 0.5 ? "photo" : "selfie" : mode;
        const customInstruction = resolvedMode === "selfie" ? prefs.selfieInstruction.trim() : prefs.photoInstruction.trim();
        const { prompt: prompt2, negative, structured } = await buildPhotoPrompt({
          imageGen: this.imageGen,
          ctx,
          sceneText: this._sceneText(ctx),
          mode: resolvedMode,
          customInstruction,
          askModel: /* @__PURE__ */ __name((ask2) => this._askModel(ctx, ask2), "askModel")
        });
        console.log("[Astral Phone] prompt:", prompt2);
        console.log("[Astral Phone] negative:", negative);
        const state = this.storage.getState();
        if (!Array.isArray(state.gallery)) state.gallery = [];
        state.gallery.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          description: prompt2,
          negative,
          imageUrl: null,
          timestamp: Date.now(),
          source: resolvedMode,
          character: ctx.characters?.[ctx.characterId]?.name || ""
        });
        this.storage.save();
        this._toast(resolvedMode === "selfie" ? "\u0421\u0435\u043B\u0444\u0438 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E" : "\u0424\u043E\u0442\u043E \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E");
        this.render(document.querySelector(".astral-phone-body"));
      } catch (err) {
        console.error("[Astral Phone] takePhoto failed:", err);
        this._toast(`Error: ${err.message}`, "error");
      }
    }
    /** Последние сообщения РП — визуальный источник для теггера. */
    _sceneText(ctx) {
      const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
      const lines = chat.filter((m) => m && !m.is_system && typeof m.mes === "string").slice(-4).map((m) => String(m.mes).replace(/\s+/g, " ").trim().slice(0, 600)).filter(Boolean);
      return lines.join("\n---\n") || "(quiet moment, no scene text)";
    }
    /**
     * Один вызов модели без контекста персонажа.
     * generateRaw предпочтителен; generateQuietPrompt — фолбэк.
     */
    async _askModel(ctx, ask2) {
      return await ask(ask2, {
        system: "You are an image-prompt tagger. You answer with JSON only. English tags only. You never narrate, roleplay or translate.",
        responseLength: 500
      });
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
        const style = resolveStyle(this.imageGen) || String(photo.style || "");
        const prompt2 = ensureStyle(this._buildPrompt(photo), style);
        console.log("[Gallery] prompt:", prompt2);
        const url = await this.imageGen.generate(prompt2, {
          character: photo.character || this.context?.name2,
          type: "gallery_photo",
          negativePrompt: photo.negative || void 0,
          style
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
      return String(photo.description || photo.character || "").trim();
    }
    _openViewer(photo, index) {
      const viewer = document.createElement("div");
      viewer.className = "astral-viewer";
      viewer.innerHTML = `
            <div class="astral-viewer-container">
                <button class="astral-viewer-close" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">\u2715</button>
                <img src="${photo.imageUrl}" alt="">

                <details class="astral-viewer-prompt">
                    <summary>\u041F\u0440\u043E\u043C\u043F\u0442</summary>
                    <textarea class="astral-viewer-prompt-text" spellcheck="false">${this._esc(photo.description || "")}</textarea>
                    <div class="astral-viewer-prompt-actions">
                        <button class="astral-btn" id="astral-prompt-save">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                        <button class="astral-btn astral-btn-primary" id="astral-prompt-regen">\u041F\u0435\u0440\u0435\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C</button>
                    </div>
                </details>

                <button class="astral-viewer-delete" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u043E\u0442\u043E">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                    </svg>
                </button>
            </div>
        `;
      const close = /* @__PURE__ */ __name(() => viewer.remove(), "close");
      const area = viewer.querySelector(".astral-viewer-prompt-text");
      viewer.querySelector(".astral-viewer-close").addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
      viewer.querySelector(".astral-viewer-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        this._deletePhoto(photo);
        close();
      });
      viewer.querySelector("#astral-prompt-save").addEventListener("click", (e) => {
        e.stopPropagation();
        this._savePrompt(index, area.value.trim());
      });
      viewer.querySelector("#astral-prompt-regen").addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E\u2026";
        await this._savePrompt(index, area.value.trim(), { silent: true });
        close();
        await this._generate(index);
      });
      viewer.addEventListener("click", (e) => {
        if (e.target === viewer) close();
      });
      const onKey = /* @__PURE__ */ __name((e) => {
        if (e.key === "Escape") {
          close();
          document.removeEventListener("keydown", onKey);
        }
      }, "onKey");
      document.addEventListener("keydown", onKey);
      document.querySelector(".astral-phone").appendChild(viewer);
    }
    /** Короткая подпись для плитки: промпт целиком не показываем. */
    _preview(photo) {
      const src = String(photo.description || "").trim();
      if (!src) return "\u0424\u043E\u0442\u043E";
      const first = src.split(",")[0].trim();
      return first.length > 40 ? `${first.slice(0, 40)}\u2026` : first;
    }
    /** Сохранить отредактированный промпт. */
    _savePrompt(index, value, opts = {}) {
      const state = this.storage.getState();
      const photo = state.gallery?.[index];
      if (!photo) return;
      photo.description = value;
      this.storage.save();
      if (!opts.silent) this._toast("\u041F\u0440\u043E\u043C\u043F\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D");
    }
    _deletePhoto(photo) {
      const state = this.storage.getState();
      const idx = state.gallery.findIndex((p) => p.id === photo.id);
      if (idx >= 0) {
        state.gallery.splice(idx, 1);
        this.storage.save();
        this._toast("Photo deleted");
        this.render(document.querySelector(".astral-phone-body"));
      }
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
    static {
      __name(this, "SpicyApp");
    }
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
        const style = resolveStyle(this.imageGen) || String(item.style || "");
        const base = [item.character, item.description].filter(Boolean).join(", ");
        const prompt2 = ensureStyle(base, style);
        console.log("[Spicy] prompt:", prompt2);
        const url = await this.imageGen.generate(prompt2, {
          character: item.character,
          type: "spicy_thumbnail",
          nsfw: true,
          style
        });
        if (style) state.spicy[index].style = style;
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
  var FAN_NAMES = [
    "shadow_kitten",
    "velvet_noir",
    "midnight_owl",
    "lunarpixie",
    "crash_and_burn",
    "sugarstatic",
    "emptyrooms",
    "ghost_of_you",
    "poison_ivy",
    "static_bloom",
    "neon_widow",
    "dollparts",
    "cinematic",
    "wires_and_bones",
    "soft_error"
  ];
  var COMMENT_TEXTS = [
    "\u042D\u0442\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0435\u0440\u0435\u0430\u043B\u044C\u043D\u043E \u{1F5A4}",
    "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u043B \u0441\u0435\u0431\u0435, \u0431\u0443\u0434\u0443 \u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043D\u043E\u0447\u044C\u044E",
    "\u041A\u0430\u043A \u0442\u044B \u044D\u0442\u043E \u0434\u0435\u043B\u0430\u0435\u0448\u044C?",
    "\u0425\u043E\u0447\u0443 \u0435\u0449\u0451",
    "\u0421\u0432\u0435\u0442 \u0438\u0434\u0435\u0430\u043B\u044C\u043D\u044B\u0439",
    "\u0412\u0437\u0433\u043B\u044F\u0434 \u0443\u0431\u0438\u0432\u0430\u0435\u0442",
    "\u041B\u0443\u0447\u0448\u0438\u0439 \u043F\u043E\u0441\u0442 \u0437\u0430 \u043D\u0435\u0434\u0435\u043B\u044E",
    "\u041D\u0435 \u043C\u043E\u0433\u0443 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0442\u044C \u043B\u0438\u0441\u0442\u0430\u0442\u044C",
    "\u0427\u0442\u043E \u0437\u0430 \u043E\u0431\u044A\u0435\u043A\u0442\u0438\u0432?",
    "\u0410\u0442\u043C\u043E\u0441\u0444\u0435\u0440\u0430 \u2014 10/10",
    "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043A\u0440\u0430\u0441\u0438\u0432\u043E \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043C\u0438\u0440\u0430",
    "\u0416\u0434\u0443 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F"
  ];
  var CreatorApp = class {
    static {
      __name(this, "CreatorApp");
    }
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
      const name = creator.displayName || this.context.name2 || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
      const handle = creator.handle || this._slug(name);
      const avatar = creator.avatar || null;
      const posts = creator.posts || [];
      const avaHtml = avatar ? `<img src="${this._esc(avatar)}" class="astral-profile-ava astral-profile-ava--img" alt="avatar">` : `<div class="astral-profile-ava">${this._esc((name[0] || "?").toUpperCase())}</div>`;
      body.innerHTML = `
            <div class="astral-profile">
                <div class="astral-profile-ava-wrap">
                    ${avaHtml}
                    <button class="astral-ava-edit-btn" id="astral-ava-btn" title="\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0430\u0432\u0430\u0442\u0430\u0440">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                    </button>
                </div>

                <div class="astral-profile-name-row">
                    <div class="astral-profile-name" id="astral-cname-view">${this._esc(name)}</div>
                    <button class="astral-inline-edit-btn" id="astral-edit-name-btn" title="\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C">\u270E</button>
                </div>
                <div class="astral-profile-handle-row">
                    <div class="astral-profile-handle" id="astral-chandle-view">@${this._esc(handle)}</div>
                    <button class="astral-inline-edit-btn" id="astral-edit-handle-btn" title="\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C">\u270E</button>
                </div>

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
      body.querySelector("#astral-ava-btn").addEventListener("click", () => this._openAvatarPicker());
      body.querySelector("#astral-edit-name-btn").addEventListener("click", () => this._openInlineEdit("name", name));
      body.querySelector("#astral-edit-handle-btn").addEventListener("click", () => this._openInlineEdit("handle", handle));
    }
    /* ─────────────────────────── avatar picker ─────────────────────────── */
    _openAvatarPicker() {
      const gallery = (this.storage.getState().gallery || []).filter((p) => p.imageUrl);
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      const galleryItems = gallery.slice(0, 20).map((p, i) => `
            <button class="astral-ava-pick" data-gidx="${i}">
                <img src="${this._esc(p.imageUrl)}" alt="">
            </button>
        `).join("");
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--ava-picker">
                <div class="astral-modal-title">\u0410\u0432\u0430\u0442\u0430\u0440</div>

                <div class="astral-ava-picker-section">
                    <div class="astral-ava-picker-label">\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430</div>
                    <label class="astral-upload-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                        </svg>
                        \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0444\u0430\u0439\u043B
                        <input type="file" id="astral-ava-file" accept="image/*" style="display:none">
                    </label>
                </div>

                ${gallery.length > 0 ? `
                <div class="astral-ava-picker-section">
                    <div class="astral-ava-picker-label">\u0418\u0437 \u0433\u0430\u043B\u0435\u0440\u0435\u0438 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430</div>
                    <div class="astral-ava-grid">${galleryItems}</div>
                </div>` : ""}

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-ava-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                </div>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-ava-cancel").addEventListener("click", close);
      overlay.querySelector("#astral-ava-file").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const dataUrl = await this._fileToDataUrl(file);
        close();
        this._saveCreatorAvatar(dataUrl);
      });
      overlay.querySelectorAll("[data-gidx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.gidx);
          const url = gallery[idx]?.imageUrl;
          if (url) {
            close();
            this._saveCreatorAvatar(url);
          }
        });
      });
    }
    _fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    _saveCreatorAvatar(url) {
      const state = this.storage.getState();
      if (!state.creator) state.creator = {};
      state.creator.avatar = url;
      this.storage.save();
      this.render(document.querySelector(".astral-phone-body"));
    }
    /* ─────────────────────────── inline edit (name / handle) ─────────────────────────── */
    _openInlineEdit(field, current) {
      const labels = { name: "\u0418\u043C\u044F", handle: "\u041D\u0438\u043A (\u0431\u0435\u0437 @)" };
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <div class="astral-modal-title">${labels[field]}</div>
                <input class="astral-textarea astral-inline-input" id="astral-inline-val"
                    value="${this._esc(current)}" placeholder="${labels[field]}">
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-inline-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-inline-save">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      const inp = overlay.querySelector("#astral-inline-val");
      inp.focus();
      inp.select();
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-inline-cancel").addEventListener("click", close);
      overlay.querySelector("#astral-inline-save").addEventListener("click", () => {
        let val = inp.value.trim();
        if (!val) return;
        if (field === "handle") val = val.replace(/^@/, "").replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
        close();
        this._saveCreatorField(field, val);
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector("#astral-inline-save").click();
        if (e.key === "Escape") close();
      });
    }
    _saveCreatorField(field, value) {
      const state = this.storage.getState();
      if (!state.creator) state.creator = {};
      if (field === "name") state.creator.displayName = value;
      if (field === "handle") state.creator.handle = value;
      this.storage.save();
      this.render(document.querySelector(".astral-phone-body"));
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
        feed.appendChild(this._buildCard(post, idx));
      });
      body.appendChild(feed);
    }
    _buildCard(post, idx) {
      const card = document.createElement("div");
      card.className = "astral-card astral-card--creator";
      const busy = this._busy.has(idx);
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const media = post.imageUrl ? `<img class="astral-card-media" src="${this._esc(post.imageUrl)}" alt="" loading="lazy">` : `<div class="astral-card-media astral-card-media--empty">
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
                <div class="astral-card-title">${this._esc(post.caption || "")}</div>
                <div class="astral-card-meta">
                    <span>\u2764 ${this._n(post.likes || 0)}</span>
                    <button class="astral-card-meta-btn" data-comments="${idx}">
                        \u{1F4AC} ${this._n(comments.length)}
                    </button>
                    <span class="astral-card-meta-time">${this._ago(post.timestamp)}</span>
                    <button class="astral-card-menu" data-menu="${idx}" title="\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F">\u22EF</button>
                </div>
            </div>
        `;
      const img = card.querySelector(".astral-card-media");
      if (img && post.imageUrl) {
        const apply = /* @__PURE__ */ __name((w, h) => {
          if (!w || !h) return;
          img.style.aspectRatio = `${w} / ${h}`;
          img.classList.remove("astral-card-media--portrait", "astral-card-media--landscape", "astral-card-media--square");
          const ratio = w / h;
          const kind = ratio > 1.15 ? "landscape" : ratio < 0.87 ? "portrait" : "square";
          img.classList.add(`astral-card-media--${kind}`);
          card.dataset.orientation = kind;
          this._rememberSize(idx, w, h);
        }, "apply");
        if (post.imageW && post.imageH) {
          apply(post.imageW, post.imageH);
        } else if (img.complete && img.naturalWidth) {
          apply(img.naturalWidth, img.naturalHeight);
        } else {
          img.addEventListener("load", () => apply(img.naturalWidth, img.naturalHeight), { once: true });
        }
      }
      const genBtn = card.querySelector(`[data-gen="${idx}"]`);
      if (genBtn && !busy) {
        genBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this._generate(idx);
        });
      }
      card.querySelector(`[data-comments="${idx}"]`)?.addEventListener("click", () => this._openComments(idx));
      card.querySelector(`[data-menu="${idx}"]`)?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openPostMenu(idx);
      });
      return card;
    }
    /** Persist measured dimensions so the card doesn't reflow on every render. */
    _rememberSize(idx, w, h) {
      const state = this.storage.getState();
      const post = state.creator?.posts?.[idx];
      if (!post || post.imageW === w && post.imageH === h) return;
      post.imageW = w;
      post.imageH = h;
      this.storage.save();
    }
    /* ─────────────────────────── stats ─────────────────────────── */
    _renderStats(body, creator) {
      const posts = creator.posts || [];
      const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
      const avg = posts.length ? Math.round(likes / posts.length) : 0;
      const top = posts.length ? posts.reduce((a, b) => (b.likes || 0) > (a.likes || 0) ? b : a) : null;
      const comments = posts.reduce((s, p) => s + (Array.isArray(p.comments) ? p.comments.length : 0), 0);
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
                    <div class="astral-stat-card-label">\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432</div>
                    <div class="astral-stat-card-value">${this._n(comments)}</div>
                </div>
                <div class="astral-stat-card astral-stat-card--wide">
                    <div class="astral-stat-card-label">\u041B\u0443\u0447\u0448\u0438\u0439 \u043F\u043E\u0441\u0442</div>
                    <div class="astral-stat-card-value astral-stat-card-value--sm">
                        ${top ? this._esc((top.caption || "").slice(0, 48) || "\u2014") : "\u2014"}
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
    /**
     * @param {number|null} editIndex  Index of the post being edited, or null to create.
     */
    _openComposer(editIndex = null) {
      const state = this.storage.getState();
      const post = editIndex === null ? null : state.creator?.posts?.[editIndex];
      if (editIndex !== null && !post) return;
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">${post ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0441\u0442" : "\u041D\u043E\u0432\u044B\u0439 \u043F\u043E\u0441\u0442"}</div>

                <label class="astral-field-label" for="astral-post-caption">\u041F\u043E\u0434\u043F\u0438\u0441\u044C</label>
                <textarea class="astral-textarea astral-textarea--short" id="astral-post-caption"
                    placeholder="\u0422\u0435\u043A\u0441\u0442 \u043F\u043E\u0434 \u043F\u043E\u0441\u0442\u043E\u043C \u2014 \u0447\u0442\u043E \u0443\u0433\u043E\u0434\u043D\u043E, \u044D\u0442\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u043F\u043E\u0434\u043F\u0438\u0441\u044C.">${this._esc(post?.caption || "")}</textarea>

                <label class="astral-field-label" for="astral-post-text">\u041F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0444\u043E\u0442\u043E</label>
                <textarea class="astral-textarea" id="astral-post-text"
                    placeholder="\u0427\u0442\u043E \u043D\u0430 \u0444\u043E\u0442\u043E \u2014 \u043F\u043E\u0437\u0430, \u043E\u0434\u0435\u0436\u0434\u0430, \u043C\u0435\u0441\u0442\u043E, \u0441\u0432\u0435\u0442. \u041D\u0430 \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0432\u043B\u0438\u044F\u0435\u0442.">${this._esc(post?.prompt || "")}</textarea>
                <button class="astral-btn astral-btn-wide astral-enhance-btn" id="astral-post-enhance">
                    \u2728 \u0423\u043B\u0443\u0447\u0448\u0438\u0442\u044C \u043F\u0440\u043E\u043C\u043F\u0442
                </button>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-post-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-post-go">
                        ${post ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" : "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C"}
                    </button>
                </div>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-post-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-post-go").addEventListener("click", async () => {
        const caption = overlay.querySelector("#astral-post-caption").value.trim();
        const prompt2 = overlay.querySelector("#astral-post-text").value.trim();
        if (!caption && !prompt2) return;
        close();
        if (post) this._updatePost(editIndex, { caption, prompt: prompt2 });
        else await this._createPost(caption, prompt2);
      });
      const enhanceBtn = overlay.querySelector("#astral-post-enhance");
      const promptField = overlay.querySelector("#astral-post-text");
      enhanceBtn?.addEventListener("click", async () => {
        const draft = promptField.value.trim();
        if (!draft) {
          this._toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u043F\u0438\u0448\u0438 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043F\u0440\u043E\u043C\u043F\u0442\u0430", "error");
          promptField.focus();
          return;
        }
        const original = enhanceBtn.textContent;
        enhanceBtn.disabled = true;
        enhanceBtn.textContent = "\u0423\u043B\u0443\u0447\u0448\u0430\u044E\u2026";
        try {
          const style = resolveStyle(this.imageGen);
          const improved = await enhancePrompt(draft, {
            character: this._charName(),
            style
          });
          if (improved) {
            promptField.value = improved;
            this._toast("\u041F\u0440\u043E\u043C\u043F\u0442 \u0443\u043B\u0443\u0447\u0448\u0435\u043D", "success");
          } else {
            this._toast("\u041C\u043E\u0434\u0435\u043B\u044C \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043F\u0443\u0441\u0442\u043E\u0439 \u043E\u0442\u0432\u0435\u0442", "error");
          }
        } catch (err) {
          console.error("[Creator] enhance failed:", err);
          this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
        } finally {
          enhanceBtn.disabled = false;
          enhanceBtn.textContent = original;
        }
      });
      overlay.querySelector("#astral-post-caption").focus();
    }
    /* ─────────────────────────── create / update / delete ─────────────────────────── */
    async _createPost(caption, prompt2) {
      const state = this.storage.getState();
      if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
      if (!Array.isArray(state.creator.posts)) state.creator.posts = [];
      state.creator.posts.unshift({
        id: this._uid(),
        caption,
        prompt: prompt2,
        timestamp: Date.now(),
        imageUrl: null,
        imageW: 0,
        imageH: 0,
        likes: this._rand(5, 60),
        comments: this._seedComments()
      });
      state.creator.revenue = (state.creator.revenue || 0) + this._rand(12, 70);
      this.storage.save();
      this._tab = "feed";
      this.render(document.querySelector(".astral-phone-body"));
      if (prompt2 && this.imageGen.isAvailable()) await this._generate(0, true);
      this.render(document.querySelector(".astral-phone-body"));
    }
    _updatePost(index, patch) {
      const state = this.storage.getState();
      const post = state.creator?.posts?.[index];
      if (!post) return;
      Object.assign(post, patch);
      this.storage.save();
      this.render(document.querySelector(".astral-phone-body"));
      this._toast("\u041F\u043E\u0441\u0442 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D", "success");
    }
    _deletePost(index) {
      const state = this.storage.getState();
      if (!Array.isArray(state.creator?.posts) || !state.creator.posts[index]) return;
      state.creator.posts.splice(index, 1);
      this.storage.save();
      this.render(document.querySelector(".astral-phone-body"));
      this._toast("\u041F\u043E\u0441\u0442 \u0443\u0434\u0430\u043B\u0451\u043D", "success");
    }
    /** Small action sheet for a post: edit, delete. */
    _openPostMenu(index) {
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <button class="astral-sheet-btn" data-act="regen">\u041F\u0435\u0440\u0435\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0444\u043E\u0442\u043E</button>
                <button class="astral-sheet-btn" data-act="edit">\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C</button>
                <button class="astral-sheet-btn astral-sheet-btn--danger" data-act="delete">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button>
                <button class="astral-sheet-btn astral-sheet-btn--cancel" data-act="cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);
      overlay.querySelector('[data-act="regen"]')?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E\u2026";
        close();
        await this._generate(index);
      });
      overlay.querySelector('[data-act="edit"]').addEventListener("click", () => {
        close();
        this._openComposer(index);
      });
      overlay.querySelector('[data-act="delete"]').addEventListener("click", () => {
        close();
        this._confirmDelete(index);
      });
    }
    _confirmDelete(index) {
      const state = this.storage.getState();
      const post = state.creator?.posts?.[index];
      const preview = (post?.caption || "").slice(0, 60) || "\u0431\u0435\u0437 \u043F\u043E\u0434\u043F\u0438\u0441\u0438";
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <div class="astral-confirm-text">\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u0442 \xAB${this._esc(preview)}\xBB? \u042D\u0442\u043E \u043D\u0435\u043E\u0431\u0440\u0430\u0442\u0438\u043C\u043E.</div>
                <button class="astral-sheet-btn astral-sheet-btn--danger" data-act="yes">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button>
                <button class="astral-sheet-btn astral-sheet-btn--cancel" data-act="no">\u041E\u0442\u043C\u0435\u043D\u0430</button>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector('[data-act="no"]').addEventListener("click", close);
      overlay.querySelector('[data-act="yes"]').addEventListener("click", () => {
        close();
        this._deletePost(index);
      });
    }
    /* ─────────────────────────── comments ─────────────────────────── */
    _openComments(index) {
      const state = this.storage.getState();
      const post = state.creator?.posts?.[index];
      if (!post) return;
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--comments">
                <div class="astral-modal-title">\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (${comments.length})</div>
                <div class="astral-comment-list" id="astral-comment-list"></div>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-comments-close">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</button>
                </div>
            </div>
        `;
      document.querySelector(".astral-phone").appendChild(overlay);
      const list = overlay.querySelector("#astral-comment-list");
      if (comments.length === 0) {
        list.innerHTML = `<div class="astral-comment-empty">\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442</div>`;
      } else {
        for (const c of comments) {
          const row = document.createElement("div");
          row.className = "astral-comment";
          row.innerHTML = `
                    <div class="astral-comment-ava">${this._esc((c.author || "?")[0].toUpperCase())}</div>
                    <div class="astral-comment-main">
                        <div class="astral-comment-head">
                            <span class="astral-comment-author">${this._esc(c.author || "\u0410\u043D\u043E\u043D\u0438\u043C")}</span>
                            <span class="astral-comment-time">${this._ago(c.timestamp)}</span>
                        </div>
                        <div class="astral-comment-text">${this._esc(c.text || "")}</div>
                    </div>
                `;
          list.appendChild(row);
        }
      }
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-comments-close").addEventListener("click", close);
    }
    /** Fan comments seeded onto a fresh post. */
    _seedComments() {
      const count = this._rand(1, 4);
      const used = /* @__PURE__ */ new Set();
      const out = [];
      for (let i = 0; i < count; i++) {
        let author = this._pick(FAN_NAMES);
        let guard = 0;
        while (used.has(author) && guard++ < 12) author = this._pick(FAN_NAMES);
        used.add(author);
        out.push({
          id: this._uid(),
          author,
          text: this._pick(COMMENT_TEXTS),
          timestamp: Date.now() - this._rand(1, 90) * 6e4
        });
      }
      return out.sort((a, b) => b.timestamp - a.timestamp);
    }
    /* ─────────────────────────── generation ─────────────────────────── */
    /** Имя персонажа: карточка надёжнее, чем name2 (тот может быть 'SillyTavern System'). */
    _charName() {
      const ctx = this.context || {};
      const fromCard = String(ctx.characters?.[ctx.characterId]?.name || "").trim();
      if (fromCard) return fromCard;
      const fallback = String(ctx.name2 || "").trim();
      return /sillytavern/i.test(fallback) ? "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436" : fallback || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
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
        const scene = String(post.prompt || "").trim();
        const charName = this._charName();
        const style = resolveStyle(this.imageGen) || String(post.style || "");
        const base = [charName, scene].filter(Boolean).join(", ");
        const prompt2 = ensureStyle(base, style);
        console.log("[Creator] prompt:", prompt2);
        const url = await this.imageGen.generate(prompt2, {
          character: charName,
          type: "creator_post",
          nsfw: true,
          style
        });
        post.imageUrl = url;
        post.imageW = 0;
        post.imageH = 0;
        if (style) post.style = style;
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
      if (!Array.isArray(state.creator.posts)) state.creator.posts = [];
      const meta = eventData.metadata || {};
      if (eventData.type === "content_posted") {
        state.creator.posts.unshift({
          id: this._uid(),
          caption: eventData.description || "",
          prompt: meta.prompt || "",
          timestamp: Date.now(),
          imageUrl: null,
          imageW: 0,
          imageH: 0,
          likes: this._rand(5, 60),
          comments: this._seedComments()
        });
      } else if (eventData.type === "comment_received") {
        const post = state.creator.posts[Number(meta.post) || 0];
        if (post) {
          if (!Array.isArray(post.comments)) post.comments = [];
          post.comments.unshift({
            id: this._uid(),
            author: meta.fan || this._pick(FAN_NAMES),
            text: eventData.description || this._pick(COMMENT_TEXTS),
            timestamp: Date.now()
          });
        }
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
    _pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    _uid() {
      return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

  // apps/settings.js
  var SettingsApp = class {
    static {
      __name(this, "SettingsApp");
    }
    constructor(context, storage2, accountManager) {
      this.context = context;
      this.storage = storage2;
      this.accountManager = accountManager;
      this.title = "Settings";
      this.icon = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>`;
    }
    render(container) {
      if (!this.accountManager) {
        container.innerHTML = '<div class="astral-empty-state"><div class="astral-empty-state-icon">\u26A0</div><div>\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D</div></div>';
        return;
      }
      const account = this.accountManager.getCurrentAccount();
      container.innerHTML = `
            <div class="astral-app astral-settings">
                <div class="astral-settings-section">
                    <h3 class="astral-section-title">\u041F\u0440\u043E\u0444\u0438\u043B\u044C</h3>

                    <div class="astral-profile-edit">
                        <div class="astral-avatar-edit">
                            <img src="${this._esc(account.avatar)}" alt="Avatar" class="astral-avatar-preview" />
                            <button class="astral-btn-icon" data-action="change-avatar">\u270E</button>
                        </div>

                        <div class="astral-form-group">
                            <label>\u0418\u043C\u044F</label>
                            <input type="text" id="astral-account-name" value="${this._esc(account.name)}" placeholder="\u0412\u0430\u0448\u0435 \u0438\u043C\u044F" />
                        </div>

                        <div class="astral-form-group">
                            <label>\u0411\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u044F</label>
                            <textarea id="astral-account-bio" placeholder="\u0420\u0430\u0441\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043E \u0441\u0435\u0431\u0435..." rows="3">${this._esc(account.bio)}</textarea>
                        </div>

                        <button class="astral-btn-primary" data-action="save-profile">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                    </div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 API</h3>
                    <div class="astral-form-group">
                        <label>\u041F\u0440\u043E\u0444\u0438\u043B\u044C</label>
                        <div class="astral-api-profile-bar">
                            <select id="astral-api-profile"></select>
                            <button class="astral-btn-icon" data-act="profile-new" title="\u041D\u043E\u0432\u044B\u0439">+</button>
                            <button class="astral-btn-icon" data-act="profile-del" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C">\u2715</button>
                        </div>
                    </div>
                    <div class="astral-form-group">
                        <label>Endpoint</label>
                        <input type="text" id="astral-api-endpoint" placeholder="https://api.openai.com/v1" />
                    </div>
                    <div class="astral-form-group">
                        <label>API \u043A\u043B\u044E\u0447</label>
                        <input type="password" id="astral-api-key" placeholder="sk-..." />
                    </div>
                    <div class="astral-form-group">
                        <label>\u041C\u043E\u0434\u0435\u043B\u044C</label>
                        <div class="astral-api-model-bar">
                            <select id="astral-api-model"></select>
                            <button class="astral-btn-icon" data-act="api-connect" title="\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F">\u27F3</button>
                        </div>
                        <input type="text" id="astral-api-model-manual" placeholder="\u0438\u043B\u0438 \u0432\u0432\u0435\u0441\u0442\u0438 \u0432\u0440\u0443\u0447\u043D\u0443\u044E" />
                    </div>
                    <div class="astral-form-group">
                        <label>\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430</label>
                        <input type="number" id="astral-api-temp" min="0" max="2" step="0.1" value="0.7" />
                    </div>
                    <div class="astral-api-note" id="astral-api-status"></div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">\u0412\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439</h3>
                    <div id="astral-app-charbook"></div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430</h3>
                    <div class="astral-stats-grid">
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.followers}</div>
                            <div class="astral-stat-label">\u041F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0438</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.following}</div>
                            <div class="astral-stat-label">\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.posts}</div>
                            <div class="astral-stat-label">\u041F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438</div>
                        </div>
                        <div class="astral-stat-item">
                            <div class="astral-stat-value">${account.stats.likes}</div>
                            <div class="astral-stat-label">\u041B\u0430\u0439\u043A\u0438</div>
                        </div>
                    </div>
                </div>

                <div class="astral-settings-section">
                    <h3 class="astral-section-title">\u041E \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435</h3>
                    <div class="astral-about">
                        <div class="astral-about-line">
                            <span>\u0412\u0435\u0440\u0441\u0438\u044F</span>
                            <span>1.0.0</span>
                        </div>
                        <div class="astral-about-line">
                            <span>\u0421\u043E\u0437\u0434\u0430\u043D</span>
                            <span>${new Date(account.createdAt).toLocaleDateString("ru-RU")}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
      this.attachEvents(container);
    }
    attachEvents(container) {
      const q = /* @__PURE__ */ __name((sel) => container.querySelector(sel), "q");
      const api = {
        endpoint: q("#astral-api-endpoint"),
        apiKey: q("#astral-api-key"),
        profile: q("#astral-api-profile"),
        model: q("#astral-api-model"),
        manual: q("#astral-api-model-manual"),
        temperature: q("#astral-api-temp")
      };
      const status = q("#astral-api-status");
      const fillModels = /* @__PURE__ */ __name((models, selected) => {
        if (!api.model) return;
        const list = models.length ? models : cachedModels();
        api.model.innerHTML = "";
        if (!list.length) {
          api.model.innerHTML = '<option value="">\u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u27F3 \u2014</option>';
          return;
        }
        for (const id of list) {
          const o = document.createElement("option");
          o.value = id;
          o.textContent = id;
          if (id === selected) o.selected = true;
          api.model.appendChild(o);
        }
        if (selected && !list.includes(selected)) {
          const o = document.createElement("option");
          o.value = selected;
          o.textContent = selected;
          o.selected = true;
          api.model.appendChild(o);
        }
      }, "fillModels");
      const fillProfiles = /* @__PURE__ */ __name(() => {
        if (!api.profile) return;
        const { profiles, activeId } = listProfiles();
        api.profile.innerHTML = "";
        if (!profiles.length) {
          api.profile.innerHTML = '<option value="">\u2014 \u043D\u0435\u0442 \u2014</option>';
          return;
        }
        for (const p of profiles) {
          const o = document.createElement("option");
          o.value = p.id;
          o.textContent = p.name || p.id;
          if (p.id === activeId) o.selected = true;
          api.profile.appendChild(o);
        }
      }, "fillProfiles");
      const fillFields = /* @__PURE__ */ __name(() => {
        const cur = loadApiSettings();
        if (api.endpoint) api.endpoint.value = cur.endpoint;
        if (api.apiKey) api.apiKey.value = cur.apiKey;
        if (api.temperature) api.temperature.value = cur.temperature;
        if (api.manual) api.manual.value = "";
        fillModels(cachedModels(), cur.model);
      }, "fillFields");
      const refresh = /* @__PURE__ */ __name(() => {
        if (!status) return;
        const s = loadApiSettings();
        status.textContent = s.endpoint && s.model ? `\u2713 \u041F\u0440\u043E\u043C\u043F\u0442\u044B \u043F\u0438\u0448\u0435\u0442: ${s.model}` : "\u041F\u0440\u043E\u043C\u043F\u0442\u044B \u043F\u0438\u0448\u0435\u0442 \u043E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0447\u0430\u0442\u0430";
      }, "refresh");
      const save = /* @__PURE__ */ __name(() => {
        saveApiSettings({
          endpoint: api.endpoint?.value || "",
          apiKey: api.apiKey?.value || "",
          model: api.manual?.value.trim() || api.model?.value || "",
          temperature: Number(api.temperature?.value) || 0.7
        });
        refresh();
      }, "save");
      fillProfiles();
      fillFields();
      refresh();
      container.querySelector('[data-act="api-connect"]')?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        if (status) status.textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u2026";
        const res = await testConnection({
          endpoint: api.endpoint?.value.trim() || "",
          apiKey: api.apiKey?.value.trim() || ""
        });
        btn.disabled = false;
        if (res.ok) {
          fillModels(res.models, api.model?.value || "");
          if (api.model && !api.model.value) api.model.value = res.models[0];
          save();
          if (status) status.textContent = `\u2713 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u043C\u043E\u0434\u0435\u043B\u0435\u0439: ${res.models.length}`;
        } else if (status) {
          status.textContent = `\u2717 ${res.error}`;
        }
      });
      api.model?.addEventListener("change", () => {
        if (api.manual) api.manual.value = "";
        save();
      });
      api.manual?.addEventListener("input", save);
      api.endpoint?.addEventListener("change", save);
      api.apiKey?.addEventListener("change", save);
      api.temperature?.addEventListener("change", save);
      api.profile?.addEventListener("change", (e) => {
        activateProfile(e.target.value);
        fillFields();
        refresh();
      });
      container.querySelector('[data-act="profile-new"]')?.addEventListener("click", () => {
        const name = prompt("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F:", `\u041F\u0440\u043E\u0444\u0438\u043B\u044C ${listProfiles().profiles.length + 1}`);
        if (name === null) return;
        addProfile(String(name || "").trim());
        fillProfiles();
        fillFields();
        refresh();
      });
      container.querySelector('[data-act="profile-del"]')?.addEventListener("click", () => {
        const { profiles, activeId } = listProfiles();
        if (profiles.length <= 1) return;
        if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F?")) return;
        removeProfile(activeId);
        fillProfiles();
        fillFields();
        refresh();
      });
      const bookHost = container.querySelector("#astral-app-charbook");
      if (bookHost) {
        bookHost.innerHTML = renderCharacterBookHTML();
        bindCharacterBook(bookHost);
      }
      if (!this.accountManager) return;
      container.querySelector('[data-action="save-profile"]')?.addEventListener("click", () => {
        const name = container.querySelector("#astral-account-name")?.value || "";
        const bio = container.querySelector("#astral-account-bio")?.value || "";
        this.accountManager.updateAccount({ name, bio });
        const btn = container.querySelector('[data-action="save-profile"]');
        const orig = btn.textContent;
        btn.textContent = "\u2713 \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E";
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      });
      container.querySelector('[data-action="change-avatar"]')?.addEventListener("click", () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.onchange = async () => {
          const file = inp.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            const url = e.target.result;
            this.accountManager.updateAccount({ avatar: url });
            const img = container.querySelector(".astral-avatar-preview");
            if (img) img.src = url;
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      });
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/notes.js
  var NOTE_KINDS = {
    diary: { label: "\u0414\u043D\u0435\u0432\u043D\u0438\u043A", mark: "\u2766" },
    plan: { label: "\u041F\u043B\u0430\u043D", mark: "\u25C8" },
    secret: { label: "\u0421\u0435\u043A\u0440\u0435\u0442", mark: "\u2726" },
    note: { label: "\u0417\u0430\u043C\u0435\u0442\u043A\u0430", mark: "\xB7" }
  };
  var NotesApp = class {
    static {
      __name(this, "NotesApp");
    }
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "notes";
      this.title = "Notes";
      this.icon = ICONS.notes;
      this._openId = null;
      this._filter = "all";
    }
    render(container) {
      if (this._openId) {
        this._renderSingle(container);
        return;
      }
      this._renderList(container);
    }
    /* ─────────────────────────── список ─────────────────────────── */
    _renderList(container) {
      const state = this.storage.getState();
      const all = Array.isArray(state.notes) ? [...state.notes] : [];
      const counts = { all: all.length };
      for (const key of Object.keys(NOTE_KINDS)) {
        counts[key] = all.filter((n) => (n.kind || "note") === key).length;
      }
      const filtered = this._filter === "all" ? all : all.filter((n) => (n.kind || "note") === this._filter);
      filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      container.innerHTML = "";
      const tabs = document.createElement("div");
      tabs.className = "astral-note-tabs";
      for (const [key, label] of [["all", "\u0412\u0441\u0435"], ...Object.entries(NOTE_KINDS).map(([k, v]) => [k, v.label])]) {
        const count = counts[key] || 0;
        if (key !== "all" && count === 0) continue;
        const tab = document.createElement("button");
        tab.className = `astral-note-tab ${this._filter === key ? "active" : ""}`;
        tab.textContent = count ? `${label} ${count}` : label;
        tab.addEventListener("click", () => {
          this._filter = key;
          this.render(container);
        });
        tabs.appendChild(tab);
      }
      container.appendChild(tabs);
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "astral-empty-state";
        empty.innerHTML = `
                <div class="astral-empty-state-icon">${ICONS.notes}</div>
                <div>\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u043D\u0435\u0442</div>
                <div class="astral-empty-hint">\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043F\u0438\u0448\u0435\u0442 \u0438\u0445 \u0441\u0430\u043C, \u0438\u043B\u0438 \u0434\u043E\u0431\u0430\u0432\u044C \u0441\u0432\u043E\u044E \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u043D\u0438\u0436\u0435</div>`;
        container.appendChild(empty);
      } else {
        const list = document.createElement("div");
        list.className = "astral-note-list";
        for (const note of filtered) {
          list.appendChild(this._buildCard(note, container));
        }
        container.appendChild(list);
      }
      const genBar = document.createElement("div");
      genBar.className = "astral-note-gen";
      for (const [kind, info] of Object.entries(NOTE_KINDS)) {
        const btn = document.createElement("button");
        btn.className = "astral-note-gen-btn";
        btn.innerHTML = `<span class="astral-note-gen-mark">${info.mark}</span>${info.label}`;
        btn.addEventListener("click", () => this._generate(kind, container, btn));
        genBar.appendChild(btn);
      }
      container.appendChild(genBar);
      const bar = document.createElement("div");
      bar.className = "astral-action-bar";
      const addBtn = document.createElement("button");
      addBtn.className = "astral-btn astral-btn-wide";
      addBtn.textContent = "+ \u0421\u0432\u043E\u044F \u0437\u0430\u043F\u0438\u0441\u044C";
      addBtn.addEventListener("click", () => this._openEditor(null, container));
      bar.appendChild(addBtn);
      container.appendChild(bar);
    }
    /** Попросить модель написать записи нужного типа от лица персонажа. */
    async _generate(kind, container, btn) {
      if (btn?.disabled) return;
      if (btn) {
        btn.disabled = true;
        btn.classList.add("is-busy");
      }
      const { charName } = collectCast(this.context || {});
      const stop = showTyping(charName);
      try {
        const notes = await generateNotes(this.context || {}, { kind, count: 1 });
        stop();
        if (!notes.length || !notes[0].text) {
          this._toast("\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u043B\u0430", "error");
          return;
        }
        const state = this.storage.getState();
        if (!Array.isArray(state.notes)) state.notes = [];
        for (const n of notes) {
          state.notes.push({
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            kind: n.kind || kind,
            title: n.title || "",
            text: n.text,
            timestamp: Date.now(),
            author: "character",
            character: charName
          });
        }
        this.storage.save();
        this._refreshPrompt();
        this._toast(notes.length > 1 ? `\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439: ${notes.length}` : "\u0417\u0430\u043F\u0438\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430");
        this.render(container);
      } catch (err) {
        stop();
        console.error("[Notes] generation failed:", err);
        this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("is-busy");
        }
      }
    }
    _buildCard(note, container) {
      const kind = NOTE_KINDS[note.kind] || NOTE_KINDS.note;
      const card = document.createElement("div");
      card.className = `astral-note-card astral-note-card--${note.kind || "note"}`;
      card.innerHTML = `
            <div class="astral-note-head">
                <span class="astral-note-mark">${kind.mark}</span>
                <span class="astral-note-kind">${this._esc(kind.label)}</span>
                <span class="astral-note-time">${this._time(note.timestamp)}</span>
            </div>
            ${note.title ? `<div class="astral-note-title">${this._esc(note.title)}</div>` : ""}
            <div class="astral-note-excerpt">${this._esc(this._excerpt(note.text))}</div>
        `;
      card.addEventListener("click", () => {
        this._openId = note.id;
        this.render(container);
      });
      return card;
    }
    /* ─────────────────────────── одна заметка ─────────────────────────── */
    _renderSingle(container) {
      const state = this.storage.getState();
      const note = (state.notes || []).find((n) => n.id === this._openId);
      if (!note) {
        this._openId = null;
        this._renderList(container);
        return;
      }
      const kind = NOTE_KINDS[note.kind] || NOTE_KINDS.note;
      container.innerHTML = `
            <div class="astral-note-open">
                <div class="astral-note-open-head">
                    <button class="astral-note-back">\u2039 \u041D\u0430\u0437\u0430\u0434</button>
                    <span class="astral-note-kind">${this._esc(kind.label)}</span>
                    <span class="astral-note-time">${this._time(note.timestamp)}</span>
                </div>
                ${note.title ? `<h2 class="astral-note-open-title">${this._esc(note.title)}</h2>` : ""}
                <div class="astral-note-open-text">${this._esc(note.text).replace(/\n/g, "<br>")}</div>
                <div class="astral-action-bar">
                    <button class="astral-btn" id="astral-note-edit">\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C</button>
                    <button class="astral-btn astral-btn-danger" id="astral-note-del">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      container.querySelector(".astral-note-back").addEventListener("click", () => {
        this._openId = null;
        this.render(container);
      });
      container.querySelector("#astral-note-edit").addEventListener("click", () => {
        this._openEditor(note, container);
      });
      container.querySelector("#astral-note-del").addEventListener("click", () => {
        if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C?")) return;
        const st = this.storage.getState();
        st.notes = (st.notes || []).filter((n) => n.id !== note.id);
        this.storage.save();
        this._openId = null;
        this._toast("\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0430");
        this.render(container);
      });
    }
    /* ─────────────────────────── редактор ─────────────────────────── */
    _openEditor(note, container) {
      const isNew = !note;
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">${isNew ? "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" : "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"}</div>

                <label class="astral-field-label">\u0422\u0438\u043F</label>
                <select class="astral-select" id="astral-note-kind">
                    ${Object.entries(NOTE_KINDS).map(
        ([k, v]) => `<option value="${k}" ${(note?.kind || "diary") === k ? "selected" : ""}>${v.label}</option>`
      ).join("")}
                </select>

                <label class="astral-field-label">\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A</label>
                <input type="text" class="astral-input" id="astral-note-title"
                       value="${this._esc(note?.title || "")}" placeholder="\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E">

                <label class="astral-field-label">\u0422\u0435\u043A\u0441\u0442</label>
                <textarea class="astral-textarea" id="astral-note-text"
                          rows="6" placeholder="\u041E \u0447\u0451\u043C \u0437\u0430\u043F\u0438\u0441\u044C\u2026">${this._esc(note?.text || "")}</textarea>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-note-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-note-save">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      phone.appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-note-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-note-save").addEventListener("click", () => {
        const kind = overlay.querySelector("#astral-note-kind").value;
        const title = overlay.querySelector("#astral-note-title").value.trim();
        const text = overlay.querySelector("#astral-note-text").value.trim();
        if (!text) return;
        const state = this.storage.getState();
        if (!Array.isArray(state.notes)) state.notes = [];
        if (isNew) {
          state.notes.push({
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            kind,
            title,
            text,
            timestamp: Date.now(),
            author: "user"
          });
        } else {
          const target = state.notes.find((n) => n.id === note.id);
          if (target) {
            Object.assign(target, { kind, title, text, edited: Date.now() });
          }
        }
        this.storage.save();
        close();
        this._openId = isNew ? null : this._openId;
        this._toast(isNew ? "\u0417\u0430\u043F\u0438\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430" : "\u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430");
        this.render(document.querySelector(".astral-phone-body"));
        this._refreshPrompt();
      });
      overlay.querySelector("#astral-note-text").focus();
    }
    /* ─────────────────────────── события ─────────────────────────── */
    async handleEvent(eventData) {
      const state = this.storage.getState();
      if (!Array.isArray(state.notes)) state.notes = [];
      const text = String(eventData.description || eventData.text || "").trim();
      if (!text) return { success: false, message: "\u041F\u0443\u0441\u0442\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" };
      const meta = eventData.metadata || {};
      const kind = [eventData.kind, meta.kind].find((k) => ["diary", "plan", "secret", "note"].includes(k)) || "diary";
      const title = String(eventData.title || meta.title || "").trim();
      state.notes.push({
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind,
        title,
        text,
        timestamp: Date.now(),
        author: "character",
        character: eventData.character || ""
      });
      this.storage.save();
      this._refreshPrompt();
      return { success: true, message: "\u0417\u0430\u043F\u0438\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0430" };
    }
    /* ─────────────────────────── утилиты ─────────────────────────── */
    _excerpt(text) {
      const src = String(text || "").replace(/\s+/g, " ").trim();
      return src.length > 110 ? `${src.slice(0, 110)}\u2026` : src;
    }
    _refreshPrompt() {
      try {
        globalThis.__astralRefreshPrompt?.();
      } catch {
      }
    }
    _toast(text, kind = "info") {
      if (window.toastr) (toastr[kind] || toastr.info)(text);
      else console.log(`[Notes] ${text}`);
    }
    _time(ts) {
      if (!ts) return "";
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
  function buildNotesPromptBlock(state, limit = 5) {
    const notes = Array.isArray(state?.notes) ? state.notes : [];
    if (!notes.length) return "";
    const recent = [...notes].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limit).reverse();
    const lines = recent.map((n) => {
      const kind = NOTE_KINDS[n.kind] || NOTE_KINDS.note;
      const title = n.title ? `${n.title}: ` : "";
      return `- [${kind.label}] ${title}${String(n.text || "").replace(/\s+/g, " ").slice(0, 180)}`;
    });
    return `[Astral Phone \u2014 \u043B\u0438\u0447\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438]
\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0432\u0435\u0434\u0451\u0442 \u0438\u0445 \u0441\u0430\u043C, \u044D\u0442\u043E \u0435\u0433\u043E \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u044B\u0435 \u043C\u044B\u0441\u043B\u0438:
${lines.join("\n")}`;
  }
  __name(buildNotesPromptBlock, "buildNotesPromptBlock");

  // apps/social.js
  var SocialApp = class {
    static {
      __name(this, "SocialApp");
    }
    constructor(context, storage2, imageGen2) {
      this.context = context;
      this.storage = storage2;
      this.imageGen = imageGen2;
      this.id = "social";
      this.title = "Social";
      this.icon = ICONS.social;
      this._replyTo = null;
      this._filter = "all";
    }
    render(container) {
      const state = this.storage.getState();
      const posts = this._sortedPosts(state);
      container.innerHTML = "";
      container.appendChild(this._buildTopBar(container));
      if (posts.length === 0) {
        const empty = document.createElement("div");
        empty.className = "astral-empty-state";
        empty.innerHTML = `
                <div class="astral-empty-state-icon">${ICONS.social}</div>
                <div>\u041B\u0435\u043D\u0442\u0430 \u043F\u0443\u0441\u0442\u0430</div>
                <div class="astral-empty-hint">\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438 \u043D\u0430\u0447\u043D\u0443\u0442 \u043F\u0438\u0441\u0430\u0442\u044C, \u043A\u043E\u0433\u0434\u0430 \u0432 \u0441\u0446\u0435\u043D\u0435 \u0447\u0442\u043E-\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0439\u0434\u0451\u0442</div>`;
        container.appendChild(empty);
      } else {
        const feed = document.createElement("div");
        feed.className = "astral-social-feed";
        for (const post of posts) feed.appendChild(this._buildPost(post, state, container));
        container.appendChild(feed);
      }
      container.appendChild(this._buildComposerBar(container));
    }
    _sortedPosts(state) {
      const posts = Array.isArray(state.social) ? [...state.social] : [];
      if (this._filter === "following") {
        const following = new Set(state.socialFollowing || []);
        return posts.filter((p) => following.has(p.author)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      return posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    _buildTopBar(container) {
      const bar = document.createElement("div");
      bar.className = "astral-social-top";
      const all = document.createElement("button");
      all.className = `astral-social-tab ${this._filter === "all" ? "active" : ""}`;
      all.textContent = "\u0412\u0441\u0435";
      all.addEventListener("click", () => {
        this._filter = "all";
        this.render(container);
      });
      const following = document.createElement("button");
      following.className = `astral-social-tab ${this._filter === "following" ? "active" : ""}`;
      following.textContent = "\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438";
      following.addEventListener("click", () => {
        this._filter = "following";
        this.render(container);
      });
      const profile = document.createElement("button");
      profile.className = "astral-social-tab astral-social-tab--icon";
      profile.title = "\u041F\u0440\u043E\u0444\u0438\u043B\u044C";
      profile.textContent = "\u25CD";
      profile.addEventListener("click", () => this._openProfile(container));
      bar.appendChild(all);
      bar.appendChild(following);
      bar.appendChild(profile);
      return bar;
    }
    /* ─────────────────────────── профиль персоны ─────────────────────────── */
    _profile() {
      const state = this.storage.getState();
      const saved = state.socialProfile || {};
      return {
        displayName: String(saved.displayName || this._userName()).trim(),
        handle: String(saved.handle || this._handle(this._userName())).trim(),
        bio: String(saved.bio || "").trim()
      };
    }
    _openProfile(container) {
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const p = this._profile();
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">\u041F\u0440\u043E\u0444\u0438\u043B\u044C</div>

                <label class="astral-field-label">\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0435 \u0438\u043C\u044F</label>
                <input type="text" class="astral-input" id="astral-profile-name"
                       value="${this._esc(p.displayName)}" placeholder="\u041A\u0430\u043A \u0442\u0435\u0431\u044F \u0432\u0438\u0434\u044F\u0442">

                <label class="astral-field-label">\u041D\u0438\u043A</label>
                <input type="text" class="astral-input" id="astral-profile-handle"
                       value="${this._esc(p.handle)}" placeholder="username">

                <label class="astral-field-label">\u041E \u0441\u0435\u0431\u0435</label>
                <textarea class="astral-textarea" id="astral-profile-bio" rows="3"
                          placeholder="\u041F\u0430\u0440\u0430 \u0441\u043B\u043E\u0432 \u043E \u0441\u0435\u0431\u0435">${this._esc(p.bio)}</textarea>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-profile-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-profile-save">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      phone.appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-profile-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-profile-save").addEventListener("click", () => {
        const displayName = overlay.querySelector("#astral-profile-name").value.trim();
        const handle = overlay.querySelector("#astral-profile-handle").value.trim().replace(/^@/, "");
        const bio = overlay.querySelector("#astral-profile-bio").value.trim();
        const state = this.storage.getState();
        state.socialProfile = {
          displayName: displayName || this._userName(),
          handle: handle || this._handle(displayName || this._userName()),
          bio
        };
        this.storage.save();
        close();
        this._toast("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D");
        this.render(container);
      });
      overlay.querySelector("#astral-profile-name").focus();
    }
    /* ─────────────────────────── пост ─────────────────────────── */
    _buildPost(post, state, container) {
      const card = document.createElement("div");
      card.className = "astral-social-post";
      const liked = Array.isArray(post.likedBy) && post.likedBy.includes("me");
      const reposted = Array.isArray(post.repostedBy) && post.repostedBy.includes("me");
      const replies = Array.isArray(post.replies) ? post.replies : [];
      const avatarLetter = (post.author || "?")[0].toUpperCase();
      card.innerHTML = `
            <div class="astral-social-head">
                <div class="astral-social-avatar">${this._esc(avatarLetter)}</div>
                <div class="astral-social-who">
                    <span class="astral-social-name">${this._esc(post.author || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439")}</span>
                    ${post.handle ? `<span class="astral-social-handle">@${this._esc(post.handle)}</span>` : ""}
                    <span class="astral-social-dot">\xB7</span>
                    <span class="astral-social-time">${this._ago(post.timestamp)}</span>
                </div>
            </div>

            <div class="astral-social-body">${this._esc(post.text || "").replace(/\n/g, "<br>")}</div>

            ${post.imageUrl ? `<div class="astral-social-media"><img src="${post.imageUrl}" alt="" loading="lazy"></div>` : ""}

            <div class="astral-social-actions">
                <button class="astral-social-act ${replies.length ? "has-count" : ""}" data-act="reply">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9">
                        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.7-.8L3 21l1.9-4.7A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>
                    </svg>
                    <span>${replies.length || ""}</span>
                </button>
                <button class="astral-social-act ${reposted ? "active" : ""}" data-act="repost">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9">
                        <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                    <span>${Array.isArray(post.repostedBy) ? post.repostedBy.length || "" : ""}</span>
                </button>
                <button class="astral-social-act ${liked ? "active astral-social-act--liked" : ""}" data-act="like">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9">
                        <path d="M12 21s-7.2-4.5-9.4-8.6A5.3 5.3 0 0 1 12 6.4a5.3 5.3 0 0 1 9.4 6c-2.2 4.1-9.4 8.6-9.4 8.6z"/>
                    </svg>
                    <span>${Array.isArray(post.likedBy) ? post.likedBy.length || "" : ""}</span>
                </button>
            </div>

            ${replies.length ? `
                <div class="astral-social-replies">
                    ${replies.slice(-3).map((r) => `
                        <div class="astral-social-reply">
                            <span class="astral-social-reply-name">${this._esc(r.author || "")}</span>
                            <span class="astral-social-reply-text">${this._esc(r.text || "")}</span>
                        </div>
                    `).join("")}
                    ${replies.length > 3 ? `<div class="astral-social-more">\u0435\u0449\u0451 ${replies.length - 3}\u2026</div>` : ""}
                </div>` : ""}
        `;
      card.querySelector('[data-act="like"]').addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggle(post.id, "likedBy");
        this.render(container);
      });
      card.querySelector('[data-act="repost"]').addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggle(post.id, "repostedBy");
        this.render(container);
      });
      card.querySelector('[data-act="reply"]').addEventListener("click", (e) => {
        e.stopPropagation();
        this._openReply(post.id, container);
      });
      return card;
    }
    _toggle(postId, field) {
      const state = this.storage.getState();
      const post = (state.social || []).find((p) => p.id === postId);
      if (!post) return;
      if (!Array.isArray(post[field])) post[field] = [];
      const i = post[field].indexOf("me");
      if (i >= 0) post[field].splice(i, 1);
      else post[field].push("me");
      this.storage.save();
    }
    /* ─────────────────────────── ответ ─────────────────────────── */
    _openReply(postId, container) {
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C</div>
                <textarea class="astral-textarea" id="astral-social-reply-text" rows="3"
                          placeholder="\u0422\u0432\u043E\u0439 \u043E\u0442\u0432\u0435\u0442\u2026"></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-social-reply-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-social-reply-go">\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C</button>
                </div>
            </div>
        `;
      phone.appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-social-reply-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-social-reply-go").addEventListener("click", () => {
        const text = overlay.querySelector("#astral-social-reply-text").value.trim();
        if (!text) return;
        const state = this.storage.getState();
        const post = (state.social || []).find((p) => p.id === postId);
        if (!post) {
          close();
          return;
        }
        if (!Array.isArray(post.replies)) post.replies = [];
        post.replies.push({
          author: this._userName(),
          text,
          timestamp: Date.now(),
          mine: true
        });
        this.storage.save();
        close();
        this._toast("\u041E\u0442\u0432\u0435\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D");
        this.render(container);
      });
      overlay.querySelector("#astral-social-reply-text").focus();
    }
    /* ─────────────────────────── создание поста ─────────────────────────── */
    _buildComposerBar(container) {
      const bar = document.createElement("div");
      bar.className = "astral-action-bar astral-social-bar";
      const write = document.createElement("button");
      write.className = "astral-btn astral-btn-primary";
      write.textContent = "\u270E \u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C";
      write.addEventListener("click", () => this._openComposer(container));
      bar.appendChild(write);
      const summon = document.createElement("button");
      summon.className = "astral-btn";
      summon.textContent = "\u25C8 \u041F\u043E\u0441\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430";
      summon.title = "\u041C\u043E\u0434\u0435\u043B\u044C \u0432\u044B\u0431\u0435\u0440\u0435\u0442, \u043A\u0442\u043E \u0438\u0437 \u0441\u0446\u0435\u043D\u044B \u043D\u0430\u043F\u0438\u0448\u0435\u0442 \u043F\u043E\u0441\u0442";
      summon.addEventListener("click", () => this._openSummon(container));
      bar.appendChild(summon);
      return bar;
    }
    /* ─────────────────────────── вызов поста персонажа ─────────────────────────── */
    _openSummon(container) {
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const { cast, charName, userName } = collectCast(this.context || {});
      const candidates = cast.filter((n) => n !== userName);
      const list = candidates.length ? candidates : [charName];
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card">
                <div class="astral-modal-title">\u041A\u0442\u043E \u043F\u0438\u0448\u0435\u0442 \u043F\u043E\u0441\u0442?</div>
                <div class="astral-summon-list">
                    <button class="astral-summon-opt astral-summon-opt--random" data-author="">
                        <span class="astral-summon-name">\u{1F3B2} \u0420\u0430\u043D\u0434\u043E\u043C</span>
                        <span class="astral-summon-hint">\u043C\u043E\u0434\u0435\u043B\u044C \u0432\u044B\u0431\u0435\u0440\u0435\u0442 \u043F\u043E \u0441\u0446\u0435\u043D\u0435</span>
                    </button>
                    ${list.map((name) => `
                        <button class="astral-summon-opt" data-author="${this._esc(name)}">
                            <span class="astral-summon-name">${this._esc(name)}</span>
                        </button>
                    `).join("")}
                </div>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-summon-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                </div>
            </div>
        `;
      phone.appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-summon-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelectorAll(".astral-summon-opt").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const author = btn.dataset.author || "";
          close();
          await this._summonPost(author, container);
        });
      });
    }
    /** Запросить пост у модели и показать «<имя> печатает…» */
    async _summonPost(author, container) {
      const { cast, charName, userName } = collectCast(this.context || {});
      const guess = String(author || "").trim() || cast.find((n) => n !== userName) || charName;
      const stopTyping = showTyping(guess);
      try {
        const result = await generateSocialPost(this.context || {}, { author });
        stopTyping();
        if (!result.text) {
          this._toast("\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u043B\u0430", "error");
          return;
        }
        const state = this.storage.getState();
        if (!Array.isArray(state.social)) state.social = [];
        state.social.push({
          id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          author: result.author,
          handle: this._handle(result.author),
          text: result.text,
          timestamp: Date.now(),
          likedBy: [],
          repostedBy: [],
          replies: []
        });
        this.storage.save();
        this._toast(`${result.author}: \u043F\u043E\u0441\u0442 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D`);
        this.render(container);
      } catch (err) {
        stopTyping();
        console.error("[Social] summon failed:", err);
        this._toast(`\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C: ${err.message}`, "error");
      }
    }
    _openComposer(container) {
      const phone = document.querySelector(".astral-phone");
      if (!phone) return;
      const overlay = document.createElement("div");
      overlay.className = "astral-modal";
      overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">\u041D\u043E\u0432\u044B\u0439 \u043F\u043E\u0441\u0442</div>
                <textarea class="astral-textarea" id="astral-social-text" rows="5"
                          placeholder="\u0427\u0442\u043E \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442?"></textarea>
                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-social-cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
                    <button class="astral-btn astral-btn-primary" id="astral-social-go">\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C</button>
                </div>
            </div>
        `;
      phone.appendChild(overlay);
      const close = /* @__PURE__ */ __name(() => overlay.remove(), "close");
      overlay.querySelector("#astral-social-cancel").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector("#astral-social-go").addEventListener("click", () => {
        const text = overlay.querySelector("#astral-social-text").value.trim();
        if (!text) return;
        const state = this.storage.getState();
        if (!Array.isArray(state.social)) state.social = [];
        state.social.push({
          id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          author: this._userName(),
          handle: this._myHandle(),
          text,
          timestamp: Date.now(),
          mine: true,
          likedBy: [],
          repostedBy: [],
          replies: []
        });
        this.storage.save();
        close();
        this._toast("\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043E");
        this.render(container);
      });
      overlay.querySelector("#astral-social-text").focus();
    }
    /* ─────────────────────────── события ─────────────────────────── */
    async handleEvent(eventData) {
      const state = this.storage.getState();
      if (!Array.isArray(state.social)) state.social = [];
      const text = String(eventData.description || eventData.text || "").trim();
      if (!text) return { success: false, message: "\u041F\u0443\u0441\u0442\u043E\u0439 \u043F\u043E\u0441\u0442" };
      const author = String(eventData.character || this.context?.name2 || "").trim() || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439";
      state.social.push({
        id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        author,
        handle: this._handle(author),
        text,
        timestamp: Date.now(),
        likedBy: [],
        repostedBy: [],
        replies: []
      });
      this.storage.save();
      return { success: true, message: "\u041F\u043E\u0441\u0442 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D" };
    }
    /* ─────────────────────────── утилиты ─────────────────────────── */
    /** Имя для своих постов — из профиля соцсети, иначе из персоны. */
    _userName() {
      const state = this.storage?.getState?.() || {};
      const saved = String(state.socialProfile?.displayName || "").trim();
      if (saved) return saved;
      const ctx = this.context || {};
      const name = String(ctx.name1 || "").trim();
      return !name || /sillytavern/i.test(name) ? "\u0422\u044B" : name;
    }
    /** Ник для своих постов — из профиля, иначе сгенерированный. */
    _myHandle() {
      const state = this.storage?.getState?.() || {};
      const saved = String(state.socialProfile?.handle || "").trim();
      return saved || this._handle(this._userName());
    }
    _handle(name) {
      return String(name || "user").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 18) || "user";
    }
    _ago(ts) {
      if (!ts) return "";
      const diff = Math.max(0, Date.now() - ts);
      const m = Math.floor(diff / 6e4);
      if (m < 1) return "\u0441\u0435\u0439\u0447\u0430\u0441";
      if (m < 60) return `${m}\u043C`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}\u0447`;
      return `${Math.floor(h / 24)}\u0434`;
    }
    _toast(text, kind = "info") {
      if (window.toastr) (toastr[kind] || toastr.info)(text);
      else console.log(`[Social] ${text}`);
    }
    _esc(str) {
      return String(str ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
  };

  // apps/contact-seeder.js
  var ContactSeeder = class {
    static {
      __name(this, "ContactSeeder");
    }
    constructor(context, storage2) {
      this._seed = context || null;
      this.storage = storage2;
    }
    _ctx() {
      try {
        const live = globalThis.SillyTavern?.getContext?.();
        if (live) return live;
      } catch {
      }
      return this._seed || {};
    }
    /** Returns true if contacts have already been seeded for this chat. */
    isSeeded() {
      return Boolean(this.storage.getState().seeded);
    }
    /**
     * Seed contacts + messages for the current chat.
     * @param {{ force?: boolean, onProgress?: (msg: string) => void }} opts
     */
    async seed({ force = false, onProgress = /* @__PURE__ */ __name(() => {
    }, "onProgress") } = {}) {
      if (!force && this.isSeeded()) return { skipped: true };
      const ctx = this._ctx();
      if (typeof ctx.generateQuietPrompt !== "function") {
        throw new Error("generateQuietPrompt \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 SillyTavern \u0434\u043E \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438.");
      }
      onProgress("\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u044E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430\u2026");
      const prompt2 = this._buildPrompt(ctx);
      let raw;
      try {
        raw = await ctx.generateQuietPrompt(prompt2, false, false);
      } catch (err) {
        throw new Error(`\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0430\u0441\u044C \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439: ${err?.message || err}`);
      }
      onProgress("\u0420\u0430\u0437\u0431\u0438\u0440\u0430\u044E \u043E\u0442\u0432\u0435\u0442\u2026");
      const data = this._parse(raw);
      if (!data) throw new Error("\u041C\u043E\u0434\u0435\u043B\u044C \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 (/seed-contacts).");
      this._apply(data);
      onProgress("\u0413\u043E\u0442\u043E\u0432\u043E");
      return { ok: true, contacts: data.contacts?.length ?? 0 };
    }
    /* ─────────────────────────── prompt ─────────────────────────── */
    _buildPrompt(ctx) {
      const charName = ctx.name2 || "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436";
      const userName = ctx.name1 || "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C";
      const char = ctx.characters?.[ctx.characterId];
      const charDesc = this._trim(char?.description || char?.personality || "", 600);
      const charScenario = this._trim(char?.scenario || "", 400);
      const persona = ctx.personas?.[ctx.user_persona] || ctx.persona || {};
      const personaDesc = this._trim(persona?.description || "", 400);
      const personaName = persona?.name || userName;
      return `You are a creative writer preparing background lore for an interactive roleplay.
The main character is: ${charName}${charDesc ? `
Character description: ${charDesc}` : ""}${charScenario ? `
Scenario: ${charScenario}` : ""}
The user's persona is: ${personaName}${personaDesc ? `
Persona description: ${personaDesc}` : ""}

Generate a realistic set of pre-existing phone contacts and message threads for ${personaName}'s smartphone, fitting the character's world and relationships with ${charName}. Include contacts from ${charName}'s world \u2014 friends, colleagues, rivals, or other relevant characters.

IMPORTANT: reply with ONLY a valid JSON object and nothing else. No markdown, no explanation, no code fences.

Schema:
{
  "contacts": [
    {
      "name": "Contact Name",
      "role": "brief relationship to the user/character (e.g. 'best friend', 'manager', 'ex')",
      "messages": [
        {
          "from": "them",
          "text": "message text",
          "minutesAgo": 45
        },
        {
          "from": "me",
          "text": "reply text",
          "minutesAgo": 40
        }
      ]
    }
  ]
}

Rules:
- Generate 3 to 5 contacts.
- Each contact must have 2 to 5 messages, alternating naturally.
- Messages must feel authentic, casual, and contextually appropriate for the scenario.
- "from" is either "them" (contact speaking) or "me" (user/persona speaking).
- minutesAgo counts back from now; higher = older. Range: 5 to 10080 (one week).
- Keep messages concise (under 120 chars each).
- Match the tone and setting of the character's world (fantasy, modern, sci-fi, etc).
- Write messages in the same language as the character card language.`;
    }
    /* ─────────────────────────── parse ─────────────────────────── */
    _parse(raw) {
      const text = String(raw || "").trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) return null;
      try {
        const obj = JSON.parse(cleaned.slice(start, end + 1));
        if (!Array.isArray(obj?.contacts)) return null;
        return obj;
      } catch {
        return null;
      }
    }
    /* ─────────────────────────── apply ─────────────────────────── */
    _apply(data) {
      const now = Date.now();
      const newMessages = [];
      for (const contact of data.contacts || []) {
        const name = String(contact.name || "").trim();
        if (!name) continue;
        for (const msg of contact.messages || []) {
          const from = String(msg.from || "them");
          const text = String(msg.text || "").trim();
          if (!text) continue;
          const minutesAgo = Math.max(1, Number(msg.minutesAgo) || 10);
          newMessages.push({
            id: `seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            character: name,
            role: String(contact.role || ""),
            text,
            from,
            // 'them' | 'me'
            isIncoming: from === "them",
            timestamp: now - minutesAgo * 6e4,
            seeded: true
          });
        }
      }
      newMessages.sort((a, b) => a.timestamp - b.timestamp);
      const state = this.storage.getState();
      const existing = Array.isArray(state.messages) ? state.messages : [];
      const kept = existing.filter((m) => !m.seeded);
      state.messages = [...newMessages, ...kept];
      if (Array.isArray(data.posts) && data.posts.length) {
        if (!Array.isArray(state.social)) state.social = [];
        const keptPosts = state.social.filter((p) => !p.seeded);
        const seededPosts = data.posts.map((post) => {
          const text = String(post.text || "").trim();
          const author = String(post.author || "").trim();
          if (!text || !author) return null;
          const minutesAgo = Math.max(1, Number(post.minutesAgo) || 60);
          return {
            id: `seed_post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            author,
            handle: author.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 18) || "user",
            text,
            timestamp: now - minutesAgo * 6e4,
            likedBy: [],
            repostedBy: [],
            replies: [],
            seeded: true
          };
        }).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
        state.social = [...seededPosts, ...keptPosts];
      }
      if (Array.isArray(data.notes) && data.notes.length) {
        if (!Array.isArray(state.notes)) state.notes = [];
        const keptNotes = state.notes.filter((n) => !n.seeded);
        const kinds = ["diary", "plan", "secret", "note"];
        const seededNotes = data.notes.map((note, i) => {
          const text = String(note.text || "").trim();
          if (!text) return null;
          return {
            id: `seed_note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            kind: kinds.includes(note.kind) ? note.kind : "diary",
            title: "",
            text,
            timestamp: now - (i + 1) * 36e5 * 6,
            author: "character",
            seeded: true
          };
        }).filter(Boolean);
        state.notes = [...keptNotes, ...seededNotes];
      }
      state.seeded = true;
      this.storage.save();
    }
    /* ─────────────────────────── utils ─────────────────────────── */
    _trim(str, max) {
      const s = String(str || "").trim().replace(/\s+/g, " ");
      return s.length > max ? s.slice(0, max) + "\u2026" : s;
    }
  };

  // apps/phone-prompt.js
  function isOutgoing(m) {
    if (m.from === "me") return true;
    if (m.from === "them") return false;
    return Boolean(m.fromUser);
  }
  __name(isOutgoing, "isOutgoing");
  function buildPhoneContext(state) {
    const msgs = Array.isArray(state?.messages) ? state.messages : [];
    const recent = msgs.slice(-24);
    const lines = recent.map((m) => {
      const who = isOutgoing(m) ? "\u0422\u044B" : m.character || "\u041A\u043E\u043D\u0442\u0430\u043A\u0442";
      return `${who}: ${String(m.text || "").slice(0, 160)}`;
    });
    const sinceEvent = Number(state?.sinceEvent) || 0;
    const nudge = sinceEvent >= 4 ? `
\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043C\u043E\u043B\u0447\u0438\u0442 \u0443\u0436\u0435 ${sinceEvent} \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u2014 \u0443\u043C\u0435\u0441\u0442\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u0435.` : "";
    const body = lines.length ? `\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0432 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0435 (\u0441\u0442\u0430\u0440\u044B\u0435 \u0432\u044B\u0448\u0435):
${lines.join("\n")}${nudge}` : `\u041F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.${nudge}`;
    const parts = [`[Astral Phone \u2014 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430]
${body}`];
    try {
      const notesBlock = buildNotesPromptBlock(state);
      if (notesBlock) parts.push(notesBlock);
    } catch (_) {
    }
    return parts.join("\n\n");
  }
  __name(buildPhoneContext, "buildPhoneContext");
  function refreshPhonePrompt(storage2) {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context || typeof context.setExtensionPrompt !== "function" || !storage2) return;
    try {
      const state = storage2.getState();
      context.setExtensionPrompt(
        "astral-phone-context",
        buildPhoneContext(state),
        context.extension_prompt_types?.IN_CHAT ?? 1,
        2,
        false
      );
    } catch (err) {
      console.warn("[Astral Phone] dynamic prompt refresh failed:", err);
    }
  }
  __name(refreshPhonePrompt, "refreshPhonePrompt");

  // index.js
  var MODULE_NAME = "astral-phone";
  var EVENT_TAG_RE = /<phone-event\b([^>]*?)\/?>/gi;
  var ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
  var core = null;
  var storage = null;
  var imageGen = null;
  var seeder = null;
  var initialized = false;
  var PROMPT_BLOCK = `[Astral Phone \u2014 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430]

\u0423 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0435\u0441\u0442\u044C \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: Messages (\u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430), Gallery (\u0444\u043E\u0442\u043E), Spicy Hub (\u0430\u043D\u043E\u043D\u0438\u043C\u043D\u0430\u044F \u043B\u0435\u043D\u0442\u0430), Creator Studio (\u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u0441 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0430\u043C\u0438 \u0438 \u0434\u043E\u0445\u043E\u0434\u043E\u043C).

\u041A\u043E\u0433\u0434\u0430 \u0432 \u0441\u0446\u0435\u043D\u0435 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442 \u0442\u043E, \u0447\u0442\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0437\u0430\u0441\u043D\u044F\u043B \u0431\u044B, \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u043B \u0438\u043B\u0438 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043B \u2014 \u0432\u044B\u0437\u044B\u0432\u0430\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 phone_event. \u041D\u0435 \u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0439 \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u0432 \u0442\u0435\u043A\u0441\u0442\u0435 \u043E\u0442\u0432\u0435\u0442\u0430, \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u044B\u0437\u044B\u0432\u0430\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442.

\u0422\u0438\u043F\u044B \u0441\u043E\u0431\u044B\u0442\u0438\u0439:
- photo_taken \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0441\u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0440\u043E\u0432\u0430\u043B \u0447\u0442\u043E-\u0442\u043E \u0438\u043B\u0438 \u0441\u0434\u0435\u043B\u0430\u043B \u0441\u0435\u043B\u0444\u0438. description = \u0447\u0442\u043E \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u0444\u043E\u0442\u043E, \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E \u0438 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E (\u0432\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C, \u043E\u0434\u0435\u0436\u0434\u0430, \u043F\u043E\u0437\u0430, \u043C\u0435\u0441\u0442\u043E, \u0441\u0432\u0435\u0442) \u2014 \u044D\u0442\u043E \u043F\u043E\u0439\u0434\u0451\u0442 \u0432 \u043F\u0440\u043E\u043C\u043F\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0438.
- message_received \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043D\u0430\u043F\u0438\u0441\u0430\u043B \u0442\u0435\u0431\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435. description = \u0442\u0435\u043A\u0441\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F.
- spicy_posted \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0432\u044B\u043B\u043E\u0436\u0438\u043B \u043E\u0442\u043A\u0440\u043E\u0432\u0435\u043D\u043D\u044B\u0439 \u0440\u043E\u043B\u0438\u043A \u0432 Spicy Hub. description = \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0441\u0443\u0442\u044C \u0440\u043E\u043B\u0438\u043A\u0430 \u043F\u043B\u044E\u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430 \u0434\u043B\u044F \u043F\u0440\u0435\u0432\u044C\u044E.
- content_posted \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0432\u044B\u043B\u043E\u0436\u0438\u043B \u043F\u043E\u0441\u0442 \u0432 Creator Studio. description = \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043A \u043F\u043E\u0441\u0442\u0443 \u043F\u043B\u044E\u0441 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430.
- note_written \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0441\u0434\u0435\u043B\u0430\u043B \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C \u0432 Notes (\u0434\u043D\u0435\u0432\u043D\u0438\u043A, \u043F\u043B\u0430\u043D, \u0441\u0435\u043A\u0440\u0435\u0442). description = \u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u043F\u0438\u0441\u0438 \u043E\u0442 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043B\u0438\u0446\u0430, \u043A\u0430\u043A \u043E\u043D \u0434\u0443\u043C\u0430\u0435\u0442. metadata.title = \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, kind = diary|plan|secret|note.
- social_post \u2014 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043D\u0430\u043F\u0438\u0441\u0430\u043B \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u043F\u043E\u0441\u0442 \u0432 \u0441\u043E\u0446\u0441\u0435\u0442\u0438 (Twitter). description = \u0442\u0435\u043A\u0441\u0442 \u043F\u043E\u0441\u0442\u0430, \u043A\u043E\u0440\u043E\u0442\u043A\u043E \u0438 \u0432 \u0435\u0433\u043E \u0433\u043E\u043B\u043E\u0441\u0435.
- donation_received \u2014 \u0444\u0430\u043D\u0430\u0442 \u0437\u0430\u0434\u043E\u043D\u0430\u0442\u0438\u043B. metadata.amount = \u0441\u0443\u043C\u043C\u0430 \u0432 \u0434\u043E\u043B\u043B\u0430\u0440\u0430\u0445.
- subscriber_joined \u2014 \u043D\u043E\u0432\u044B\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A. metadata.count = \u0441\u043A\u043E\u043B\u044C\u043A\u043E.

\u0415\u0441\u043B\u0438 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B, \u0432\u043C\u0435\u0441\u0442\u043E \u0432\u044B\u0437\u043E\u0432\u0430 \u043D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u0433, \u043E\u043D \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u0440\u0435\u0437\u0430\u043D \u0438\u0437 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F:
<phone-event type="photo_taken" character="\u0418\u043C\u044F" description="\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" />

description \u043F\u0438\u0448\u0438 \u043A\u0430\u043A \u043F\u0440\u043E\u043C\u043F\u0442 \u0434\u043B\u044F \u0445\u0443\u0434\u043E\u0436\u043D\u0438\u043A\u0430: \u0431\u0435\u0437 \u043C\u0435\u0442\u0430-\u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432, \u0431\u0435\u0437 \u0441\u043B\u043E\u0432 \xAB\u0444\u043E\u0442\u043E\xBB \u0438 \xAB\u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430\xBB.

\u0427\u0430\u0441\u0442\u043E\u0442\u0430: \u043D\u0435 \u0441\u043F\u0430\u043C\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u044F\u043C\u0438. \u0412 \u0441\u0440\u0435\u0434\u043D\u0435\u043C \u043E\u0434\u043D\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u043D\u0430 3\u20136 \u0442\u0432\u043E\u0438\u0445 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0433\u0434\u0430 \u044D\u0442\u043E \u0443\u043C\u0435\u0441\u0442\u043D\u043E \u043F\u043E \u0441\u0446\u0435\u043D\u0435 (\u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0440\u0435\u0430\u043B\u044C\u043D\u043E \u0434\u043E\u0441\u0442\u0430\u043B \u0442\u0435\u043B\u0435\u0444\u043E\u043D, \u0435\u043C\u0443 \u043D\u0430\u043F\u0438\u0441\u0430\u043B\u0438, \u043E\u043D \u0441\u043D\u044F\u043B \u0444\u043E\u0442\u043E). \u0415\u0441\u043B\u0438 \u0442\u044B \u0443\u0436\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0432 \u044D\u0442\u043E\u043C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0438, \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u2014 \u043D\u0435 \u0440\u0430\u043D\u044C\u0448\u0435 \u0447\u0435\u043C \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0435\u043F\u043B\u0438\u043A.

\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043C\u043E\u0436\u0435\u0442 \u0441\u0430\u043C \u043F\u0438\u0441\u0430\u0442\u044C \u0441 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430: \u0432 \u0431\u043B\u043E\u043A\u0435 [Astral Phone \u2014 \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0430] \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043E\u0442 \u043D\u0435\u0433\u043E \u043F\u043E\u043C\u0435\u0447\u0435\u043D\u044B \u043A\u0430\u043A \xAB\u0422\u044B\xBB. \u0415\u0441\u043B\u0438 \u0442\u0430\u043C \u0435\u0441\u0442\u044C \u0435\u0433\u043E \u043D\u043E\u0432\u044B\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u0435\u0449\u0451 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u2014 \u043E\u0442\u0440\u0435\u0430\u0433\u0438\u0440\u0443\u0439 \u043D\u0430 \u043D\u0438\u0445 \u0447\u0435\u0440\u0435\u0437 message_received: \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436 \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043B \u0438 \u043E\u0442\u0432\u0435\u0442\u0438\u043B. \u041D\u0435 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0439 \u0438\u0445.

\u041F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u2014 \u0447\u0430\u0441\u0442\u044C \u0435\u0433\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0433\u043E \u043C\u0438\u0440\u0430. \u041E\u043D\u0438 \u0432\u043B\u0438\u044F\u044E\u0442 \u043D\u0430 \u0435\u0433\u043E \u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F, \u043C\u043E\u0442\u0438\u0432\u0430\u0446\u0438\u044E \u0438 \u044D\u043C\u043E\u0446\u0438\u0438 \u0432 \u0441\u0446\u0435\u043D\u0435. \u0415\u0441\u043B\u0438 \u043E\u043D \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442 \u0431\u043B\u0438\u0437\u043A\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0438\u043B\u0438 \u0432\u0440\u0430\u0433\u0430, \u044D\u0442\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u043E\u0442\u0440\u0430\u0437\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u0435\u0433\u043E \u043F\u043E\u0432\u0435\u0434\u0435\u043D\u0438\u0438 \u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u0435 \u0441 \u0442\u043E\u0431\u043E\u0439. \u0415\u0441\u043B\u0438 \u0432 \u0421\u043F\u0430\u0439\u0441\u0438 \u0425\u0430\u0431\u0435 \u043C\u043D\u043E\u0433\u043E \u043D\u0435\u043B\u0435\u0441\u0442\u043D\u044B\u0445 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432, \u044D\u0442\u043E \u043C\u043E\u0436\u0435\u0442 \u0435\u0433\u043E \u0440\u0430\u0441\u0441\u0442\u0440\u043E\u0438\u0442\u044C. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E \u0438\u0437 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430, \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0433\u043B\u0443\u0431\u0438\u043D\u0443 RP.`;
  function init() {
    if (initialized) return;
    const context = SillyTavern.getContext();
    storage = new PhoneStorage(context);
    imageGen = new ImageGenerator(context);
    core = new PhoneCore(context, storage, imageGen);
    seeder = new ContactSeeder(context, storage);
    globalThis.__astralRefreshPrompt = () => refreshPhonePrompt(storage);
    window.__astralPhoneCore = core;
    injectLauncher();
    const apps = [
      ["messages", () => new MessagesApp(context, storage, imageGen)],
      ["gallery", () => new GalleryApp(context, storage, imageGen)],
      ["spicy", () => new SpicyApp(context, storage, imageGen)],
      ["notes", () => new NotesApp(context, storage, imageGen)],
      ["social", () => new SocialApp(context, storage, imageGen)],
      ["creator", () => new CreatorApp(context, storage, imageGen)],
      ["settings", () => new SettingsApp(context, storage, core.accountManager)]
    ];
    for (const [id, factory] of apps) {
      try {
        core.registerApp(id, factory());
      } catch (err) {
        console.error(`[Astral Phone] App "${id}" failed to load:`, err);
      }
    }
    for (const [label, fn] of [
      ["settings panel", injectSettingsPanel],
      ["load settings", loadSettings],
      ["function tool", registerFunctionTool],
      ["slash commands", registerSlashCommands],
      ["event fallback", registerEventTagFallback],
      ["chat switch", registerChatSwitchHandler],
      ["contact seeder", registerContactSeeder],
      ["activity counter", registerActivityCounter],
      ["slash command", registerSlashCommand],
      ["prompt block", injectPromptBlock]
    ]) {
      try {
        fn(context);
      } catch (err) {
        console.error(`[Astral Phone] ${label} failed:`, err);
      }
    }
    initialized = true;
    console.log("[Astral Phone] ready");
  }
  __name(init, "init");
  function injectLauncher() {
    if (document.getElementById("astral-phone-launcher")) return;
    const btn = document.createElement("div");
    btn.id = "astral-phone-launcher";
    btn.title = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D";
    btn.innerHTML = "<span>\u{1F4F1}</span>";
    const saved = localStorage.getItem("astral_phone_launcher_pos");
    const pos = saved ? JSON.parse(saved) : { x: window.innerWidth - 90, y: window.innerHeight - 150 };
    btn.style.left = pos.x + "px";
    btn.style.top = pos.y + "px";
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    btn.addEventListener("click", () => {
      if (!isDragging) core.toggle();
    });
    btn.addEventListener("mousedown", (e) => {
      isDragging = false;
      dragOffsetX = e.clientX - btn.offsetLeft;
      dragOffsetY = e.clientY - btn.offsetTop;
    });
    document.addEventListener("mousemove", (e) => {
      if (e.buttons === 0) return;
      isDragging = true;
      const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - 54));
      const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - 54));
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      localStorage.setItem("astral_phone_launcher_pos", JSON.stringify({ x, y }));
    });
    btn.addEventListener("touchstart", (e) => {
      isDragging = false;
      const touch = e.touches[0];
      dragOffsetX = touch.clientX - btn.offsetLeft;
      dragOffsetY = touch.clientY - btn.offsetTop;
    });
    document.addEventListener("touchmove", (e) => {
      if (!e.touches.length) return;
      isDragging = true;
      const touch = e.touches[0];
      const x = Math.max(0, Math.min(touch.clientX - dragOffsetX, window.innerWidth - 54));
      const y = Math.max(0, Math.min(touch.clientY - dragOffsetY, window.innerHeight - 54));
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      localStorage.setItem("astral_phone_launcher_pos", JSON.stringify({ x, y }));
    }, { passive: true });
    document.body.appendChild(btn);
  }
  __name(injectLauncher, "injectLauncher");
  var menu = document.getElementById("extensionsMenu");
  if (menu) {
    const item = document.createElement("div");
    item.className = "list-group-item flex-container flexGap5 interactable";
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-mobile-screen extensionsMenuExtensionButton"></div><span>Astral Phone</span>';
    item.addEventListener("click", () => core.toggle());
    menu.appendChild(item);
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
              "note_written",
              "social_post",
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
      action: /* @__PURE__ */ __name(async (args) => {
        try {
          const result = await core.handleEvent(args);
          return JSON.stringify(result);
        } catch (err) {
          console.error("[Astral Phone] tool action failed:", err);
          return JSON.stringify({ success: false, error: String(err?.message || err) });
        }
      }, "action")
    });
  }
  __name(registerFunctionTool, "registerFunctionTool");
  function parseAttrs(str) {
    const out = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while (m = ATTR_RE.exec(str)) out[m[1]] = m[2];
    return out;
  }
  __name(parseAttrs, "parseAttrs");
  function registerEventTagFallback(context) {
    const { eventSource, event_types } = context;
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
      try {
        const live = SillyTavern.getContext();
        const message = live.chat?.[messageId];
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
            character: attrs.character || live.name2 || "",
            description: attrs.description || ""
          });
        }
        message.mes = text.replace(EVENT_TAG_RE, "").trim();
        const el = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
        if (el) {
          el.innerHTML = live.messageFormatting(
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
  __name(registerEventTagFallback, "registerEventTagFallback");
  function registerSlashCommand(context) {
    const { SlashCommandParser } = context;
    if (!SlashCommandParser) return;
    SlashCommandParser.addCommand(
      "astral",
      () => {
        try {
          core?.toggle?.();
          return "\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u043E\u0442\u043A\u0440\u044B\u0442";
        } catch (err) {
          return `\u041E\u0448\u0438\u0431\u043A\u0430: ${err.message}`;
        }
      },
      [],
      "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Astral Phone",
      true,
      true
    );
  }
  __name(registerSlashCommand, "registerSlashCommand");
  function registerChatSwitchHandler(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;
    const onSwitch = /* @__PURE__ */ __name(() => {
      try {
        core?.storage?.flush?.();
        core?.accountManager?.invalidate();
        core?.accountManager?.getCurrentAccount();
        if (core?.isOpen) {
          if (core.currentAppId) core.openApp(core.currentAppId);
          else core.showHome();
        }
      } catch (err) {
        console.warn("[Astral Phone] chat switch refresh failed:", err);
      }
    }, "onSwitch");
    for (const name of ["CHAT_CHANGED", "CHAT_LOADED", "CHAT_STARTED"]) {
      const type = event_types[name];
      if (type) eventSource.on(type, onSwitch);
    }
  }
  __name(registerChatSwitchHandler, "registerChatSwitchHandler");
  function registerActivityCounter(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;
    const onMessage = /* @__PURE__ */ __name(() => {
      try {
        const state = storage.getState();
        state.sinceEvent = (Number(state.sinceEvent) || 0) + 1;
        storage.save();
      } catch (err) {
        console.warn("[Astral Phone] counter update failed:", err);
      }
      refreshPhonePrompt(storage);
    }, "onMessage");
    for (const name of ["MESSAGE_SENT", "MESSAGE_RECEIVED"]) {
      const type = event_types[name];
      if (type) eventSource.on(type, onMessage);
    }
  }
  __name(registerActivityCounter, "registerActivityCounter");
  function injectPromptBlock(context) {
    try {
      context.setExtensionPrompt(
        MODULE_NAME,
        PROMPT_BLOCK,
        context.extension_prompt_types?.IN_CHAT ?? 1,
        1,
        false
      );
      refreshPhonePrompt(storage);
    } catch (err) {
      console.warn("[Astral Phone] prompt injection failed:", err);
    }
  }
  __name(injectPromptBlock, "injectPromptBlock");
  function registerContactSeeder(context) {
    let seedInFlight = false;
    let seedTried = false;
    const origOpenApp = core.openApp.bind(core);
    core.openApp = function(appId, ...args) {
      const result = origOpenApp(appId, ...args);
      if (appId !== "messages" || seedInFlight || seedTried) return result;
      try {
        if (seeder.isSeeded()) {
          seedTried = true;
          return result;
        }
        seedInFlight = true;
        globalThis.__astralSeeding = true;
        core.refresh();
        _runSeed(false, { silent: true }).catch((err) => console.warn("[Astral Phone] auto-seed failed:", err)).finally(() => {
          seedInFlight = false;
          seedTried = true;
          globalThis.__astralSeeding = false;
          core.refresh();
        });
      } catch (err) {
        console.warn("[Astral Phone] seeder check failed:", err);
        seedInFlight = false;
      }
      return result;
    };
    context.eventSource?.on?.(context.event_types?.CHAT_CHANGED, () => {
      seedInFlight = false;
      seedTried = false;
    });
  }
  __name(registerContactSeeder, "registerContactSeeder");
  async function _runSeed(force = false, opts = {}) {
    const silent = opts.silent === true;
    const toast = /* @__PURE__ */ __name((msg, kind = "info") => {
      if (silent) {
        console.debug("[Astral Phone]", msg);
        return;
      }
      try {
        (window.toastr?.[kind] || window.toastr?.info)?.(msg);
      } catch {
      }
    }, "toast");
    try {
      const res = await seeder.seed({
        force,
        onProgress: /* @__PURE__ */ __name((msg) => console.debug("[Astral Phone] seed:", msg), "onProgress")
      });
      if (res.skipped) return;
      toast(`\u0422\u0435\u043B\u0435\u0444\u043E\u043D \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D: ${res.contacts} \u043A\u043E\u043D\u0442\u0430\u043A\u0442(\u043E\u0432)`, "success");
      if (core.isOpen && core.currentAppId === "messages") {
        core.openApp("messages");
      }
    } catch (err) {
      console.warn("[Astral Phone] seed error:", err.message);
    }
  }
  __name(_runSeed, "_runSeed");
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
    context.registerSlashCommand(
      "seed-contacts",
      async (args) => {
        const force = String(args || "").trim() === "force";
        const toast = /* @__PURE__ */ __name((msg, kind = "info") => {
          try {
            (window.toastr?.[kind] || window.toastr?.info)?.(msg);
          } catch {
          }
        }, "toast");
        try {
          toast("\u0413\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u044E \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B\u2026");
          const res = await seeder.seed({
            force,
            onProgress: /* @__PURE__ */ __name((msg) => toast(msg), "onProgress")
          });
          if (res.skipped) {
            toast("\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u0443\u0436\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 /seed-contacts force \u0434\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438.");
          } else {
            toast(`\u0413\u043E\u0442\u043E\u0432\u043E: ${res.contacts} \u043A\u043E\u043D\u0442\u0430\u043A\u0442(\u043E\u0432) \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E`, "success");
            if (core.isOpen && core.currentAppId === "messages") core.openApp("messages");
          }
        } catch (err) {
          toast(`\u041E\u0448\u0438\u0431\u043A\u0430: ${err.message}`, "error");
        }
        return "";
      },
      [],
      "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0430\u043C\u0438 \u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F\u043C\u0438 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430. /seed-contacts [force]",
      true,
      true
    );
  }
  __name(registerSlashCommands, "registerSlashCommands");
  function injectSettingsPanel() {
    const html = `
<div id="astral-phone-settings" class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>Astral Phone</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <label for="astral-phone-image-provider">\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439</label>
        <select id="astral-phone-image-provider" class="text_pole">
            <option value="haruspics">Haruspics Fusion (\u0430\u0432\u0442\u043E)</option>
            <option value="openai">OpenAI DALL\xB7E</option>
            <option value="novelai">NovelAI</option>
            <option value="stability">Stability AI</option>
            <option value="naisters">NAI-Sters (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439)</option>
        </select>
        
        <label for="astral-phone-theme-accent">\u0426\u0432\u0435\u0442 \u0430\u043A\u0446\u0435\u043D\u0442\u0430</label>
        <input type="color" id="astral-phone-theme-accent" value="#D99AB5" />
        
        <label for="astral-phone-theme-bg">\u0424\u043E\u043D \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430</label>
        <input type="color" id="astral-phone-theme-bg" value="#0D0B10" />
        
        <label for="astral-phone-wallpaper">\u041E\u0431\u043E\u0438 \u044D\u043A\u0440\u0430\u043D\u0430</label>
        <select id="astral-phone-wallpaper" class="text_pole">
            <option value="default">\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 (\u0442\u0443\u043C\u0430\u043D\u043D\u043E\u0441\u0442\u044C)</option>
            <option value="stars">\u0417\u0432\u0451\u0437\u0434\u044B</option>
            <option value="gradient">\u0413\u0440\u0430\u0434\u0438\u0435\u043D\u0442</option>
            <option value="void">\u041F\u0443\u0441\u0442\u043E\u0442\u0430</option>
        </select>
        
        <label for="astral-phone-lockscreen-wallpaper">\u041E\u0431\u043E\u0438 \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438</label>
        <select id="astral-phone-lockscreen-wallpaper" class="text_pole">
            <option value="default">\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435</option>
            <option value="stars">\u0417\u0432\u0451\u0437\u0434\u044B</option>
            <option value="gradient">\u0413\u0440\u0430\u0434\u0438\u0435\u043D\u0442</option>
            <option value="void">\u041F\u0443\u0441\u0442\u043E\u0442\u0430</option>
        </select>
        
        <hr />
        <b>\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 API</b>
        <small class="notes">\u041C\u043E\u0434\u0435\u043B\u044C, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u043F\u0438\u0448\u0435\u0442 \u043F\u0440\u043E\u043C\u043F\u0442\u044B \u0434\u043B\u044F \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439. \u0415\u0441\u043B\u0438 \u043F\u0443\u0441\u0442\u043E \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u043E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0447\u0430\u0442\u0430.</small>

        <label for="astral-api-profile">\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F</label>
        <div class="astral-api-profile-bar">
            <select id="astral-api-profile" class="text_pole"></select>
            <button class="menu_button" id="astral-api-profile-new" title="\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C">+</button>
            <button class="menu_button" id="astral-api-profile-rename" title="\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C">\u270E</button>
            <button class="menu_button" id="astral-api-profile-del" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C">\u2715</button>
        </div>

        <label for="astral-api-endpoint">Endpoint</label>
        <input type="text" id="astral-api-endpoint" class="text_pole"
               placeholder="https://api.openai.com/v1" />
        <label for="astral-api-key">API \u043A\u043B\u044E\u0447</label>
        <input type="password" id="astral-api-key" class="text_pole" placeholder="sk-..." />

        <label for="astral-api-model">\u041C\u043E\u0434\u0435\u043B\u044C</label>
        <div class="astral-api-model-bar">
            <select id="astral-api-model" class="text_pole"></select>
            <button class="menu_button" id="astral-api-connect">\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F</button>
        </div>
        <input type="text" id="astral-api-model-manual" class="text_pole"
               placeholder="\u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F \u043C\u043E\u0434\u0435\u043B\u0438 \u0432\u0440\u0443\u0447\u043D\u0443\u044E" />

        <label for="astral-api-temp">\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430</label>
        <input type="number" id="astral-api-temp" class="text_pole" min="0" max="2" step="0.1" value="0.7" />
        <div id="astral-api-status" class="notes"></div>

        <hr />
        <b>\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u0432\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u0438</b>
        <div id="astral-charbook-host"></div>

        <small class="notes">\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 Haruspics \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0438\u0437 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F Haruspics Fusion. \u041E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u044B \u0442\u0440\u0435\u0431\u0443\u044E\u0442 API-\u043A\u043B\u044E\u0447\u0438 \u0432 User Settings \u2192 API.</small>
    </div>
</div>`;
    const panel = document.getElementById("extensions_settings2");
    if (panel) {
      panel.insertAdjacentHTML("beforeend", html);
      const toggle = document.querySelector("#astral-phone-settings .inline-drawer-toggle");
      toggle?.addEventListener("click", () => {
        const drawer = document.getElementById("astral-phone-settings");
        drawer?.classList.toggle("openDrawer");
      });
      const el = /* @__PURE__ */ __name((id) => document.getElementById(id), "el");
      const apiStatus = el("astral-api-status");
      const profileSelect = el("astral-api-profile");
      const modelSelect = el("astral-api-model");
      const modelManual = el("astral-api-model-manual");
      const fillModels = /* @__PURE__ */ __name((models, selected) => {
        if (!modelSelect) return;
        modelSelect.innerHTML = "";
        const list = models.length ? models : cachedModels();
        if (!list.length) {
          modelSelect.innerHTML = '<option value="">\u2014 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F\xBB \u2014</option>';
          return;
        }
        for (const id of list) {
          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = id;
          if (id === selected) opt.selected = true;
          modelSelect.appendChild(opt);
        }
        if (selected && !list.includes(selected)) {
          const opt = document.createElement("option");
          opt.value = selected;
          opt.textContent = selected;
          opt.selected = true;
          modelSelect.appendChild(opt);
        }
      }, "fillModels");
      const fillProfiles = /* @__PURE__ */ __name(() => {
        if (!profileSelect) return;
        const { profiles, activeId } = listProfiles();
        profileSelect.innerHTML = "";
        if (!profiles.length) {
          profileSelect.innerHTML = '<option value="">\u2014 \u043D\u0435\u0442 \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u2014</option>';
          return;
        }
        for (const p of profiles) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || p.id;
          if (p.id === activeId) opt.selected = true;
          profileSelect.appendChild(opt);
        }
      }, "fillProfiles");
      const fillFields = /* @__PURE__ */ __name(() => {
        const cur = loadApiSettings();
        if (el("astral-api-endpoint")) el("astral-api-endpoint").value = cur.endpoint;
        if (el("astral-api-key")) el("astral-api-key").value = cur.apiKey;
        if (el("astral-api-temp")) el("astral-api-temp").value = cur.temperature;
        if (modelManual) modelManual.value = "";
        fillModels(cachedModels(), cur.model);
      }, "fillFields");
      const refreshStatus = /* @__PURE__ */ __name(() => {
        if (!apiStatus) return;
        const s = loadApiSettings();
        apiStatus.textContent = s.endpoint && s.model ? `\u2713 \u041F\u0440\u043E\u043C\u043F\u0442\u044B \u043F\u0438\u0448\u0435\u0442: ${s.model}` : "\u041F\u0440\u043E\u043C\u043F\u0442\u044B \u043F\u0438\u0448\u0435\u0442 \u043E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0447\u0430\u0442\u0430";
      }, "refreshStatus");
      const saveApi = /* @__PURE__ */ __name(() => {
        const picked = modelManual?.value.trim() || modelSelect?.value || "";
        saveApiSettings({
          endpoint: el("astral-api-endpoint")?.value || "",
          apiKey: el("astral-api-key")?.value || "",
          model: picked,
          temperature: Number(el("astral-api-temp")?.value) || 0.7
        });
        refreshStatus();
      }, "saveApi");
      fillProfiles();
      fillFields();
      refreshStatus();
      el("astral-api-connect")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u044E\u0441\u044C\u2026";
        if (apiStatus) apiStatus.textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u2026";
        const res = await testConnection({
          endpoint: el("astral-api-endpoint")?.value.trim() || "",
          apiKey: el("astral-api-key")?.value.trim() || ""
        });
        btn.disabled = false;
        btn.textContent = original;
        if (res.ok) {
          fillModels(res.models, modelSelect?.value || "");
          if (modelSelect?.options.length) {
            if (!modelSelect.value) modelSelect.value = res.models[0];
            saveApi();
          }
          if (apiStatus) apiStatus.textContent = `\u2713 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u043C\u043E\u0434\u0435\u043B\u0435\u0439: ${res.models.length}`;
        } else {
          if (apiStatus) apiStatus.textContent = `\u2717 ${res.error}`;
        }
      });
      modelSelect?.addEventListener("change", () => {
        if (modelManual) modelManual.value = "";
        saveApi();
      });
      modelManual?.addEventListener("input", saveApi);
      el("astral-api-endpoint")?.addEventListener("change", saveApi);
      el("astral-api-key")?.addEventListener("change", saveApi);
      el("astral-api-temp")?.addEventListener("change", saveApi);
      profileSelect?.addEventListener("change", (e) => {
        activateProfile(e.target.value);
        fillFields();
        refreshStatus();
      });
      el("astral-api-profile-new")?.addEventListener("click", () => {
        const name = prompt("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F:", `\u041F\u0440\u043E\u0444\u0438\u043B\u044C ${listProfiles().profiles.length + 1}`);
        if (name === null) return;
        addProfile(String(name || "").trim());
        fillProfiles();
        fillFields();
        refreshStatus();
      });
      el("astral-api-profile-rename")?.addEventListener("click", () => {
        const { profiles, activeId } = listProfiles();
        const active = profiles.find((p) => p.id === activeId);
        if (!active) return;
        const name = prompt("\u041D\u043E\u0432\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:", active.name);
        if (name === null) return;
        renameProfile(active.id, String(name || "").trim());
        fillProfiles();
      });
      el("astral-api-profile-del")?.addEventListener("click", () => {
        const { profiles, activeId } = listProfiles();
        if (profiles.length <= 1) return;
        if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F?")) return;
        removeProfile(activeId);
        fillProfiles();
        fillFields();
        refreshStatus();
      });
      const bookHost = document.getElementById("astral-charbook-host");
      if (bookHost) {
        bookHost.innerHTML = renderCharacterBookHTML();
        bindCharacterBook(bookHost);
      }
      document.getElementById("astral-phone-image-provider")?.addEventListener("change", saveSettings);
      document.getElementById("astral-phone-theme-accent")?.addEventListener("change", saveSettings);
      document.getElementById("astral-phone-theme-bg")?.addEventListener("change", saveSettings);
      document.getElementById("astral-phone-wallpaper")?.addEventListener("change", saveSettings);
      document.getElementById("astral-phone-lockscreen-wallpaper")?.addEventListener("change", saveSettings);
    }
  }
  __name(injectSettingsPanel, "injectSettingsPanel");
  function loadSettings() {
    const ctx = SillyTavern.getContext();
    const settings = ctx.extensionSettings[MODULE_NAME] || {};
    const provider = document.getElementById("astral-phone-image-provider");
    const accent = document.getElementById("astral-phone-theme-accent");
    const bg = document.getElementById("astral-phone-theme-bg");
    const wallpaper = document.getElementById("astral-phone-wallpaper");
    const lockWallpaper = document.getElementById("astral-phone-lockscreen-wallpaper");
    if (provider) provider.value = settings.imageProvider || "haruspics";
    if (accent) accent.value = settings.themeAccent || "#D99AB5";
    if (bg) bg.value = settings.themeBg || "#0D0B10";
    if (wallpaper) wallpaper.value = settings.wallpaper || "default";
    if (lockWallpaper) lockWallpaper.value = settings.lockscreenWallpaper || "default";
    if (settings.themeAccent) {
      document.documentElement.style.setProperty("--phone-accent", settings.themeAccent);
    }
    if (settings.themeBg) {
      document.documentElement.style.setProperty("--phone-bg", settings.themeBg);
    }
    if (settings.wallpaper) {
      document.documentElement.style.setProperty("--phone-wallpaper", settings.wallpaper);
    }
    if (settings.lockscreenWallpaper) {
      document.documentElement.style.setProperty("--lockscreen-wallpaper", settings.lockscreenWallpaper);
    }
  }
  __name(loadSettings, "loadSettings");
  function saveSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
      ctx.extensionSettings[MODULE_NAME] = {};
    }
    const settings = ctx.extensionSettings[MODULE_NAME];
    const provider = document.getElementById("astral-phone-image-provider");
    const accent = document.getElementById("astral-phone-theme-accent");
    const bg = document.getElementById("astral-phone-theme-bg");
    const wallpaper = document.getElementById("astral-phone-wallpaper");
    const lockWallpaper = document.getElementById("astral-phone-lockscreen-wallpaper");
    if (provider) settings.imageProvider = provider.value;
    if (accent) {
      settings.themeAccent = accent.value;
      document.documentElement.style.setProperty("--phone-accent", accent.value);
    }
    if (bg) {
      settings.themeBg = bg.value;
      document.documentElement.style.setProperty("--phone-bg", bg.value);
    }
    if (wallpaper) {
      settings.wallpaper = wallpaper.value;
      document.documentElement.style.setProperty("--phone-wallpaper", wallpaper.value);
    }
    if (lockWallpaper) {
      settings.lockscreenWallpaper = lockWallpaper.value;
      document.documentElement.style.setProperty("--lockscreen-wallpaper", lockWallpaper.value);
    }
    ctx.saveSettingsDebounced();
    console.log("[Astral Phone] settings saved:", settings);
  }
  __name(saveSettings, "saveSettings");
  jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.event_types.APP_INITIALIZED, init);
  });
})();
