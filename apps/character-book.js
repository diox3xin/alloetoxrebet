/**
 * CharacterBook — справочник внешности Astral Phone.
 *
 * Пользователь сам заводит записи «имя → внешность» в настройках расширения.
 * Дальше любая генерация изображения (галерея, creator studio, спайси) ищет
 * имена персонажей в промпте и подставляет внешность по совпадению.
 *
 * Сознательно не читает Haruspics: формат его библиотеки менялся несколько раз
 * и синхронизация по ключам оказалась хрупкой. Здесь источник истины — сам
 * пользователь, а ключ — обычное имя, которое он видит в интерфейсе.
 */

const MODULE = '[AstralCharBook]';

/** Ключ в extension_settings. */
/**
 * Ключ в extension_settings. Должен совпадать с MODULE_NAME в index.js
 * ('astral-phone') — иначе справочник пишется в один объект настроек,
 * а панель читает другой, и кнопки выглядят нерабочими.
 */
export const SETTINGS_KEY = 'astral-phone';

/* ─────────────────────────── хранилище ─────────────────────────── */

/* ─────────────────────────── профили книг ─────────────────────────── */

/**
 * Профиль справочника = отдельный набор персонажей. Пользователь переключает
 * их под разные чаты: один сеттинг — один профиль.
 *
 * Хранение: settings.characterBooks = [{id, name, characters[]}] + activeId.
 * Старый формат (settings.characters) мигрирует в первый профиль.
 */
function readBooks() {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        const settings = bag?.[SETTINGS_KEY];
        if (!settings || typeof settings !== 'object') return { books: [], activeId: '' };

        if (Array.isArray(settings.characterBooks)) {
            const books = settings.characterBooks
                .filter(b => b && typeof b === 'object')
                .map(b => ({
                    id: String(b.id || ''),
                    name: String(b.name || 'Профиль'),
                    characters: Array.isArray(b.characters) ? b.characters : [],
                }));
            return { books, activeId: String(settings.characterBooksActiveId || books[0]?.id || '') };
        }

        // миграция старого формата
        if (Array.isArray(settings.characters) && settings.characters.length) {
            const id = 'default';
            const books = [{ id, name: 'Default', characters: settings.characters }];
            settings.characterBooks = books;
            settings.characterBooksActiveId = id;
            return { books, activeId: id };
        }

        return { books: [], activeId: '' };
    } catch (_) {
        return { books: [], activeId: '' };
    }
}

function writeBooks(store) {
    try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (!bag) return false;
        if (!bag[SETTINGS_KEY]) bag[SETTINGS_KEY] = {};

        bag[SETTINGS_KEY].characterBooks = (store.books || []).map(b => ({
            id: b.id,
            name: b.name,
            characters: b.characters || [],
        }));
        bag[SETTINGS_KEY].characterBooksActiveId = store.activeId || '';

        // старое поле держим актуальным — на случай отката расширения
        const active = (store.books || []).find(b => b.id === store.activeId) || store.books?.[0];
        bag[SETTINGS_KEY].characters = active?.characters || [];

        const persist = ctx?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
        if (typeof persist === 'function') persist();
        return true;
    } catch (err) {
        console.warn(`${MODULE} writeBooks failed:`, err?.message || err);
        return false;
    }
}

/** Список профилей справочника. */
export function listBooks() {
    return readBooks();
}

/** Создать профиль. */
export function addBook(name) {
    const store = readBooks();
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    store.books.push({ id, name: String(name || `Профиль ${store.books.length + 1}`), characters: [] });
    store.activeId = id;
    writeBooks(store);
    return id;
}

/** Переключить активный профиль. */
export function activateBook(id) {
    const store = readBooks();
    if (!store.books.some(b => b.id === id)) return false;
    store.activeId = id;
    return writeBooks(store);
}

/** Переименовать профиль. */
export function renameBook(id, name) {
    const store = readBooks();
    const b = store.books.find(x => x.id === id);
    if (!b) return false;
    b.name = String(name || b.name);
    return writeBooks(store);
}

/** Удалить профиль. Последний удалить нельзя. */
export function removeBook(id) {
    const store = readBooks();
    if (store.books.length <= 1) return false;
    store.books = store.books.filter(b => b.id !== id);
    if (store.activeId === id) store.activeId = store.books[0]?.id || '';
    return writeBooks(store);
}

/* ─────────────────────────── записи ─────────────────────────── */

/**
 * Записи активного профиля справочника.
 * Никогда не бросает: при отсутствии настроек возвращает пустой массив.
 *
 * @returns {Array<{name: string, appearance: string, aliases: string, enabled: boolean}>}
 */
export function loadCharacters() {
    try {
        const store = readBooks();
        const active = store.books.find(b => b.id === store.activeId) || store.books[0];
        const list = active?.characters;
        if (!Array.isArray(list)) return [];
        return list
            .filter(row => row && typeof row === 'object')
            .map(row => ({
                name: String(row.name || '').trim(),
                aliases: String(row.aliases || '').trim(),
                appearance: String(row.appearance || '').trim(),
                enabled: row.enabled !== false,
            }));
    } catch (err) {
        console.warn(`${MODULE} load failed:`, err?.message || err);
        return [];
    }
}

/** Сохраняет справочник в extension_settings. */
export function saveCharacters(list) {
    try {
        const store = readBooks();

        // если профилей ещё нет — создаём первый
        if (!store.books.length) {
            const id = 'default';
            store.books = [{ id, name: 'Default', characters: [] }];
            store.activeId = id;
        }

        const active = store.books.find(b => b.id === store.activeId) || store.books[0];
        active.characters = (list || []).map(row => ({
            name: String(row.name || ''),
            aliases: String(row.aliases || ''),
            appearance: String(row.appearance || ''),
            enabled: row.enabled !== false,
        }));

        return writeBooks(store);
    } catch (err) {
        console.warn(`${MODULE} save failed:`, err?.message || err);
        return false;
    }
}

/* ─────────────────────────── поиск ─────────────────────────── */

/** Все имена, по которым матчится запись: имя + алиасы через запятую. */
function keysOf(row) {
    const out = [row.name];
    for (const alias of String(row.aliases || '').split(',')) {
        const trimmed = alias.trim();
        if (trimmed) out.push(trimmed);
    }
    return out.filter(Boolean);
}

/**
 * Экранирование регулярки.
 */
function escapeRe(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Проверяет, встречается ли имя в тексте как отдельное слово.
 * Границы слова не применяются к нелатинским именам — там \b не работает.
 */
function mentions(text, name) {
    const n = String(name || '').trim();
    if (!n) return false;

    if (/^[A-Za-z0-9 _.'-]+$/.test(n)) {
        // латиница: ищем как отдельное слово, без учёта регистра
        const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}($|[^A-Za-z0-9])`, 'i');
        return re.test(text);
    }

    // кириллица и прочее: просто вхождение без учёта регистра
    return text.toLowerCase().includes(n.toLowerCase());
}

/**
 * Внешность всех персонажей, упомянутых в промпте.
 *
 * @param {string} prompt текст промпта, который уходит в генерацию
 * @returns {{appearance: string[], names: string[]}}
 */
export function matchCharacters(prompt) {
    const text = String(prompt || '');
    if (!text) return { appearance: [], names: [] };

    const list = loadCharacters();
    const appearance = [];
    const names = [];

    for (const row of list) {
        if (!row.enabled) continue;
        if (!row.name || !row.appearance) continue;   // незаполненная запись
        const hit = keysOf(row).some(key => mentions(text, key));
        if (!hit) continue;
        if (!appearance.includes(row.appearance)) {
            appearance.push(row.appearance);
            names.push(row.name);
        }
    }

    if (appearance.length) {
        console.log(`${MODULE} подставлена внешность: ${names.join(', ')}`);
    }

    return { appearance, names };
}

/**
 * Дописывает внешность в промпт.
 *
 * Внешность вставляется ДО quality-тегов: NovelAI читает описания слева
 * направо, и описание внешности в начале весит больше, чем в хвосте.
 * Повторный вызов на уже обработанном промпте ничего не дублирует.
 *
 * @param {string} prompt
 * @returns {string}
 */
export function injectAppearance(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return text;

    const { appearance } = matchCharacters(text);
    if (!appearance.length) return text;

    // не дублируем, если внешность уже есть
    const missing = appearance.filter(a => !text.toLowerCase().includes(a.toLowerCase()));
    if (!missing.length) return text;

    return `${missing.join(', ')}, ${text}`;
}

/* ─────────────────────────── UI ─────────────────────────── */

/**
 * Рендер редактора справочника.
 * Разметка намеренно минимальна: она встраивается и в панель ST, и в приложение
 * Settings телефона, у которых разные контейнеры и стили.
 *
 * @returns {string} html
 */
export function renderCharacterBookHTML() {
    const list = loadCharacters();

    const rows = list.map((row, i) => `
        <div class="astral-charbook-row" data-index="${i}">
            <input type="text" class="text_pole astral-charbook-name"
                   value="${escAttr(row.name)}" placeholder="Имя (как в промпте)" data-i="${i}" />
            <input type="text" class="text_pole astral-charbook-aliases"
                   value="${escAttr(row.aliases)}" placeholder="Алиасы, через запятую" data-i="${i}" />
            <textarea class="text_pole astral-charbook-appearance" rows="2"
                      placeholder="Внешность: волосы, глаза, телосложение, одежда" data-i="${i}">${escText(row.appearance)}</textarea>
            <div class="astral-charbook-actions">
                <label class="astral-charbook-toggle">
                    <input type="checkbox" class="astral-charbook-enabled" data-i="${i}" ${row.enabled ? 'checked' : ''} />
                    <span>вкл</span>
                </label>
                <button class="menu_button astral-charbook-remove" data-i="${i}" title="Удалить">✕</button>
            </div>
        </div>
    `).join('');

    const store = readBooks();
    const options = store.books
        .map(b => `<option value="${escAttr(b.id)}" ${b.id === store.activeId ? 'selected' : ''}>${escText(b.name)}</option>`)
        .join('');

    const profilesBar = `
        <div class="astral-book-profiles">
            <select class="text_pole astral-book-select" title="Профиль справочника">${options}</select>
            <button class="menu_button astral-book-new" title="Новый профиль">+</button>
            <button class="menu_button astral-book-rename" title="Переименовать">✎</button>
            <button class="menu_button astral-book-del" title="Удалить профиль" ${store.books.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
        <small class="notes">Профиль — отдельный набор персонажей. Переключайте его под разные чаты.</small>
    `;

    return `
        <div class="astral-charbook">
            ${profilesBar}
            <div class="astral-charbook-list">${rows || '<div class="astral-charbook-empty">Пока пусто — добавьте первого персонажа</div>'}</div>
            <button class="menu_button astral-charbook-add">+ Добавить персонажа</button>
            <small class="notes">Имя ищется в промпте (и в алиасах) без учёта регистра. Найденная внешность подставляется в начало промпта при генерации любого изображения.</small>
        </div>
    `;
}

/** Перерисовка справочника с перепривязкой обработчиков. */
function reRender(root, onChange) {
    const host = root.querySelector('.astral-charbook');
    if (!host) return;
    host.outerHTML = renderCharacterBookHTML();
    bindCharacterBook(root, onChange);
    onChange?.(loadCharacters());
}

/**
 * Навешивает обработчики на отрендеренный справочник.
 * @param {HTMLElement} root контейнер, внутри которого лежит .astral-charbook
 * @param {Function} [onChange] вызывается после каждого сохранения
 */
export function bindCharacterBook(root, onChange) {
    const book = root?.querySelector('.astral-charbook');
    if (!book) return;

    const commit = () => {
        const list = [];
        book.querySelectorAll('.astral-charbook-row').forEach(row => {
            list.push({
                name: row.querySelector('.astral-charbook-name')?.value || '',
                aliases: row.querySelector('.astral-charbook-aliases')?.value || '',
                appearance: row.querySelector('.astral-charbook-appearance')?.value || '',
                enabled: row.querySelector('.astral-charbook-enabled')?.checked !== false,
            });
        });
        saveCharacters(list);
        onChange?.(list);
    };

    book.querySelectorAll('.astral-charbook-name, .astral-charbook-aliases, .astral-charbook-appearance')
        .forEach(el => el.addEventListener('input', commit));

    book.querySelectorAll('.astral-charbook-enabled')
        .forEach(el => el.addEventListener('change', commit));

    book.querySelectorAll('.astral-charbook-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const i = Number(btn.dataset.i);
            const list = loadCharacters();
            list.splice(i, 1);
            saveCharacters(list);
            reRender(root, onChange);
        });
    });

    // ── профили справочника ──
    book.querySelector('.astral-book-select')?.addEventListener('change', (e) => {
        activateBook(e.target.value);
        reRender(root, onChange);
    });

    book.querySelector('.astral-book-new')?.addEventListener('click', (e) => {
        e.preventDefault();
        const name = globalThis.prompt?.('Название профиля:', `Профиль ${listBooks().books.length + 1}`);
        if (name === null) return;
        addBook(String(name || '').trim());
        reRender(root, onChange);
    });

    book.querySelector('.astral-book-rename')?.addEventListener('click', (e) => {
        e.preventDefault();
        const store = listBooks();
        const active = store.books.find(b => b.id === store.activeId);
        if (!active) return;
        const name = globalThis.prompt?.('Новое название:', active.name);
        if (name === null) return;
        renameBook(active.id, String(name || '').trim());
        reRender(root, onChange);
    });

    book.querySelector('.astral-book-del')?.addEventListener('click', (e) => {
        e.preventDefault();
        const store = listBooks();
        if (store.books.length <= 1) return;
        if (!globalThis.confirm?.('Удалить профиль со всеми персонажами?')) return;
        removeBook(store.activeId);
        reRender(root, onChange);
    });

    book.querySelector('.astral-charbook-add')?.addEventListener('click', (e) => {
        e.preventDefault();

        const list = loadCharacters();
        list.push({ name: '', aliases: '', appearance: '', enabled: true });
        saveCharacters(list);

        reRender(root, onChange);

        // фокус в новое имя
        const rows = root.querySelectorAll('.astral-charbook-row');
        rows[rows.length - 1]?.querySelector('.astral-charbook-name')?.focus();
    });
}

/* ─────────────────────────── утилиты ─────────────────────────── */

function escAttr(str) {
    return String(str ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function escText(str) {
    return String(str ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}