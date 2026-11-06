/**
 * Messages — SMS threads with the characters.
 */

import { ICONS } from './phone-core.js';

export class MessagesApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'messages';
        this.title = 'Messages';
        this.icon = ICONS.messages;
    }

    render(container, params = {}) {
        const state = this.storage.getState();
        const messages = state.messages || [];

        container.innerHTML = '';

        if (params.character) {
            this._renderThread(container, messages, params.character);
            return;
        }

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.messages}</div>
                    <div>Нет переписки</div>
                    <div style="margin-top:10px;opacity:.7">Сообщения появятся, когда персонаж напишет</div>
                </div>`;
            return;
        }

        const grouped = new Map();
        for (const msg of messages) {
            const key = msg.character || 'Неизвестный';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(msg);
        }

        const list = document.createElement('div');
        list.className = 'astral-thread-list';

        for (const [char, msgs] of grouped) {
            const last = msgs[msgs.length - 1];
            const item = document.createElement('div');
            item.className = 'astral-msg-item';
            item.innerHTML = `
                <div class="astral-msg-avatar">${this._esc((char[0] || '?').toUpperCase())}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name">${this._esc(char)}</div>
                    <div class="astral-msg-preview">${this._esc(last.text)}</div>
                </div>
                <div class="astral-msg-time">${this._time(last.timestamp)}</div>
            `;
            item.addEventListener('click', () => {
                const core = this._core();
                core?.openApp('messages', { character: char });
            });
            list.appendChild(item);
        }

        container.appendChild(list);
    }

    _renderThread(container, messages, character) {
        const msgs = messages.filter((m) => m.character === character);
        const wrap = document.createElement('div');
        wrap.className = 'astral-thread';

        if (msgs.length === 0) {
            wrap.innerHTML = `<div class="astral-empty-state"><div>Пусто</div></div>`;
        }

        for (const msg of msgs) {
            const bubble = document.createElement('div');
            bubble.className = msg.fromUser ? 'astral-bubble astral-bubble--out' : 'astral-bubble astral-bubble--in';
            bubble.innerHTML = `
                <div class="astral-bubble-text">${this._esc(msg.text)}</div>
                <div class="astral-bubble-time">${this._time(msg.timestamp, true)}</div>
            `;
            wrap.appendChild(bubble);
        }

        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
    }

    async handleEvent(eventData) {
        const state = this.storage.getState();
        state.messages.push({
            character: eventData.character || this.context.name2 || '',
            text: eventData.description || '',
            timestamp: Date.now(),
            fromUser: false,
        });
        this.storage.save();
        return { success: true, message: 'Сообщение добавлено' };
    }

    _core() {
        return window.__astralPhoneCore || null;
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