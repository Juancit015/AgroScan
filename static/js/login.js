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
    login_dni_vacio: 'Ingresa tu número de DNI',
    login_dni_corto: 'El DNI debe tener 8 dígitos',
    login_error_conexion: 'Error de conexión. Verifica que el servidor esté corriendo.',
    bienvenido_prefix: '¡Bienvenido',
    registrando_exitoso: '¡Registro exitoso!',
    reg_error_campos: 'Todos los campos son obligatorios',
    reg_error_nombre_corto: 'El nombre debe tener al menos 3 caracteres',
    reg_error_sin_letra: 'El nombre debe contener al menos una letra',
    reg_error_clave: 'La clave debe tener 8 dígitos',
    reg_error_generico: 'Error al registrar',
    tag_esparrago: '🥬 Espárrago',
    tag_frutas: '🥭 Frutas',
    tag_verduras: '🌽 Verduras',
    tag_ia: '🤖 IA Groq',
    tag_dashboard: '📊 Dashboard',
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
    login_dni_vacio: 'DNI yupaykita qillqay',
    login_dni_corto: 'DNI 8 qillqayuq kanan',
    login_error_conexion: 'Pantasqa tinkiy. Servidor purichkantachu qhaway.',
    bienvenido_prefix: '¡Allin hamuy',
    registrando_exitoso: '¡Allin qillqakuy!',
    reg_error_campos: 'Tukuy campokuna hunt\'anan',
    reg_error_nombre_corto: 'Suti 3 qillqamanta aswan kanan',
    reg_error_sin_letra: 'Suti huk letrayuq kanan',
    reg_error_clave: 'Kichay 8 qillqayuq kanan',
    reg_error_generico: 'Pantasqa qillqakuy',
    tag_esparrago: '🥬 Espárrago',
    tag_frutas: '🥭 Rurukuna',
    tag_verduras: '🌽 Chakra yuyukuna',
    tag_ia: '🤖 IA Groq',
    tag_dashboard: '📊 Tawla',
  }
};

function obtenerIdiomaCookie() {
  const m = document.cookie.match(/(?:^|;\s*)idioma=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : 'es';
}

function guardarIdiomaCookie(lang) {
  document.cookie = `idioma=${lang};path=/;max-age=31536000;samesite=Lax`;
}

let idiomaActual = obtenerIdiomaCookie();

function cambiarIdioma(lang) {
  idiomaActual = lang;
  guardarIdiomaCookie(lang);

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
  const lang = obtenerIdiomaCookie();
  console.log('[FrutIA Login] initIdioma lang =', lang, 'cookie =', document.cookie);
  cambiarIdioma(lang);
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
    mostrarError(TRADUCCIONES[idiomaActual].login_dni_vacio);
    inputDni.focus();
    return;
  }

  if (dni.length < 8) {
    mostrarError(TRADUCCIONES[idiomaActual].login_dni_corto);
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
      btnTexto.textContent = `${TRADUCCIONES[idiomaActual].bienvenido_prefix}, ${data.nombre}!`;
      spinner.style.display = 'none';
      btnLogin.style.background = '#2D6A4F';
      guardarIdiomaCookie(idiomaActual);
      setTimeout(() => { window.location.href = '/'; }, 800);
    } else {
      mostrarError(data.error || TRADUCCIONES[idiomaActual].login_error);
      setEstadoCargando(false);
      inputDni.focus();
    }

  } catch (err) {
    mostrarError(TRADUCCIONES[idiomaActual].login_error_conexion);
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
      mostrarErrorReg(TRADUCCIONES[idiomaActual].reg_error_campos);
      return;
    }
    if (nombre.length < 3) {
      mostrarErrorReg(TRADUCCIONES[idiomaActual].reg_error_nombre_corto);
      return;
    }
    if (!/[a-zA-Záéíóúüñ]/.test(nombre)) {
      mostrarErrorReg(TRADUCCIONES[idiomaActual].reg_error_sin_letra);
      return;
    }
    if (dni.length !== 8) {
      mostrarErrorReg(TRADUCCIONES[idiomaActual].reg_error_clave);
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
        regBtnTexto.textContent = TRADUCCIONES[idiomaActual].registrando_exitoso;
        regSpinner.style.display = 'none';
        btnRegistrar.style.background = '#2D6A4F';
        guardarIdiomaCookie(idiomaActual);
        setTimeout(() => { window.location.href = '/'; }, 800);
      } else {
        mostrarErrorReg(data.error || TRADUCCIONES[idiomaActual].login_error);
        btnRegistrar.disabled = false;
        regSpinner.style.display = 'none';
        regBtnTexto.textContent = TRADUCCIONES[idiomaActual].reg_btn;
      }
    } catch (err) {
      mostrarErrorReg(TRADUCCIONES[idiomaActual].login_error_conexion);
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
