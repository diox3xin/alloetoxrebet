/**
 * Рандомные события телефона по таймеру.
 * 
 * Донаты, подписчики и другие события могут происходить автоматически
 * по реальному времени, даже когда юзер не пишет в чат.
 */

/**
 * Запустить таймеры автономных событий.
 * 
 * @param {PhoneCore} core экземпляр телефона
 * @param {object} options настройки частоты
 */
export function startPhoneTimers(core, options = {}) {
    const {
        donationInterval = 10 * 60 * 1000,      // 10 минут
        donationChance = 0.3,                   // 30% шанс
        subscriberInterval = 30 * 60 * 1000,    // 30 минут
        subscriberChance = 0.5,                 // 50% шанс
    } = options;
    
    const timers = [];
    
    // Донаты: каждые N минут с шансом
    const donationTimer = setInterval(() => {
        try {
            if (Math.random() < donationChance) {
                // Малые суммы чаще, крупные реже
                const tier = Math.random();
                let amount;
                let from = generateFanName();
                
                if (tier < 0.7) {
                    // 70%: малые донаты $5-$20
                    amount = Math.floor(Math.random() * 16) + 5;
                } else if (tier < 0.95) {
                    // 25%: средние $20-$50
                    amount = Math.floor(Math.random() * 31) + 20;
                } else {
                    // 5%: крупные $50-$200
                    amount = Math.floor(Math.random() * 151) + 50;
                    from = generateFanName(true); // крупный донатер
                }
                
                console.log(`[Astral Phone Timers] donation: $${amount} from ${from}`);
                core.handleEvent({
                    type: 'donation_received',
                    character: '',
                    description: '',
                    metadata: { amount, from },
                });
            }
        } catch (err) {
            console.warn('[Astral Phone Timers] donation event failed:', err);
        }
    }, donationInterval);
    
    timers.push(donationTimer);
    
    // Подписчики: каждые N минут
    const subscriberTimer = setInterval(() => {
        try {
            if (Math.random() < subscriberChance) {
                // 1-5 подписчиков за раз
                const count = Math.floor(Math.random() * 5) + 1;
                
                console.log(`[Astral Phone Timers] new subscribers: ${count}`);
                core.handleEvent({
                    type: 'subscriber_joined',
                    character: '',
                    description: '',
                    metadata: { count },
                });
            }
        } catch (err) {
            console.warn('[Astral Phone Timers] subscriber event failed:', err);
        }
    }, subscriberInterval);
    
    timers.push(subscriberTimer);
    
    // Возвращаем функцию для остановки всех таймеров
    return () => {
        console.log('[Astral Phone Timers] stopping all timers');
        timers.forEach(timer => clearInterval(timer));
    };
}

/**
 * Генератор имён фанатов для донатов.
 */
function generateFanName(isWhale = false) {
    const prefixes = [
        'Dark', 'Night', 'Shadow', 'Cyber', 'Neon', 'Crystal', 'Silent',
        'Mystic', 'Lunar', 'Solar', 'Arctic', 'Storm', 'Fire', 'Ice',
    ];
    
    const suffixes = [
        'Wolf', 'Raven', 'Fox', 'Dragon', 'Phoenix', 'Angel', 'Demon',
        'Knight', 'Witch', 'Mage', 'Hunter', 'Ghost', 'Star', 'Moon',
    ];
    
    const numbers = Math.random() < 0.4 ? Math.floor(Math.random() * 999) + 1 : '';
    
    if (isWhale) {
        // Крупные донатеры — более "серьёзные" имена
        const whaleNames = [
            'BigSpender', 'DiamondTier', 'PlatinumFan', 'GoldSupporter',
            'RoyalPatron', 'VIPSupporter', 'TopDonor', 'MegaFan',
        ];
        return whaleNames[Math.floor(Math.random() * whaleNames.length)] + numbers;
    }
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return prefix + suffix + numbers;
}
