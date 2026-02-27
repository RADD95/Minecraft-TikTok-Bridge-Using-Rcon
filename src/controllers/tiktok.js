const tiktokService = require('../services/platforms/tiktok');
const storage = require('../services/infra/storage');

module.exports = {
    start(req, res) {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ success: false, error: "Username requerido" });
        }

        const config = storage.loadConfig();
        config.tiktok.username = username;
        storage.saveConfig(config);

        tiktokService.start(username);
        res.json({ success: true, message: `Conectando a ${username}...` });
    },

    stop(req, res) {
        tiktokService.stop();
        res.json({ success: true, message: "Detenido" });
    },

    getStatus(req, res) {
        res.json({ tiktok: tiktokService.getStatus() });
    }
};
