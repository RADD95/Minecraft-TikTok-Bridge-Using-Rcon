const { Rcon } = require('rcon-client');
const storage = require('./storage');
const logger = require('../../utils/logger');


class RconService {
    constructor() {
        this.client = null;
        this.connected = false;
    }

    async connect() {
        const config = storage.loadConfig();
        
        if (!config.rcon?.host || !config.rcon?.password) {
            throw new Error('RCON no configurado');
        }

        // Cleanup previo
        if (this.client) {
            await this.client.end().catch(() => {});
            this.client = null;
        }

        try {
            this.client = await Rcon.connect({
                host: config.rcon.host,
                port: config.rcon.port || 25575,
                password: config.rcon.password
            });

            // 🔥 SOLO estos 2 listeners básicos (anti-crash)
            this.client.on('error', (err) => {
                logger.error('RCON error', err);
                this.connected = false;
            });

            this.client.on('end', () => {
                logger.info('RCON desconectado');
                this.connected = false;
            });

            this.connected = true;
            await this.client.send("say §a[RCON] §fConectado correctamente");
            logger.info('RCON conectado');
            return true;

        } catch (err) {
            logger.error('Error RCON', err);
            this.connected = false;
            throw err;  // Deja que el caller maneje
        }
    }

    async send(command) {
        if (!this.connected || !this.client) {
            throw new Error('RCON no conectado');
        }
        return this.client.send(command);
    }

    disconnect() {
        logger.info('Desconectando RCON...');
        if (this.client) {
            this.client.end().catch(() => {});
            this.client.removeAllListeners?.();  // Opcional, safe
            this.client = null;
        }
        this.connected = false;
    }

    isConnected() {
        return this.connected;
    }
}

module.exports = new RconService();
