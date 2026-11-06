/**
 * Astral Phone — main entry point
 * Registers function tools, injects UI button, initializes apps
 */

import { PhoneCore } from './apps/phone-core.js';
import { MessagesApp } from './apps/messages.js';
import { GalleryApp } from './apps/gallery.js';
import { SpicyApp } from './apps/spicy.js';
import { CreatorApp } from './apps/creator.js';
import { ImageGenerator } from './apps/image-gen.js';
import { PhoneStorage } from './apps/storage.js';

const MODULE_NAME = 'astral-phone';

let phoneCore = null;
let storage = null;
let imageGen = null;

/**
 * Hook called during ST's blocking loader phase
 */
window.onActivate = function() {
    console.log('[Astral Phone] Activating...');
};

/**
 * Main initialization after ST is fully loaded
 */
async function initAstralPhone() {
    const context = SillyTavern.getContext();
    
    // Initialize storage
    storage = new PhoneStorage(context);
    
    // Initialize image generator (haruspics bridge)
    imageGen = new ImageGenerator(context);
    
    // Initialize phone core
    phoneCore = new PhoneCore(context, storage, imageGen);
    
    // Register apps
    phoneCore.registerApp('messages', new MessagesApp(context, storage, imageGen));
    phoneCore.registerApp('gallery', new GalleryApp(context, storage, imageGen));
    phoneCore.registerApp('spicy', new SpicyApp(context, storage, imageGen));
    phoneCore.registerApp('creator', new CreatorApp(context, storage, imageGen));
    
    // Inject phone button into ST header
    injectPhoneButton(context);
    
    // Register function tools for model communication
    registerFunctionTools(context);
    
    // Register slash commands (fallback / debug)
    registerSlashCommands(context);
    
    console.log('[Astral Phone] Initialized');
}

/**
 * Inject phone button into ST chat header
 */
function injectPhoneButton(context) {
    const { eventSource, event_types } = context;
    
    // Wait for chat to be ready
    eventSource.on(event_types.APP_INITIALIZED, () => {
        // Find the header buttons container (varies by ST version)
        const headerSelectors = [
            '#extensionsMenu',
            '.mes_buttons',
            '#top-bar .menu_buttons'
        ];
        
        let container = null;
        for (const sel of headerSelectors) {
            container = document.querySelector(sel);
            if (container) break;
        }
        
        if (!container) {
            console.warn('[Astral Phone] Could not find header to inject button');
            return;
        }
        
        const btn = document.createElement('div');
        btn.id = 'astral-phone-btn';
        btn.className = 'menu_button';
        btn.innerHTML = '📱';
        btn.title = 'Open Phone';
        btn.style.cssText = 'cursor: pointer; font-size: 18px;';
        
        btn.addEventListener('click', () => {
            phoneCore.open();
        });
        
        container.appendChild(btn);
    });
}

/**
 * Register function tools for model communication
 */
function registerFunctionTools(context) {
    const { registerFunctionTool } = context;
    
    // Main event dispatcher
    registerFunctionTool({
        name: 'phone_event',
        displayName: 'Phone Event',
        description: 'Send event to character\'s phone (photo taken, message received, content posted, etc)',
        parameters: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['photo_taken', 'message_received', 'content_posted', 'donation_received', 'subscriber_joined'],
                    description: 'Event type'
                },
                character: {
                    type: 'string',
                    description: 'Character name'
                },
                description: {
                    type: 'string',
                    description: 'Brief description for image generation prompt or message content'
                },
                metadata: {
                    type: 'object',
                    description: 'Additional event data (e.g. amount for donation, platform for content_posted)'
                }
            },
            required: ['type', 'character', 'description']
        },
        action: async (args) => {
            try {
                const result = await phoneCore.handleEvent(args);
                return JSON.stringify(result);
            } catch (err) {
                console.error('[Astral Phone] Function tool error:', err);
                return JSON.stringify({ success: false, error: err.message });
            }
        }
    });
}

/**
 * Register slash commands (fallback path)
 */
function registerSlashCommands(context) {
    const { registerSlashCommand } = context;
    
    registerSlashCommand('phone', (args) => {
        if (!args || !args.trim()) {
            phoneCore.open();
            return '';
        }
        
        const [action, ...rest] = args.trim().split(/\s+/);
        
        if (action === 'open') {
            phoneCore.open();
        } else if (action === 'close') {
            phoneCore.close();
        } else if (action === 'event') {
            // /phone event {"type":"photo_taken","character":"Lisa","description":"..."}
            try {
                const eventData = JSON.parse(rest.join(' '));
                phoneCore.handleEvent(eventData);
            } catch (err) {
                console.error('[Astral Phone] Invalid event JSON:', err);
            }
        }
        
        return '';
    }, [], 'Open phone or send phone event');
}

// Initialize when ST is ready
jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(context.event_types.APP_INITIALIZED, initAstralPhone);
});
