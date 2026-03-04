// services/core/queue.js
const rconService = require('../infra/rcon');
const logger = require('../../utils/logger');

class CommandQueue {
  constructor() {
    this.queue = [];               // [{ commands: string[], source: string }]
    this.isProcessing = false;
    this.GROUP_DELAY_MS = 10000;   // Mínimo entre grupos
    this.COMMAND_DELAY_MS = 100;   // Delay entre comandos dentro del grupo
    this.lastGroupFinishedAt = null;
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

    // ⬇️ NUEVO: si RCON está offline, no vaciamos la cola, solo esperamos
    if (!rconService.isConnected()) {
      logger.warn(`⚠️ RCON offline. Cola retenida con ${this.queue.length} grupo(s) pendiente(s).`);
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { commands, source } = this.queue.shift();

      // Respetar delay mínimo desde el último grupo
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

      this.lastGroupFinishedAt = Date.now();
      logger.info(`📦 Grupo completado [${source}]`);
    }

    this.isProcessing = false;
    logger.info('📭 Cola vacía');
  }
}

module.exports = new CommandQueue();
