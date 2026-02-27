const rconService = require('../services/infra/rcon');
const storage = require('../services/infra/storage');
const logger = require('../utils/logger');

module.exports = {
    async connect(req, res) {
        try {
            const config = storage.loadConfig();
            await rconService.connect();
            res.json({ success: true, connected: rconService.isConnected() });
        } catch (error) {
            res.json({ success: false, error: error.message, connected: false });
        }
    },

    disconnect(req, res) {
        rconService.disconnect();
        res.json({ success: true, connected: false });
    },

    async test(req, res) {
        if (!rconService.isConnected()) {
            return res.json({ success: false, error: "RCON no conectado" });
        }

        try {
            const response = await rconService.send("list");
            res.json({ success: true, response });
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    },

    async command(req, res) {
        const { command } = req.body;

        if (!rconService.isConnected()) {
            return res.status(400).json({ success: false, error: "RCON no conectado" });
        }

        try {
            const fakeData = {
                username: "test_user",
                nickname: "Tester",
                giftname: "Rose",
                repeatcount: 1,
                likecount: 15,
                comment: "Comentario de prueba",
                diamondCount: 1
            };

            const actionsService = require('../services/core/actions');
            const parsed = actionsService.parseCommand(command, fakeData);
            const commands = actionsService.splitCommands(parsed);
            let lastResponse = null;

            for (const cmd of commands) {
                logger.info(`🧪 TEST Ejecutando: ${cmd}`);
                lastResponse = await rconService.send(cmd);
                if (commands.length > 1) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            res.json({ success: true, response: lastResponse, executed: commands.length });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
};
