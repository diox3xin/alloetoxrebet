/**
 * Astral Phone — SillyTavern extension entry point.
 *
 * Лёгкая версия: модель сообщает о событиях телефона скрытым тегом
 * <phone-event .../> прямо в обычном ответе. Никаких function tools (они
 * заставляют ST делать второй запрос к модели), никаких фоновых таймеров и
 * скрытых генераций — телефон оживает за счёт основного ответа.
 */

import { PhoneCore } from './apps/phone-core.js';
import { PhoneStorage } from './apps/storage.js';
import { ImageGenerator } from './apps/image-gen.js';
import { MessagesApp } from './apps/messages.js';
import { GalleryApp } from './apps/gallery.js';
import { SettingsApp } from './apps/settings.js';
import { SocialApp } from './apps/social.js';
import { renderCharacterBookHTML, bindCharacterBook } from './apps/character-book.js';
import {
    loadApiSettings, saveApiSettings, isApiConfigured,
    listProfiles, addProfile, activateProfile, removeProfile, renameProfile,
    testConnection, cachedModels,
} from './apps/prompt-llm.js';
import { ContactSeeder } from './apps/contact-seeder.js';
import { refreshPhonePrompt, PHONE_RULES } from './apps/phone-prompt.js';
import { extractPhoneEvents, normaliseEvent } from './apps/event-parser.js';
import { analysisInterval, analyseCast, loadCast, setAnalysisInterval } from './apps/cast-profiles.js';
import { error as showError } from './apps/notifications.js';

const MODULE_NAME = 'astral-phone';

let core = null;
let storage = null;
let imageGen = null;
let seeder = null;
let initialized = false;

/* ────────────────────────────── init ────────────────────────────── */

function init() {
    if (initialized) return;
    const context = SillyTavern.getContext();

    storage = new PhoneStorage(context);
    imageGen = new ImageGenerator(context);

    core = new PhoneCore(context, storage, imageGen);
    seeder = new ContactSeeder(context, storage);

    // Exposed so apps (Messages composer, event handlers) can refresh the
    // dynamic prompt without importing back into index.js and creating a cycle.
    globalThis.__astralRefreshPrompt = () => refreshPhonePrompt(storage);
    globalThis.__astralSeeder = seeder;

    // Launcher first — the icon must appear even if an app fails to construct.
    window.__astralPhoneCore = core;
    injectLauncher();

    const apps = [
        ['messages', () => new MessagesApp(context, storage, imageGen)],
        ['social', () => new SocialApp(context, storage, imageGen)],
        ['gallery', () => new GalleryApp(context, storage, imageGen)],
        ['settings', () => new SettingsApp(context, storage, core.accountManager)],
    ];
    for (const [id, factory] of apps) {
        try {
            core.registerApp(id, factory());
        } catch (err) {
            console.error(`[Astral Phone] App "${id}" failed to load:`, err);
        }
    }

    // Убираем дубли, накопленные старой версией (сканер истории плодил их
    // при каждой смене чата).
    try { storage.compact(); } catch (err) { console.warn('[Astral Phone] compact failed:', err); }

    for (const [label, fn] of [
        ['settings panel', injectSettingsPanel],
        ['load settings', loadSettings],
        ['slash commands', registerSlashCommands],
        ['event tags', registerEventTagFallback],
        ['chat switch', registerChatSwitchHandler],
        ['contact seeder', registerContactSeeder],
        ['activity counter', registerActivityCounter],
        ['slash command', registerSlashCommand],
        ['prompt block', injectPromptBlock],
    ]) {
        try {
            fn(context);
        } catch (err) {
            console.error(`[Astral Phone] ${label} failed:`, err);
        }
    }

    initialized = true;
    console.log('[Astral Phone] ready');
}

/* ────────────────────────────── launcher button ────────────────────────────── */

function injectLauncher() {
    if (document.getElementById('astral-phone-launcher')) return;

    const btn = document.createElement('div');
    btn.id = 'astral-phone-launcher';
    btn.title = 'Открыть телефон';
    btn.innerHTML = '<span>📱</span>';

    let pos = null;
    try { pos = JSON.parse(localStorage.getItem('astral_phone_launcher_pos') || 'null'); } catch { /* ignore */ }
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        pos = { x: window.innerWidth - 90, y: window.innerHeight - 150 };
    }
    const clamp = (x, y) => ({
        x: Math.max(0, Math.min(x, window.innerWidth - 54)),
        y: Math.max(0, Math.min(y, window.innerHeight - 54)),
    });
    pos = clamp(pos.x, pos.y);
    btn.style.left = pos.x + 'px';
    btn.style.top = pos.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';

    // Перетаскивание только когда палец/мышь зажаты НА кнопке. Раньше
    // слушатель mousemove висел на всём документе и двигал кнопку при любом
    // выделении текста в таверне, плюс писал localStorage на каждый пиксель.
    let drag = null;
    let moved = false;

    btn.addEventListener('pointerdown', (e) => {
        drag = { dx: e.clientX - btn.offsetLeft, dy: e.clientY - btn.offsetTop, sx: e.clientX, sy: e.clientY };
        moved = false;
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    btn.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        moved = true;
        const p = clamp(e.clientX - drag.dx, e.clientY - drag.dy);
        btn.style.left = p.x + 'px';
        btn.style.top = p.y + 'px';
    });
    const end = () => {
        if (!drag) return;
        drag = null;
        if (moved) {
            try {
                localStorage.setItem('astral_phone_launcher_pos', JSON.stringify({
                    x: btn.offsetLeft, y: btn.offsetTop,
                }));
            } catch { /* ignore */ }
        }
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', () => {
        if (!moved) core.toggle();
        moved = false;
    });

    document.body.appendChild(btn);
}

// Register menu item
const menu = document.getElementById('extensionsMenu');
if (menu) {
    const item = document.createElement('div');
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-mobile-screen extensionsMenuExtensionButton"></div><span>Astral Phone</span>';
    item.addEventListener('click', () => core?.toggle());
    menu.appendChild(item);
}

/* ──────────── event tags ──────────── */


/**
 * Найти сообщение в чате по id.
 *
 * `messageId` в MESSAGE_RECEIVED — это индекс в `context.chat`, но не
 * всегда: ST местами отдаёт id другого вида. Поэтому ищем сначала по
 * индексу, потом по совпадению `message_uid`/id, потом — по последнему
 * сообщению, если в чате всего одно с тегом.
 */
function findMessage(live, messageId) {
    const chat = Array.isArray(live?.chat) ? live.chat : [];

    if (Number.isInteger(messageId) && chat[messageId]) return chat[messageId];

    if (messageId !== undefined && messageId !== null) {
        const asString = String(messageId);
        const byUid = chat.find(m => m && (m.message_uid === messageId || m.id === messageId || String(m.id) === asString));
        if (byUid) return byUid;
    }

    // Запасной путь: сообщение могло не успеть лечь в chat по индексу —
    // берём последнее сообщение, если в нём есть наш тег.
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (m && !m.is_user && typeof m.mes === 'string' && m.mes.includes('<phone-event')) return m;
    }

    return null;
}

/** Ключ события: «номер сообщения:свайп:порядковый номер тега». */
function eventKey(idx, message, n) {
    return `${idx}:${Number(message?.swipe_id) || 0}:${n}`;
}

function registerEventTagFallback(context) {
    const { eventSource, event_types } = context;

    /**
     * Забрать события из сообщения и вырезать теги из текста.
     * Повторно одно и то же событие не добавляется: ключи хранятся в
     * состоянии чата, так что перезагрузка страницы дублей тоже не даст.
     * @returns {number} сколько событий отправлено в телефон
     */
    const handleMessage = (message, messageId) => {
        if (!message || message.is_user || message.is_system) return 0;

        const text = message.mes || '';
        if (!text.toLowerCase().includes('<phone-event')) return 0;

        const live = SillyTavern.getContext();
        const chat = Array.isArray(live?.chat) ? live.chat : [];
        const idx = Number.isInteger(Number(messageId)) && chat[Number(messageId)] === message
            ? Number(messageId)
            : chat.indexOf(message);

        const { events, text: cleanText } = extractPhoneEvents(text);

        const state = storage.getState();
        if (!Array.isArray(state.seenEvents)) state.seenEvents = [];
        const seen = new Set(state.seenEvents);

        let added = 0;
        events.forEach((event, n) => {
            const key = eventKey(idx, message, n);
            if (seen.has(key)) return;
            state.seenEvents.push(key);
            seen.add(key);

            const payload = normaliseEvent({
                ...event,
                character: event.character || live.name2 || '',
            });
            payload.src = key;
            core.handleEvent(payload);
            added++;
        });
        if (state.seenEvents.length > 400) state.seenEvents = state.seenEvents.slice(-400);

        // Тег не должен оставаться в сообщении — иначе он виден в чате и
        // зря ест токены в истории. Оригинал в message.swipes не трогаем:
        // при возврате на этот свайп события восстановятся.
        if (cleanText !== text) {
            message.mes = cleanText;
            const el = idx >= 0 ? document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`) : null;
            if (el && typeof live.messageFormatting === 'function') {
                el.innerHTML = live.messageFormatting(message.mes, message.name, message.is_system, message.is_user, idx);
            }
        }

        return added;
    };

    const safe = (fn) => (...args) => {
        try { fn(...args); } catch (err) { console.warn('[Astral Phone] event tag handler error:', err); }
    };

    const onMessage = safe((messageId) => {
        const live = SillyTavern.getContext();
        handleMessage(findMessage(live, messageId), messageId);
    });

    // Свайп: события из прошлого варианта ответа больше не «случились».
    const onSwiped = safe((messageId) => {
        const live = SillyTavern.getContext();
        const idx = Number(messageId);
        if (!Number.isInteger(idx)) return;
        const removed = core.removeEventsFrom(`${idx}:`);
        const state = storage.getState();
        state.seenEvents = (state.seenEvents || []).filter(k => !k.startsWith(`${idx}:`));
        if (removed) refreshPhonePrompt(storage);
        // На уже готовом свайпе теги лежат в тексте — разбираем сразу.
        handleMessage(live.chat?.[idx], idx);
    });

    const onChatLoaded = safe(() => {
        const live = SillyTavern.getContext();
        const chat = Array.isArray(live?.chat) ? live.chat : [];
        for (let i = Math.max(0, chat.length - 3); i < chat.length; i++) handleMessage(chat[i], i);
    });

    const on = (name, fn) => { const t = event_types?.[name]; if (t) eventSource.on(t, fn); };
    on('MESSAGE_RECEIVED', onMessage);
    on('CHARACTER_MESSAGE_RENDERED', onMessage);
    on('MESSAGE_UPDATED', onMessage);
    on('MESSAGE_SWIPED', onSwiped);
    on('CHAT_CHANGED', onChatLoaded);
}

/* ────────────────────────────── slash command ────────────────────────────── */

function registerSlashCommand(context) {
    const { SlashCommandParser } = context;
    if (!SlashCommandParser) return;

    SlashCommandParser.addCommand(
        'astral',
        () => {
            try {
                core?.toggle?.();
                return 'Телефон открыт';
            } catch (err) {
                return `Ошибка: ${err.message}`;
            }
        },
        [],
        'Открыть Astral Phone',
        true,
        true
    );
}

/* ────────────────────────────── chat switch ────────────────────────────── */

/**
 * ST подменяет chat_metadata при смене чата. Перерисовываем телефон под
 * новый чат — один раз на чат, а не на каждое из трёх событий смены.
 */
function registerChatSwitchHandler(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;

    let lastChat = null;

    const onSwitch = () => {
        try {
            const id = storage?.chatId?.();
            if (id && id === lastChat) return;
            lastChat = id;

            core?.storage?.flush?.();
            core?.accountManager?.invalidate();
            core?.accountManager?.getCurrentAccount();
            try { storage.compact(); } catch { /* ignore */ }

            if (core?.isOpen) {
                if (core.currentAppId) core.openApp(core.currentAppId);
                else core.showHome();
            }
            refreshPhonePrompt(storage);
        } catch (err) {
            console.warn('[Astral Phone] chat switch refresh failed:', err);
        }
    };

    const type = event_types.CHAT_CHANGED;
    if (type) eventSource.on(type, onSwitch);
}

/* ────────────────────────────── phone activity counter ────────────────────────────── */

/**
 * Считает ответы модели с последнего события телефона. Счётчик живёт в
 * состоянии чата, но отдельно не сохраняется: ST сам пишет chat_metadata
 * вместе с чатом после каждого сообщения, лишняя перезапись файла не нужна.
 */
function registerActivityCounter(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;

    let castRunning = false;

    // Анкеты НПС — отдельный запрос к модели, поэтому только если включено
    // вручную (по умолчанию интервал 0).
    const maybeAnalyseCast = () => {
        if (castRunning || analysisInterval() === 0) return;
        castRunning = true;
        setTimeout(() => {
            analyseCast(context, storage, { silent: true })
                .then(result => { if (result.updated) refreshPhonePrompt(storage); })
                .catch(err => console.warn('[Astral Phone] cast analysis failed:', err?.message || err))
                .finally(() => { castRunning = false; });
        }, 1500);
    };

    const onReceived = () => {
        try {
            const state = storage.getState();
            state.sinceEvent = (Number(state.sinceEvent) || 0) + 1;
        } catch { /* ignore */ }
        refreshPhonePrompt(storage);
        maybeAnalyseCast();
    };

    const type = event_types.MESSAGE_RECEIVED;
    if (type) eventSource.on(type, onReceived);
}

function injectPromptBlock(context) {
    try {
        // Статичные правила — в системную часть промпта (не двигаются по
        // чату, хорошо кэшируются). Динамика — отдельным коротким блоком.
        context.setExtensionPrompt(
            MODULE_NAME,
            PHONE_RULES,
            context.extension_prompt_types?.IN_PROMPT ?? 0,
            0,
            false,
        );
        refreshPhonePrompt(storage);
    } catch (err) {
        console.warn('[Astral Phone] prompt injection failed:', err);
    }
}

/* ────────────────────────────── contact seeder ────────────────────────────── */

/**
 * Auto-seed contacts on first phone open (non-blocking, runs in background).
 * Also wires up /seed-contacts slash command for manual trigger.
 */
function registerContactSeeder(context) {
    /**
     * Автосид запускается ТОЛЬКО при открытии приложения Messages.
     *
     * Раньше он висел на CHAT_CHANGED — событие стреляет и вне телефона, прямо
     * на главном экране SillyTavern, поэтому генерация стартовала, пока
     * пользователь ещё не собирался ничего открывать, и подвешивала чат.
     * Теперь сигнал подаёт сам пользователь: зашёл в переписки — телефон
     * дозаполняется; не зашёл — ничего не происходит.
     */
    // Одна попытка на чат: openApp зовётся повторно из refresh() после каждого
    // события, и без этого флага неудачный сид повторялся бы бесконечно.
    let seedInFlight = false;
    let seedTried = false;

    const origOpenApp = core.openApp.bind(core);
    core.openApp = function (appId, ...args) {
        const result = origOpenApp(appId, ...args);

        if (appId !== 'messages' || seedInFlight || seedTried) return result;

        try {
            if (seeder.isSeeded()) {
                seedTried = true;
                return result;
            }

            seedInFlight = true;
            globalThis.__astralSeeding = true;
            core.refresh();

            // не блокируем открытие: рендер уже произошёл, сид идёт фоном
            _runSeed(false, { silent: false })
                .catch(err => {
                    console.warn('[Astral Phone] auto-seed failed:', err);
                    // Показываем ошибку пользователю
                    const msg = String(err?.message || err || '');
                    if (!msg.includes('skipped')) {
                        showError(`Не удалось сгенерировать переписку: ${msg}`);
                    }
                })
                .finally(() => {
                    seedInFlight = false;
                    seedTried = true;
                    globalThis.__astralSeeding = false;
                    core.refresh();
                });
        } catch (err) {
            console.warn('[Astral Phone] seeder check failed:', err);
            seedInFlight = false;
        }

        return result;
    };

    // При смене чата счётчик сбрасывается — у каждого чата свой телефон
    context.eventSource?.on?.(context.event_types?.CHAT_CHANGED, () => {
        seedInFlight = false;
        seedTried = false;
    });
}

async function _runSeed(force = false, opts = {}) {
    const silent = opts.silent === true;
    const toast = (msg, kind = 'info') => {
        if (silent) {
            console.debug('[Astral Phone]', msg);
            return;
        }
        try { (window.toastr?.[kind] || window.toastr?.info)?.(msg); } catch {}
    };

    try {
        const res = await seeder.seed({
            force,
            onProgress: (msg) => console.debug('[Astral Phone] seed:', msg),
        });

        if (res.skipped) return;

        toast(`Телефон заполнен: ${res.contacts} контакт(ов)`, 'success');

        // Refresh messages if open
        if (core.isOpen && core.currentAppId === 'messages') {
            core.openApp('messages');
        }
    } catch (err) {
        console.warn('[Astral Phone] seed error:', err.message);
        // Don't toast errors from auto-seed to avoid noise; manual command will surface them
    }
}

/* ────────────────────────────── slash commands ────────────────────────────── */

function registerSlashCommands(context) {
    if (typeof context.registerSlashCommand !== 'function') return;

    context.registerSlashCommand(
        'phone',
        async (args) => {
            const arg = String(args || '').trim();

            if (!arg || arg === 'open') {
                core.open();
                return '';
            }
            if (arg === 'close') {
                core.close();
                return '';
            }
            if (arg === 'reset') {
                storage.reset();
                if (window.toastr) toastr.success('Телефон очищен');
                return '';
            }
            if (arg.startsWith('event ')) {
                try {
                    const data = JSON.parse(arg.slice(6));
                    const res = await core.handleEvent(data);
                    return JSON.stringify(res);
                } catch (err) {
                    if (window.toastr) toastr.error(`Неверный JSON: ${err.message}`);
                    return '';
                }
            }
            return '';
        },
        [],
        'Открыть телефон персонажа. /phone open | close | reset | event {"type":"photo_taken",...}',
        true,
        true,
    );

    context.registerSlashCommand(
        'seed-contacts',
        async (args) => {
            const force = String(args || '').trim() === 'force';
            const toast = (msg, kind = 'info') => {
                try { (window.toastr?.[kind] || window.toastr?.info)?.(msg); } catch {}
            };
            try {
                toast('Генерирую контакты…');
                const res = await seeder.seed({
                    force,
                    onProgress: (msg) => toast(msg),
                });
                if (res.skipped) {
                    toast('Контакты уже сгенерированы. Используй /seed-contacts force для повторной генерации.');
                } else {
                    toast(`Готово: ${res.contacts} контакт(ов) добавлено`, 'success');
                    if (core.isOpen && core.currentAppId === 'messages') core.openApp('messages');
                }
            } catch (err) {
                toast(`Ошибка: ${err.message}`, 'error');
            }
            return '';
        },
        [],
        'Заполнить телефон контактами и сообщениями на основе персонажа. /seed-contacts [force]',
        true,
        true,
    );
}

/* ────────────────────────────── settings panel ────────────────────────────── */

function injectSettingsPanel() {
    const html = `
<div id="astral-phone-settings" class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>Astral Phone</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <label for="astral-phone-image-provider">Провайдер изображений</label>
        <select id="astral-phone-image-provider" class="text_pole">
            <option value="haruspics">Haruspics Fusion (авто)</option>
            <option value="openai">OpenAI DALL·E</option>
            <option value="novelai">NovelAI</option>
            <option value="stability">Stability AI</option>
            <option value="naisters">NAI-Sters (локальный)</option>
        </select>
        
        <label for="astral-phone-theme-accent">Цвет акцента</label>
        <input type="color" id="astral-phone-theme-accent" value="#D99AB5" />
        
        <label for="astral-phone-theme-bg">Фон телефона</label>
        <input type="color" id="astral-phone-theme-bg" value="#0D0B10" />
        
        <label for="astral-phone-wallpaper">Обои экрана</label>
        <select id="astral-phone-wallpaper" class="text_pole">
            <option value="default">Стандартные (туманность)</option>
            <option value="stars">Звёзды</option>
            <option value="gradient">Градиент</option>
            <option value="void">Пустота</option>
        </select>
        
        <label for="astral-phone-lockscreen-wallpaper">Обои блокировки</label>
        <select id="astral-phone-lockscreen-wallpaper" class="text_pole">
            <option value="default">Стандартные</option>
            <option value="stars">Звёзды</option>
            <option value="gradient">Градиент</option>
            <option value="void">Пустота</option>
        </select>
        
        <hr />
        <b>Настройки API</b>
        <small class="notes">Модель, которая пишет промпты для изображений. Если пусто — используется основная модель чата.</small>

        <label for="astral-api-profile">Профиль подключения</label>
        <div class="astral-api-profile-bar">
            <select id="astral-api-profile" class="text_pole"></select>
            <button class="menu_button" id="astral-api-profile-new" title="Новый профиль">+</button>
            <button class="menu_button" id="astral-api-profile-rename" title="Переименовать">✎</button>
            <button class="menu_button" id="astral-api-profile-del" title="Удалить">✕</button>
        </div>

        <label for="astral-api-endpoint">Endpoint</label>
        <input type="text" id="astral-api-endpoint" class="text_pole"
               placeholder="https://api.openai.com/v1" />
        <label for="astral-api-key">API ключ</label>
        <input type="password" id="astral-api-key" class="text_pole" placeholder="sk-..." />

        <label for="astral-api-model">Модель</label>
        <div class="astral-api-model-bar">
            <select id="astral-api-model" class="text_pole"></select>
            <button class="menu_button" id="astral-api-connect">Подключиться</button>
        </div>
        <input type="text" id="astral-api-model-manual" class="text_pole"
               placeholder="или введите имя модели вручную" />

        <label for="astral-api-temp">Температура</label>
        <input type="number" id="astral-api-temp" class="text_pole" min="0" max="2" step="0.1" value="0.7" />
        <div id="astral-api-status" class="notes"></div>

        <hr />
        <b>Живой мир</b>
        <small class="notes">Как часто НПС сами пишут, постят и реагируют. Работает внутри обычного ответа модели — без лишних запросов.</small>
        <label for="astral-liveliness">Активность НПС</label>
        <select id="astral-liveliness" class="text_pole">
            <option value="calm">Спокойно — телефон оживает редко</option>
            <option value="normal">Обычно</option>
            <option value="busy">Насыщенно — мир шумит</option>
        </select>
        <label class="checkbox_label" for="astral-auto-images">
            <input type="checkbox" id="astral-auto-images" />
            <span>Сразу рисовать фото к постам и снимкам</span>
        </label>
        <small class="notes">Если выключено — фото появится заглушкой, нарисуешь по нажатию.</small>

        <hr />
        <b>Анкеты персонажей</b>
        <small class="notes">Отдельный запрос к модели: перечитывает сцену и обновляет короткие карточки НПС. Тратит токены — по умолчанию выключено (0).</small>
        <label for="astral-cast-interval">Анализировать каждые N сообщений</label>
        <input type="number" id="astral-cast-interval" class="text_pole" min="0" max="50" step="1" value="0" />
        <div id="astral-cast-status" class="notes"></div>

        <hr />
        <b>Справочник внешности</b>
        <div id="astral-charbook-host"></div>

        <small class="notes">Провайдер Haruspics использует настройки из расширения Haruspics Fusion. Остальные провайдеры требуют API-ключи в User Settings → API.</small>
    </div>
</div>`;

    const panel = document.getElementById('extensions_settings2');
    if (panel) {
        panel.insertAdjacentHTML('beforeend', html);
        
        // Toggle drawer
        const toggle = document.querySelector('#astral-phone-settings .inline-drawer-toggle');
        toggle?.addEventListener('click', () => {
            const drawer = document.getElementById('astral-phone-settings');
            drawer?.classList.toggle('openDrawer');
        });
        
        // ── API settings for prompt model ──
        const el = (id) => document.getElementById(id);
        const apiStatus = el('astral-api-status');
        const profileSelect = el('astral-api-profile');
        const modelSelect = el('astral-api-model');
        const modelManual = el('astral-api-model-manual');

        const fillModels = (models, selected) => {
            if (!modelSelect) return;
            modelSelect.innerHTML = '';
            const list = models.length ? models : cachedModels();
            if (!list.length) {
                modelSelect.innerHTML = '<option value="">— нажмите «Подключиться» —</option>';
                return;
            }
            for (const id of list) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id;
                if (id === selected) opt.selected = true;
                modelSelect.appendChild(opt);
            }
            if (selected && !list.includes(selected)) {
                const opt = document.createElement('option');
                opt.value = selected;
                opt.textContent = selected;
                opt.selected = true;
                modelSelect.appendChild(opt);
            }
        };

        const fillProfiles = () => {
            if (!profileSelect) return;
            const { profiles, activeId } = listProfiles();
            profileSelect.innerHTML = '';
            if (!profiles.length) {
                profileSelect.innerHTML = '<option value="">— нет профилей —</option>';
                return;
            }
            for (const p of profiles) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                if (p.id === activeId) opt.selected = true;
                profileSelect.appendChild(opt);
            }
        };

        const fillFields = () => {
            const cur = loadApiSettings();
            if (el('astral-api-endpoint')) el('astral-api-endpoint').value = cur.endpoint;
            if (el('astral-api-key')) el('astral-api-key').value = cur.apiKey;
            if (el('astral-api-temp')) el('astral-api-temp').value = cur.temperature;
            if (modelManual) modelManual.value = '';
            fillModels(cachedModels(), cur.model);
        };

        const refreshStatus = () => {
            if (!apiStatus) return;
            const s = loadApiSettings();
            apiStatus.textContent = (s.endpoint && s.model)
                ? `✓ Промпты пишет: ${s.model}`
                : 'Промпты пишет основная модель чата';
        };

        const saveApi = () => {
            const picked = modelManual?.value.trim() || modelSelect?.value || '';
            saveApiSettings({
                endpoint: el('astral-api-endpoint')?.value || '',
                apiKey: el('astral-api-key')?.value || '',
                model: picked,
                temperature: Number(el('astral-api-temp')?.value) || 0.7,
            });
            refreshStatus();
        };

        fillProfiles();
        fillFields();
        refreshStatus();

        // подключение: получаем список моделей у провайдера
        el('astral-api-connect')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Подключаюсь…';
            if (apiStatus) apiStatus.textContent = 'Проверяю подключение…';

            const res = await testConnection({
                endpoint: el('astral-api-endpoint')?.value.trim() || '',
                apiKey: el('astral-api-key')?.value.trim() || '',
            });

            btn.disabled = false;
            btn.textContent = original;

            if (res.ok) {
                fillModels(res.models, modelSelect?.value || '');
                if (modelSelect?.options.length) {
                    // сразу выбираем первую модель, чтобы не заставлять вписывать вручную
                    if (!modelSelect.value) modelSelect.value = res.models[0];
                    saveApi();
                }
                if (apiStatus) apiStatus.textContent = `✓ Подключено, моделей: ${res.models.length}`;
            } else {
                if (apiStatus) apiStatus.textContent = `✗ ${res.error}`;
            }
        });

        modelSelect?.addEventListener('change', () => {
            if (modelManual) modelManual.value = '';
            saveApi();
        });
        modelManual?.addEventListener('input', saveApi);
        el('astral-api-endpoint')?.addEventListener('change', saveApi);
        el('astral-api-key')?.addEventListener('change', saveApi);
        el('astral-api-temp')?.addEventListener('change', saveApi);

        // профили
        profileSelect?.addEventListener('change', (e) => {
            activateProfile(e.target.value);
            fillFields();
            refreshStatus();
        });

        el('astral-api-profile-new')?.addEventListener('click', () => {
            const name = prompt('Название профиля:', `Профиль ${listProfiles().profiles.length + 1}`);
            if (name === null) return;
            addProfile(String(name || '').trim());
            fillProfiles();
            fillFields();
            refreshStatus();
        });

        el('astral-api-profile-rename')?.addEventListener('click', () => {
            const { profiles, activeId } = listProfiles();
            const active = profiles.find(p => p.id === activeId);
            if (!active) return;
            const name = prompt('Новое название:', active.name);
            if (name === null) return;
            renameProfile(active.id, String(name || '').trim());
            fillProfiles();
        });

        el('astral-api-profile-del')?.addEventListener('click', () => {
            const { profiles, activeId } = listProfiles();
            if (profiles.length <= 1) return;
            if (!confirm('Удалить профиль подключения?')) return;
            removeProfile(activeId);
            fillProfiles();
            fillFields();
            refreshStatus();
        });

        // ── анкеты персонажей ──
        const castInterval = document.getElementById('astral-cast-interval');
        const castStatus = document.getElementById('astral-cast-status');

        const refreshCastStatus = () => {
            if (!castStatus) return;
            const cast = loadCast(storage);
            const names = Object.keys(cast);
            const n = analysisInterval();
            castStatus.textContent = n === 0
                ? 'Анализ выключен'
                : `Каждые ${n} сообщений · карточек: ${names.length}${names.length ? ` (${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''})` : ''}`;
        };

        if (castInterval) castInterval.value = analysisInterval();
        refreshCastStatus();

        castInterval?.addEventListener('change', () => {
            setAnalysisInterval(Number(castInterval.value) || 0);
            refreshCastStatus();
        });

        // Character book editor
        const bookHost = document.getElementById('astral-charbook-host');
        if (bookHost) {
            bookHost.innerHTML = renderCharacterBookHTML();
            bindCharacterBook(bookHost);
        }

        // Save on change
        document.getElementById('astral-phone-image-provider')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-theme-accent')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-theme-bg')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-wallpaper')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-lockscreen-wallpaper')?.addEventListener('change', saveSettings);
        document.getElementById('astral-liveliness')?.addEventListener('change', () => {
            saveSettings();
            refreshPhonePrompt(storage);
        });
        document.getElementById('astral-auto-images')?.addEventListener('change', saveSettings);
    }
}

function loadSettings() {
    const ctx = SillyTavern.getContext();
    const settings = ctx.extensionSettings[MODULE_NAME] || {};
    
    const provider = document.getElementById('astral-phone-image-provider');
    const accent = document.getElementById('astral-phone-theme-accent');
    const bg = document.getElementById('astral-phone-theme-bg');
    const wallpaper = document.getElementById('astral-phone-wallpaper');
    const lockWallpaper = document.getElementById('astral-phone-lockscreen-wallpaper');
    
    if (provider) provider.value = settings.imageProvider || 'haruspics';
    if (accent) accent.value = settings.themeAccent || '#D99AB5';
    if (bg) bg.value = settings.themeBg || '#0D0B10';
    if (wallpaper) wallpaper.value = settings.wallpaper || 'default';
    if (lockWallpaper) lockWallpaper.value = settings.lockscreenWallpaper || 'default';
    const liveliness = document.getElementById('astral-liveliness');
    const autoImages = document.getElementById('astral-auto-images');
    if (liveliness) liveliness.value = settings.liveliness || 'normal';
    if (autoImages) autoImages.checked = settings.autoImages !== false;

    // Apply theme
    if (settings.themeAccent) {
        document.documentElement.style.setProperty('--phone-accent', settings.themeAccent);
    }
    if (settings.themeBg) {
        document.documentElement.style.setProperty('--phone-bg', settings.themeBg);
    }
    if (settings.wallpaper) {
        document.documentElement.style.setProperty('--phone-wallpaper', settings.wallpaper);
    }
    if (settings.lockscreenWallpaper) {
        document.documentElement.style.setProperty('--lockscreen-wallpaper', settings.lockscreenWallpaper);
    }
}

function saveSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = {};
    }
    
    const settings = ctx.extensionSettings[MODULE_NAME];
    const provider = document.getElementById('astral-phone-image-provider');
    const accent = document.getElementById('astral-phone-theme-accent');
    const bg = document.getElementById('astral-phone-theme-bg');
    const wallpaper = document.getElementById('astral-phone-wallpaper');
    const lockWallpaper = document.getElementById('astral-phone-lockscreen-wallpaper');
    
    if (provider) settings.imageProvider = provider.value;
    if (accent) {
        settings.themeAccent = accent.value;
        document.documentElement.style.setProperty('--phone-accent', accent.value);
    }
    if (bg) {
        settings.themeBg = bg.value;
        document.documentElement.style.setProperty('--phone-bg', bg.value);
    }
    if (wallpaper) {
        settings.wallpaper = wallpaper.value;
        document.documentElement.style.setProperty('--phone-wallpaper', wallpaper.value);
    }
    if (lockWallpaper) {
        settings.lockscreenWallpaper = lockWallpaper.value;
        document.documentElement.style.setProperty('--lockscreen-wallpaper', lockWallpaper.value);
    }
    
    const liveliness = document.getElementById('astral-liveliness');
    const autoImages = document.getElementById('astral-auto-images');
    if (liveliness) settings.liveliness = liveliness.value;
    if (autoImages) settings.autoImages = autoImages.checked;

    ctx.saveSettingsDebounced();
}

/* ────────────────────────────── boot ────────────────────────────── */

/**
 * Точка входа расширения.
 *
 * ST активирует расширение через хук `hooks.activate` из манифеста — то есть
 * импортирует модуль и вызывает экспортированную функцию. Если её нет, ST
 * тихо ничего не делает, и пользователь видит «расширение пропало».
 *
 * Дополнительно подстраховываемся событием APP_INITIALIZED и прямым вызовом:
 * событие могло выстрелить до того, как модуль расширения загрузился, а
 * порядок загрузки расширений и приложения не гарантирован.
 */
export async function onActivate() {
    try {
        init();
    } catch (err) {
        console.error('[Astral Phone] activation failed:', err);
    }
}

function boot() {
    try {
        const context = SillyTavern.getContext();

        // Если ST уже инициализирован, APP_INITIALIZED больше не придёт —
        // запускаемся сразу.
        if (initialized) return;

        context.eventSource.on(context.event_types.APP_INITIALIZED, () => {
            try { init(); } catch (err) { console.error('[Astral Phone] init failed:', err); }
        });

        // Страховка: если событие уже было — инициализируемся сразу.
        setTimeout(() => {
            if (!initialized) {
                console.log('[Astral Phone] APP_INITIALIZED не пришёл — инициализируюсь напрямую');
                init();
            }
        }, 1500);
    } catch (err) {
        console.error('[Astral Phone] boot failed:', err);
    }
}

if (typeof jQuery === 'function') {
    jQuery(boot);
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}
