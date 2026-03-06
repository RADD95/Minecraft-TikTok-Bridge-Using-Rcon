let stage = null;
let layer = null;

async function initOverlay() {
  const parts = location.pathname.split('/');
  const overlayId = parts[parts.length - 1] || 'default';

  try {
    const res = await fetch(`/api/overlays/${overlayId}`);
    if (!res.ok) throw new Error('Overlay no encontrado');
    const overlay = await res.json();
    window.__overlayConfig = overlay;
    renderOverlayWithKonva(overlay);
  } catch (e) {
    console.error('Error cargando overlay:', e);
    document.getElementById('overlayRoot').innerHTML =
      '<div style="color:red;padding:2rem;">Error cargando overlay</div>';
  }
}

function renderOverlayWithKonva(overlay) {
  const container = document.getElementById('overlayStageContainer');
  if (!container) return;

  const logicalW = overlay.canvas?.width  || 1080;
  const logicalH = overlay.canvas?.height || 1920;

  // Limpiar stage anterior si existe
  if (stage) {
    stage.destroy();
    stage = null;
    layer = null;
  }
  container.innerHTML = '';

  // Crear Stage lógico
  stage = new Konva.Stage({
    container: 'overlayStageContainer',
    width: logicalW,
    height: logicalH,
    pixelRatio: window.devicePixelRatio || 1,
  });

  layer = new Konva.Layer();
  stage.add(layer);

  // Escalar todo para encajar en la ventana de OBS
  const scale = Math.min(
    window.innerWidth  / logicalW,
    window.innerHeight / logicalH
  );
  container.style.transform = `scale(${scale})`;
  container.style.left = `${(window.innerWidth  - logicalW * scale) / 2}px`;
  container.style.top  = `${(window.innerHeight - logicalH * scale) / 2}px`;

  loadElementsToStageRuntime(overlay);
  layer.draw();
}

// Versión recortada de tu loadElementsToStage del editor
function loadElementsToStageRuntime(overlay) {
  if (!layer) return;
  layer.destroyChildren();

  const logicalW = overlay.canvas?.width  || 1080;
  const logicalH = overlay.canvas?.height || 1920;

  // Marco opcional (si quieres)
  // const frame = new Konva.Rect({ x:0, y:0, width:logicalW, height:logicalH, listening:false });
  // layer.add(frame);

  const elements = Array.isArray(overlay.elements) ? overlay.elements : [];

  elements
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) // mismo orden que editor
    .forEach(el => {
      if (!el || el.hidden) return;

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
        layer.add(text);
        applyBaseAnimationRuntime(text); // misma animación base
      } else if (el.src) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let w = el.width || img.width;
          let h = el.height || img.height;
          const konvaImg = new Konva.Image({
            x: el.x,
            y: el.y,
            image: img,
            width: w,
            height: h,
            opacity: (el.opacity ?? 100) / 100,
            rotation: el.rotation || 0,
          });
          konvaImg.meta = el;

          // Borde si existe
          if (el.borderWidth && el.borderWidth > 0) {
            konvaImg.stroke(el.borderColor || '#06b6d4');
            konvaImg.strokeWidth(el.borderWidth);
          }

          layer.add(konvaImg);
          applyBaseAnimationRuntime(konvaImg);
          layer.batchDraw();
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
        layer.add(rect);
        applyBaseAnimationRuntime(rect);
      }
    });
}

// Copia casi literal de tu applyBaseAnimation del editor [file:37]
function applyBaseAnimationRuntime(shape) {
  const m = shape.meta;
  if (!m || !layer) return;

  // Parar animación anterior si existe
  if (shape.baseAnimation) {
    shape.baseAnimation.stop();
    shape.baseAnimation = null;
  }

  const type = m.animationBase || m.animation;
  const duration = (m.animationDurationSec ?? 3);

  // Si no hay animación, restaurar estado base si lo tenemos
  if (!type) {
    const state = shape.baseAnimState;
    if (state) {
      shape.position({ x: state.x, y: state.y });
      shape.scaleX(state.scaleX);
      shape.scaleY(state.scaleY);
      shape.opacity(state.opacity);
      layer.batchDraw();
    }
    return;
  }

  // Guardar estado base solo la primera vez
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
    const p = t / period; // 0..1

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
      default:
        break;
    }
  }, layer);

  shape.baseAnimation = anim;
  anim.start();
}

window.addEventListener('load', initOverlay);
window.addEventListener('resize', () => {
  if (window.__overlayConfig) {
    renderOverlayWithKonva(window.__overlayConfig);
  }
});
