/**
 * PhoneCore - Main phone overlay system for SillyTavern Astral Phone extension
 * Manages phone UI, app registration, navigation, and event routing
 */

export class PhoneCore {
    constructor(context, storage, imageGen) {
        this.context = context;
        this.storage = storage;
        this.imageGen = imageGen;
        
        this.apps = new Map();
        this.currentApp = null;
        this.overlay = null;
        this.homeScreen = null;
        this.appContainer = null;
        
        this.isOpen = false;
        
        this._injectStyles();
    }
    
    /**
     * Register an app with the phone system
     * @param {string} id - Unique app identifier
     * @param {Object} appInstance - App object with {id, title, icon, render(container)}
     */
    registerApp(id, appInstance) {
        if (!appInstance.render || typeof appInstance.render !== 'function') {
            throw new Error(`App ${id} must implement render(container) method`);
        }
        this.apps.set(id, appInstance);
    }
    
    /**
     * Open the phone overlay
     */
    open() {
        if (this.isOpen) return;
        
        if (!this.overlay) {
            this._createOverlay();
        }
        
        this.overlay.classList.add('astral-phone--active');
        this.isOpen = true;
        this._showHome();
        
        // Notify ST event system
        if (this.context.eventSource) {
            this.context.eventSource.emit('astral_phone_opened', {});
        }
    }
    
    /**
     * Close the phone overlay
     */
    close() {
        if (!this.isOpen) return;
        
        this.overlay?.classList.remove('astral-phone--active');
        this.isOpen = false;
        this.currentApp = null;
        
        if (this.context.eventSource) {
            this.context.eventSource.emit('astral_phone_closed', {});
        }
    }
    
    /**
     * Handle incoming phone events from function-tool calls
     * Routes events to appropriate apps
     * @param {Object} eventData - Event payload with type and data
     */
    handleEvent(eventData) {
        const { type, ...data } = eventData;
        
        const eventRouting = {
            'photo_taken': 'gallery',
            'message_received': 'messages',
            'content_posted': 'creator',
            'donation_received': 'creator'
        };
        
        const targetAppId = eventRouting[type];
        if (!targetAppId) {
            console.warn(`[PhoneCore] Unhandled event type: ${type}`);
            return;
        }
        
        const app = this.apps.get(targetAppId);
        if (!app) {
            console.warn(`[PhoneCore] App '${targetAppId}' not registered for event '${type}'`);
            return;
        }
        
        // If app has an event handler, call it
        if (app.handleEvent && typeof app.handleEvent === 'function') {
            app.handleEvent({ type, ...data });
        }
        
        // Auto-open phone and navigate to app if event is high-priority
        const autoOpenEvents = ['message_received', 'donation_received'];
        if (autoOpenEvents.includes(type) && !this.isOpen) {
            this.open();
            this._openApp(targetAppId);
        }
    }
    
    /**
     * Navigate to home screen
     */
    _showHome() {
        this.currentApp = null;
        this.homeScreen.style.display = 'grid';
        this.appContainer.style.display = 'none';
        this.appContainer.innerHTML = '';
    }
    
    /**
     * Open a specific app
     */
    _openApp(appId) {
        const app = this.apps.get(appId);
        if (!app) {
            console.error(`[PhoneCore] App '${appId}' not found`);
            return;
        }
        
        this.currentApp = appId;
        this.homeScreen.style.display = 'none';
        this.appContainer.style.display = 'block';
        this.appContainer.innerHTML = '';
        
        // Call app's render method
        app.render(this.appContainer);
    }
    
    /**
     * Create the phone overlay DOM structure
     */
    _createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'astral-phone-overlay';
        overlay.innerHTML = `
            <div class="astral-phone">
                <div class="astral-phone__header">
                    <div class="astral-phone__status-bar">
                        <span class="astral-phone__time">${this._getCurrentTime()}</span>
                        <div class="astral-phone__indicators">
                            <span class="astral-phone__signal">📶</span>
                            <span class="astral-phone__battery">🔋</span>
                        </div>
                    </div>
                    <button class="astral-phone__close" title="Close phone">×</button>
                </div>
                
                <div class="astral-phone__body">
                    <div class="astral-phone__home">
                        <div class="astral-phone__app-grid"></div>
                    </div>
                    <div class="astral-phone__app-view"></div>
                </div>
                
                <div class="astral-phone__nav">
                    <button class="astral-phone__nav-btn astral-phone__nav-btn--home" title="Home">⌂</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        this.overlay = overlay;
        this.homeScreen = overlay.querySelector('.astral-phone__home');
        this.appContainer = overlay.querySelector('.astral-phone__app-view');
        
        // Wire up event listeners
        overlay.querySelector('.astral-phone__close').addEventListener('click', () => this.close());
        overlay.querySelector('.astral-phone__nav-btn--home').addEventListener('click', () => this._showHome());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
        
        // Render app grid
        this._renderAppGrid();
        
        // Update time every minute
        setInterval(() => this._updateTime(), 60000);
    }
    
    /**
     * Render the home screen app grid
     */
    _renderAppGrid() {
        const grid = this.homeScreen.querySelector('.astral-phone__app-grid');
        
        const defaultApps = [
            { id: 'messages', title: 'Messages', icon: '💬' },
            { id: 'gallery', title: 'Gallery', icon: '📷' },
            { id: 'spicy', title: 'Spicy Hub', icon: '🔞' },
            { id: 'creator', title: 'Creator Studio', icon: '💎' }
        ];
        
        defaultApps.forEach(appDef => {
            const appIcon = document.createElement('button');
            appIcon.className = 'astral-phone__app-icon';
            appIcon.innerHTML = `
                <div class="astral-phone__app-icon-img">${appDef.icon}</div>
                <div class="astral-phone__app-icon-label">${appDef.title}</div>
            `;
            
            appIcon.addEventListener('click', () => {
                if (this.apps.has(appDef.id)) {
                    this._openApp(appDef.id);
                } else {
                    console.warn(`[PhoneCore] App '${appDef.id}' not yet registered`);
                }
            });
            
            grid.appendChild(appIcon);
        });
    }
    
    /**
     * Get current time formatted for status bar
     */
    _getCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    /**
     * Update time display in status bar
     */
    _updateTime() {
        const timeEl = this.overlay?.querySelector('.astral-phone__time');
        if (timeEl) {
            timeEl.textContent = this._getCurrentTime();
        }
    }
    
    /**
     * Inject phone overlay styles
     */
    _injectStyles() {
        if (document.getElementById('astral-phone-core-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'astral-phone-core-styles';
        style.textContent = `
            :root {
                --phone-surface-0: #05070C;
                --phone-surface-1: #0A0D12;
                --phone-surface-2: #0F131C;
                --phone-surface-3: #161D2B;
                --phone-surface-4: #1E2636;
                --phone-accent: #38BDF8;
                --phone-accent-dim: #1E5B7A;
                --phone-text: #E5E7EB;
                --phone-text-dim: #9CA3AF;
                --phone-radius-sm: 12px;
                --phone-radius-md: 24px;
                --phone-radius-full: 999px;
                --phone-spacing-xs: 0.5rem;
                --phone-spacing-sm: 0.75rem;
                --phone-spacing-md: 1rem;
                --phone-spacing-lg: 1.5rem;
                --phone-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
            }
            
            .astral-phone-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                animation: astral-fade-in 0.2s ease-out;
            }
            
            .astral-phone-overlay.astral-phone--active {
                display: flex;
            }
            
            @keyframes astral-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .astral-phone {
                width: min(420px, 90vw);
                height: min(860px, 90vh);
                background: var(--phone-surface-1);
                border-radius: var(--phone-radius-md);
                box-shadow: var(--phone-shadow);
                display: grid;
                grid-template-rows: auto 1fr auto;
                overflow: hidden;
                animation: astral-phone-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            @keyframes astral-phone-slide-up {
                from {
                    opacity: 0;
                    transform: translateY(40px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            .astral-phone__header {
                background: var(--phone-surface-2);
                padding: var(--phone-spacing-md);
                border-bottom: 1px solid var(--phone-surface-3);
            }
            
            .astral-phone__status-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: var(--phone-text);
                font-size: clamp(0.75rem, 2vw, 0.875rem);
                font-weight: 600;
                margin-bottom: var(--phone-spacing-sm);
            }
            
            .astral-phone__indicators {
                display: flex;
                gap: var(--phone-spacing-xs);
            }
            
            .astral-phone__close {
                width: 100%;
                padding: var(--phone-spacing-sm);
                background: var(--phone-surface-3);
                border: none;
                border-radius: var(--phone-radius-full);
                color: var(--phone-text);
                font-size: 1.5rem;
                font-weight: 300;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .astral-phone__close:hover {
                background: var(--phone-surface-4);
                transform: scale(1.02);
            }
            
            .astral-phone__body {
                position: relative;
                overflow: hidden;
                background: var(--phone-surface-0);
            }
            
            .astral-phone__home {
                position: absolute;
                inset: 0;
                padding: var(--phone-spacing-lg);
                overflow-y: auto;
            }
            
            .astral-phone__app-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: var(--phone-spacing-lg);
                padding: var(--phone-spacing-md) 0;
            }
            
            .astral-phone__app-icon {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: var(--phone-spacing-xs);
                background: transparent;
                border: none;
                cursor: pointer;
                padding: var(--phone-spacing-sm);
                border-radius: var(--phone-radius-sm);
                transition: all 0.2s ease;
            }
            
            .astral-phone__app-icon:hover {
                background: var(--phone-surface-2);
                transform: translateY(-2px);
            }
            
            .astral-phone__app-icon-img {
                width: 64px;
                height: 64px;
                background: var(--phone-surface-2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2rem;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            
            .astral-phone__app-icon-label {
                color: var(--phone-text);
                font-size: clamp(0.7rem, 2vw, 0.8rem);
                font-weight: 500;
                text-align: center;
                line-height: 1.2;
            }
            
            .astral-phone__app-view {
                position: absolute;
                inset: 0;
                display: none;
                overflow-y: auto;
            }
            
            .astral-phone__nav {
                background: var(--phone-surface-2);
                padding: var(--phone-spacing-md);
                border-top: 1px solid var(--phone-surface-3);
                display: flex;
                justify-content: center;
                gap: var(--phone-spacing-md);
            }
            
            .astral-phone__nav-btn {
                width: 56px;
                height: 56px;
                background: var(--phone-surface-3);
                border: none;
                border-radius: 50%;
                color: var(--phone-text);
                font-size: 1.5rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .astral-phone__nav-btn:hover {
                background: var(--phone-accent-dim);
                transform: scale(1.05);
            }
            
            .astral-phone__nav-btn:active {
                transform: scale(0.95);
            }
        `;
        
        document.head.appendChild(style);
    }
}

export default PhoneCore;
