const express = require("express");
const cors = require("cors");
const { Rcon } = require("rcon-client");
const { TikTokLiveConnection } = require("tiktok-live-connector");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 4567;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ========================
// ESTADO GLOBAL
// ========================
let rcon = null;
let tiktokConnection = null;
let isConnected = {
    rcon: false,
    tiktok: false
};
let tiktokReconnectTimer = null;
const TIKTOK_RECONNECT_DELAY = 5000; // 5s
let tiktokAutoReconnect = true;
let tiktokConnectTime = 0;


// ========================
// CONFIGURACIÓN
// ========================
const CONFIG_FILE = "config.json";
const ACTIONS_FILE = "actions.json";

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = {
            rcon: {
                host: "",
                port: 25575,
                password: ""
            },
            minecraft: {
                playername: "@a"
            },
            tiktok: {
                username: ""
            }
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function loadActions() {
    if (!fs.existsSync(ACTIONS_FILE)) {
        fs.writeFileSync(ACTIONS_FILE, JSON.stringify([], null, 2));
        return [];
    }
    return JSON.parse(fs.readFileSync(ACTIONS_FILE, "utf8"));
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function saveActions(actions) {
    fs.writeFileSync(ACTIONS_FILE, JSON.stringify(actions, null, 2));
}

// ========================
// ESTADÍSTICAS (CONTADORES)
// ========================
const STATS_FILE = "stats.json";

function loadStats() {
    if (!fs.existsSync(STATS_FILE)) {
        const defaultStats = {
            totalLikes: 0,
            totalComments: 0,
            totalFollows: 0,
            totalGifts: 0,
            diamondsTotal: 0,
            users: {},
            giftTypes: {}
        };
        fs.writeFileSync(STATS_FILE, JSON.stringify(defaultStats, null, 2));
        return defaultStats;
    }
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
}

function saveStats(stats) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function incrementStats(type, data) {
    const stats = loadStats();
    const username = data.username || "unknown";

    if (!stats.users[username]) {
        stats.users[username] = { likes: 0, comments: 0, gifts: 0, follows: 0 };
    }

    switch (type) {
        case 'like':
            const likeCount = parseInt(data.likecount) || 1;
            stats.totalLikes += likeCount;
            stats.users[username].likes += likeCount;
            break;
        case 'comment':
            stats.totalComments++;
            stats.users[username].comments++;
            break;
        case 'follow':
            stats.totalFollows++;
            stats.users[username].follows++;
            break;
        case 'gift':
            const giftCount = parseInt(data.repeatcount) || 1;
            const diamonds = parseInt(data.diamondCount) || 0;
            stats.totalGifts += giftCount;
            stats.diamondsTotal += diamonds;
            stats.users[username].gifts += giftCount;
            const giftName = data.giftname || "unknown";
            if (!stats.giftTypes[giftName]) stats.giftTypes[giftName] = 0;
            stats.giftTypes[giftName] += giftCount;
            break;
    }

    saveStats(stats);
    return stats;
}

// ========================
// RCON CONEXIÓN
// ========================
async function connectRcon() {
    const config = loadConfig();

    if (!config.rcon.host || !config.rcon.password) {
        console.log("⚠️  RCON no configurado. Configura IP y password desde el panel.");
        return false;
    }

    try {
        if (rcon) {
            await rcon.end();
        }

        rcon = await Rcon.connect({
            host: config.rcon.host,
            port: config.rcon.port || 25575,
            password: config.rcon.password
        });

        isConnected.rcon = true;
        console.log("✅ RCON conectado a", config.rcon.host);

        // Enviar mensaje de prueba
        await rcon.send("say §a[TikTok Bridge] §fConectado correctamente");
        return true;

    } catch (err) {
        console.error("❌ Error RCON:", err.message);
        isConnected.rcon = false;
        return false;
    }
}

function disconnectRcon() {
    if (rcon) {
        rcon.end();
        rcon = null;
        isConnected.rcon = false;
        console.log("🔌 RCON desconectado");
    }
}

// ========================
// TIKTOK LISTENER
// ========================
function startTikTokListener(username) {
    if (tiktokConnection) {
        console.log("⚠️ Ya hay una conexión activa. Deteniendo primero...");
        stopTikTokListener();
    }

    console.log("🎥 Conectando a TikTok LIVE de:", username);

    tiktokConnectTime = Date.now();

    tiktokConnection = new TikTokLiveConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true
    });

    tiktokConnection.connect().then(() => {
        isConnected.tiktok = true;
        console.log("✅ Conectado a TikTok LIVE de", username);

        if (isConnected.rcon) {
            rcon.send(`say §d[TikTok] §fConectado al LIVE de ${username}`);
        }
    }).catch(err => {
        console.error("❌ Error conectando a TikTok:", err?.message || err);
        isConnected.tiktok = false;
        scheduleTikTokReconnect(username);
    });

    // CHAT
    tiktokConnection.on('chat', (data) => {
        const username = data.user?.uniqueId || data.user?.userId || "unknown";
        const nickname = data.user?.nickname || username;

        // Tiempo del mensaje (TikTok lo manda en ms unix como string normalmente)
        const msgTime = parseInt(data.createTime || data.common?.createTime || "0", 10);

        // Si tiene timestamp y es significativamente anterior al momento de conexión,
        // lo consideramos "historial" y lo ignoramos
        if (msgTime && msgTime < tiktokConnectTime - 5000) {
            // console.log("⏩ Ignorando chat antiguo:", nickname, data.comment, msgTime);
            return;
        }

        handleEvent('comment', {
            username,
            nickname,
            comment: data.comment
        });
    });



    // GIFTS (con repeatEnd y filtro de historial)
    tiktokConnection.on('gift', (data) => {
        // Datos base
        const username = data.user?.uniqueId || data.user?.userId || "unknown";
        const nickname = data.user?.nickname || username;

        // Tipo de gift (streakeable o no)
        const giftType = data.giftDetails?.giftType ?? data.extendedGiftInfo?.type ?? 0;

        // Si es streakeable (tipo 1), solo procesar cuando termine el streak
        if (giftType === 1 && !data.repeatEnd) {
            return;
        }

        // Timestamp del mensaje para evitar gifts viejos al conectar
        const msgTime = parseInt(data.common?.createTime || "0", 10);
        if (msgTime && msgTime < tiktokConnectTime - 5000) {
            // console.log("⏩ Ignorando gift antiguo:", nickname, msgTime);
            return;
        }

        // Nombre del regalo y datos numéricos
        const giftname =
            data.giftDetails?.giftName ||
            data.extendedGiftInfo?.name ||
            "Gift";

        const repeatcount = data.repeatCount || 1;
        const diamondCount =
            data.diamondCount ||
            data.giftDetails?.diamondCount ||
            data.extendedGiftInfo?.diamond_count ||
            0;

        handleEvent('gift', {
            username,
            nickname,
            giftname,
            repeatcount,
            diamondCount
        });
    });


    // LIKES
    tiktokConnection.on('like', (data) => {
        const username = data.user?.uniqueId || data.user?.userId || "unknown";
        const nickname = data.user?.nickname || username;

        handleEvent('like', {
            username,
            nickname,
            likecount: data.likeCount || 1
        });
    });

    // FOLLOWS
    tiktokConnection.on('follow', (data) => {
        handleEvent('follow', {
            username: data.uniqueId,
            nickname: data.nickname
        });
    });


    // ERRORES / DESCONEXIÓN → reconectar
    tiktokConnection.on('error', (err) => {
        console.error("⚠️ Error TikTok:", err?.message || err);
        isConnected.tiktok = false;
        scheduleTikTokReconnect(username);
    });

    tiktokConnection.on('disconnected', () => {
        console.log("🔌 Desconectado de TikTok LIVE");
        isConnected.tiktok = false;
        scheduleTikTokReconnect(username);
    });
}

function scheduleTikTokReconnect(username) {
    if (!tiktokAutoReconnect) return;
    if (tiktokReconnectTimer) return; // ya hay un reintento programado

    console.log(`🔁 Reintentando conectar TikTok en ${TIKTOK_RECONNECT_DELAY / 1000}s...`);
    tiktokReconnectTimer = setTimeout(() => {
        tiktokReconnectTimer = null;
        startTikTokListener(username);
    }, TIKTOK_RECONNECT_DELAY);
}

function stopTikTokListener() {
    tiktokAutoReconnect = false;
    if (tiktokReconnectTimer) {
        clearTimeout(tiktokReconnectTimer);
        tiktokReconnectTimer = null;
    }
    if (tiktokConnection) {
        tiktokConnection.disconnect();
        tiktokConnection = null;
        isConnected.tiktok = false;
        console.log("🛑 Listener de TikTok detenido");
    }
}

// ========================
// MOTOR DE ACCIONES (CON MÚLTIPLES COMANDOS)
// ========================
function parseCommand(template, data) {
    const config = loadConfig();
    const stats = loadStats();
    const username = data.username || "";
    const userStats = stats.users[username] || { likes: 0, comments: 0, gifts: 0, follows: 0 };

    return template
        .replace(/{{username}}/g, username.replace(/@/g, "＠"))  // ＠ es el @ de ancho 
        .replace(/{{giftname}}/g, data.giftname || "")
        .replace(/{{repeatcount}}/g, data.repeatcount || "1")
        .replace(/{{likecount}}/g, data.likecount || "1")
        .replace(/{{comment}}/g, data.comment || "")
        .replace(/{{nickname}}/g, (data.nickname || "").replace(/@/g, "＠"))
        .replace(/{{playername}}/g, config.minecraft?.playername || "@a")
        .replace(/{{diamondcount}}/g, data.diamondCount || "0")
        // CONTADORES ACUMULADOS
        .replace(/{{totallikes}}/g, stats.totalLikes.toString())
        .replace(/{{totalcomments}}/g, stats.totalComments.toString())
        .replace(/{{totalfollows}}/g, stats.totalFollows.toString())
        .replace(/{{totalgifts}}/g, stats.totalGifts.toString())
        .replace(/{{totaldiamonds}}/g, stats.diamondsTotal.toString())
        .replace(/{{userlikes}}/g, userStats.likes.toString())
        .replace(/{{usercomments}}/g, userStats.comments.toString())
        .replace(/{{usergifts}}/g, userStats.gifts.toString())
        .replace(/{{userfollows}}/g, userStats.follows.toString());
}


// Separa comandos por nueva línea o punto y coma
function splitCommands(input) {
    const s = String(input ?? "").trim();
    if (!s) return [];

    const out = [];
    let buf = "";

    let depth = 0;        // cuenta {} y [] para no cortar dentro de JSON/NBT
    let inS = false;      // 'string'
    let inD = false;      // "string"
    let esc = false;      // escape dentro de strings
    let inComment = false; // dentro de // comentario

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];

        if (esc) { buf += ch; esc = false; continue; }

        // escapes dentro de strings
        if ((inS || inD) && ch === "\\") { buf += ch; esc = true; continue; }

        // toggle comillas
        if (!inD && ch === "'") { inS = !inS; buf += ch; continue; }
        if (!inS && ch === '"') { inD = !inD; buf += ch; continue; }

        // DETECTAR COMENTARIOS // (solo fuera de strings)
        if (!inS && !inD && !inComment && ch === '/' && i + 1 < s.length && s[i + 1] === '/') {
            // Empieza comentario: descartar hasta fin de línea
            inComment = true;
            i++; // saltar el segundo /
            continue;
        }

        // Fin de comentario al encontrar nueva línea
        if (inComment && (ch === '\n' || ch === '\r')) {
            inComment = false;
            const t = buf.trim();
            if (t) out.push(t);
            buf = "";
            if (ch === '\r' && i + 1 < s.length && s[i + 1] === '\n') i++;
            continue;
        }

        if (inComment) continue; // ignorar todo dentro de comentario

        // si NO estoy dentro de string/comentario, manejo profundidad y separadores
        if (!inS && !inD) {
            if (ch === "{" || ch === "[") depth++;
            else if (ch === "}" || ch === "]") depth = Math.max(0, depth - 1);

            // separadores solo cuando depth==0
            if (depth === 0 && (ch === ";" || ch === "\n" || ch === "\r")) {
                const t = buf.trim();
                if (t) out.push(t);
                buf = "";
                if (ch === '\r' && i + 1 < s.length && s[i + 1] === '\n') i++;
                continue;
            }
        }

        buf += ch;
    }

    const last = buf.trim();
    if (last) out.push(last);

    // Normaliza: quita slash inicial (RCON suele esperar comandos sin '/')
    return out
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => c.replace(/^\s*\/+\s*/, ""));
}


async function handleEvent(type, data) {
    if (!isConnected.rcon) {
        console.log("⚠️  No hay conexión RCON. Ignorando evento.");
        return;
    }

    const actions = loadActions();
    let executed = 0;

    // INCREMENTAR CONTADORES PRIMERO
    const stats = incrementStats(type, data);

    // Usuario actual
    const username = data.username || "unknown";
    const nickname = data.nickname || username;
    const userStats = stats.users[username] || { likes: 0, comments: 0, gifts: 0, follows: 0 };

    // Solo tiene sentido para like
    const likesAdded = parseInt(data.likecount) || 1;
    const userLikesBefore = userStats.likes - likesAdded;

    // Log con totales
    if (type === 'like') {
        console.log(`❤️  ${nickname} dio ${data.likecount} likes (Total usuario: ${userStats.likes})`);
    } else if (type === 'comment') {
        console.log(`💬 ${nickname}: ${data.comment} (Comentario #${userStats.comments})`);
    } else if (type === 'gift') {
        console.log(`🎁 ${nickname} envió ${data.giftname} x${data.repeatcount} (Total regalos: ${userStats.gifts})`);
    } else if (type === 'follow') {
        console.log(`➕ ${nickname} siguió (Follow #${stats.totalFollows})`);
    }


    for (const action of actions) {
        if (action.type !== type) continue;

        if (type === 'comment' && action.trigger) {
            if (!data.comment.toLowerCase().includes(action.trigger.toLowerCase())) continue;
        }

        if (type === 'gift' && action.trigger) {
            if (data.giftname.toLowerCase() !== action.trigger.toLowerCase()) continue;
        }

        // 🔥 Lógica para likes cada X - AHORA POR USUARIO INDIVIDUAL
        if (type === 'like' && action.trigger) {
            const triggerVal = parseInt(action.trigger);
            if (isNaN(triggerVal) || triggerVal <= 0) continue;

            // Usar contador INDIVIDUAL del usuario, no el global
            const currentLikes = userStats.likes;
            const previousLikes = userLikesBefore;

            // Verificar si cruzamos un múltiplo del trigger para ESTE usuario
            const prevMilestone = Math.floor(previousLikes / triggerVal);
            const currMilestone = Math.floor(currentLikes / triggerVal);

            if (currMilestone <= prevMilestone) continue;

            console.log(`🎯 ${username} cruzó el milestone ${currMilestone * triggerVal} likes!`);
        }

        const parsedCommand = parseCommand(action.command, data);
        const commands = splitCommands(parsedCommand);

        for (const cmd of commands) {
            try {
                console.log(`🚀 Ejecutando: ${cmd}`);
                await rcon.send(cmd);
                executed++;

                if (commands.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (err) {
                console.error("❌ Error ejecutando comando:", err.message);
            }
        }
    }

    if (executed > 0) {
        console.log(`✅ ${executed} comando(s) ejecutado(s)`);
    }
}


// ========================
// API ENDPOINTS
// ========================

// Obtener estado
app.get("/api/status", (req, res) => {
    res.json({
        rcon: isConnected.rcon,
        tiktok: isConnected.tiktok,
        config: loadConfig()
    });
});

// Configuración
app.post("/api/config", (req, res) => {
    const config = req.body;
    saveConfig(config);
    res.json({ success: true, message: "Configuración guardada" });
});

app.get("/api/config", (req, res) => {
    res.json(loadConfig());
});

// Acciones
app.get("/api/actions", (req, res) => {
    res.json(loadActions());
});

app.post("/api/actions", (req, res) => {
    const actions = loadActions();
    actions.push(req.body);
    saveActions(actions);
    res.json({ success: true, message: "Acción agregada" });
});

app.delete("/api/actions/:index", (req, res) => {
    const actions = loadActions();
    const index = parseInt(req.params.index);

    if (index >= 0 && index < actions.length) {
        actions.splice(index, 1);
        saveActions(actions);
        res.json({ success: true, message: "Acción eliminada" });
    } else {
        res.status(400).json({ success: false, error: "Índice inválido" });
    }
});

// Control RCON
app.post("/api/rcon/connect", async (req, res) => {
    const success = await connectRcon();
    res.json({ success, connected: isConnected.rcon });
});

app.post("/api/rcon/disconnect", (req, res) => {
    disconnectRcon();
    res.json({ success: true, connected: false });
});

// Test RCON
app.post("/api/rcon/test", async (req, res) => {
    if (!isConnected.rcon) {
        return res.json({ success: false, error: "RCON no conectado" });
    }

    try {
        const response = await rcon.send("list");
        res.json({ success: true, response });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Control TikTok
app.post("/api/tiktok/start", (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, error: "Username requerido" });
    }

    const config = loadConfig();
    config.tiktok.username = username;
    saveConfig(config);

    tiktokAutoReconnect = true;              // volver a activar
    startTikTokListener(username);
    res.json({ success: true, message: `Conectando a ${username}...` });
});

app.post("/api/tiktok/stop", (req, res) => {
    stopTikTokListener();
    res.json({ success: true, message: "Detenido" });
});

// Ejecutar comando manual
app.post("/api/rcon/command", async (req, res) => {
    const { command } = req.body;

    if (!isConnected.rcon) {
        return res.status(400).json({ success: false, error: "RCON no conectado" });
    }

    try {
        // Datos fake para probar templates
        const fakeData = {
            username: "test_user",
            nickname: "Tester",
            giftname: "Rose",
            repeatcount: 1,
            likecount: 15,
            comment: "Comentario de prueba",
            diamondCount: 1
        };

        // Aplicar templates igual que en eventos reales
        const parsed = parseCommand(command, fakeData);

        // Ahora sí, dividir en comandos reales
        const commands = splitCommands(parsed);
        let lastResponse = null;

        for (const cmd of commands) {
            console.log(`🧪 TEST Ejecutando: ${cmd}`);
            lastResponse = await rcon.send(cmd);
            if (commands.length > 1) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        res.json({ success: true, response: lastResponse, executed: commands.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});



app.get("/api/stats", (req, res) => {
    res.json(loadStats());
});

app.post("/api/stats/reset", (req, res) => {
    const defaultStats = {
        totalLikes: 0,
        totalComments: 0,
        totalFollows: 0,
        totalGifts: 0,
        diamondsTotal: 0,
        users: {},
        giftTypes: {}
    };
    saveStats(defaultStats);
    res.json({ success: true, message: "Estadísticas reseteadas" });
});

// ========================
// INICIAR SERVIDOR
// ========================
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

    // Intentar reconectar si hay config guardada
    const config = loadConfig();
    if (config.rcon.host && config.rcon.password) {
        console.log("🔄 Intentando reconectar RCON...");
        connectRcon();
    }
});
