/**
 * Image Generator App for Phone Extension
 * Bridges to Haruspics Fusion extension for AI image generation
 */

export class ImageGenerator {
    constructor(context) {
        this.context = context;
        this.haruspics = null;
        this.checkHaruspics();
    }

    /**
     * Check if Haruspics Fusion extension is available
     */
    checkHaruspics() {
        if (typeof window !== 'undefined' && window.HARUSPICS) {
            this.haruspics = window.HARUSPICS;
            console.log('[ImageGenerator] Haruspics Fusion detected');
        } else {
            console.warn('[ImageGenerator] Haruspics Fusion extension not found');
        }
    }

    /**
     * Check if image generation is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.haruspics !== null && typeof this.haruspics.generate === 'function';
    }

    /**
     * Generate an image using Haruspics
     * @param {string} prompt - The image generation prompt
     * @param {Object} metadata - Additional metadata (model, size, etc.)
     * @returns {Promise<string>} - ST-hosted image path
     */
    async generate(prompt, metadata = {}) {
        if (!this.isAvailable()) {
            throw new Error('Haruspics not installed or not available');
        }

        try {
            console.log('[ImageGenerator] Generating image with prompt:', prompt);
            
            // Call Haruspics generate method
            const result = await this.haruspics.generate(prompt, metadata);
            
            // Handle different possible return formats from Haruspics
            let imageUrl;
            if (typeof result === 'string') {
                imageUrl = result;
            } else if (result && result.url) {
                imageUrl = result.url;
            } else if (result && result.path) {
                imageUrl = result.path;
            } else {
                throw new Error('Invalid response from Haruspics');
            }

            // If Haruspics returns a data URL or external URL, upload it to ST
            if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
                imageUrl = await this.uploadToST(imageUrl, metadata);
            }

            console.log('[ImageGenerator] Image generated:', imageUrl);
            return imageUrl;
            
        } catch (error) {
            console.error('[ImageGenerator] Generation failed:', error);
            throw error;
        }
    }

    /**
     * Upload image data to SillyTavern's image storage
     * @param {string} imageData - Data URL or external URL
     * @param {Object} metadata - Metadata for the upload
     * @returns {Promise<string>} - ST-hosted path
     */
    async uploadToST(imageData, metadata = {}) {
        try {
            // Convert external URL to blob if needed
            let blob;
            if (imageData.startsWith('http')) {
                const response = await fetch(imageData);
                blob = await response.blob();
            } else if (imageData.startsWith('data:')) {
                const base64 = imageData.split(',')[1];
                const mimeType = imageData.match(/data:([^;]+);/)[1];
                const bytes = atob(base64);
                const arr = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) {
                    arr[i] = bytes.charCodeAt(i);
                }
                blob = new Blob([arr], { type: mimeType });
            }

            // Upload to ST
            const formData = new FormData();
            formData.append('image', blob, `generated-${Date.now()}.png`);
            
            const uploadResponse = await fetch('/api/images/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload image to ST');
            }

            const uploadResult = await uploadResponse.json();
            
            // Return the ST-hosted path
            return uploadResult.path || uploadResult.url || `/user-avatars/${uploadResult.filename}`;
            
        } catch (error) {
            console.error('[ImageGenerator] Upload failed:', error);
            throw error;
        }
    }

    /**
     * Get a placeholder image (fallback)
     * @returns {string} - Data URL placeholder
     */
    getPlaceholder() {
        // 1x1 transparent pixel
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
}
