/**
 * Messages App — SMS/chat conversations
 */

export class MessagesApp {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.id = 'messages';
        this.title = 'Messages';
        this.icon = '💬';
    }
    
    /**
     * Render messages list or conversation
     */
    render(container, params = {}) {
        if (params.conversationId) {
            this.renderConversation(container, params.conversationId);
        } else {
            this.renderList(container);
        }
    }
    
    /**
     * Render conversations list
     */
    renderList(container) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const messages = state.messages || [];
        
        container.innerHTML = '';
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="astral-empty-state">
                    <div class="astral-empty-state-icon">💬</div>
                    <div>No messages yet</div>
                </div>
            `;
            return;
        }
        
        // Group messages by character
        const grouped = {};
        messages.forEach(msg => {
            if (!grouped[msg.character]) {
                grouped[msg.character] = [];
            }
            grouped[msg.character].push(msg);
        });
        
        // Render list
        Object.entries(grouped).forEach(([char, msgs]) => {
            const lastMsg = msgs[msgs.length - 1];
            const item = document.createElement('div');
            item.className = 'astral-msg-item';
            item.innerHTML = `
                <div class="astral-msg-avatar">${char[0]}</div>
                <div class="astral-msg-content">
                    <div class="astral-msg-name">${char}</div>
                    <div class="astral-msg-preview">${lastMsg.text || lastMsg.description}</div>
                </div>
                <div class="astral-msg-time">${this.formatTime(lastMsg.timestamp)}</div>
            `;
            
            item.addEventListener('click', () => {
                this.render(container, { conversationId: char });
            });
            
            container.appendChild(item);
        });
    }
    
    /**
     * Render single conversation
     */
    renderConversation(container, character) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        const messages = (state.messages || []).filter(m => m.character === character);
        
        container.innerHTML = '';
        
        const thread = document.createElement('div');
        thread.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
        
        messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = msg.fromUser ? 'astral-msg-bubble-out' : 'astral-msg-bubble-in';
            bubble.style.cssText = `
                padding: 10px 13px;
                border-radius: 14px;
                max-width: 80%;
                font-size: 12px;
                line-height: 1.5;
                ${msg.fromUser 
                    ? 'align-self: flex-end; background: linear-gradient(150deg, rgba(229,175,197,.24), rgba(217,154,181,.28)); border: 1px solid rgba(229,175,197,.42); color: #fff;'
                    : 'align-self: flex-start; background: linear-gradient(150deg, rgba(255,255,255,.09), rgba(255,255,255,.03)); border: 1px solid rgba(217,154,181,.28); color: #e8ddf8;'
                }
            `;
            bubble.innerHTML = `
                ${msg.text || msg.description}
                <div style="margin-top: 4px; font-size: 8px; opacity: 0.5;">${this.formatTime(msg.timestamp)}</div>
            `;
            thread.appendChild(bubble);
        });
        
        container.appendChild(thread);
    }
    
    /**
     * Handle incoming message event
     */
    async handleEvent(eventData) {
        const chatId = this.context.getCurrentChatId?.() || 'default';
        const state = this.storage.getState(chatId);
        
        if (!state.messages) state.messages = [];
        
        state.messages.push({
            character: eventData.character,
            text: eventData.description,
            timestamp: Date.now(),
            fromUser: false
        });
        
        this.storage.setState(chatId, state);
        
        return { success: true, message: `Message from ${eventData.character} added` };
    }
    
    /**
     * Format timestamp
     */
    formatTime(ts) {
        const d = new Date(ts);
        const now = new Date();
        const today = now.toDateString() === d.toDateString();
        
        if (today) {
            return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
}
