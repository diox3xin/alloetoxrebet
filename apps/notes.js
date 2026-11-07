/**
 * Notes — приватные записи персонажа: дневник, планы, секреты.
 *
 * Это НЕ переписка и не публичный пост: заметки никто не видит, кроме
 * владельца телефона. Модель пишет их через phone_event (note_written),
 * пользователь может создавать, редактировать и удалять их сам.
 *
 * Заметки влияют на РП: в динамический промпт попадают последние записи,
 * чтобы персонаж «помнил», что он сам записал.
 */

import { ICONS } from './phone-core.js';

/** Типы записей — задают цвет и иконку. */
const NOTE_KINDS = {
    diary: { label: 'Дневник', mark: '❦' },
    plan: { label: 'План', mark: '◈' },
    secret: { label: 'Секрет', mark: '✦' },
    note: { label: 'Заметка', mark: '·' },
};

export class NotesApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'notes';
        this.title = 'Notes';
        this.icon = ICONS.notes;
        this._openId = null;     // открытая заметка
        this._filter = 'all';    // all | diary | plan | secret
    }

    render(container) {
        if (this._openId) {
            this._renderSingle(container);
            return;
        }
        this._renderList(container);
    }

    /* ─────────────────────────── список ─────────────────────────── */

    _renderList(container) {
        const state = this.storage.getState();
        const all = Array.isArray(state.notes) ? [...state.notes] : [];

        const counts = { all: all.length };
        for (const key of Object.keys(NOTE_KINDS)) {
            counts[key] = all.filter(n => (n.kind || 'note') === key).length;
        }

        const filtered = this._filter === 'all'
            ? all
            : all.filter(n => (n.kind || 'note') === this._filter);

        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        container.innerHTML = '';

        // табы фильтров
        const tabs = document.createElement('div');
        tabs.className = 'astral-note-tabs';
        for (const [key, label] of [['all', 'Все'], ...Object.entries(NOTE_KINDS).map(([k, v]) => [k, v.label])]) {
            const count = counts[key] || 0;
            if (key !== 'all' && count === 0) continue;

            const tab = document.createElement('button');
            tab.className = `astral-note-tab ${this._filter === key ? 'active' : ''}`;
            tab.textContent = count ? `${label} ${count}` : label;
            tab.addEventListener('click', () => {
                this._filter = key;
                this.render(container);
            });
            tabs.appendChild(tab);
        }
        container.appendChild(tabs);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'astral-empty-state';
            empty.innerHTML = `
                <div class="astral-empty-state-icon">${ICONS.notes}</div>
                <div>Записей нет</div>
                <div class="astral-empty-hint">Персонаж пишет их сам, или добавь свою кнопкой ниже</div>`;
            container.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'astral-note-list';

            for (const note of filtered) {
                list.appendChild(this._buildCard(note, container));
            }
            container.appendChild(list);
        }

        const bar = document.createElement('div');
        bar.className = 'astral-action-bar';
        const addBtn = document.createElement('button');
        addBtn.className = 'astral-btn astral-btn-primary astral-btn-wide';
        addBtn.textContent = '+ Новая запись';
        addBtn.addEventListener('click', () => this._openEditor(null, container));
        bar.appendChild(addBtn);
        container.appendChild(bar);
    }

    _buildCard(note, container) {
        const kind = NOTE_KINDS[note.kind] || NOTE_KINDS.note;

        const card = document.createElement('div');
        card.className = `astral-note-card astral-note-card--${note.kind || 'note'}`;
        card.innerHTML = `
            <div class="astral-note-head">
                <span class="astral-note-mark">${kind.mark}</span>
                <span class="astral-note-kind">${this._esc(kind.label)}</span>
                <span class="astral-note-time">${this._time(note.timestamp)}</span>
            </div>
            ${note.title ? `<div class="astral-note-title">${this._esc(note.title)}</div>` : ''}
            <div class="astral-note-excerpt">${this._esc(this._excerpt(note.text))}</div>
        `;

        card.addEventListener('click', () => {
            this._openId = note.id;
            this.render(container);
        });

        return card;
    }

    /* ─────────────────────────── одна заметка ─────────────────────────── */

    _renderSingle(container) {
        const state = this.storage.getState();
        const note = (state.notes || []).find(n => n.id === this._openId);

        if (!note) {
            this._openId = null;
            this._renderList(container);
            return;
        }

        const kind = NOTE_KINDS[note.kind] || NOTE_KINDS.note;

        container.innerHTML = `
            <div class="astral-note-open">
                <div class="astral-note-open-head">
                    <button class="astral-note-back">‹ Назад</button>
                    <span class="astral-note-kind">${this._esc(kind.label)}</span>
                    <span class="astral-note-time">${this._time(note.timestamp)}</span>
                </div>
                ${note.title ? `<h2 class="astral-note-open-title">${this._esc(note.title)}</h2>` : ''}
                <div class="astral-note-open-text">${this._esc(note.text).replace(/\n/g, '<br>')}</div>
                <div class="astral-action-bar">
                    <button class="astral-btn" id="astral-note-edit">Редактировать</button>
                    <button class="astral-btn astral-btn-danger" id="astral-note-del">Удалить</button>
                </div>
            </div>
        `;

        container.querySelector('.astral-note-back').addEventListener('click', () => {
            this._openId = null;
            this.render(container);
        });

        container.querySelector('#astral-note-edit').addEventListener('click', () => {
            this._openEditor(note, container);
        });

        container.querySelector('#astral-note-del').addEventListener('click', () => {
            if (!confirm('Удалить запись?')) return;
            const st = this.storage.getState();
            st.notes = (st.notes || []).filter(n => n.id !== note.id);
            this.storage.save();
            this._openId = null;
            this._toast('Запись удалена');
            this.render(container);
        });
    }

    /* ─────────────────────────── редактор ─────────────────────────── */

    _openEditor(note, container) {
        const isNew = !note;
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--composer">
                <div class="astral-modal-title">${isNew ? 'Новая запись' : 'Редактировать'}</div>

                <label class="astral-field-label">Тип</label>
                <select class="astral-select" id="astral-note-kind">
                    ${Object.entries(NOTE_KINDS).map(([k, v]) =>
                        `<option value="${k}" ${((note?.kind) || 'diary') === k ? 'selected' : ''}>${v.label}</option>`
                    ).join('')}
                </select>

                <label class="astral-field-label">Заголовок</label>
                <input type="text" class="astral-input" id="astral-note-title"
                       value="${this._esc(note?.title || '')}" placeholder="Необязательно">

                <label class="astral-field-label">Текст</label>
                <textarea class="astral-textarea" id="astral-note-text"
                          rows="6" placeholder="О чём запись…">${this._esc(note?.text || '')}</textarea>

                <div class="astral-modal-actions">
                    <button class="astral-btn" id="astral-note-cancel">Отмена</button>
                    <button class="astral-btn astral-btn-primary" id="astral-note-save">Сохранить</button>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        overlay.querySelector('#astral-note-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('#astral-note-save').addEventListener('click', () => {
            const kind = overlay.querySelector('#astral-note-kind').value;
            const title = overlay.querySelector('#astral-note-title').value.trim();
            const text = overlay.querySelector('#astral-note-text').value.trim();
            if (!text) return;

            const state = this.storage.getState();
            if (!Array.isArray(state.notes)) state.notes = [];

            if (isNew) {
                state.notes.push({
                    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    kind,
                    title,
                    text,
                    timestamp: Date.now(),
                    author: 'user',
                });
            } else {
                const target = state.notes.find(n => n.id === note.id);
                if (target) {
                    Object.assign(target, { kind, title, text, edited: Date.now() });
                }
            }

            this.storage.save();
            close();
            this._openId = isNew ? null : this._openId;
            this._toast(isNew ? 'Запись добавлена' : 'Запись обновлена');
            this.render(document.querySelector('.astral-phone-body'));
            this._refreshPrompt();
        });

        overlay.querySelector('#astral-note-text').focus();
    }

    /* ─────────────────────────── события ─────────────────────────── */

    async handleEvent(eventData) {
        const state = this.storage.getState();
        if (!Array.isArray(state.notes)) state.notes = [];

        const text = String(eventData.description || eventData.text || '').trim();
        if (!text) return { success: false, message: 'Пустая запись' };

        // metadata приходит вложенным объектом: { metadata: { title, kind } }
        const meta = eventData.metadata || {};

        const kind = [eventData.kind, meta.kind].find(k => ['diary', 'plan', 'secret', 'note'].includes(k)) || 'diary';
        const title = String(eventData.title || meta.title || '').trim();

        state.notes.push({
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            kind,
            title,
            text,
            timestamp: Date.now(),
            author: 'character',
            character: eventData.character || '',
        });

        this.storage.save();
        this._refreshPrompt();
        return { success: true, message: 'Запись добавлена' };
    }

    /* ─────────────────────────── утилиты ─────────────────────────── */

    _excerpt(text) {
        const src = String(text || '').replace(/\s+/g, ' ').trim();
        return src.length > 110 ? `${src.slice(0, 110)}…` : src;
    }

    _refreshPrompt() {
        try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }
    }

    _toast(text, kind = 'info') {
        if (window.toastr) (toastr[kind] || toastr.info)(text);
        else console.log(`[Notes] ${text}`);
    }

    _time(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleString('ru-RU', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}

/**
 * Текст заметок для динамического промпта: персонаж должен помнить,
 * что сам записал — это влияет на его поведение в сцене.
 *
 * @param {object} state состояние телефона
 * @param {number} limit сколько последних записей брать
 * @returns {string}
 */
export function buildNotesPromptBlock(state, limit = 5) {
    const notes = Array.isArray(state?.notes) ? state.notes : [];
    if (!notes.length) return '';

    const recent = [...notes]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit)
        .reverse();

    const lines = recent.map(n => {
        const kind = NOTE_KINDS[n.kind] || NOTE_KINDS.note;
        const title = n.title ? `${n.title}: ` : '';
        return `- [${kind.label}] ${title}${String(n.text || '').replace(/\s+/g, ' ').slice(0, 180)}`;
    });

    return `[Astral Phone — личные заметки]\nПерсонаж ведёт их сам, это его приватные мысли:\n${lines.join('\n')}`;
}