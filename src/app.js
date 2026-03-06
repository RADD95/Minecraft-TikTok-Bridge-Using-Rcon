const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require('crypto');


// Controllers
const configController = require('./controllers/config');
const rconController = require('./controllers/rcon');
const tiktokController = require('./controllers/tiktok');
const actionsController = require('./controllers/actions');
const statsController = require('./controllers/stats');
const giftsController = require('./controllers/gifts');
const overlaysController = require('./controllers/overlays');


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
// Renders de Minecraft (JSON en la raíz del proyecto)
app.get('/data/minecraft_renders.json', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'minecraft_renders.json'));
});



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

// Overlays
app.get('/api/overlays', overlaysController.list);
app.get('/api/overlays/:id', overlaysController.get);
app.post('/api/overlays', overlaysController.upsert);
app.put('/api/overlays/:id', overlaysController.upsert);
app.delete('/api/overlays/:id', overlaysController.delete);


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

// Runtime del overlay (para OBS / TikTok Live Studio)
app.get('/overlay/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'overlay.html'));
});

// Cache de imágenes TikTok / Minecraft para el editor
app.post('/api/cache-image', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ success: false, error: 'url requerida' });
    }

    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const extFromUrl = path.extname(new URL(url).pathname) || '.png';
    const ext = extFromUrl.toLowerCase().split('?')[0] || '.png';

    const cacheDir = path.join(__dirname, '..', 'public', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileName = `${hash}${ext}`;
    const filePath = path.join(cacheDir, fileName);

    // Si ya está cacheada, devolver directamente
    if (!fs.existsSync(filePath)) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer
        ? Buffer.from(await resp.arrayBuffer())
        : await resp.buffer(); // soporta fetch nativo o node-fetch
      fs.writeFileSync(filePath, buf);
    }

    return res.json({
      success: true,
      cachedUrl: `/cache/${fileName}`
    });
  } catch (e) {
    console.error('Error cacheando imagen', e);
    return res.status(500).json({ success: false, error: e.message });
  }
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
