/**
 * Централизованная система уведомлений для Astral Phone.
 * 
 * Показывает toast-уведомления с понятными описаниями ошибок API,
 * подключения и других проблем. Все модули должны использовать эти
 * функции вместо прямых вызовов toastr или console.error.
 */

import { showInPhoneNotification } from './phone-notifications.js';

const MODULE = '[Astral Phone]';

/**
 * Типы уведомлений (соответствуют toastr).
 */
export const NotificationType = {
    SUCCESS: 'success',
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
};

/**
 * Показать toast-уведомление.
 * 
 * @param {string} message текст уведомления
 * @param {string} type тип (success|info|warning|error)
 * @param {{title?: string, timeout?: number}} [opts] доп. параметры
 */
export function showNotification(message, type = NotificationType.INFO, opts = {}) {
    const text = String(message || 'Операция выполнена').trim();
    const kind = String(type || NotificationType.INFO);
    
    console.log(`${MODULE} [${kind.toUpperCase()}]`, text);
    
    // Сначала пробуем показать ВНУТРИ телефона
    try {
        showInPhoneNotification(text, kind);
        return;
    } catch (err) {
        // Fallback на toastr, если телефон не открыт или что-то сломалось
    }
    
    // Fallback: toastr (правый верхний угол страницы)
    try {
        const toastr = window.toastr;
        if (!toastr) return;
        
        const method = toastr[kind] || toastr.info;
        const title = opts.title ? String(opts.title) : undefined;
        const config = opts.timeout ? { timeOut: opts.timeout } : undefined;
        
        method.call(toastr, text, title, config);
    } catch (err) {
        console.warn(`${MODULE} toast failed:`, err);
    }
}

/**
 * Распознать тип ошибки HTTP и вернуть понятное описание.
 * 
 * @param {number} status HTTP статус
 * @param {string} [body] тело ответа
 * @returns {string} описание для пользователя
 */
export function describeHttpError(status, body = '') {
    const text = String(body || '').slice(0, 200).trim();
    
    switch (status) {
        case 400:
            return `Неверный запрос (400)${text ? `: ${text}` : ''}`;
        
        case 401:
            return 'Неверный API ключ (401). Проверьте ключ в настройках.';
        
        case 403:
            return 'Доступ запрещён (403). Проверьте права API ключа.';
        
        case 404:
            return `Endpoint не найден (404)${text ? `: ${text}` : ''}. Проверьте адрес в настройках.`;
        
        case 429:
            return 'Превышен лимит запросов (429). Подождите немного.';
        
        case 500:
            return `Ошибка сервера (500)${text ? `: ${text}` : ''}`;
        
        case 502:
            return 'Сервис недоступен (502). Попробуйте позже.';
        
        case 503:
            return 'Сервис перегружен (503). Попробуйте позже.';
        
        default:
            if (status >= 400 && status < 500) {
                return `Ошибка клиента (${status})${text ? `: ${text}` : ''}`;
            }
            if (status >= 500) {
                return `Ошибка сервера (${status})${text ? `: ${text}` : ''}`;
            }
            return `HTTP ${status}${text ? `: ${text}` : ''}`;
    }
}

/**
 * Распознать ошибку fetch и вернуть понятное описание.
 * 
 * @param {Error} error объект ошибки
 * @returns {string} описание для пользователя
 */
export function describeFetchError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    
    if (error?.name === 'AbortError') {
        return 'Таймаут подключения. Проверьте сеть и адрес API.';
    }
    
    if (msg.includes('failed to fetch') || msg.includes('network')) {
        return 'Ошибка сети. Проверьте подключение к интернету.';
    }
    
    if (msg.includes('cors')) {
        return 'Ошибка CORS. Провайдер блокирует запросы из браузера.';
    }
    
    if (msg.includes('timeout') || msg.includes('таймаут')) {
        return 'Таймаут. Сервер не ответил вовремя.';
    }
    
    if (msg.includes('ssl') || msg.includes('certificate')) {
        return 'Ошибка SSL сертификата. Проверьте адрес API.';
    }
    
    return String(error?.message || error || 'Неизвестная ошибка');
}

/**
 * Обработать ошибку подключения к API и показать уведомление.
 * 
 * @param {Error|{status: number, body: string}} error
 * @param {{silent?: boolean, prefix?: string}} [opts]
 * @returns {string} описание ошибки
 */
export function handleApiError(error, opts = {}) {
    const silent = opts.silent === true;
    const prefix = opts.prefix ? `${opts.prefix}: ` : '';
    
    let description;
    
    if (error && typeof error === 'object' && 'status' in error) {
        // HTTP ошибка с явным статусом
        description = describeHttpError(error.status, error.body);
    } else if (error instanceof Error) {
        // Ошибка fetch или другая JS ошибка
        description = describeFetchError(error);
    } else {
        description = String(error || 'Неизвестная ошибка');
    }
    
    const full = `${prefix}${description}`;
    
    if (!silent) {
        showNotification(full, NotificationType.ERROR);
    }
    
    return full;
}

/**
 * Обработать ошибку генерации контента и показать уведомление.
 * 
 * @param {Error} error
 * @param {string} context что пытались сгенерировать ('сообщение', 'пост', и т.д.)
 * @param {{silent?: boolean}} [opts]
 * @returns {string} описание ошибки
 */
export function handleGenerationError(error, context, opts = {}) {
    const silent = opts.silent === true;
    const what = String(context || 'контент').trim();
    
    const base = handleApiError(error, { silent: true });
    const full = `Не удалось сгенерировать ${what}: ${base}`;
    
    if (!silent) {
        showNotification(full, NotificationType.ERROR);
    }
    
    console.error(`${MODULE} ${what} generation failed:`, error);
    return full;
}

/**
 * Обработать ошибку генерации изображения и показать уведомление.
 * 
 * @param {Error} error
 * @param {{silent?: boolean}} [opts]
 * @returns {string} описание ошибки
 */
export function handleImageGenerationError(error, opts = {}) {
    const silent = opts.silent === true;
    const msg = String(error?.message || error || '').toLowerCase();
    
    let description;
    
    if (msg.includes('haruspics') && msg.includes('не установлен')) {
        description = 'Haruspics не установлен. Выберите другой провайдер в настройках.';
    } else if (msg.includes('not found') || msg.includes('не найден')) {
        description = 'Провайдер изображений не найден. Проверьте настройки.';
    } else if (msg.includes('api key') || msg.includes('ключ')) {
        description = 'Не задан API ключ для генерации изображений.';
    } else {
        description = handleApiError(error, { silent: true });
    }
    
    const full = `Не удалось создать изображение: ${description}`;
    
    if (!silent) {
        showNotification(full, NotificationType.ERROR);
    }
    
    console.error(`${MODULE} image generation failed:`, error);
    return full;
}

/**
 * Показать уведомление об успешной операции.
 * 
 * @param {string} message описание того, что сделано
 */
export function success(message) {
    showNotification(message, NotificationType.SUCCESS);
}

/**
 * Показать информационное уведомление.
 * 
 * @param {string} message
 */
export function info(message) {
    showNotification(message, NotificationType.INFO);
}

/**
 * Показать предупреждение.
 * 
 * @param {string} message
 */
export function warn(message) {
    showNotification(message, NotificationType.WARNING);
}

/**
 * Показать ошибку.
 * 
 * @param {string} message
 */
export function error(message) {
    showNotification(message, NotificationType.ERROR);
}
