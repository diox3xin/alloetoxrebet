/**
 * Astral Phone — SillyTavern extension entry point.
 *
 * Wires the phone shell into ST, registers the function tool the model calls,
 * and provides a hidden-tag fallback for models without tool support.
 */

import { PhoneCore } from './apps/phone-core.js';
import { PhoneStorage } from './apps/storage.js';
import { ImageGenerator } from './apps/image-gen.js';
import { MessagesApp } from './apps/messages.js';
import { GalleryApp } from './apps/gallery.js';
import { SpicyApp } from './apps/spicy.js';
import { CreatorApp } from './apps/creator.js';
import { SettingsApp } from './apps/settings.js';
import { ContactSeeder } from './apps/contact-seeder.js';
import { refreshPhonePrompt } from './apps/phone-prompt.js';

const MODULE_NAME = 'astral-phone';
const EVENT_TAG_RE = /<phone-event\b([^>]*?)\/?>/gi;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

let core = null;
let storage = null;
let imageGen = null;
let seeder = null;
let initialized = false;

/* ────────────────────────────── prompt block ────────────────────────────── */

const PROMPT_BLOCK = `[Astral Phone — интерфейс телефона персонажа]

У персонажа есть смартфон. Приложения: Messages (переписка), Gallery (фото), Spicy Hub (анонимная лента), Creator Studio (платный контент с подписчиками и доходом).

Когда в сцене происходит то, что персонаж заснял бы, отправил или опубликовал — вызывай инструмент phone_event. Не описывай телефон в тексте ответа, просто вызывай инструмент.

Типы событий:
- photo_taken — персонаж сфотографировал что-то или сделал селфи. description = что именно на фото, конкретно и визуально (внешность, одежда, поза, место, свет) — это пойдёт в промпт генерации картинки.
- message_received — персонаж написал тебе сообщение. description = текст сообщения.
- spicy_posted — персонаж выложил откровенный ролик в Spicy Hub. description = название и суть ролика плюс визуальное описание кадра для превью.
- content_posted — персонаж выложил пост в Creator Studio. description = подпись к посту плюс визуальное описание кадра.
- donation_received — фанат задонатил. metadata.amount = сумма в долларах.
- subscriber_joined — новый подписчик. metadata.count = сколько.

Если инструменты недоступны, вместо вызова напиши тег, он будет вырезан из сообщения:
<phone-event type="photo_taken" character="Имя" description="описание" />

description пиши как промпт для художника: без мета-комментариев, без слов «фото» и «картинка».

Частота: не спамь событиями. В среднем одно событие на 3–6 твоих сообщений — только когда это уместно по сцене (персонаж реально достал телефон, ему написали, он снял фото). Если ты уже отправлял событие в этом сообщении, следующее — не раньше чем через несколько реплик.

Пользователь может сам писать с телефона: в блоке [Astral Phone — переписка] сообщения от него помечены как «Ты». Если там есть его новые сообщения, на которые персонаж ещё не ответил — отреагируй на них через message_received: персонаж прочитал и ответил. Не игнорируй их.

Переписки персонажа — часть его внутреннего мира. Они влияют на его отношения, мотивацию и эмоции в сцене. Если он получает сообщение от близкого человека или врага, это должно отразиться на его поведении и диалоге с тобой. Если в Спайси Хабе много нелестных комментариев, это может его расстроить. Используй информацию из телефона, чтобы добавить глубину RP.`;

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

    // Launcher first — the icon must appear even if an app fails to construct.
    window.__astralPhoneCore = core;
    injectLauncher();

    const apps = [
        ['messages', () => new MessagesApp(context, storage, imageGen)],
        ['gallery', () => new GalleryApp(context, storage, imageGen)],
        ['spicy', () => new SpicyApp(context, storage, imageGen)],
        ['creator', () => new CreatorApp(context, storage, imageGen)],
        ['settings', () => new SettingsApp(context, storage, core.accountManager)],
    ];
    for (const [id, factory] of apps) {
        try {
            core.registerApp(id, factory());
        } catch (err) {
            console.error(`[Astral Phone] App "${id}" failed to load:`, err);
        }
    }

    for (const [label, fn] of [
        ['settings panel', injectSettingsPanel],
        ['load settings', loadSettings],
        ['function tool', registerFunctionTool],
        ['slash commands', registerSlashCommands],
        ['event fallback', registerEventTagFallback],
        ['chat switch', registerChatSwitchHandler],
        ['contact seeder', registerContactSeeder],
        ['activity counter', registerActivityCounter],
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
    btn.title = 'Открыть телефон (перетащи для движения)';
    btn.innerHTML = '<span>📱</span>';
    
    // Click to toggle
    btn.addEventListener('click', (e) => {
        if (!e.target._dragged) core.toggle();
    });

    // ── draggable ──
    let isDragging = false;
    let startX = 0, startY = 0;
    let offsetX = 0, offsetY = 0;

    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.target._dragged = false;
        startX = e.clientX - btn.offsetLeft;
        startY = e.clientY - btn.offsetTop;
        btn.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.target._dragged = true;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;

        // Clamp to viewport
        offsetX = Math.max(0, Math.min(offsetX, window.innerWidth - btn.offsetWidth));
        offsetY = Math.max(0, Math.min(offsetY, window.innerHeight - btn.offsetHeight));

        btn.style.left = offsetX + 'px';
        btn.style.right = 'auto';
        btn.style.top = offsetY + 'px';
        btn.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        btn.style.cursor = 'grab';
    });

    // Touch support
    btn.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        startX = touch.clientX - btn.offsetLeft;
        startY = touch.clientY - btn.offsetTop;
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        offsetX = touch.clientX - startX;
        offsetY = touch.clientY - startY;

        offsetX = Math.max(0, Math.min(offsetX, window.innerWidth - btn.offsetWidth));
        offsetY = Math.max(0, Math.min(offsetY, window.innerHeight - btn.offsetHeight));

        btn.style.left = offsetX + 'px';
        btn.style.right = 'auto';
        btn.style.top = offsetY + 'px';
        btn.style.bottom = 'auto';
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });

    document.body.appendChild(btn);
}

    const menu = document.getElementById('extensionsMenu');
    if (menu) {
        const item = document.createElement('div');
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-mobile-screen extensionsMenuExtensionButton"></div><span>Astral Phone</span>';
        item.addEventListener('click', () => core.toggle());
        menu.appendChild(item);
    }
}

/* ────────────────────────────── function tool ────────────────────────────── */

function registerFunctionTool(context) {
    if (typeof context.registerFunctionTool !== 'function') {
        console.warn('[Astral Phone] registerFunctionTool unavailable — using tag fallback only');
        return;
    }

    context.registerFunctionTool({
        name: 'phone_event',
        displayName: 'Phone Event',
        description:
            'Записать событие в смартфон персонажа: фото, сообщение, пост в Spicy Hub или Creator Studio, донат, подписка. ' +
            'description всегда должен быть визуальным описанием, пригодным как промпт для генерации изображения.',
        parameters: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: [
                        'photo_taken',
                        'message_received',
                        'spicy_posted',
                        'content_posted',
                        'donation_received',
                        'subscriber_joined',
                    ],
                    description: 'Тип события',
                },
                character: { type: 'string', description: 'Имя персонажа' },
                description: {
                    type: 'string',
                    description: 'Текст сообщения либо визуальное описание кадра',
                },
                metadata: {
                    type: 'object',
                    description: 'Доп. данные: amount для доната, count для подписки, title для ролика',
                    properties: {
                        amount: { type: 'number' },
                        count: { type: 'number' },
                        title: { type: 'string' },
                    },
                },
            },
            required: ['type', 'description'],
        },
        action: async (args) => {
            try {
                const result = await core.handleEvent(args);
                return JSON.stringify(result);
            } catch (err) {
                console.error('[Astral Phone] tool action failed:', err);
                return JSON.stringify({ success: false, error: String(err?.message || err) });
            }
        },
    });
}

/* ────────────────────────────── tag fallback ────────────────────────────── */

function parseAttrs(str) {
    const out = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(str))) out[m[1]] = m[2];
    return out;
}

function registerEventTagFallback(context) {
    const { eventSource, event_types } = context;

    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
        try {
            const live = SillyTavern.getContext();
            const message = live.chat?.[messageId];
            if (!message || message.is_user) return;

            const text = message.mes || '';
            if (!text.includes('<phone-event')) return;

            EVENT_TAG_RE.lastIndex = 0;
            let match;
            while ((match = EVENT_TAG_RE.exec(text))) {
                const attrs = parseAttrs(match[1]);
                if (!attrs.type) continue;
                core.handleEvent({
                    type: attrs.type,
                    character: attrs.character || live.name2 || '',
                    description: attrs.description || '',
                });
            }

            message.mes = text.replace(EVENT_TAG_RE, '').trim();
            const el = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
            if (el) {
                el.innerHTML = live.messageFormatting(
                    message.mes,
                    message.name,
                    message.is_system,
                    message.is_user,
                    messageId,
                );
            }
        } catch (err) {
            console.warn('[Astral Phone] tag fallback error:', err);
        }
    });
}

/* ────────────────────────────── chat switch ────────────────────────────── */

/**
 * ST swaps `chat_metadata` out from under us when the user changes chats.
 * Drop the account cache and repaint anything currently on screen so the phone
 * shows the account and data of the chat that is now open.
 */
function registerChatSwitchHandler(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;

    const onSwitch = () => {
        try {
            core?.storage?.flush?.();
            core?.accountManager?.invalidate();
            core?.accountManager?.getCurrentAccount();
            if (core?.isOpen) {
                if (core.currentAppId) core.openApp(core.currentAppId);
                else core.showHome();
            }
        } catch (err) {
            console.warn('[Astral Phone] chat switch refresh failed:', err);
        }
    };

    for (const name of ['CHAT_CHANGED', 'CHAT_LOADED', 'CHAT_STARTED']) {
        const type = event_types[name];
        if (type) eventSource.on(type, onSwitch);
    }
}

/* ────────────────────────────── phone activity counter ────────────────────────────── */

/**
 * Count chat messages since the last phone event, and refresh the dynamic
 * prompt after every message so the model sees replies the user typed on the
 * phone (they never appear in the chat transcript).
 */
function registerActivityCounter(context) {
    const { eventSource, event_types } = context;
    if (!eventSource || !event_types) return;

    const onMessage = () => {
        try {
            const state = storage.getState();
            state.sinceEvent = (Number(state.sinceEvent) || 0) + 1;
            storage.save();
        } catch (err) {
            console.warn('[Astral Phone] counter update failed:', err);
        }
        refreshPhonePrompt(storage);
    };

    for (const name of ['MESSAGE_SENT', 'MESSAGE_RECEIVED']) {
        const type = event_types[name];
        if (type) eventSource.on(type, onMessage);
    }
}

function injectPromptBlock(context) {
    try {
        context.setExtensionPrompt(
            MODULE_NAME,
            PROMPT_BLOCK,
            context.extension_prompt_types?.IN_CHAT ?? 1,
            1,
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
    // Auto-seed: hook into the phone's open() to run once silently
    const origOpen = core.open.bind(core);
    core.open = function(...args) {
        origOpen(...args);
        if (!seeder.isSeeded()) {
            _runSeed(false).catch(err =>
                console.warn('[Astral Phone] auto-seed failed:', err));
        }
    };

    // Also re-seed on chat switch (new chat = new seeder state)
    const origSwitch = core._onChatSwitch?.bind(core) || null;
    const ctx = context;
    ctx.eventSource?.on?.(ctx.event_types?.CHAT_CHANGED, () => {
        // Small delay so storage has time to invalidate
        setTimeout(() => {
            if (!seeder.isSeeded()) {
                _runSeed(false).catch(() => {});
            }
        }, 800);
    });
}

async function _runSeed(force = false) {
    const toast = (msg, kind = 'info') => {
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
        
        // Save on change
        document.getElementById('astral-phone-image-provider')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-theme-accent')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-theme-bg')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-wallpaper')?.addEventListener('change', saveSettings);
        document.getElementById('astral-phone-lockscreen-wallpaper')?.addEventListener('change', saveSettings);
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
    
    ctx.saveSettingsDebounced();
    console.log('[Astral Phone] settings saved:', settings);
}

/* ────────────────────────────── boot ────────────────────────────── */

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.event_types.APP_INITIALIZED, init);
});
