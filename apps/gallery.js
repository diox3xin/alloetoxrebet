/**
 * Gallery — photo album. Events arrive from the model; images are generated
 * on tap through the Haruspics bridge.
 */

import { ICONS } from './phone-core.js';

export class GalleryApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        this.id = 'gallery';
        this.title = 'Gallery';
        this.icon = ICONS.gallery;
        this._busy = new Set();
    }

    render(container) {
        const state = this.storage.getState();
        const photos = state.gallery || [];

        container.innerHTML = '';

        if (photos.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">${ICONS.gallery}</div>
                    <div>Пока пусто</div>
                    <div style="margin-top:10px;opacity:.7">Фото появятся, когда персонаж что-нибудь снимет</div>
                </div>`;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'astral-gallery-grid';

        photos.forEach((photo, idx) => this._renderTile(grid, photo, idx));

        container.appendChild(grid);
        container.appendChild(this._buildActions(photos));
    }

    _renderTile(grid, photo, idx) {
        const tile = document.createElement('div');
        tile.className = 'astral-tile';

        if (photo.imageUrl) {
            tile.classList.add('astral-tile--filled');
            tile.innerHTML = `
                <img src="${photo.imageUrl}" alt="" loading="lazy">
                <div class="astral-tile-overlay">
                    <div class="astral-tile-text">${this._esc(photo.description)}</div>
                    <div class="astral-tile-meta">${this._time(photo.timestamp)}</div>
                </div>`;
            tile.addEventListener('click', () => this._openViewer(photo));
        } else {
            const busy = this._busy.has(idx);
            tile.innerHTML = `
                <div class="astral-tile-empty">
                    <div class="astral-tile-empty-icon">${ICONS.gallery}</div>
                    <div class="astral-tile-text">${this._esc(photo.description)}</div>
                    <button class="astral-btn" ${busy ? 'disabled' : ''} data-gen="${idx}">
                        ${busy ? 'Генерация…' : 'Создать фото'}
                    </button>
                </div>`;
            const btn = tile.querySelector(`[data-gen="${idx}"]`);
            if (btn && !busy) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this._generate(idx);
                });
            }
        }

        grid.appendChild(tile);
    }

    _buildActions(photos) {
        const bar = document.createElement('div');
        bar.className = 'astral-action-bar';

        const pending = photos.filter((p) => !p.imageUrl).length;
        const label = pending > 1 ? `Создать все фото (${pending})` : 'Создать фото';

        const btn = document.createElement('button');
        btn.className = 'astral-btn astral-btn-primary astral-btn-wide';
        btn.textContent = label;
        btn.disabled = pending === 0;
        if (pending === 0) btn.style.opacity = '.45';

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Генерация…';
            const indexes = photos.map((p, i) => (!p.imageUrl ? i : -1)).filter((i) => i >= 0);
            for (const i of indexes) await this._generate(i, true);
            this.render(document.querySelector('.astral-phone-body'));
        });

        bar.appendChild(btn);
        return bar;
    }

    async _generate(index, silent = false) {
        if (!this.imageGen.isAvailable()) {
            this._toast('Haruspics не установлен — генерация недоступна', 'error');
            return;
        }
        if (this._busy.has(index)) return;

        this._busy.add(index);
        this._toast('Генерирую…', 'info');

        try {
            const state = this.storage.getState();
            const photo = state.gallery[index];
            if (!photo) return;

            const prompt = this._buildPrompt(photo);
            const url = await this.imageGen.generate(prompt, {
                character: photo.character,
                type: 'gallery_photo',
            });

            state.gallery[index].imageUrl = url;
            this.storage.save();
            this._toast('Готово', 'success');
            if (!silent) this.render(document.querySelector('.astral-phone-body'));
        } catch (err) {
            console.error('[Gallery] generation failed:', err);
            this._toast(`Не получилось: ${err.message}`, 'error');
        } finally {
            this._busy.delete(index);
            if (!silent) this.render(document.querySelector('.astral-phone-body'));
        }
    }

    _buildPrompt(photo) {
        const parts = [];
        if (photo.character) parts.push(photo.character);
        if (photo.description) parts.push(photo.description);
        return parts.join(' — ');
    }

    _openViewer(photo) {
        const viewer = document.createElement('div');
        viewer.className = 'astral-viewer';
        viewer.innerHTML = `
            <img src="${photo.imageUrl}" alt="">
            <div class="astral-viewer-caption">${this._esc(photo.description)}</div>
        `;
        viewer.addEventListener('click', () => viewer.remove());
        document.querySelector('.astral-phone').appendChild(viewer);
    }

    async handleEvent(eventData) {
        const state = this.storage.getState();
        state.gallery.push({
            character: eventData.character || this.context.name2 || '',
            description: eventData.description || '',
            timestamp: Date.now(),
            imageUrl: null,
        });
        this.storage.save();
        return { success: true, message: 'Фото добавлено в галерею' };
    }

    _toast(text, kind = 'info') {
        if (window.toastr) {
            (toastr[kind] || toastr.info)(text);
        } else {
            console.log(`[Gallery] ${text}`);
        }
    }

    _time(ts) {
        return new Date(ts).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    _esc(str) {
        return String(str ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
}