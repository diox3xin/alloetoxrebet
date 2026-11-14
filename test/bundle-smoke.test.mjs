/**
 * Проверка настоящего бандла расширения в среде, похожей на SillyTavern.
 *
 * Запуск: node test/bundle-smoke.test.mjs
 *
 * Здесь грузится astral-phone.js (тот самый файл, который ставится в ST),
 * поднимается стаб SillyTavern с настоящими событиями, и проверяется весь
 * путь: расширение стартует → инициализируется → регистрирует функцию
 * phone_event → ловит тег из ответа модели → событие доезжает до телефона.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, '..', 'astral-phone.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            passed++;
            console.log(`  ok   ${name}`);
        })
        .catch((err) => {
            failed++;
            console.log(`  FAIL ${name}\n       ${err.message}`);
        });
}

/* ─────────────────────────── окружение ─────────────────────────── */

/** Минимальный DOM — расширению нужно немного: элементы, классы, события. */
function makeDom() {
    const makeEl = (tag = 'div') => {
        const el = {
            tagName: tag.toUpperCase(),
            style: { setProperty() {}, removeProperty() {} },
            dataset: {},
            children: [],
            classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
            attributes: {},
            innerHTML: '',
            textContent: '',
            value: '',
            disabled: false,
            scrollTop: 0,
            scrollHeight: 100,
            clientHeight: 100,
            offsetWidth: 380,
            offsetHeight: 780,
            style2: {},
            appendChild(c) { this.children.push(c); return c; },
            insertBefore(c) { this.children.unshift(c); return c; },
            removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
            remove() {},
            setAttribute(k, v) { this.attributes[k] = v; },
            getAttribute(k) { return this.attributes[k]; },
            removeAttribute(k) { delete this.attributes[k]; },
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            closest: () => null,
            contains: () => false,
            focus() {},
            blur() {},
            click() {},
            getBoundingClientRect: () => ({ top: 0, left: 0, width: 380, height: 780, bottom: 780, right: 380 }),
        };
        return el;
    };

    const body = makeEl('body');
    const head = makeEl('head');

    const document = {
        body,
        head,
        documentElement: {
            style: { setProperty() {}, removeProperty() {} },
            classList: { add() {}, remove() {} },
        },
        createElement: makeEl,
        createElementNS: makeEl,
        createTextNode: (t) => ({ textContent: t }),
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        getElementsByClassName: () => [],
        addEventListener() {},
        removeEventListener() {},
        readyState: 'complete',
        location: { href: 'http://localhost/' },
    };

    return {
        document,
        window: {
            document,
            location: document.location,
            innerWidth: 1280,
            innerHeight: 800,
            devicePixelRatio: 1,
            addEventListener() {},
            removeEventListener() {},
            matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
            getComputedStyle: () => ({ getPropertyValue: () => '' }),
            requestAnimationFrame: (cb) => setTimeout(cb, 0),
            cancelAnimationFrame: clearTimeout,
            // Таймеры нужны внутри vm-контекста: без них расширению не дождаться
            // собственных отложенных вызовов.
            setTimeout: (...args) => setTimeout(...args),
            clearTimeout: (...args) => clearTimeout(...args),
            setInterval: (...args) => setInterval(...args),
            clearInterval: (...args) => clearInterval(...args),
            queueMicrotask: (...args) => queueMicrotask(...args),
            localStorage: (() => {
                const store = new Map();
                return {
                    getItem: (k) => (store.has(k) ? store.get(k) : null),
                    setItem: (k, v) => { store.set(k, String(v)); },
                    removeItem: (k) => { store.delete(k); },
                    clear: () => { store.clear(); },
                    key: (i) => Array.from(store.keys())[i] ?? null,
                    get length() { return store.size; },
                };
            })(),
            sessionStorage: {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {},
            },
        },
    };
}

/** Стаб SillyTavern с работающими событиями. */
function makeSt(dom) {
    const handlers = new Map();
    const chat = [];
    let chatMetadata = {};

    const eventTypes = {
        APP_INITIALIZED: 'app_initialized',
        MESSAGE_RECEIVED: 'message_received',
        MESSAGE_SENT: 'message_sent',
        MESSAGE_UPDATED: 'message_updated',
        CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
        CHAT_CHANGED: 'chat_changed',
        CHAT_LOADED: 'chat_loaded',
    };

    const context = {
        name1: 'Пользователь',
        name2: 'Лиза Воронова',
        chat,
        chat_metadata: chatMetadata,
        chatMetadata: chatMetadata,
        characters: { 0: { name: 'Лиза Воронова', description: 'девушка', avatar: '' } },
        characterId: 0,
        personas: {},
        user_persona: 'u1',
        extensionSettings: {},
        extension_prompt_types: { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 },
        main_api: 'openai',
        getCurrentChatId: () => 'demo',
        updateChatMetadata: (v) => Object.assign(chatMetadata, v),
        saveMetadata: async () => {},
        saveMetadataDebounced: () => {},
        saveSettingsDebounced: () => {},
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        messageFormatting: (t) => t,
        setExtensionPrompt: (key, value) => { context.__prompts = context.__prompts || {}; context.__prompts[key] = value; },
        registerSlashCommand: () => {},
        registerFunctionTool: (def) => { context.__tools = context.__tools || {}; context.__tools[def.name] = def; },
        generateQuietPrompt: async () => '',
        generateRaw: async () => '',
        event_types: eventTypes,
        eventSource: {
            on(type, fn) {
                if (!handlers.has(type)) handlers.set(type, []);
                handlers.get(type).push(fn);
            },
            emit(type, ...args) {
                for (const fn of handlers.get(type) || []) fn(...args);
            },
            makeLast: () => {},
        },
    };

    const st = { getContext: () => context, context, eventTypes, chat };

    // jQuery-заглушка: ST вызывает jQuery(async () => {...}) при загрузке.
    dom.window.jQuery = (fn) => {
        if (typeof fn === 'function') setTimeout(() => fn(), 0);
        return { ready: () => {} };
    };
    dom.window.SillyTavern = st;
    dom.window.toastr = { success() {}, error() {}, warning() {}, info() {} };
    dom.window.$ = dom.window.jQuery;

    return st;
}

/** Загрузить бандл в окружение. */
async function loadBundle(dom, logs) {
    let code = await readFile(bundlePath, 'utf8');

    // Бандл собран как ESM (ST грузит расширения как <script type="module">),
    // а vm.runInContext умеет только скрипты. Вырезаем хвост экспорта и
    // отдаём его наружу вручную.
    const exportMatch = code.match(/export\s*\{([^}]*)\};?\s*$/);
    const exportNames = exportMatch
        ? exportMatch[1].split(',').map(s => s.trim()).filter(Boolean)
        : [];
    code = code.replace(/export\s*\{[^}]*\};?\s*$/, '');

    // Консоль внутри vm-среды — перехватываем, чтобы видеть ошибки расширения.
    dom.window.console = {
        log: (...a) => logs.push(['log', ...a].map(String).join(' ')),
        warn: (...a) => logs.push(['warn', ...a].map(String).join(' ')),
        error: (...a) => logs.push(['error', ...a].map(String).join(' ')),
        info: (...a) => logs.push(['info', ...a].map(String).join(' ')),
        debug: () => {},
    };

    const context = vm.createContext(dom.window);
    // В браузере `window === globalThis`. В vm-контексте такого нет, поэтому
    // делаем ссылку вручную — иначе код вида `window.foo` падает.
    dom.window.window = dom.window;
    dom.window.globalThis = dom.window;
    dom.window.self = dom.window;

    const module = { exports: {} };
    const fn = vm.runInContext(
        `(function(exports, module){${code}\n; return { onActivate: typeof onActivate !== 'undefined' ? onActivate : undefined };})`,
        context,
        { filename: 'astral-phone.js' },
    );
    const exported = fn(module.exports, module);

    for (const name of exportNames) {
        if (exported[name] === undefined) exported[name] = dom.window[name];
    }

    return exported;
}

/* ─────────────────────────── тесты ─────────────────────────── */

const dom = makeDom();
const st = makeSt(dom);
const logs = [];
const exports = await loadBundle(dom, logs);

// дать сработать отложенному boot() (через jQuery-ready)
await new Promise(r => setTimeout(r, 20));

// ST грузит расширения ДО события APP_INITIALIZED и сразу после этого его
// шлёт — так и делаем.
st.context.eventSource.emit(st.eventTypes.APP_INITIALIZED);
await new Promise(r => setTimeout(r, 60));

if (logs.length) {
    console.log('\n--- логи расширения ---');
    for (const l of logs) console.log('  ' + l);
    console.log('--- конец логов ---\n');
}

console.log('\nбандл расширения');

await test('модуль экспортирует onActivate', () => {
    assert.equal(typeof exports.onActivate, 'function');
});

await test('расширение инициализировалось (APP_INITIALIZED)', () => {
    // init() вызывается по событию APP_INITIALIZED — так же, как в ST.
    const core = dom.window.__astralPhoneCore;
    assert.ok(core, 'ядро телефона должно существовать');
    assert.ok(core.apps && typeof core.apps.size === 'number', 'приложения должны быть зарегистрированы');
    assert.ok(core.apps.size >= 5, `приложений должно быть >= 5, а их ${core.apps.size}`);
});

await test('функция phone_event зарегистрирована', () => {
    const tools = st.context.__tools || {};
    assert.ok(tools.phone_event, 'инструмент phone_event должен быть зарегистрирован');
    assert.equal(tools.phone_event.parameters.required.includes('type'), true);
});

await test('промпт-блок телефона попал в контекст', () => {
    const prompts = st.context.__prompts || {};
    const block = prompts['astral-phone'];
    assert.ok(block, 'блок с описанием телефона должен быть установлен');
    assert.ok(block.includes('phone_event'), 'блок должен упоминать инструмент');
    assert.ok(block.includes('<phone-event'), 'блок должен содержать пример тега');
});

await test('событие из ответа модели доезжает до телефона', () => {
    const core = dom.window.__astralPhoneCore;

    // Модель ответила: описала действие и добавила тег (как в жалобе).
    st.chat.push({
        mes: 'Она смотрит на экран -> потом отводит взгляд.'
            + '<phone-event type="message_received" character="Лиза" description="ты не спишь?" />',
        is_user: false,
        name: 'Лиза Воронова',
    });

    st.context.eventSource.emit(st.eventTypes.MESSAGE_RECEIVED, st.chat.length - 1);

    const state = core.storage.getState();
    assert.equal(state.messages.length, 1, 'сообщение должно попасть в телефон');
    assert.equal(state.messages[0].text, 'ты не спишь?');
    assert.equal(state.messages[0].character, 'Лиза');
});

await test('тег вырезан из текста сообщения в чате', () => {
    const message = st.chat[st.chat.length - 1];
    assert.ok(!message.mes.includes('phone-event'), 'тег должен быть вырезан');
    assert.ok(message.mes.includes('отводит взгляд'), 'текст должен сохраниться');
});

await test('вызов инструмента phone_event кладёт событие в телефон', async () => {
    const core = dom.window.__astralPhoneCore;
    const tool = st.context.__tools.phone_event;

    await tool.action({
        type: 'photo_taken',
        character: 'Лиза',
        description: 'у окна, вечерний свет',
    });

    const state = core.storage.getState();
    assert.equal(state.gallery.length, 1, 'фото должно попасть в галерею');
});

await test('повторная обработка того же сообщения не дублирует событие', () => {
    const core = dom.window.__astralPhoneCore;
    const before = core.storage.getState().messages.length;

    st.chat.push({
        mes: '<phone-event type="message_received" character="Лиза" description="дубль?" />',
        is_user: false,
        name: 'Лиза Воронова',
    });
    const idx = st.chat.length - 1;

    st.context.eventSource.emit(st.eventTypes.MESSAGE_RECEIVED, idx);
    st.context.eventSource.emit(st.eventTypes.MESSAGE_UPDATED, idx);

    const after = core.storage.getState().messages.length;
    assert.equal(after, before + 1, 'событие должно добавиться ровно один раз');
});

await test('аккаунт персоны создан в состоянии чата', () => {
    const core = dom.window.__astralPhoneCore;
    const state = core.storage.getState();
    assert.ok(state.account, 'аккаунт должен быть создан из персоны');
    assert.ok(typeof state.account.name === 'string');
});

await test('все типы событий обрабатываются без ошибок', async () => {
    const core = dom.window.__astralPhoneCore;
    const types = [
        'message_received', 'photo_taken', 'spicy_posted', 'content_posted',
        'note_written', 'social_post', 'donation_received', 'subscriber_joined',
    ];
    for (const type of types) {
        const res = await core.handleEvent({
            type,
            character: 'Лиза',
            description: 'тестовое описание',
            metadata: { amount: 5, count: 1, title: 'Заголовок', kind: 'diary' },
        });
        assert.equal(res.success, true, `событие ${type} должно обрабатываться: ${res.error || ''}`);
    }
});

await test('приложение Notes получает kind и title из metadata', () => {
    const core = dom.window.__astralPhoneCore;
    const state = core.storage.getState();
    const note = (state.notes || []).find(n => n.title === 'Заголовок');
    assert.ok(note, 'заметка должна появиться в Notes');
    assert.equal(note.kind, 'diary');
});

console.log(`\n${passed} прошло, ${failed} провалено\n`);
process.exit(failed ? 1 : 0);
