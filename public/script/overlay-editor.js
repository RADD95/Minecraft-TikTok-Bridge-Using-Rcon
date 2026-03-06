// overlay-editor.js - NUEVO (Konva + JSON simple)
const OverlayEditor = {

  // --------- Stubs temporales para no romper el HTML viejo ---------
  toggleGrid() { },
  filterOverlays() { },
  filterLayers() { },
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
  actionsCache: [],


  // Vista (zoom/pan de la cartulina)
  viewScale: 1,
  viewOffsetX: 0,
  viewOffsetY: 0,
  isViewportPanning: false,
  viewportPanStart: null,

  // Selección
  selectedElementId: null,
  selectedGroupId: null,

  // Konva
  stage: null,
  layer: null,
  transformer: null,







  // Init general
  async init() {
    await this.loadGifts();
    await this.loadRenders();
    await this.loadOverlays();
    await this.loadActionsForTriggers();
    this.setupUIHooks();
  },


  // --------- Inicialización ---------
  async loadActionsForTriggers() {
    try {
      const res = await fetch('/api/actions');
      this.actionsCache = await res.json();
    } catch (e) {
      console.error('Error cargando acciones para triggers', e);
      this.actionsCache = [];
    }
  },

  getTriggerOptionsHtml() {
    let html = '<option value="">Ninguno</option>';
    (this.actionsCache || []).forEach(a => {
      const id = a.id || a._id || a.trigger || '';
      const label = a.name || a.trigger || id || 'Acción';
      if (!id) return;
      html += `<option value="${id}">${label}</option>`;
    });
    return html;
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

      div.onclick = async () => {
        if (!this.currentOverlay) return;

        try {
          const res = await fetch('/api/cache-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imgUrl })
          });
          const data = await res.json();
          const finalUrl = data.success ? data.cachedUrl : imgUrl;

          this.addImageElement(finalUrl, name, isGift ? 'gift' : 'render');
        } catch (e) {
          console.error('Error cacheando imagen', e);
          // Fallback: usar URL original
          this.addImageElement(imgUrl, name, isGift ? 'gift' : 'render');
        }
      };


      container.appendChild(div);
    });
  },

  // --------- Lista de overlays (tarjetas) ---------
  renderOverlayList() {
    const grid = document.getElementById('overlaysGrid');
    const count = document.getElementById('overlayCount');
    if (!grid) return;

    if (count) count.textContent = this.overlays.length;

    if (this.overlays.length === 0) {
      grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">
        <i class="fa-solid fa-layer-group" style="font-size:2rem;margin-bottom:1rem;opacity:0.5"></i>
        <div>No hay overlays configurados</div>
      </div>
    `;
      return;
    }

    grid.innerHTML = this.overlays.map(ovl => `
    <div class="overlay-preview-card" onclick="OverlayEditor.editOverlay('${ovl.id}')">
      <div class="overlay-thumb" style="background:#1a1a2e;position:relative;overflow:hidden;">
        ${ovl.preview
        ? `<img src="${ovl.preview}"
                    alt="${ovl.name || 'Overlay'}"
                    style="width:100%;height:100%;object-fit:contain;display:block;" />`
        : ''
      }
      </div>
      <div class="overlay-info">
        <div class="overlay-title">${ovl.name || 'Sin nombre'}</div>
        <div class="overlay-meta">${(ovl.elements || []).length} elementos</div>
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
      elements: [],
      groups: []
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
      this.currentOverlay.groups = this.currentOverlay.groups || [];
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
        elements: [],
        groups: []
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
      enabledAnchors: [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
      ]
    });

    this.layer.add(this.transformer);

    // Permitir mover grupos arrastrando el Transformer
    this.transformer.draggable(true);
    this.transformer._lastPos = { x: 0, y: 0 };

    this.transformer.on('dragstart', () => {
      this.transformer._lastPos = {
        x: this.transformer.x(),
        y: this.transformer.y()
      };
    });

    this.transformer.on('dragmove', () => {
      const tr = this.transformer;
      const prev = tr._lastPos || { x: 0, y: 0 };
      const dx = tr.x() - prev.x;
      const dy = tr.y() - prev.y;

      tr._lastPos = { x: tr.x(), y: tr.y() };

      const nodes = tr.nodes() || [];
      nodes.forEach(node => {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      });

      this.layer && this.layer.batchDraw();
    });

    this.transformer.on('dragend', () => {
      const tr = this.transformer;
      const nodes = tr.nodes() || [];

      // Volver el Transformer a (0,0) para no acumular offset visual
      tr.position({ x: 0, y: 0 });
      tr._lastPos = { x: 0, y: 0 };

      // Persistir posiciones en el meta de cada shape
      nodes.forEach(shape => {
        const m = shape._meta;
        if (!m) return;
        m.x = shape.x();
        m.y = shape.y();
      });

      this.layer && this.layer.batchDraw();
      this.pushHistory && this.pushHistory();
    });


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

    this.stage.on('click tap', e => {
      const target = e.target;
      const evt = e.evt || e;

      const prevNodes = this.transformer.nodes() || [];

      // Click en fondo -> limpiar selección y reanudar animaciones
      if (target === this.stage) {
        // Reanudar animaciones de todo lo que estaba seleccionado
        prevNodes.forEach(node => {
          this.resumeShapeAnimation(node);
        });

        this.selectedElementId = null;
        this.transformer.nodes([]);
        this.updatePropertiesPanel(null);
        this.renderLayersTree();
        this.layer && this.layer.batchDraw();
        return;
      }

      // Si no es un shape registrado, ignorar
      if (!target._meta) return;

      const shape = target;
      let nodes = this.transformer.nodes() || [];

      if (evt.ctrlKey || evt.metaKey) {
        // Multi‑select: toggle en el array de nodos del Transformer
        const idx = nodes.indexOf(shape);
        if (idx >= 0) {
          nodes.splice(idx, 1);
        } else {
          nodes.push(shape);
        }
        this.transformer.nodes(nodes);

        // Si solo queda uno, sincronizamos panel de propiedades
        if (nodes.length === 1) {
          this.selectedElementId = nodes[0]._meta?.id || null;
          this.updatePropertiesPanel(nodes[0]);
        } else {
          this.selectedElementId = null;
          this.updatePropertiesPanel(null);
        }
      } else {
        // Selección simple (sin Ctrl)
        nodes = [shape];
        this.transformer.nodes(nodes);
        this.selectedElementId = shape._meta?.id || null;
        this.updatePropertiesPanel(shape);
      }

      // Pausar animación en todos los nodos seleccionados
      nodes.forEach(node => {
        this.pauseShapeAnimation(node);
      });

      // Reanudar animaciones en todo lo que estaba antes seleccionado y ya NO lo está
      prevNodes.forEach(node => {
        if (!nodes.includes(node)) {
          this.resumeShapeAnimation(node);
        }
      });

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
          rotation: el.rotation || 0,
          // Caja de texto
          width:  typeof el.width  === 'number' ? el.width  : undefined,
          height: typeof el.height === 'number' ? el.height : undefined,
          align: el.align || 'left',
        });

        text.meta = el;
        text._meta = el;

        // Guardar base para futuros transforms
        if (!el.fontSize) el.fontSize = text.fontSize();
        if (!el.width) el.width = text.width();

        // APLICAR BORDE si hay datos guardados en el meta
        this.applyBorderToShape(text, el);

        this.makeDraggable(text);
        this.layer.add(text);
        this.applyBaseAnimation(text);
      }



      else if (el.src) {
        this.addImageFromElement(el);
      }
      else if (el.type === 'rect') {
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
        rect._meta = el;

        this.makeDraggable(rect);
        this.layer.add(rect);

        this.applyBaseAnimation(rect);
      }

    });

    this.renderLayersTree();
    this.layer.draw();
  },


  renderLayerItemHtml(el, { activeNodeIds = new Set(), inGroup = false } = {}) {
    const isSelected =
      activeNodeIds.has(el.id) || el.id === this.selectedElementId;

    const typeIcon =
      el.type === 'image' ? 'fa-image' :
        el.type === 'text' ? 'fa-font' :
          'fa-square';

    const name =
      el.name ||
      (el.type === 'text'
        ? (el.text || 'Texto')
        : el.type === 'rect'
          ? 'Rectángulo'
          : 'Imagen');

    const visibleIcon = el.hidden ? 'fa-eye-slash' : 'fa-eye';

    const classes = ['layer-item'];
    if (isSelected) classes.push('selected');
    if (inGroup) classes.push('in-group');

    return `
      <div class="${classes.join(' ')}" data-id="${el.id}">
        <span class="layer-drag" title="Arrastrar para reordenar"></span>
        <span class="layer-visibility" title="Mostrar/ocultar">
          <i class="fa-solid ${visibleIcon}"></i>
        </span>
        <span class="layer-name">
          <i class="fa-solid ${typeIcon}"></i>
          ${name}
        </span>
      </div>
    `;
  },


  renderLayersTree() {
    const tree = document.getElementById('layersTree');
    if (!tree) return;

    const prevScroll = tree.scrollTop;

    const elements = this.currentOverlay?.elements || [];
    if (!elements.length) {
      tree.innerHTML =
        '<p class="hint-text" style="padding:1rem;text-align:center">No hay capas</p>';
      return;
    }

    const groups = this.currentOverlay?.groups || [];
    const byId = new Map(elements.map(el => [el.id, el]));

    // ids de los nodos actualmente seleccionados en el Transformer
    const activeNodeIds = new Set(
      (this.transformer?.nodes?.() || [])
        .map(n => n._meta?.id)
        .filter(Boolean)
    );

    const parts = [];

    // Grupos + hijos
    groups.forEach(group => {
      parts.push(`
        <div class="layer-group" data-group-id="${group.id}">
          <span class="layer-group-icon">
            <i class="fa-solid fa-folder"></i>
          </span>
          <span class="layer-group-name">${group.name || 'Grupo'}</span>
        </div>
      `);

      const childEls = (group.children || [])
        .map(id => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

      childEls.forEach(el => {
        parts.push(this.renderLayerItemHtml(el, {
          activeNodeIds,
          inGroup: true
        }));
      });
    });

    // Capas sin grupo
    const groupedIds = new Set(
      groups.flatMap(g => g.children || [])
    );

    const ungrouped = elements
      .filter(el => !groupedIds.has(el.id))
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    ungrouped.forEach(el => {
      parts.push(this.renderLayerItemHtml(el, {
        activeNodeIds,
        inGroup: false
      }));
    });

    tree.innerHTML = parts.join('');

    // Sortable
    new Sortable(tree, {
      animation: 150,
      handle: '.layer-drag',
      onEnd: evt => {
        const newOrder = Array.from(tree.children)
          .map(div => div.dataset.id)
          .filter(Boolean);
        this.reorderElements(newOrder);
      }
    });

    // Click en capa (con / sin Ctrl) – tu lógica actual
    Array.from(tree.querySelectorAll('.layer-item')).forEach(div => {
      const id = div.dataset.id;
      div.onclick = e => {
        e.stopPropagation();

        const shape = this.findShapeByElementId(id);
        if (!shape || !this.transformer) return;

        const prevNodes = this.transformer.nodes() || [];
        let nodes = this.transformer.nodes() || [];

        if (e.ctrlKey || e.metaKey) {
          const idx = nodes.indexOf(shape);
          if (idx >= 0) {
            nodes.splice(idx, 1);
          } else {
            nodes.push(shape);
          }
          this.transformer.nodes(nodes);

          if (nodes.length === 1) {
            this.selectedElementId = nodes[0]._meta?.id || null;
            this.updatePropertiesPanel(nodes[0]);
          } else {
            this.selectedElementId = null;
            this.updatePropertiesPanel(null);
          }
        } else {
          nodes = [shape];
          this.transformer.nodes(nodes);
          this.selectedElementId = id;
          this.updatePropertiesPanel(shape);
        }

        // Pausar animación en todos los nodos seleccionados
        nodes.forEach(node => {
          this.pauseShapeAnimation(node);
        });

        // Reanudar animaciones en lo que estaba seleccionado antes y ya no lo está
        prevNodes.forEach(node => {
          if (!nodes.includes(node)) {
            this.resumeShapeAnimation(node);
          }
        });

        this.renderLayersTree();
        this.layer && this.layer.batchDraw();
      };

      div.ondblclick = e => {
        e.stopPropagation();
        this.renameLayer(id);
      };

      const vis = div.querySelector('.layer-visibility');
      if (vis) {
        vis.onclick = e => {
          e.stopPropagation();
          this.toggleElementVisibility(id);
        };
      }
    });

    // Click en grupo -> selección de grupo
    Array.from(tree.querySelectorAll('.layer-group')).forEach(div => {
      const groupId = div.dataset.groupId;

      // Click simple -> selecciona grupo
      div.onclick = e => {
        e.stopPropagation();
        this.selectGroupById(groupId);
      };

      // Doble click -> renombrar grupo
      div.ondblclick = e => {
        e.stopPropagation();
        this.renameGroup(groupId);
      };
    });


    tree.scrollTop = prevScroll;
  },




  findShapeByElementId(id) {
    if (!this.layer) return null;
    const children = this.layer.getChildren(node => !!node._meta);
    return children.find(node => node._meta?.id === id) || null;
  },

  pauseShapeAnimation(shape) {
    if (!shape) return;

    const m = shape._meta || shape.meta;
    if (!m || !m.animationBase) return; // si no tiene animación, nada

    // Aseguramos tener un estado base
    if (!shape.baseAnimState) {
      shape.baseAnimState = {
        x: shape.x(),
        y: shape.y(),
        scaleX: shape.scaleX(),
        scaleY: shape.scaleY(),
        opacity: shape.opacity()
      };
    }

    // Parar animación si existe
    if (shape.baseAnimation) {
      shape.baseAnimation.stop();
    }

    // Dejar el shape exactamente en su estado base (quieto)
    const s = shape.baseAnimState;
    shape.position({ x: s.x, y: s.y });
    shape.scaleX(s.scaleX);
    shape.scaleY(s.scaleY);
    shape.opacity(s.opacity);
  },

  resumeShapeAnimation(shape) {
    if (!shape) return;

    const m = shape._meta || shape.meta;
    if (!m || !m.animationBase) return; // sin animación configurada

    // Si ya tiene animación creada, solo reanudar
    if (shape.baseAnimation) {
      shape.baseAnimation.start();
    } else if (this.applyBaseAnimation) {
      // Crear de nuevo la animación desde su estado base
      this.applyBaseAnimation(shape);
    }
  },


  selectElementById(id) {
    this.selectedGroupId = null;
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

  selectGroupById(groupId) {
    if (!this.currentOverlay?.groups || !this.layer || !this.transformer) return;

    const group = this.currentOverlay.groups.find(g => g.id === groupId);
    if (!group) return;

    const shapes = (group.children || [])
      .map(id => this.findShapeByElementId(id))
      .filter(Boolean);

    this.selectedGroupId = groupId;       // ← NUEVO
    this.selectedElementId = null;

    if (!shapes.length) {
      this.transformer.nodes([]);
      this.updatePropertiesPanel(null);
      this.layer && this.layer.batchDraw();
      return;
    }

    this.transformer.nodes(shapes);
    this.updatePropertiesPanel(null);     // panel de grupo
    this.layer && this.layer.batchDraw();
  },


  toggleElementVisibility(id) {
    if (!this.currentOverlay) return;

    const el = this.currentOverlay.elements.find(e => e.id === id);
    if (!el) return;

    el.hidden = !el.hidden; // toggle

    const shape = this.findShapeByElementId(id);
    if (shape) {
      shape.visible(!el.hidden); // visible=true si !hidden
    }

    // ← Quitar selección si se oculta
    if (el.hidden && id === this.selectedElementId) {
      this.selectedElementId = null;
      this.transformer.nodes([]);
      this.updatePropertiesPanel(null);
    }

    this.renderLayersTree(); // ← REFRESCA iconos
    this.layer.batchDraw();
    this.pushHistory?.();
  },

  deleteSelected() {
    if (!this.currentOverlay) return;

    const nodes = this.transformer?.nodes?.() || [];
    const hasMulti = nodes.length > 1;

    let idsToDelete = [];

    if (hasMulti) {
      // Borrar todo lo que esté en el Transformer (grupo o multi‑select)
      idsToDelete = nodes
        .map(n => n._meta?.id)
        .filter(Boolean);
    } else if (this.selectedElementId) {
      // Caso clásico: una sola capa seleccionada
      idsToDelete = [this.selectedElementId];
    }

    if (!idsToDelete.length) return;

    // 1) Quitar del JSON de elementos
    this.currentOverlay.elements = this.currentOverlay.elements.filter(
      el => !idsToDelete.includes(el.id)
    );

    // 2) Quitar esos ids de todos los grupos y eliminar grupos vacíos
    if (Array.isArray(this.currentOverlay.groups)) {
      this.currentOverlay.groups = this.currentOverlay.groups
        .map(g => {
          g.children = (g.children || []).filter(id => !idsToDelete.includes(id));
          return g;
        })
        .filter(g => (g.children || []).length > 0);
    }

    // 3) Quitar del Stage (Konva)
    idsToDelete.forEach(id => {
      const shape = this.findShapeByElementId(id);
      if (shape) shape.destroy();
    });

    // 4) Limpiar selección y refrescar UI
    this.selectedElementId = null;
    if (this.transformer) {
      this.transformer.nodes([]);
    }
    this.updatePropertiesPanel(null);
    this.renderLayersTree();
    if (this.layer) {
      this.layer.draw();
    }

    // 5) Historial
    this.pushHistory && this.pushHistory();
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

      // Normalizar meta
      konvaImg.meta = el;
      konvaImg._meta = el;

      // APLICAR BORDE si existe en el meta
      this.applyBorderToShape(konvaImg, el);

      this.makeDraggable(konvaImg);
      this.layer.add(konvaImg);
      this.applyBaseAnimation(konvaImg);
      this.layer.draw();
    };
    img.src = el.src;
  },



  makeDraggable(shape) {
    // 1) Hacer draggable
    shape.draggable(true);

    // 2) Al empezar a arrastrar, seleccionarlo
    shape.on('dragstart', () => {
      if (shape._baseAnimation) {
        shape._baseAnimation.stop();
        shape._animWasRunning = true; // recordatorio para reanudar luego
      }

      const nodes = this.transformer?.nodes?.() || [];
      const isMulti = nodes.length > 1 && nodes.includes(shape);

      if (isMulti) {
        shape._lastGroupDragPos = { x: shape.x(), y: shape.y() };
      } else {
        this.transformer.nodes([shape]);
        this.selectedElementId = shape._meta?.id || null;
        this.updatePropertiesPanel(shape);
      }

      this.renderLayersTree();
      this.layer && this.layer.batchDraw();
    });

    // 3) Drag de posición (grupo o shape suelto)
    shape.on('dragmove', () => {
      const nodes = this.transformer?.nodes?.() || [];
      const isMulti = nodes.length > 1 && nodes.includes(shape);

      // Conjunto activo: grupo o shape suelto
      const active = isMulti ? nodes : [shape];

      const logicalW = this.currentOverlay?.canvas?.width || 1080;
      const logicalH = this.currentOverlay?.canvas?.height || 1920;

      // Posición anterior del "líder"
      const last = shape._lastGroupDragPos || { x: shape.x(), y: shape.y() };
      let dx = shape.x() - last.x;
      let dy = shape.y() - last.y;

      shape._lastGroupDragPos = { x: shape.x(), y: shape.y() };

      // Rectángulo unión actual de todos los nodos
      const rects = active.map(n =>
        n.getClientRect({ relativeTo: this.layer })
      );

      const union = rects.reduce((acc, r) => {
        if (!acc) return { x: r.x, y: r.y, width: r.width, height: r.height };
        const minX = Math.min(acc.x, r.x);
        const minY = Math.min(acc.y, r.y);
        const maxX = Math.max(acc.x + acc.width, r.x + r.width);
        const maxY = Math.max(acc.y + acc.height, r.y + r.height);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }, null);

      if (!union) return;

      // Cómo quedaría el grupo si aplicamos dx,dy
      let newX = union.x + dx;
      let newY = union.y + dy;

      // Clamps para que TODO el grupo quede dentro 0..logicalW / 0..logicalH
      if (newX < 0) {
        dx += -newX;
        newX = 0;
      }
      if (newY < 0) {
        dy += -newY;
        newY = 0;
      }

      const overRight = newX + union.width - logicalW;
      if (overRight > 0) {
        dx -= overRight;
      }

      const overBottom = newY + union.height - logicalH;
      if (overBottom > 0) {
        dy -= overBottom;
      }

      // Aplicar el desplazamiento corregido a TODOS los nodos
      active.forEach(node => {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      });

      this.layer && this.layer.batchDraw();
    });

    // 4) Reordenar zIndex al terminar un drag (tu lógica original)
    shape.ondragend = () => {
      const layer = OverlayEditor.layer;
      const shapes = layer.children.filter(n => n.meta);

      shapes.sort((a, b) => a.getY() - b.getY() || a.getX() - b.getX());

      layer.children.forEach(child => layer.remove(child));
      layer.add(OverlayEditor.frame);
      shapes.forEach(shape => layer.add(shape));
      layer.add(OverlayEditor.transformer);

      shapes.forEach((shape, idx) => shape.meta.zIndex = idx);
      OverlayEditor.renderLayersTree();
      OverlayEditor.pushHistory();
      layer.batchDraw();
    };

    // 5) Doble click en texto -> input inline para editar (igual que ya tenías)
    shape.on('dblclick dbltap', () => {
      if (shape._meta?.type !== 'text') return;

      // Rect del texto en coordenadas de la escena (incluye baseScale de Konva)
      const rect = shape.getClientRect();

      const stage = OverlayEditor.stage;
      const container = stage.container();
      // El <canvas> interno de Konva (incluye translate/scale CSS: pan + viewScale)
      const canvas = container.querySelector('canvas');
      const canvasRect = canvas.getBoundingClientRect();

      const viewScale = OverlayEditor.viewScale || 1;

      // Posición final en pantalla (canvas ya trae el pan)
      const left = canvasRect.left + window.scrollX + rect.x * viewScale;
      const top = canvasRect.top + window.scrollY + rect.y * viewScale;
      const width = rect.width * viewScale;
      const height = rect.height * viewScale;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = shape.text();
      input.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${width}px;
        height: ${height}px;
        font-size: ${shape.fontSize()}px;
        font-family: ${shape.fontFamily() || 'Inter'};
        color: ${shape.fill()};
        background: transparent;
        border: 2px solid #06b6d4;
        border-radius: 4px;
        padding: 0;
        margin: 0;
        outline: none;
        text-align: left;
        z-index: 10000;
        box-sizing: border-box;
        cursor: text;
      `;

      document.body.appendChild(input);
      input.focus();
      input.select();

      // Ancho dinámico mientras escribes
      input.oninput = () => {
        const tempSpan = document.createElement('span');
        tempSpan.style.cssText = `
          position: absolute; visibility: hidden;
          font-size: ${shape.fontSize()}px;
          font-family: ${shape.fontFamily() || 'Inter'};
          white-space: pre;
        `;
        tempSpan.textContent = input.value || ' ';
        document.body.appendChild(tempSpan);
        const newWidth = tempSpan.offsetWidth + 10;
        document.body.removeChild(tempSpan);
        input.style.width = `${Math.max(newWidth, width)}px`;
      };

      // Ocultar el texto de Konva mientras editas
      shape.visible(false);

      const commitEdit = () => {
        if (input._removed) return;

        const newText = input.value || '';
        shape.text(newText);
        shape.fontSize(shape.fontSize()); // mantener fontSize actual
        shape._meta.text = newText;
        shape._meta.fontSize = shape.fontSize();
        shape.visible(true);
        OverlayEditor.updatePropertiesPanel(shape);
        OverlayEditor.layer.draw();
        OverlayEditor.pushHistory && OverlayEditor.pushHistory();

        input._removed = true;
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      };

      input.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
        } else if (e.key === 'Escape') {
          input._removed = true;
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
          shape.visible(true);
          OverlayEditor.layer.draw();
        }
      };

      input.onblur = () => {
        if (!input._removed) {
          commitEdit();
        }
      };

      // Evitar que el click cierre la selección de Konva
      input.onclick = e => e.stopPropagation();
    });

    // 6) Transform del texto: SOLO caja (width/height), nunca fontSize
    shape.on('transform', () => {
      if (shape._meta?.type !== 'text') return;

      const stage = shape.getStage();
      const tr = stage
        ? stage.findOne(node => node.getClassName && node.getClassName() === 'Transformer')
        : null;

      const anchor = tr && tr.getActiveAnchor ? tr.getActiveAnchor() : '';

      // Escala aplicada por el transformer
      const sx = shape.scaleX() || 1;
      const sy = shape.scaleY() || 1;

      // Bases seguras (para evitar NaN)
      const baseWidth = Number.isFinite(Number(shape._meta.width))
        ? Number(shape._meta.width)
        : shape.width();

      const baseHeight = Number.isFinite(Number(shape._meta.height))
        ? Number(shape._meta.height)
        : (shape.height() || shape.getClientRect().height);

      // ESQUINAS: escalar width + height de la caja
      if (
        anchor === 'top-left' ||
        anchor === 'top-right' ||
        anchor === 'bottom-left' ||
        anchor === 'bottom-right'
      ) {
        const newWidth = baseWidth * sx;
        const newHeight = baseHeight * sy;

        shape.width(newWidth);
        shape.height(newHeight);

        shape._meta.width = newWidth;
        shape._meta.height = newHeight;

        // reset escala para no acumular
        shape.scale({ x: 1, y: 1 });
      }

      // LADOS HORIZONTALES: cambiar solo ancho (esto ya te funcionaba bien)
      else if (anchor === 'middle-left' || anchor === 'middle-right') {
        const newWidth = baseWidth * sx;
        shape.width(newWidth);
        shape._meta.width = newWidth;
        shape.scaleX(1); // reset escala X
      }

      // LADOS VERTICALES (arriba / abajo): cambiar solo alto de la caja
      else if (anchor === 'top-center' || anchor === 'bottom-center') {
        const newHeight = baseHeight * sy;
        shape.height(newHeight);
        shape._meta.height = newHeight;
        shape.scaleY(1); // reset escala Y
      }

      // Si no hay anchor claro, no tocamos nada y reseteamos escala
      else {
        shape.scale({ x: 1, y: 1 });
      }
    });





    // 7) Persistir cambios al terminar drag/transform
    shape.on('dragend transformend', () => {
      // Normalizar meta: usar meta si hace falta
      let m = shape.meta || shape._meta;
      if (!m) return;
      shape.meta = m;
      shape._meta = m;

      // Posición y rotación SIEMPRE se guardan
      let x = shape.x();
      let y = shape.y();
      let rot = typeof shape.rotation === 'function' ? shape.rotation() : 0;

      // Redondear a 1 decimal para evitar 554.4844137460018 etc.
      x = Math.round(x * 10) / 10;
      y = Math.round(y * 10) / 10;
      rot = Math.round(rot * 10) / 10;

      m.x = x;
      m.y = y;
      m.rotation = rot;

      shape.x(x);
      shape.y(y);
      if (typeof shape.rotation === 'function') {
        shape.rotation(rot);
      }

      if (m.type === 'text') {
        // TEXTO: fontSize y tamaño de la caja, pero redondeado
        if (typeof shape.fontSize === 'function') {
          m.fontSize = shape.fontSize();
        }

        let w = 0;
        let h = 0;

        if (typeof shape.width === 'function') {
          w = shape.width();
        }
        if (typeof shape.height === 'function') {
          h = shape.height();
        }

        // Redondear tamaño a 1 decimal para que Tamaño no tenga mil dígitos
        const rw = Math.round(w * 10) / 10;
        const rh = Math.round(h * 10) / 10;

        if (typeof shape.width === 'function') shape.width(rw);
        if (typeof shape.height === 'function') shape.height(rh);

        m.width = rw;
        m.height = rh;
      } else {
        // IMÁGENES / RECTS: consolidar escala en width/height
        const w = typeof shape.width === 'function'
          ? shape.width() * (shape.scaleX && shape.scaleX() || 1)
          : 0;
        const h = typeof shape.height === 'function'
          ? shape.height() * (shape.scaleY && shape.scaleY() || 1)
          : 0;

        const rw = Math.round(w * 10) / 10;
        const rh = Math.round(h * 10) / 10;

        if (typeof shape.width === 'function') shape.width(rw);
        if (typeof shape.height === 'function') shape.height(rh);
        if (typeof shape.scaleX === 'function') shape.scaleX(1);
        if (typeof shape.scaleY === 'function') shape.scaleY(1);

        m.width = rw;
        m.height = rh;
      }


      // Estado base para animaciones
      shape._baseAnimState = {
        x: x,
        y: y,
        scaleX: shape.scaleX ? shape.scaleX() : 1,
        scaleY: shape.scaleY ? shape.scaleY() : 1,
        opacity: shape.opacity ? shape.opacity() : 1,
      };

      OverlayEditor.updatePropertiesPanel(shape);
      if (OverlayEditor.layer) {
        OverlayEditor.layer.batchDraw();
      }
      OverlayEditor.pushHistory && OverlayEditor.pushHistory();
    });


  },



  // --------- Panel de propiedades grupo o capa ---------
  updatePropertiesPanel(shape) {
    const panel = document.getElementById('propertiesPanel');
    const empty = document.getElementById('props-empty');
    const elSec = document.getElementById('props-element');
    const grpSec = document.getElementById('props-group');
    const textSection = document.getElementById('textEditorSection');

    if (!panel || !empty || !elSec || !grpSec) return;

    const nodes = this.transformer?.nodes?.() || [];
    const isMulti = nodes.length > 1;
    const hasSelection = !!shape || !!this.selectedGroupId || nodes.length > 0;

    // Nada seleccionado → cerramos panel
    if (!hasSelection) {
      this.closeProperties();
      return;
    }

    // Hay algo seleccionado → mostramos panel
    panel.style.display = 'block';

    // Reset secciones
    empty.style.display = 'none';
    elSec.style.display = 'none';
    grpSec.style.display = 'none';
    if (textSection) textSection.style.display = 'none';

    // --- 1) Grupo seleccionado ---
    if (this.selectedGroupId && (!shape || isMulti)) {
      const group = this.currentOverlay?.groups?.find(g => g.id === this.selectedGroupId);
      if (!group) {
        this.closeProperties();
        return;
      }

      grpSec.style.display = 'block';

      const inputName = document.getElementById('propGroupName');
      const inputBg = document.getElementById('propGroupBg');
      const inputHide = document.getElementById('propGroupHideOthers');
      const inputAnim = document.getElementById('propGroupAnimation');
      const inputDur = document.getElementById('propGroupAnimDuration');

      const runtime = group.runtime || {};
      const onExec = runtime.onActionExecute || {};

      // Valores actuales
      if (inputName) inputName.value = group.name || '';
      if (inputBg) inputBg.value = runtime.bgColor || '#000000';
      if (inputHide) inputHide.checked = !!onExec.hideOtherGroups;
      if (inputAnim) inputAnim.value = onExec.animation || '';
      if (inputDur) inputDur.value = onExec.durationMs || 0;

      // Handlers
      if (inputName) {
        inputName.onchange = e => {
          group.name = e.target.value;
          this.renderLayersTree();
          this.pushHistory?.();
        };
      }

      if (inputBg) {
        inputBg.oninput = e => {
          group.runtime = group.runtime || {};
          group.runtime.bgColor = e.target.value;
          this.pushHistory?.();
        };
      }

      if (inputHide) {
        inputHide.onchange = e => {
          group.runtime = group.runtime || {};
          group.runtime.onActionExecute = group.runtime.onActionExecute || {};
          group.runtime.onActionExecute.hideOtherGroups = !!e.target.checked;
          this.pushHistory?.();
        };
      }

      if (inputAnim) {
        inputAnim.onchange = e => {
          group.runtime = group.runtime || {};
          group.runtime.onActionExecute = group.runtime.onActionExecute || {};
          group.runtime.onActionExecute.animation = e.target.value || '';
          this.pushHistory?.();
        };
      }

      if (inputDur) {
        inputDur.onchange = e => {
          const v = parseInt(e.target.value || '0', 10) || 0;
          group.runtime = group.runtime || {};
          group.runtime.onActionExecute = group.runtime.onActionExecute || {};
          group.runtime.onActionExecute.durationMs = v;
          this.pushHistory?.();
        };
      }

      return;
    }

    // --- 2) Capa individual ---
    if (!shape) {
      this.closeProperties();
      return;
    }

    let m = shape.meta || shape._meta;
    if (!m) {
      this.closeProperties();
      return;
    }

    // Normalizar
    shape.meta = m;
    shape._meta = m;

    elSec.style.display = 'block';

    const inputName = document.getElementById('propName');
    const inputX = document.getElementById('propX');
    const inputY = document.getElementById('propY');
    const inputRotation = document.getElementById('propRotation');
    const inputWidth = document.getElementById('propWidth');
    const inputHeight = document.getElementById('propHeight');
    const inputOpacity = document.getElementById('propOpacity');

    const bgRow = document.getElementById('propBgRow');
    const inputBg = document.getElementById('propBgColor');
    const inputBgAlpha = document.getElementById('propBgAlpha');

    const inputBorderColor = document.getElementById('propBorderColor');
    const inputBorderAlpha = document.getElementById('propBorderAlpha');
    const inputBorderWidth = document.getElementById('propBorderWidth');
    const inputFontFamily = document.getElementById('propFontFamily');
    const inputFontSize = document.getElementById('propFontSize');
    const inputTextColor = document.getElementById('propTextColor');
    const inputTextAlpha = document.getElementById('propTextAlpha');
    const inputTextContent = document.getElementById('propTextContent');
    const inputTextAlign = document.getElementById('propTextAlign');
    const inputAnim = document.getElementById('propAnimation');
    const inputAnimDur = document.getElementById('propAnimDuration');
    const inputTrigger = document.getElementById('propTrigger');

    // Handlers
    if (inputName) inputName.onchange = e => this.onPropChange('name', e.target.value);
    if (inputX) inputX.onchange = e => this.onPropChange('x', e.target.value);
    if (inputY) inputY.onchange = e => this.onPropChange('y', e.target.value);
    if (inputRotation) inputRotation.onchange = e => this.onPropChange('rotation', e.target.value);
    if (inputWidth) inputWidth.onchange = e => this.onPropChange('width', e.target.value);
    if (inputHeight) inputHeight.onchange = e => this.onPropChange('height', e.target.value);

    if (inputOpacity) inputOpacity.oninput = e => this.onPropChange('opacity', e.target.value);
    if (inputBg) inputBg.oninput = e => this.onPropChange('bgColor', e.target.value);
    if (inputBgAlpha) inputBgAlpha.oninput = e => this.onPropChange('bgAlpha', e.target.value);
    if (inputBorderColor) inputBorderColor.oninput = e => this.onPropChange('borderColor', e.target.value);
    if (inputBorderAlpha) inputBorderAlpha.oninput = e => this.onPropChange('borderAlpha', e.target.value);
    if (inputBorderWidth) inputBorderWidth.onchange = e => this.onPropChange('borderWidth', e.target.value);
    if (inputFontFamily) inputFontFamily.onchange = e => this.onPropChange('fontFamily', e.target.value);
    if (inputFontSize) inputFontSize.onchange = e => this.onPropChange('fontSize', e.target.value);
    if (inputTextColor) inputTextColor.oninput = e => this.onPropChange('textColor', e.target.value);
    if (inputTextAlpha) inputTextAlpha.oninput = e => this.onPropChange('textAlpha', e.target.value);
    if (inputTextContent) inputTextContent.oninput = e => this.onPropChange('text', e.target.value);
    if (inputTextAlign) inputTextAlign.onchange = e => this.onPropChange('textAlign', e.target.value);

    if (inputAnim) inputAnim.onchange = e => this.onPropChange('animation', e.target.value);
    if (inputAnimDur) inputAnimDur.onchange = e => this.onPropChange('animDuration', e.target.value);

    if (inputTrigger) {
      inputTrigger.innerHTML = this.getTriggerOptionsHtml();
      inputTrigger.onchange = e => this.onPropChange('trigger', e.target.value);
    }

    // Valores iniciales
    if (inputName) inputName.value = m.name || (m.type === 'text' ? (m.text || '') : '');
    if (inputX) inputX.value = typeof m.x === 'number' ? m.x : Math.round(shape.x());
    if (inputY) inputY.value = typeof m.y === 'number' ? m.y : Math.round(shape.y());
    if (inputRotation) inputRotation.value = typeof m.rotation === 'number' ? m.rotation : Math.round(shape.rotation() || 0);
    if (inputOpacity) inputOpacity.value = m.opacity ?? 100;

    // Tamaño inicial: usa meta si existe; si no, lee del shape
    if (inputWidth) {
      const w = typeof m.width === 'number'
        ? m.width
        : (typeof shape.width === 'function' ? Math.round(shape.width()) : 0);
      inputWidth.value = w;
    }

    if (inputHeight) {
      const h = typeof m.height === 'number'
        ? m.height
        : (typeof shape.height === 'function' ? Math.round(shape.height()) : 0);
      inputHeight.value = h;
    }


    // Valores iniciales de Fondo/Borde para cualquier tipo de elemento
    const isRect =
      m.type === 'rect' ||
      (typeof shape.getClassName === 'function' && shape.getClassName() === 'Rect');

    // Mostrar/ocultar la fila de "Fondo" según el tipo
    if (bgRow) {
      bgRow.style.display = isRect ? 'flex' : 'none';
    }

    // Valores iniciales de Fondo/Borde
    const baseColor = m.baseBgColor || m.backgroundColor || '#000000';
    const alpha = (typeof m.bgAlpha === 'number') ? m.bgAlpha : 100;
    const borderBase = m.baseBorderColor || m.borderColor || '#000000';
    const bAlpha = (typeof m.borderAlpha === 'number') ? m.borderAlpha : 100;

    if (inputBg) inputBg.value = baseColor;
    if (inputBgAlpha) inputBgAlpha.value = alpha;
    if (inputBorderColor) inputBorderColor.value = borderBase;
    if (inputBorderAlpha) inputBorderAlpha.value = bAlpha;
    if (inputBorderWidth) inputBorderWidth.value = m.borderWidth ?? 0;


    if (m.type === 'text') {
      if (textSection) textSection.style.display = 'block';

      if (inputFontFamily) inputFontFamily.value = m.fontFamily || 'Inter';
      if (inputFontSize) inputFontSize.value = m.fontSize || 32;

      const textBase = m.baseTextColor || '#ffffff';
      const tAlpha = typeof m.textAlpha === 'number' ? m.textAlpha : 100;

      if (inputTextColor) inputTextColor.value = textBase;
      if (inputTextAlpha) inputTextAlpha.value = tAlpha;
      if (inputTextContent) inputTextContent.value = m.text || '';

      const align = m.align || 'left';
      if (inputTextAlign) inputTextAlign.value = align;
    }


    if (inputAnim) inputAnim.value = m.animationBase || '';
    if (inputAnimDur) inputAnimDur.value = m.animationDurationSec || 3;
    if (inputTrigger) inputTrigger.value = m.trigger || '';
  },

  hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    let h = hex.replace('#', '');
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('');
    }
    const num = parseInt(h, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  },

  makeRgba(hex, alpha01) {
    const { r, g, b } = this.hexToRgb(hex);
    const a = Math.max(0, Math.min(1, alpha01));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  },

  // Aplica borde (color + grosor) a cualquier shape según su meta
  applyBorderToShape(shape, meta) {
    if (!shape || !meta) return;

    const m = meta;

    // Color final del borde:
    // - Si ya hay m.borderColor (rgba) lo usamos tal cual.
    // - Si no, lo calculamos desde baseBorderColor + borderAlpha.
    let rgba = m.borderColor;
    if (!rgba) {
      const base = m.baseBorderColor || '#06b6d4';
      const alpha = (typeof m.borderAlpha === 'number' ? m.borderAlpha : 100);
      rgba = this.makeRgba(base, alpha / 100);
      m.borderColor = rgba;
    }

    const width = m.borderWidth ?? 0;

    if (typeof shape.stroke === 'function') {
      shape.stroke(rgba);
    }
    if (typeof shape.strokeWidth === 'function') {
      shape.strokeWidth(width);
    }
  },


  applyBaseAnimation(shape) {
    const m = shape.meta || shape._meta;
    if (!m || !this.layer) return;

    // Parar animación anterior si existe
    if (shape._baseAnimation) {
      shape._baseAnimation.stop();
      shape._baseAnimation = null;
    }

    const type = m.animationBase;
    const duration = m.animationDurationSec || 3;

    // Si no hay animación → restaurar estado base si lo tenemos
    if (!type) {
      const state = shape._baseAnimState;
      if (state) {
        shape.position({ x: state.x, y: state.y });
        shape.scaleX(state.scaleX);
        shape.scaleY(state.scaleY);
        shape.opacity(state.opacity);
      }
      this.layer.batchDraw();
      return;
    }

    // Guardar estado base solo la primera vez
    if (!shape._baseAnimState) {
      shape._baseAnimState = {
        x: shape.x(),
        y: shape.y(),
        scaleX: shape.scaleX(),
        scaleY: shape.scaleY(),
        opacity: shape.opacity(),
      };
    }
    const base = shape._baseAnimState;

    const period = duration * 1000;
    const twoPi = Math.PI * 2;
    const layer = this.layer;
    const editor = this; // para acceder al transformer dentro del callback

    const anim = new Konva.Animation(frame => {
      if (!frame) return;

      // Si este shape está seleccionado, lo dejamos quieto en su estado base
      const selectedNodes = editor.transformer?.nodes?.() || [];
      const isSelected = selectedNodes.includes(shape);

      if (isSelected) {
        shape.position({ x: base.x, y: base.y });
        shape.scaleX(base.scaleX);
        shape.scaleY(base.scaleY);
        shape.opacity(base.opacity);
        return;
      }

      const t = frame.time % period;
      const p = t / period; // 0..1

      switch (type) {
        case 'breathe': {
          const amp = 0.05; // 5% de “respiración”
          const s = 1 + amp * Math.sin(p * twoPi);
          const sx = base.scaleX * s;
          const sy = base.scaleY * s;

          // Redondeo suave a 3 decimales
          shape.scaleX(Math.round(sx * 1000) / 1000);
          shape.scaleY(Math.round(sy * 1000) / 1000);
          break;
        }

        case 'float': {
          const amp = 15; // px arriba/abajo
          const dy = amp * Math.sin(p * twoPi);
          const ny = base.y + dy;
          shape.y(Math.round(ny * 10) / 10); // 1 decimal
          break;
        }

        case 'shake': {
          const amp = 6; // px a los lados
          const dx = amp * Math.sin(p * twoPi * 4); // más rápido
          const nx = base.x + dx;
          shape.x(Math.round(nx * 10) / 10); // 1 decimal
          break;
        }

        case 'flash': {
          const v = 0.5 + 0.5 * Math.sin(p * twoPi * 2); // 0..1
          const op = base.opacity * v;
          shape.opacity(Math.round(op * 1000) / 1000); // 3 decimales
          break;
        }

        default:
          break;
      }
    }, layer);

    shape._baseAnimation = anim;
    anim.start();
  },

  // --------- Aplicar cambios de inputs a los shapes ---------
  onPropChange(prop, rawValue) {
    const nodes = this.transformer?.nodes?.() || [];
    if (!nodes.length) return;

    const value = rawValue;

    nodes.forEach(shape => {
      let m = shape.meta || shape._meta;
      if (!m) return;

      // Normalizar meta en la shape
      shape.meta = m;
      shape._meta = m;

      // Soportar rect antiguos sin type usando la clase de Konva
      const isRect = m.type === 'rect' || shape.getClassName?.() === 'Rect';
      const isText = m.type === 'text';

      switch (prop) {
        case 'name':
          m.name = value;
          if (m.type === 'text') {
            m.text = value;
            shape.text(value);
          }
          this.renderLayersTree();
          break;

        case 'x': {
          const v = parseInt(value || '0', 10) || 0;
          m.x = v;
          shape.x(v);
          break;
        }

        case 'y': {
          const v = parseInt(value || '0', 10) || 0;
          m.y = v;
          shape.y(v);
          break;
        }

        case 'rotation': {
          const v = parseFloat(value || '0') || 0;
          m.rotation = v;
          if (typeof shape.rotation === 'function') {
            shape.rotation(v);
          }
          break;
        }




        case 'width': {
          const v = Math.max(1, parseInt(value || '1', 10) || 1);
          m.width = v;
          if (typeof shape.width === 'function') {
            shape.width(v);
          }
          break;
        }

        case 'height': {
          const v = Math.max(1, parseInt(value || '1', 10) || 1);
          m.height = v;
          if (typeof shape.height === 'function') {
            shape.height(v);
          }
          break;
        }




        // -------- FONDO (color + alpha) --------

        case 'opacity': {
          const v = Math.max(0, Math.min(100, parseInt(value || '0', 10)));
          m.opacity = v;
          shape.opacity(v / 100);
          break;
        }

        case 'bgColor': {
          // Guardar siempre en meta, sea imagen, texto o rect
          m.baseBgColor = value || '#000000';
          const alpha = typeof m.bgAlpha === 'number' ? m.bgAlpha : 100;
          const rgba = this.makeRgba(m.baseBgColor, alpha / 100);
          m.backgroundColor = rgba;

          // Solo los rectángulos usan fill como “fondo”
          if (m.type === 'rect' || shape.getClassName?.() === 'Rect') {
            shape.fill(rgba);
          }
          break;
        }

        case 'bgAlpha': {
          const v = Math.max(0, Math.min(100, parseInt(value || '100', 10)));
          m.bgAlpha = v;
          const base = m.baseBgColor || '#000000';
          const rgba = this.makeRgba(base, v / 100);
          m.backgroundColor = rgba;

          if (m.type === 'rect' || shape.getClassName?.() === 'Rect') {
            shape.fill(rgba);
          }
          break;
        }

        // -------- BORDE (color + alpha + grosor) --------
        case 'borderColor': {
          m.baseBorderColor = value || '#06b6d4';
          const alpha = typeof m.borderAlpha === 'number' ? m.borderAlpha : 100;
          const rgba = this.makeRgba(m.baseBorderColor, alpha / 100);
          m.borderColor = rgba;

          // Konva.Text y Konva.Image también soportan stroke
          if (shape.stroke) {
            shape.stroke(rgba);
          }
          break;
        }

        case 'borderAlpha': {
          const v = Math.max(0, Math.min(100, parseInt(value || '100', 10)));
          m.borderAlpha = v;
          const base = m.baseBorderColor || '#06b6d4';
          const rgba = this.makeRgba(base, v / 100);
          m.borderColor = rgba;

          if (shape.stroke) {
            shape.stroke(rgba);
          }
          break;
        }

        case 'borderWidth': {
          const v = Math.max(0, parseInt(value || '0', 10));
          m.borderWidth = v;

          if (shape.strokeWidth) {
            shape.strokeWidth(v);
          }
          break;
        }



        // -------- TEXTO --------
        // -------- TEXTO --------
        case 'text': {
          if (isText) {
            m.text = value;
            shape.text(value);
          }
          break;
        }

        case 'fontFamily': {
          if (isText) {
            m.fontFamily = value;
            shape.fontFamily(value);
          }
          break;
        }

        case 'fontSize': {
          if (isText) {
            const v = Math.max(8, parseInt(value || '8', 10) || 8);
            m.fontSize = v;
            shape.fontSize(v);
            // Opcional: actualizar altura aprox de la caja
            m.height = shape.height();
          }
          break;
        }

        case 'textColor': {
          if (isText) {
            m.baseTextColor = value || '#ffffff';
            const tAlpha = typeof m.textAlpha === 'number' ? m.textAlpha : 100;
            const rgba = this.makeRgba(m.baseTextColor, tAlpha / 100);
            m.color = rgba;
            shape.fill(rgba);
          }
          break;
        }

        case 'textAlpha': {
          if (isText) {
            const v = Math.max(0, Math.min(100, parseInt(value || '100', 10) || 100));
            m.textAlpha = v;
            const base = m.baseTextColor || '#ffffff';
            const rgba = this.makeRgba(base, v / 100);
            m.color = rgba;
            shape.fill(rgba);
          }
          break;
        }

        case 'textAlign': {
          if (isText) {
            const align = value || 'left';
            m.align = align;
            if (typeof shape.align === 'function') {
              shape.align(align);
            }
          }
          break;
        }


        // -------- ANIMACIÓN --------
        case 'animation':
          m.animationBase = value || '';
          if (this.applyBaseAnimation) this.applyBaseAnimation(shape);
          break;

        case 'animDuration': {
          const v = parseFloat(value || '3') || 3;
          m.animationDurationSec = v;
          if (this.applyBaseAnimation) this.applyBaseAnimation(shape);
          break;
        }

        case 'trigger':
          m.trigger = value || '';
          break;

        default:
          break;
      }
    });

    if (this.layer) this.layer.draw();
    this.pushHistory?.();
  },

  nudgeSelection(dx, dy) {
    const nodes = this.transformer?.nodes?.() || [];
    if (!nodes.length || !this.currentOverlay) return;

    const logicalW = this.currentOverlay.canvas?.width || 1080;
    const logicalH = this.currentOverlay.canvas?.height || 1920;

    nodes.forEach(shape => {
      let m = shape.meta || shape._meta;
      if (!m) return;
      shape.meta = m;
      shape._meta = m;

      // Coordenadas actuales (preferimos meta si existe)
      const oldX = (typeof m.x === 'number') ? m.x : shape.x();
      const oldY = (typeof m.y === 'number') ? m.y : shape.y();

      let newX = oldX + dx;
      let newY = oldY + dy;

      // Tamaño para clamps básicos dentro del canvas
      const w = typeof m.width === 'number'
        ? m.width
        : (typeof shape.width === 'function' ? shape.width() : 0);
      const h = typeof m.height === 'number'
        ? m.height
        : (typeof shape.height === 'function' ? shape.height() : 0);

      const maxX = w ? (logicalW - w) : logicalW;
      const maxY = h ? (logicalH - h) : logicalH;

      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX > maxX) newX = maxX;
      if (newY > maxY) newY = maxY;

      // Redondear a 1 decimal para mantener números limpios
      newX = Math.round(newX * 10) / 10;
      newY = Math.round(newY * 10) / 10;

      // Guardar en meta y shape
      m.x = newX;
      m.y = newY;
      shape.x(newX);
      shape.y(newY);

      // Si tiene estado base de animación, actualizarlo también
      if (!shape._baseAnimState) {
        shape._baseAnimState = {
          x: newX,
          y: newY,
          scaleX: shape.scaleX ? shape.scaleX() : 1,
          scaleY: shape.scaleY ? shape.scaleY() : 1,
          opacity: shape.opacity ? shape.opacity() : 1,
        };
      } else {
        shape._baseAnimState.x = newX;
        shape._baseAnimState.y = newY;
      }
    });

    // Si solo hay uno, refrescamos el panel con sus coords nuevas
    if (nodes.length === 1) {
      this.updatePropertiesPanel(nodes[0]);
    } else if (this.layer) {
      this.layer.batchDraw();
    }

    this.pushHistory?.();
  },

  // --------- Guardar overlay ---------
  async saveCurrent() {
    if (!this.currentOverlay || !this.stage) return;

    // Asegura que tenga id
    if (!this.currentOverlay.id) {
      this.currentOverlay.id = crypto.randomUUID();
    }

    // Canvas info
    this.currentOverlay.canvas = {
      width: this.stage.width(),
      height: this.stage.height(),
      background: 'transparent',
    };

    // Preview pequeña
    try {
      const preview = this.stage.toDataURL({ pixelRatio: 0.2 });
      this.currentOverlay.preview = preview;
    } catch (e) {
      console.error('No se pudo generar preview', e);
    }

    const res = await fetch('/api/overlays', {
      method: 'POST',                         // SIEMPRE POST
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.currentOverlay),
    });

    if (!res.ok) {
      console.error('Error guardando overlay', await res.text());
      alert('Error guardando overlay');
      return;
    }

    const data = await res.json();
    this.currentOverlay = data.overlay;       // por si el server normaliza algo

    alert('Overlay guardado');
    this.loadOverlays();
  },


  snapshotState() {
    if (!this.currentOverlay) return null;
    return JSON.parse(JSON.stringify({
      canvas: this.currentOverlay.canvas,
      elements: this.currentOverlay.elements,
      groups: this.currentOverlay.groups || []   // ← NUEVO
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
    this.currentOverlay.groups = snap.groups || [];


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

  makePropertiesPanelDraggable() {
    const panel = document.getElementById('propertiesPanel');
    if (!panel) return;
    const header = panel.querySelector('.prop-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    // Aseguramos usar left/top en vez de right
    panel.style.left = panel.style.left || 'calc(100% - 520px)';
    panel.style.right = 'auto';

    const onMouseDown = (e) => {
      isDragging = true;
      panel.classList.add('dragging');

      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      // Clamps básicos dentro de la ventana
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      if (newLeft < 0) newLeft = 0;
      if (newTop < 0) newTop = 0;
      if (newLeft > maxX) newLeft = maxX;
      if (newTop > maxY) newTop = maxY;

      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      panel.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', onMouseDown);
  },



  setupUIHooks() {
    window.overlayApp = this;

    const btnNew = document.getElementById('btnNewOverlay');
    if (btnNew) btnNew.onclick = () => this.newOverlay();

    const btnSave = document.getElementById('btnSaveOverlay');
    if (btnSave) btnSave.onclick = () => this.saveCurrent();

    const btnText = document.querySelector('button[data-tool="text"]');
    if (btnText) {
      btnText.onclick = () => this.addTextElement();
    }

        // Botón para añadir imagen externa (archivo o URL)
    const btnExternalImg = document.getElementById('btnAddExternalImage');
    const externalFileInput = document.getElementById('externalImageFileInput');

    if (btnExternalImg && externalFileInput) {
      // Click en el botón "Img"
      btnExternalImg.onclick = async () => {
        if (!this.currentOverlay) {
          alert('Primero crea o abre un overlay.');
          return;
        }

        // Preguntar si quiere archivo local (Aceptar) o URL (Cancelar)
        const useFile = confirm(
          '¿Quieres subir un archivo de tu PC?\n' +
          'Aceptar = archivo local\n' +
          'Cancelar = URL externa'
        );

        if (useFile) {
          // Disparar el input de archivo oculto
          externalFileInput.value = '';
          externalFileInput.click();
          return;
        }

        // Modo URL externa
        const url = prompt('Pega la URL de la imagen externa:');
        if (!url) return;

        try {
          // Igual que con los renders/gifts: cachear en el servidor
          const res = await fetch('/api/cache-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          const data = await res.json();
          const finalUrl = data.success ? data.cachedUrl : url;

          this.addImageElement(finalUrl, 'Imagen externa', 'image');
        } catch (e) {
          console.error('Error cacheando imagen externa', e);
          // Fallback: usar directamente la URL
          this.addImageElement(url, 'Imagen externa', 'image');
        }
      };

      // Cuando el usuario elige un archivo local
      externalFileInput.onchange = () => {
        const file = externalFileInput.files && externalFileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result; // base64
          const name = file.name || 'Imagen subida';

          // Lo tratamos como un elemento de tipo 'image' normal
          this.addImageElement(dataUrl, name, 'image');
        };
        reader.readAsDataURL(file);
      };
    }


    const btnRect = document.querySelector('button[data-tool="rect"]');
    if (btnRect) btnRect.onclick = this.addRectElement.bind(this);



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


    // Teclas globales: Delete, Ctrl+Z/Y/C/X/V, duplicar, agrupar, flechas
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      // No interferir cuando estás escribiendo en inputs o textareas
      if (tag === 'input' || tag === 'textarea') return;

      // Mover selección con flechas
      // Mover selección con flechas
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown') {

        const nodes = this.transformer?.nodes?.() || [];
        if (!nodes.length) return;

        // Evitar scroll de la página, etc.
        e.preventDefault();

        let baseStep;

        if (e.altKey) {
          // Alt + flecha → ultra preciso
          baseStep = 0.1;
        } else if (e.shiftKey) {
          // Shift + flecha → salto grande
          baseStep = 10;
        } else {
          // Flecha sola → normal
          baseStep = 1;
        }

        // Si la tecla está repitiéndose (la dejas apretada),
        // hacemos el paso un poco más grande para que recorra más rápido.
        // Por ejemplo x3 el paso base.
        const step = e.repeat ? baseStep * 3 : baseStep;

        let dx = 0;
        let dy = 0;

        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;

        this.nudgeSelection(dx, dy);
        return;
      }


      // Undo / Redo, duplicar, agrupar, copiar/cortar/pegar
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();

        if (k === 'z') {
          e.preventDefault();
          this.undo();
          return;
        }

        if (k === 'y') {
          e.preventDefault();
          this.redo();
          return;
        }

        // Duplicar selección Ctrl+D
        if (k === 'd') {
          e.preventDefault();
          this.duplicateSelected();
          return;
        }

        // Agrupar selección Ctrl+G
        if (k === 'g') {
          e.preventDefault();
          this.groupSelected();
          return;
        }

        // Copiar / Cortar / Pegar
        if (k === 'c') {
          e.preventDefault();
          this.copySelected();
          return;
        }

        if (k === 'x') {
          e.preventDefault();
          this.cutSelected();
          return;
        }

        if (k === 'v') {
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

    this.makePropertiesPanelDraggable();
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

      text.meta = cloned;
      text._meta = cloned;

      // APLICAR BORDE si venía guardado en el meta copiado
      this.applyBorderToShape(text, cloned);

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

  addTextElement() {
    if (!this.currentOverlay) return;

    const el = {
      id: 'el_' + crypto.randomUUID(),
      type: 'text',
      text: 'Nuevo texto',
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      fontSize: 32,
      fontFamily: 'Inter',
      color: 'white',
      rotation: 0,
      opacity: 100,
      zIndex: (this.currentOverlay.elements || []).length + 1
    };

    this.currentOverlay.elements.push(el);

    const text = new Konva.Text({
      x: el.x,
      y: el.y,
      text: el.text,
      fontSize: el.fontSize,
      fontFamily: el.fontFamily,
      fill: el.color,
      opacity: el.opacity / 100,
      rotation: el.rotation
    });

    text.meta = el;
    text._meta = el;

    // Si en algún momento el texto ya tenía borde en meta (por duplicar, etc.),
    // lo aplicamos aquí también.
    this.applyBorderToShape(text, el);

    this.makeDraggable(text);
    this.layer.add(text);

    this.selectedElementId = el.id;
    if (this.transformer) {
      this.transformer.nodes([text]);
    }
    this.updatePropertiesPanel(text);
    this.renderLayersTree();
    this.layer.draw();
    this.pushHistory && this.pushHistory();
  },


  addRectElement() {
    if (!this.currentOverlay || !this.layer) return;

    // 1) Crear meta en el JSON
    const el = {
      id: crypto.randomUUID(),
      type: 'rect',
      name: 'Rectángulo',
      x: 200,
      y: 200,
      width: 300,
      height: 150,

      // Fondo transparente por defecto
      baseBgColor: '#000000',
      bgAlpha: 0,
      backgroundColor: 'rgba(0,0,0,0)',

      // Borde cian por defecto
      baseBorderColor: '#000000',
      borderAlpha: 100,
      borderColor: 'rgb(0, 0, 0)',
      borderWidth: 1,
      opacity: 100,
      rotation: 0,
      zIndex: this.currentOverlay.elements.length + 1,
    };

    this.currentOverlay.elements.push(el);

    // 2) Crear el Konva.Rect correspondiente
    const rect = new Konva.Rect({
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      fill: el.backgroundColor,
      stroke: el.borderColor,
      strokeWidth: el.borderWidth,
      opacity: (el.opacity ?? 100) / 100,
      rotation: el.rotation || 0,
    });

    rect.meta = el;

    this.makeDraggable(rect);
    this.layer.add(rect);

    // 3) Seleccionarlo y abrir sus props
    this.selectedElementId = el.id;
    if (this.transformer) {
      this.transformer.nodes([rect]);
    }

    this.updatePropertiesPanel(rect);
    this.renderLayersTree();
    this.layer.draw();
    this.pushHistory?.();
  },


  reorderElements(newOrder) {
    const elements = this.currentOverlay.elements;
    const newElements = newOrder.map(id => elements.find(el => el.id === id)).filter(Boolean);

    // zIndex alto = arriba tree
    newElements.forEach((el, visualIndex) => {
      el.zIndex = newElements.length - 1 - visualIndex;
    });
    this.currentOverlay.elements = newElements;

    // Mapa shapes
    const shapesMap = {};
    this.layer.children.forEach(child => {
      if (child._meta?.id) shapesMap[child._meta.id] = child;
    });

    // NUEVO ORDEN: tree arriba = Konva FONDO (inicio array)
    const newChildrenOrder = [];
    const frame = this.layer.children.find(child => !child._meta);
    if (frame) newChildrenOrder.push(frame);  // fondo

    // IMPORTANTE: newElements directo (Pegasus index 0 = inicio array = fondo)
    newElements.slice().reverse().forEach(el => {
      const shape = shapesMap[el.id];
      if (shape) newChildrenOrder.push(shape);
    });

    const transformer = this.layer.findOne('Transformer');
    if (transformer) newChildrenOrder.push(transformer);  // siempre arriba

    this.layer.children = newChildrenOrder;  // ← MAGIC: Pegasus arriba tree = fondo? NO espera

    this.renderLayersTree();
    this.layer.batchDraw();
    this.pushHistory?.();
  },



  filterLibrary(type) {
    // type = 'gifts' o 'renders'
    const inputId = type === 'gifts' ? 'giftFilter' : 'renderFilter';
    const listId = type === 'gifts' ? 'giftLibrary' : 'renderLibrary';

    const input = document.getElementById(inputId);
    const container = document.getElementById(listId);
    if (!input || !container) return;

    const term = (input.value || '').toLowerCase().trim();

    const isGift = type === 'gifts';
    const allItems = isGift ? (this.giftsData || []) : (this.rendersData || []);

    // Sin texto → mostrar todo tal cual
    if (!term) {
      this.renderLibrary(type, allItems);
      return;
    }

    // ---- MISMA IDEA QUE setupGiftAutocomplete: exacto > empieza por > contiene ----
    const ranked = [];

    allItems.forEach(item => {
      const baseName = isGift
        ? (item.name_en || '')
        : (item.displayName || item.name || '');
      const name = baseName.toLowerCase();
      if (!name) return;

      if (name === term) {
        // 1) Coincidencia exacta
        ranked.push({ item, rank: 1 });
      } else if (name.startsWith(term)) {
        // 2) Empieza por el término
        ranked.push({ item, rank: 2 });
      } else if (name.includes(term)) {
        // 3) Lo contiene en cualquier posición
        ranked.push({ item, rank: 3 });
      }
    });

    ranked.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;

      if (isGift) {
        // Para gifts: dentro de la misma categoría, más diamantes primero (como en el modal)
        return (b.item.diamonds || 0) - (a.item.diamonds || 0);
      }

      // Para renders: ordenar alfabéticamente dentro de la misma categoría
      const aName = (a.item.displayName || a.item.name || '').toLowerCase();
      const bName = (b.item.displayName || b.item.name || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    const filtered = ranked.map(r => r.item);

    // Reusar la misma función de pintado
    this.renderLibrary(type, filtered);
  },

  duplicateSelected() {
    this.copySelected();
    this.pasteClipboard();
  },

  // --------- Grupos lógicos (carpetas de capas) ---------
  newGroup() {
    if (!this.currentOverlay) return;

    if (!Array.isArray(this.currentOverlay.groups)) {
      this.currentOverlay.groups = [];
    }

    const index = this.currentOverlay.groups.length + 1;
    const group = {
      id: 'grp_' + crypto.randomUUID(),
      name: 'Grupo ' + index,
      children: []          // ids de elementos
    };

    this.currentOverlay.groups.push(group);
    this.renderLayersTree();
    this.pushHistory && this.pushHistory();
  },

  groupSelected() {
    if (!this.currentOverlay || !this.transformer) return;
    const nodes = this.transformer.nodes();
    if (!nodes.length) return;

    const ids = nodes.map(n => n.meta?.id).filter(Boolean);
    if (!ids.length) return;

    if (!Array.isArray(this.currentOverlay.groups)) {
      this.currentOverlay.groups = [];
    }

    // 1) Sacar estos ids de cualquier grupo previo
    this.currentOverlay.groups.forEach(g => {
      g.children = g.children.filter(id => !ids.includes(id));
    });

    // 2) Eliminar grupos que se hayan quedado vacíos
    this.currentOverlay.groups = this.currentOverlay.groups.filter(
      g => Array.isArray(g.children) && g.children.length > 0
    );

    // 3) Crear grupo NUEVO con la selección actual
    const index = this.currentOverlay.groups.length + 1;
    const group = {
      id: 'grp-' + crypto.randomUUID(),
      name: 'Grupo ' + index,
      children: ids,
    };
    this.currentOverlay.groups.push(group);

    this.renderLayersTree();
    this.pushHistory?.();
  },



  ungroup() {
    if (!this.currentOverlay || !this.currentOverlay.groups || !this.transformer) return;

    const nodes = this.transformer.nodes() || [];
    if (!nodes.length) return;

    const ids = nodes
      .map(n => n._meta?.id)
      .filter(Boolean);

    if (!ids.length) return;

    let changed = false;

    this.currentOverlay.groups = this.currentOverlay.groups
      .map(g => {
        const before = (g.children || []).length;
        g.children = (g.children || []).filter(id => !ids.includes(id));
        if (g.children.length !== before) changed = true;
        return g;
      })
      .filter(g => (g.children || []).length > 0); // eliminar grupos vacíos

    if (!changed) return;

    // Seguimos con los mismos nodos seleccionados, pero ya sin grupo
    this.renderLayersTree();
    this.pushHistory && this.pushHistory();
  },


  renameGroup(groupId) {
    if (!this.currentOverlay?.groups) return;

    const group = this.currentOverlay.groups.find(g => g.id === groupId);
    if (!group) return;

    const current = group.name || 'Grupo';
    const newName = prompt('Nombre del grupo', current);
    if (!newName || newName === current) return;

    group.name = newName;
    this.renderLayersTree();
    this.pushHistory && this.pushHistory();
  },

  renameLayer(id) {
    if (!this.currentOverlay) return;

    const el = this.currentOverlay.elements.find(e => e.id === id);
    if (!el) return;

    // Nombre actual que se muestra
    const current =
      el.name ||
      (el.type === 'text'
        ? (el.text || '')
        : '');

    const newName = prompt('Nombre de la capa', current);
    if (!newName || newName === current) return;

    if (el.type === 'text') {
      // Para textos usamos el contenido como "nombre"
      el.text = newName;
      // Actualizar Konva.Text si está en el Stage
      const shape = this.findShapeByElementId(id);
      if (shape) {
        shape.text(newName);
        this.layer && this.layer.draw();
      }
    } else {
      // Para imágenes / rectángulos usamos el campo name
      el.name = newName;
    }

    this.renderLayersTree();
    this.pushHistory && this.pushHistory();
  },

  closeProperties() {
    const panel = document.getElementById('propertiesPanel');
    if (panel) panel.style.display = 'none';

    const empty = document.getElementById('props-empty');
    const elSec = document.getElementById('props-element');
    const grpSec = document.getElementById('props-group');

    if (empty) empty.style.display = 'block';
    if (elSec) elSec.style.display = 'none';
    if (grpSec) grpSec.style.display = 'none';
  },



  updateSelected(prop, value) {
    const nodes = this.transformer.nodes();
    if (!nodes.length) return;

    // Si hay grupo seleccionado (selectedGroupId), actuamos sobre el grupo
    if (this.selectedGroupId && (!this.selectedElementId || nodes.length > 1)) {
      const group = this.currentOverlay.groups.find(g => g.id === this.selectedGroupId);
      if (!group) return;
      group.runtime = group.runtime || {};
      group.runtime.onActionExecute = group.runtime.onActionExecute || {};

      if (prop === 'animation') {
        group.runtime.onActionExecute.animationOnAction = value || '';
      } else if (prop === 'trigger') {
        group.runtime.onActionExecute.trigger = value || '';
      }
      // ... (otros props de grupo si quieres)
      this.pushHistory && this.pushHistory();
      return;
    }

    // Si no, es una capa normal
    const m = nodes[0]._meta;
    if (!m) return;

    if (prop === 'animation') {
      m.animationBase = value || '';
    } else if (prop === 'trigger') {
      m.trigger = value || '';
    }
    // resto de props (x, y, opacity, etc.) como ya lo tienes
    this.layer.draw();
    this.pushHistory && this.pushHistory();
  },



};


window.OverlayEditor = OverlayEditor;   // para botones que llaman OverlayEditor.xyz()
window.overlayApp = OverlayEditor;      // para botones que llaman overlayApp.xyz()

document.addEventListener('DOMContentLoaded', () => OverlayEditor.init());
