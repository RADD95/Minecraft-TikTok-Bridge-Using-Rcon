async function initOverlay() {
  const parts = location.pathname.split('/');
  const overlayId = parts[parts.length - 1] || 'default';
  
  try {
    const res = await fetch(`/api/overlays/${overlayId}`);
    if (!res.ok) throw new Error('Not found');
    const overlay = await res.json();
    renderOverlay(overlay);
  } catch (e) {
    console.error('Error cargando overlay:', e);
    document.getElementById('overlayRoot').innerHTML = 
      '<div style="color:red;padding:2rem;">Error cargando overlay</div>';
  }
}

function renderOverlay(overlay) {
  const root = document.getElementById('overlayRoot');
  root.innerHTML = '';
  
  // Configurar dimensiones
  const targetW = overlay.canvas?.width || 1080;
  const targetH = overlay.canvas?.height || 1920;
  
  // Crear contenedor con escala
  const scale = Math.min(window.innerWidth / targetW, window.innerHeight / targetH);
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute; width: ${targetW}px; height: ${targetH}px;
    transform: scale(${scale}); transform-origin: top left;
    left: ${(window.innerWidth - targetW * scale) / 2}px;
    top: ${(window.innerHeight - targetH * scale) / 2}px;
    background: ${overlay.canvas?.background || 'transparent'};
    overflow: hidden;
  `;
  root.appendChild(container);

  // Renderizar elementos (filtrar grupos, usar absoluteX/Y si existen)
  if (overlay.elements) {
    overlay.elements.forEach(el => {
      if (el.type === 'group') return; // Los grupos no se renderizan, solo sus hijos
      
      const div = document.createElement('div');
      div.style.cssText = `
        position: absolute;
        left: ${el.absoluteX ?? el.x}px;
        top: ${el.absoluteY ?? el.y}px;
        width: ${el.width * (el.scale || 1)}px;
        height: ${el.height * (el.scale || 1)}px;
        z-index: ${el.zIndex || 1};
        opacity: ${(el.opacity ?? 100) / 100};
        transform: ${el.rotation ? `rotate(${el.rotation}deg)` : 'none'};
        ${el.borderWidth ? `border: ${el.borderWidth}px solid ${el.borderColor};` : ''}
        ${el.boxShadow ? `filter: drop-shadow(${el.boxShadow});` : ''}
        ${el.borderRadius ? `border-radius: ${el.borderRadius}px;` : ''}
      `;
      
      if (el.src) {
        div.innerHTML = `<img src="${el.src}" style="width:100%;height:100%;object-fit:contain;">`;
      } else if (el.type === 'text') {
        div.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:${el.fontFamily || 'inherit'};font-size:${el.fontSize || 24}px;color:${el.color || 'white'};text-shadow:${el.textShadow || 'none'};">${el.text || ''}</div>`;
      } else if (el.type === 'rect') {
        div.style.backgroundColor = el.backgroundColor || 'transparent';
        div.style.border = `${el.borderWidth || 2}px solid ${el.borderColor || '#06b6d4'}`;
      }
      
      if (el.animation) div.classList.add('anim-' + el.animation);
      container.appendChild(div);
    });
  }
  
  window.__overlayConfig = overlay;
}

// Simulación de eventos (ejemplo)
window.simulateGift = function(giftName) {
  // Implementar lógica de trigger aquí
  console.log('Simulating:', giftName);
};