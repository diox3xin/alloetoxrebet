/**
 * Gallery App — photo album with on-demand generation
 */

export class GalleryApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.id = 'gallery';
        this.title = 'Gallery';
        this.icon = '📷';
    }
    
    /**
     * Render gallery grid
     */
    render(container, params = {}) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const photos = state.gallery || [];
        
        container.innerHTML = '';
        
        if (photos.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">📷</div>
                    <div>No photos yet</div>
                    <div style="margin-top: 14px;">Photos appear when events happen in the story</div>
                </div>
            `;
            return;
        }
        
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;';
        
        photos.forEach((photo, idx) => {
            const card = document.createElement('div');
            card.style.cssText = `
                aspect-ratio: 1;
                border-radius: 12px;
                overflow: hidden;
                position: relative;
                cursor: pointer;
                background: var(--phone-card);
                border: 1px solid rgba(217,154,181,.2);
            `;
            
            if (photo.imageUrl) {
                card.innerHTML = `
                    <img src="${photo.imageUrl}" 
                         style="width: 100%; height: 100%; object-fit: cover;" />
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; 
                                background: linear-gradient(to top, rgba(13,11,16,.9), transparent);
                                font-size: 9px; color: rgba(255,255,255,.7);">
                        ${this.formatTime(photo.timestamp)}
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div style="display: grid; place-items: center; height: 100%; text-align: center; padding: 16px;">
                        <div>
                            <div style="font-size: 32px; opacity: 0.3; margin-bottom: 8px;">📷</div>
                            <div style="font-size: 10px; opacity: 0.5; margin-bottom: 10px;">
                                ${photo.description}
                            </div>
                            <button class="astral-btn" data-photo-idx="${idx}">
                                Generate Photo
                            </button>
                        </div>
                    </div>
                `;
            }
            
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        
        // Attach generate handlers
        container.querySelectorAll('[data-photo-idx]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.photoIdx);
                await this.generatePhoto(idx);
                this.render(container, params);
            });
        });
    }
    
    /**
     * Handle photo_taken event
     */
    async handleEvent(eventData) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        
        if (!state.gallery) state.gallery = [];
        
        state.gallery.push({
            character: eventData.character,
            description: eventData.description,
            timestamp: Date.now(),
            imageUrl: null  // generated on demand
        });
        
        this.storage.setState(chatId, state);
        
        return { success: true, message: `Photo event added to gallery` };
    }
    
    /**
     * Generate photo on demand
     */
    async generatePhoto(index) {
        if (!this.imageGen.isAvailable()) {
            alert('Haruspics not installed. Install haruspics-naistera extension to generate images.');
            return;
        }
        
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const photo = state.gallery[index];
        
        if (!photo) return;
        
        try {
            // Build prompt from description + character
            const prompt = `${photo.character} — ${photo.description}`;
            
            const imageUrl = await this.imageGen.generate(prompt, {
                character: photo.character,
                type: 'gallery_photo'
            });
            
            photo.imageUrl = imageUrl;
            state.gallery[index] = photo;
            
            this.storage.setState(chatId, state);
        } catch (err) {
            console.error('[Gallery] Generation failed:', err);
            alert(`Image generation failed: ${err.message}`);
        }
    }
    
    /**
     * Format timestamp
     */
    formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
}
