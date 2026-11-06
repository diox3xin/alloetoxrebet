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

/**
 * Записи справочника из extension_settings.
 * Никогда не бросает: при отсутствии настроек возвращает пустой массив.
 *
 * @returns {Array<{name: string, appearance: string, aliases: string, enabled: boolean}>}
 */
export function loadCharacters() {
    try {
        const bag = globalThis.extension_settings;
        const settings = bag?.[SETTINGS_KEY] || globalThis.SillyTavern?.getContext?.()?.extensionSettings?.[SETTINGS_KEY];
        const list = settings?.characters;
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
        const ctx = globalThis.SillyTavern?.getContext?.();
        // ctx.extensionSettings — тот же объект, что и глобальный extension_settings,
        // но берём его первым: глобал отсутствует в некоторых сборках.
        const bag = ctx?.extensionSettings || globalThis.extension_settings;
        if (!bag) throw new Error('extension_settings недоступен');

        if (!bag[SETTINGS_KEY]) bag[SETTINGS_KEY] = {};
        bag[SETTINGS_KEY].characters = (list || []).map(row => ({
            name: row.name || '',
            aliases: row.aliases || '',
            appearance: row.appearance || '',
            enabled: row.enabled !== false,
        }));

        // Персистим через штатный механизм ST
        const persist = ctx?.saveSettingsDebounced
            || globalThis.saveSettingsDebounced
            || ctx?.saveSettings;
        if (typeof persist === 'function') persist();
        return true;
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

    return `
        <div class="astral-charbook">
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