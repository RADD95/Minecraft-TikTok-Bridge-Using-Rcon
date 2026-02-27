const { Rcon } = require('rcon-client');
const storage = require('./storage');

class RconService {
    constructor() {
        this.client = null;
        this.connected = false;
    }

    async connect() {
        const config = storage.loadConfig();
        
        if (!config.rcon.host || !config.rcon.password) {
            throw new Error('RCON no configurado');
        }

        if (this.client) {
            await this.client.end();
        }

        this.client = await Rcon.connect({
            host: config.rcon.host,
            port: config.rcon.port || 25575,
            password: config.rcon.password
        });

        this.connected = true;
        
        // Mensaje de prueba
        await this.client.send("say §a[TikTok Bridge] §fConectado correctamente");
        
        return true;
    }

    async send(command) {
        if (!this.connected || !this.client) {
            throw new Error('RCON no conectado');
        }
        return this.client.send(command);
    }

    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
            this.connected = false;
        }
    }

    isConnected() {
        return this.connected;
    }
}

module.exports = new RconService();
