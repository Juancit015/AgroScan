// ── Referencias al DOM ──────────────────────────────────────────
const inputDni    = document.getElementById('dni');
const btnLogin    = document.getElementById('btn-login');
const spinner     = document.getElementById('spinner');
const btnTexto    = document.getElementById('btn-texto');
const errorMsg    = document.getElementById('error-msg');
const errorTexto  = document.getElementById('error-texto');

// ── Solo permite números en el input ────────────────────────────
inputDni.addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '');
  ocultarError();
});

// ── Login al presionar Enter ─────────────────────────────────────
inputDni.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') iniciarSesion();
});

// ── Login al hacer clic en el botón ─────────────────────────────
btnLogin.addEventListener('click', iniciarSesion);

// ── Función principal de login ───────────────────────────────────
async function iniciarSesion() {
  const dni = inputDni.value.trim();

  if (!dni) {
    mostrarError('Ingresa tu número de DNI');
    inputDni.focus();
    return;
  }

  if (dni.length < 8) {
    mostrarError('El DNI debe tener 8 dígitos');
    inputDni.focus();
    return;
  }

  // Estado de carga
  setEstadoCargando(true);
  ocultarError();

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni })
    });

    const data = await res.json();

    if (res.ok) {
      // Login exitoso
      btnTexto.textContent = `¡Bienvenido, ${data.nombre}!`;
      spinner.style.display = 'none';
      btnLogin.style.background = '#2D6A4F';
      setTimeout(() => { window.location.href = '/'; }, 800);
    } else {
      mostrarError(data.error || 'DNI no registrado en el sistema');
      setEstadoCargando(false);
      inputDni.focus();
    }

  } catch (err) {
    mostrarError('Error de conexión. Verifica que el servidor esté corriendo.');
    setEstadoCargando(false);
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function mostrarError(mensaje) {
  errorTexto.textContent = mensaje;
  errorMsg.classList.add('visible');
  inputDni.classList.add('error-input');
}

function ocultarError() {
  errorMsg.classList.remove('visible');
  inputDni.classList.remove('error-input');
}

function setEstadoCargando(cargando) {
  btnLogin.disabled       = cargando;
  spinner.style.display   = cargando ? 'block' : 'none';
  btnTexto.textContent    = cargando ? 'Verificando...' : 'Ingresar al sistema';
}
