// ── Sistema de notificaciones (toast) ───────────────────────────────
// Reutilizable en toda la plataforma: mostrarToast('success'|'error'|
// 'warning'|'info', 'Título', 'Descripción opcional', duraciónMs).
// Estilo "logro desbloqueado": entra deslizando desde la esquina, barra
// de progreso de auto-cierre, y botón para cerrar manualmente.
const TOAST_ICONOS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
const toastContainer = document.getElementById('toast-container');

function mostrarToast(tipo, titulo, descripcion = '', duracionMs = 5000) {
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <div class="toast-icono">${TOAST_ICONOS[tipo] || 'ℹ️'}</div>
    <div class="toast-cuerpo">
      <div class="toast-titulo">${escaparHtml(titulo)}</div>
      ${descripcion ? `<div class="toast-descripcion">${escaparHtml(descripcion)}</div>` : ''}
    </div>
    <button class="toast-cerrar" type="button" aria-label="Cerrar notificación">✕</button>
    <div class="toast-progreso" style="animation-duration:${duracionMs}ms"></div>
  `;

  const cerrar = () => {
    toast.classList.add('saliendo');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast-cerrar').addEventListener('click', cerrar);
  const temporizador = setTimeout(cerrar, duracionMs);
  // Pausar el auto-cierre mientras el usuario tiene el cursor encima
  toast.addEventListener('mouseenter', () => clearTimeout(temporizador));

  toastContainer.appendChild(toast);
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// ── Referencias DOM ──────────────────────────────────────────────
const preview      = document.getElementById('preview');
const placeholder  = document.getElementById('placeholder');
const overlay      = document.getElementById('overlay');
const zonaOverlay  = document.getElementById('zona-overlay');
const zonaDescDiv  = document.getElementById('zona-descripcion');
const zonaDescText = document.getElementById('zona-desc-texto');
const btnReiniciar = document.getElementById('btn-reiniciar');
const btnLogout    = document.getElementById('btn-logout');

let chartEstado = null, chartEnfermedades = null, chartCultivos = null, chartActividad = null;

const VERDE_PROFUNDO = '#1B4332';
const VERDE_CLARO    = '#52B788';
const TIERRA         = '#C8A96E';
const WARNING        = '#D97706';
const PALETTE = ['#1B4332','#52B788','#C8A96E','#2D6A4F','#B7E4C7','#D97706','#DC2626','#95D5B2'];

// ── Plugin: mensaje cuando el chart queda vacío ──────────────────
const emptyStatePlugin = {
  id: 'emptyState',
  afterDraw(chart) {
    let isEmpty = false;
    let mensaje = 'Sin datos visibles';

    if (chart.config.type === 'doughnut' || chart.config.type === 'pie') {
      const meta   = chart.getDatasetMeta(0);
      const allHidden = !meta.data.length || meta.data.every(d => d.hidden);
      const allZero   = chart.data.datasets[0]?.data.every(v => v === 0);
      isEmpty = allHidden || allZero;
      if (allHidden && !allZero) mensaje = 'Activa categorías desde la leyenda';
      if (allZero) mensaje = 'Aún no hay análisis registrados';
    } else {
      isEmpty = chart.data.datasets.every((_, i) => !chart.isDatasetVisible(i));
      if (isEmpty) mensaje = 'Activa categorías desde la leyenda';
    }

    if (isEmpty) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#9CA3AF';
      ctx.font         = '13px Inter, sans-serif';
      ctx.fillText(mensaje, width / 2, height / 2);
      ctx.restore();
    }
  }
};
Chart.register(emptyStatePlugin);

// ── Menú hamburguesa (móvil) ───────────────────────────────────────
const navToggle  = document.getElementById('nav-toggle');
const navOverlay = document.getElementById('nav-overlay');

function abrirMenuMovil() {
  navToggle.classList.add('abierto');
  navOverlay.classList.add('visible');
}
function cerrarMenuMovil() {
  navToggle.classList.remove('abierto');
  navOverlay.classList.remove('visible');
}

navToggle.addEventListener('click', () => {
  navOverlay.classList.contains('visible') ? cerrarMenuMovil() : abrirMenuMovil();
});
// Clic en el fondo oscuro (fuera del panel) cierra el menú; el panel en sí
// detiene la propagación (ver onclick inline en el HTML) para que tocar
// un link o el botón Salir no cierre el drawer antes de procesar la acción.
navOverlay.addEventListener('click', cerrarMenuMovil);

// ── Navegación ───────────────────────────────────────────────────
// Selecciona los links de AMBAS barras (escritorio + drawer móvil), ya
// que comparten la clase .nav-link; así el estado "activa" queda
// sincronizado sin importar desde cuál se haya navegado.
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`.nav-link[data-section="${sec}"]`).forEach(l => l.classList.add('active'));
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.getElementById(`sec-${sec}`).classList.add('activa');
    if (sec === 'historial') cargarHistorial();
    if (sec === 'dashboard') cargarDashboard();
    if (sec === 'admin') cargarAdmin();
    cerrarMenuMovil();
  });
});

// ── Logout ───────────────────────────────────────────────────────
async function cerrarSesion() {
  await fetch('/logout');
  window.location.href = '/';
}
btnLogout.addEventListener('click', cerrarSesion);
document.getElementById('btn-logout-movil')?.addEventListener('click', cerrarSesion);

// ── Avatar de perfil ─────────────────────────────────────────────
// Un único <input type="file"> compartido por los dos botones de avatar
// (navbar de escritorio y drawer móvil). Al elegir una imagen se sube
// con FormData (es un archivo binario, no JSON) y, si el servidor la
// acepta, se reemplaza la vista previa en AMBOS botones al instante.
const inputAvatar = document.getElementById('input-avatar');

document.getElementById('avatar-btn-desktop')?.addEventListener('click', () => inputAvatar.click());
document.getElementById('avatar-btn-movil')?.addEventListener('click', () => inputAvatar.click());

inputAvatar.addEventListener('change', async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res  = await fetch('/perfil/avatar', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      mostrarToast('error', 'No se pudo actualizar la foto', data.error || 'Intenta con otra imagen.');
      return;
    }

    // Vista previa inmediata en ambos avatares sin recargar la página
    const urlNueva = `/static/${data.avatar_path}?t=${Date.now()}`; // cache-bust
    ['avatar-btn-desktop', 'avatar-btn-movil'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.querySelector('.avatar-iniciales')?.remove();
      let img = btn.querySelector('.avatar-img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'avatar-img';
        img.alt = 'Foto de perfil';
        btn.prepend(img);
      }
      img.src = urlNueva;
    });

    mostrarToast('success', 'Foto de perfil actualizada', 'Tu nueva imagen ya está visible.');
  } catch {
    mostrarToast('error', 'Error de conexión', 'No se pudo subir la imagen.');
  } finally {
    inputAvatar.value = '';
  }
});

// ── Captura de imagen ────────────────────────────────────────────
// En móvil, "Tomar foto" abre directo la cámara nativa vía input[capture]
// (funciona sin HTTPS, ver ajustes previos). En PC, antes de abrir nada,
// se verifica si existe una cámara física conectada; si no la hay, se
// avisa con un toast claro en vez de dejar que el navegador abra un
// selector confuso o falle en silencio.
const inputCamara   = document.getElementById('input-camara');
const inputGaleria  = document.getElementById('input-galeria');
const btnTomarFoto  = document.getElementById('btn-tomar-foto');

const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

btnTomarFoto.addEventListener('click', async () => {
  if (esMovil) {
    inputCamara.click();
    return;
  }
  await abrirCamaraEscritorio();
});

async function abrirCamaraEscritorio() {
  // enumerateDevices() no requiere permiso previo para LISTAR dispositivos,
  // solo para ver sus etiquetas — nos basta con saber si existe al menos
  // un videoinput para decidir si tiene sentido abrir el selector.
  if (!navigator.mediaDevices?.enumerateDevices) {
    // Navegador muy antiguo sin soporte: dejamos que el input intente igual.
    inputCamara.click();
    return;
  }
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const hayCamara = dispositivos.some(d => d.kind === 'videoinput');
    if (hayCamara) {
      inputCamara.click();
    } else {
      mostrarToast(
        'warning',
        'No se detectó ninguna cámara',
        'Conecta una webcam o selecciona una imagen desde tu equipo con el botón "Galería".'
      );
    }
  } catch {
    // Si la detección falla por cualquier motivo, no bloqueamos al
    // usuario: dejamos que el navegador decida qué mostrar.
    inputCamara.click();
  }
}

function manejarArchivoSeleccionado(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    preview.src = b64;
    preview.style.display      = 'block';
    placeholder.style.display  = 'none';
    btnReiniciar.style.display = 'block';
    analizarImagen(b64);
  };
  reader.readAsDataURL(file);
}

inputCamara.addEventListener('change', e  => manejarArchivoSeleccionado(e.target.files[0]));
inputGaleria.addEventListener('change', e => manejarArchivoSeleccionado(e.target.files[0]));

btnReiniciar.addEventListener('click', reiniciar);

function reiniciar() {
  preview.style.display      = 'none';
  placeholder.style.display  = 'flex';
  overlay.style.display      = 'none';
  zonaOverlay.style.display  = 'none';
  zonaDescDiv.style.display  = 'none';
  btnReiniciar.style.display = 'none';
  mostrarEstadoVacio();
  inputCamara.value  = '';
  inputGaleria.value = '';
}

// ── Analizar imagen ──────────────────────────────────────────────
async function analizarImagen(b64) {
  overlay.style.display     = 'flex';
  zonaOverlay.style.display = 'none';
  zonaDescDiv.style.display = 'none';
  mostrarEstadoVacio();

  try {
    const res  = await fetch('/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen: b64 })
    });
    const data = await res.json();
    overlay.style.display = 'none';

    if (!res.ok)              { mostrarError(data.error || 'Error al analizar.'); return; }
    if (data.valido === false) { mostrarInvalido(); return; }

    mostrarResultado(data);
    cargarEstadoSistema(); // refresca "última respuesta" y total de análisis
  } catch {
    overlay.style.display = 'none';
    mostrarError('Error de conexión con el servidor.');
  }
}

// ── Mostrar resultado ────────────────────────────────────────────
function mostrarResultado(data) {
  ocultarTodos();
  document.getElementById('resultado-contenido').style.display = 'flex';

  document.getElementById('res-cultivo').textContent    = data.cultivo    || 'Cultivo desconocido';
  document.getElementById('res-maduracion').textContent = data.maduracion || '—';
  document.getElementById('res-tratamiento').textContent = data.tratamiento || '—';
  document.getElementById('res-advertencia').textContent = data.advertencia || '';

  renderConfianzaBar(data.confianza || 0, 'res-confianza-fill', 'res-confianza-pct');

  // Enfermedades
  const enfs    = data.enfermedades || [];
  const bloqEnf = document.getElementById('bloque-enfermedades');
  const bloqSano = document.getElementById('bloque-sano');
  const contEnf  = document.getElementById('res-enfermedades');
  contEnf.innerHTML = '';

  if (enfs.length > 0) {
    bloqEnf.style.display  = 'block';
    bloqSano.style.display = 'none';
    enfs.forEach(e => {
      contEnf.innerHTML += `
        <div class="enfermedad-card">
          <div><span class="enfermedad-nombre">${e.nombre}</span>
               <span class="enfermedad-severidad">${e.severidad}</span></div>
          <p>${e.descripcion}</p>
        </div>`;
    });
  } else {
    bloqEnf.style.display  = 'none';
    bloqSano.style.display = 'block';
  }

  // Explicación
  const exp     = data.explicacion || [];
  const bloqExp = document.getElementById('bloque-explicacion');
  const listaExp = document.getElementById('res-explicacion');
  listaExp.innerHTML = '';
  if (exp.length > 0) {
    bloqExp.style.display = 'block';
    exp.forEach(obs => { listaExp.innerHTML += `<li>${obs}</li>`; });
  } else {
    bloqExp.style.display = 'none';
  }

  // Zona afectada
  const zona = data.zona_afectada;
  if (zona && zona.x !== undefined && enfs.length > 0) {
    zonaOverlay.style.left   = zona.x      + '%';
    zonaOverlay.style.top    = zona.y      + '%';
    zonaOverlay.style.width  = zona.width  + '%';
    zonaOverlay.style.height = zona.height + '%';
    zonaOverlay.style.display = 'block';
    if (zona.descripcion) {
      zonaDescText.textContent  = zona.descripcion;
      zonaDescDiv.style.display = 'flex';
    }
  }

  // Fuentes
  const fuentes = data.fuentes || [];
  const contF   = document.getElementById('res-fuentes');
  contF.innerHTML = '';
  fuentes.forEach(f => {
    contF.innerHTML += `
      <a class="fuente-link" href="${f.url}" target="_blank" rel="noopener">
        <span class="fuente-institucion">${f.institucion}</span>
        <span class="fuente-titulo">${f.titulo}</span>
      </a>`;
  });
}

// ── Barra de confianza ───────────────────────────────────────────
function renderConfianzaBar(valor, fillId, pctId) {
  const fill = document.getElementById(fillId);
  const pct  = pctId ? document.getElementById(pctId) : null;
  fill.style.width = valor + '%';
  fill.className   = 'confianza-fill';
  if (valor >= 80)      fill.classList.add('verde');
  else if (valor >= 60) fill.classList.add('amarillo');
  else                  fill.classList.add('rojo');
  if (pct) pct.textContent = valor + '%';
}

// ── Estados UI ───────────────────────────────────────────────────
function ocultarTodos() {
  ['resultado-vacio','resultado-invalido','resultado-contenido','resultado-error']
    .forEach(id => document.getElementById(id).style.display = 'none');
}
function mostrarEstadoVacio() { ocultarTodos(); document.getElementById('resultado-vacio').style.display = 'flex'; }
function mostrarInvalido()    { ocultarTodos(); document.getElementById('resultado-invalido').style.display = 'flex'; }
function mostrarError(msg)    {
  ocultarTodos();
  document.getElementById('resultado-error').style.display = 'flex';
  document.getElementById('error-texto').textContent = msg;
  mostrarToast('error', 'No se pudo analizar', msg);
}

// ── Historial ────────────────────────────────────────────────────
async function cargarHistorial() {
  const lista = document.getElementById('historial-lista');
  lista.innerHTML = '<div class="cargando">Cargando historial...</div>';
  try {
    const res  = await fetch('/historial');
    const data = await res.json();
    if (!data.length) { lista.innerHTML = '<div class="cargando">No hay análisis guardados aún.</div>'; return; }

    lista.innerHTML = data.map(item => {
      const imgHtml = item.imagen_path
        ? `<div class="historial-img-wrap"><img src="/static/${item.imagen_path}" alt="${item.cultivo}" class="historial-img"/></div>`
        : `<div class="historial-img-wrap historial-img-placeholder">📷</div>`;

      const enfsHtml = (item.enfermedades||[]).map(e =>
        `<span class="historial-enfermedad-tag">⚠️ ${e.nombre}</span>`
      ).join('') || '<span class="historial-enfermedad-tag historial-tag-sano">✅ Sano</span>';

      return `
        <div class="historial-card">
          ${imgHtml}
          <div class="historial-info">
            <div class="historial-card-header">
              <div class="historial-cultivo">${item.cultivo || 'Desconocido'}</div>
              <div class="historial-fecha">${formatearFecha(item.fecha)}</div>
            </div>
            <div class="historial-maduracion">${item.maduracion || '—'}</div>
            <div class="historial-confianza-wrap">
              <div class="confianza-track historial-confianza-track">
                <div class="confianza-fill ${item.confianza >= 80 ? 'verde' : item.confianza >= 60 ? 'amarillo' : 'rojo'}"
                     style="width:${item.confianza||0}%"></div>
              </div>
              <span class="historial-confianza-pct">${item.confianza||0}%</span>
            </div>
            <div>${enfsHtml}</div>
          </div>
        </div>`;
    }).join('');
  } catch { lista.innerHTML = '<div class="cargando">Error al cargar historial.</div>'; }
}

// ── Dashboard ────────────────────────────────────────────────────
async function cargarDashboard() {
  try {
    const res  = await fetch('/estadisticas');
    const data = await res.json();

    document.getElementById('dash-total').textContent = data.total_analisis;
    renderConfianzaBar(data.confianza_promedio, 'dash-confianza-fill', null);
    document.getElementById('dash-confianza-pct').textContent = data.confianza_promedio + '%';

    const baseOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true }
        }
      }
    };

    // 1. Estado
    if (chartEstado) chartEstado.destroy();
    const estado = data.por_estado;
    chartEstado = new Chart(document.getElementById('chart-estado'), {
      type: 'doughnut',
      data: {
        labels: ['Sanos', 'Posibles enfermedades'],
        datasets: [{ data: [estado.sanos, estado.enfermos], backgroundColor: [VERDE_CLARO, WARNING], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { ...baseOpts, cutout: '65%' }
    });

    // 2. Enfermedades
    if (chartEnfermedades) chartEnfermedades.destroy();
    const enfs = data.por_enfermedad;
    if (enfs.length > 0) {
      chartEnfermedades = new Chart(document.getElementById('chart-enfermedades'), {
        type: 'bar',
        data: {
          labels: enfs.map(e => e.nombre),
          datasets: [{ label: 'Frecuencia', data: enfs.map(e => e.cantidad), backgroundColor: WARNING, borderRadius: 6, borderSkipped: false }]
        },
        options: { ...baseOpts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 }, grid: { display: false } }, y: { grid: { display: false } } } }
      });
    } else {
      document.getElementById('chart-enfermedades').parentElement.innerHTML = '<p class="cargando">Sin enfermedades registradas aún.</p>';
    }

    // 3. Cultivos
    if (chartCultivos) chartCultivos.destroy();
    const cultivos = data.por_cultivo;
    if (cultivos.length > 0) {
      chartCultivos = new Chart(document.getElementById('chart-cultivos'), {
        type: 'doughnut',
        data: {
          labels: cultivos.map(c => c.cultivo),
          datasets: [{ data: cultivos.map(c => c.cantidad), backgroundColor: PALETTE, borderWidth: 0, hoverOffset: 6 }]
        },
        options: { ...baseOpts, cutout: '55%' }
      });
    } else {
      document.getElementById('chart-cultivos').parentElement.innerHTML = '<p class="cargando">Sin datos aún.</p>';
    }

    // 4. Actividad semanal
    if (chartActividad) chartActividad.destroy();
    const act = data.actividad_semanal;
    chartActividad = new Chart(document.getElementById('chart-actividad'), {
      type: 'line',
      data: {
        labels: act.map(a => formatearDia(a.dia)),
        datasets: [{
          label: 'Análisis',
          data: act.map(a => a.cantidad),
          borderColor: VERDE_CLARO,
          backgroundColor: 'rgba(82,183,136,0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: VERDE_PROFUNDO,
          pointRadius: 4
        }]
      },
      options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
    });

  } catch (err) { console.error('Dashboard error:', err); }
}

// ── Helpers ──────────────────────────────────────────────────────
function formatearFecha(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatearDia(d) {
  if (!d) return '';
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [,m, dia] = d.split('-');
  return `${parseInt(dia)} ${meses[parseInt(m)-1]}`;
}

// ── Admin ─────────────────────────────────────────────────────────
const esAdmin = document.querySelector('.nav-admin') !== null;

if (esAdmin) {
  document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => {
    document.getElementById('admin-form').style.display = 'flex';
    document.getElementById('btn-nuevo-usuario').style.display = 'none';
  });

  document.getElementById('btn-cancelar-usuario')?.addEventListener('click', () => {
    document.getElementById('admin-form').style.display = 'none';
    document.getElementById('btn-nuevo-usuario').style.display = 'block';
    limpiarFormAdmin();
  });

  document.getElementById('btn-guardar-usuario')?.addEventListener('click', guardarUsuario);

  // Solo números en clave
  document.getElementById('form-clave')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });
}

async function cargarAdmin() {
  await Promise.all([cargarAdminStats(), cargarAdminUsuarios()]);
}

async function cargarAdminStats() {
  const grid = document.getElementById('admin-stats-grid');
  try {
    const res  = await fetch('/admin/estadisticas');
    const data = await res.json();

    grid.innerHTML = `
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.total_analisis}</div>
        <div class="admin-stat-label">Análisis totales</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.total_usuarios}</div>
        <div class="admin-stat-label">Usuarios registrados</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.confianza_promedio}%</div>
        <div class="admin-stat-label">Confianza promedio global</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">🦠</div>
        <div class="admin-stat-label">Enfermedad más común</div>
        <div class="admin-stat-sub">${data.enfermedad_comun}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">🏆</div>
        <div class="admin-stat-label">Usuario más activo</div>
        <div class="admin-stat-sub">${data.usuario_mas_activo?.nombre || '—'} (${data.usuario_mas_activo?.cantidad || 0} análisis)</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.por_estado?.sanos || 0} / ${data.por_estado?.enfermos || 0}</div>
        <div class="admin-stat-label">Sanos / Con posibles enfermedades</div>
      </div>
    `;
  } catch { grid.innerHTML = '<div class="cargando">Error al cargar estadísticas.</div>'; }
}

async function cargarAdminUsuarios() {
  const lista = document.getElementById('admin-usuarios-lista');
  try {
    const res   = await fetch('/admin/usuarios');
    const users = await res.json();

    lista.innerHTML = users.map(u => `
      <div class="admin-usuario-row" id="user-row-${u.id}">
        <div class="admin-usuario-fila">
          <div class="admin-usuario-info">
            <div class="admin-usuario-nombre">${escaparHtml(u.nombre)}</div>
            <div class="admin-usuario-meta">
              ${u.total_analisis} análisis
              ${u.ultimo_analisis ? '· último: ' + formatearFecha(u.ultimo_analisis) : '· sin análisis'}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span class="admin-usuario-rol rol-${u.rol}">${u.rol === 'admin' ? '⚙️ Admin' : '🌱 Agricultor'}</span>
            <button class="btn-editar" data-uid="${u.id}" onclick="toggleEditarUsuario(${u.id})">Editar</button>
            <button class="btn-eliminar" data-uid="${u.id}" data-nombre="${escaparHtml(u.nombre)}" onclick="eliminarUsuario(${u.id}, this.dataset.nombre)">Eliminar</button>
          </div>
        </div>

        <!-- Form de edición inline, oculto por defecto -->
        <div class="admin-edit-form" id="edit-form-${u.id}" style="display:none;">
          <input type="text" id="edit-nombre-${u.id}" value="${escaparHtml(u.nombre)}" maxlength="30" class="admin-input" placeholder="Nombre completo"/>
          <input type="text" id="edit-clave-${u.id}" placeholder="Nueva clave (opcional, 8 dígitos)" maxlength="8" inputmode="numeric" class="admin-input"/>
          <div class="admin-form-btns">
            <button class="btn-principal btn-sm" onclick="guardarEdicionUsuario(${u.id})">Guardar cambios</button>
            <button class="btn-secundario btn-sm" onclick="toggleEditarUsuario(${u.id})">Cancelar</button>
          </div>
          <p class="admin-form-error" id="edit-error-${u.id}" style="display:none;"></p>
        </div>
      </div>
    `).join('');
  } catch { lista.innerHTML = '<div class="cargando">Error al cargar usuarios.</div>'; }
}

function toggleEditarUsuario(uid) {
  const form = document.getElementById(`edit-form-${uid}`);
  const yaAbierto = form.style.display !== 'none';
  // Cierra cualquier otro formulario de edición abierto
  document.querySelectorAll('.admin-edit-form').forEach(f => f.style.display = 'none');
  form.style.display = yaAbierto ? 'none' : 'flex';
  if (!yaAbierto) document.getElementById(`edit-nombre-${uid}`)?.focus();
}

async function guardarEdicionUsuario(uid) {
  const nombre  = document.getElementById(`edit-nombre-${uid}`).value.trim();
  const clave   = document.getElementById(`edit-clave-${uid}`).value.trim();
  const errEl   = document.getElementById(`edit-error-${uid}`);
  errEl.style.display = 'none';

  if (!nombre) { errEl.textContent = 'El nombre no puede estar vacío.'; errEl.style.display = 'block'; return; }
  if (nombre.length > 30) { errEl.textContent = 'El nombre no puede superar 30 caracteres.'; errEl.style.display = 'block'; return; }
  if (clave && clave.length !== 8) { errEl.textContent = 'La clave debe tener exactamente 8 dígitos.'; errEl.style.display = 'block'; return; }

  const payload = { nombre };
  if (clave) payload.clave = clave;

  try {
    const res  = await fetch(`/admin/usuarios/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    cargarAdminUsuarios();
    mostrarToast('success', 'Usuario actualizado', `Los datos de ${nombre} se guardaron correctamente.`);
  } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
}

async function guardarUsuario() {
  const nombre = document.getElementById('form-nombre').value.trim();
  const clave  = document.getElementById('form-clave').value.trim();
  const rol    = document.getElementById('form-rol').value;
  const errEl  = document.getElementById('admin-form-error');

  errEl.style.display = 'none';

  if (!nombre || !clave) { mostrarErrorAdmin('Completa todos los campos.'); return; }
  if (nombre.length > 30) { mostrarErrorAdmin('El nombre no puede superar 30 caracteres.'); return; }
  if (clave.length !== 8) { mostrarErrorAdmin('La clave debe tener exactamente 8 dígitos.'); return; }

  try {
    const res  = await fetch('/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, clave, rol })
    });
    const data = await res.json();
    if (!res.ok) { mostrarErrorAdmin(data.error); return; }

    document.getElementById('admin-form').style.display = 'none';
    document.getElementById('btn-nuevo-usuario').style.display = 'block';
    limpiarFormAdmin();
    cargarAdminUsuarios();
    mostrarToast('success', 'Usuario creado', `${nombre} ya puede acceder a la plataforma.`);
  } catch { mostrarErrorAdmin('Error de conexión.'); }
}

async function eliminarUsuario(uid, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Se borrarán también todos sus análisis.`)) return;
  try {
    const res = await fetch(`/admin/usuarios/${uid}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      document.getElementById(`user-row-${uid}`)?.remove();
      cargarAdminStats();
      mostrarToast('success', 'Usuario eliminado', `${nombre} y su historial fueron eliminados.`);
    } else {
      mostrarToast('error', 'No se pudo eliminar', data.error);
    }
  } catch { mostrarToast('error', 'Error de conexión', 'No se pudo eliminar el usuario.'); }
}

function mostrarErrorAdmin(msg) {
  const el = document.getElementById('admin-form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function limpiarFormAdmin() {
  document.getElementById('form-nombre').value = '';
  document.getElementById('form-clave').value  = '';
  document.getElementById('form-rol').value    = 'agricultor';
  document.getElementById('admin-form-error').style.display = 'none';
}

// ── Estado del sistema (widget en la sección Analizar) ─────────────
async function cargarEstadoSistema() {
  const stStatus = document.getElementById('st-status');
  const stModelo = document.getElementById('st-modelo');
  const stTiempo = document.getElementById('st-tiempo');
  const stTotal  = document.getElementById('st-total');
  if (!stStatus) return; // el widget no está en esta vista

  try {
    const res  = await fetch('/estado');
    const data = await res.json();
    if (!res.ok) { stStatus.textContent = 'No disponible'; return; }

    stStatus.textContent = data.online ? 'IA Online' : 'IA sin configurar';
    document.querySelector('#status-bar .status-dot')?.classList.toggle('online', data.online);

    stModelo.textContent = data.modelo || '—';
    stTiempo.textContent = data.ultimo_tiempo_s ? `${data.ultimo_tiempo_s}s` : 'Sin datos aún';
    stTotal.textContent  = data.total_analisis ?? 0;
  } catch {
    stStatus.textContent = 'Sin conexión';
  }
}

cargarEstadoSistema();
