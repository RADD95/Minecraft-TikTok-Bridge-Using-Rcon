

// Estado global
let config = {};
let actions = [];
let currentActionType = 'gift';
let stats = {
  likes: 0,
  comments: 0,
  gifts: 0,
  diamonds: 0
};

// =====================
// Navegación
// =====================
function switchTab(tab, element) {
  // Actualizar nav items
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  // Ocultar todas las vistas
  document.querySelectorAll('.view').forEach(el => el.style.display = 'none');

  // Mostrar vista seleccionada (con verificación anti-null)
  const view = document.getElementById(`view-${tab}`);
  if (view) {
    view.style.display = 'block';
  } else {
    console.error(`Vista ${tab} no encontrada`);
  }

  if (tab === 'actions') loadActions();
}

// =====================
// API Calls
// =====================
async function apiGet(endpoint) {
  const res = await fetch(`/api${endpoint}`);
  return res.json();
}

async function apiPost(endpoint, data) {
  const res = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// =====================
// Inicialización
// =====================
async function init() {
  await loadConfig();
  await loadActions();
  await updateStatus();
  connectLogs();

  setInterval(() => {
    updateStatus();
    pollStats();

  }, 5000);
}


async function loadConfig() {
  try {
    const data = await apiGet('/config');
    config = data;
    document.getElementById('rconHost').value = data.rcon?.host || '';
    document.getElementById('rconPort').value = data.rcon?.port || 25575;
    document.getElementById('rconPassword').value = data.rcon?.password || '';
    document.getElementById('tiktokUsername').value = data.tiktok?.username || '';
    document.getElementById('playerName').value = data.minecraft?.playername || '';
  } catch (e) {
    log('system', 'Error cargando configuración');
  }
}

// =====================
// Conexiones
// =====================
async function connectRcon() {
  await saveRconConfig();
  const res = await apiPost('/rcon/connect', {});
  if (res.success) {
    log('system', 'RCON conectado exitosamente');
    updateStatus();
  } else {
    log('system', 'Error conectando RCON: ' + (res.error || 'Unknown'));
    alert('Error de conexión RCON');
  }
}

async function disconnectRcon() {
  await apiPost('/rcon/disconnect', {});
  log('system', 'RCON desconectado');
  updateStatus();
}

async function testConnection() {
  const res = await apiPost('/rcon/test', {});
  if (res.success) {
    log('system', 'Test RCON: OK - ' + res.response);
    alert('✅ Conexión exitosa!\nRespuesta: ' + res.response);
  } else {
    log('system', 'Test RCON: Fallido');
    alert('❌ Error: ' + (res.error || 'No conectado'));
  }
}

async function startTikTok() {
  const username = document.getElementById('tiktokUsername').value.trim();
  if (!username) {
    alert('Ingresa un usuario de TikTok');
    return;
  }
  const res = await apiPost('/tiktok/start', { username });
  if (res.success) {
    log('system', `Iniciando conexión a @${username}...`);
    document.getElementById('btnStartTiktok').disabled = true;
  }
  updateStatus();
}

async function stopTikTok() {
  await apiPost('/tiktok/stop', {});
  log('system', 'TikTok desconectado');
  document.getElementById('btnStartTiktok').disabled = false;
  updateStatus();
}

// =====================
// Configuración
// =====================
async function saveRconConfig() {
  const newConfig = {
    ...config,
    rcon: {
      host: document.getElementById('rconHost').value,
      port: parseInt(document.getElementById('rconPort').value),
      password: document.getElementById('rconPassword').value
    }
  };
  const res = await apiPost('/config', newConfig);
  if (res.success) {
    config = newConfig;
    log('system', 'Config RCON guardada');
  }
}

async function savePlayerConfig() {
  const newConfig = {
    ...config,
    minecraft: {
      playername: document.getElementById('playerName').value
    }
  };
  const res = await apiPost('/config', newConfig);
  if (res.success) {
    config = newConfig;
    log('system', 'Config jugador guardada');
    alert('✅ Configuración guardada');
  }
}

// =====================
// Gestión de Acciones
// =====================
let filteredActions = []; // Cache para filtrado

async function loadActions() {
  try {
    const data = await apiGet('/actions');
    actions = Array.isArray(data) ? data : [];
    filteredActions = [...actions]; // Inicializar filtrado
    renderActions();
  } catch (e) {
    console.error('Error cargando acciones:', e);
    actions = [];
    filteredActions = [];
    renderActions();
  }
}


function renderActions() {
  const container = document.getElementById('actionsList');
  const countEl = document.getElementById('actionsCount');

  if (!container) {
    console.error('Elemento actionsList no encontrado');
    return;
  }

  // Actualizar contador (mostrar "X de Y" si hay filtro activo)
  const searchTerm = document.getElementById('actionSearch')?.value?.trim() || '';
  const filterType = document.getElementById('actionFilterType')?.value || 'all';

  if (countEl) {
    if (filteredActions.length !== actions.length) {
      countEl.textContent = `${filteredActions.length} de ${actions.length}`;
    } else {
      countEl.textContent = actions.length;
    }
  }

  if (filteredActions.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem; border: 2px dashed var(--border-glass); border-radius: var(--radius-md);">
        <i class="fa-solid fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
        <div>No hay acciones configuradas${searchTerm || filterType !== 'all' ? ' con esos filtros' : ''}</div>
        ${!searchTerm && filterType === 'all' ? '<button class="btn btn-primary" style="margin-top: 1rem;" onclick="openActionModal()">Crear primera acción</button>' : ''}
      </div>`;
    return;
  }

  container.innerHTML = filteredActions.map((action, index) => {
    // Buscar el índice real en el array original para poder editar/borrar
    const originalIndex = actions.findIndex(a =>
      a.name === action.name && a.type === action.type && a.trigger === action.trigger && a.command === action.command
    );

    return `
    <div class="action-card" style="background: var(--bg-secondary); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; position: relative; overflow: hidden;">
      <!-- Header de la card -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="action-tag tag-${action.type}" style="font-size: 0.7rem;">
            ${action.type === 'gift' ? '🎁' : action.type === 'comment' ? '💬' : action.type === 'like' ? '❤️' : '➕'} ${action.type}
          </span>
          ${action.trigger ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent-gold); background: rgba(251, 191, 36, 0.1); padding: 0.125rem 0.5rem; border-radius: 4px;">${action.trigger}</span>` : ''}
        </div>
        <div style="display: flex; gap: 0.25rem;">
          <button class="btn-icon" onclick="editAction(${originalIndex})" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon delete" onclick="deleteAction(${originalIndex})" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      
      <!-- Nombre -->
      <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary); margin-top: 0.25rem;">
        ${action.name || 'Sin nombre'}
      </div>
      
      <!-- Comando (preview) -->
      <div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-left: 3px solid var(--accent-mc);">
        ${action.command || 'Sin comando'}
      </div>
    </div>
  `}).join('');
}

// Nueva función de filtrado
function filterActions() {
  const searchTerm = document.getElementById('actionSearch')?.value?.toLowerCase().trim() || '';
  const filterType = document.getElementById('actionFilterType')?.value || 'all';

  filteredActions = actions.filter(action => {
    // Filtro por tipo
    if (filterType !== 'all' && action.type !== filterType) return false;

    // Filtro por búsqueda (busca en nombre, trigger, comando, tipo)
    if (!searchTerm) return true;

    const searchable = [
      action.name || '',
      action.trigger || '',
      action.command || '',
      action.type || ''
    ].join(' ').toLowerCase();

    return searchable.includes(searchTerm);
  });

  renderActions();
}

function addAction() {
  openActionModal();
}

async function deleteAction(index) {
  if (!confirm('¿Eliminar esta acción permanentemente?')) return;

  const res = await fetch(`/api/actions/${index}`, { method: 'DELETE' });
  const data = await res.json();

  if (data.success) {
    loadActions();
    log('system', 'Acción eliminada');
  }
}

function editAction(index) {
  openActionModal(index);
}

// =====================
// Test & Logs
// =====================
async function sendTestCommand() {
  const cmd = document.getElementById('quickTestCommand').value || document.getElementById('testCommand')?.value;
  if (!cmd) return;

  const res = await apiPost('/rcon/command', { command: cmd });
  if (res.success) {
    log('command', `Ejecutado: ${cmd}`);
    document.getElementById('quickTestCommand').value = '';
  } else {
    log('system', `Error: ${res.error}`);
  }
}

function log(type, message) {
  const container = document.getElementById('eventLog');
  const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
                <span class="log-time">${time}</span>
                <span class="log-type ${type}">${type}</span>
                <span class="log-message">${escapeHtml(message)}</span>
            `;

  container.insertBefore(entry, container.firstChild);

  while (container.children.length > 100) {
    container.removeChild(container.lastChild);
  }
}

function clearLogs() {
  document.getElementById('eventLog').innerHTML = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function updateStatus() {
  try {
    const status = await apiGet('/status');

    // Update RCON UI
    const rconBadge = document.getElementById('rconStatusBadge');
    const rconText = document.getElementById('rconStatusText');
    const rconConn = document.getElementById('rconConnectionStatus');

    if (status.rcon) {
      rconBadge.className = 'status-indicator online';
      rconText.textContent = 'Online';
      rconConn.className = 'connection-status-badge status-connected';
      rconConn.innerHTML = '<i class="fa-solid fa-circle"></i> Conectado';
      document.getElementById('btnConnectRcon').disabled = true;
    } else {
      rconBadge.className = 'status-indicator offline';
      rconText.textContent = 'Offline';
      rconConn.className = 'connection-status-badge status-disconnected';
      rconConn.innerHTML = '<i class="fa-solid fa-circle"></i> Desconectado';
      document.getElementById('btnConnectRcon').disabled = false;
    }

    // Update TikTok UI
    const ttBadge = document.getElementById('tiktokStatusBadge');
    const ttText = document.getElementById('tiktokStatusText');
    const ttConn = document.getElementById('tiktokConnectionStatus');

    if (status.tiktok) {
      ttBadge.className = 'status-indicator online';
      ttText.textContent = 'Online';
      ttConn.className = 'connection-status-badge status-connected';
      ttConn.innerHTML = '<i class="fa-solid fa-circle"></i> En vivo';
      document.getElementById('btnStartTiktok').disabled = true;
    } else {
      ttBadge.className = 'status-indicator offline';
      ttText.textContent = 'Offline';
      ttConn.className = 'connection-status-badge status-disconnected';
      ttConn.innerHTML = '<i class="fa-solid fa-circle"></i> Desconectado';
      document.getElementById('btnStartTiktok').disabled = false;
    }

  } catch (e) {
    console.error('Status update error:', e);
  }
}

let eventSource = null;

function connectLogs() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/api/logs/stream');

  eventSource.onmessage = (event) => {
    const newLogs = JSON.parse(event.data);
    const container = document.getElementById('eventLog');

    newLogs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `
                <span class="log-time">${log.time}</span>
                <span class="log-type ${log.type}">${log.type.toUpperCase()}</span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            `;
      container.insertBefore(entry, container.firstChild);
    });

    while (container.children.length > 100) {
      container.removeChild(container.lastChild);
    }
  };

  eventSource.onerror = () => {
    console.log('SSE reconectando...');
    setTimeout(connectLogs, 2000);
  };
}


async function pollStats() {
  // Update stats display if you have an endpoint for this
  // This is placeholder for real-time stat updates
}

async function resetStats() {
  if (!confirm('¿Resetear todas las estadísticas?')) return;
  const res = await apiPost('/stats/reset', {});
  if (res.success) {
    log('system', 'Estadísticas reseteadas');
    document.getElementById('stat-likes').textContent = '0';
    document.getElementById('stat-comments').textContent = '0';
    document.getElementById('stat-gifts').textContent = '0';
    document.getElementById('stat-diamonds').textContent = '0';
  }
}

async function toggleRcon() {
  const status = await apiGet('/status');
  if (status.rcon) {
    await disconnectRcon();
  } else {
    await connectRcon();
  }
}

async function toggleTiktok() {
    const btn = document.getElementById('headerTiktokBtn');
    const statusSpan = document.getElementById('headerTiktokStatus');
    
    // ← ANTI-SPAM 3s
    if (btn.dataset.cooldownUntil && Date.now() < parseInt(btn.dataset.cooldownUntil)) {
        log('system', '⏳ Espera anti-spam...');
        return;
    }
    
    console.clear();
    console.log('🔍 Navbar START');
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    
    try {
        const statusResponse = await fetch('/api/status');
        const status = await statusResponse.json();
        console.log('✅ Status:', status.tiktok);
        
        if (status.tiktok === true) {
            // STOP - Spinner rápido
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deteniendo...';
            const stopRes = await fetch('/api/tiktok/stop', { method: 'POST' });
            const stopData = await stopRes.json();
            log('system', '🛑 TikTok OFF');
            console.log('🛑 Stop OK');
        } else {
            const username = document.getElementById('tiktokUsername').value.trim();
            if (!username) throw new Error('Sin username');
            
            // START - CONTADOR 10s + Spinner
            let timeLeft = 10;
            const countdown = setInterval(() => {
                timeLeft--;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Conectando... ${timeLeft}s`;
                statusSpan.textContent = `Esperando ${timeLeft}s`;
                
                if (timeLeft <= 0) {
                    clearInterval(countdown);
                    btn.innerHTML = originalText;
                    statusSpan.textContent = 'Listo';
                }
            }, 1000);
            
            const startRes = await fetch('/api/tiktok/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const startData = await startRes.json();
            
            clearInterval(countdown);  // Para countdown
            console.log('▶️ Start:', startData);
            log('system', `▶️ TikTok ${username} ON (${startData.message})`);
        }
        
        // ← COOLDOWN 3s visual
        btn.dataset.cooldownUntil = (Date.now() + 3000).toString();
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
            updateStatus();
            updateHeaderButtons();
        }, 3000);
        
    } catch (error) {
        console.error('❌ ERROR:', error);
        log('system', `❌ Navbar: ${error.message}`);
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert('Error: ' + error.message);
    }
}







// Actualizar colores del header
function updateHeaderButtons() {
    const rconBtn = document.getElementById('headerRconBtn');
    const ttBtn = document.getElementById('headerTiktokBtn');
    
    if (!rconBtn || !ttBtn) return;  // ← ANTI-NULL
    
    fetch('/api/status').then(res => res.json()).then(status => {
        // RCON
        const rconStatus = rconBtn.querySelector('#headerRconStatus') || 
                          document.getElementById('headerRconStatus');
        if (rconStatus) {
            if (status.rcon) {
                rconBtn.className = 'btn btn-success';
                rconStatus.textContent = 'Online';
            } else {
                rconBtn.className = 'btn btn-secondary';
                rconStatus.textContent = 'Offline';
            }
        }
        
        // TikTok
        const ttStatus = ttBtn.querySelector('#headerTiktokStatus') || 
                        document.getElementById('headerTiktokStatus');
        if (ttStatus) {
            if (status.tiktok) {
                ttBtn.className = 'btn btn-success';
                ttStatus.textContent = 'Online';
            } else {
                ttBtn.className = 'btn btn-secondary';
                ttStatus.textContent = 'Offline';
            }
        }
    }).catch(e => console.log('Header update fail:', e));
}


// Llamar en init y en updateStatus
const originalUpdateStatus = updateStatus;
updateStatus = async function () {
  await originalUpdateStatus();
  updateHeaderButtons();
};



function openActionModal(index = null) {
  const modal = document.getElementById('actionModal');
  modal.style.display = 'flex';

  if (index !== null) {
    const action = actions[index];
    document.getElementById('modalTitle').textContent = 'Editar Acción';
    document.getElementById('editingIndex').value = index;
    document.getElementById('modalActionName').value = action.name || '';
    document.getElementById('modalActionType').value = action.type;
    document.getElementById('modalActionTrigger').value = action.trigger || '';
    document.getElementById('modalActionCommand').value = action.command;
  } else {
    document.getElementById('modalTitle').textContent = 'Nueva Acción';
    document.getElementById('editingIndex').value = '';
    document.getElementById('modalActionName').value = '';
    document.getElementById('modalActionType').value = 'gift';
    document.getElementById('modalActionTrigger').value = '';
    document.getElementById('modalActionCommand').value = '';
  }
  updateModalHint();
}

function closeActionModal() {
  document.getElementById('actionModal').style.display = 'none';
}

function updateModalHint() {
  const type = document.getElementById('modalActionType').value;
  const hint = document.getElementById('modalTriggerHint');
  const trigger = document.getElementById('modalActionTrigger');

  switch (type) {
    case 'gift':
      hint.textContent = 'Nombre exacto del regalo (ej: Rose, Galaxy). Vacío = cualquiera';
      trigger.placeholder = 'Rose';
      break;
    case 'comment':
      hint.textContent = 'Texto a detectar. Vacío = cualquier comentario';
      trigger.placeholder = 'hola';
      break;
    case 'like':
      hint.textContent = 'Cada X likes (ej: 10). Vacío = cada like';
      trigger.placeholder = '10';
      break;
    case 'follow':
      hint.textContent = 'No requiere trigger';
      trigger.placeholder = '';
      trigger.disabled = true;
      return;
  }
  trigger.disabled = false;
}

async function saveActionModal() {
  const index = document.getElementById('editingIndex').value;
  const action = {
    name: document.getElementById('modalActionName').value.trim(),
    type: document.getElementById('modalActionType').value,
    trigger: document.getElementById('modalActionTrigger').value.trim(),
    command: document.getElementById('modalActionCommand').value.trim()
  };

  if (!action.command) {
    alert('El comando es requerido');
    return;
  }

  if (index !== '') {
    // Editar existente - usa PUT
    const res = await fetch(`/api/actions/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action)
    });
    if (res.ok) {
      log('system', `Acción #${index} actualizada`);
    }
  } else {
    // Nueva - usa POST
    await apiPost('/actions', action);
    log('system', `Nueva acción ${action.type} creada`);
  }

  closeActionModal();
  await loadActions();
}
// Start
init();
