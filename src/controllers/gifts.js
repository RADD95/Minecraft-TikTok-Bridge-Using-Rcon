// controllers/gifts.js
const path = require('path');
const fs = require('fs');

module.exports = {
  get(req, res) {
    try {
      const filePath = path.join(__dirname, '../../regalos_tiktok.json');
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      res.json(data);
    } catch (err) {
      console.error('Error cargando regalos_tiktok.json', err);
      res.status(500).json({ success: false, error: 'No se pudieron cargar los regalos' });
    }
  }
};