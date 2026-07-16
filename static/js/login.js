// ── Traducciones Español / Quechua ───────────────────────────────
const TRADUCCIONES = {
  es: {
    panel_titulo: 'Diagnóstico <em>inteligente</em> para tus cultivos',
    panel_desc: 'Fotografía un cultivo y la IA detecta enfermedades, evalúa la madurez y recomienda el tratamiento adecuado con fuentes confiables.',
    footer: 'Desarrollado en Paijan, La Libertad, Perú',
    login_titulo: 'Bienvenido',
    login_sub: 'Ingresa tu clave para acceder al sistema',
    login_label: 'Clave de acceso',
    login_error: 'Clave incorrecta',
    login_btn: 'Ingresar al sistema',
    login_toggle: '¿No estás registrado?',
    login_toggle_link: '¡Regístrate!',
    reg_titulo: 'Crear cuenta',
    reg_sub: 'Crea tu cuenta de agricultor',
    reg_label_nombre: 'Nombre y Apellido',
    reg_label_region: 'Región',
    reg_label_localidad: 'Localidad',
    reg_label_clave: 'Clave de acceso (8 dígitos)',
    reg_btn: 'Crear cuenta',
    reg_toggle: '¿Ya tienes cuenta?',
    reg_toggle_link: 'Inicia sesión',
    reg_region_placeholder: 'Selecciona tu región...',
    reg_localidad_placeholder: 'Primero selecciona región',
    verificando: 'Verificando...',
    registrando: 'Registrando...',
    btn_login_cargando: 'Verificando...',
    btn_login_normal: 'Ingresar al sistema',
  },
  qu: {
    panel_titulo: 'Diagnóstico <em>yuyayniyuq</em> chakra yukunapaq',
    panel_desc: 'Chakra yukata llimphiykuy, IA unquykunata tarin, puqushananta qhawaykun ima allin hampiyta yuyaywan willakun.',
    footer: 'Paijan, La Libertad, Perú llaqtapi ruwasqa',
    login_titulo: 'Allin hamuy',
    login_sub: 'Yaykunaykipaq kichayki yupayta qillqay',
    login_label: 'Yaykuna kichay',
    login_error: 'Kichay yupi pantasqa',
    login_btn: 'Sistema ukhuman yaykuy',
    login_toggle: '¿Manaraq qillqarachu kanki?',
    login_toggle_link: '¡Qillqakuy!',
    reg_titulo: 'Cuenta kamariy',
    reg_sub: 'Yapuq cuenta kamariy',
    reg_label_nombre: 'Sutiyki',
    reg_label_region: 'Suyu',
    reg_label_localidad: 'Llaqta',
    reg_label_clave: 'Yaykuna kichay (8 qillqa)',
    reg_btn: 'Cuenta ruway',
    reg_toggle: '¿Kañan cuenta niyuqchu kanki?',
    reg_toggle_link: 'Yaykuy',
    reg_region_placeholder: 'Suyuykita akllay...',
    reg_localidad_placeholder: 'Ñawpaqta suyuta akllay',
    verificando: 'Qhawaykun...',
    registrando: 'Qillqakuchkan...',
    btn_login_cargando: 'Qhawaykun...',
    btn_login_normal: 'Sistema ukhuman yaykuy',
  }
};

let idiomaActual = localStorage.getItem('frutia_idioma') || 'es';

function cambiarIdioma(lang) {
  idiomaActual = lang;
  localStorage.setItem('frutia_idioma', lang);

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const t = TRADUCCIONES[lang]?.[key];
    if (t !== undefined) el.innerHTML = t;
  });
}

(function initIdioma() {
  const langGuardado = localStorage.getItem('frutia_idioma') || 'es';
  cambiarIdioma(langGuardado);
})();

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
      body: JSON.stringify({ dni, idioma: idiomaActual })
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
  btnTexto.textContent    = cargando ? TRADUCCIONES[idiomaActual].verificando : TRADUCCIONES[idiomaActual].btn_login_normal;
}

// ── Lógica de Registro ──────────────────────────────────────────
const vistaLogin    = document.getElementById('vista-login');
const vistaRegistro = document.getElementById('vista-registro');
const linkRegistro  = document.getElementById('link-registro');
const linkLogin     = document.getElementById('link-login');

if (linkRegistro && linkLogin) {
  linkRegistro.addEventListener('click', (e) => {
    e.preventDefault();
    vistaLogin.style.display = 'none';
    vistaRegistro.style.display = 'block';
  });

  linkLogin.addEventListener('click', (e) => {
    e.preventDefault();
    vistaRegistro.style.display = 'none';
    vistaLogin.style.display = 'block';
  });
}

const regionesData = {
  "La Libertad": ["Paiján", "Trujillo", "Chepén", "Pacasmayo", "Ascope"],
  "Lima": ["Lima Central", "Cañete", "Huaral", "Barranca", "Huaura"],
  "Piura": ["Piura", "Sullana", "Paita", "Talara", "Sechura"],
  "Ica": ["Ica", "Chincha", "Pisco", "Nazca", "Palpa"],
  "Cusco": ["Cusco", "Urubamba", "Quillabamba", "Sicuani", "Calca"],
  "Arequipa": ["Arequipa", "Camaná", "Mollendo", "Chivay", "Caravelí"]
};

const selectRegion = document.getElementById('reg-region');
const selectLocalidad = document.getElementById('reg-localidad');

if (selectRegion && selectLocalidad) {
  // Poblar regiones
  for (const region in regionesData) {
    const opt = document.createElement('option');
    opt.value = region;
    opt.textContent = region;
    selectRegion.appendChild(opt);
  }

  selectRegion.addEventListener('change', function() {
    const region = this.value;
    selectLocalidad.innerHTML = '<option value="">Selecciona tu localidad...</option>';
    
    if (region && regionesData[region]) {
      selectLocalidad.disabled = false;
      regionesData[region].forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        selectLocalidad.appendChild(opt);
      });
    } else {
      selectLocalidad.disabled = true;
      selectLocalidad.innerHTML = '<option value="">Primero selecciona región</option>';
    }
  });
}

const regNombre = document.getElementById('reg-nombre');
const regDni = document.getElementById('reg-dni');
const btnRegistrar = document.getElementById('btn-registrar');
const regSpinner = document.getElementById('reg-spinner');
const regBtnTexto = document.getElementById('reg-btn-texto');
const regErrorMsg = document.getElementById('reg-error-msg');
const regErrorTexto = document.getElementById('reg-error-texto');

if (regDni && regNombre && btnRegistrar) {
  regDni.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '');
    regErrorMsg.classList.remove('visible');
  });
  regNombre.addEventListener('input', () => regErrorMsg.classList.remove('visible'));

  btnRegistrar.addEventListener('click', async () => {
    const nombre = regNombre.value.trim();
    const region = selectRegion.value;
    const localidad = selectLocalidad.value;
    const dni = regDni.value.trim();

    if (!nombre || !region || !localidad || !dni) {
      mostrarErrorReg('Todos los campos son obligatorios');
      return;
    }
    if (nombre.length < 3) {
      mostrarErrorReg('El nombre debe tener al menos 3 caracteres');
      return;
    }
    if (!/[a-zA-Záéíóúüñ]/.test(nombre)) {
      mostrarErrorReg('El nombre debe contener al menos una letra');
      return;
    }
    if (dni.length !== 8) {
      mostrarErrorReg('La clave debe tener 8 dígitos');
      return;
    }

    btnRegistrar.disabled = true;
    regSpinner.style.display = 'block';
    regBtnTexto.textContent = TRADUCCIONES[idiomaActual].registrando;
    regErrorMsg.classList.remove('visible');

    try {
      const res = await fetch('/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, region, localidad, dni, idioma: idiomaActual })
      });
      const data = await res.json();

      if (res.ok) {
        regBtnTexto.textContent = '¡Registro exitoso!';
        regSpinner.style.display = 'none';
        btnRegistrar.style.background = '#2D6A4F';
        setTimeout(() => { window.location.href = '/'; }, 800);
      } else {
        mostrarErrorReg(data.error || 'Error al registrar');
        btnRegistrar.disabled = false;
        regSpinner.style.display = 'none';
        regBtnTexto.textContent = TRADUCCIONES[idiomaActual].reg_btn;
      }
    } catch (err) {
      mostrarErrorReg('Error de conexión');
      btnRegistrar.disabled = false;
      regSpinner.style.display = 'none';
      regBtnTexto.textContent = TRADUCCIONES[idiomaActual].reg_btn;
    }
  });
}

function mostrarErrorReg(mensaje) {
  regErrorTexto.textContent = mensaje;
  regErrorMsg.classList.add('visible');
}
