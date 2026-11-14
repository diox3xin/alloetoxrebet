# Система сообщений Astral Phone

Документация по архитектуре системы сообщений и обработке ошибок.

## Архитектура

### 1. Поток событий телефона

```
Модель → Инструмент phone_event / Тег <phone-event> 
  → index.js (registerFunctionTool / registerEventTagFallback)
  → PhoneCore.handleEvent()
  → Routing по типу события
  → Соответствующее приложение (messages/gallery/creator/notes/social/spicy)
```

**Типы событий:**
- `photo_taken` → Gallery
- `message_received` → Messages
- `content_posted` → Creator
- `donation_received` → Creator
- `subscriber_joined` → Creator
- `spicy_posted` → Spicy
- `note_written` → Notes
- `social_post` → Social

### 2. Messages App (`apps/messages.js`)

**Хранение:**
- Все сообщения в `storage.messages[]`
- Каждое сообщение: `{ id, character, role, text, from, fromUser, isIncoming, timestamp }`

**Форматы:**
- Старый: `fromUser: boolean`
- Новый: `from: 'me' | 'them'`
- Оба поддерживаются через `_isOut(msg)`

**Функции:**
- `_renderList()` — список тредов (группировка по character)
- `_renderThread(character)` — одна переписка
- `_sendMessage(character, text)` — отправить сообщение от юзера
- `_requestCharacterReply(character)` — запросить ответ от персонажа через LLM

**Генерация ответов:**
```javascript
const text = await generateMessage(ctx, { character, thread });
```
Использует `character-gen.js:generateMessage()` → `prompt-llm.js:ask()`

### 3. Генерация контента (`apps/character-gen.js`)

**API:**
- `generateMessage(ctx, {character, thread})` → Promise<string>
- `generateSocialPost(ctx, {author?})` → Promise<{author, text}>
- `generateNotes(ctx, {kind, count})` → Promise<Array<{kind, title, text}>>

**Внутренние функции:**
- `collectCast(ctx)` — кто есть в сюжете (charName, userName, cast[])
- `resolveName(ctx, 'char'|'user')` — имя из карточки
- `sceneContext(ctx, limit, chars)` — последние сообщения как контекст
- `cleanOutput(raw, maxLen)` — убрать предисловия и кавычки из ответа модели

**Индикатор «печатает»:**
```javascript
const stopTyping = showTyping(character);
// ... await generateMessage() ...
stopTyping();
```

### 4. API для промптов (`apps/prompt-llm.js`)

**Основная функция:**
```javascript
ask(prompt, {system?, responseLength?}) → Promise<string>
```

**Порядок fallback:**
1. Настроенный custom API (endpoint + model)
2. `ctx.generateRaw()`
3. `ctx.generateQuietPrompt()`

**HTTP функции:**
- `fetchModels(settings)` → Promise<string[]>
- `testConnection(settings)` → Promise<{ok, models, error?}>
- `callOpenAICompatible(prompt, systemPrompt, settings)` → Promise<string>

**Профили подключения:**
- Множественные профили (id, name, endpoint, apiKey, model, temperature, maxTokens)
- `listProfiles()`, `loadApiSettings()`, `saveApiSettings(patch)`
- `addProfile(name)`, `activateProfile(id)`, `removeProfile(id)`

## Система уведомлений (`apps/notifications.js`)

### Основные функции

**Показать уведомление:**
```javascript
showNotification(message, NotificationType.ERROR, {title?, timeout?})
```

**Готовые хелперы:**
```javascript
success('Операция выполнена')
info('Информация')
warn('Предупреждение')
error('Ошибка')
```

### Обработка ошибок API

**HTTP ошибки:**
```javascript
describeHttpError(status, body) → string
// Возвращает понятное описание:
// 401 → "Неверный API ключ (401). Проверьте ключ в настройках."
// 429 → "Превышен лимит запросов (429). Подождите немного."
// 500 → "Ошибка сервера (500)"
```

**Ошибки сети:**
```javascript
describeFetchError(error) → string
// AbortError → "Таймаут подключения..."
// CORS → "Ошибка CORS..."
// SSL → "Ошибка SSL сертификата..."
```

**Универсальный обработчик:**
```javascript
handleApiError(error, {silent?, prefix?}) → string
// Автоматически определяет тип ошибки и показывает toast
```

**Ошибки генерации:**
```javascript
handleGenerationError(error, context, {silent?})
// context = 'сообщение', 'пост', 'заметка'
// Показывает: "Не удалось сгенерировать <context>: <описание ошибки>"

handleImageGenerationError(error, {silent?})
// Специальная обработка для изображений (Haruspics, API ключи)
```

### Использование в приложениях

**Пример 1: Messages App**
```javascript
import { handleGenerationError, success, error as showError } from './notifications.js';

async _requestCharacterReply(character) {
    const stopTyping = showTyping(character);
    try {
        const text = await generateMessage(ctx, { character, thread });
        stopTyping();
        
        if (!text) {
            showError('Персонаж промолчал');
            return;
        }
        
        // ... сохранить и отрендерить ...
    } catch (err) {
        stopTyping();
        handleGenerationError(err, 'ответ персонажа');
    }
}
```

**Пример 2: Gallery App**
```javascript
import { handleImageGenerationError, success } from './notifications.js';

async _generate(index) {
    try {
        const url = await this.imageGen.generate(prompt, metadata);
        success('Готово');
    } catch (err) {
        handleImageGenerationError(err);
    }
}
```

**Пример 3: API подключение**
```javascript
import { handleApiError, describeHttpError } from './notifications.js';

try {
    const res = await fetch(url, ...);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        const error = new Error(describeHttpError(res.status, body));
        error.status = res.status;
        error.body = body;
        throw error;
    }
    // ...
} catch (err) {
    throw err; // будет обработан выше через handleApiError()
}
```

## Правила для разработчиков

### 1. Никогда не используйте прямые вызовы toastr

❌ **Плохо:**
```javascript
this._toast(`Ошибка: ${err.message}`, 'error');
window.toastr.error('Что-то сломалось');
```

✅ **Хорошо:**
```javascript
handleGenerationError(err, 'контекст');
error('Что-то сломалось');
```

### 2. Структурируйте ошибки HTTP

❌ **Плохо:**
```javascript
throw new Error(`HTTP ${res.status}: ${body}`);
```

✅ **Хорошо:**
```javascript
const error = new Error(describeHttpError(res.status, body));
error.status = res.status;
error.body = body;
throw error;
```

### 3. Различайте типы ошибок

- **API/сеть** → `handleApiError(err)`
- **Генерация текста** → `handleGenerationError(err, 'что')`
- **Генерация изображений** → `handleImageGenerationError(err)`
- **Успех** → `success('Описание')`

### 4. Убирайте информационные уведомления

Промежуточные сообщения типа "Генерирую…" не нужны — пользователь видит индикатор загрузки.
Показывайте только результат (success/error).

### 5. Всегда ловите ошибки async функций

❌ **Плохо:**
```javascript
async function doSomething() {
    const result = await apiCall(); // не обработано
}
```

✅ **Хорошо:**
```javascript
async function doSomething() {
    try {
        const result = await apiCall();
        success('Готово');
    } catch (err) {
        handleApiError(err);
    }
}
```

## Отладка

### Логи в консоли
Все уведомления дублируются в консоль с префиксом `[Astral Phone] [TYPE]`.

### Проверка структуры ошибок
```javascript
try {
    await something();
} catch (err) {
    console.log('Error object:', err);
    console.log('Has status?', 'status' in err);
    console.log('Has body?', 'body' in err);
}
```

### Тестирование подключения
```javascript
import { testConnection } from './prompt-llm.js';

const result = await testConnection({
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'sk-...',
});
console.log(result); // {ok: boolean, models: string[], error?: string}
```
