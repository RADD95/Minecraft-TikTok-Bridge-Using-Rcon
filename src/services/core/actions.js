const storage = require('../infra/storage');
const statsService = require('./stats');
const rconService = require('../infra/rcon');

class ActionsService {
    parseCommand(template, data) {
        const config = storage.loadConfig();
        const stats = statsService.get();
        const username = data.username || "";
        const userStats = stats.users[username] || { likes: 0, comments: 0, gifts: 0, follows: 0 };

        // Función para escapar comillas dobles (importante para JSON)
        const escapeQuotes = (str) => String(str || "").replace(/"/g, '\\"');

        return template
            .replace(/{{username}}/g, escapeQuotes(username).replace(/@/g, "＠"))
            .replace(/{{giftname}}/g, escapeQuotes(data.giftname))
            .replace(/{{repeatcount}}/g, data.repeatcount || "1")
            .replace(/{{likecount}}/g, data.likecount || "1")
            .replace(/{{comment}}/g, escapeQuotes(data.comment))
            .replace(/{{nickname}}/g, escapeQuotes(data.nickname).replace(/@/g, "＠"))
            .replace(/{{playername}}/g, config.minecraft?.playername || "@a")
            .replace(/{{diamondcount}}/g, data.diamondCount || "0")
            // ... resto de variables
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

    splitCommands(input) {
        const s = String(input ?? "").trim();
        if (!s) return [];

        const out = [];
        let buf = "";
        let depth = 0;
        let inS = false;
        let inD = false;
        let esc = false;
        let inComment = false;

        for (let i = 0; i < s.length; i++) {
            const ch = s[i];

            if (esc) { buf += ch; esc = false; continue; }
            if ((inS || inD) && ch === "\\") { buf += ch; esc = true; continue; }
            if (!inD && ch === "'") { inS = !inS; buf += ch; continue; }
            if (!inS && ch === '"') { inD = !inD; buf += ch; continue; }

            if (!inS && !inD && !inComment && ch === '/' && i + 1 < s.length && s[i + 1] === '/') {
                inComment = true;
                i++;
                continue;
            }

            if (inComment && (ch === '\n' || ch === '\r')) {
                inComment = false;
                const t = buf.trim();
                if (t) out.push(t);
                buf = "";
                if (ch === '\r' && i + 1 < s.length && s[i + 1] === '\n') i++;
                continue;
            }

            if (inComment) continue;

            if (!inS && !inD) {
                if (ch === "{" || ch === "[") depth++;
                else if (ch === "}" || ch === "]") depth = Math.max(0, depth - 1);

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

        return out
            .map(c => c.trim())
            .filter(Boolean)
            .map(c => c.replace(/^\s*\/+\s*/, ""));
    }

    async handleEvent(type, data) {
        if (!rconService.isConnected()) {
            console.log("⚠️  No hay conexión RCON. Ignorando evento.");
            return;
        }

        const actions = storage.loadActions();
        let executed = 0;

        // Incrementar stats primero
        const stats = statsService.increment(type, data);

        const username = data.username || "unknown";
        const userStats = stats.users[username] || { likes: 0, comments: 0, gifts: 0, follows: 0 };
        const likesAdded = parseInt(data.likecount) || 1;
        const userLikesBefore = userStats.likes - likesAdded;

        // Logs
        if (type === 'like') {
            console.log(`❤️  ${data.nickname} dio ${data.likecount} likes (Total: ${userStats.likes})`);
        } else if (type === 'comment') {
            console.log(`💬 ${data.nickname}: ${data.comment} (Comentario #${userStats.comments})`);
        } else if (type === 'gift') {
            console.log(`🎁 ${data.nickname} envió ${data.giftname} x${data.repeatcount} (Total: ${userStats.gifts})`);
        } else if (type === 'follow') {
            console.log(`➕ ${data.nickname} siguió (Follow #${stats.totalFollows})`);
        }

        for (const action of actions) {
            if (action.type !== type) continue;

            if (type === 'comment' && action.trigger) {
                if (!data.comment.toLowerCase().includes(action.trigger.toLowerCase())) continue;
            }

            if (type === 'gift' && action.trigger) {
                if (data.giftname.toLowerCase() !== action.trigger.toLowerCase()) continue;
            }

            if (type === 'like' && action.trigger) {
                const triggerVal = parseInt(action.trigger);
                if (isNaN(triggerVal) || triggerVal <= 0) continue;

                const currentLikes = userStats.likes;
                const prevMilestone = Math.floor(userLikesBefore / triggerVal);
                const currMilestone = Math.floor(currentLikes / triggerVal);

                if (currMilestone <= prevMilestone) continue;
                console.log(`🎯 ${username} cruzó ${currMilestone * triggerVal} likes!`);
            }

            const parsedCommand = this.parseCommand(action.command, data);
            const commands = this.splitCommands(parsedCommand);

            for (const cmd of commands) {
                try {
                    console.log(`🚀 Ejecutando: ${cmd}`);
                    await rconService.send(cmd);
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
}

module.exports = new ActionsService();
