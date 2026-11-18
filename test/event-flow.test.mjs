/**
 * Интеграционный тест конвейера «ответ модели → событие в телефоне».
 *
 * Запуск: node test/event-flow.test.mjs
 *
 * Проверяет три слоя:
 *   1. парсер тега <phone-event> на всех форматах, которые пишет модель;
 *   2. доставку события из текста в приложение телефона (Messages);
 *   3. что тег вырезается из сообщения и не остаётся в чате.
 */

import assert from 'node:assert/strict';
import { extractPhoneEvents, normaliseEvent } from '../apps/event-parser.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL ${name}\n       ${err.message}`);
    }
}

/* ─────────────────────────── 1. парсер ─────────────────────────── */

console.log('\nпарсер тега <phone-event>');

test('двойные кавычки', () => {
    const { events, text } = extractPhoneEvents(
        '<phone-event type="message_received" character="Лиза" description="Привет" />',
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'message_received');
    assert.equal(events[0].character, 'Лиза');
    assert.equal(events[0].description, 'Привет');
    assert.equal(text, '');
});

test('стрелка "->" в описании не ломает разбор', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type="photo_taken" character="Лиза" description="смотрит -> улыбается" />',
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].description, 'смотрит -> улыбается');
});

test('одинарные кавычки', () => {
    const { events } = extractPhoneEvents(
        "<phone-event type='message_received' character='Лиза' description='Привет' />",
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].description, 'Привет');
});

test('без кавычек', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type=message_received character=Лиза description=Привет />',
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].description, 'Привет');
});

test('закрывающий ">" вместо "/>"', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type="message_received" character="Лиза" description="Привет" >',
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].description, 'Привет');
});

test('несколько событий в одном сообщении', () => {
    const { events, text } = extractPhoneEvents(
        'текст\n<phone-event type="message_received" character="A" description="раз" />\n'
        + '<phone-event type="photo_taken" character="B" description="два" />\nещё текст',
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'message_received');
    assert.equal(events[1].type, 'photo_taken');
    assert.ok(text.includes('текст'));
    assert.ok(text.includes('ещё текст'));
    assert.ok(!text.includes('phone-event'));
});

test('сокращения char/desc', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type="photo_taken" char="Лиза" desc="селфи" />',
    );
    assert.equal(events[0].character, 'Лиза');
    assert.equal(events[0].description, 'селфи');
});

test('метаданные доната', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type="donation_received" character="Фан" description="донат" amount="25" />',
    );
    assert.equal(events[0].amount, 25);
});

test('тег без атрибутов игнорируется', () => {
    const { events } = extractPhoneEvents('<phone-event />');
    assert.equal(events.length, 0);
});

test('чужой тег не трогается', () => {
    const { events, text } = extractPhoneEvents(
        '<phone-note>не то</phone-note><phone-event type="message_received" character="A" description="ок" />',
    );
    assert.equal(events.length, 1);
    assert.ok(text.includes('phone-note'));
});

/* ─────────────────────────── 2. нормализация ─────────────────────────── */

console.log('\nнормализация события');

test('числовые поля уезжают в metadata', () => {
    const out = normaliseEvent({
        type: 'note_written',
        character: 'Лиза',
        description: 'секрет',
        title: 'Заголовок',
        kind: 'secret',
        amount: 10,
        count: 3,
    });
    assert.equal(out.metadata.title, 'Заголовок');
    assert.equal(out.metadata.kind, 'secret');
    assert.equal(out.metadata.amount, 10);
    assert.equal(out.metadata.count, 3);
});

test('пустые необязательные поля не попадают в metadata', () => {
    const out = normaliseEvent({ type: 'message_received', character: 'A', description: 'B' });
    assert.equal(out.metadata, undefined);
});

/* ─────────────────────────── 3. доставка в телефон ─────────────────────────── */

console.log('\nдоставка события в приложение телефона');

// Мини-стаб приложения Messages: повторяет реальную логику обработчика.
function makeMessagesApp(state, save) {
    return {
        handleEvent(eventData) {
            state.messages.push({
                character: eventData.character || '',
                text: eventData.description || '',
                timestamp: Date.now(),
                fromUser: false,
                from: 'them',
                isIncoming: true,
            });
            save();
            return { success: true };
        },
    };
}

// Мини-стаб того же PhoneCore.handleEvent: роутинг по типу события.
function makeCore(state, save, apps) {
    const routing = {
        message_received: 'messages',
        photo_taken: 'gallery',
        social_post: 'social',
    };
    return {
        handleEvent(eventData) {
            const { type, ...data } = eventData || {};
            const appId = routing[type];
            if (!appId) return { success: false, error: `Unknown event type: ${type}` };
            const app = apps[appId];
            if (!app) return { success: false, error: `App "${appId}" cannot handle events` };
            return app.handleEvent({ type, ...data });
        },
    };
}

const state = { messages: [], gallery: [] };
let saves = 0;
const save = () => { saves++; };

const apps = {
    messages: makeMessagesApp(state, save),
    gallery: { handleEvent: (e) => { state.gallery.push(e); save(); return { success: true }; } },
};

const core = makeCore(state, save, apps);

test('событие из текста попадает в Messages', () => {
    const text = '<phone-event type="message_received" character="Лиза" description="Ты не спишь?" />';
    const { events } = extractPhoneEvents(text);
    assert.equal(events.length, 1);

    const payload = normaliseEvent(events[0]);
    const result = core.handleEvent(payload);

    assert.equal(result.success, true);
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].text, 'Ты не спишь?');
    assert.equal(state.messages[0].character, 'Лиза');
    assert.equal(state.messages[0].from, 'them');
});

test('событие photo_taken попадает в Gallery, а не в Messages', () => {
    const { events } = extractPhoneEvents(
        '<phone-event type="photo_taken" character="Лиза" description="у окна" />',
    );
    core.handleEvent(normaliseEvent(events[0]));
    assert.equal(state.gallery.length, 1);
    assert.equal(state.messages.length, 1, 'в Messages лишнего не добавилось');
});

test('неизвестный тип не ломает конвейер', () => {
    const { events } = extractPhoneEvents('<phone-event type="что-то" description="x" />');
    const result = core.handleEvent(normaliseEvent(events[0]));
    assert.equal(result.success, false);
});

test('тег вырезается из текста сообщения', () => {
    const message = {
        mes: 'Лиза улыбается.\n<phone-event type="message_received" character="Лиза" description="Привет" />',
        is_user: false,
    };
    const { text } = extractPhoneEvents(message.mes);
    assert.ok(!text.includes('phone-event'));
    assert.ok(text.includes('Лиза улыбается'));
});

/* ─────────────────────────── 4. симптом пользователя ─────────────────────────── */

console.log('\nсценарий из жалобы: «в чате есть, в телефоне пусто»');

test('тег со стрелкой в описании доходит до телефона', () => {
    const state2 = { messages: [] };
    const core2 = makeCore(state2, () => {}, { messages: makeMessagesApp(state2, () => {}) });

    // Ровно то, что модель пишет вместо вызова инструмента.
    const modelAnswer = 'Она тяжело смотрит на экран -> потом отводит взгляд.'
        + '<phone-event type="message_received" character="Лиза" description="ты не спишь? -> я тоже" />';

    const { events, text } = extractPhoneEvents(modelAnswer);
    assert.equal(events.length, 1, 'событие должно распознаться');
    core2.handleEvent(normaliseEvent(events[0]));
    assert.equal(state2.messages.length, 1, 'сообщение должно быть в телефоне');
    assert.equal(state2.messages[0].text, 'ты не спишь? -> я тоже');
    assert.ok(!text.includes('phone-event'), 'тег не должен остаться в чате');
});

/* ─────────────────────────── итог ─────────────────────────── */

console.log(`\n${passed} прошло, ${failed} провалено\n`);
process.exit(failed ? 1 : 0);
