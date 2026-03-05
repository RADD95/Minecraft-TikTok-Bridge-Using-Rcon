// overlay-editor.js - NUEVO (Konva + JSON simple)
const OverlayEditor = {

  // --------- Stubs temporales para no romper el HTML viejo ---------
  toggleGrid() { },
  filterOverlays() { },
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

      // Click en fondo -> limpiar selección
      if (target === this.stage) {
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
      const nodes = this.transformer.nodes() || [];

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
        this.transformer.nodes([shape]);
        this.selectedElementId = shape._meta?.id || null;
        this.updatePropertiesPanel(shape);
      }

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
          x: el.x, y: el.y,
          text: el.text || '',
          fontSize: el.fontSize || 24,
          fontFamily: el.fontFamily || 'Inter',
          fill: el.color || 'white',
          opacity: (el.opacity ?? 100) / 100,
          rotation: el.rotation || 0,
          scaleX: el.scaleX || 1,    // ← AÑADE
          scaleY: el.scaleY || 1     // ← AÑADE
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


  renderLayerItemHtml(el, { activeNodeIds = new Set(), inGroup = false } = {}) {
    const isSelected =
      activeNodeIds.has(el.id) || el.id === this.selectedElementId;

    const typeIcon =
      el.type === 'image' ? 'fa-image' :
      el.type === 'text'  ? 'fa-font'  :
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

        const nodes = this.transformer.nodes() || [];

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
          this.transformer.nodes([shape]);
          this.selectedElementId = id;
          this.updatePropertiesPanel(shape);
        }

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

  selectGroupById(groupId) {
    if (!this.currentOverlay?.groups || !this.layer || !this.transformer) return;

    const group = this.currentOverlay.groups.find(g => g.id === groupId);
    if (!group) return;

    const shapes = (group.children || [])
      .map(id => this.findShapeByElementId(id))
      .filter(Boolean);

    if (!shapes.length) {
      this.transformer.nodes([]);
      this.selectedElementId = null;
      this.updatePropertiesPanel(null);
      this.layer && this.layer.batchDraw();
      return;
    }

    // Multi‑selección en el Transformer
    this.selectedElementId = null;
    this.transformer.nodes(shapes);
    this.updatePropertiesPanel(null); // De momento sin panel específico de grupo
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




    shape.ondragend = (e) => {
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

    // Doble click en texto -> input inline para editar
    shape.on('dblclick dbltap', () => {
      if (shape._meta?.type !== 'text') return;

      const rect = shape.getClientRect();
      const baseScale = OverlayEditor.baseScale || 1; // ← DIVIDIR por scale del stage
      const input = document.createElement('input');
      input.type = 'text';
      input.value = shape.text();
      input.style.cssText = `
    position: absolute;
    left: ${(rect.x + OverlayEditor.stage.getAbsolutePosition().x) / baseScale}px;
    top: ${(rect.y + OverlayEditor.stage.getAbsolutePosition().y) / baseScale}px;
    width: ${rect.width / baseScale}px;
    height: ${rect.height / baseScale}px;
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

      // ← NUEVO: ancho dinámico
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
        input.style.width = `${Math.max(newWidth, rect.width / baseScale)}px`;
      };

      shape.visible(false);

      const commitEdit = () => {
        if (input._removed) return;

        const newText = input.value || '';
        shape.text(newText);
        shape.fontSize(shape.fontSize()); // ← FIJA: mantener fontSize
        shape._meta.text = newText;
        shape._meta.fontSize = shape.fontSize(); // ← GUARDAR fontSize
        shape.visible(true);
        OverlayEditor.updatePropertiesPanel(shape); // ← this → OverlayEditor
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
      input.onclick = e => e.stopPropagation();
    });


    shape.on('transform', () => {
      if (shape._meta?.type !== 'text') return;

      const stage = OverlayEditor.stage;
      const pointer = stage.getPointerPosition();
      const tr = shape.getStage()?.findOne('Transformer');
      const anchor = tr?.anchor || '';

      // ← ESQUINAS: fontSize proporcional
      if (anchor.includes('left') || anchor.includes('right')) {
        const scale = Math.max(shape.scaleX(), shape.scaleY());
        shape.fontSize((shape._meta.fontSize || 24) * scale);
        shape.scale({ x: 1, y: 1 });
      }
      // ← LADOS: stretch width (scaleX)
      else if (anchor === 'top-center' || anchor === 'bottom-center' || anchor === 'middle-left' || anchor === 'middle-right') {
        shape.width(shape.width() * shape.scaleX());
        shape.scaleX(1);
      }
    });



    shape.on('dragend transformend', () => {
      const m = shape._meta;
      if (!m) return;

      if (m.type === 'text') {
        m.fontSize = shape.fontSize(); // actualiza desde transform
        m.width = shape.width();       // guarda stretch
      }
      else {
        // Imágenes/rects: tamaño final
        const w = shape.width() * shape.scaleX();
        const h = shape.height() * shape.scaleY();
        shape.width(w);
        shape.height(h);
        shape.scale({ x: 1, y: 1 });
        m.width = w;
        m.height = h;
        m.scale = 1;
      }

      m.x = shape.x();
      m.y = shape.y();
      m.rotation = shape.rotation();

      OverlayEditor.updatePropertiesPanel(shape);
      OverlayEditor.layer.batchDraw();
      OverlayEditor.pushHistory && OverlayEditor.pushHistory();
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

        // NUEVO: duplicar selección (Ctrl+D)
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this.duplicateSelected();
          return;
        }

        if (e.key.toLowerCase() === 'g') {
          e.preventDefault();
          this.groupSelected();
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
    text._meta = el;
    this.makeDraggable(text);
    this.layer.add(text);

    this.selectedElementId = el.id;
    this.transformer.nodes([text]);
    this.updatePropertiesPanel(text);
    this.renderLayersTree();
    this.layer.draw();
    this.pushHistory && this.pushHistory();
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

    const nodes = this.transformer.nodes() || [];
    if (!nodes.length) return;

    const ids = nodes
      .map(n => n._meta?.id)
      .filter(Boolean);

    if (!ids.length) return;

    // Asegurar estructura de grupos
    if (!Array.isArray(this.currentOverlay.groups)) {
      this.currentOverlay.groups = [];
    }

    // Sacar estos ids de cualquier grupo previo
    this.currentOverlay.groups.forEach(g => {
      g.children = (g.children || []).filter(id => !ids.includes(id));
    });

    // Crear grupo NUEVO con la selección actual
    const index = this.currentOverlay.groups.length + 1;
    const group = {
      id: 'grp_' + crypto.randomUUID(),
      name: 'Grupo ' + index,
      children: ids
    };

    this.currentOverlay.groups.push(group);

    this.renderLayersTree();
    this.pushHistory && this.pushHistory();
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



};


window.OverlayEditor = OverlayEditor;   // para botones que llaman OverlayEditor.xyz()
window.overlayApp = OverlayEditor;      // para botones que llaman overlayApp.xyz()

document.addEventListener('DOMContentLoaded', () => OverlayEditor.init());
