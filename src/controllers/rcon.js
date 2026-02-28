const rconService = require('../services/infra/rcon');
const storage = require('../services/infra/storage');
const logger = require('../utils/logger');
const queue = require('../services/core/queue');

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
        const { useQueue = false } = req.body;  // ← NUEVO PARAM

        if (!rconService.isConnected()) {
            return res.status(400).json({ success: false, error: "RCON no conectado" });
        }

        try {
            const fakeData = { /* igual */ };
            const actionsService = require('../core/actions');
            const parsed = actionsService.parseCommand(command, fakeData);
            const commands = actionsService.splitCommands(parsed);

            if (useQueue) {
                queue.add(commands, 'action');
                res.json({ success: true, queued: commands.length, totalPending: queue.queue.length });
            } else {
                // Inmediato (igual)
                let lastResponse = null;
                for (const cmd of commands) {
                    logger.info(`🚀 Directo: ${cmd}`);
                    lastResponse = await rconService.send(cmd);
                }
                res.json({ success: true, executed: commands.length });
            }
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
};
