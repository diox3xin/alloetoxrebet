/**
 * Сканер истории чата — восстанавливает состояние телефона из прошлых событий.
 * 
 * Проблема: если чат перезагрузился или юзер открыл старый чат, телефон "забыл"
 * все события. Сканер проходит по истории и восстанавливает состояние из тегов.
 */

import { extractPhoneEvents, normaliseEvent } from './event-parser.js';

/**
 * Сканировать историю чата и восстановить события телефона.
 * 
 * @param {Array} chat массив сообщений из context.chat
 * @param {object} currentState текущее состояние телефона
 * @returns {object} recovered state с событиями из истории
 */
export function scanChatHistory(chat, currentState = {}) {
    const recovered = {
        messages: [...(currentState.messages || [])],
        social: [...(currentState.social || [])],
        gallery: [...(currentState.gallery || [])],
        spicy: [...(currentState.spicy || [])],
        notes: [...(currentState.notes || [])],
        creator: currentState.creator ? { ...currentState.creator } : null,
    };
    
    if (!Array.isArray(chat) || chat.length === 0) {
        return recovered;
    }
    
    // Проходим по истории чата (можно ограничить последними N сообщениями)
    const messages = chat.slice(-100); // последние 100 сообщений
    const seenMessageIds = new Set(recovered.messages.map(m => m.id).filter(Boolean));
    const seenPhotoIds = new Set(recovered.gallery.map(p => p.id).filter(Boolean));
    const seenPostIds = new Set(recovered.social.map(p => p.id).filter(Boolean));
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || msg.is_system || !msg.mes) continue;
        
        const text = String(msg.mes);
        if (!text.includes('<phone-event')) continue;
        
        try {
            const { events } = extractPhoneEvents(text);
            const timestamp = msg.send_date || Date.now();
            
            for (const event of events) {
                const normalized = normaliseEvent(event);
                const type = normalized.type;
                
                // Восстанавливаем разные типы событий
                if (type === 'message_received') {
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    if (!seenMessageIds.has(id)) {
                        recovered.messages.push({
                            id,
                            character: normalized.character,
                            text: normalized.description,
                            timestamp,
                            from: 'them',
                            isIncoming: true,
                            fromUser: false,
                        });
                        seenMessageIds.add(id);
                    }
                }
                
                else if (type === 'photo_taken') {
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    if (!seenPhotoIds.has(id)) {
                        recovered.gallery.push({
                            id,
                            character: normalized.character,
                            description: normalized.description,
                            timestamp,
                            imageUrl: null, // будет сгенерировано позже
                        });
                        seenPhotoIds.add(id);
                    }
                }
                
                else if (type === 'social_post') {
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    if (!seenPostIds.has(id)) {
                        recovered.social.push({
                            id,
                            author: normalized.character,
                            text: normalized.description,
                            timestamp,
                            likes: 0,
                            isOwn: false,
                        });
                        seenPostIds.add(id);
                    }
                }
                
                else if (type === 'content_posted') {
                    // Creator Studio пост (не дублируем, если уже есть)
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    if (!recovered.creator) {
                        recovered.creator = { account: {}, posts: [] };
                    }
                    if (!recovered.creator.posts) recovered.creator.posts = [];
                    
                    const exists = recovered.creator.posts.some(p => 
                        p.timestamp === timestamp && p.prompt === normalized.description
                    );
                    if (!exists) {
                        recovered.creator.posts.push({
                            id,
                            prompt: normalized.description,
                            caption: '',
                            timestamp,
                            imageUrl: null,
                        });
                    }
                }
                
                else if (type === 'donation_received') {
                    const amount = normalized.metadata?.amount || 0;
                    if (amount > 0) {
                        if (!recovered.creator) {
                            recovered.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
                        }
                        recovered.creator.revenue = (recovered.creator.revenue || 0) + amount;
                        if (!recovered.creator.fans) recovered.creator.fans = [];
                        recovered.creator.fans.unshift({
                            name: normalized.metadata?.from || 'Аноним',
                            amount,
                            note: `$${amount}`,
                            timestamp,
                        });
                    }
                }
                
                else if (type === 'subscriber_joined') {
                    const count = normalized.metadata?.count || 1;
                    if (!recovered.creator) {
                        recovered.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
                    }
                    recovered.creator.subscribers = (recovered.creator.subscribers || 0) + count;
                }
                
                else if (type === 'note_written') {
                    // Заметки
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    const exists = recovered.notes.some(n => 
                        n.timestamp === timestamp && n.text === normalized.description
                    );
                    if (!exists) {
                        recovered.notes.push({
                            id,
                            kind: normalized.metadata?.kind || 'note',
                            title: normalized.metadata?.title || '',
                            text: normalized.description,
                            timestamp,
                        });
                    }
                }
                
                else if (type === 'spicy_posted') {
                    // Spicy Hub
                    const id = `scan_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
                    if (!recovered.spicy.some(s => s.id === id)) {
                        recovered.spicy.push({
                            id,
                            character: normalized.character,
                            title: normalized.metadata?.title || 'Video',
                            description: normalized.description,
                            timestamp,
                            thumbnailUrl: null,
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('[Astral Phone] scan error at message', i, ':', err);
        }
    }
    
    return recovered;
}

/**
 * Объединить восстановленное состояние с текущим.
 * Стратегия: не перезаписывать существующие записи, только добавлять новые.
 */
export function mergeRecoveredState(current, recovered) {
    const merged = { ...current };
    
    // Messages: добавляем только те, которых нет
    const currentIds = new Set((merged.messages || []).map(m => m.id).filter(Boolean));
    for (const msg of (recovered.messages || [])) {
        if (!msg.id || !currentIds.has(msg.id)) {
            if (!merged.messages) merged.messages = [];
            merged.messages.push(msg);
        }
    }
    
    // Social: аналогично
    const currentPostIds = new Set((merged.social || []).map(p => p.id).filter(Boolean));
    for (const post of (recovered.social || [])) {
        if (!post.id || !currentPostIds.has(post.id)) {
            if (!merged.social) merged.social = [];
            merged.social.push(post);
        }
    }
    
    // Gallery
    const currentPhotoIds = new Set((merged.gallery || []).map(p => p.id).filter(Boolean));
    for (const photo of (recovered.gallery || [])) {
        if (!photo.id || !currentPhotoIds.has(photo.id)) {
            if (!merged.gallery) merged.gallery = [];
            merged.gallery.push(photo);
        }
    }
    
    // Spicy
    const currentSpicyIds = new Set((merged.spicy || []).map(s => s.id).filter(Boolean));
    for (const item of (recovered.spicy || [])) {
        if (!item.id || !currentSpicyIds.has(item.id)) {
            if (!merged.spicy) merged.spicy = [];
            merged.spicy.push(item);
        }
    }
    
    // Notes
    const currentNoteIds = new Set((merged.notes || []).map(n => n.id).filter(Boolean));
    for (const note of (recovered.notes || [])) {
        if (!note.id || !currentNoteIds.has(note.id)) {
            if (!merged.notes) merged.notes = [];
            merged.notes.push(note);
        }
    }
    
    // Creator: берём максимальные значения (не могут уменьшиться)
    if (recovered.creator) {
        if (!merged.creator) {
            merged.creator = { posts: [], subscribers: 0, revenue: 0, fans: [] };
        }
        merged.creator.subscribers = Math.max(
            merged.creator.subscribers || 0,
            recovered.creator.subscribers || 0
        );
        merged.creator.revenue = Math.max(
            merged.creator.revenue || 0,
            recovered.creator.revenue || 0
        );
        
        // Посты Creator: добавляем недостающие
        const creatorPostIds = new Set((merged.creator.posts || []).map(p => p.id).filter(Boolean));
        for (const post of (recovered.creator.posts || [])) {
            if (!post.id || !creatorPostIds.has(post.id)) {
                if (!merged.creator.posts) merged.creator.posts = [];
                merged.creator.posts.push(post);
            }
        }
    }
    
    return merged;
}
