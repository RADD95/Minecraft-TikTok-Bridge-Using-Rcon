module.exports = {
    info(msg) {
        console.log(`[INFO] ${msg}`);
    },
    error(msg, err) {
        console.error(`[ERROR] ${msg}`, err || '');
    },
    event(platform, type, data) {
        console.log(`[${platform.toUpperCase()}] ${type}:`, data);
    }
};
