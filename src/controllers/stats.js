const statsService = require('../services/core/stats');

module.exports = {
    get(req, res) {
        res.json(statsService.get());
    },

    reset(req, res) {
        statsService.reset();
        res.json({ success: true, message: "Estadísticas reseteadas" });
    }
};
