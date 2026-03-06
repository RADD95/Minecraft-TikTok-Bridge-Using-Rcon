let stage = null;
let currentLayer = null;

let overlayId = null;
let lastOverlayHash = null;
let isUpdating = false;
let overlayPollHandle = null;

// --------- Helpers de hash / comparación ---------
function computeOverlayHash(overlay) {
  if (!overlay) return '';

  // Solo lo que afecta al render
  const payload = {
    canvas: overlay.canvas || {},
    elements: overlay.elements || [],
    groups: overlay.groups || []
  };

  return JSON.stringify(payload);
}

// --------- Init ---------
async function initOverlay() {
  const parts = location.pathname.split('/');
  overlayId = parts[parts.length - 1] || 'default';

  try {
    const res = await fetch(`/api/overlays/${overlayId}`);
    if (!res.ok) throw new Error('Overlay no encontrado');
    const overlay = await res.json();

    window.__overlayConfig = overlay;

    // Hash inicial
    lastOverlayHash = computeOverlayHash(overlay);

    renderOverlayWithKonva(overlay);
    startPolling();
  } catch (e) {
    console.error('Error cargando overlay:', e);
    const root = document.getElementById('overlayRoot');
    if (root) {
      root.innerHTML =
        '<div style="color:red;padding:2rem;">Error cargando overlay</div>';
    }
  }
}

// --------- Polling cada 5s usando /api/overlays/:id ---------
function startPolling() {
  if (overlayPollHandle) return; // evitar duplicar intervalos

  overlayPollHandle = setInterval(async () => {
    if (isUpdating || !overlayId) return;

    try {
      // Cache-buster con ?t=...
      const res = await fetch(`/api/overlays/${overlayId}?t=${Date.now()}`);
      if (!res.ok) {
        // si el overlay ya no existe, no spameamos
        return;
      }

      const newOverlay = await res.json();
      const newHash = computeOverlayHash(newOverlay);

      // Si cambió el contenido relevante, actualizamos
      if (lastOverlayHash && newHash !== lastOverlayHash) {
        console.log('🔄 Overlay cambiado, actualizando con crossfade...');
        await updateOverlayWithCrossfade(newOverlay);
        lastOverlayHash = newHash;
      } else if (!lastOverlayHash) {
        lastOverlayHash = newHash;
      }
    } catch (e) {
      console.error('Error en polling de overlay:', e);
    }
  }, 5000);
}

// --------- Render inicial ---------
function renderOverlayWithKonva(overlay) {
  const container = document.getElementById('overlayStageContainer');
  if (!container) return;

  const logicalW = overlay.canvas?.width  || 1080;
  const logicalH = overlay.canvas?.height || 1920;

  if (stage) {
    stage.destroy();
  }
  container.innerHTML = '';

  stage = new Konva.Stage({
    container: 'overlayStageContainer',
    width: logicalW,
    height: logicalH,
    pixelRatio: window.devicePixelRatio || 1,
  });

  currentLayer = new Konva.Layer();
  stage.add(currentLayer);

  applyScale(container, logicalW, logicalH);
  loadElementsToLayer(overlay, currentLayer);
  currentLayer.draw();
}

// --------- Actualización suave con crossfade ---------
async function updateOverlayWithCrossfade(newOverlay) {
  if (!stage || isUpdating) return;
  isUpdating = true;

  const logicalW = newOverlay.canvas?.width || 1080;
  const logicalH = newOverlay.canvas?.height || 1920;

  // Si cambian dimensiones, actualizamos stage y escala
  if (stage.width() !== logicalW || stage.height() !== logicalH) {
    stage.size({ width: logicalW, height: logicalH });
    const container = document.getElementById('overlayStageContainer');
    if (container) applyScale(container, logicalW, logicalH);
  }

  // 1. Nueva capa, inicialmente invisible
  const newLayer = new Konva.Layer({ opacity: 0 });
  stage.add(newLayer);

  // 2. Cargar elementos en la nueva capa (esperando imágenes)
  await loadElementsToLayerAsync(newOverlay, newLayer);

  // 3. Crossfade entre capas
  const fadeDuration = 0.3; // segundos

  newLayer.to({
    opacity: 1,
    duration: fadeDuration,
    easing: Konva.Easings.EaseInOut,
  });

  currentLayer.to({
    opacity: 0,
    duration: fadeDuration,
    easing: Konva.Easings.EaseInOut,
    onFinish: () => {
      currentLayer.destroy();
      currentLayer = newLayer;
      window.__overlayConfig = newOverlay;
      isUpdating = false;
      console.log('✅ Actualización completa');
    }
  });
}

// --------- Carga de elementos (sync) ---------
function loadElementsToLayer(overlay, targetLayer) {
  const elements = Array.isArray(overlay.elements) ? overlay.elements : [];

  elements
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .forEach(el => {
      if (!el || el.hidden) return;
      createElement(el, targetLayer);
    });
}

// --------- Carga de elementos (async para crossfade) ---------
async function loadElementsToLayerAsync(overlay, targetLayer) {
  const elements = Array.isArray(overlay.elements) ? overlay.elements : [];
  const sorted = elements.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const promises = sorted.map(el => {
    if (!el || el.hidden) return Promise.resolve();
    return createElementAsync(el, targetLayer);
  });

  await Promise.all(promises);
}

// --------- Crear elemento (sync) ---------
function createElement(el, targetLayer) {
  if (el.type === 'text') {
    const text = new Konva.Text({
      x: el.x,
      y: el.y,
      text: el.text || '',
      fontSize: el.fontSize || 24,
      fontFamily: el.fontFamily || 'Inter',
      fill: el.color || 'white',
      opacity: (el.opacity ?? 100) / 100,
      rotation: el.rotation || 0,
    });
    text.meta = el;
    targetLayer.add(text);
    applyBaseAnimationRuntime(text);
  } else if (el.src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const konvaImg = new Konva.Image({
        x: el.x,
        y: el.y,
        image: img,
        width: el.width || img.width,
        height: el.height || img.height,
        opacity: (el.opacity ?? 100) / 100,
        rotation: el.rotation || 0,
      });
      if (el.borderWidth && el.borderWidth > 0) {
        konvaImg.stroke(el.borderColor || '#06b6d4');
        konvaImg.strokeWidth(el.borderWidth);
      }
      konvaImg.meta = el;
      targetLayer.add(konvaImg);
      applyBaseAnimationRuntime(konvaImg);
      targetLayer.batchDraw();
    };
    img.src = el.src;
  } else if (el.type === 'rect') {
    const rect = new Konva.Rect({
      x: el.x,
      y: el.y,
      width: el.width || 200,
      height: el.height || 200,
      fill: el.backgroundColor || 'transparent',
      stroke: el.borderColor || '#06b6d4',
      strokeWidth: el.borderWidth ?? 2,
      opacity: (el.opacity ?? 100) / 100,
      rotation: el.rotation || 0,
    });
    rect.meta = el;
    targetLayer.add(rect);
    applyBaseAnimationRuntime(rect);
  }
}

// --------- Crear elemento (async) ---------
function createElementAsync(el, targetLayer) {
  return new Promise((resolve) => {
    if (!el || el.hidden) {
      resolve();
      return;
    }

    if (el.type === 'text') {
      createElement(el, targetLayer);
      resolve();
    } else if (el.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const konvaImg = new Konva.Image({
          x: el.x,
          y: el.y,
          image: img,
          width: el.width || img.width,
          height: el.height || img.height,
          opacity: (el.opacity ?? 100) / 100,
          rotation: el.rotation || 0,
        });
        if (el.borderWidth && el.borderWidth > 0) {
          konvaImg.stroke(el.borderColor || '#06b6d4');
          konvaImg.strokeWidth(el.borderWidth);
        }
        konvaImg.meta = el;
        targetLayer.add(konvaImg);
        applyBaseAnimationRuntime(konvaImg);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = el.src;
    } else if (el.type === 'rect') {
      createElement(el, targetLayer);
      resolve();
    } else {
      resolve();
    }
  });
}

// --------- Escala al tamaño de la ventana ---------
function applyScale(container, logicalW, logicalH) {
  const scale = Math.min(
    window.innerWidth  / logicalW,
    window.innerHeight / logicalH
  );
  container.style.transform = `scale(${scale})`;
  container.style.left = `${(window.innerWidth  - logicalW * scale) / 2}px`;
  container.style.top  = `${(window.innerHeight - logicalH * scale) / 2}px`;
}

// --------- Animaciones base (igual que tu editor) ---------
function applyBaseAnimationRuntime(shape) {
  const m = shape.meta;
  if (!m || !shape.getLayer()) return;

  if (shape.baseAnimation) {
    shape.baseAnimation.stop();
    shape.baseAnimation = null;
  }

  const type = m.animationBase || m.animation;
  const duration = (m.animationDurationSec ?? 3);
  if (!type) return;

  if (!shape.baseAnimState) {
    shape.baseAnimState = {
      x: shape.x(),
      y: shape.y(),
      scaleX: shape.scaleX(),
      scaleY: shape.scaleY(),
      opacity: shape.opacity(),
    };
  }

  const base = shape.baseAnimState;
  const period = duration * 1000;
  const twoPi = Math.PI * 2;

  const anim = new Konva.Animation(frame => {
    if (!frame) return;
    const t = frame.time % period;
    const p = t / period;

    switch (type) {
      case 'breathe': {
        const amp = 0.05;
        const s = 1 + amp * Math.sin(p * twoPi);
        shape.scaleX(base.scaleX * s);
        shape.scaleY(base.scaleY * s);
        break;
      }
      case 'float': {
        const amp = 15;
        const dy = amp * Math.sin(p * twoPi);
        shape.y(base.y + dy);
        break;
      }
      case 'shake': {
        const amp = 6;
        const dx = amp * Math.sin(p * twoPi * 4);
        shape.x(base.x + dx);
        break;
      }
      case 'flash': {
        const v = 0.5 + 0.5 * Math.sin(p * twoPi * 2);
        shape.opacity(base.opacity * v);
        break;
      }
    }
  }, shape.getLayer());

  shape.baseAnimation = anim;
  anim.start();
}

// --------- Eventos globales ---------
window.addEventListener('load', initOverlay);

window.addEventListener('resize', () => {
  if (window.__overlayConfig) {
    const container = document.getElementById('overlayStageContainer');
    const logicalW = window.__overlayConfig.canvas?.width  || 1080;
    const logicalH = window.__overlayConfig.canvas?.height || 1920;
    if (container) applyScale(container, logicalW, logicalH);
  }
});
