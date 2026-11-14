/**
 * Собирает автономную страницу-отчёт: в неё вклеивается настоящий бандл
 * расширения и стаб SillyTavern, после чего страница сама прогоняет
 * проверки и показывает результат.
 *
 * Запуск: node test/build-report.mjs → out/report.html
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

let bundle = await readFile(path.join(root, 'astral-phone.js'), 'utf8');
// Убираем ESM-хвост — страница грузит скрипт как обычный модуль-скрипт.
bundle = bundle.replace(/export\s*\{[^}]*\};?\s*$/, '');

// Экранируем </script> внутри строк бандла.
bundle = bundle.replace(/<\/script>/gi, '<\\/script>');

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Astral Phone — проверка сборки</title>
<style>
  body { margin:0; padding:28px; background:#0D0B10; color:#EFE6EC;
         font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:13px; }
  h1 { font-size:16px; color:#E5AFC5; margin:0 0 4px; letter-spacing:.04em; }
  .sub { color:#A18D9B; margin:0 0 20px; }
  .row { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid #282027; }
  .ok   { color:#7FD1A0; }
  .fail { color:#E56A8A; }
  .mark { width:18px; }
  .name { flex:1; }
  .meta { color:#A18D9B; }
  #phone { position:fixed; right:20px; top:20px; width:300px; height:560px;
           border:1px solid #282027; border-radius:26px; overflow:hidden;
           background:linear-gradient(160deg,#171116,#0D0B10); }
  #phone .bar { padding:8px 14px; font-size:11px; color:#A18D9B;
                border-bottom:1px solid #282027; }
  #phone .apps { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:14px; }
  #phone .app { background:#171116; border:1px solid #282027; border-radius:14px;
                padding:9px 4px; text-align:center; font-size:9px; color:#A18D9B; }
  #phone .app b { display:block; font-size:16px; color:#D99AB5; margin-bottom:4px; }
  .sum { margin-top:18px; padding:10px 14px; border-radius:10px; background:#171116;
         border:1px solid #282027; }
</style>
</head>
<body>
<h1>Astral Phone — проверка сборки</h1>
<p class="sub">astral-phone.js загружен как настоящее расширение, внутри — стаб SillyTavern</p>
<div id="results"></div>
<div class="sum" id="summary"></div>

<div id="phone">
  <div class="bar" id="clock">стенд</div>
  <div class="apps" id="apps"></div>
</div>

<script>
// ── стаб SillyTavern ──────────────────────────────────────────────
// Обычный (не модульный) скрипт: модульные скрипты откладываются,
// поэтому стаб успевает встать до того, как расширение начнёт грузиться.
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

const ctx = {
  name1: 'Пользователь',
  name2: 'Лиза Воронова',
  chat,
  chat_metadata: chatMetadata,
  chatMetadata: chatMetadata,
  characters: { 0: { name: 'Лиза Воронова', description: 'девушка' } },
  characterId: 0,
  personas: { u1: { name: 'Пользователь', description: 'ночной житель' } },
  user_persona: 'u1',
  extensionSettings: {},
  extension_prompt_types: { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 },
  getCurrentChatId: () => 'demo',
  updateChatMetadata: (v) => Object.assign(chatMetadata, v),
  saveMetadata: async () => {},
  saveMetadataDebounced: () => {},
  saveSettingsDebounced: () => {},
  getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
  messageFormatting: (t) => t,
  setExtensionPrompt: (k, v) => { ctx.__prompts = ctx.__prompts || {}; ctx.__prompts[k] = v; },
  registerSlashCommand: () => {},
  registerFunctionTool: (d) => { ctx.__tools = ctx.__tools || {}; ctx.__tools[d.name] = d; },
  generateQuietPrompt: async () => '',
  generateRaw: async () => '',
  event_types: eventTypes,
  eventSource: {
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
    emit(type, ...a) { for (const fn of handlers.get(type) || []) fn(...a); },
    makeLast: () => {},
  },
};

window.__ctx = ctx;
window.jQuery = (fn) => { if (typeof fn === 'function') setTimeout(fn, 0); return { ready(){} }; };
window.$ = window.jQuery;
window.SillyTavern = { getContext: () => ctx };
window.toastr = { success(){}, error(){}, warning(){}, info(){} };

window.__reportErrors = [];
window.addEventListener('error', (e) => {
  window.__reportErrors.push('ERROR: ' + (e.message || e.error));
});
window.addEventListener('unhandledrejection', (e) => {
  window.__reportErrors.push('REJECTION: ' + (e.reason?.message || e.reason));
});
</script>

<script>
${bundle}
</script>

<script>
(async () => {
// ── проверки ───────────────────────────────────────────────────────
const results = [];
const check = (name, ok, meta = '') => results.push({ name, ok, meta });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = window.__ctx;
const eventTypes = ctx.event_types;

await sleep(80);
ctx.eventSource.emit(eventTypes.APP_INITIALIZED);
await sleep(150);

const core = window.__astralPhoneCore;
check('ядро телефона создано', !!core);
check('приложений зарегистрировано', (core?.apps?.size || 0) >= 5, 'n=' + (core?.apps?.size || 0));
check('инструмент phone_event зарегистрирован', !!ctx.__tools?.phone_event);
check('промпт-блок установлен', !!ctx.__prompts?.['astral-phone']);

// модель пишет ответ с тегом (как в жалобе)
ctx.chat.push({
  mes: 'Она смотрит на экран -> потом отводит взгляд.'
     + '<phone-event type="message_received" character="Лиза" description="ты не спишь?" />',
  is_user: false, name: 'Лиза Воронова',
});
ctx.eventSource.emit(eventTypes.MESSAGE_RECEIVED, ctx.chat.length - 1);
await sleep(50);

const state = core?.storage?.getState() || {};
check('сообщение из ответа попало в телефон', (state.messages || []).length === 1,
  'в сообщениях: ' + (state.messages || []).length);
check('текст сообщения верный', state.messages?.[0]?.text === 'ты не спишь?');
check('тег вырезан из сообщения в чате', !ctx.chat[ctx.chat.length - 1].mes.includes('phone-event'));

await ctx.__tools.phone_event.action({
  type: 'photo_taken', character: 'Лиза', description: 'у окна, вечерний свет',
});
await sleep(30);
check('фото из инструмента попало в галерею', (core.storage.getState().gallery || []).length === 1);

check('аккаунт персоны создан', !!core.storage.getState().account);

// рисуем список приложений
const names = [...(core?.apps?.keys() || [])];
document.getElementById('apps').innerHTML = names.map(n =>
  '<div class="app"><b>◈</b>' + n + '</div>').join('');
document.getElementById('clock').textContent = 'приложений: ' + names.length;

// результат
const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
document.getElementById('results').innerHTML = results.map(r =>
  '<div class="row"><span class="mark ' + (r.ok ? 'ok' : 'fail') + '">' + (r.ok ? '✓' : '✗')
  + '</span><span class="name">' + r.name + '</span><span class="meta">' + (r.meta || '') + '</span></div>'
).join('');
if (window.__reportErrors.length) {
  document.getElementById('results').innerHTML += '<div class="row"><span class="mark fail">✗</span>'
    + '<span class="name">ошибки страницы: ' + window.__reportErrors.map(e => String(e).replace(/</g,'&lt;')).join('; ')
    + '</span></div>';
}
document.getElementById('summary').innerHTML =
  '<b class="' + (failed ? 'fail' : 'ok') + '">' + passed + ' прошло, ' + failed + ' провалено</b>';
document.title = (failed ? '✗ ' : '✓ ') + passed + '/' + results.length;
})();
</script>
</body>
</html>
`;

await mkdir(path.join(root, 'out'), { recursive: true });
const outPath = path.join(root, 'out', 'report.html');
await writeFile(outPath, html, 'utf8');
console.log('written:', outPath, html.length, 'bytes');
