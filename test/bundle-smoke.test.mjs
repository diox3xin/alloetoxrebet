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
        MESSAGE_SWIPED: 'message_swiped',
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

/*
 * Модули, которые тест импортирует напрямую (apps/cast-profiles.js и
 * apps/character-gen.js), ищут SillyTavern через globalThis. В node это не
 * окно браузера, поэтому прокидываем его и в глобальную область.
 */
globalThis.SillyTavern = dom.window.SillyTavern;
globalThis.extension_settings = st.context.extensionSettings;

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
    const core = dom.window.__astralPhoneCore;
    assert.ok(core, 'ядро телефона должно существовать');
    const ids = [...core.apps.keys()].sort().join(',');
    assert.equal(ids, 'gallery,messages,settings,social', `набор приложений: ${ids}`);
});

await test('function tool не регистрируется (он заставляет ST делать второй запрос)', () => {
    const tools = st.context.__tools || {};
    assert.ok(!tools.phone_event, 'инструмента phone_event быть не должно');
});

await test('правила телефона короткие и описывают тег', () => {
    const prompts = st.context.__prompts || {};
    const block = prompts['astral-phone'];
    assert.ok(block, 'блок с правилами должен быть установлен');
    assert.ok(block.includes('<phone-event'), 'блок должен содержать пример тега');
    assert.ok(block.length < 2000, `правила должны быть короткими, а их ${block.length} символов`);
});

await test('событие из ответа модели доезжает до телефона', () => {
    const core = dom.window.__astralPhoneCore;

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

await test('повторная обработка того же сообщения не дублирует событие', () => {
    const core = dom.window.__astralPhoneCore;
    const before = core.storage.getState().messages.length;

    st.chat.push({
        mes: '<phone-event type="message_received" character="Лиза" description="дубль?" />',
        is_user: false,
        name: 'Лиза Воронова',
    });
    const idx = st.chat.length - 1;
    const original = st.chat[idx].mes;

    st.context.eventSource.emit(st.eventTypes.MESSAGE_RECEIVED, idx);
    st.context.eventSource.emit(st.eventTypes.MESSAGE_UPDATED, idx);
    // Даже если текст с тегом вернулся (перезагрузка) — дубля нет.
    st.chat[idx].mes = original;
    st.context.eventSource.emit(st.eventTypes.CHARACTER_MESSAGE_RENDERED, idx);

    const after = core.storage.getState().messages.length;
    assert.equal(after, before + 1, 'событие должно добавиться ровно один раз');
});

await test('свайп убирает события прошлого варианта ответа', () => {
    const core = dom.window.__astralPhoneCore;
    st.chat.push({
        mes: 'ok<phone-event type="message_received" character="Макс" description="вариант 1" />',
        is_user: false, name: 'Макс', swipe_id: 0,
    });
    const idx = st.chat.length - 1;
    st.context.eventSource.emit(st.eventTypes.MESSAGE_RECEIVED, idx);
    assert.ok(core.storage.getState().messages.some(m => m.text === 'вариант 1'));

    st.chat[idx].swipe_id = 1;
    st.chat[idx].mes = 'ok2<phone-event type="message_received" character="Макс" description="вариант 2" />';
    st.context.eventSource.emit(st.eventTypes.MESSAGE_SWIPED, idx);

    const texts = core.storage.getState().messages.map(m => m.text);
    assert.ok(!texts.includes('вариант 1'), 'старый вариант должен исчезнуть');
    assert.ok(texts.includes('вариант 2'), 'новый вариант должен появиться');
});

await test('аккаунт персоны создан в состоянии чата', () => {
    const core = dom.window.__astralPhoneCore;
    const state = core.storage.getState();
    assert.ok(state.account, 'аккаунт должен быть создан из персоны');
    assert.ok(typeof state.account.name === 'string');
});

await test('все типы событий обрабатываются без ошибок', async () => {
    const core = dom.window.__astralPhoneCore;
    for (const type of ['message_received', 'photo_taken', 'social_post', 'social_follow']) {
        const res = await core.handleEvent({ type, character: 'Лиза', description: 'тестовое описание' });
        assert.equal(res.success, true, `событие ${type} должно обрабатываться: ${res.error || ''}`);
    }
});

await test('пост с фото кладёт снимок в галерею и связывает их', async () => {
    const core = dom.window.__astralPhoneCore;
    const before = core.storage.getState().gallery.length;
    st.chat.push({
        mes: 'x<phone-event type="social_post" character="Мира" description="закат" photo="девушка на крыше, закат" />',
        is_user: false, name: 'Мира',
    });
    st.context.eventSource.emit(st.eventTypes.MESSAGE_RECEIVED, st.chat.length - 1);
    await new Promise(r => setTimeout(r, 10));

    const state = core.storage.getState();
    const post = state.social.find(p => p.text === 'закат');
    assert.ok(post, 'пост должен появиться');
    assert.ok(post.photoId, 'у поста должна быть ссылка на снимок');
    assert.equal(state.gallery.length, before + 1, 'снимок должен попасть в галерею');
    assert.ok(state.gallery.some(g => g.id === post.photoId && g.description.includes('крыше')));
});

await test('compact убирает дубли старого сканера, но не обычные сообщения', () => {
    const core = dom.window.__astralPhoneCore;
    const state = core.storage.getState();
    state.messages.push({ character: 'Ян', text: 'ок', from: 'them' });
    state.messages.push({ character: 'Ян', text: 'ок', from: 'them' });
    state.messages.push({ id: 'scan_1_a', character: 'Ян', text: 'ок', from: 'them' });
    state.messages.push({ id: 'scan_2_b', character: 'Ян', text: 'ок', from: 'them' });
    state.creator = { posts: [] };
    const before = state.messages.length;
    core.storage.compact();
    const after = core.storage.getState();
    assert.equal(after.messages.length, before - 2, 'должны уйти только scan_-дубли');
    assert.ok(!('creator' in after), 'данные удалённых приложений должны быть убраны');
});

await test('сводка телефона короткая и показывает, кто ждёт ответа', async () => {
    const { buildPhoneContext } = await import('../apps/phone-prompt.js');
    const msgs = [];
    for (let i = 0; i < 200; i++) msgs.push({ character: `НПС${i % 5}`, text: 'очень длинное сообщение '.repeat(20), from: 'them' });
    msgs.push({ character: 'НПС1', text: 'ответь мне', from: 'me' });
    const text = buildPhoneContext({ messages: msgs, social: [], sinceEvent: 20 }, null, { liveliness: 'normal' });
    assert.ok(text.length < 1500, `сводка должна быть короткой, а она ${text.length}`);
    assert.ok(text.includes('Ждут ответа игроку: НПС1'));
    assert.ok(text.includes('молчит'), 'должно быть подталкивание');
});

await test('анкеты персонажей: интервал анализа настраивается и сохраняется', async () => {
    const cast = await import('../apps/cast-profiles.js');
    assert.equal(typeof cast.analysisInterval, 'function');
    assert.equal(typeof cast.setAnalysisInterval, 'function');

    // По умолчанию анализ выключен (отдельный запрос к модели).
    assert.equal(cast.analysisInterval(), cast.DEFAULT_INTERVAL);

    // 0 — выключить.
    assert.equal(cast.setAnalysisInterval(0), true);
    assert.equal(cast.analysisInterval(), 0);

    // Значение из настроек должно переживать перезапуск.
    assert.equal(cast.setAnalysisInterval(7), true);
    assert.equal(cast.analysisInterval(), 7);

    cast.setAnalysisInterval(cast.DEFAULT_INTERVAL);
});

await test('промпт заметок всегда говорит про игрока', async () => {
    const gen = await import('../apps/character-gen.js');
    const ctx = st.context;

    // Перехватываем запрос к модели, чтобы посмотреть сам промпт.
    let captured = '';
    const original = ctx.generateRaw;
    ctx.generateRaw = async ({ prompt }) => {
        captured = String(prompt || '');
        return 'заметка';
    };

    try {
        await gen.generateNotes(ctx, { kind: 'secret', count: 1 });
    } finally {
        ctx.generateRaw = original;
    }

    assert.ok(captured.length > 0, 'промпт должен уйти модели');
    assert.ok(/the player/i.test(captured), 'промпт должен называть игрока, а не только имя');
    assert.ok(/MUST be the subject/i.test(captured), 'игрок должен быть темой заметки');
    assert.ok(/hides from/i.test(captured), 'угол секрета должен быть в промпте');
});

console.log(`\n${passed} прошло, ${failed} провалено\n`);
process.exit(failed ? 1 : 0);
