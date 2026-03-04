const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

const FILES = {
    config: path.join(process.cwd(), 'config.json'),
    actions: path.join(process.cwd(), 'actions.json'),
    stats: path.join(process.cwd(), 'stats.json'),
    overlays: path.join(process.cwd(), 'overlays.json')
};

class Storage {
    _read(file, defaultValue) {
        try {
            if (!fs.existsSync(file)) {
                this._write(file, defaultValue);
                return defaultValue;
            }
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
            logger.error(`Error leyendo ${file}:`, err);
            return defaultValue;
        }
    }

    _write(file, data) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }

    // Config
    loadConfig() {
        return this._read(FILES.config, {
            rcon: { host: "", port: 25575, password: "" },
            minecraft: { playername: "@a" },
            tiktok: { username: "" }
        });
    }

    saveConfig(config) {
        this._write(FILES.config, config);
    }

    // Actions
    loadActions() {
        return this._read(FILES.actions, []);
    }

    saveActions(actions) {
        this._write(FILES.actions, actions);
    }

    // Stats
    loadStats() {
        return this._read(FILES.stats, {
            totalLikes: 0,
            totalComments: 0,
            totalFollows: 0,
            totalGifts: 0,
            diamondsTotal: 0,
            users: {},
            giftTypes: {}
        });
    }

    saveStats(stats) {
        this._write(FILES.stats, stats);
    }

    // Overlays
    loadOverlays() {
        return this._read(FILES.overlays, []); // array de overlays
    }

    saveOverlays(overlays) {
        this._write(FILES.overlays, overlays);
    }

}

module.exports = new Storage();
