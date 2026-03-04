// overlay-editor.js - NUEVO (Konva + JSON simple)
const OverlayEditor = {

  // --------- Stubs temporales para no romper el HTML viejo ---------
  newGroup() { },
  groupSelected() { },
  ungroup() { },
  duplicateSelected() { },
  toggleGrid() { },
  filterOverlays() { },
  filterLibrary() { },      // ya tienes otra versión, pero por si acaso no pasa nada
  filterLayers() { },
  closeProperties() { },
  updateSelected() { },
  updateAnimationSpeed() { },

  // Estado simple
  overlays: [],
  currentOverlay: null,
  giftsData: [],
  rendersData: [],
  baseScale: 1,

  // Historial (undo / redo) y portapapeles
  history: [],
  historyIndex: -1,
  isRestoringHistory: false,
  clipboardElement: null,


  // Vista (zoom/pan de la cartulina)
  viewScale: 1,
  viewOffsetX: 0,
  viewOffsetY: 0,
  isViewportPanning: false,
  viewportPanStart: null,

  // Selección
  selectedElementId: null,

  // Konva
  stage: null,
  layer: null,
  transformer: null,


  // Init general
  async init() {
    await this.loadGifts();
    await this.loadRenders();
    await this.loadOverlays();
    this.setupUIHooks();
  },

  // --------- Carga de datos ---------
  async loadGifts() {
    try {
      const res = await fetch('/api/gifts');
      this.giftsData = await res.json();
      this.renderLibrary('gifts', this.giftsData);
    } catch (e) {
      console.error('Error cargando gifts', e);
    }
  },

  async loadRenders() {
    try {
      const res = await fetch('/data/minecraft_renders.json');
      this.rendersData = await res.json();
      this.renderLibrary('renders', this.rendersData);
    } catch (e) {
      console.error('Error cargando renders', e);
    }
  },

  async loadOverlays() {
    try {
      const res = await fetch('/api/overlays');
      this.overlays = await res.json();
      this.renderOverlayList();
    } catch (e) {
      console.error('Error cargando overlays', e);
    }
  },

  // --------- Librería izquierda (gifts / renders) ---------
  renderLibrary(type, items) {
    const container = document.getElementById(
      type === 'gifts' ? 'giftLibrary' : 'renderLibrary'
    );
    if (!container) return;
    const isGift = type === 'gifts';

    container.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'library-item';
      const imgUrl = isGift ? item.image_url : item.image;
      const name = isGift ? item.name_en : (item.displayName || item.name);

      div.innerHTML = `
        <img src="${imgUrl}" loading="lazy" alt="${name}">
        <span class="item-label">${name}</span>
      `;

      div.onclick = () => {
        if (!this.currentOverlay) return;
        this.addImageElement(imgUrl, name, isGift ? 'gift' : 'render');
      };

      container.appendChild(div);
    });
  },

  // --------- Lista de overlays (tarjetas) ---------
  renderOverlayList() {
    const grid = document.getElementById('overlaysGrid');
    const count = document.getElementById('overlayCount');
    if (!grid) return;
    count.textContent = this.overlays.length;

    if (this.overlays.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">
          <i class="fa-solid fa-layer-group" style="font-size:2rem;margin-bottom:1rem;opacity:0.5;"></i>
          <div>No hay overlays configurados</div>
        </div>`;
      return;
    }

    grid.innerHTML = this.overlays.map(ovl => `
      <div class="overlay-preview-card" onclick="OverlayEditor.editOverlay('${ovl.id}')">
        <div class="overlay-thumb" style="background:#1a1a2e;position:relative;overflow:hidden;">
          <!-- Aquí podrías dibujar un SVG simple o solo dejar el fondo -->
        </div>
        <div class="overlay-info">
          <div class="overlay-title">${ovl.name || 'Sin nombre'}</div>
          <div class="overlay-meta">
            ${(ovl.elements || []).length} elementos
          </div>
        </div>
        <div class="overlay-actions">
          <button class="btn-icon" onclick="event.stopPropagation(); OverlayEditor.copyOverlayUrl('${ovl.id}')">
            <i class="fa-solid fa-link"></i>
          </button>
          <button class="btn-icon" onclick="event.stopPropagation(); OverlayEditor.editOverlay('${ovl.id}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon delete" onclick="event.stopPropagation(); OverlayEditor.deleteOverlay('${ovl.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  },

  copyOverlayUrl(id) {
    const url = `${location.origin}/overlay/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('URL copiada: ' + url);
    });
  },

  async deleteOverlay(id) {
    if (!confirm('¿Eliminar este overlay?')) return;
    await fetch(`/api/overlays/${id}`, { method: 'DELETE' });
    await this.loadOverlays();
  },

  // --------- Crear / editar overlay ---------
  newOverlay() {
    this.currentOverlay = {
      id: 'ovl_' + crypto.randomUUID(),
      name: 'Nuevo overlay',
      canvas: { width: 1080, height: 1920, background: 'transparent' },
      elements: []
    };
    this.showEditorView();
    this.initStage();
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory();
  },

  async editOverlay(id) {
    try {
      const res = await fetch(`/api/overlays/${id}`);
      if (!res.ok) throw new Error('No encontrado');
      const ovl = await res.json();
      this.currentOverlay = ovl;
      this.showEditorView();
      this.initStage();
      this.loadElementsToStage();
      this.history = [];
      this.historyIndex = -1;
      this.pushHistory();

    } catch (e) {
      console.error('Error cargando overlay', e);
      alert('Error cargando overlay');
    }
  },


  showEditorView() {
    const listView = document.getElementById('overlayListView');
    const editorView = document.getElementById('overlayEditorView');
    if (listView) listView.style.display = 'none';
    if (editorView) editorView.style.display = 'block';

    // Nombre
    const nameInput = document.getElementById('editorOverlayName');
    if (nameInput && this.currentOverlay) {
      nameInput.value = this.currentOverlay.name || '';
    }

    // SINCRONIZAR preset y dimensiones con el overlay actual
    const preset = document.getElementById('canvasPreset');
    const dims = document.getElementById('canvasDimensions');

    if (preset && this.currentOverlay?.canvas) {
      const { width, height } = this.currentOverlay.canvas;
      const val = `${width}x${height}`;

      // Si el valor existe como opción, seleccionarlo
      const hasOption = Array.from(preset.options).some(o => o.value === val);
      if (hasOption) {
        preset.value = val;
      }

      if (dims) {
        dims.textContent = `${width} × ${height}`;
      }
    }
  },


  closeEditor() {
    const listView = document.getElementById('overlayListView');
    const editorView = document.getElementById('overlayEditorView');
    if (listView) listView.style.display = 'block';
    if (editorView) editorView.style.display = 'none';
  },


  // --------- Konva Stage / Layer / Transformer ---------
  initStage(preserveZoom = false) {
    const area = document.getElementById('canvasArea');
    const container = document.getElementById('canvasWorld');
    if (!area || !container) return;

    // Aseguramos datos de canvas en el overlay
    if (!this.currentOverlay) {
      this.currentOverlay = {
        id: 'ovl_' + crypto.randomUUID(),
        name: 'Nuevo overlay',
        canvas: { width: 1080, height: 1920, background: 'transparent' },
        elements: []
      };
    } else {
      this.currentOverlay.canvas = this.currentOverlay.canvas || {
        width: 1080,
        height: 1920,
        background: 'transparent'
      };
    }

    const logicalW = this.currentOverlay.canvas.width;
    const logicalH = this.currentOverlay.canvas.height;

    // 1) Ajustar tamaño VISUAL de la cartulina según la resolución
    this.updateCanvasWorldSize();

    // 1.1) Para calcular bien baseScale SIEMPRE medimos sin transform CSS
    const prevScale = this.viewScale;
    const prevOffsetX = this.viewOffsetX;
    const prevOffsetY = this.viewOffsetY;
    const prevTransform = container.style.transform || '';

    // quitamos cualquier scale/translate visual SOLO PARA MEDIR
    container.style.transform = 'translate(0px, 0px) scale(1)';


    // 2) Destruir Stage anterior si existe y limpiar contenedor
    if (this.stage) {
      this.stage.destroy();
      this.stage = null;
      this.layer = null;
      this.transformer = null;
    }
    container.innerHTML = '';

    // 3) Crear Stage nuevo con tamaño lógico
    this.stage = new Konva.Stage({
      container: 'canvasWorld',
      width: logicalW,
      height: logicalH,
      pixelRatio: window.devicePixelRatio || 1 // mejora nitidez
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    });
    this.layer.add(this.transformer);

    // 4) Calcular escala base para que el mundo lógico quepa en canvasWorld
    const cwRect = container.getBoundingClientRect();
    const visibleW = cwRect.width || 540;
    const visibleH = cwRect.height || 960;

    const baseScale = Math.min(
      visibleW / logicalW,
      visibleH / logicalH
    ) || 1;

    this.baseScale = baseScale;
    this.stage.scale({ x: baseScale, y: baseScale });
    this.stage.position({ x: 0, y: 0 });

    // 5) Marco cyan
    const frame = new Konva.Rect({
      x: 0,
      y: 0,
      width: logicalW,
      height: logicalH,
      listening: false
    });
    this.layer.add(frame);
    frame.moveToBottom();

    // 6) Click -> selección + capas
    // 6) Click -> selección y sync con panel de capas
    this.stage.on('click tap', e => {
      const target = e.target;

      // Click en fondo (Stage) -> quitar selección
      if (target === this.stage) {
        this.selectedElementId = null;
        this.transformer.nodes([]);
        this.updatePropertiesPanel(null);
        this.renderLayersTree();
        this.layer && this.layer.batchDraw();
        return;
      }

      // Si lo que clicas NO es un shape "registrado" (sin _meta), ignorar
      if (!target._meta) {
        return;
      }

      // Es un elemento del overlay -> seleccionarlo
      const shape = target;
      this.transformer.nodes([shape]);
      this.updatePropertiesPanel(shape);
      this.selectedElementId = shape._meta?.id || null;
      this.renderLayersTree();
      this.layer && this.layer.batchDraw();
    });


    // 7) Reset de zoom/pan visual (CSS) y slider
    // 7) Reset / restaurar zoom y slider
    if (!preserveZoom) {
      // Caso normal: entrar al editor, cambiar preset, etc. -> zoom 100%
      this.viewScale = 1;
      this.viewOffsetX = 0;
      this.viewOffsetY = 0;
      this.updateCanvasView();

      const zoomSlider = document.getElementById('zoomSlider');
      if (zoomSlider) zoomSlider.value = 100;
      const zoomLabel = document.getElementById('canvasZoom');
      if (zoomLabel) zoomLabel.textContent = '100%';
    } else {
      // Undo/redo: restaurar el transform que tenía el contenedor
      this.viewScale = prevScale;
      this.viewOffsetX = prevOffsetX;
      this.viewOffsetY = prevOffsetY;
      this.updateCanvasView();
      // No tocamos el valor visual del slider ni el label
    }

    this.layer.draw();

    container.style.transform = prevTransform;

  },



  // Ajusta el tamaño VISUAL de la cartulina (canvasWorld) según la resolución
  updateCanvasWorldSize() {
    const container = document.getElementById('canvasWorld');
    if (!container || !this.currentOverlay?.canvas) return;

    const { width, height } = this.currentOverlay.canvas;

    container.style.width = width + 'px';
    container.style.height = height + 'px';
  },

  // Aplica zoom y pan a la cartulina (canvasWorld) vía CSS
  updateCanvasView() {
    const container = document.getElementById('canvasWorld');
    if (!container) return;

    const scale = this.viewScale || 1;
    const tx = this.viewOffsetX || 0;
    const ty = this.viewOffsetY || 0;

    container.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  },

  applyZoom(factor) {
    this.viewScale = factor;
    this.updateCanvasView();

    const zoomLabel = document.getElementById('canvasZoom');
    if (zoomLabel) {
      zoomLabel.textContent = Math.round(factor * 100) + '%';
    }
  },



  setCanvasResolution(value) {
    const [wStr, hStr] = value.split('x');
    const width = parseInt(wStr, 10) || 1080;
    const height = parseInt(hStr, 10) || 1920;

    if (!this.currentOverlay) {
      this.currentOverlay = {
        id: 'ovl_' + crypto.randomUUID(),
        name: 'Nuevo overlay',
        canvas: { width, height, background: 'transparent' },
        elements: []
      };
    } else {
      const canvas = this.currentOverlay.canvas || {};
      const oldW = canvas.width || width;
      const oldH = canvas.height || height;

      const sx = oldW ? width / oldW : 1;
      const sy = oldH ? height / oldH : 1;
      const s = Math.min(sx, sy); // escala uniforme para tamaños

      if (Array.isArray(this.currentOverlay.elements)) {
        this.currentOverlay.elements.forEach(el => {
          if (typeof el.x === 'number') el.x *= sx;
          if (typeof el.y === 'number') el.y *= sy;

          // IMPORTANTE: escala uniforme en tamaño para no deformar
          if (typeof el.width === 'number') el.width *= s;
          if (typeof el.height === 'number') el.height *= s;
        });
      }

      canvas.width = width;
      canvas.height = height;
      this.currentOverlay.canvas = canvas;
    }

    if (this.stage) {
      this.initStage();
      this.loadElementsToStage();
      this.pushHistory();
    }

    const dims = document.getElementById('canvasDimensions');
    if (dims) {
      dims.textContent = `${width} × ${height}`;
    }
  },




  loadElementsToStage() {
    if (!this.layer) return;

    // 1) Borrar TODO lo que haya en la layer
    this.layer.destroyChildren();

    // 2) Crear un Transformer NUEVO y añadirlo
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: [
        'top-left',
        'top-center',
        'top-right',
        'middle-left',
        'middle-right',
        'bottom-left',
        'bottom-center',
        'bottom-right'
      ]
    });

    this.layer.add(this.transformer);

    const logicalW = this.currentOverlay?.canvas?.width || 1080;
    const logicalH = this.currentOverlay?.canvas?.height || 1920;

    (this.currentOverlay.elements || []).forEach(el => {
      // Clamp básico de posiciones
      if (typeof el.x === 'number' && typeof el.width === 'number') {
        const maxX = logicalW - el.width;
        if (el.x < 0) el.x = 0;
        if (el.x > maxX) el.x = maxX;
      }
      if (typeof el.y === 'number' && typeof el.height === 'number') {
        const maxY = logicalH - el.height;
        if (el.y < 0) el.y = 0;
        if (el.y > maxY) el.y = maxY;
      }

      if (el.type === 'text') {
        const text = new Konva.Text({
          x: el.x,
          y: el.y,
          text: el.text || '',
          fontSize: el.fontSize || 24,
          fontFamily: el.fontFamily || 'Inter',
          fill: el.color || 'white',
          opacity: (el.opacity ?? 100) / 100,
          rotation: el.rotation || 0
        });
        text._meta = el;
        this.makeDraggable(text);
        this.layer.add(text);
      } else if (el.src) {
        this.addImageFromElement(el);
      } else if (el.type === 'rect') {
        const rect = new Konva.Rect({
          x: el.x,
          y: el.y,
          width: el.width || 200,
          height: el.height || 200,
          fill: el.backgroundColor || 'transparent',
          stroke: el.borderColor || '#06b6d4',
          strokeWidth: el.borderWidth || 2,
          opacity: (el.opacity ?? 100) / 100,
          rotation: el.rotation || 0
        });
        rect._meta = el;
        this.makeDraggable(rect);
        this.layer.add(rect);
      }
    });

    this.renderLayersTree();
    this.layer.draw();
  },



  // --------- Panel de capas (layersTree) ---------
  renderLayersTree() {
    const tree = document.getElementById('layersTree');
    if (!tree) return;

    const elements = this.currentOverlay?.elements || [];

    if (!elements.length) {
      tree.innerHTML = `
        <p class="hint-text" style="padding: 1rem; text-align: center;">
          No hay capas
        </p>
      `;
      return;
    }

    // Orden: arriba en la lista = zIndex más alto
    const sorted = elements.slice().sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    tree.innerHTML = sorted.map(el => {
      const isSelected = el.id === this.selectedElementId;
      const type = el.type || 'image';
      const icon =
        type === 'text' ? 'fa-font' :
          type === 'rect' ? 'fa-square' :
            'fa-image';

      const name =
        el.name ||
        (type === 'text' ? (el.text || 'Texto') : (type === 'rect' ? 'Rectángulo' : 'Imagen'));

      const visible = el.hidden ? 'fa-eye-slash' : 'fa-eye';

      return `
        <div class="layer-item ${isSelected ? 'selected' : ''}" data-id="${el.id}">
          <span class="layer-visibility" title="Mostrar / ocultar">
            <i class="fa-solid ${visible}"></i>
          </span>
          <span class="layer-name">${name}</span>
        </div>
      `;
    }).join('');

    // Eventos de click en cada capa
    Array.from(tree.querySelectorAll('.layer-item')).forEach(div => {
      const id = div.dataset.id;

      // Click en la fila -> seleccionar elemento
      div.onclick = e => {
        e.stopPropagation();
        this.selectElementById(id);
      };

      // Click en el ojito -> toggle visible
      const vis = div.querySelector('.layer-visibility');
      if (vis) {
        vis.onclick = e => {
          e.stopPropagation();
          this.toggleElementVisibility(id);
        };
      }
    });
  },

  findShapeByElementId(id) {
    if (!this.layer) return null;
    const children = this.layer.getChildren(node => !!node._meta);
    return children.find(node => node._meta?.id === id) || null;
  },

  selectElementById(id) {
    this.selectedElementId = id;

    const shape = this.findShapeByElementId(id);
    if (!shape) {
      // No hay shape (o está oculto)
      this.transformer.nodes([]);
      this.updatePropertiesPanel(null);
      this.renderLayersTree();
      return;
    }

    this.transformer.nodes([shape]);
    this.updatePropertiesPanel(shape);
    this.renderLayersTree();
    this.layer && this.layer.batchDraw();
  },

  toggleElementVisibility(id) {
    if (!this.currentOverlay) return;
    const el = (this.currentOverlay.elements || []).find(e => e.id === id);
    if (!el) return;

    el.hidden = !el.hidden;

    const shape = this.findShapeByElementId(id);
    if (shape) {
      shape.visible(!el.hidden);
    }

    // Si ocultamos el seleccionado, quitar selección
    if (el.hidden && this.selectedElementId === id) {
      this.selectedElementId = null;
      this.transformer.nodes([]);
      this.updatePropertiesPanel(null);
    }

    this.renderLayersTree();
    this.layer && this.layer.batchDraw();
  },

  deleteSelected() {
    if (!this.currentOverlay || !this.selectedElementId) return;

    const id = this.selectedElementId;

    // Quitar del JSON
    this.currentOverlay.elements = (this.currentOverlay.elements || [])
      .filter(el => el.id !== id);

    // Quitar del Stage
    const shape = this.findShapeByElementId(id);
    if (shape) {
      shape.destroy();
    }

    // Limpiar selección
    this.selectedElementId = null;
    if (this.transformer) {
      this.transformer.nodes([]);
    }
    this.updatePropertiesPanel(null);
    this.renderLayersTree();
    this.layer && this.layer.draw();
    this.pushHistory();
  },


  addImageElement(src, name, type) {
    const el = {
      id: 'el_' + crypto.randomUUID(),
      type,
      src,
      name,
      x: 100,
      y: 100,
      width: null,
      height: null,
      scale: 1,
      rotation: 0,
      opacity: 100,
      zIndex: (this.currentOverlay.elements || []).length + 1
    };
    this.currentOverlay.elements.push(el);
    this.addImageFromElement(el);
    this.renderLayersTree();
    this.pushHistory();
  },



  addImageFromElement(el) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // Si el JSON no trae width/height, usamos la resolución original
      let w = el.width;
      let h = el.height;

      if (!w || !h) {
        w = img.width;
        h = img.height;
        el.width = w;
        el.height = h;
      }

      const konvaImg = new Konva.Image({
        x: el.x,
        y: el.y,
        image: img,
        width: w,
        height: h,
        opacity: (el.opacity ?? 100) / 100,
        rotation: el.rotation || 0
      });
      konvaImg._meta = el;
      this.makeDraggable(konvaImg);
      this.layer.add(konvaImg);
      this.layer.draw();
    };
    img.src = el.src;
  },


  makeDraggable(shape) {
    // 1) Hacer draggable
    shape.draggable(true);

    // 2) Al empezar a arrastrar, seleccionarlo
    shape.on('dragstart', () => {
      this.transformer.nodes([shape]);
      this.updatePropertiesPanel(shape);
      this.selectedElementId = shape._meta?.id || null;
      this.renderLayersTree();
      this.layer && this.layer.batchDraw();
    });

    // 3) Limitar arrastre usando el bounding box real (rotado)
    shape.dragBoundFunc(pos => {
      const logicalW = this.currentOverlay?.canvas?.width || 1080;
      const logicalH = this.currentOverlay?.canvas?.height || 1920;

      // Rect actual del shape en coords de la layer (con rotación, escala, etc.)
      const rect = shape.getClientRect({ relativeTo: this.layer });

      // Cómo se movería ese rect si aceptamos pos
      const dx = pos.x - shape.x();
      const dy = pos.y - shape.y();

      let newX = pos.x;
      let newY = pos.y;

      let newRectX = rect.x + dx;
      let newRectY = rect.y + dy;

      // Mantener todo el rectángulo dentro de 0..logicalW / 0..logicalH
      if (newRectX < 0) {
        const corr = -newRectX;
        newX += corr;
        newRectX += corr;
      }
      if (newRectY < 0) {
        const corr = -newRectY;
        newY += corr;
        newRectY += corr;
      }

      const overRight = newRectX + rect.width - logicalW;
      if (overRight > 0) {
        newX -= overRight;
        newRectX -= overRight;
      }

      const overBottom = newRectY + rect.height - logicalH;
      if (overBottom > 0) {
        newY -= overBottom;
        newRectY -= overBottom;
      }

      return { x: newX, y: newY };
    });

    // 4) Al terminar drag o transform (resize/rotate), sincronizar con JSON
    shape.on('dragend transformend', () => {
      const m = shape._meta;
      if (!m) return;

      // Tamaño actual con el scale del transformer
      const w = shape.width() * shape.scaleX();
      const h = shape.height() * shape.scaleY();

      // Aplicar nuevo tamaño al shape y resetear el scale
      shape.width(w);
      shape.height(h);
      shape.scale({ x: 1, y: 1 });

      // Guardar en JSON
      m.x = shape.x();
      m.y = shape.y();
      m.rotation = shape.rotation();
      m.width = w;
      m.height = h;
      m.scale = 1;

      this.updatePropertiesPanel(shape);
      this.layer && this.layer.batchDraw();
      this.pushHistory();
    });
  },







  // --------- Panel de propiedades (muy básico) ---------
  updatePropertiesPanel(shape) {
    // Aquí conectas con tus inputs: x, y, rotación, opacidad, texto, etc.
    // Ejemplo mínimo:
    const inputX = document.getElementById('propX');
    const inputY = document.getElementById('propY');
    const inputScale = document.getElementById('propScale');
    const inputOpacity = document.getElementById('propOpacity');

    if (!inputX) return;

    if (!shape) {
      inputX.value = '';
      inputY.value = '';
      if (inputScale) inputScale.value = 1;
      if (inputOpacity) inputOpacity.value = 100;
      return;
    }

    inputX.value = Math.round(shape.x());
    inputY.value = Math.round(shape.y());
    if (inputScale) inputScale.value = 1;
    if (inputOpacity) inputOpacity.value = (shape._meta?.opacity ?? 100);
  },

  onPropChange(prop, value) {
    const nodes = this.transformer.nodes();
    if (!nodes.length) return;
    const shape = nodes[0];
    const m = shape._meta;
    if (!m) return;

    if (prop === 'x' || prop === 'y') {
      const v = parseFloat(value) || 0;
      if (prop === 'x') { shape.x(v); m.x = v; }
      if (prop === 'y') { shape.y(v); m.y = v; }
    } else if (prop === 'rotation') {
      const v = parseFloat(value) || 0;
      shape.rotation(v);
      m.rotation = v;
    } else if (prop === 'opacity') {
      const v = parseFloat(value) || 100;
      shape.opacity(v / 100);
      m.opacity = v;
    }
    this.layer.draw();
  },

  // --------- Guardar overlay ---------
  async saveCurrent() {
    if (!this.currentOverlay) return;

    // Aseguramos que canvas tenga datos
    this.currentOverlay.canvas = this.currentOverlay.canvas || {
      width: this.stage.width(),
      height: this.stage.height(),
      background: 'transparent'
    };

    const res = await fetch('/api/overlays', {
      method: 'POST', // o PUT según tu API
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.currentOverlay)
    });

    if (!res.ok) {
      alert('Error guardando overlay');
      return;
    }
    alert('Overlay guardado');
    this.loadOverlays();
  },

  snapshotState() {
    if (!this.currentOverlay) return null;
    // Clon profundo solo de canvas + elements
    return JSON.parse(JSON.stringify({
      canvas: this.currentOverlay.canvas,
      elements: this.currentOverlay.elements || []
    }));
  },

  pushHistory() {
    if (!this.currentOverlay || this.isRestoringHistory) return;

    const snap = this.snapshotState();
    if (!snap) return;

    // Cortar “futuro” si hiciste undo y luego cambias algo
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    this.historyIndex = this.history.length - 1;

    // (Opcional) limitar tamaño del historial
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex = this.history.length - 1;
    }
  },

restoreHistoryStep(step) {
  if (!this.history[step]) return;
  this.isRestoringHistory = true;

  const snap = this.history[step];
  this.currentOverlay.canvas = snap.canvas;
  this.currentOverlay.elements = snap.elements;

  // Antes:
  // this.initStage();
  // Después: conservar zoom actual
  this.initStage(true);
  this.loadElementsToStage();

  this.isRestoringHistory = false;
},


  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this.restoreHistoryStep(this.historyIndex);
  },

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.restoreHistoryStep(this.historyIndex);
  },


  setupUIHooks() {
    window.overlayApp = this;

    const btnNew = document.getElementById('btnNewOverlay');
    if (btnNew) btnNew.onclick = () => this.newOverlay();

    const btnSave = document.getElementById('btnSaveOverlay');
    if (btnSave) btnSave.onclick = () => this.saveCurrent();

    // Slider de zoom -> cartulina (canvasWorld)
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
      zoomSlider.oninput = e => {
        const factor = (parseInt(e.target.value, 10) || 100) / 100; // 25–200 => 0.25–2
        this.applyZoom(factor);
      };
    }

    // Pan del viewport: arrastrar fondo del editor
    const area = document.getElementById('canvasArea');
    if (area) {
      area.addEventListener('mousedown', e => {
        // Solo si clicas en el fondo / cartulina, no sobre un input, etc.
        if (e.target.id !== 'canvasArea' && e.target.id !== 'canvasWorld') return;
        e.preventDefault();
        this.isViewportPanning = true;
        this.viewportPanStart = { x: e.clientX, y: e.clientY };
        area.style.cursor = 'grabbing';
      });


      window.addEventListener('mousemove', e => {
        if (!this.isViewportPanning || !this.viewportPanStart) return;
        const dx = e.clientX - this.viewportPanStart.x;
        const dy = e.clientY - this.viewportPanStart.y;
        this.viewportPanStart = { x: e.clientX, y: e.clientY };
        this.viewOffsetX += dx;
        this.viewOffsetY += dy;
        this.updateCanvasView();
      });

      window.addEventListener('mouseup', () => {
        if (!this.isViewportPanning) return;
        this.isViewportPanning = false;
        this.viewportPanStart = null;
        area.style.cursor = 'default';
      });

      // Ctrl + rueda -> controlar zoomSlider en vez del zoom del navegador
      const editorRoot = document.getElementById('overlayEditorView') || document.body;
      if (editorRoot) {
        editorRoot.addEventListener('wheel', e => {
          if (!e.ctrlKey) return; // solo cuando se mantiene Ctrl
          e.preventDefault();

          const zoomSlider = document.getElementById('zoomSlider');
          if (!zoomSlider) return;

          let value = parseInt(zoomSlider.value, 10) || 100;
          const step = 10; // 10% por “click” de rueda

          if (e.deltaY < 0) {
            value += step; // rueda hacia arriba -> más zoom
          } else {
            value -= step; // rueda hacia abajo -> menos zoom
          }

          value = Math.max(25, Math.min(200, value));
          zoomSlider.value = value;
          this.applyZoom(value / 100);
        }, { passive: false });
      }
    }

    const world = document.getElementById('canvasWorld');
    if (world) {
      // Ctrl/Alt + drag desde dentro del canvasWorld para panear
      world.addEventListener('mousedown', e => {
        if (!e.ctrlKey && !e.altKey) return;
        e.preventDefault();
        this.isViewportPanning = true;
        this.viewportPanStart = { x: e.clientX, y: e.clientY };
        area.style.cursor = 'grabbing';
      });
    }


    // Tecla Supr para eliminar selección
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Delete') {
        this.deleteSelected();
      }
    });

    // Teclas globales (Delete, Ctrl+Z/Y/C/X/V)
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Undo / Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          this.undo();
          return;
        }
        if (e.key === 'y') {
          e.preventDefault();
          this.redo();
          return;
        }

        // Copiar / Cortar / Pegar
        if (e.key === 'c') {
          e.preventDefault();
          this.copySelected();
          return;
        }
        if (e.key === 'x') {
          e.preventDefault();
          this.cutSelected();
          return;
        }
        if (e.key === 'v') {
          e.preventDefault();
          this.pasteClipboard();
          return;
        }
      }

      // Suprimir
      if (e.key === 'Delete') {
        this.deleteSelected();
      }
    });




    // Inputs de propiedades (deja tus bindings como estaban)
    const inputX = document.getElementById('propX');
    const inputY = document.getElementById('propY');
    const inputRot = document.getElementById('propRotation');
    const inputOp = document.getElementById('propOpacity');

    if (inputX) inputX.onchange = e => this.onPropChange('x', e.target.value);
    if (inputY) inputY.onchange = e => this.onPropChange('y', e.target.value);
    if (inputRot) inputRot.onchange = e => this.onPropChange('rotation', e.target.value);
    if (inputOp) inputOp.oninput = e => this.onPropChange('opacity', e.target.value);
  },






  copySelected() {
    if (!this.selectedElementId || !this.currentOverlay) return;
    const el = (this.currentOverlay.elements || []).find(e => e.id === this.selectedElementId);
    if (!el) return;
    this.clipboardElement = JSON.parse(JSON.stringify(el));
  },

  cutSelected() {
    this.copySelected();
    this.deleteSelected();
  },

  pasteClipboard() {
    if (!this.clipboardElement || !this.currentOverlay) return;

    const base = this.clipboardElement;
    const cloned = JSON.parse(JSON.stringify(base));

    cloned.id = 'el_' + crypto.randomUUID();
    cloned.x = (base.x || 0) + 20;
    cloned.y = (base.y || 0) + 20;

    this.currentOverlay.elements.push(cloned);

    // Crear shape según tipo (reutilizamos la lógica de loadElementsToStage)
    if (cloned.type === 'text') {
      const text = new Konva.Text({
        x: cloned.x,
        y: cloned.y,
        text: cloned.text || '',
        fontSize: cloned.fontSize || 24,
        fontFamily: cloned.fontFamily || 'Inter',
        fill: cloned.color || 'white',
        opacity: (cloned.opacity ?? 100) / 100,
        rotation: cloned.rotation || 0
      });
      text._meta = cloned;
      this.makeDraggable(text);
      this.layer.add(text);
    } else if (cloned.src) {
      this.addImageFromElement(cloned);
    } else if (cloned.type === 'rect') {
      const rect = new Konva.Rect({
        x: cloned.x,
        y: cloned.y,
        width: cloned.width || 200,
        height: cloned.height || 200,
        fill: cloned.backgroundColor || 'transparent',
        stroke: cloned.borderColor || '#06b6d4',
        strokeWidth: cloned.borderWidth || 2,
        opacity: (cloned.opacity ?? 100) / 100,
        rotation: cloned.rotation || 0
      });
      rect._meta = cloned;
      this.makeDraggable(rect);
      this.layer.add(rect);
    }

    this.renderLayersTree();
    this.layer && this.layer.draw();
    this.pushHistory();
  },


};


window.OverlayEditor = OverlayEditor;   // para botones que llaman OverlayEditor.xyz()
window.overlayApp = OverlayEditor;      // para botones que llaman overlayApp.xyz()

document.addEventListener('DOMContentLoaded', () => OverlayEditor.init());
