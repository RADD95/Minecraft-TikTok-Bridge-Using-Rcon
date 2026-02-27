const storage = require('../services/infra/storage');

module.exports = {
    get(req, res) {
        res.json(storage.loadActions());
    },

    add(req, res) {
        const actions = storage.loadActions();
        actions.push(req.body);
        storage.saveActions(actions);
        res.json({ success: true, message: "Acción agregada" });
    },

    update(req, res) {
        const actions = storage.loadActions();
        const index = parseInt(req.params.index);

        if (index >= 0 && index < actions.length) {
            actions[index] = req.body; 
            storage.saveActions(actions);
            res.json({ success: true, message: "Acción actualizada" });
        } else {
            res.status(400).json({ success: false, error: "Índice inválido" });
        }
    },

    delete(req, res) {
        const actions = storage.loadActions();
        const index = parseInt(req.params.index);

        if (index >= 0 && index < actions.length) {
            actions.splice(index, 1);
            storage.saveActions(actions);
            res.json({ success: true, message: "Acción eliminada" });
        } else {
            res.status(400).json({ success: false, error: "Índice inválido" });
        }
    }
};
