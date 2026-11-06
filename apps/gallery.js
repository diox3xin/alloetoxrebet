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

    /**
     * Build a NovelAI v5 prompt.
     *
     * The prompt is assembled HERE, in code — style and character appearance are
     * pulled straight from Haruspics, so they are guaranteed to be present and
     * in English. The RP model is asked for one thing only: a short English
     * sentence describing the action and setting. Letting it write the whole
     * prompt produced Russian narration instead of an image prompt.
     */
    async _takePhoto(mode = 'random') {
        try {
            const ctx = this.context || globalThis.SillyTavern?.getContext?.() || {};
            const charName = this._resolveCharName(ctx);
            const userName = this._resolveUserName(ctx);
            const prefs = this._loadCameraPrefs();

            const resolvedMode = mode === 'random'
                ? (Math.random() < 0.5 ? 'photo' : 'selfie')
                : mode;

            // ── pull everything we can from Haruspics ──
            const style = String(this.imageGen?.getStyle?.() || '').trim();
            let appearance = '';
            try {
                const refs = this.imageGen?._collectRefs?.() || {};
                appearance = (refs.textOnlyClothing || [])
                    .filter(c => c.charName === charName)
                    .map(c => c.description)
                    .join(', ');
            } catch (_) { /* ignore */ }

            // ── one short, constrained ask ──
            const sceneText = this._sceneText(ctx);
            const ask = this._buildSceneAsk({
                charName,
                userName,
                mode: resolvedMode,
                sceneText,
                needAppearance: !appearance,
                customInstruction: resolvedMode === 'selfie'
                    ? prefs.selfieInstruction.trim()
                    : prefs.photoInstruction.trim(),
            });

            let cleanAction = await this._askModel(ctx, ask);
            if (!cleanAction) {
                cleanAction = this._fallbackAction(ctx, charName);
                if (cleanAction) {
                    console.warn('[Astral Phone] using character card description as visual fallback');
                }
            }

            // ── assemble the final prompt ──
            const parts = [];
            if (style) parts.push(style);

            if (resolvedMode === 'selfie') {
                parts.push(`selfie, front camera, ${userName} and ${charName} in frame`);
                parts.push(userName);
            } else {
                parts.push(`candid photo, shot on smartphone, ${charName} in frame`);
            }

            parts.push(appearance
                ? `${charName}, ${appearance}`
                : charName);

            if (cleanAction) {
                parts.push(cleanAction);
            } else {
                console.warn('[Astral Phone] model gave no usable English visual text; building prompt from scene only');
            }

            parts.push('natural lighting, shallow depth of field, realistic photograph, detailed');

            const finalPrompt = parts.filter(Boolean).join(', ');

            console.log('[Astral Phone] photo prompt:', finalPrompt);

            const state = this.storage.getState();
            if (!Array.isArray(state.gallery)) state.gallery = [];
            state.gallery.push({
                id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                description: finalPrompt,
                imageUrl: null,
                timestamp: Date.now(),
                source: resolvedMode,
                character: charName,
                style,
            });

            this.storage.save();
            this._toast(resolvedMode === 'selfie' ? 'Селфи добавлено в галерею' : 'Фото добавлено в галерею');
            this.render(document.querySelector('.astral-phone-body'));
        } catch (err) {
            console.error('[Astral Phone] takePhoto failed:', err);
            this._toast(`Error: ${err.message}`, 'error');
        }
    }

    /**
     * Character name. `name2` is sometimes the wrong thing entirely (it can come
     * back as "SillyTavern System"), so prefer the actual active character card.
     */
    _resolveCharName(ctx) {
        const fromCard = ctx.characters?.[ctx.characterId]?.name;
        const candidate = String(fromCard || ctx.name2 || '').trim();
        if (!candidate || /sillytavern/i.test(candidate)) {
            return String(fromCard || '').trim() || 'the character';
        }
        return candidate;
    }

    /** User / persona name, with the same guard. */
    _resolveUserName(ctx) {
        const candidate = String(ctx.name1 || '').trim();
        if (!candidate || /sillytavern/i.test(candidate)) return 'the viewer';
        return candidate;
    }

    /**
     * Force the model's sentence into usable English visual text.
     * The RP model leaks `<horae>`-style tags and Russian prose no matter what
     * the instructions say, so anything non-Latin is dropped rather than trusted.
     */
    _sanitizeVisual(raw) {
        let text = String(raw || '');

        // strip fence markers but KEEP their contents
        text = text.replace(/```[a-z]*\n?/gi, ' ');
        // drop any <tag> / [TAG] blocks
        text = text.replace(/<[^>]*>/g, ' ');
        text = text.replace(/\[[A-Z_]{3,}[^\]]*\]/g, ' ');
        text = text.replace(/^(prompt|description|answer|sentence)\s*:\s*/i, '');
        text = text.replace(/^["'«]|["'»]$/g, '');

        // keep only sentences that are latin script (no Cyrillic / CJK)
        const sentences = text
            .split(/(?<=[.!?])\s+|\n+/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .filter(s => !/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/.test(s))
            .filter(s => /[A-Za-z]{3,}/.test(s));

        return sentences.join(' ').trim().slice(0, 240);
    }

    /** Last few roleplay messages, tag-stripped — the visual source material. */
    _sceneText(ctx) {
        const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
        const lines = chat
            .filter(m => m && !m.is_system && typeof m.mes === 'string')
            .slice(-4)
            .map(m => String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500))
            .filter(Boolean);
        return lines.join('\n---\n') || '(quiet moment)';
    }

    _buildSceneAsk({ charName, userName, mode, sceneText, needAppearance, customInstruction }) {
        const who = mode === 'selfie' ? `${charName} and ${userName}` : charName;

        const appearanceRule = needAppearance
            ? `Include a brief physical description of ${who} (hair, eyes, build, clothing) — it is not available elsewhere.`
            : `Do NOT describe ${who}'s appearance — it is added automatically.`;

        const custom = customInstruction
            ? `\nEXTRA GUIDANCE FROM THE USER:\n${customInstruction}\n`
            : '';

        return `You write IMAGE PROMPTS. Never narrate, never roleplay, never translate.

ROLEPLAY SCENE (source material, may be in any language):
${sceneText}

TASK:
Write ONE English sentence, maximum 30 words, describing only the VISUAL content of a photo being taken right now: what ${who} is doing, their pose and expression, and where they are.
${appearanceRule}${custom}
Rules:
- English only. No Russian words, no transliteration.
- Visual facts only. No plot, no dialogue, no feelings, no metaphors.
- No names of camera apps, no quotes, no labels, no markdown.

SENTENCE:`;
    }

    /**
     * Ask the model for one visual sentence, validating that the answer is
     * actually usable English. Retries once with a harder prompt; returns null
     * rather than letting Russian prose or leaked tags into the image prompt.
     */
    async _askModel(ctx, ask) {
        const system = 'You are an image prompt engineer. You output English only. You never narrate or roleplay.';

        const attempts = [
            ask,
            `${ask}

FINAL WARNING: your previous answer was not usable. Answer with ENGLISH WORDS ONLY, one short sentence. Do not translate the scene. Do not use the scene's language.`,
        ];

        for (let i = 0; i < attempts.length; i++) {
            let raw = '';

            if (typeof ctx.generateRaw === 'function') {
                try {
                    raw = await ctx.generateRaw({
                        prompt: attempts[i],
                        systemPrompt: system,
                        responseLength: 160,
                    });
                } catch (err) {
                    console.warn('[Astral Phone] generateRaw failed:', err?.message);
                }
            }

            if (!raw && typeof ctx.generateQuietPrompt === 'function') {
                try {
                    raw = await ctx.generateQuietPrompt(
                        `[IMAGE PROMPT — ENGLISH ONLY — NO NARRATION — NO TAGS]\n${attempts[i]}`,
                        false,
                        false,
                    );
                } catch (err) {
                    console.warn('[Astral Phone] generateQuietPrompt failed:', err?.message);
                }
            }

            const cleaned = this._sanitizeVisual(raw);
            if (cleaned && cleaned.split(' ').length >= 3) return cleaned;

            console.warn(`[Astral Phone] attempt ${i + 1} produced unusable text:`, String(raw || '').slice(0, 200));
        }

        return null;
    }

    /**
     * Last-resort visual description built without the model: the character
     * card's own description plus any outfit text from Haruspics.
     */
    _fallbackAction(ctx, charName) {
        const card = ctx.characters?.[ctx.characterId] || {};
        const source = String(card.description || card.personality || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!source) return '';
        // keep latin sentences only
        return source
            .split(/(?<=[.!?])\s+/)
            .filter(s => !/[\u0400-\u04FF]/.test(s) && /[A-Za-z]{3,}/.test(s))
            .slice(0, 2)
            .join(' ')
            .slice(0, 200);
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
                character: photo.character || this.context?.name2,
                type: 'gallery_photo',
                style: photo.style !== undefined ? photo.style : undefined,
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
        // description is already a fully-formed prompt for camera shots
        return String(photo.description || photo.character || '').trim();
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