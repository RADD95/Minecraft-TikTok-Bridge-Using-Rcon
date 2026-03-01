const express = require("express");
const cors = require("cors");
const path = require("path");

// Controllers
const configController = require('./controllers/config');
const rconController = require('./controllers/rcon');
const tiktokController = require('./controllers/tiktok');
const actionsController = require('./controllers/actions');
const statsController = require('./controllers/stats');
const giftsController = require('./controllers/gifts');

//Utils
const logger = require('./utils/logger');

// Services (para reconexión automática al iniciar)
const storage = require('./services/infra/storage');
const rconService = require('./services/infra/rcon');

const app = express();
const PORT = 4567;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get("/api/status", (req, res) => {
    const tiktokService = require('./services/platforms/tiktok');
    res.json({
        rcon: rconService.isConnected(),
        tiktok: tiktokService.getStatus(),
        config: storage.loadConfig()
    });
});

// Config
app.get("/api/config", configController.get);
app.post("/api/config", configController.save);

// Actions
app.get("/api/actions", actionsController.get);
app.post("/api/actions", actionsController.add);
app.post("/api/actions/:index", actionsController.update);
app.put("/api/actions/:index", actionsController.update); 
app.delete("/api/actions/:index", actionsController.delete);
app.get('/api/gifts', giftsController.get);


// RCON
app.post("/api/rcon/connect", rconController.connect);
app.post("/api/rcon/disconnect", rconController.disconnect);
app.post("/api/rcon/test", rconController.test);
app.post("/api/rcon/command", rconController.command);

// TikTok
app.post("/api/tiktok/start", tiktokController.start);
app.post("/api/tiktok/stop", tiktokController.stop);
// app.get("/api/tiktok/status", tiktokController.getStatus); // ya está en /api/status

// Stats
app.get("/api/stats", statsController.get);
app.post("/api/stats/reset", statsController.reset);

// SSE endpoint (reemplaza /api/logs polling)
app.get("/api/logs/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Logs iniciales
    res.write(`data: ${JSON.stringify(logger.getLogs().slice(-20))}\n\n`);
    
    // Stream live
    const handler = (newLog) => {
        res.write(`data: ${JSON.stringify([newLog])}\n\n`);
    };
    logger.on('newLog', handler);
    
    req.on('close', () => logger.off('newLog', handler));
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
    console.log("╔═══════════════════════════════════════╗");
    console.log("║   🎮 Minecraft TikTok Bridge          ║");
    console.log("║   Panel: http://localhost:" + PORT + "        ║");
    console.log("╚═══════════════════════════════════════╝");
    console.log("");
    console.log("📋 Pasos:");
    console.log("   1. Abre http://localhost:" + PORT + " en tu navegador");
    console.log("   2. Configura RCON (IP, puerto, password)");
    console.log("   3. Conecta RCON");
    console.log("   4. Agrega acciones");
    console.log("   5. Inicia TikTok LIVE");
    console.log("");



    const config = storage.loadConfig();
    if (config.rcon?.host && config.rcon?.password) {
        logger.info("⚙️ Config RCON detectada. Conecta desde panel.");
    }

});
