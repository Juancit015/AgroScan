// ── Sistema de notificaciones (toast) ───────────────────────────────
// Reutilizable en toda la plataforma: mostrarToast('success'|'error'|
// 'warning'|'info', 'Título', 'Descripción opcional', duraciónMs).
// Estilo "logro desbloqueado": entra deslizando desde la esquina, barra
// de progreso de auto-cierre, y botón para cerrar manualmente.
//
// Cola con tope de visibles: si se generan muchas notificaciones de
// golpe (ej. spam de clics en "Tomar foto" sin cámara), crear y animar
// docenas de elementos DOM en el mismo instante satura el hilo principal
// — el reloj de las animaciones CSS sigue corriendo en tiempo real
// aunque el navegador esté ocupado, así que para cuando por fin pinta un
// frame, varias animaciones ya "vencieron" sin haberse visto nunca en
// pantalla (se ven saltar directo al estado final). Limitar cuántos
// toasts existen a la vez evita esa saturación de raíz, además de ser
// mejor UX: una pared de 20 notificaciones apiladas nunca es legible.
const TOAST_ICONOS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
// Duración por defecto según tipo: las advertencias suelen traer texto
// más largo que conviene dar tiempo a leer (ej. "no se detectó cámara"),
// así que se quedan más tiempo en pantalla que un éxito/info rápido.
const TOAST_DURACION_POR_DEFECTO = { warning: 15000, error: 8000, success: 5000, info: 5000 };
const TOAST_MAX_VISIBLES = 3;
const toastContainer = document.getElementById('toast-container');
const colaToasts = [];
let toastsVisiblesActuales = 0;

function mostrarToast(tipo, titulo, descripcion = '', duracionMs = null) {
  if (!toastContainer) return;
  colaToasts.push({ tipo, titulo, descripcion, duracionMs });
  procesarColaToasts();
}

function procesarColaToasts() {
  while (toastsVisiblesActuales < TOAST_MAX_VISIBLES && colaToasts.length > 0) {
    crearToast(colaToasts.shift());
  }
}

function crearToast({ tipo, titulo, descripcion, duracionMs }) {
  toastsVisiblesActuales++;
  const duracionTotal = duracionMs ?? TOAST_DURACION_POR_DEFECTO[tipo] ?? 5000;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <div class="toast-icono">${TOAST_ICONOS[tipo] || 'ℹ️'}</div>
    <div class="toast-cuerpo">
      <div class="toast-titulo">${escaparHtml(titulo)}</div>
      ${descripcion ? `<div class="toast-descripcion">${escaparHtml(descripcion)}</div>` : ''}
    </div>
    <button class="toast-cerrar" type="button" aria-label="Cerrar notificación">✕</button>
    <div class="toast-progreso" style="animation-duration:${duracionTotal}ms"></div>
  `;

  const barraProgreso = toast.querySelector('.toast-progreso');
  let temporizador = null;
  let restante = duracionTotal;
  let inicio = 0;
  let cerrado = false; // evita que cerrar() se ejecute dos veces para el mismo toast

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    toast.classList.add('saliendo');

    // Eliminación garantizada aunque animationend no dispare (bajo carga
    // el navegador puede retrasarse). IMPORTANTE: filtramos por nombre de
    // animación porque con { once: true } genérico el evento de ENTRADA
    // (toastIn, 350ms) dispara primero si cerrar() se llama mientras la
    // entrada aún corre — causando la desaparición instantánea reportada.
    const DURACION_ANIMACION_SALIDA_MS = 350; // 0.25s + margen generoso
    const fallback = setTimeout(eliminar, DURACION_ANIMACION_SALIDA_MS);

    function eliminar() {
      clearTimeout(fallback);
      toast.removeEventListener('animationend', onAnimEnd); // limpieza
      if (!toast.isConnected) return;
      toast.remove();
      toastsVisiblesActuales = Math.max(0, toastsVisiblesActuales - 1);
      procesarColaToasts();
    }

    // NO usar { once: true } aquí: necesitamos filtrar por animationName
    // para ignorar el evento de toastIn y solo reaccionar a toastOut.
    function onAnimEnd(e) {
      if (e.animationName === 'toastOut') eliminar();
    }
    toast.addEventListener('animationend', onAnimEnd);
  };

  const iniciarTemporizador = () => {
    inicio = Date.now();
    temporizador = setTimeout(cerrar, restante);
    barraProgreso.style.animationPlayState = 'running';
  };

  // Al pausar, se descuenta el tiempo ya transcurrido del restante, así
  // que al reanudar el cierre ocurre exactamente cuando debía (y la
  // barra de progreso se congela/descongela en el mismo instante real,
  // quedando siempre sincronizada con el temporizador real).
  const pausarTemporizador = () => {
    clearTimeout(temporizador);
    restante -= Date.now() - inicio;
    barraProgreso.style.animationPlayState = 'paused';
  };

  toast.querySelector('.toast-cerrar').addEventListener('click', cerrar);
  toast.addEventListener('mouseenter', pausarTemporizador);
  toast.addEventListener('mouseleave', iniciarTemporizador);

  toastContainer.appendChild(toast);
  iniciarTemporizador();
}

function escaparHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// ── Inicialización de estado ─────────────────────────────────────
(function initState() {
  const seccionGuardada = localStorage.getItem('frutia_seccion_actual');
  if (seccionGuardada && seccionGuardada !== 'analizador') {
    const link = document.querySelector(`.nav-link[data-section="${seccionGuardada}"], .nav-link-movil[data-section="${seccionGuardada}"]`);
    if (link) {
      document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`.nav-link[data-section="${seccionGuardada}"], .nav-link-movil[data-section="${seccionGuardada}"]`).forEach(l => l.classList.add('active'));
      document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
      document.getElementById(`sec-${seccionGuardada}`).classList.add('activa');
      if (seccionGuardada === 'historial') cargarHistorial();
      if (seccionGuardada === 'dashboard') cargarDashboard();
      if (seccionGuardada === 'admin') cargarAdmin();
      if (seccionGuardada === 'perfil') cargarPerfil();
    }
  }

  const analisisGuardado = localStorage.getItem('frutia_ultimo_analisis');
  if (analisisGuardado) {
    try {
      const data = JSON.parse(analisisGuardado);
      window.ultimoDiagnosticoData = data;
      const prv = document.getElementById('preview');
      const ph  = document.getElementById('placeholder');
      const btn = document.getElementById('btn-reiniciar');
      if (data.imagen_path && prv && ph) {
        prv.src = '/static/' + data.imagen_path;
        prv.style.display = 'block';
        ph.style.display = 'none';
      }
      if (btn) btn.style.display = 'block';
      if (!seccionGuardada || seccionGuardada === 'analizador') {
        document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
        document.getElementById('sec-analizador').classList.add('activa');
        mostrarResultado(data, true);
      }
    } catch (e) {}
  }
})();

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
      ctx.font         = '13px Montserrat, sans-serif';
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
  if(navToggle) navToggle.classList.add('abierto');
  navOverlay.classList.add('visible');
}
function cerrarMenuMovil() {
  if(navToggle) navToggle.classList.remove('abierto');
  navOverlay.classList.remove('visible');
}

if(navToggle) {
  navToggle.addEventListener('click', () => {
    navOverlay.classList.contains('visible') ? cerrarMenuMovil() : abrirMenuMovil();
  });
}

// Clic en el fondo oscuro (fuera del panel) cierra el menú; el panel en sí
// detiene la propagación (ver onclick inline en el HTML) para que tocar
// un link o el botón Salir no cierre el drawer antes de procesar la acción.
navOverlay.addEventListener('click', cerrarMenuMovil);

// ── Navegación ───────────────────────────────────────────────────
// Selecciona los links de AMBAS barras (escritorio + drawer móvil), ya
// que comparten la clase .nav-link; así el estado "activa" queda
// sincronizado sin importar desde cuál se haya navegado.
document.querySelectorAll('.nav-link, .nav-link-movil[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    if(!sec) return;
    localStorage.setItem('frutia_seccion_actual', sec);
    document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`.nav-link[data-section="${sec}"], .nav-link-movil[data-section="${sec}"]`).forEach(l => l.classList.add('active'));
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.getElementById(`sec-${sec}`).classList.add('activa');
    if (sec === 'analizador' && window.ultimoDiagnosticoData && document.getElementById('resultado-contenido').style.display !== 'flex') {
      mostrarResultado(window.ultimoDiagnosticoData, true);
    }
    if (sec === 'historial') cargarHistorial();
    if (sec === 'dashboard') cargarDashboard();
    if (sec === 'admin') cargarAdmin();
    if (sec === 'perfil') cargarPerfil();
    cerrarMenuMovil();
  });
});

// ── Logout ───────────────────────────────────────────────────────
async function cerrarSesion() {
  localStorage.removeItem('frutia_ultimo_analisis');
  localStorage.removeItem('frutia_chat');
  localStorage.removeItem('frutia_chat_count');
  localStorage.removeItem('frutia_seccion_actual');
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

// ── Bloqueo de controles durante captura/análisis ───────────────────
// Mientras haya una captura o un análisis en curso, todos los controles
// que podrían iniciar OTRO proceso quedan deshabilitados. Esto evita por
// completo la condición de carrera: sin esto, el usuario podía pulsar
// "Nueva foto" o "Tomar foto" mientras la petición anterior seguía en
// vuelo, y cuando esa respuesta tardía llegaba, sobrescribía a la fuerza
// lo que el usuario ya había hecho mientras tanto (resultado viejo +
// "Cámara no iniciada" mostrados a la vez).
let analisisEnCurso = false;
let solicitudActual = 0; // se incrementa en cada análisis; sirve para
                          // descartar respuestas que ya quedaron obsoletas

const labelGaleria = document.querySelector('label[for="input-galeria"]');

function bloquearControlesCaptura(bloqueado) {
  analisisEnCurso = bloqueado;
  btnTomarFoto.disabled  = bloqueado;
  inputCamara.disabled   = bloqueado;
  inputGaleria.disabled  = bloqueado;
  btnReiniciar.disabled  = bloqueado;
  labelGaleria?.classList.toggle('deshabilitada', bloqueado);

  // Feedback claro de estado: durante el análisis el botón "Nueva foto"
  // cambia a "Analizando…" para que el usuario entienda por qué no
  // responde — no simplemente se ve apagado sin explicación.
  if (bloqueado) {
    btnReiniciar.dataset.textoOriginal = btnReiniciar.textContent;
    btnReiniciar.textContent = '⏳ Analizando…';
  } else if (btnReiniciar.dataset.textoOriginal) {
    btnReiniciar.textContent = btnReiniciar.dataset.textoOriginal;
    delete btnReiniciar.dataset.textoOriginal;
  }
}

btnTomarFoto.addEventListener('click', async () => {
  if (analisisEnCurso) return; // defensa adicional, el botón ya estaría disabled
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
  if (!file || analisisEnCurso) return;
  localStorage.removeItem('frutia_ultimo_analisis');
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
  if (analisisEnCurso) return;
  localStorage.removeItem('frutia_ultimo_analisis');
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
  const miSolicitud = ++solicitudActual;
  bloquearControlesCaptura(true);

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

    // Guarda de seguridad: si mientras esta petición estaba en vuelo se
    // disparó OTRA más reciente (no debería poder pasar con los controles
    // bloqueados, pero se deja como defensa en profundidad), se descarta
    // esta respuesta obsoleta para que nunca pise el estado actual.
    if (miSolicitud !== solicitudActual) return;

    overlay.style.display = 'none';
    if (!res.ok)              { mostrarError(data.error || 'Error al analizar.'); return; }
    if (data.valido === false) { mostrarInvalido(); return; }

    mostrarResultado(data);
    cargarEstadoSistema(); // refresca "última respuesta" y total de análisis
  } catch {
    if (miSolicitud !== solicitudActual) return;
    overlay.style.display = 'none';
    mostrarError('Error de conexión con el servidor.');
  } finally {
    if (miSolicitud === solicitudActual) bloquearControlesCaptura(false);
  }
}

// ── Mostrar resultado ────────────────────────────────────────────
function guardarChat() {
  try {
    localStorage.setItem('frutia_chat', JSON.stringify(window.chatHistorial));
    localStorage.setItem('frutia_chat_count', window.chatPregCount || 0);
  } catch (e) {}
}

function mostrarResultado(data, restaurar) {
  window.ultimoDiagnosticoData = data;
  try { localStorage.setItem('frutia_ultimo_analisis', JSON.stringify(data)); } catch (e) {}
  const contMsg = document.getElementById('chat-mensajes');
  if (restaurar) {
    try {
      const chatGuardado = localStorage.getItem('frutia_chat');
      window.chatHistorial = chatGuardado ? JSON.parse(chatGuardado).slice(-15) : [];
      window.chatPregCount = parseInt(localStorage.getItem('frutia_chat_count') || '0', 10);
      contMsg.innerHTML = '';
      window.chatHistorial.forEach(m => chatAgregarBurbuja(m.texto, m.rol === 'user' ? 'usuario' : 'ia'));
      if (window.chatPregCount >= 15) {
        chatAgregarBurbuja('⚠️ Has alcanzado el límite de 15 preguntas para esta conversación. Iniciá un **nuevo análisis** para seguir consultando.', 'ia');
        document.getElementById('chat-input').disabled = true;
        document.getElementById('chat-btn-enviar').disabled = true;
        document.getElementById('chat-sugerencias').innerHTML = '';
      }
    } catch (e) { window.chatHistorial = []; window.chatPregCount = 0; contMsg.innerHTML = ''; }
  } else {
    window.chatHistorial = [];
    window.chatPregCount = 0;
    contMsg.innerHTML = '';
    guardarChat();
  }
  mostrarSugerenciasChat(data);
  ocultarTodos();
  document.getElementById('resultado-contenido').style.display = 'flex';

  document.getElementById('res-cultivo').textContent    = data.cultivo    || 'Cultivo desconocido';
  document.getElementById('res-maduracion').textContent = data.maduracion || '—';
  
  // Tratamiento
  const txtTratamiento = (data.tratamiento || '').trim();
  document.getElementById('res-tratamiento').textContent = txtTratamiento && txtTratamiento !== '—' 
    ? txtTratamiento 
    : 'No requiere tratamiento fitosanitario especial.';
    
  document.getElementById('res-advertencia').textContent = data.advertencia || '';

  // Recomendación de consumo
  const bloqueRecomendacion = document.getElementById('bloque-recomendacion');
  const resRecomendacion = document.getElementById('res-recomendacion');
  const recConsumo = (data.recomendacion_consumo || '').trim();
  
  if (recConsumo && recConsumo.toLowerCase() !== 'sin contraindicaciones relevantes') {
    resRecomendacion.textContent = recConsumo;
    bloqueRecomendacion.style.display = 'block';
  } else {
    // Si no hay una recomendación de alerta específica, mostrar mensaje de que es seguro
    resRecomendacion.textContent = 'Sin contraindicaciones ni precauciones especiales detectadas.';
    bloqueRecomendacion.style.display = 'block';
  }

  renderConfianzaBar(data.confianza || 0, 'res-confianza-fill', 'res-confianza-pct');

  // Enfermedades
  const enfs    = data.enfermedades || [];
  const bloqEnf = document.getElementById('bloque-enfermedades');
  const bloqSano = document.getElementById('bloque-sano');
  const contEnf  = document.getElementById('res-enfermedades');
  contEnf.innerHTML = '';
  
  // Alertas Regionales
  const alertasContainer = document.getElementById('alertas-regionales-container');
  if (data.alertas_regionales && data.alertas_regionales.length > 0) {
    alertasContainer.style.display = 'block';
    alertasContainer.innerHTML = data.alertas_regionales.map(alerta => `
      <div class="alerta-regional-banner">
        <div class="alerta-regional-header">
          <span>🚨</span> Alerta en tu zona
        </div>
        <p class="alerta-regional-texto">
          Hemos detectado <strong>${alerta.casos} casos</strong> recientes de <strong>${alerta.enfermedad}</strong> en <strong>${alerta.localidad}</strong> durante los últimos ${alerta.dias} días. Te recomendamos aplicar medidas preventivas y avisar a tu comunidad.
        </p>
      </div>
    `).join('');
  } else {
    alertasContainer.style.display = 'none';
    alertasContainer.innerHTML = '';
  }

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
  const fuentesDiv = document.getElementById('res-fuentes');
  fuentesDiv.innerHTML = fuentes.map(f => {
    // La IA suele alucinar URLs que están rotas o no existen. 
    // En su lugar, construimos una búsqueda directa en Google con el título y la institución.
    const query = encodeURIComponent(`${f.institucion} ${f.titulo}`);
    const searchUrl = `https://www.google.com/search?q=${query}`;
    return `
      <a href="${searchUrl}" target="_blank" class="fuente-link" title="Buscar documento en Google">
        <span class="fuente-inst">${f.institucion}</span>
        <span class="fuente-titulo">${f.titulo}</span>
        <span class="fuente-search">🔍</span>
      </a>
    `;
  }).join('');
}

// ── Chat de Seguimiento ──────────────────────────────────────────
window.chatHistorial = [];
window.chatPregCount = 0;

function mostrarSugerenciasChat(data) {
  const cont = document.getElementById('chat-sugerencias');
  if (!cont) return;
  if (!data || !data.cultivo) { cont.innerHTML = ''; return; }
  const cultivo = data.cultivo.toLowerCase();
  const enfNombres = (data.enfermedades || []).map(e => (e.nombre || '').toLowerCase());
  const tieneEnf = enfNombres.length > 0 && enfNombres[0] !== 'sano' && enfNombres[0] !== '';
  const base = [
    `¿Cada cuánto debo regar ${cultivo}?`,
    `¿Qué plagas atacan a ${cultivo}?`,
    `¿Cuánto sol necesita ${cultivo} al día?`
  ];
  const enf = tieneEnf ? [
    `¿El tratamiento es seguro para consumo humano?`,
    `¿Cómo prevenir esta enfermedad en el futuro?`,
    `¿Qué condiciones climáticas favorecen esta enfermedad?`
  ] : [];
  const limiteAlcanzado = window.chatPregCount >= 15;
  const todas = [...base, ...enf].slice(0, 3);
  cont.innerHTML = todas.map(q =>
    `<span class="chat-chip${limiteAlcanzado ? ' chip-disabled' : ''}" onclick="${limiteAlcanzado ? '' : "enviarSugerencia('" + q.replace(/'/g, "\\'") + "')"}">${q}</span>`
  ).join('');
}

function enviarSugerencia(pregunta) {
  if (window.chatOcupado) return;
  document.getElementById('chat-input').value = pregunta;
  enviarChatMensaje();
}

function generarSugerenciasDinamicas() {
  const cont = document.getElementById('chat-sugerencias');
  if (!cont || !window.ultimoDiagnosticoData) return;
  const cultivo = (window.ultimoDiagnosticoData.cultivo || '').toLowerCase();
  const hist = window.chatHistorial || [];
  const pregHechas = hist.filter(m => m.rol === 'user').map(m => m.texto.toLowerCase());
  const ultimoUser = pregHechas.length ? pregHechas[pregHechas.length - 1] : '';
  const ultimoAI = hist.length && hist[hist.length - 1].rol === 'assistant'
    ? hist[hist.length - 1].texto.toLowerCase() : '';
  const contexto = ultimoUser + ' ' + ultimoAI;

  const temas = [
    { id: 'riego', pal: ['riego','agua','regar','humedad','sequía','mojar','secado'],
      qs: [`¿Cómo saber si ${cultivo} necesita agua?`,`¿El exceso de agua daña ${cultivo}?`,`¿Cada cuánto regar en temporada de lluvia?`] },
    { id: 'plaga', pal: ['plaga','plagas','insecto','bicho','pesticida','insecticida','oruga','ácaro'],
      qs: [`¿Cómo controlar plagas en ${cultivo} sin químicos?`,`¿Cada cuánto aplicar insecticida?`,`¿Qué señales indican una plaga?`] },
    { id: 'sol', pal: ['sol','luz','sombra','solares','fotosíntesis'],
      qs: [`¿${cultivo} necesita sol directo o media sombra?`,`¿Qué pasa si ${cultivo} recibe poca luz?`] },
    { id: 'suelo', pal: ['suelo','tierra','abono','fertilizante','nutrientes','ph','sustrato'],
      qs: [`¿Qué abono recomiendas para ${cultivo}?`,`¿Cada cuánto fertilizar ${cultivo}?`,`¿Cómo mejorar el suelo?`] },
    { id: 'enfermedad', pal: ['enfermedad','enfermedades','hongo','virus','bacterias','prevenir','síntomas'],
      qs: [`¿Cómo prevenir enfermedades en ${cultivo}?`,`¿Qué hacer si la enfermedad avanza?`,`¿El tratamiento recomendado es suficiente?`] },
    { id: 'tratamiento', pal: ['tratamiento','fungicida','producto','aplicar','dosis','químico','orgánico'],
      qs: [`¿Cada cuánto aplicar el tratamiento?`,`¿Cuánto tiempo esperar después del tratamiento?`,`¿Se puede mezclar con otros productos?`] },
    { id: 'cosecha', pal: ['cosecha','cosechar','maduración','maduro','listo','recoger'],
      qs: [`¿Cómo saber si está listo para cosechar?`,`¿Se puede cosechar antes de tiempo?`,`¿Cómo almacenar ${cultivo} después de cosechar?`] },
    { id: 'poda', pal: ['poda','podar','ramas','hojas','tallo'],
      qs: [`¿Cómo podar ${cultivo} sin dañarlo?`,`¿Cuándo es mejor podar ${cultivo}?`] },
    { id: 'clima', pal: ['clima','temperatura','lluvia','helada','calor','frio','estación'],
      qs: [`¿${cultivo} resiste heladas?`,`¿Qué temperatura daña a ${cultivo}?`] },
    { id: 'consumo', pal: ['consumo','comer','alimento','seguro','tóxico','lavar','cocinar'],
      qs: [`¿Cómo lavar ${cultivo} antes de consumir?`,`¿Cuánto esperar para consumir tras el tratamiento?`] }
  ];

  const bancoGeneral = [
    `¿Qué cuidados necesita ${cultivo} a diario?`,
    `¿Cada cuánto debo regar ${cultivo}?`,
    `¿Qué plagas atacan a ${cultivo}?`,
    `¿Cuándo se cosecha ${cultivo}?`,
    `¿${cultivo} necesita mucho sol?`,
    `¿Qué tipo de suelo es mejor para ${cultivo}?`,
    `¿${cultivo} se da bien en maceta?`,
    `¿Cuánto tiempo vive ${cultivo}?`,
    `¿Se puede plantar ${cultivo} en cualquier época?`,
    `¿El ${cultivo} necesita poda frecuente?`
  ];

  // Detectar temas del último mensaje
  const temasDetectados = temas.filter(t => t.pal.some(p => contexto.includes(p))).map(t => t.id);
  let sugerencias = [];

  // Priorizar temas detectados (hasta 2 temas)
  for (const id of temasDetectados) {
    const t = temas.find(x => x.id === id);
    if (!t) continue;
    sugerencias.push(...t.qs.filter(q => !pregHechas.some(p => q.toLowerCase().slice(0,25) === p.slice(0,25))));
    if (sugerencias.length >= 4) break;
  }

  // Si faltan, llenar con banco general (excluyendo preguntas ya hechas)
  if (sugerencias.length < 3) {
    const restantes = bancoGeneral.filter(q =>
      !pregHechas.some(p => q.toLowerCase().slice(0,25) === p.slice(0,25)) &&
      !sugerencias.includes(q)
    );
    sugerencias.push(...restantes);
  }

  const limiteAlcanzado = window.chatPregCount >= 15;
  cont.innerHTML = sugerencias.slice(0, 3).map(q =>
    `<span class="chat-chip${limiteAlcanzado ? ' chip-disabled' : ''}" onclick="${limiteAlcanzado ? '' : "enviarSugerencia('" + q.replace(/'/g, "\\'") + "')"}">${q}</span>`
  ).join('');
}

function chatAgregarBurbuja(texto, tipo) {
  const cont = document.getElementById('chat-mensajes');
  const div = document.createElement('div');
  div.className = `chat-burbuja chat-burbuja-${tipo}`;
  let html = texto
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*\* /gm, ' • ')
    .replace(/\n/g, '<br>');
  div.innerHTML = html;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

async function enviarChatMensaje() {
  if (window.chatOcupado) return;
  const input  = document.getElementById('chat-input');
  const btn    = document.getElementById('chat-btn-enviar');
  const pregunta = input.value.trim();

  if (!pregunta) return;
  if (!window.ultimoDiagnosticoData) return;

  if (window.chatPregCount >= 15) {
    chatAgregarBurbuja('⚠️ Has alcanzado el límite de 15 preguntas para esta conversación. Iniciá un **nuevo análisis** para seguir consultando.', 'ia');
    document.getElementById('chat-input').disabled = true;
    document.getElementById('chat-btn-enviar').disabled = true;
    document.getElementById('chat-sugerencias').innerHTML = '';
    mostrarToast('warning', 'Límite alcanzado', 'Llegaste a las 15 preguntas. Iniciá un nuevo análisis para seguir.', 6000);
    return;
  }

  window.chatOcupado = true;

  // Mostrar mensaje del usuario
  chatAgregarBurbuja(pregunta, 'usuario');
  window.chatHistorial.push({ rol: 'user', texto: pregunta });
  window.chatHistorial = window.chatHistorial.slice(-15);
  window.chatPregCount++;
  guardarChat();
  input.value = '';
  input.disabled = true;
  btn.disabled   = true;

  // Indicador "Escribiendo..."
  const typing = chatAgregarBurbuja('🌿 Escribiendo...', 'typing');

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pregunta,
        contexto: {
          cultivo:       window.ultimoDiagnosticoData.cultivo,
          enfermedades:  window.ultimoDiagnosticoData.enfermedades,
          tratamiento:   window.ultimoDiagnosticoData.tratamiento,
        },
        mensajes: window.chatHistorial.slice(0, -1) // sin la última pregunta, ya va aparte
      })
    });
    const data = await res.json();
    typing.remove();

    if (data.respuesta) {
      chatAgregarBurbuja(data.respuesta, 'ia');
      window.chatHistorial.push({ rol: 'assistant', texto: data.respuesta });
      window.chatHistorial = window.chatHistorial.slice(-15);
      guardarChat();
      if (window.chatPregCount >= 15) {
        chatAgregarBurbuja('⚠️ Has alcanzado el límite de **15 preguntas** para esta conversación. Iniciá un **nuevo análisis** para seguir consultando.', 'ia');
        document.getElementById('chat-input').disabled = true;
        document.getElementById('chat-btn-enviar').disabled = true;
        document.getElementById('chat-sugerencias').innerHTML = '';
        mostrarToast('warning', 'Límite alcanzado', 'Llegaste a las 15 preguntas. Iniciá un nuevo análisis para seguir.', 6000);
      } else {
        generarSugerenciasDinamicas();
      }
    } else {
      chatAgregarBurbuja('Hubo un problema al obtener la respuesta. Intenta de nuevo.', 'ia');
    }
  } catch {
    typing.remove();
    chatAgregarBurbuja('Error de conexión. Verifica tu internet e intenta de nuevo.', 'ia');
  } finally {
    input.disabled = false;
    btn.disabled   = false;
    input.focus();
    window.chatOcupado = false;
  }
}

// ── Exportar a PDF ───────────────────────────────────────────────

function descargarPDF() {
  const data = window.ultimoDiagnosticoData;
  if (!data) return;

  // Si no tenemos el ID del análisis guardado en BD, no podemos usar el endpoint backend.
  if (!data.analisis_id) {
    mostrarToast('error', 'No se puede exportar', 'Este análisis no fue guardado. Intenta de nuevo.');
    return;
  }

  const btn = document.getElementById('btn-descargar-pdf');
  btn.textContent = '⏳ Generando...';
  btn.disabled = true;

  // Usa el endpoint backend /reporte-pdf/<id> (WeasyPrint).
  // El PDF se genera 100% en el servidor: no captura el DOM del navegador
  // ni depende del tamaño de la ventana — el resultado es siempre idéntico.
  const nombreArchivo = `FrutIA_Reporte_${(data.cultivo || 'Cultivo').replace(/\s+/g, '_')}.pdf`;

  fetch(`/reporte-pdf/${data.analisis_id}`)
    .then(async res => {
      if (!res.ok) {
        // Intentar leer el mensaje de error del servidor
        let msg = `Error del servidor (${res.status})`;
        try {
          const body = await res.json();
          if (body.error) msg = body.error;
        } catch (_) {}
        throw new Error(msg);
      }
      return res.blob();
    })
    .then(blob => {
      // Crea un enlace temporal y lo "clica" para forzar la descarga
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = '📄 Exportar a PDF';
      btn.disabled = false;
    })
    .catch(err => {
      console.error('Error al generar PDF:', err);
      btn.textContent = '📄 Exportar a PDF';
      btn.disabled = false;
      mostrarToast('error', 'Error al exportar', err.message || 'Hubo un problema al generar el reporte PDF.');
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
let historialPaginaActual = 1;
const HISTORIAL_POR_PAGINA = 15;
let historialFiltradoCache = [];
let historialModoSeleccion = false;
let historialSeleccionados = new Set();

function toggleVistaHistorial() {
  const lista = document.getElementById('historial-lista');
  const iconLista = document.getElementById('icon-lista');
  const iconCuadricula = document.getElementById('icon-cuadricula');
  if (lista.classList.contains('historial-vista-compacta')) {
    lista.classList.remove('historial-vista-compacta');
    iconLista.style.display = 'block';
    iconCuadricula.style.display = 'none';
  } else {
    lista.classList.add('historial-vista-compacta');
    iconLista.style.display = 'none';
    iconCuadricula.style.display = 'block';
  }
}

function toggleModoSeleccion() {
  historialModoSeleccion = !historialModoSeleccion;
  historialSeleccionados.clear();
  const lista = document.getElementById('historial-lista');
  const btn = document.getElementById('btn-seleccionar-historial');
  lista.classList.toggle('historial-modo-seleccion', historialModoSeleccion);
  btn.style.background = historialModoSeleccion ? 'var(--verde-profundo)' : '';
  btn.style.color = historialModoSeleccion ? 'white' : '';
  actualizarBarraSeleccion();
  renderHistorial(false); // re-render para mostrar/ocultar checkboxes
}

function cancelarSeleccion() {
  historialModoSeleccion = false;
  historialSeleccionados.clear();
  const lista = document.getElementById('historial-lista');
  const btn = document.getElementById('btn-seleccionar-historial');
  lista.classList.remove('historial-modo-seleccion');
  btn.style.background = '';
  btn.style.color = '';
  actualizarBarraSeleccion();
  renderHistorial(false);
}

function toggleSeleccionItem(id, e) {
  if (e) e.stopPropagation();
  if (historialSeleccionados.has(id)) {
    historialSeleccionados.delete(id);
  } else {
    historialSeleccionados.add(id);
  }
  const card = document.querySelector(`.historial-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('seleccionada', historialSeleccionados.has(id));
    const checkbox = card.querySelector('.historial-checkbox');
    if (checkbox) checkbox.checked = historialSeleccionados.has(id);
  }
  actualizarBarraSeleccion();
}

function actualizarBarraSeleccion() {
  const barra = document.getElementById('historial-barra-accion');
  const texto = document.getElementById('barra-seleccion-texto');
  const n = historialSeleccionados.size;
  if (historialModoSeleccion && n > 0) {
    barra.classList.add('visible');
    texto.textContent = `${n} registro${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}`;
  } else {
    barra.classList.remove('visible');
  }
}

function confirmarEliminarSeleccion() {
  const ids = [...historialSeleccionados];
  if (!ids.length) return;
  const n = ids.length;
  mostrarConfirmacionEliminar(
    `¿Eliminar ${n} registro${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}?`,
    `Esta acción es permanente y no se puede deshacer. Se eliminarán ${n} análisis de tu historial.`,
    async () => {
      try {
        const res = await fetch('/historial/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        });
        const data = await res.json();
        if (res.ok) {
          window.historialData = (window.historialData || []).filter(i => !ids.includes(i.id));
          cancelarSeleccion();
          renderHistorial(true);
          mostrarToast('success', 'Registros eliminados', data.mensaje);
        } else {
          mostrarToast('error', 'Error', data.error);
        }
      } catch { mostrarToast('error', 'Error de conexión', 'No se pudieron eliminar los registros.'); }
    }
  );
}

function eliminarAnalisisUnico(id, nombre) {
  mostrarConfirmacionEliminar(
    `¿Eliminar el análisis de ${nombre}?`,
    'Esta acción es permanente. Se eliminará este diagnóstico de tu historial.',
    async () => {
      try {
        const res = await fetch('/historial/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [id] })
        });
        const data = await res.json();
        if (res.ok) {
          window.historialData = (window.historialData || []).filter(i => i.id !== id);
          cerrarModalHistorial();
          renderHistorial(true);
          mostrarToast('success', 'Registro eliminado', data.mensaje);
        } else {
          mostrarToast('error', 'Error', data.error);
        }
      } catch { mostrarToast('error', 'Error de conexión', 'No se pudo eliminar el registro.'); }
    }
  );
}

function resetModalConfirmacion() {
  document.getElementById('modal-confirmacion-input-wrap').style.display = 'none';
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  btnConfirmar.disabled = false;
}

function mostrarConfirmacionEliminar(titulo, descripcion, onConfirmar) {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');
  resetModalConfirmacion();
  texto.innerHTML = `<strong style="display:block;margin-bottom:0.5rem;">${titulo}</strong><span style="font-size:0.9rem;color:#64748b;">${descripcion}</span>`;
  modal.style.display = 'flex';
  btnCancelar.onclick = () => { modal.style.display = 'none'; };
  btnConfirmar.onclick = async () => { modal.style.display = 'none'; await onConfirmar(); };
}

function cargarMasHistorial() {
  historialPaginaActual++;
  renderHistorial(false);
}

function getFechaGrupo(fechaStr) {
  if (!fechaStr) return 'Desconocido';
  const date = new Date(fechaStr);
  if (isNaN(date)) return fechaStr.split(' ')[0];
  
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  
  const dString = date.toLocaleDateString();
  if (dString === hoy.toLocaleDateString()) return 'Hoy';
  if (dString === ayer.toLocaleDateString()) return 'Ayer';
  
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderHistorial(reiniciarPagina = false) {
  const lista = document.getElementById('historial-lista');
  const busquedaVal = document.getElementById('historial-buscar').value.toLowerCase();
  const estadoVal = document.getElementById('historial-filtro-estado').value;
  const data = window.historialData || [];

  if (reiniciarPagina) {
    historialPaginaActual = 1;
    historialFiltradoCache = data.filter(item => {
      // 1. Filtro texto
      const textMatch = !busquedaVal || 
                        (item.cultivo || '').toLowerCase().includes(busquedaVal) ||
                        (item.enfermedades || []).some(e => e.nombre.toLowerCase().includes(busquedaVal));
      if (!textMatch) return false;
      
      // 2. Filtro estado
      if (estadoVal === 'sanos' && (item.enfermedades && item.enfermedades.length > 0)) return false;
      if (estadoVal === 'enfermos' && (!item.enfermedades || item.enfermedades.length === 0)) return false;
      
      return true;
    });
  }

  const itemsAMostrar = historialFiltradoCache.slice(0, historialPaginaActual * HISTORIAL_POR_PAGINA);

  if (!itemsAMostrar.length) { 
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin análisis aún</h3><p>No se encontraron análisis registrados. Analizá un cultivo para verlo aquí.</p></div>'; 
    return; 
  }

  let html = '';
  let ultimoGrupo = null;

  itemsAMostrar.forEach(item => {
    const grupo = getFechaGrupo(item.fecha);
    if (grupo !== ultimoGrupo) {
      html += `<div class="historial-fecha-header">${grupo}</div>`;
      ultimoGrupo = grupo;
    }

    const imgHtml = item.imagen_path
      ? `<div class="historial-img-wrap"><img src="/static/${item.imagen_path}" alt="${item.cultivo}" class="historial-img"/></div>`
      : `<div class="historial-img-wrap historial-img-placeholder">📷</div>`;

    const enfs = item.enfermedades || [];
    const estaEnfermo = enfs.length > 0;
    const enfsHtml = estaEnfermo
      ? enfs.map(e => `<span class="historial-enfermedad-tag">⚠️ ${e.nombre}</span>`).join('')
      : '<span class="historial-enfermedad-tag historial-tag-sano" style="background:#d1fae5;color:#065f46;">✅ Sano</span>';

    const borderColor = estaEnfermo ? '#ef4444' : 'var(--verde-claro)';

    html += `
      <div class="historial-card ${historialSeleccionados.has(item.id) ? 'seleccionada' : ''}" data-id="${item.id}"
           onclick="${historialModoSeleccion ? `toggleSeleccionItem(${item.id}, event)` : `abrirDetalleHistorial(${item.id})`}"
           style="border-left-color:${borderColor}; border-bottom-color:${borderColor}; cursor:pointer;">
        <input type="checkbox" class="historial-checkbox" ${historialSeleccionados.has(item.id) ? 'checked' : ''}
               onclick="toggleSeleccionItem(${item.id}, event)" />
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
  });

  lista.innerHTML = html;

  // Mostrar u ocultar botón "Cargar más"
  const wrapCargar = document.getElementById('historial-cargar-mas-wrap');
  if (wrapCargar) {
    wrapCargar.style.display = itemsAMostrar.length < historialFiltradoCache.length ? 'block' : 'none';
  }
}

function abrirDetalleHistorial(id) {
  const data = (window.historialData || []).find(item => item.id === id);
  if (!data) return;

  const modal = document.getElementById('modal-historial-analisis');
  const cuerpo = document.getElementById('modal-historial-cuerpo');

  const enfs = data.enfermedades || [];
  const enfsHtml = enfs.length > 0 
    ? enfs.map(e => `
        <div style="background:#FEF3C7; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #F59E0B;">
          <h4 style="margin:0; color:#92400E; display:flex; justify-content:space-between; align-items:center;">
            ${e.nombre} 
            <span style="font-size:0.75rem; background:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">${e.severidad}</span>
          </h4>
          <p style="margin:0.5rem 0 0; font-size:0.9rem; line-height:1.4;">${e.descripcion}</p>
        </div>
      `).join('')
    : `<div style="background:#d1fae5; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #10b981;">
         <h4 style="margin:0; color:#065f46;">✅ Sano</h4>
         <p style="margin:0.5rem 0 0; font-size:0.9rem;">No se detectaron enfermedades.</p>
       </div>`;

  const imgHtml = data.imagen_path
      ? `<img src="/static/${data.imagen_path}" style="width:100%; height:220px; object-fit:cover; border-radius:8px; margin-bottom:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.1);"/>`
      : '';

  cuerpo.innerHTML = `
    <h2 style="margin:0 0 0.2rem 0; color:var(--verde-profundo); font-family:var(--font-sans); font-size:1.5rem;">${data.cultivo || 'Desconocido'}</h2>
    <p style="color:var(--texto-suave); font-size:0.85rem; margin-bottom:1.5rem;">${formatearFecha(data.fecha)}</p>
    
    ${imgHtml}
    
    <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">
      <div style="flex:1; background:#f8fafc; padding:1rem; border-radius:8px; border:1px solid #e2e8f0; min-width:140px;">
        <strong style="display:block; font-size:0.75rem; color:var(--texto-suave); margin-bottom:0.2rem; text-transform:uppercase; letter-spacing:0.5px;">Estado de Maduración</strong>
        <span style="font-weight:700; color:var(--verde-medio); font-size:1.1rem;">${data.maduracion || '—'}</span>
      </div>
      <div style="flex:1; background:#f8fafc; padding:1rem; border-radius:8px; border:1px solid #e2e8f0; min-width:140px;">
        <strong style="display:block; font-size:0.75rem; color:var(--texto-suave); margin-bottom:0.2rem; text-transform:uppercase; letter-spacing:0.5px;">Confianza de la IA</strong>
        <span style="font-weight:800; font-size:1.1rem; color:${data.confianza >= 80 ? 'var(--verde)' : data.confianza >= 60 ? '#d97706' : 'var(--rojo)'};">${data.confianza}%</span>
      </div>
    </div>

    <h3 style="margin-bottom:0.8rem; font-size:1.1rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">Diagnóstico</h3>
    ${enfsHtml}

    ${(data.zona_afectada && data.zona_afectada.descripcion && enfs.length > 0) ? `
      <div style="background:#fff7ed; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #f97316; margin-top:-0.5rem;">
        <strong style="font-size:0.8rem; color:#c2410c; text-transform:uppercase; letter-spacing:0.5px;">📍 Zona Afectada</strong>
        <p style="margin:0.3rem 0 0; font-size:0.9rem; color:#9a3412;">${data.zona_afectada.descripcion}</p>
      </div>
    ` : ''}

    ${(data.explicacion && data.explicacion.length > 0) ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">🔍 ¿Por qué este diagnóstico?</h3>
      <ul style="margin:0 0 1rem; padding-left:1.2rem; display:flex; flex-direction:column; gap:0.4rem;">
        ${(data.explicacion || []).map(obs => `<li style="font-size:0.9rem; color:#334155; line-height:1.5;">${obs}</li>`).join('')}
      </ul>
    ` : ''}

    <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">Tratamiento Recomendado</h3>
    <p style="font-size:0.95rem; line-height:1.6; color:#334155; white-space:pre-wrap;">${data.tratamiento || 'No requiere tratamiento fitosanitario especial.'}</p>

    ${data.recomendacion_consumo ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; color:#b45309; border-bottom:2px solid #fef3c7; padding-bottom:0.4rem;">Recomendación de Consumo</h3>
      <p style="font-size:0.95rem; line-height:1.6; color:#92400E; background:#fffbeb; padding:1rem; border-radius:8px; border-left:4px solid #f59e0b;">${data.recomendacion_consumo}</p>
    ` : ''}

    ${(data.fuentes && data.fuentes.length > 0) ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">📚 Fuentes Consultadas</h3>
      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
        ${(data.fuentes || []).map(f => {
          const q = encodeURIComponent(f.institucion + ' ' + f.titulo);
          return '<a href="https://www.google.com/search?q=' + q + '" target="_blank" style="display:flex; gap:0.5rem; align-items:center; padding:0.6rem 0.8rem; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; text-decoration:none; color:inherit; font-size:0.85rem;"><span style=\'font-weight:700; color:var(--verde-profundo); flex-shrink:0;\'>' + f.institucion + '</span><span style=\'color:var(--texto-suave);\'>🔍 ' + f.titulo + '</span></a>';
        }).join('')}
      </div>
    ` : ''}

    <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid #f1f5f9; display:flex; gap:0.8rem; justify-content:space-between; flex-wrap:wrap; align-items:center;">
      <button onclick="eliminarAnalisisUnico(${data.id}, '${(data.cultivo||'Registro').replace(/'/g, "\\'")}')"
        style="padding:0.5rem 1rem; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:8px; cursor:pointer; font-family:var(--font-sans); font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
        🗑️ Eliminar registro
      </button>
      <div style="display:flex; gap:0.8rem;">
        <button onclick="cerrarModalHistorial()" style="padding:0.6rem 1.2rem; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; font-family:var(--font-sans); color:#334155; font-size:0.9rem;">Cerrar</button>
        <a href="/reporte-pdf/${data.id}" target="_blank" class="btn-secundario btn-pdf" style="text-decoration:none;">📄 Exportar PDF</a>
      </div>
    </div>
  `;

  document.body.style.overflow = 'hidden';
  modal.style.display = 'flex';
}

function cerrarModalHistorial() {
  document.getElementById('modal-historial-analisis').style.display = 'none';
  document.body.style.overflow = '';
}

function observarScrollHistorial() {
  const trigger = document.getElementById('historial-scroll-trigger');
  if (!trigger) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      historialPaginaActual++;
      renderHistorial(false);
    }
  });
  observer.observe(trigger);
}

async function cargarHistorial() {
  const lista = document.getElementById('historial-lista');
  const skeletonHTML = `
    <div class="skeleton-card skeleton">
      <div class="skeleton-img skeleton"></div>
      <div class="skeleton-text skeleton"></div>
      <div class="skeleton-text skeleton short"></div>
      <div class="skeleton-text skeleton tall"></div>
    </div>
  `.repeat(4);
  lista.innerHTML = skeletonHTML;
  try {
    const res  = await fetch('/historial');
    const data = await res.json();
    
    window.historialData = data;
    
    if (!data.length) { 
      lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Aún no hay análisis</h3><p>No hay análisis guardados aún. Analizá un cultivo y los resultados aparecerán acá.</p></div>'; 
      return; 
    }

    renderHistorial(true);
  } catch { lista.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>Error al cargar historial.</p></div>'; }
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
          labels: { font: { family: 'Montserrat', size: 11 }, padding: 12, usePointStyle: true }
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
      document.getElementById('chart-enfermedades').parentElement.innerHTML = '<div class="empty-state is-chart"><div class="empty-state-icon">🩺</div><h3>Sin enfermedades</h3><p>Aún no hay enfermedades registradas.</p></div>';
    }

    // 3. Cultivos — Top 5 + "Otros" (patrón estándar de dashboards escalables)
    if (chartCultivos) chartCultivos.destroy();
    const cultivos = data.por_cultivo;
    if (cultivos.length > 0) {
      // "Otros" recibe un gris neutro para que quede visualmente claro que
      // es una agregación y no un cultivo real con identidad propia.
      const coloresCultivos = cultivos.map((c, i) =>
        c.cultivo === 'Otros' ? '#9CA3AF' : PALETTE[i % PALETTE.length]
      );

      // Si hay "Otros", mostramos una nota informativa debajo del gráfico
      // con cuántos tipos agrupa — información útil que no cabe en el chart.
      const nOtros = cultivos.find(c => c.cultivo === 'Otros')?._n_otros;
      const notaEl = document.getElementById('chart-cultivos-nota');
      if (notaEl) notaEl.textContent = nOtros
        ? `Agrupa ${nOtros} tipo${nOtros > 1 ? 's' : ''} de cultivo con menor frecuencia.`
        : '';

      chartCultivos = new Chart(document.getElementById('chart-cultivos'), {
        type: 'doughnut',
        data: {
          labels: cultivos.map(c => c.cultivo),
          datasets: [{
            data: cultivos.map(c => c.cantidad),
            backgroundColor: coloresCultivos,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          ...baseOpts,
          cutout: '55%',
          plugins: {
            ...baseOpts.plugins,
            tooltip: {
              callbacks: {
                // Añade contexto extra en "Otros": "X tipos con menor frecuencia"
                afterLabel: (ctx) => {
                  const item = cultivos[ctx.dataIndex];
                  return item._n_otros
                    ? `(${item._n_otros} tipo${item._n_otros > 1 ? 's' : ''} agrupados)`
                    : '';
                }
              }
            }
          }
        }
      });
    } else {
      document.getElementById('chart-cultivos').parentElement.innerHTML = '<div class="empty-state is-chart"><div class="empty-state-icon">🌱</div><h3>Sin cultivos</h3><p>Aún no hay datos de cultivos.</p></div>';
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

let adminUsersCache = []; // Caché para búsqueda y filtros locales

const regionesDataAdmin = {
  "La Libertad": ["Paiján", "Trujillo", "Chepén", "Pacasmayo", "Ascope"],
  "Lima": ["Lima Central", "Cañete", "Huaral", "Barranca", "Huaura"],
  "Piura": ["Piura", "Sullana", "Paita", "Talara", "Sechura"],
  "Ica": ["Ica", "Chincha", "Pisco", "Nazca", "Palpa"],
  "Cusco": ["Cusco", "Urubamba", "Quillabamba", "Sicuani", "Calca"],
  "Arequipa": ["Arequipa", "Camaná", "Mollendo", "Chivay", "Caravelí"]
};

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

  // Filtros y buscador
  document.getElementById('admin-buscar')?.addEventListener('input', renderUsuariosFiltrados);
  document.getElementById('admin-filtro-region')?.addEventListener('change', function() {
    const region = this.value;
    const locSelect = document.getElementById('admin-filtro-localidad');
    locSelect.innerHTML = '<option value="">Todas las localidades</option>';
    if (region && regionesDataAdmin[region]) {
      locSelect.disabled = false;
      regionesDataAdmin[region].forEach(loc => locSelect.innerHTML += `<option value="${loc}">${loc}</option>`);
    } else {
      locSelect.disabled = true;
    }
    renderUsuariosFiltrados();
  });
  document.getElementById('admin-filtro-localidad')?.addEventListener('change', renderUsuariosFiltrados);

  // Poblar regiones en los select de filtro y formulario
  const selectRegFiltro = document.getElementById('admin-filtro-region');
  const selectRegForm = document.getElementById('form-region');
  for (const region in regionesDataAdmin) {
    if(selectRegFiltro) selectRegFiltro.innerHTML += `<option value="${region}">${region}</option>`;
    if(selectRegForm) selectRegForm.innerHTML += `<option value="${region}">${region}</option>`;
  }

  selectRegForm?.addEventListener('change', function() {
    const region = this.value;
    const locSelect = document.getElementById('form-localidad');
    locSelect.innerHTML = '<option value="">Localidad...</option>';
    if (region && regionesDataAdmin[region]) {
      locSelect.disabled = false;
      regionesDataAdmin[region].forEach(loc => locSelect.innerHTML += `<option value="${loc}">${loc}</option>`);
    } else {
      locSelect.disabled = true;
    }
  });

  // Solo números en clave
  document.getElementById('form-clave')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });
  
  // Cerrar modal
  document.getElementById('btn-cerrar-modal')?.addEventListener('click', () => {
    document.getElementById('modal-usuario').style.display = 'none';
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
  } catch { grid.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>Error al cargar estadísticas.</p></div>'; }
}

async function cargarAdminUsuarios() {
  const lista = document.getElementById('admin-usuarios-lista');
  const skeletonHTML = `
    <div class="admin-usuario-row" style="background:#fff; border-color:transparent;">
      <div class="skeleton-text skeleton" style="margin:0; width:40%;"></div>
      <div class="skeleton-text skeleton short" style="margin-top:8px;"></div>
    </div>
  `.repeat(3);
  lista.innerHTML = skeletonHTML;
  try {
    const res   = await fetch('/admin/usuarios');
    adminUsersCache = await res.json();
    renderUsuariosFiltrados();
  } catch { lista.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>Error al cargar usuarios.</p></div>'; }
}

function renderUsuariosFiltrados() {
  const lista = document.getElementById('admin-usuarios-lista');
  if(!lista) return;
  const textoBusqueda = (document.getElementById('admin-buscar')?.value || '').toLowerCase();
  const filtroRegion = document.getElementById('admin-filtro-region')?.value || '';
  const filtroLocalidad = document.getElementById('admin-filtro-localidad')?.value || '';
  
  // Obtener el nombre del admin actual para mostrar "(Tú)"
  // Extraemos el primer nodo de texto de .usuario-nombre para evitar el badge
  const elemNombre = document.querySelector('.usuario-nombre');
  const nombreAdminActual = elemNombre ? elemNombre.childNodes[0].textContent.trim() : '';

  let filtrados = adminUsersCache.filter(u => {
    const coincideTexto = u.nombre.toLowerCase().includes(textoBusqueda) || u.dni.includes(textoBusqueda);
    const coincideRegion = !filtroRegion || u.region === filtroRegion;
    const coincideLocalidad = !filtroLocalidad || u.localidad === filtroLocalidad;
    return coincideTexto && coincideRegion && coincideLocalidad;
  });

  // Ordenar: Admins primero, luego orden alfabético
  filtrados.sort((a, b) => {
    if (a.rol === 'admin' && b.rol !== 'admin') return -1;
    if (a.rol !== 'admin' && b.rol === 'admin') return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Sin resultados</h3><p>No se encontraron usuarios con esos filtros.</p></div>';
    return;
  }

  lista.innerHTML = filtrados.map(u => {
    const esElMismo = (u.nombre === nombreAdminActual);
    const badgeTu = esElMismo ? ' <span style="font-size:0.8rem;color:var(--verde-medio);font-weight:700;">(Tú)</span>' : '';
    
    return `
    <div class="admin-usuario-row" id="user-row-${u.id}">
      <div class="admin-usuario-fila" onclick="abrirDetallesUsuario(event, ${u.id})" style="cursor: pointer;">
        <div class="admin-usuario-info">
          <div class="admin-usuario-nombre">${escaparHtml(u.nombre)}${badgeTu}</div>
          <div class="admin-usuario-meta">
            ${u.region && u.localidad ? u.localidad + ', ' + u.region + ' · ' : ''}
            ${u.total_analisis} análisis
            ${u.ultimo_analisis ? '· último: ' + formatearFecha(u.ultimo_analisis) : '· sin análisis'}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;" onclick="event.stopPropagation()">
          <span class="admin-usuario-rol rol-${u.rol}">${u.rol === 'admin' ? '⚙️ Admin' : '🌱 Agricultor'}</span>
          <button class="btn-editar" data-uid="${u.id}" onclick="toggleEditarUsuario(${u.id})">Editar</button>
          ${!esElMismo ? `<button class="btn-eliminar" data-uid="${u.id}" data-nombre="${escaparHtml(u.nombre)}" onclick="eliminarUsuario(${u.id}, this.dataset.nombre)">Eliminar</button>` : ''}
        </div>
      </div>

      <!-- Form de edición inline -->
      <div class="admin-edit-form" id="edit-form-${u.id}" style="display:none;" onclick="event.stopPropagation()">
        <input type="text" id="edit-nombre-${u.id}" value="${escaparHtml(u.nombre)}" maxlength="30" class="admin-input" placeholder="Nombre completo"/>
        <input type="text" id="edit-clave-${u.id}" placeholder="Nueva clave (opcional, 8 dígitos)" maxlength="8" inputmode="numeric" class="admin-input"/>
        <div class="admin-form-btns" style="margin-top: 0.5rem;">
          <button class="btn-principal btn-sm" onclick="guardarEdicionUsuario(${u.id})">Guardar cambios</button>
          <button class="btn-secundario btn-sm" onclick="toggleEditarUsuario(${u.id})">Cancelar</button>
        </div>
        <p class="admin-form-error" id="edit-error-${u.id}" style="display:none;"></p>
      </div>
    </div>
  `}).join('');
}

async function abrirDetallesUsuario(event, uid) {
  // Solo abrir si no se hizo clic en los botones de editar o form
  if (event.target.closest('.btn-editar') || event.target.closest('.btn-eliminar') || event.target.closest('.admin-edit-form')) {
    return;
  }
  
  const modal = document.getElementById('modal-usuario');
  const cuerpo = document.getElementById('modal-cuerpo');
  modal.style.display = 'flex';
  const skeletonHTML = `
    <div style="padding:1rem;">
      <div class="skeleton-text skeleton" style="width:60%; height:24px;"></div>
      <div class="skeleton-text skeleton tall" style="width:100%; height:80px;"></div>
      <div class="skeleton-text skeleton tall" style="width:100%; height:80px;"></div>
    </div>
  `;
  cuerpo.innerHTML = skeletonHTML;
  
  try {
    const res = await fetch(`/admin/usuarios/${uid}/historial`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    const u = data.perfil;
    const inicial = u.nombre.charAt(0).toUpperCase();
    
    const historialHtml = data.historial.length === 0 
      ? '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin análisis</h3><p>Este usuario aún no ha realizado ningún análisis.</p></div>'
      : '<div class="modal-historial-lista">' + data.historial.map(item => {
          const enf = item.enfermedades.length ? `⚠️ ${item.enfermedades[0].nombre}` : '✅ Sano';
          const fecha = formatearFecha(item.fecha);
          const imgSrc = item.imagen_path ? `/static/${item.imagen_path}` : '';
          const imgHtml = imgSrc ? `<img src="${imgSrc}" alt="Cultivo">` : '<div style="width:80px;height:80px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;">📷</div>';
          return `
            <div class="modal-historial-item">
              ${imgHtml}
              <div class="modal-historial-item-info">
                <h4>${item.cultivo || 'Desconocido'}</h4>
                <div style="font-size:0.8rem;color:var(--texto-suave);margin-bottom:0.2rem;">${fecha}</div>
                <div style="font-size:0.85rem;font-weight:600;color:var(--verde-medio);">${enf} (Confianza: ${item.confianza||0}%)</div>
              </div>
            </div>
          `;
        }).join('') + '</div>';
        
    cuerpo.innerHTML = `
      <div class="modal-header">
        <div class="modal-avatar">${inicial}</div>
        <div class="modal-header-info">
          <h3>${escaparHtml(u.nombre)}</h3>
          <p>${u.localidad ? u.localidad + ', ' : ''}${u.region || ''} — Rol: ${u.rol}</p>
        </div>
      </div>
      <h4 style="margin-bottom:1rem;font-family:var(--font-sans);">Historial de Peticiones</h4>
      ${historialHtml}
    `;
  } catch(e) {
    cuerpo.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>No se pudo cargar la información del usuario.</p></div>';
  }
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
  const region = document.getElementById('form-region').value;
  const localidad = document.getElementById('form-localidad').value;
  const rol    = document.getElementById('form-rol').value;
  const errEl  = document.getElementById('admin-form-error');

  errEl.style.display = 'none';

  if (!nombre || !clave) { mostrarErrorAdmin('Completa nombre y clave.'); return; }
  if (nombre.length > 30) { mostrarErrorAdmin('El nombre no puede superar 30 caracteres.'); return; }
  if (clave.length !== 8) { mostrarErrorAdmin('La clave debe tener exactamente 8 dígitos.'); return; }

  try {
    const res  = await fetch('/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, clave, rol, region, localidad })
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

function eliminarUsuario(uid, nombre) {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');

  resetModalConfirmacion();
  texto.innerHTML = `¿Estás seguro de que deseas eliminar a <strong>${nombre}</strong>?<br><br>Se borrarán también todos sus análisis de forma permanente.`;
  modal.style.display = 'flex';

  btnCancelar.onclick = () => {
    modal.style.display = 'none';
  };

  btnConfirmar.onclick = async () => {
    modal.style.display = 'none';
    try {
      const res = await fetch(`/admin/usuarios/${uid}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        document.getElementById(`user-row-${uid}`)?.remove();
        // Remove from cache
        adminUsersCache = adminUsersCache.filter(u => u.id !== uid);
        cargarAdminStats();
        mostrarToast('success', 'Usuario eliminado', `${nombre} y su historial fueron eliminados.`);
      } else {
        mostrarToast('error', 'No se pudo eliminar', data.error);
      }
    } catch { mostrarToast('error', 'Error de conexión', 'No se pudo eliminar el usuario.'); }
  };
}

function mostrarErrorAdmin(msg) {
  const el = document.getElementById('admin-form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function limpiarFormAdmin() {
  document.getElementById('form-nombre').value = '';
  document.getElementById('form-clave').value  = '';
  document.getElementById('form-region').value = '';
  const loc = document.getElementById('form-localidad');
  loc.innerHTML = '<option value="">Localidad...</option>';
  loc.disabled = true;
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

// ── Perfil ────────────────────────────────────────────────────────
const regionesDataPerfil = {
  "La Libertad": ["Paiján", "Trujillo", "Chepén", "Pacasmayo", "Ascope"],
  "Lima": ["Lima Central", "Cañete", "Huaral", "Barranca", "Huaura"],
  "Piura": ["Piura", "Sullana", "Paita", "Talara", "Sechura"],
  "Ica": ["Ica", "Chincha", "Pisco", "Nazca", "Palpa"],
  "Cusco": ["Cusco", "Urubamba", "Quillabamba", "Sicuani", "Calca"],
  "Arequipa": ["Arequipa", "Camaná", "Mollendo", "Chivay", "Caravelí"]
};

let perfilData = null;

async function cargarPerfil() {
  const cont = document.getElementById('perfil-contenido');
  cont.innerHTML = '<div class="cargando">Cargando perfil...</div>';
  try {
    const res = await fetch('/perfil');
    if (!res.ok) { cont.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>Error al cargar perfil.</p></div>'; return; }
    perfilData = await res.json();
    renderPerfil(perfilData);
  } catch { cont.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>Error</h3><p>Error de conexión.</p></div>'; }
}

function renderPerfil(p) {
  const inicial = (p.nombre || '?')[0].toUpperCase();
  const avatarHtml = p.avatar_path
    ? `<img src="/static/${p.avatar_path}?t=${Date.now()}" alt="Avatar">`
    : `<span>${inicial}</span>`;

  const fechaReg = p.fecha_registro
    ? new Date(p.fecha_registro).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const esAdmin = p.rol === 'admin';
  const rolLabel = esAdmin ? '⚙️ Administrador' : '🌱 Agricultor';

  document.getElementById('perfil-contenido').innerHTML = `
    <div class="perfil-card">
      <div class="perfil-banner"></div>
      <div class="perfil-header">
        <div class="perfil-avatar" id="perfil-avatar-click" title="Cambiar foto">
          ${avatarHtml}
          <div class="perfil-avatar-overlay">✎</div>
        </div>
        <div class="perfil-header-info">
          <div class="perfil-nombre" id="perfil-nombre-display">${escaparHtml(p.nombre)}</div>
          <span class="perfil-rol-badge ${esAdmin ? 'es-admin' : ''}">${rolLabel}</span>
        </div>
      </div>

      <div class="perfil-stats">
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${p.total_analisis || 0}</div>
          <div class="perfil-stat-label">Análisis</div>
        </div>
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${fechaReg}</div>
          <div class="perfil-stat-label">Miembro desde</div>
        </div>
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${p.localidad || p.region || '—'}</div>
          <div class="perfil-stat-label">Ubicación</div>
        </div>
      </div>

      <div class="perfil-section-title">Idioma / Simi</div>
      <div class="perfil-lista">
        <div class="perfil-item">
          <span class="perfil-item-icono">🌐</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">Idioma / Simi</span>
            <div class="perfil-valor" id="perfil-campo-idioma">
              <span id="perfil-valor-idioma">${p.idioma === 'qu' ? '🇵🇪 Quechua' : '🇪🇸 Español'}</span>
              <button class="perfil-editar-btn" onclick="editarIdiomaPerfil()">Editar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="perfil-section-title">Información personal</div>
      <div class="perfil-lista">
        <div class="perfil-item">
          <span class="perfil-item-icono">👤</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">Nombre</span>
            <div class="perfil-valor" id="perfil-campo-nombre">
              <span id="perfil-valor-nombre">${escaparHtml(p.nombre)}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('nombre')">Editar</button>
            </div>
          </div>
        </div>
        <div class="perfil-item">
          <span class="perfil-item-icono">📍</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">Región</span>
            <div class="perfil-valor" id="perfil-campo-region">
              <span id="perfil-valor-region">${p.region || '—'}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('region')">Editar</button>
            </div>
          </div>
        </div>
        <div class="perfil-item">
          <span class="perfil-item-icono">🏘️</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">Localidad</span>
            <div class="perfil-valor" id="perfil-campo-localidad">
              <span id="perfil-valor-localidad">${p.localidad || '—'}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('localidad')">Editar</button>
            </div>
          </div>
        </div>
      </div>

      <p class="perfil-error" id="perfil-error"></p>

      <div class="perfil-zona-peligro">
        <div class="perfil-zona-peligro-label">Zona de peligro</div>
        <div class="perfil-acciones">
          <button class="btn-principal btn-sm" onclick="cerrarSesion()" style="flex:1;">🚪 Cerrar sesión</button>
          <button class="perfil-btn-peligro" onclick="eliminarMiCuenta()" style="flex:1;">🗑️ Eliminar cuenta</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('perfil-avatar-click').addEventListener('click', () => {
    document.getElementById('input-avatar').click();
  });
}

function editarCampoPerfil(campo) {
  const contEl = document.getElementById(`perfil-campo-${campo}`);
  const valorActual = perfilData[campo] || '';

  const acciones = () => `
    <div class="perfil-edit-acciones">
      <button type="button" class="perfil-btn-guardar" id="perfil-btn-guardar-${campo}" title="Guardar">✓</button>
      <button type="button" class="perfil-btn-cancelar" id="perfil-btn-cancelar-${campo}" title="Cancelar">✕</button>
    </div>`;

  if (campo === 'region') {
    const wrap = document.createElement('div');
    wrap.className = 'perfil-edit-row';
    wrap.innerHTML = `<select class="perfil-select" id="perfil-edit-${campo}"><option value="">Selecciona...</option>${
      Object.keys(regionesDataPerfil).map(r => `<option value="${r}" ${r === valorActual ? 'selected' : ''}>${r}</option>`).join('')
    }</select>${acciones()}`;
    contEl.innerHTML = '';
    contEl.appendChild(wrap);
    const select = document.getElementById(`perfil-edit-${campo}`);
    select.focus();

    document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => {
      const val = select.value;
      if (val && val !== perfilData.region) {
        perfilData.localidad = '';
      }
      guardarCampoPerfil(campo, val);
    });
    document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);
    return;
  }

  if (campo === 'localidad') {
    const region = perfilData.region;
    if (!region || !regionesDataPerfil[region]) {
      mostrarToast('warning', 'Primero selecciona una región');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'perfil-edit-row';
    wrap.innerHTML = `<select class="perfil-select" id="perfil-edit-${campo}"><option value="">Selecciona...</option>${
      regionesDataPerfil[region].map(l => `<option value="${l}" ${l === valorActual ? 'selected' : ''}>${l}</option>`).join('')
    }</select>${acciones()}`;
    contEl.innerHTML = '';
    contEl.appendChild(wrap);
    const select = document.getElementById(`perfil-edit-${campo}`);
    select.focus();

    document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => guardarCampoPerfil(campo, select.value));
    document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'perfil-edit-row';
  wrap.innerHTML = `<input type="text" class="perfil-input" id="perfil-edit-${campo}" maxlength="30">${acciones()}`;
  contEl.innerHTML = '';
  contEl.appendChild(wrap);
  const input = document.getElementById(`perfil-edit-${campo}`);
  input.value = valorActual;
  input.focus();
  input.select();

  document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => guardarCampoPerfil(campo, input.value.trim()));
  document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') guardarCampoPerfil(campo, input.value.trim());
    if (e.key === 'Escape') cancelarEdicionPerfil();
  });
}

async function guardarCampoPerfil(campo, valor) {
  const payload = {};
  payload[campo] = valor;
  const errEl = document.getElementById('perfil-error');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.style.display = 'block';
      return;
    }
    perfilData[campo] = valor;
    renderPerfil(perfilData);
    if (campo === 'nombre') {
      document.querySelectorAll('.usuario-nombre').forEach(el => {
        el.childNodes[0].textContent = valor;
      });
    }
    const msgs = { nombre: 'Nombre guardado', region: 'Región actualizada', localidad: 'Localidad actualizada' };
    mostrarToast('success', msgs[campo] || 'Perfil actualizado');
  } catch {
    errEl.textContent = 'Error de conexión.';
    errEl.style.display = 'block';
  }
}

function cancelarEdicionPerfil() {
  if (perfilData) renderPerfil(perfilData);
}

function eliminarMiCuenta() {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');
  const inputWrap = document.getElementById('modal-confirmacion-input-wrap');
  const input = document.getElementById('modal-confirmacion-input');

  texto.innerHTML = `¿Estás seguro de eliminar tu cuenta?<br><br>Se borrarán <strong>todos tus análisis</strong> de forma permanente. Esta acción no se puede deshacer.`;
  inputWrap.style.display = 'block';
  input.value = '';
  btnConfirmar.disabled = true;
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);

  input.oninput = () => {
    btnConfirmar.disabled = input.value.trim().toUpperCase() !== 'ELIMINAR';
  };

  btnCancelar.onclick = () => { modal.style.display = 'none'; resetModalConfirmacion(); };
  btnConfirmar.onclick = async () => {
    if (input.value.trim().toUpperCase() !== 'ELIMINAR') return;
    modal.style.display = 'none';
    resetModalConfirmacion();
    try {
      const res = await fetch('/perfil', { method: 'DELETE' });
      if (res.ok) {
        mostrarToast('success', 'Cuenta eliminada', 'Tu cuenta y datos han sido eliminados.');
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } else {
        const data = await res.json();
        mostrarToast('error', 'Error', data.error);
      }
    } catch { mostrarToast('error', 'Error de conexión'); }
  };
}

// ── Idioma (Quechua / Español) ─────────────────────────────────────
function editarIdiomaPerfil() {
  const contEl = document.getElementById('perfil-campo-idioma');
  const langActual = perfilData.idioma || 'es';

  const wrap = document.createElement('div');
  wrap.className = 'perfil-edit-row';
  wrap.style.gap = '0.5rem';
  wrap.innerHTML = `
    <button class="perfil-lang-opt ${langActual === 'es' ? 'active' : ''}" data-lang="es" onclick="this.parentElement.querySelectorAll('.perfil-lang-opt').forEach(b=>b.classList.remove('active'));this.classList.add('active')">🇪🇸 Español</button>
    <button class="perfil-lang-opt ${langActual === 'qu' ? 'active' : ''}" data-lang="qu" onclick="this.parentElement.querySelectorAll('.perfil-lang-opt').forEach(b=>b.classList.remove('active'));this.classList.add('active')">🇵🇪 Quechua</button>
    <div class="perfil-edit-acciones">
      <button type="button" class="perfil-btn-guardar" id="perfil-btn-guardar-idioma" title="Guardar">✓</button>
      <button type="button" class="perfil-btn-cancelar" onclick="cancelarEdicionPerfil()" title="Cancelar">✕</button>
    </div>`;
  contEl.innerHTML = '';
  contEl.appendChild(wrap);

  document.getElementById('perfil-btn-guardar-idioma').addEventListener('click', async () => {
    const selected = wrap.querySelector('.perfil-lang-opt.active');
    if (!selected) return;
    const lang = selected.dataset.lang;
    try {
      const res = await fetch('/perfil/idioma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idioma: lang })
      });
      const data = await res.json();
      if (res.ok) {
        perfilData.idioma = lang;
        localStorage.setItem('frutia_idioma', lang);
        renderPerfil(perfilData);
        mostrarToast('success', '🌐 Idioma cambiado a ' + (lang === 'qu' ? 'Quechua' : 'Español'));
      } else {
        mostrarToast('error', 'Error', data.error);
      }
    } catch {
      mostrarToast('error', 'Error de conexión');
    }
  });
}
