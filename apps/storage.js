/**
 * PhoneStorage - Per-chat phone state persistence layer
 * Stores phone app state in SillyTavern chat_metadata
 */
class PhoneStorage {
    constructor(context) {
        this.context = context;
        this.storageKey = 'astral-phone';
    }

    /**
     * Get default state structure
     */
    _getDefaultState() {
        return {
            messages: [],
            gallery: [],
            spicy: [],
            creator: {
                posts: [],
                subscribers: 0,
                revenue: 0,
                stats: {}
            }
        };
    }

    /**
     * Get state for a specific chat
     * @param {string} chatId - Chat identifier
     * @returns {object} State object
     */
    getState(chatId) {
        if (!this.context.chat_metadata) {
            this.context.chat_metadata = {};
        }

        if (!this.context.chat_metadata[this.storageKey]) {
            this.context.chat_metadata[this.storageKey] = {};
        }

        const storage = this.context.chat_metadata[this.storageKey];
        
        if (!storage[chatId]) {
            storage[chatId] = this._getDefaultState();
        }

        return storage[chatId];
    }

    /**
     * Set complete state for a chat
     * @param {string} chatId - Chat identifier
     * @param {object} state - Complete state object
     */
    setState(chatId, state) {
        if (!this.context.chat_metadata) {
            this.context.chat_metadata = {};
        }

        if (!this.context.chat_metadata[this.storageKey]) {
            this.context.chat_metadata[this.storageKey] = {};
        }

        this.context.chat_metadata[this.storageKey][chatId] = state;
        this.context.updateChatMetadata();
    }

    /**
     * Update state with partial data (deep merge)
     * @param {string} chatId - Chat identifier
     * @param {object} partial - Partial state updates
     */
    updateState(chatId, partial) {
        const currentState = this.getState(chatId);
        
        // Deep merge for nested objects like creator
        const mergedState = { ...currentState };
        
        for (const key in partial) {
            if (partial[key] && typeof partial[key] === 'object' && !Array.isArray(partial[key])) {
                mergedState[key] = { ...currentState[key], ...partial[key] };
            } else {
                mergedState[key] = partial[key];
            }
        }

        this.setState(chatId, mergedState);
    }
}

module.exports = PhoneStorage;
