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

        // ── Take Photo button → opens camera UI ──
        const takeBtn = document.createElement('button');
        takeBtn.className = 'astral-btn astral-btn-wide';
        takeBtn.textContent = '📸 Сделать снимок';
        takeBtn.addEventListener('click', () => this._openCamera());
        bar.appendChild(takeBtn);

        // ── Generate missing photos ──
        const pending = photos.filter((p) => !p.imageUrl).length;
        const genBtn = document.createElement('button');
        genBtn.className = 'astral-btn astral-btn-primary astral-btn-wide';
        genBtn.textContent = pending > 1 ? `Создать все фото (${pending})` : 'Создать фото';
        genBtn.disabled = pending === 0;
        if (pending === 0) genBtn.style.opacity = '.45';
        genBtn.addEventListener('click', async () => {
            genBtn.disabled = true;
            genBtn.textContent = 'Генерация…';
            const indexes = photos.map((p, i) => (!p.imageUrl ? i : -1)).filter((i) => i >= 0);
            for (const i of indexes) await this._generate(i, true);
            this.render(document.querySelector('.astral-phone-body'));
        });
        bar.appendChild(genBtn);
        return bar;
    }

    /** Open camera overlay with mode selector and custom instruction settings. */
    _openCamera() {
        const phone = document.querySelector('.astral-phone');
        if (!phone) return;

        // Load saved prefs
        const prefs = this._loadCameraPrefs();

        const overlay = document.createElement('div');
        overlay.className = 'astral-camera-overlay';
        overlay.innerHTML = `
            <div class="astral-camera">
                <div class="astral-camera-header">
                    <button class="astral-camera-close" title="Закрыть">✕</button>
                    <span class="astral-camera-title">Camera</span>
                    <button class="astral-camera-settings-btn" title="Настройки">⚙</button>
                </div>

                <div class="astral-camera-viewfinder">
                    <div class="astral-camera-vf-inner">
                        <div class="astral-camera-vf-corner tl"></div>
                        <div class="astral-camera-vf-corner tr"></div>
                        <div class="astral-camera-vf-corner bl"></div>
                        <div class="astral-camera-vf-corner br"></div>
                    </div>
                </div>

                <div class="astral-camera-mode-bar">
                    <button class="astral-camera-mode ${prefs.mode === 'photo' ? 'active' : ''}" data-mode="photo">Фото</button>
                    <button class="astral-camera-mode ${prefs.mode === 'random' ? 'active' : ''}" data-mode="random">Рандом</button>
                    <button class="astral-camera-mode ${prefs.mode === 'selfie' ? 'active' : ''}" data-mode="selfie">Селфи</button>
                </div>

                <div class="astral-camera-shutter-row">
                    <button class="astral-camera-shutter" id="astral-camera-shutter"></button>
                </div>

                <div class="astral-camera-settings" style="display:none">
                    <div class="astral-camera-settings-section">
                        <div class="astral-camera-settings-label">Инструкция для Фото</div>
                        <textarea class="astral-camera-settings-textarea" id="astral-camera-photo-instr" rows="3" placeholder="Оставь пустым для инструкции по умолчанию">${this._esc(prefs.photoInstruction)}</textarea>
                    </div>
                    <div class="astral-camera-settings-section">
                        <div class="astral-camera-settings-label">Инструкция для Селфи</div>
                        <textarea class="astral-camera-settings-textarea" id="astral-camera-selfie-instr" rows="3" placeholder="Оставь пустым для инструкции по умолчанию">${this._esc(prefs.selfieInstruction)}</textarea>
                    </div>
                    <button class="astral-btn astral-btn-wide" id="astral-camera-save-settings">Сохранить</button>
                </div>
            </div>
        `;

        // Mode selection
        let currentMode = prefs.mode;
        overlay.querySelectorAll('.astral-camera-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.astral-camera-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.mode;
                this._saveCameraPrefs({ ...this._loadCameraPrefs(), mode: currentMode });
            });
        });

        // Settings toggle
        const settingsPanel = overlay.querySelector('.astral-camera-settings');
        overlay.querySelector('.astral-camera-settings-btn').addEventListener('click', () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
        });

        // Save settings
        overlay.querySelector('#astral-camera-save-settings').addEventListener('click', () => {
            const p = this._loadCameraPrefs();
            p.photoInstruction = overlay.querySelector('#astral-camera-photo-instr').value;
            p.selfieInstruction = overlay.querySelector('#astral-camera-selfie-instr').value;
            this._saveCameraPrefs(p);
            settingsPanel.style.display = 'none';
            this._toast('Настройки сохранены');
        });

        // Shutter
        const shutter = overlay.querySelector('#astral-camera-shutter');
        shutter.addEventListener('click', async () => {
            shutter.disabled = true;
            shutter.classList.add('astral-camera-shutter--busy');
            await this._takePhoto(currentMode);
            overlay.remove();
        });

        overlay.querySelector('.astral-camera-close').addEventListener('click', () => overlay.remove());

        phone.appendChild(overlay);
    }

    _loadCameraPrefs() {
        try {
            const raw = localStorage.getItem('astral_camera_prefs');
            const p = raw ? JSON.parse(raw) : {};
            return {
                mode: p.mode || 'random',
                photoInstruction: p.photoInstruction || '',
                selfieInstruction: p.selfieInstruction || '',
            };
        } catch { return { mode: 'random', photoInstruction: '', selfieInstruction: '' }; }
    }

    _saveCameraPrefs(prefs) {
        try { localStorage.setItem('astral_camera_prefs', JSON.stringify(prefs)); } catch { /* ignore */ }
    }

    /** Generate a photo prompt and add to gallery. mode = 'photo' | 'selfie' | 'random' */
    async _takePhoto(mode = 'random') {
        try {
            const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
            const genFn = ctx.generateQuietPrompt;
            if (typeof genFn !== 'function') {
                this._toast('generateQuietPrompt unavailable', 'error');
                return;
            }

            const charName = ctx.name2 || 'Character';
            const userName = ctx.name1 || 'You';
            const prefs = this._loadCameraPrefs();

            // ── scene context: real chat, not phone messages ──
            const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
            const sceneLines = chat
                .filter(m => m && !m.is_system && typeof m.mes === 'string')
                .slice(-4)
                .map(m => String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400))
                .filter(Boolean);
            const sceneText = sceneLines.join('\n---\n') || '(no scene yet)';

            const resolvedMode = mode === 'random'
                ? (Math.random() < 0.5 ? 'photo' : 'selfie')
                : mode;

            const customInstr = resolvedMode === 'selfie'
                ? prefs.selfieInstruction.trim()
                : prefs.photoInstruction.trim();

            const modeBlock = resolvedMode === 'selfie'
                ? `MODE: SELFIE. ${userName} is holding the phone and taking a selfie together with ${charName}. Both are in frame.`
                : `MODE: PHOTO. ${userName} is holding the phone and photographing ${charName}. ${userName} is NOT in the frame.`;

            const instructionBlock = customInstr
                ? `INSTRUCTION TO FOLLOW:\n${customInstr}`
                : `Write a detailed NovelAI v5 prompt for a candid phone photo. Include subject appearance, outfit, pose, background, lighting and "shot on smartphone" technical note.`;

            const prompt = `[IMAGE PROMPT TASK]

${modeBlock}

SCENE (the roleplay happening right now, may be in any language):
${sceneText}

${instructionBlock}

HARD RULES:
- Output MUST be in ENGLISH. Never Russian, never any other language.
- Output ONLY the image prompt itself. No preamble, no explanation, no quotes, no "Prompt:" prefix, no markdown.
- Describe the visual scene concretely: who, what they wear, what they do, where they are, light, mood.
- Keep it under 200 words.`;

            const description = await genFn(prompt, false, false);
            let text = String(description || '').trim();

            // strip common model wrappers
            text = text
                .replace(/^```[a-z]*\n?/i, '')
                .replace(/\n?```$/, '')
                .replace(/^(prompt|image prompt|description)\s*:\s*/i, '')
                .replace(/^["'«]|["'»]$/g, '')
                .trim()
                .slice(0, 600);

            if (!text) { this._toast('Failed to capture photo', 'error'); return; }

            const state = this.storage.getState();
            if (!Array.isArray(state.gallery)) state.gallery = [];
            state.gallery.push({
                id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                description: text,
                imageUrl: null,
                timestamp: Date.now(),
                source: resolvedMode,
                character: charName,
            });

            this.storage.save();
            this._toast(resolvedMode === 'selfie' ? 'Селфи добавлено в галерею' : 'Фото добавлено в галерею');
            this.render(document.querySelector('.astral-phone-body'));
        } catch (err) {
            console.error('[Astral Phone] takePhoto failed:', err);
            this._toast(`Error: ${err.message}`, 'error');
        }
    }

    _inferBackground(messages) {
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