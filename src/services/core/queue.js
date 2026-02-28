// services/core/queue.js
const rconService = require('../infra/rcon');
const logger = require('../../utils/logger');

class CommandQueue {
    constructor() {
        this.queue = [];              // [{ commands: string[], source: string }]
        this.isProcessing = false;
        this.GROUP_DELAY_MS = 10000;   // ⬅️ MÍNIMO entre grupos (1.5s, pon 1000 / 2000 / 3000...)
        this.COMMAND_DELAY_MS = 0;    // ⬅️ Dentro del grupo (0 = instantáneo)
        this.lastGroupFinishedAt = null; // ⬅️ Nuevo: timestamp fin del último grupo
    }

    add(commands, source = 'unknown') {
        if (!Array.isArray(commands) || commands.length === 0) return;

        this.queue.push({ commands, source });
        logger.info(`📋 Cola +1 grupo (${source}) → grupos pendientes: ${this.queue.length}`);
        this.processNext();
    }

    async processNext() {
        if (this.isProcessing) return;
        if (this.queue.length === 0) {
            logger.info('📭 Cola vacía');
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const { commands, source } = this.queue.shift();

            // ⬇️ NUEVO: respetar delay mínimo desde el ÚLTIMO grupo, aunque la cola estuviera vacía
            if (this.lastGroupFinishedAt && this.GROUP_DELAY_MS > 0) {
                const elapsed = Date.now() - this.lastGroupFinishedAt;
                const remaining = this.GROUP_DELAY_MS - elapsed;
                if (remaining > 0) {
                    logger.info(`⏳ Esperando ${remaining / 1000}s antes de grupo [${source}]...`);
                    await new Promise(r => setTimeout(r, remaining));
                }
            }

            logger.info(
                `🚀 Grupo cola [${source}] (${commands.length} cmds, grupos restantes: ${this.queue.length})`
            );

            // Ejecutar TODOS los comandos del grupo
            for (let i = 0; i < commands.length; i++) {
                const cmd = commands[i];

                logger.info(
                    `🚀 Cola cmd [${source} ${i + 1}/${commands.length}]: ${cmd}`
                );

                try {
                    await rconService.send(cmd);
                    logger.info(`✅ Cola OK [${source}]: ${cmd}`);
                } catch (err) {
                    logger.error(`❌ Cola FAIL [${source}]: ${cmd}`, err);
                }

                if (i < commands.length - 1 && this.COMMAND_DELAY_MS > 0) {
                    await new Promise(r => setTimeout(r, this.COMMAND_DELAY_MS));
                }
            }

            // Marcar fin de grupo (para el siguiente, venga cuando venga)
            this.lastGroupFinishedAt = Date.now();
            logger.info(`📦 Grupo completado [${source}]`);
        }

        this.isProcessing = false;
        logger.info('📭 Cola vacía');
    }
}

module.exports = new CommandQueue();
