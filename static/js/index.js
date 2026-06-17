// ── Referencias DOM ──────────────────────────────────────────────
const video        = document.getElementById('video');
const canvas       = document.getElementById('canvas');
const preview      = document.getElementById('preview');
const placeholder  = document.getElementById('placeholder');
const overlay      = document.getElementById('overlay');
const zonaOverlay  = document.getElementById('zona-overlay');
const zonaDescDiv  = document.getElementById('zona-descripcion');
const zonaDescText = document.getElementById('zona-desc-texto');
const btnCamara    = document.getElementById('btn-camara');
const btnFoto      = document.getElementById('btn-foto');
const btnReiniciar = document.getElementById('btn-reiniciar');
const inputArchivo = document.getElementById('input-archivo');
const btnLogout    = document.getElementById('btn-logout');

// Chart instances
let chartEstado = null, chartEnfermedades = null, chartCultivos = null, chartActividad = null;

// ── Paleta Chart.js ──────────────────────────────────────────────
const VERDE_PROFUNDO = '#1B4332';
const VERDE_CLARO    = '#52B788';
const TIERRA         = '#C8A96E';
const ERROR          = '#DC2626';
const WARNING        = '#D97706';
const PALETTE = ['#1B4332','#52B788','#C8A96E','#2D6A4F','#B7E4C7','#D97706','#DC2626','#95D5B2'];

// ── Navegación ───────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    link.classList.add('active');
    document.getElementById(`sec-${sec}`).classList.add('activa');
    if (sec === 'historial') cargarHistorial();
    if (sec === 'dashboard') cargarDashboard();
  });
});

// ── Logout ───────────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await fetch('/logout');
  window.location.href = '/';
});

// ── Cámara ───────────────────────────────────────────────────────
let stream = null;

btnCamara.addEventListener('click', activarCamara);

async function activarCamara() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.style.display  = 'block';
    placeholder.style.display = 'none';
    btnFoto.disabled     = false;
    btnCamara.style.display    = 'none';
  } catch (err) {
    alert('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
  }
}

btnFoto.addEventListener('click', () => {
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const b64 = canvas.toDataURL('image/jpeg', 0.9);

  preview.src = b64;
  preview.style.display = 'block';
  video.style.display   = 'none';
  if (stream) stream.getTracks().forEach(t => t.stop());

  btnFoto.style.display      = 'none';
  btnReiniciar.style.display = 'block';
  analizarImagen(b64);
});

inputArchivo.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    preview.src = b64;
    preview.style.display    = 'block';
    video.style.display      = 'none';
    placeholder.style.display = 'none';
    btnFoto.style.display    = 'none';
    btnCamara.style.display  = 'none';
    btnReiniciar.style.display = 'block';
    analizarImagen(b64);
  };
  reader.readAsDataURL(file);
});

btnReiniciar.addEventListener('click', reiniciar);

function reiniciar() {
  preview.style.display      = 'none';
  video.style.display        = 'none';
  placeholder.style.display  = 'flex';
  overlay.style.display      = 'none';
  zonaOverlay.style.display  = 'none';
  zonaDescDiv.style.display  = 'none';

  btnCamara.style.display    = 'block';
  btnFoto.style.display      = 'block';
  btnReiniciar.style.display = 'none';
  btnFoto.disabled = true;

  mostrarEstadoVacio();
  inputArchivo.value = '';
}

// ── Analizar imagen ──────────────────────────────────────────────
async function analizarImagen(b64) {
  overlay.style.display = 'flex';
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

    if (!res.ok) { mostrarError(data.error || 'Error al analizar.'); return; }

    // Imagen no válida
    if (data.valido === false) { mostrarInvalido(); return; }

    mostrarResultado(data);

  } catch (err) {
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

  // Barra de confianza
  renderConfianzaBar(data.confianza || 0, 'res-confianza-fill', 'res-confianza-pct');

  // Enfermedades
  const enfs = data.enfermedades || [];
  const bloqEnf  = document.getElementById('bloque-enfermedades');
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
  const explicacion = data.explicacion || [];
  const bloqExp = document.getElementById('bloque-explicacion');
  const listaExp = document.getElementById('res-explicacion');
  listaExp.innerHTML = '';
  if (explicacion.length > 0) {
    bloqExp.style.display = 'block';
    explicacion.forEach(obs => {
      listaExp.innerHTML += `<li>${obs}</li>`;
    });
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
  const contFuentes = document.getElementById('res-fuentes');
  contFuentes.innerHTML = '';
  fuentes.forEach(f => {
    contFuentes.innerHTML += `
      <a class="fuente-link" href="${f.url}" target="_blank" rel="noopener">
        <span class="fuente-institucion">${f.institucion}</span>
        <span class="fuente-titulo">${f.titulo}</span>
      </a>`;
  });
}

// ── Barra de confianza ───────────────────────────────────────────
function renderConfianzaBar(valor, fillId, pctId) {
  const fill = document.getElementById(fillId);
  const pct  = document.getElementById(pctId);
  fill.style.width = valor + '%';
  fill.className = 'confianza-fill';
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
function mostrarEstadoVacio() {
  ocultarTodos();
  document.getElementById('resultado-vacio').style.display = 'flex';
}
function mostrarInvalido() {
  ocultarTodos();
  document.getElementById('resultado-invalido').style.display = 'flex';
}
function mostrarError(msg) {
  ocultarTodos();
  document.getElementById('resultado-error').style.display = 'flex';
  document.getElementById('error-texto').textContent = msg;
}

// ── Historial ────────────────────────────────────────────────────
async function cargarHistorial() {
  const lista = document.getElementById('historial-lista');
  lista.innerHTML = '<div class="cargando">Cargando historial...</div>';
  try {
    const res  = await fetch('/historial');
    const data = await res.json();
    if (!data.length) { lista.innerHTML = '<div class="cargando">No hay análisis guardados aún.</div>'; return; }
    lista.innerHTML = data.map(item => `
      <div class="historial-card">
        <div class="historial-card-header">
          <div class="historial-cultivo">${item.cultivo || 'Desconocido'}</div>
          <div class="historial-fecha">${formatearFecha(item.fecha)}</div>
        </div>
        <div class="historial-maduracion">${item.maduracion || '—'}</div>
        <div>${(item.enfermedades||[]).map(e =>
          `<span class="historial-enfermedad-tag">⚠️ ${e.nombre}</span>`
        ).join('') || '<span class="historial-enfermedad-tag" style="background:#DCFCE7;color:#166534">✅ Sano</span>'}</div>
      </div>`).join('');
  } catch { lista.innerHTML = '<div class="cargando">Error al cargar historial.</div>'; }
}

// ── Dashboard ────────────────────────────────────────────────────
async function cargarDashboard() {
  try {
    const res  = await fetch('/estadisticas');
    const data = await res.json();

    // Total y confianza promedio
    document.getElementById('dash-total').textContent = data.total_analisis;
    renderConfianzaBar(data.confianza_promedio, 'dash-confianza-fill', null);
    document.getElementById('dash-confianza-pct').textContent = data.confianza_promedio + '%';

    const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 12 } } } };

    // 1. Estado de cultivos (doughnut)
    if (chartEstado) chartEstado.destroy();
    const estado = data.por_estado;
    chartEstado = new Chart(document.getElementById('chart-estado'), {
      type: 'doughnut',
      data: {
        labels: ['Sanos', 'Posibles enfermedades'],
        datasets: [{ data: [estado.sanos, estado.enfermos], backgroundColor: [VERDE_CLARO, WARNING], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { ...chartOpts, cutout: '65%' }
    });

    // 2. Posibles enfermedades (barra horizontal)
    if (chartEnfermedades) chartEnfermedades.destroy();
    const enfs = data.por_enfermedad;
    if (enfs.length > 0) {
      chartEnfermedades = new Chart(document.getElementById('chart-enfermedades'), {
        type: 'bar',
        data: {
          labels: enfs.map(e => e.nombre),
          datasets: [{ label: 'Frecuencia', data: enfs.map(e => e.cantidad), backgroundColor: WARNING, borderRadius: 6, borderSkipped: false }]
        },
        options: { ...chartOpts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 }, grid: { display: false } }, y: { grid: { display: false } } } }
      });
    } else {
      document.getElementById('chart-enfermedades').parentElement.innerHTML = '<p class="cargando">Sin enfermedades registradas aún.</p>';
    }

    // 3. Cultivos analizados (doughnut)
    if (chartCultivos) chartCultivos.destroy();
    const cultivos = data.por_cultivo;
    if (cultivos.length > 0) {
      chartCultivos = new Chart(document.getElementById('chart-cultivos'), {
        type: 'doughnut',
        data: {
          labels: cultivos.map(c => c.cultivo),
          datasets: [{ data: cultivos.map(c => c.cantidad), backgroundColor: PALETTE, borderWidth: 0, hoverOffset: 6 }]
        },
        options: { ...chartOpts, cutout: '55%' }
      });
    } else {
      document.getElementById('chart-cultivos').parentElement.innerHTML = '<p class="cargando">Sin datos aún.</p>';
    }

    // 4. Actividad semanal (línea)
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
      options: { ...chartOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
    });

  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatearDia(diaStr) {
  if (!diaStr) return '';
  const [,, d] = diaStr.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const mes = parseInt(diaStr.split('-')[1]) - 1;
  return `${parseInt(d)} ${meses[mes]}`;
}
