/**
 * Spicy Hub — anonymous NSFW content feed (like Porn Hub)
 */

export class SpicyApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.id = 'spicy';
        this.title = 'Spicy Hub';
        this.icon = '🔞';
    }
    
    /**
     * Render content feed
     */
    render(container, params = {}) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const videos = state.spicy || [];
        
        container.innerHTML = '';
        
        if (videos.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">🔞</div>
                    <div>No content yet</div>
                    <div style="margin-top: 14px;">Videos appear when spicy events happen in the story</div>
                </div>
            `;
            return;
        }
        
        const feed = document.createElement('div');
        feed.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        
        videos.forEach((video, idx) => {
            const card = document.createElement('div');
            card.style.cssText = `
                border-radius: 12px;
                overflow: hidden;
                background: var(--phone-card);
                border: 1px solid rgba(217,154,181,.18);
            `;
            
            const thumbnail = video.thumbnailUrl 
                ? `<img src="${video.thumbnailUrl}" style="width: 100%; aspect-ratio: 16/9; object-fit: cover;" />`
                : `<div style="width: 100%; aspect-ratio: 16/9; display: grid; place-items: center; background: rgba(13,11,16,.6);">
                     <button class="astral-btn" data-video-idx="${idx}">Generate Thumbnail</button>
                   </div>`;
            
            card.innerHTML = `
                ${thumbnail}
                <div style="padding: 12px;">
                    <div style="font-size: 12px; font-weight: 500; margin-bottom: 6px;">
                        ${video.title || video.description}
                    </div>
                    <div style="font-size: 9px; color: var(--phone-text-dim); display: flex; gap: 12px;">
                        <span>👁️ ${video.views || 0}</span>
                        <span>❤️ ${video.likes || 0}</span>
                        <span>${this.formatTime(video.timestamp)}</span>
                    </div>
                </div>
            `;
            
            feed.appendChild(card);
        });
        
        container.appendChild(feed);
        
        // Attach thumbnail generation handlers
        container.querySelectorAll('[data-video-idx]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.videoIdx);
                await this.generateThumbnail(idx);
                this.render(container, params);
            });
        });
    }
    
    /**
     * Handle content_posted event (when type = 'spicy')
     */
    async handleEvent(eventData) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        
        if (!state.spicy) state.spicy = [];
        
        state.spicy.push({
            character: eventData.character,
            title: eventData.metadata?.title || eventData.description,
            description: eventData.description,
            timestamp: Date.now(),
            thumbnailUrl: null,
            views: Math.floor(Math.random() * 5000) + 100,
            likes: Math.floor(Math.random() * 500) + 10
        });
        
        this.storage.setState(chatId, state);
        
        return { success: true, message: `Spicy content added` };
    }
    
    /**
     * Generate thumbnail on demand
     */
    async generateThumbnail(index) {
        if (!this.imageGen.isAvailable()) {
            alert('Haruspics not installed. Install haruspics-naistera extension to generate images.');
            return;
        }
        
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const video = state.spicy[index];
        
        if (!video) return;
        
        try {
            // Build NSFW prompt
            const prompt = `${video.character} — ${video.description} — thumbnail preview, suggestive`;
            
            const imageUrl = await this.imageGen.generate(prompt, {
                character: video.character,
                type: 'spicy_thumbnail',
                nsfw: true
            });
            
            video.thumbnailUrl = imageUrl;
            state.spicy[index] = video;
            
            this.storage.setState(chatId, state);
        } catch (err) {
            console.error('[Spicy] Generation failed:', err);
            alert(`Thumbnail generation failed: ${err.message}`);
        }
    }
    
    /**
     * Format timestamp
     */
    formatTime(ts) {
        const d = new Date(ts);
        const now = Date.now();
        const diff = now - ts;
        
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)}m ago`;
        } else if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)}h ago`;
        } else {
            return `${Math.floor(diff / 86400000)}d ago`;
        }
    }
}
