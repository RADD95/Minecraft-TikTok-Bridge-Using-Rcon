const storage = require('../services/infra/storage');

module.exports = {
    get(req, res) {
        res.json(storage.loadConfig());
    },

    save(req, res) {
        const config = req.body;
        storage.saveConfig(config);
        res.json({ success: true, message: "Configuración guardada" });
    }
};
