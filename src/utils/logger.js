const EventEmitter = require('events');
let logs = [];

const logger = {
    info(msg) {
        const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log(`[${time}] [INFO] ${msg}`);
        const entry = { time, type: 'info', message: msg };
        logs.unshift(entry);
        if (logs.length > 100) logs.pop();
        logger.emit('newLog', entry);  // ← SSE MAGIC
    },
    warn(msg) {
        const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.warn(`[${time}] [WARN] ${msg}`);
        const entry = { time, type: 'warn', message: msg };
        logs.unshift(entry);
        if (logs.length > 100) logs.pop();
        logger.emit('newLog', entry);
    },
    error(msg, err) {
        const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.error(`[${time}] [ERROR] ${msg}`, err || '');
        const entry = { time, type: 'error', message: `${msg} ${err?.message || ''}` };
        logs.unshift(entry);
        if (logs.length > 100) logs.pop();
        logger.emit('newLog', entry);
    },
    event(platform, type, data) {
        const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log(`[${time}] [${platform.toUpperCase()}] ${type}:`, data);
        const entry = { time, type: 'event', message: `[${platform}] ${type}: ${JSON.stringify(data).slice(0,100)}` };
        logs.unshift(entry);
        if (logs.length > 100) logs.pop();
        logger.emit('newLog', entry);
    },
    getLogs: () => logs
};

// Hacer logger compatible con EventEmitter
Object.setPrototypeOf(logger, new EventEmitter());

module.exports = logger;
