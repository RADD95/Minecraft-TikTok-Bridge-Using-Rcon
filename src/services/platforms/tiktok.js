const { TikTokLiveConnection } = require('tiktok-live-connector');
const actionsService = require('../core/actions');

class TikTokService {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5; // Límite de reintentos
        this.reconnectDelay = 5000;
        this.autoReconnect = true;
        this.connectTime = 0;
        this.currentUsername = null;
    }

    async start(username) {
        if (this.isConnecting) {
            console.log("⏳ Conexión en progreso...");
            return;
        }

        if (this.connection && this.currentUsername === username) {
            console.log("⚠️ Ya conectado a este usuario");
            return;
        }

        this.isConnecting = true;
        this.reconnectAttempts = 0;

        // Limpiar conexión anterior si existe
        if (this.connection) {
            await this.stop();
        }

        console.log("🎥 Conectando a TikTok LIVE de:", username);
        this.currentUsername = username;
        this.connectTime = Date.now();
        this.autoReconnect = true;

        try {
            this.connection = new TikTokLiveConnection(username, {
                processInitialData: false,
                enableExtendedGiftInfo: true,
                // Deshabilitar fallback de Euler si no lo usas
                disableEulerFallbacks: false
            });

            this._setupListeners();

            await this.connection.connect();

            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0; // Reset contador al conectar
            console.log("✅ Conectado a TikTok LIVE de", username);

        } catch (err) {
            this.isConnecting = false;
            this.isConnected = false;

            // Manejar errores específicos
            const errorMsg = err?.message || String(err);

            if (errorMsg.includes('user_not_found')) {
                console.error("❌ Usuario no encontrado o no está en vivo:", username);
                this.autoReconnect = false; // No reconectar si el usuario no existe
                return;
            }

            if (errorMsg.includes('blocked by TikTok') || errorMsg.includes('SIGI_STATE')) {
                console.error("❌ TikTok está bloqueando la conexión. Intenta más tarde.");
                // Esperar más tiempo antes de reconectar
                this._scheduleReconnect(30000); // 30 segundos
                return;
            }

            console.error("❌ Error conectando a TikTok:", errorMsg);
            this._scheduleReconnect();
        }
    }

    _setupListeners() {
        // Eventos igual que antes...
        this.connection.on('chat', (data) => {
            const username = data.user?.uniqueId || "unknown";
            const nickname = data.user?.nickname || username;
            const msgTime = parseInt(data.createTime || "0", 10);
            if (msgTime && msgTime < this.connectTime - 5000) return;

            actionsService.handleEvent('comment', {
                username,
                nickname,
                comment: data.comment,
                platform: 'tiktok'
            });
        });

        this.connection.on('gift', (data) => {
            const username = data.user?.uniqueId || "unknown";
            const nickname = data.user?.nickname || username;
            const giftType = data.giftDetails?.giftType ?? data.extendedGiftInfo?.type ?? 0;

            if (giftType === 1 && !data.repeatEnd) return;

            const msgTime = parseInt(data.common?.createTime || "0", 10);
            if (msgTime && msgTime < this.connectTime - 5000) return;

            actionsService.handleEvent('gift', {
                username,
                nickname,
                giftname: data.giftDetails?.giftName || data.extendedGiftInfo?.name || "Gift",
                repeatcount: data.repeatCount || 1,
                diamondCount: data.diamondCount || data.giftDetails?.diamondCount || 0,
                platform: 'tiktok'
            });
        });

        this.connection.on('like', (data) => {
            actionsService.handleEvent('like', {
                username: data.user?.uniqueId || "unknown",
                nickname: data.user?.nickname || data.user?.uniqueId,
                likecount: data.likeCount || 1,
                platform: 'tiktok'
            });
        });

        this.connection.on('follow', (data) => {
            const username = data.user?.uniqueId || "unknown";
            const nickname = data.user?.nickname || username;

            if (username === "unknown") {
                console.log("⚠️ Evento follow sin usuario válido");
                return;
            }

            actionsService.handleEvent('follow', {
                username,
                nickname,
                platform: 'tiktok'
            });
        });



        this.connection.on('error', (err) => {
            console.error("⚠️ Error TikTok:", err?.message || err);
            this.isConnected = false;

            // No reconectar si es error fatal
            if (this._isFatalError(err)) {
                console.log("⛔ Error fatal, deteniendo reconexiones");
                this.autoReconnect = false;
                return;
            }

            this._scheduleReconnect();
        });

        this.connection.on('disconnected', () => {
            console.log("🔌 Desconectado de TikTok LIVE");
            this.isConnected = false;
            if (this.autoReconnect) {
                this._scheduleReconnect();
            }
        });
    }

    _isFatalError(err) {
        const msg = String(err?.message || err);
        return msg.includes('user_not_found') ||
            msg.includes('blocked') ||
            msg.includes('Failed to retrieve Room ID from all sources');
    }

    _scheduleReconnect(delay = null) {
        if (!this.autoReconnect) return;
        if (this.reconnectTimer) return;

        this.reconnectAttempts++;

        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.log(`⛔ Máximo de reintentos (${this.maxReconnectAttempts}) alcanzado. Deteniendo.`);
            this.autoReconnect = false;
            return;
        }

        const actualDelay = delay || this.reconnectDelay;
        console.log(`🔁 Reintento ${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${actualDelay / 1000}s...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.autoReconnect && this.currentUsername) {
                this.start(this.currentUsername);
            }
        }, actualDelay);
    }

    async stop() {
        console.log("🛑 Deteniendo TikTok...");
        this.autoReconnect = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.connection) {
            this.connection.removeAllListeners();
            try {
                await this.connection.disconnect();
            } catch (err) {
                // Ignorar errores al desconectar
            }
            this.connection = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log("✅ TikTok detenido");
    }

    getStatus() {
        return this.isConnected;
    }
}

module.exports = new TikTokService();
