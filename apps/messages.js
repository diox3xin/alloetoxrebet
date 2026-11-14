/**
 * Messages — SMS threads with characters.
 * Supports both live messages (fromUser boolean) and pre-seeded messages
 * (from: 'them' | 'me') from ContactSeeder.
 */

import { ICONS } from './phone-core.js';
import { showTyping, generateMessage } from './character-gen.js';
import { handleGenerationError, success, error as showError } from './notifications.js';
import { openNPCProfile } from './profile-view.js';

export class MessagesApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'messages';
        this.title = 'Messages';
        this.icon = ICONS.messages;
        this._thread = null;   // currently open character name
    }

    render(container, params = {}) {
        if (params.character !== undefined) this._thread = params.character || null;

        if (this._thread) {
            this._renderThread(container, this._thread);
        } else {
            this._renderList(container);
        }
    }

    /* ─────────────────────────── thread list ─────────────────────────── */

    _renderList(container) {
        const state = this.storage.getState();
        const messages = state.messages || [];

        container.innerHTML = '';

        if (messages.length === 0) {
            const seeding = globalThis.__astralSeeding === true;
            container.innerHTML = seeding
                ? `
                <div class="astral-empty-state astral-seeding">
                    <div class="astral-seeding-dots"><span></span><span></span><span></span></div>
                    <div>Набираю переписку…</div>
                    <div class="astral-empty-hint">Персонажи придумывают, что тебе написать</div>
                </div>`
                : `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.messages}</div>
                    <div>Нет переписки</div>
                    <div class="astral-empty-hint">Переписка появится автоматически, или сгенерируй вручную</div>
                    <button class="astral-btn astral-btn-primary astral-regen-btn" id="astral-seed-now">
                        Сгенерировать переписку
                    </button>
                </div>`;

            container.querySelector('#astral-seed-now')?.addEventListener('click', () => {
                this._runSeed(container, false);
            });
            return;
        }

        // Group by character, collect last message and role
        const threads = new Map();
        for (const msg of messages) {
            const key = msg.character || 'Неизвестный';
            const entry = threads.get(key);
            if (!entry || msg.timestamp > entry.last.timestamp) {
                threads.set(key, { last: msg, role: msg.role || entry?.role || '' });
            } else if (!entry.role && msg.role) {
                entry.role = msg.role;
            }
        }

        // ── Поиск + кнопка перегенерации ──
        const searchWrap = document.createElement('div');
        searchWrap.className = 'astral-search-wrap';
        searchWrap.innerHTML = `
            <input class="astral-search-input" id="astral-msg-search"
                   placeholder="Поиск…" autocomplete="off" type="search" />
            <button class="astral-msg-regen-btn" id="astral-msg-regen" title="Перегенерировать переписку">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
            </button>`;
        container.appendChild(searchWrap);

        searchWrap.querySelector('#astral-msg-regen').addEventListener('click', () => {
            this._runSeed(container, true);
        });

        const list = document.createElement('div');
        list.className = 'astral-thread-list';

        const renderItems = (query = '') => {
            list.innerHTML = '';
            const q = query.trim().toLowerCase();
            for (const [char, { last, role }] of threads) {
                if (q && !char.toLowerCase().includes(q) &&
                    !String(last.text || '').toLowerCase().includes(q)) continue;

                const item = document.createElement('div');
                item.className = 'astral-msg-item';
                const isOut = this._isOut(last);
                item.innerHTML = `
                    <div class="astral-msg-avatar">${this._esc((char[0] || '?').toUpperCase())}</div>
                    <div class="astral-msg-content">
                        <div class="astral-msg-name-row">
                            <span class="astral-msg-name">${this._esc(char)}</span>
                            ${role ? `<span class="astral-msg-role">${this._esc(role)}</span>` : ''}
                        </div>
                        <div class="astral-msg-preview ${isOut ? 'astral-msg-preview--out' : ''}">
                            ${isOut ? '→ ' : ''}${this._esc(this._truncate(last.text, 48))}
                        </div>
                    </div>
                    <div class="astral-msg-time">${this._time(last.timestamp)}</div>
                `;
                item.addEventListener('click', () => {
                    this._thread = char;
                    this.render(document.querySelector('.astral-phone-body'));
                });
                list.appendChild(item);
            }

            if (list.children.length === 0) {
                list.innerHTML = `<div class="astral-empty-state" style="padding:24px 0">
                    <div>Ничего не найдено</div></div>`;
            }
        };

        renderItems();

        searchWrap.querySelector('#astral-msg-search').addEventListener('input', (e) => {
            renderItems(e.target.value);
        });

        container.appendChild(list);
    }

    /* ─────────────────────────── seed ─────────────────────────── */

    async _runSeed(container, force) {
        const seeder = globalThis.__astralSeeder;
        if (!seeder) {
            showError('Сидер недоступен — обновите страницу');
            return;
        }
        globalThis.__astralSeeding = true;
        this.render(container);

        try {
            const res = await seeder.seed({ force, onProgress: () => {} });
            if (res.skipped) {
                // force=false и уже засеяно — не должно быть, но на всякий
            }
        } catch (err) {
            showError(`Не удалось сгенерировать переписку: ${err.message}`);
        } finally {
            globalThis.__astralSeeding = false;
            this.render(container);
        }
    }

    /* ─────────────────────────── single thread ─────────────────────────── */

    _renderThread(container, character) {
        const state = this.storage.getState();
        const msgs = (state.messages || []).filter(m => m.character === character);
        const role = msgs.find(m => m.role)?.role || '';

        container.innerHTML = '';

        // Back header
        const header = document.createElement('div');
        header.className = 'astral-thread-header';
        header.innerHTML = `
            <button class="astral-back-btn" id="astral-thread-back">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.2">
                    <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
                </svg>
            </button>
            <div class="astral-thread-avatar astral-thread-avatar--clickable" id="astral-thread-avatar">${this._esc((character[0] || '?').toUpperCase())}</div>
            <div class="astral-thread-info">
                <div class="astral-thread-name">${this._esc(character)}</div>
                ${role ? `<div class="astral-thread-role">${this._esc(role)}</div>` : ''}
            </div>
            <button class="astral-thread-edit-btn" id="astral-thread-edit" title="Редактировать контакт">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
                </svg>
            </button>
        `;
        container.appendChild(header);

        // Bubble area
        const wrap = document.createElement('div');
        wrap.className = 'astral-thread';

        if (msgs.length === 0) {
            wrap.innerHTML = `<div class="astral-empty-state"><div>Пусто</div></div>`;
        }

        for (const msg of msgs) {
            const isOut = this._isOut(msg);
            const bubble = document.createElement('div');
            bubble.className = `astral-bubble ${isOut ? 'astral-bubble--out' : 'astral-bubble--in'}`;
            bubble.dataset.msgId = msg.id || '';
            bubble.innerHTML = `
                <div class="astral-bubble-text">${this._esc(msg.text)}</div>
                <div class="astral-bubble-time">${this._time(msg.timestamp, true)}</div>
            `;

            // Удаление доступно для ЛЮБОГО сообщения, включая реплики персонажа:
            // это инструмент редактирования сцены, а не «моя переписка».
            this._bindDeleteGesture(bubble, msg, character);

            wrap.appendChild(bubble);
        }

        container.appendChild(wrap);
        wrap.scrollTop = wrap.scrollHeight;

        header.querySelector('#astral-thread-back').addEventListener('click', () => {
            this._thread = null;
            this.render(document.querySelector('.astral-phone-body'));
        });

        header.querySelector('#astral-thread-avatar').addEventListener('click', () => {
            openNPCProfile(character, this.storage, this.context, globalThis.__astralPhoneCore);
        });

        header.querySelector('#astral-thread-edit').addEventListener('click', () => {
            this._openContactEditor(character, role);
        });

        // ── composer ──
        const composer = document.createElement('div');
        composer.className = 'astral-msg-composer';
        composer.innerHTML = `
            <input class="astral-msg-input" id="astral-msg-input" type="text"
                   placeholder="Сообщение…" autocomplete="off">
            <button class="astral-msg-send" id="astral-msg-send" title="Отправить">
                <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor"
                     fill="none" stroke-width="2.2" stroke-linecap="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
                </svg>
            </button>
            <button class="astral-msg-reply-btn" id="astral-msg-reply-btn" title="Ответить от персонажа">
                <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor"
                     fill="none" stroke-width="2.2">
                    <path d="M20 15a2 2 0 0 1-2 2H4l-5 5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
        `;
        container.appendChild(composer);

        const input = composer.querySelector('#astral-msg-input');
        const send = () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            this._sendMessage(character, text);
        };
        composer.querySelector('#astral-msg-send').addEventListener('click', send);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });

        // ── reply button: trigger character response ──
        composer.querySelector('#astral-msg-reply-btn').addEventListener('click', () => {
            this._requestCharacterReply(character);
        });
    }

    /* ─────────────────────────── редактирование контакта ─────────────────────────── */

    _openContactEditor(character, currentRole) {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        const overlay = document.createElement('div');
        overlay.className = 'astral-modal';
        overlay.innerHTML = `
            <div class="astral-modal-card astral-modal-card--sheet">
                <div class="astral-modal-title">Контакт</div>

                <label class="astral-field-label">Имя</label>
                <input class="astral-text-input" id="astral-contact-name"
                       type="text" value="${this._esc(character)}" placeholder="Имя контакта" />

                <label class="astral-field-label">Роль / описание</label>
                <input class="astral-text-input" id="astral-contact-role"
                       type="text" value="${this._esc(currentRole)}"
                       placeholder="Например: лучший друг, менеджер, бывший…" />

                <div class="astral-contact-editor-actions">
                    <button class="astral-btn astral-btn--danger" id="astral-contact-delete">
                        Удалить переписку
                    </button>
                    <div class="astral-contact-editor-right">
                        <button class="astral-btn" id="astral-contact-cancel">Отмена</button>
                        <button class="astral-btn astral-btn-primary" id="astral-contact-save">Сохранить</button>
                    </div>
                </div>
            </div>
        `;

        phone.appendChild(overlay);
        const close = () => overlay.remove();

        const nameInput = overlay.querySelector('#astral-contact-name');
        nameInput.focus();
        nameInput.select();

        overlay.querySelector('#astral-contact-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#astral-contact-save').addEventListener('click', () => {
            const newName = nameInput.value.trim();
            const newRole = overlay.querySelector('#astral-contact-role').value.trim();

            if (!newName) return;

            const state = this.storage.getState();

            // Переименовываем все сообщения в треде
            for (const msg of (state.messages || [])) {
                if (msg.character === character) {
                    msg.character = newName;
                    if (newRole) msg.role = newRole;
                }
            }

            this.storage.save();
            try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }

            close();
            // Переходим в переименованный тред
            this._thread = newName;
            this.render(document.querySelector('.astral-phone-body'));
            success('Контакт обновлён');
        });

        overlay.querySelector('#astral-contact-delete').addEventListener('click', () => {
            const preview = character;
            if (!confirm(`Удалить переписку с «${preview}»?\n\nВсе сообщения будут удалены.`)) return;

            const state = this.storage.getState();
            state.messages = (state.messages || []).filter(m => m.character !== character);
            this.storage.save();
            try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }

            close();
            this._thread = null;
            this.render(document.querySelector('.astral-phone-body'));
            success('Переписка удалена');
        });

        // Enter — сохранить
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                overlay.querySelector('#astral-contact-save').click();
            }
            if (e.key === 'Escape') close();
        });
    }

    /**
     * Долгое нажатие (тач) или правый клик (мышь) — удалить сообщение.
     * Просто клик по пузырю не удаляет: иначе легко снести текст случайно.
     */
    _bindDeleteGesture(bubble, msg, character) {
        let holdTimer = null;
        let moved = false;

        const start = () => {
            moved = false;
            holdTimer = setTimeout(() => {
                if (!moved) this._confirmDelete(msg, character);
            }, 520);
        };

        const cancel = () => {
            if (holdTimer) clearTimeout(holdTimer);
            holdTimer = null;
        };

        bubble.addEventListener('touchstart', start, { passive: true });
        bubble.addEventListener('touchmove', () => { moved = true; cancel(); }, { passive: true });
        bubble.addEventListener('touchend', cancel, { passive: true });
        bubble.addEventListener('touchcancel', cancel, { passive: true });

        bubble.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._confirmDelete(msg, character);
        });

        // мышь: удержание левой кнопки тоже работает
        bubble.addEventListener('mousedown', start);
        bubble.addEventListener('mouseup', cancel);
        bubble.addEventListener('mouseleave', cancel);
    }

    _confirmDelete(msg, character) {
        const preview = String(msg.text || '').slice(0, 60);
        if (!confirm(`Удалить сообщение?\n\n«${preview}${preview.length >= 60 ? '…' : ''}»`)) return;

        const state = this.storage.getState();
        const before = (state.messages || []).length;

        state.messages = (state.messages || []).filter(m => {
            if (msg.id) return m.id !== msg.id;
            // старые сообщения без id — сверяем по содержимому и времени
            return !(m.character === msg.character && m.text === msg.text && m.timestamp === msg.timestamp);
        });

        if (state.messages.length === before) return;

        this.storage.save();
        success('Сообщение удалено');
        this.render(document.querySelector('.astral-phone-body'), { character });
    }

    /**
     * Попросить модель написать сообщение от персонажа.
     * Пока идёт генерация, в треде видно «<имя> печатает…».
     */
    async _requestCharacterReply(character) {
        const stopTyping = showTyping(character);

        try {
            const ctx = globalThis.SillyTavern?.getContext?.() || {};
            const state = this.storage.getState();
            const thread = (state.messages || []).filter(m => m.character === character);

            const text = await generateMessage(ctx, { character, thread });
            stopTyping();

            if (!text) {
                showError('Персонаж промолчал');
                return;
            }

            state.messages.push({
                id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                character,
                role: thread.find(m => m.role)?.role || '',
                text,
                from: 'them',
                isIncoming: true,
                fromUser: false,
                timestamp: Date.now(),
            });

            this.storage.save();
            try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }
            this.render(document.querySelector('.astral-phone-body'), { character });
        } catch (err) {
            stopTyping();
            handleGenerationError(err, 'ответ персонажа');
        }
    }

    /** Build a prompt asking the character to respond. */
    _buildReplyPrompt(character, lastMsg, state) {
        const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
        const charName = character || String(ctx?.characters?.[ctx?.characterId]?.name || ctx?.name2 || 'Персонаж').trim();
        const userName = String(ctx?.name1 || '').trim() || 'Ты';

        const thread = (state.messages || [])
            .filter(m => m.character === character)
            .slice(-8)
            .map(m => `${m.from === 'me' ? userName : charName}: ${m.text}`)
            .join('\n');

        return `[MESSAGE_REPLY] Character: ${charName}

You are ${charName} messaging ${userName} on the phone. The last thing they wrote was: "${lastMsg?.text || '(no message)'}".

Write a SHORT, natural TEXT REPLY from ${charName}'s perspective — one sentence or a few casual words. Keep it in character.

REPLY (text only):`;
    }

    /** Append an outgoing message to the thread and persist it. */
    _sendMessage(character, text) {
        const state = this.storage.getState();
        if (!Array.isArray(state.messages)) state.messages = [];

        const role = state.messages.find(m => m.character === character && m.role)?.role || '';

        state.messages.push({
            id: `me_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            character,
            role,
            text,
            from: 'me',
            isIncoming: false,
            fromUser: true,
            timestamp: Date.now(),
        });
        this.storage.save();

        // Let the model see the new outgoing message on its next turn
        try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }

        this.render(document.querySelector('.astral-phone-body'), { character });
    }

    /* ─────────────────────────── event handler ─────────────────────────── */

    async handleEvent(eventData) {
        const state = this.storage.getState();
        if (!Array.isArray(state.messages)) state.messages = [];

        state.messages.push({
            character: eventData.character || this.context.name2 || '',
            text: eventData.description || '',
            timestamp: Date.now(),
            fromUser: false,
            from: 'them',
            isIncoming: true,
        });
        this.storage.save();
        try { globalThis.__astralRefreshPrompt?.(); } catch { /* ignore */ }
        return { success: true, message: 'Сообщение добавлено' };
    }

    /* ─────────────────────────── utils ─────────────────────────── */

    /** Unified check: supports both old `fromUser` flag and new `from` field. */
    _isOut(msg) {
        if (msg.from === 'me') return true;
        if (msg.from === 'them') return false;
        return Boolean(msg.fromUser);
    }

    _truncate(str, max) {
        const s = String(str ?? '');
        return s.length > max ? s.slice(0, max) + '…' : s;
    }

    _time(ts, short = false) {
        const d = new Date(ts);
        const today = new Date().toDateString() === d.toDateString();
        if (short || today) {
            return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}
