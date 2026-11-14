/**
 * Встроенная система уведомлений для телефона.
 * Показывает уведомления ВНУТРИ UI телефона, а не через toastr.
 */

const NOTIFICATION_DURATION = 5000; // 5 секунд

/**
 * Показать уведомление внутри телефона.
 * 
 * @param {string} message текст
 * @param {'success'|'error'|'info'|'warning'} type тип
 */
export function showInPhoneNotification(message, type = 'info') {
    const text = String(message || '').trim();
    const kind = String(type || 'info');
    
    console.log(`[Astral Phone] [${kind.toUpperCase()}]`, text);
    
    // Находим контейнер телефона
    const phoneBody = document.querySelector('.astral-phone-body');
    if (!phoneBody) {
        // Телефон не открыт — fallback на toastr
        try {
            const toastr = window.toastr;
            if (toastr) {
                const method = toastr[kind] || toastr.info;
                method.call(toastr, text);
            }
        } catch (err) {
            console.warn('[Astral Phone] toast fallback failed:', err);
        }
        return;
    }
    
    // Создаём контейнер для уведомлений, если его нет
    let container = document.querySelector('.astral-phone-notifications');
    if (!container) {
        container = document.createElement('div');
        container.className = 'astral-phone-notifications';
        phoneBody.parentElement.appendChild(container);
    }
    
    // Создаём уведомление
    const notification = document.createElement('div');
    notification.className = `astral-phone-notification astral-phone-notification--${kind}`;
    
    const icon = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    }[kind] || 'ℹ';
    
    notification.innerHTML = `
        <div class="astral-phone-notification-icon">${icon}</div>
        <div class="astral-phone-notification-text">${escapeHtml(text)}</div>
    `;
    
    container.appendChild(notification);
    
    // Анимация появления
    requestAnimationFrame(() => {
        notification.classList.add('astral-phone-notification--show');
    });
    
    // Автоматическое скрытие
    setTimeout(() => {
        notification.classList.remove('astral-phone-notification--show');
        notification.classList.add('astral-phone-notification--hide');
        
        setTimeout(() => {
            notification.remove();
            
            // Удаляем контейнер, если он пустой
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, NOTIFICATION_DURATION);
    
    // Клик для закрытия
    notification.addEventListener('click', () => {
        notification.classList.remove('astral-phone-notification--show');
        notification.classList.add('astral-phone-notification--hide');
        setTimeout(() => notification.remove(), 300);
    });
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Обёртки для удобства.
 */
export function phoneSuccess(message) {
    showInPhoneNotification(message, 'success');
}

export function phoneError(message) {
    showInPhoneNotification(message, 'error');
}

export function phoneInfo(message) {
    showInPhoneNotification(message, 'info');
}

export function phoneWarn(message) {
    showInPhoneNotification(message, 'warning');
}
