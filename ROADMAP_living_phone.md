# ROADMAP: Живой телефон для Astral Phone

## Цель
Сделать телефон **живым и автономным** — НПС публикуют посты, пишут сообщения, 
лайкают, подписываются БЕЗ постоянного вмешательства юзера. Телефон и чат 
неразрывно связаны через динамический промпт и восстановление состояния.

---

## Фаза 1: MVU — сохранение состояния (приоритет ВЫСОКИЙ)

### Проблема
Модель "забывает", что было 5 сообщений назад — лайки, подписчики, баланс исчезают.

### Решение: динамический инжект
Вместо однократного статичного блока в промпте, делать **живой срез состояния**:

```javascript
// apps/phone-prompt.js (уже есть, но нужно усилить)
export function buildDynamicPrompt(storage) {
    const state = storage.getState();
    const parts = [];
    
    // 1. Контакты и переписки
    const threads = groupMessagesByCharacter(state.messages);
    parts.push(`ACTIVE CONVERSATIONS:\n${formatThreads(threads)}`);
    
    // 2. Социальные метрики
    const social = getSocialMetrics(state);
    parts.push(`SOCIAL STATS: ${social.followers} followers, ${social.following} following`);
    parts.push(`Recent posts: ${social.recentPosts.map(p => `"${p.caption}" (${p.likes} likes)`).join(', ')}`);
    
    // 3. Creator Studio метрики
    if (state.creator?.account) {
        parts.push(`CREATOR ACCOUNT: ${state.creator.account.subscribers} subscribers, $${state.creator.account.balance} earned`);
    }
    
    // 4. Непрочитанные и активность
    parts.push(`UNREAD: ${countUnread(state)} new items across apps`);
    
    return parts.join('\n');
}
```

**Ключевой момент:** этот промпт обновляется **ПОСЛЕ КАЖДОГО события**.

### Реализация
- [ ] Расширить `apps/phone-prompt.js` — добавить детальное состояние всех приложений
- [ ] Добавить счётчики (подписчики, лайки, баланс) в динамический инжект
- [ ] Обновлять промпт через `refreshPhonePrompt()` после каждого события

---

## Фаза 2: Автономные НПС (приоритет ВЫСОКИЙ)

### Механизм: правила в промпте

Вместо того, чтобы модель генерировала посты только по запросу, дать ей **разрешение**:

```javascript
// В динамическом промпте:
`AUTONOMOUS NPC ACTIVITY:
НПС могут публиковать посты, комментировать и лайкать САМОСТОЯТЕЛЬНО, когда это уместно по сцене.

SOCIAL FEED RULES:
- НПС публикуют 1-2 поста за несколько сообщений чата
- Посты связаны с текущими событиями или их жизнью
- Используй <!--tel:social:{author, text, photo?}-->
- НПС могут лайкать СУЩЕСТВУЮЩИЕ посты: <!--tel:like:{postId, from}-->

MESSAGES RULES:
- НПС могут написать сообщение, если:
  * Что-то важное случилось в сцене
  * Прошло время и они хотят узнать о юзере
  * Есть причина связаться
- Не спамить: 1 сообщение на 5-7 сообщений чата максимум
- Используй <!--tel:sms:{from, text}-->

CREATOR STUDIO:
- Подписчики растут со временем: <!--tel:sub:{count}-->
- Донаты случаются редко: <!--tel:donate:{amount, from?}-->
- Комментарии под постами: <!--tel:comment:{postId, from, text}-->`
```

### Реализация
- [ ] Добавить правила автономной активности в `apps/phone-prompt.js`
- [ ] Создать парсер для новых тегов (`<!--tel:like-->`, `<!--tel:comment-->`, `<!--tel:sub-->`)
- [ ] Обработчики в `apps/social.js`, `apps/messages.js`, `apps/creator.js`

---

## Фаза 3: Восстановление состояния при перезагрузке (приоритет СРЕДНИЙ)

### Проблема
Если чат перезагрузился, все события из телефона "забылись".

### Решение: сканирование истории чата

Взять подход из Phone-ST:

```javascript
// apps/chat-scanner.js (новый)
export function scanChatHistory(context) {
    const chat = context.chat || [];
    const recovered = {
        messages: [],
        social: [],
        creator: [],
        // ...
    };
    
    // Проходим по ВСЕМ сообщениям в истории чата
    for (const msg of chat) {
        // Ищем скрытые теги событий
        const events = extractPhoneEvents(msg.mes);
        
        for (const event of events) {
            // Восстанавливаем состояние из тегов
            if (event.type === 'message_received') {
                recovered.messages.push({
                    character: event.character,
                    text: event.description,
                    timestamp: msg.send_date || Date.now(),
                });
            }
            // ... аналогично для других типов
        }
    }
    
    return recovered;
}
```

**Когда запускать:**
- При загрузке чата (`CHAT_LOADED`)
- При смене чата (`CHAT_CHANGED`)
- При первом открытии телефона в сессии

### Реализация
- [ ] Создать `apps/chat-scanner.js` с функцией сканирования
- [ ] Добавить восстановление в `index.js` → `registerChatSwitchHandler`
- [ ] Объединять восстановленное состояние с текущим (не перезаписывать всё)

---

## Фаза 4: Комментарии и лайки (приоритет СРЕДНИЙ)

### Новые типы событий

```javascript
// apps/social.js
export const EVENT_TYPES = {
    POST: 'social_post',      // уже есть
    LIKE: 'social_like',      // новый
    COMMENT: 'social_comment', // новый
    FOLLOW: 'social_follow',   // новый
    UNFOLLOW: 'social_unfollow', // новый
};

// Обработчик лайков
async handleLikeEvent(eventData) {
    const { postId, from } = eventData;
    const state = this.storage.getState();
    
    const post = state.social.find(p => p.id === postId);
    if (!post) return { success: false, error: 'Post not found' };
    
    if (!post.likes) post.likes = [];
    if (!post.likes.includes(from)) {
        post.likes.push(from);
    }
    
    this.storage.save();
    return { success: true };
}
```

### Визуальное отображение
- Показывать лайки под постами
- Показывать комментарии как диалоги под постом
- Счётчик подписчиков в профиле

### Реализация
- [ ] Добавить обработчики `social_like`, `social_comment`, `social_follow` в routing
- [ ] Обновить `apps/social.js` — поддержка лайков/комментов в UI
- [ ] Добавить в event-parser новые типы событий

---

## Фаза 5: Quiet Mode — пауза входящих (приоритет НИЗКИЙ)

### Зачем
Иногда юзер хочет сфокусироваться на сцене БЕЗ отвлечений от телефона.

### Решение
```javascript
// В настройках телефона (apps/settings.js)
quietMode: false

// В промпте:
if (settings.quietMode) {
    return `PHONE QUIET MODE: incoming phone activity is PAUSED.
    No new SMS, posts, likes or comments. Only user-initiated actions work.
    Existing state (balance, subscribers, plans) stays tracked.`;
}
```

### Реализация
- [ ] Добавить чекбокс Quiet Mode в настройки
- [ ] Обновить `apps/phone-prompt.js` — менять директиву в зависимости от режима
- [ ] Визуальный индикатор в UI (иконка паузы на launcher)

---

## Фаза 6: Рандомные события по таймеру (приоритет НИЗКИЙ)

### Идея
Телефон может генерировать события **вне сообщений чата** — по таймеру или триггерам.

### Примеры
- Каждые N минут реального времени → донат случайной суммы
- Раз в час → новый подписчик
- Утро по RP времени → "доброе утро" от НПС

### Механизм
```javascript
// apps/phone-timers.js (новый)
export function startPhoneTimers(storage, core) {
    // Донаты: 5-15 минут
    setInterval(() => {
        if (Math.random() < 0.3) { // 30% шанс
            const amount = Math.floor(Math.random() * 50) + 5;
            core.handleEvent({
                type: 'donation_received',
                metadata: { amount },
            });
        }
    }, 10 * 60 * 1000); // каждые 10 минут
    
    // Подписчики: каждый час
    setInterval(() => {
        core.handleEvent({
            type: 'subscriber_joined',
            metadata: { count: Math.floor(Math.random() * 5) + 1 },
        });
    }, 60 * 60 * 1000); // каждый час
}
```

⚠️ **Осторожно:** это может быть навязчиво. Сделать опциональным.

### Реализация
- [ ] Создать `apps/phone-timers.js`
- [ ] Добавить настройки частоты событий
- [ ] Запускать таймеры при открытии телефона, останавливать при закрытии

---

## Итоговый приоритет внедрения

### Этап 1 (критично для "живости"):
1. ✅ Динамический инжект состояния (MVU)
2. ✅ Автономные НПС через правила в промпте
3. ✅ Парсинг новых тегов (`like`, `comment`, `follow`)

### Этап 2 (стабильность):
4. Восстановление состояния из истории чата
5. UI для лайков/комментов/подписчиков

### Этап 3 (комфорт):
6. Quiet Mode
7. Рандомные события по таймеру (опционально)

---

## Технические детали

### Структура тегов (расширение существующих)

```html
<!-- Существующие -->
<phone-event type="social_post" character="Имя" description="текст поста" />

<!-- Новые -->
<phone-event type="social_like" postId="123" from="Имя" />
<phone-event type="social_comment" postId="123" from="Имя" description="текст коммента" />
<phone-event type="social_follow" from="Имя" />
<phone-event type="donation_received" amount="50" from="Имя" />
<phone-event type="subscriber_joined" count="3" />
```

### Обратная совместимость
Все новые функции — опциональные. Старые чаты работают как раньше.

---

## Вопросы для обсуждения

1. **Частота автономных событий:** Сколько НПС-активности комфортно? 
   - Вариант A: 1-2 поста на 10 сообщений чата
   - Вариант B: настраиваемый слайдер "активность НПС"

2. **Рандомные донаты/подписчики:** Включать по умолчанию или делать opt-in?

3. **Quiet Mode:** Кнопка в UI или только в настройках?

4. **Восстановление состояния:** Сканировать весь чат (медленно) или только последние 100 сообщений?
