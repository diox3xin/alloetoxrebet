/**
 * Spicy Hub — anonymous adult feed. Same idea as Creator Studio but the
 * content is posted "anonymously", so it reads like a tube site.
 */

import { ICONS } from './phone-core.js';

const CATEGORIES = ['Все', 'Новое', 'Тренды', 'Смотреть позже'];

import { resolveStyle } from './prompt-llm.js';

export class SpicyApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'spicy';
        this.title = 'Spicy Hub';
        this.icon = ICONS.spicy;
        this._filter = 'Все';
        this._busy = new Set();
    }

    render(container) {
        const state = this.storage.getState();
        const items = state.spicy || [];

        container.innerHTML = '';
        container.appendChild(this._buildTopBar());

        if (items.length === 0) {
            container.innerHTML += `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.spicy}</div>
                    <div>Лента пуста</div>
                    <div style="margin-top:10px;opacity:.7">Ролики появятся, когда персонаж что-нибудь выложит</div>
                </div>`;
            return;
        }

        const filtered = this._applyFilter(items);
        const feed = document.createElement('div');
        feed.className = 'astral-card-feed';

        filtered.forEach((item) => feed.appendChild(this._renderCard(item, items.indexOf(item))));

        container.appendChild(feed);
    }

    _buildTopBar() {
        const bar = document.createElement('div');
        bar.className = 'astral-chips';
        for (const cat of CATEGORIES) {
            const chip = document.createElement('button');
            chip.className = 'astral-chip' + (cat === this._filter ? ' astral-chip--on' : '');
            chip.textContent = cat;
            chip.addEventListener('click', () => {
                this._filter = cat;
                this.render(document.querySelector('.astral-phone-body'));
            });
            bar.appendChild(chip);
        }
        return bar;
    }

    _applyFilter(items) {
        if (this._filter === 'Новое') return [...items].sort((a, b) => b.timestamp - a.timestamp);
        if (this._filter === 'Тренды') return [...items].sort((a, b) => (b.views || 0) - (a.views || 0));
        return items;
    }

    _renderCard(item, idx) {
        const card = document.createElement('div');
        card.className = 'astral-card';
        const busy = this._busy.has(idx);

        const media = item.thumbnailUrl
            ? `<img class="astral-card-media" src="${item.thumbnailUrl}" alt="" loading="lazy">
               <div class="astral-card-duration">${this._esc(item.duration || '12:04')}</div>`
            : `<div class="astral-card-media astral-card-media--empty">
                    <div class="astral-card-empty-inner">
                        <div class="astral-card-empty-icon">${ICONS.spicy}</div>
                        <button class="astral-btn" data-gen="${idx}" ${busy ? 'disabled' : ''}>
                            ${busy ? 'Генерация…' : 'Создать превью'}
                        </button>
                    </div>
               </div>`;

        card.innerHTML = `
            ${media}
            <div class="astral-card-body">
                <div class="astral-card-title">${this._esc(item.title || item.description)}</div>
                <div class="astral-card-meta">
                    <span>${this._n(item.views)} просмотров</span>
                    <span>${this._n(item.likes)} ❤</span>
                    <span>${this._ago(item.timestamp)}</span>
                </div>
                ${item.tags?.length ? `<div class="astral-card-tags">${item.tags.map((t) => `<span class="astral-tag">#${this._esc(t)}</span>`).join('')}</div>` : ''}
            </div>
        `;

        const btn = card.querySelector(`[data-gen="${idx}"]`);
        if (btn && !busy) {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this._generate(idx);
            });
        }

        return card;
    }

    async _generate(index) {
        if (!this.imageGen.isAvailable()) {
            this._toast('Haruspics не установлен', 'error');
            return;
        }
        if (this._busy.has(index)) return;

        this._busy.add(index);
        this._toast('Генерирую превью…', 'info');

        try {
            const state = this.storage.getState();
            const item = state.spicy[index];
            if (!item) return;

            const prompt = [item.character, item.description].filter(Boolean).join(', ');
            const style = resolveStyle(this.imageGen) || String(item.style || '');
            const url = await this.imageGen.generate(prompt, {
                character: item.character,
                type: 'spicy_thumbnail',
                nsfw: true,
                style,
            });
            if (style) state.spicy[index].style = style;

            state.spicy[index].thumbnailUrl = url;
            this.storage.save();
            this._toast('Готово', 'success');
        } catch (err) {
            console.error('[Spicy] generation failed:', err);
            this._toast(`Не получилось: ${err.message}`, 'error');
        } finally {
            this._busy.delete(index);
            this.render(document.querySelector('.astral-phone-body'));
        }
    }

    async handleEvent(eventData) {
        const state = this.storage.getState();
        const meta = eventData.metadata || {};

        state.spicy.push({
            character: eventData.character || this.context.name2 || '',
            title: meta.title || this._titleFrom(eventData.description),
            description: eventData.description || '',
            timestamp: Date.now(),
            thumbnailUrl: null,
            views: this._rand(400, 40000),
            likes: this._rand(10, 2400),
            duration: `${this._rand(3, 24)}:${String(this._rand(0, 59)).padStart(2, '0')}`,
            tags: meta.tags || [],
        });

        this.storage.save();
        return { success: true, message: 'Ролик добавлен в Spicy Hub' };
    }

    _titleFrom(desc = '') {
        const clean = String(desc).trim();
        if (!clean) return 'без названия';
        const first = clean.split(/[.,;—]/)[0].trim();
        return first.length > 42 ? first.slice(0, 42) + '…' : first;
    }

    _rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    _n(num) {
        if (!num) return '0';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return String(num);
    }

    _ago(ts) {
        const diff = Date.now() - ts;
        if (diff < 36e5) return `${Math.floor(diff / 6e4)} мин`;
        if (diff < 864e5) return `${Math.floor(diff / 36e5)} ч`;
        return `${Math.floor(diff / 864e5)} дн`;
    }

    _toast(text, kind = 'info') {
        if (window.toastr) (toastr[kind] || toastr.info)(text);
        else console.log(`[Spicy] ${text}`);
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}