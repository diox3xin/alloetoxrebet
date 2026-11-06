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
        } else {
            const grid = document.createElement('div');
            grid.className = 'astral-gallery-grid';
            photos.forEach((photo, idx) => this._renderTile(grid, photo, idx));
            container.appendChild(grid);
        }

        // Always show action buttons (Take Photo + Generate)
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

        // ── Take Photo button ──
        const takeBtn = document.createElement('button');
        takeBtn.className = 'astral-btn astral-btn-wide';
        takeBtn.textContent = '📸 Сделать снимок';
        takeBtn.addEventListener('click', async () => {
            takeBtn.disabled = true;
            takeBtn.textContent = 'Снимаю…';
            await this._takePhoto();
            takeBtn.disabled = false;
            takeBtn.textContent = '📸 Сделать снимок';
        });
        bar.appendChild(takeBtn);

        // ── Generate missing photos button ──
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

    /** Generate a photo description as if the character took a selfie/photo right now. */
    async _takePhoto() {
        try {
            const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
            const genFn = ctx.generateQuietPrompt;
            if (typeof genFn !== 'function') {
                this._toast('generateQuietPrompt unavailable', 'error');
                return;
            }

            // Extract scene context
            const charName = ctx.name2 || 'Character';
            const userName = ctx.name1 || 'You';
            const state = this.storage.getState();
            
            // Get last few messages for scene context
            const messages = (state.messages || []).slice(-6)
                .map(m => `${m.from === 'me' ? userName : (m.character || 'Contact')}: ${m.text}`)
                .join('\n');

            // Build character info from last message or seeded data
            const lastCharMsg = (state.messages || []).filter(m => m.character === charName).slice(-1)[0];
            const charOutfit = lastCharMsg?.outfit || 'wearing casual clothes';
            const charAction = lastCharMsg?.action || 'standing nearby';

            // Detect other NPCs/characters in the conversation
            const allCharacters = [...new Set((state.messages || []).map(m => m.character).filter(Boolean))];
            const otherChars = allCharacters.filter(c => c !== charName);
            let otherNpcsDesc = '';
            if (otherChars.length > 0) {
                otherNpcsDesc = otherChars
                    .map(char => `- ${char}, nearby`)
                    .join('\n');
            }

            const backgroundDesc = this._inferBackground(messages);

            const prompt = `You are deciding whether to take a selfie or a regular photo, based on what's happening in the scene.

Scene context:
${messages || '(quiet moment)'}

Based on the scene, choose what makes sense: a selfie (you + ${charName} together) or a photo (just ${charName}).

If SELFIE:
${userName}, ${charAction}, dressed casually
${charName}, ${charOutfit}, ${charAction}
${otherNpcsDesc ? otherNpcsDesc : ''}
Background: ${backgroundDesc}

Selfie should look like it was taken on a mobile phone front camera - casual, intimate vibe.

If PHOTO:
${charName}, ${charOutfit}, ${charAction}
${otherNpcsDesc ? otherNpcsDesc : ''}
Background: ${backgroundDesc}

Photo should look like it was taken on a mobile phone camera - candid, natural moment.

Generate a short, natural photo/selfie description (1-2 sentences) as if you're looking at it in your phone gallery. Include mood and vibes. Casual tone, like a real caption.

DESCRIPTION:`;

            const description = await genFn(prompt, false, false);
            const text = String(description || '').trim().slice(0, 300);

            if (!text) {
                this._toast('Failed to capture photo', 'error');
                return;
            }

            // Add to gallery
            if (!Array.isArray(state.gallery)) state.gallery = [];

            state.gallery.push({
                id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                description: text,
                imageUrl: null,
                timestamp: Date.now(),
                source: 'phone_camera'
            });

            this.storage.save();
            this._toast('Photo added to gallery');
            this.render(document.querySelector('.astral-phone-body'));
        } catch (err) {
            console.error('[Astral Phone] takePhoto failed:', err);
            this._toast(`Error: ${err.message}`, 'error');
        }
    }

    _inferBackground(messages) {
        // Simple heuristic: look for location clues in messages
        if (messages.includes('home') || messages.includes('house') || messages.includes('room')) return 'cozy indoor setting';
        if (messages.includes('outside') || messages.includes('park') || messages.includes('street')) return 'outdoor environment';
        if (messages.includes('cafe') || messages.includes('bar') || messages.includes('restaurant')) return 'social venue';
        if (messages.includes('night') || messages.includes('dark')) return 'dimly lit ambiance';
        if (messages.includes('sun') || messages.includes('light')) return 'bright, sunny setting';
        return 'intimate moment';
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
            <div class="astral-viewer-container">
                <img src="${photo.imageUrl}" alt="">
                <div class="astral-viewer-caption">${this._esc(photo.description)}</div>
                <button class="astral-viewer-delete" title="Delete photo">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                    </svg>
                </button>
            </div>
        `;
        
        const deleteBtn = viewer.querySelector('.astral-viewer-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._deletePhoto(photo);
            viewer.remove();
        });

        viewer.addEventListener('click', () => viewer.remove());
        document.querySelector('.astral-phone').appendChild(viewer);
    }

    _deletePhoto(photo) {
        const state = this.storage.getState();
        const idx = state.gallery.findIndex(p => p.id === photo.id);
        if (idx >= 0) {
            state.gallery.splice(idx, 1);
            this.storage.save();
            this._toast('Photo deleted');
            this.render(document.querySelector('.astral-phone-body'));
        }
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