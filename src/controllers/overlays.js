const storage = require('../services/infra/storage');

function normalizeId(raw) {
  return String(raw || '').trim();
}

module.exports = {
  // GET /api/overlays
  list(req, res) {
    const overlays = storage.loadOverlays();
    res.json(overlays);
  },

  // GET /api/overlays/:id
  get(req, res) {
    const id = normalizeId(req.params.id);
    const overlays = storage.loadOverlays();
    const overlay = overlays.find(o => normalizeId(o.id) === id);

    if (!overlay) {
      return res.status(404).json({ success: false, error: 'Overlay no encontrado' });
    }

    res.json(overlay);
  },

  // POST /api/overlays  (upsert por id)
  // PUT  /api/overlays/:id (opcional, mismo upsert)
  upsert(req, res) {
    const payload = req.body || {};
    const id = normalizeId(payload.id || req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, error: 'ID del overlay requerido' });
    }

    // Forzar que el ID normalizado se guarde
    payload.id = id;

    const overlays = storage.loadOverlays();
    const idx = overlays.findIndex(o => normalizeId(o.id) === id);

    if (idx >= 0) {
      overlays[idx] = payload;
    } else {
      overlays.push(payload);
    }

    storage.saveOverlays(overlays);
    res.json({ success: true, overlay: payload });
  },

  // DELETE /api/overlays/:id
  delete(req, res) {
    const id = normalizeId(req.params.id);
    const overlays = storage.loadOverlays();
    const idx = overlays.findIndex(o => normalizeId(o.id) === id);

    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'Overlay no encontrado' });
    }

    overlays.splice(idx, 1);
    storage.saveOverlays(overlays);
    res.json({ success: true });
  }
};
