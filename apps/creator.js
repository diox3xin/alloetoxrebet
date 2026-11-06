/**
 * Creator Studio — content monetization platform (OnlyFans alternative)
 * Tabs: Profile, Feed, Stats, Messages from fans
 */

export class CreatorApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.id = 'creator';
        this.title = 'Creator Studio';
        this.icon = '💎';
    }
    
    /**
     * Render Creator Studio tabs
     */
    render(container, params = {}) {
        const tab = params.tab || 'profile';
        
        container.innerHTML = '';
        
        // Tab navigation
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            border-bottom: 1px solid rgba(217,154,181,.14);
            padding-bottom: 8px;
        `;
        
        ['profile', 'feed', 'stats', 'messages'].forEach(t => {
            const btn = document.createElement('button');
            btn.textContent = t.toUpperCase();
            btn.style.cssText = `
                flex: 1;
                padding: 8px 12px;
                border: 1px solid ${tab === t ? 'var(--phone-accent)' : 'rgba(217,154,181,.2)'};
                background: ${tab === t ? 'rgba(217,154,181,.12)' : 'transparent'};
                color: ${tab === t ? 'var(--phone-accent-light)' : 'var(--phone-text-dim)'};
                border-radius: 8px;
                cursor: pointer;
                font-size: 9px;
                letter-spacing: 0.1em;
                transition: 0.15s;
            `;
            
            btn.addEventListener('click', () => {
                this.render(container, { tab: t });
            });
            
            tabs.appendChild(btn);
        });
        
        container.appendChild(tabs);
        
        // Tab content
        const content = document.createElement('div');
        
        if (tab === 'profile') {
            this.renderProfile(content);
        } else if (tab === 'feed') {
            this.renderFeed(content);
        } else if (tab === 'stats') {
            this.renderStats(content);
        } else if (tab === 'messages') {
            this.renderMessages(content);
        }
        
        container.appendChild(content);
    }
    
    /**
     * Profile tab — subscribers, revenue, create button
     */
    renderProfile(container) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const creator = state.creator || { posts: [], subscribers: 0, revenue: 0 };
        
        container.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 50%;
                            background: radial-gradient(circle at 30% 28%, rgba(229,175,197,.45), rgba(217,154,181,.2));
                            border: 2px solid var(--phone-accent); display: grid; place-items: center; font-size: 32px;">
                    💎
                </div>
                <div style="font-size: 15px; font-weight: 500; margin-bottom: 8px;">
                    ${this.context.name2 || 'Character'}
                </div>
                <div style="font-size: 11px; color: var(--phone-text-dim); margin-bottom: 20px;">
                    @creator
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; text-align: center;">
                    <div>
                        <div style="font-size: 18px; font-weight: 500; color: var(--phone-accent-light);">
                            ${creator.subscribers || 0}
                        </div>
                        <div style="font-size: 9px; color: var(--phone-text-dim); text-transform: uppercase; letter-spacing: 0.1em;">
                            Subscribers
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 18px; font-weight: 500; color: var(--phone-accent-light);">
                            ${creator.posts?.length || 0}
                        </div>
                        <div style="font-size: 9px; color: var(--phone-text-dim); text-transform: uppercase; letter-spacing: 0.1em;">
                            Posts
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 18px; font-weight: 500; color: var(--phone-accent-light);">
                            $${creator.revenue || 0}
                        </div>
                        <div style="font-size: 9px; color: var(--phone-text-dim); text-transform: uppercase; letter-spacing: 0.1em;">
                            Revenue
                        </div>
                    </div>
                </div>
                
                <button class="astral-btn-primary" id="creator-new-post">
                    ➕ Create New Post
                </button>
            </div>
        `;
        
        container.querySelector('#creator-new-post').addEventListener('click', () => {
            this.showCreateDialog();
        });
    }
    
    /**
     * Feed tab — published posts
     */
    renderFeed(container) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const posts = state.creator?.posts || [];
        
        if (posts.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">💎</div>
                    <div>No posts yet</div>
                    <div style="margin-top: 14px;">Create your first post to start earning</div>
                </div>
            `;
            return;
        }
        
        const feed = document.createElement('div');
        feed.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        
        posts.forEach((post, idx) => {
            const card = document.createElement('div');
            card.style.cssText = `
                border-radius: 12px;
                overflow: hidden;
                background: var(--phone-card);
                border: 1px solid rgba(217,154,181,.18);
            `;
            
            const image = post.imageUrl
                ? `<img src="${post.imageUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;" />`
                : `<div style="width: 100%; aspect-ratio: 1; display: grid; place-items: center; background: rgba(13,11,16,.6);">
                     <button class="astral-btn" data-post-idx="${idx}">Generate Image</button>
                   </div>`;
            
            card.innerHTML = `
                ${image}
                <div style="padding: 12px;">
                    <div style="font-size: 11px; margin-bottom: 8px;">${post.caption || post.description}</div>
                    <div style="font-size: 9px; color: var(--phone-text-dim); display: flex; gap: 12px;">
                        <span>❤️ ${post.likes || 0}</span>
                        <span>💬 ${post.comments || 0}</span>
                        <span>${this.formatTime(post.timestamp)}</span>
                    </div>
                </div>
            `;
            
            feed.appendChild(card);
        });
        
        container.appendChild(feed);
        
        // Attach generate handlers
        container.querySelectorAll('[data-post-idx]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.postIdx);
                await this.generatePostImage(idx);
                this.renderFeed(container);
            });
        });
    }
    
    /**
     * Stats tab — analytics
     */
    renderStats(container) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const creator = state.creator || {};
        const posts = creator.posts || [];
        
        const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
        const avgLikes = posts.length > 0 ? Math.floor(totalLikes / posts.length) : 0;
        
        container.innerHTML = `
            <div style="padding: 16px 0;">
                <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; 
                            opacity: 0.5; margin-bottom: 16px;">
                    Performance
                </div>
                
                <div style="display: grid; gap: 14px;">
                    <div style="padding: 14px; background: var(--phone-card); border-radius: 10px; 
                                border: 1px solid rgba(217,154,181,.16);">
                        <div style="font-size: 9px; text-transform: uppercase; opacity: 0.5; margin-bottom: 6px;">
                            Total Earnings
                        </div>
                        <div style="font-size: 22px; color: var(--phone-accent-light);">
                            $${creator.revenue || 0}
                        </div>
                    </div>
                    
                    <div style="padding: 14px; background: var(--phone-card); border-radius: 10px;
                                border: 1px solid rgba(217,154,181,.16);">
                        <div style="font-size: 9px; text-transform: uppercase; opacity: 0.5; margin-bottom: 6px;">
                            Engagement Rate
                        </div>
                        <div style="font-size: 22px; color: var(--phone-accent-light);">
                            ${avgLikes} likes/post
                        </div>
                    </div>
                    
                    <div style="padding: 14px; background: var(--phone-card); border-radius: 10px;
                                border: 1px solid rgba(217,154,181,.16);">
                        <div style="font-size: 9px; text-transform: uppercase; opacity: 0.5; margin-bottom: 6px;">
                            Top Post
                        </div>
                        <div style="font-size: 14px; color: var(--phone-accent-light);">
                            ${posts.length > 0 
                                ? posts.reduce((max, p) => (p.likes || 0) > (max.likes || 0) ? p : max, posts[0])?.caption || 'N/A'
                                : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Messages tab — fan messages
     */
    renderMessages(container) {
        container.innerHTML = `
            <div class="astral-empty-state">
                <div class="astral-empty-state-icon">💬</div>
                <div>No fan messages yet</div>
                <div style="margin-top: 14px;">Subscribers will send you messages here</div>
            </div>
        `;
    }
    
    /**
     * Show create post dialog
     */
    showCreateDialog() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100000;
            background: rgba(13,11,16,.9);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            width: 320px;
            background: var(--phone-card);
            border: 1px solid rgba(217,154,181,.3);
            border-radius: 16px;
            padding: 20px;
        `;
        
        dialog.innerHTML = `
            <div style="font-size: 14px; font-weight: 500; margin-bottom: 16px;">Create New Post</div>
            <textarea id="creator-caption" 
                      placeholder="Describe the content you want to create..." 
                      style="width: 100%; min-height: 100px; padding: 12px; 
                             background: var(--phone-bg); border: 1px solid rgba(217,154,181,.2); 
                             border-radius: 8px; color: var(--phone-text); font-family: inherit; 
                             font-size: 12px; resize: vertical; margin-bottom: 16px;"></textarea>
            <div style="display: flex; gap: 10px;">
                <button class="astral-btn" id="creator-cancel">Cancel</button>
                <button class="astral-btn-primary" id="creator-publish" style="flex: 1;">Publish & Generate</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        dialog.querySelector('#creator-cancel').addEventListener('click', () => {
            overlay.remove();
        });
        
        dialog.querySelector('#creator-publish').addEventListener('click', async () => {
            const caption = dialog.querySelector('#creator-caption').value.trim();
            if (!caption) return;
            
            await this.createPost(caption);
            overlay.remove();
        });
    }
    
    /**
     * Create new post and optionally generate image
     */
    async createPost(caption) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        
        if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0 };
        
        const post = {
            caption,
            description: caption,
            timestamp: Date.now(),
            imageUrl: null,
            likes: Math.floor(Math.random() * 50) + 5,
            comments: Math.floor(Math.random() * 20) + 1
        };
        
        state.creator.posts.unshift(post);  // prepend
        
        // Simulate revenue increase
        state.creator.revenue = (state.creator.revenue || 0) + Math.floor(Math.random() * 50) + 20;
        
        this.storage.setState(chatId, state);
        
        // Try to generate image immediately if haruspics available
        if (this.imageGen.isAvailable()) {
            await this.generatePostImage(0);
        }
        
        // Re-render
        const container = document.querySelector('.astral-phone-body');
        if (container) {
            this.render(container, { tab: 'feed' });
        }
    }
    
    /**
     * Generate image for a post
     */
    async generatePostImage(index) {
        if (!this.imageGen.isAvailable()) {
            alert('Haruspics not installed.');
            return;
        }
        
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const post = state.creator?.posts?.[index];
        
        if (!post) return;
        
        try {
            const char = this.context.name2 || 'Character';
            const prompt = `${char} — ${post.description}`;
            
            const imageUrl = await this.imageGen.generate(prompt, {
                character: char,
                type: 'creator_post',
                nsfw: true
            });
            
            post.imageUrl = imageUrl;
            state.creator.posts[index] = post;
            
            this.storage.setState(chatId, state);
        } catch (err) {
            console.error('[Creator] Generation failed:', err);
            alert(`Image generation failed: ${err.message}`);
        }
    }
    
    /**
     * Handle events (content_posted, donation_received, subscriber_joined)
     */
    async handleEvent(eventData) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        
        if (!state.creator) state.creator = { posts: [], subscribers: 0, revenue: 0 };
        
        if (eventData.type === 'content_posted') {
            state.creator.posts.unshift({
                caption: eventData.description,
                description: eventData.description,
                timestamp: Date.now(),
                imageUrl: null,
                likes: Math.floor(Math.random() * 50) + 5,
                comments: Math.floor(Math.random() * 20) + 1
            });
        } else if (eventData.type === 'donation_received') {
            const amount = eventData.metadata?.amount || 50;
            state.creator.revenue = (state.creator.revenue || 0) + amount;
        } else if (eventData.type === 'subscriber_joined') {
            state.creator.subscribers = (state.creator.subscribers || 0) + 1;
        }
        
        this.storage.setState(chatId, state);
        
        return { success: true, message: `Creator event processed` };
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
