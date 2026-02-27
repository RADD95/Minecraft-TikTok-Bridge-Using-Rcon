const storage = require('../infra/storage');

class StatsService {
    increment(type, data) {
        const stats = storage.loadStats();
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

        storage.saveStats(stats);
        return stats;
    }

    get() {
        return storage.loadStats();
    }

    reset() {
        const defaultStats = {
            totalLikes: 0,
            totalComments: 0,
            totalFollows: 0,
            totalGifts: 0,
            diamondsTotal: 0,
            users: {},
            giftTypes: {}
        };
        storage.saveStats(defaultStats);
        return defaultStats;
    }
}

module.exports = new StatsService();
