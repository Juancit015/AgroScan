"""
app.py — FrutIA backend (Flask)

Punto de entrada de la aplicación. Expone:
  - Autenticación por clave de acceso (sesiones de Flask).
  - El endpoint /analizar, que recibe una imagen en base64, la envía a la
    IA de visión (Groq · Llama 4 Scout) y persiste el resultado en SQLite.
  - Endpoints de lectura para historial y estadísticas del usuario logueado.
  - Endpoints /admin/* protegidos por rol, para gestión de usuarios y
    estadísticas globales de la plataforma.

El acceso a datos vive en database.py; este archivo no ejecuta SQL
directamente. Ver ARCHITECTURE.md para el flujo completo request → IA → DB.

Última actualización: 2026-06-18 (ver CHANGELOG.md → [0.4.0])
"""

from flask import Flask, request, jsonify, render_template, render_template_string, session, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps
from database import (inicializar_db, buscar_usuario_por_dni, guardar_analisis,
                      obtener_historial, obtener_estadisticas, eliminar_analisis,
                      obtener_todos_usuarios, agregar_usuario, eliminar_usuario,
                      editar_usuario, nombre_en_uso, actualizar_avatar,
                      obtener_estadisticas_globales, obtener_analisis_por_id)
from weasyprint import HTML
from groq import Groq
import base64, os, json, re, uuid, time, io
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)
app.secret_key = "frutia_secret_2024"

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
inicializar_db()

# Las fotos de cultivos van directo a static/uploads/ (carpeta ya presente
# en el repo); los avatares de perfil viven en una subcarpeta propia que
# se crea sola si todavía no existe.
os.makedirs(os.path.join("static", "uploads", "avatars"), exist_ok=True)

PDF_EMOJI_FILES = {
    "sprout": "sprout.svg",
    "warning": "warning.svg",
    "check": "check.svg",
    "microscope": "microscope.svg",
    "pill": "pill.svg",
    "fork_knife": "fork_knife.svg",
    "books": "books.svg",
}

def obtener_pdf_emoji_paths():
    """Rutas file:// para que WeasyPrint incruste emojis SVG locales."""
    base = os.path.join(app.root_path, "static", "assets", "emoji")
    return {
        nombre: "file://" + os.path.join(base, archivo)
        for nombre, archivo in PDF_EMOJI_FILES.items()
    }

# Tiempo (en segundos) que tardó la última llamada a la IA. Vive en memoria
# del proceso — se reinicia si el servidor se reinicia, lo cual es
# aceptable para un widget informativo de "estado del sistema".
ultimo_tiempo_respuesta = None

PROMPT = """
Eres un experto en agronomía y fitosanidad especializado en cultivos peruanos.
Analiza la imagen y responde ÚNICAMENTE con un JSON válido, sin texto extra, sin bloques de código.

IMPORTANTE: El nombre del cultivo DEBE ser el nombre común utilizado en Perú (por ejemplo, "Palta" en vez de "Aguacate", "Granadilla" en vez de "Granado", "Choclo" en vez de "Elote") seguido de su nombre científico entre paréntesis. Ejemplo: "Palta (Persea americana)".

PASO 1 — Validación:
Determina si la imagen contiene un cultivo, fruta, hortaliza, planta, hoja o producto agrícola.
Si NO es agrícola responde SOLO: {"valido": false, "motivo": "descripción breve de lo que se ve"}

PASO 2 — Diagnóstico (solo si es agrícola):
{
  "valido": true,
  "cultivo": "Nombre común en Perú (Nombre científico)",
  "maduracion": "Verde / En desarrollo / Listo para cosecha / Sobre maduro",
  "confianza": 85,
  "enfermedades": [
    {"nombre": "nombre","severidad": "Leve / Moderada / Severa","descripcion": "descripción visual"}
  ],
  "explicacion": ["Observación 1","Observación 2","Observación 3"],
  "zona_afectada": {"x":20,"y":30,"width":40,"height":35,"descripcion":"Zona afectada"},
  "tratamiento": "recomendación concreta",
  "recomendacion_consumo": "Breve advertencia o recomendación alimentaria (ej: Alto en azúcares, consumo moderado para diabéticos. Si no aplica, dejar vacío o 'Sin contraindicaciones relevantes')",
  "advertencia": "Este diagnóstico es orientativo. Consulta a un ingeniero agrónomo para confirmación.",
  "fuentes": [{"titulo":"título del documento o guía","institucion":"FAO / SENASA / MINAGRI"}]
}
Si no hay enfermedades: "enfermedades"=[] y "zona_afectada"={}
explicacion: 3-5 observaciones visuales específicas.
"""

# ── Decorador admin ───────────────────────────────────────────────
def requiere_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("rol") != "admin":
            return jsonify({"error": "Acceso denegado"}), 403
        return f(*args, **kwargs)
    return decorated

# ── Rutas principales ─────────────────────────────────────────────

@app.route("/")
def index():
    if "usuario_id" not in session:
        return render_template("login.html")
    return render_template("index.html",
                           usuario=session.get("nombre"),
                           rol=session.get("rol"),
                           avatar=session.get("avatar_path"))

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    dni  = data.get("dni", "").strip()
    if not dni:
        return jsonify({"error": "Ingresa tu clave"}), 400
    usuario = buscar_usuario_por_dni(dni)
    if not usuario:
        return jsonify({"error": "Credenciales incorrectas"}), 401
    session["usuario_id"]   = usuario["id"]
    session["nombre"]       = usuario["nombre"]
    session["rol"]          = usuario["rol"]
    session["avatar_path"]  = usuario.get("avatar_path")
    session["localidad"]    = usuario.get("localidad")
    return jsonify({"mensaje": f"Bienvenido, {usuario['nombre']}!",
                    "nombre": usuario["nombre"], "rol": usuario["rol"]})

@app.route("/logout")
def logout():
    session.clear()
    return jsonify({"mensaje": "Sesión cerrada"})

@app.route("/registro", methods=["POST"])
def registro():
    data = request.get_json()
    nombre = data.get("nombre", "").strip()
    clave  = data.get("dni", "").strip()
    region = data.get("region", "").strip()
    localidad = data.get("localidad", "").strip()

    if not nombre or not clave or not region or not localidad:
        return jsonify({"error": "Todos los campos son requeridos"}), 400
    if len(nombre) < 3 or len(nombre) > 30:
        return jsonify({"error": "El nombre debe tener entre 3 y 30 caracteres"}), 400
    if len(clave) != 8 or not clave.isdigit():
        return jsonify({"error": "La clave debe tener exactamente 8 dígitos numéricos"}), 400
    if nombre_en_uso(nombre):
        return jsonify({"error": "Ya existe un usuario con ese nombre. Usa uno distinto."}), 409

    resultado = agregar_usuario(nombre, clave, rol="agricultor", region=region, localidad=localidad)
    if resultado["ok"]:
        usuario = buscar_usuario_por_dni(clave)
        session["usuario_id"]   = usuario["id"]
        session["nombre"]       = usuario["nombre"]
        session["rol"]          = usuario["rol"]
        session["avatar_path"]  = usuario.get("avatar_path")
        session["localidad"]    = usuario.get("localidad")
        return jsonify({"mensaje": f"¡Registro exitoso! Bienvenido, {usuario['nombre']}!",
                        "nombre": usuario["nombre"], "rol": usuario["rol"]})
    return jsonify({"error": resultado.get("error", "Error al registrar")}), 409

@app.route("/analizar", methods=["POST"])
def analizar():
    """
    Recibe una imagen en base64, la envía a la IA de visión y devuelve el
    diagnóstico en JSON.

    Flujo:
      1. La IA decide primero si la imagen es agrícola (campo "valido").
         Si no lo es, se devuelve tal cual y NO se guarda nada en la BD.
      2. Si es válida, se guarda la imagen en static/uploads/ y el
         resultado completo en la tabla `analisis`, ligado al usuario
         de la sesión actual.
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    data = request.get_json()
    if not data or "imagen" not in data:
        return jsonify({"error": "No se recibió ninguna imagen"}), 400
    try:
        # El frontend envía un data URL (data:image/jpeg;base64,xxxx);
        # solo nos interesa la parte posterior a la coma.
        imagen_base64 = data["imagen"]
        if "," in imagen_base64:
            imagen_base64 = imagen_base64.split(",")[1]
        imagen_bytes = base64.b64decode(imagen_base64)

        # Se mide el tiempo de respuesta de la IA para mostrarlo en el
        # widget "Estado del sistema" (ver /estado más abajo).
        t0 = time.time()
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imagen_base64}"}},
                {"type": "text", "text": PROMPT}
            ]}],
            max_tokens=1024
        )
        global ultimo_tiempo_respuesta
        ultimo_tiempo_respuesta = round(time.time() - t0, 1)

        # La IA a veces envuelve el JSON en ```json ... ``` pese a la
        # instrucción del prompt; se limpia antes de parsear.
        texto    = response.choices[0].message.content.strip()
        texto    = re.sub(r"```json|```", "", texto).strip()
        resultado = json.loads(texto)

        # Imagen no agrícola: no se persiste nada, se informa al frontend.
        if not resultado.get("valido", True):
            return jsonify(resultado)

        # Imagen válida: se guarda en disco con nombre único
        # (usuario + timestamp + hash corto) para evitar colisiones.
        filename = f"{session['usuario_id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        filepath = os.path.join("static", "uploads", filename)
        with open(filepath, "wb") as f:
            f.write(imagen_bytes)

        resultado["imagen_path"]  = f"uploads/{filename}"
        resultado["analisis_id"]  = guardar_analisis(session["usuario_id"], resultado,
                                                      imagen_path=resultado["imagen_path"])
                                                      
        # Verificar brotes regionales después de guardar
        enfermedades = resultado.get("enfermedades", [])
        localidad = session.get("localidad")
        if enfermedades and localidad:
            # Importación local para evitar bucles si es necesario, o asume que está arriba.
            # (database ya está importado en app.py: from database import ...)
            from database import verificar_brotes_regionales
            alertas = verificar_brotes_regionales(enfermedades, localidad, dias=7)
            resultado["alertas_regionales"] = alertas

        return jsonify(resultado)

    except json.JSONDecodeError:
        # La IA no devolvió JSON válido (raro, pero puede pasar).
        return jsonify({"error": "La IA no devolvió un formato válido. Intenta de nuevo."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

EXTENSIONES_AVATAR_PERMITIDAS = {"png", "jpg", "jpeg", "webp", "gif"}

@app.route("/perfil/avatar", methods=["POST"])
def subir_avatar():
    """
    Recibe una imagen (multipart/form-data, campo 'avatar'), la guarda en
    static/uploads/avatars/ con nombre único y actualiza la ruta tanto en
    la base de datos como en la sesión activa, para que el navbar se
    refresque sin tener que volver a iniciar sesión.
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401

    archivo = request.files.get("avatar")
    if not archivo or archivo.filename == "":
        return jsonify({"error": "No se recibió ninguna imagen"}), 400

    extension = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if extension not in EXTENSIONES_AVATAR_PERMITIDAS:
        return jsonify({"error": "Formato no soportado. Usa PNG, JPG, WEBP o GIF."}), 400

    filename = f"{session['usuario_id']}_{uuid.uuid4().hex[:8]}.{extension}"
    filepath = os.path.join("static", "uploads", "avatars", filename)
    archivo.save(filepath)

    avatar_path = f"uploads/avatars/{filename}"
    actualizar_avatar(session["usuario_id"], avatar_path)
    session["avatar_path"] = avatar_path

    return jsonify({"mensaje": "Foto de perfil actualizada", "avatar_path": avatar_path})

@app.route("/historial")
def historial():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    return jsonify(obtener_historial(session["usuario_id"]))


@app.route("/historial/eliminar", methods=["POST"])
def historial_eliminar():
    """
    Elimina uno o varios análisis del usuario autenticado.
    Body JSON: { "ids": [1, 2, 3] }  (lista de IDs a eliminar)
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401

    data = request.get_json() or {}
    ids = data.get("ids", [])

    if not ids or not isinstance(ids, list):
        return jsonify({"error": "Lista de IDs inválida"}), 400

    # Validar que todos sean enteros
    try:
        ids = [int(i) for i in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "IDs deben ser números enteros"}), 400

    deleted = eliminar_analisis(ids, session["usuario_id"])
    return jsonify({"eliminados": deleted, "mensaje": f"{deleted} registro(s) eliminado(s) correctamente"})

@app.route("/chat", methods=["POST"])
def chat_diagnostico():
    """
    Endpoint para el chat de seguimiento post-diagnóstico.
    Recibe el contexto del diagnóstico y el historial de mensajes del chat
    para que la IA pueda responder preguntas específicas sobre ese cultivo.
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos inválidos"}), 400

    contexto   = data.get("contexto", {})   # diagnóstico actual
    mensajes   = data.get("mensajes", [])   # historial de mensajes del chat
    pregunta   = data.get("pregunta", "").strip()

    if not pregunta:
        return jsonify({"error": "La pregunta no puede estar vacía"}), 400

    # Construir el sistema con contexto del diagnóstico
    cultivo      = contexto.get("cultivo", "cultivo desconocido")
    enfermedades = contexto.get("enfermedades", [])
    tratamiento  = contexto.get("tratamiento", "")
    localidad    = session.get("localidad", "Perú")

    enf_texto = ", ".join([e.get("nombre", "") for e in enfermedades]) if enfermedades else "ninguna"

    system_prompt = f"""Eres el asistente agronómico de FrutIA, especializado en cultivos peruanos.
Acabas de analizar un cultivo y el agricultor tiene preguntas de seguimiento.

CONTEXTO DEL DIAGNÓSTICO ACTUAL:
- Cultivo detectado: {cultivo}
- Enfermedades: {enf_texto}
- Tratamiento recomendado: {tratamiento}
- Localidad del agricultor: {localidad}

Responde de forma clara, práctica y breve (máximo 3-4 oraciones). Usa lenguaje sencillo, sin tecnicismos innecesarios.

IMPORTANTE:
- Incluye emojis relacionados al campo (🌱🌿🍎🌽🥬🚜💧☀️🐛🧑‍🌾✅⚠️❌🛑💊📚 según corresponda).
- Usa **negritas** (con doble asterisco) para resaltar palabras clave como nombres de cultivos, enfermedades, tratamientos o datos importantes.
- Si la pregunta es sobre el cultivo analizado, responde con precisión. Si es completamente ajena a la agronomía, indícalo amablemente y redirige la conversación al cultivo."""

    # Armar historial de mensajes para la IA
    messages_groq = [{"role": "system", "content": system_prompt}]
    for msg in mensajes[-10:]:   # máximo 10 mensajes de contexto
        if msg.get("rol") in ("user", "assistant"):
            messages_groq.append({"role": msg["rol"], "content": msg["texto"]})
    messages_groq.append({"role": "user", "content": pregunta})

    try:
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=messages_groq,
            max_tokens=512
        )
        respuesta = response.choices[0].message.content.strip()
        return jsonify({"respuesta": respuesta})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/estadisticas")
def estadisticas():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    return jsonify(obtener_estadisticas(session["usuario_id"]))

@app.route("/estado")
def estado_sistema():
    """
    Datos para el widget 'Estado del sistema' del analizador: si la IA
    está configurada, qué modelo usa, cuánto tardó la última respuesta y
    cuántos análisis lleva el usuario en total.
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    stats = obtener_estadisticas(session["usuario_id"])
    return jsonify({
        "online":           bool(os.getenv("GROQ_API_KEY")),
        "modelo":           "Llama 4 Scout",
        "ultimo_tiempo_s":  ultimo_tiempo_respuesta,
        "total_analisis":   stats["total_analisis"]
    })


# ── Exportación a PDF (WeasyPrint) ────────────────────────────────
# Generado 100% en el backend — no depende del tamaño de la ventana
# del navegador. El resultado es siempre idéntico sin importar el
# cliente, el viewport o el estado de carga de fuentes.

REPORTE_PDF_TEMPLATE = """
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
    @bottom-center {
      content: "Generado automáticamente por FrutIA  |  {{ fecha }} {{ hora }}";
      font-size: 8px;
      color: #9CA3AF;
      font-family: Arial, sans-serif;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    color: #1A1A1A;
    font-size: 11.5px;
    line-height: 1.55;
    background: #fff;
  }
  .emoji-img {
    display: inline-block;
    width: 13px;
    height: 13px;
    margin-right: 5px;
    vertical-align: -2px;
  }
  .emoji-logo {
    width: 20px;
    height: 20px;
    vertical-align: -3px;
  }

  /* ── CABECERA ── */
  .cabecera {
    width: 100%;
    border-bottom: 3px solid #52B788;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  .cab-tabla { width: 100%; border-collapse: collapse; }
  .logo-wrap { vertical-align: middle; }
  .logo-img  { height: 38px; width: auto; vertical-align: middle; margin-right: 8px; }
  .logo-texto {
    font-size: 22px; font-weight: 800; color: #1B4332;
    vertical-align: middle; letter-spacing: -0.5px;
  }
  .logo-texto .ia-marca { color: #C8A96E; }
  .logo-sub { font-size: 10px; color: #6B7280; margin-top: 2px; }
  .cab-fecha { text-align: right; vertical-align: middle; font-size: 10px; color: #9CA3AF; }

  /* ── SECCIÓN PRINCIPAL: imagen + datos ── */
  .principal-tabla { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  .principal-img {
    width: 185px; height: 155px; object-fit: cover;
    border-radius: 6px; border: 1px solid #E4E0D8;
    display: block;
  }
  .sin-img {
    width: 185px; height: 155px; background: #F5F4F1;
    border-radius: 6px; border: 1px solid #E4E0D8;
    text-align: center; color: #9CA3AF; font-size: 10px;
    vertical-align: middle; padding-top: 60px;
  }
  .datos-col { vertical-align: top; padding-left: 20px; }
  .cultivo-nombre { font-size: 20px; font-weight: 700; color: #1B4332; margin-bottom: 10px; }
  .dato-tabla { border-collapse: collapse; margin-bottom: 12px; }
  .dato-label { color: #6B7280; font-size: 10.5px; padding-right: 14px; white-space: nowrap; padding-bottom: 3px; }
  .dato-valor { font-weight: 600; padding-bottom: 3px; }

  /* ── BARRA DE CONFIANZA ── */
  .conf-wrap { margin-top: 4px; }
  .conf-label { font-size: 10px; color: #6B7280; margin-bottom: 3px; }
  .conf-track { width: 100%; height: 8px; background: #E5E7EB; border-radius: 99px; overflow: hidden; }
  .conf-fill  { height: 8px; border-radius: 99px; }
  .conf-fill.verde    { background: #22C55E; }
  .conf-fill.amarillo { background: #EAB308; }
  .conf-fill.rojo     { background: #EF4444; }
  .conf-pct { font-size: 10px; font-weight: 700; margin-top: 2px; }

  /* ── SEPARADOR ── */
  hr.separador { border: none; border-top: 1px solid #E4E0D8; margin: 14px 0; }

  /* ── BLOQUE GENÉRICO ── */
  .bloque { margin-bottom: 16px; page-break-inside: avoid; }
  .bloque-titulo {
    font-size: 12px; font-weight: 700; margin-bottom: 7px;
    padding-bottom: 3px; border-bottom: 1.5px solid currentColor;
    display: inline-block;
  }
  .bloque-titulo.enfermedad { color: #DC2626; }
  .bloque-titulo.sano       { color: #16A34A; }
  .bloque-titulo.obs        { color: #2D6A4F; }
  .bloque-titulo.tratamiento{ color: #1B4332; }
  .bloque-titulo.fuentes    { color: #1D4ED8; }

  /* ── ENFERMEDADES ── */
  .enf-item { margin-bottom: 8px; padding: 7px 10px; background: #FEF2F2; border-radius: 5px; border-left: 3px solid #DC2626; }
  .enf-nombre { font-weight: 700; color: #991B1B; font-size: 11.5px; }
  .enf-severidad { font-size: 10px; color: #B91C1C; margin-left: 6px; }
  .enf-desc { font-size: 10.5px; color: #4B5563; margin-top: 2px; }

  /* ── OBSERVACIONES ── */
  ul.obs-lista { padding-left: 16px; color: #374151; }
  ul.obs-lista li { margin-bottom: 4px; font-size: 11px; }

  /* ── TRATAMIENTO ── */
  .caja-tratamiento {
    background: #F0FDF4; border-left: 4px solid #52B788;
    border-radius: 6px; padding: 11px 15px; color: #1A1A1A;
    font-size: 11px;
  }

  /* ── FUENTES ── */
  .fuente-item { margin-bottom: 5px; font-size: 10.5px; }
  .fuente-titulo { font-weight: 600; color: #1E3A5F; }
  .fuente-inst { color: #6B7280; font-size: 10px; }

  /* ── ADVERTENCIA ── */
  .advertencia {
    margin-top: 20px; padding: 8px 12px;
    background: #FFFBEB; border-radius: 5px;
    border: 1px solid #FDE68A;
    font-size: 9.5px; color: #78350F; text-align: center;
  }
</style>
</head>
<body>

  <!-- CABECERA -->
  <div class="cabecera">
    <table class="cab-tabla">
      <tr>
        <td class="logo-wrap">
          {% if logo_path %}
            <img src="{{ logo_path }}" class="logo-img" alt="FrutIA">
          {% endif %}
          <span class="logo-texto"><img src="{{ emoji.sprout }}" class="emoji-img emoji-logo" alt="">Frut<span class="ia-marca">IA</span></span>
          <div class="logo-sub">Reporte de Diagnóstico Agronómico</div>
        </td>
        <td class="cab-fecha">{{ fecha }}<br>{{ hora }}</td>
      </tr>
    </table>
  </div>

  <!-- IMAGEN + DATOS PRINCIPALES -->
  <table class="principal-tabla">
    <tr>
      <td style="width:185px; vertical-align:top;">
        {% if imagen_path %}
          <img class="principal-img" src="{{ imagen_path }}" alt="Cultivo analizado">
        {% else %}
          <div class="sin-img">Sin imagen</div>
        {% endif %}
      </td>
      <td class="datos-col">
        <div class="cultivo-nombre">{{ cultivo }}</div>
        <table class="dato-tabla">
          <tr>
            <td class="dato-label">Estado de maduración</td>
            <td class="dato-valor">{{ maduracion }}</td>
          </tr>
          <tr>
            <td class="dato-label">Confianza de la IA</td>
            <td class="dato-valor">{{ confianza }}%</td>
          </tr>
        </table>
        <!-- Barra de confianza -->
        <div class="conf-wrap">
          <div class="conf-label">Nivel de confianza del diagnóstico</div>
          <div class="conf-track">
            <div class="conf-fill {% if confianza >= 80 %}verde{% elif confianza >= 60 %}amarillo{% else %}rojo{% endif %}"
                 style="width: {{ confianza }}%;"></div>
          </div>
          <div class="conf-pct" style="color: {% if confianza >= 80 %}#16A34A{% elif confianza >= 60 %}#B45309{% else %}#DC2626{% endif %};">
            {{ confianza }}%
          </div>
        </div>
      </td>
    </tr>
  </table>

  <hr class="separador">

  <!-- ENFERMEDADES -->
  <div class="bloque">
    {% if enfermedades %}
      <div class="bloque-titulo enfermedad"><img src="{{ emoji.warning }}" class="emoji-img" alt="">Enfermedades detectadas</div>
      {% for e in enfermedades %}
        <div class="enf-item">
          <span class="enf-nombre">{{ e.nombre }}</span>
          <span class="enf-severidad">[ {{ e.severidad }} ]</span>
          {% if e.descripcion %}
            <div class="enf-desc">{{ e.descripcion }}</div>
          {% endif %}
        </div>
      {% endfor %}
    {% else %}
      <div class="bloque-titulo sano"><img src="{{ emoji.check }}" class="emoji-img" alt="">Cultivo en buen estado — sin enfermedades detectadas</div>
    {% endif %}
  </div>

  <!-- OBSERVACIONES VISUALES -->
  {% if explicacion %}
  <div class="bloque">
    <div class="bloque-titulo obs"><img src="{{ emoji.microscope }}" class="emoji-img" alt="">Observaciones Visuales</div>
    <ul class="obs-lista">
      {% for obs in explicacion %}<li>{{ obs }}</li>{% endfor %}
    </ul>
  </div>
  {% endif %}

  <!-- TRATAMIENTO -->
  <div class="bloque">
    <div class="bloque-titulo tratamiento"><img src="{{ emoji.pill }}" class="emoji-img" alt="">Tratamiento Recomendado</div>
    <div class="caja-tratamiento">
      {% if tratamiento and tratamiento != '—' %}
        {{ tratamiento }}
      {% else %}
        No requiere tratamiento fitosanitario especial.
      {% endif %}
    </div>
  </div>

  <!-- RECOMENDACIÓN DE CONSUMO -->
  <div class="bloque">
    <div class="bloque-titulo obs" style="color: #9333EA;"><img src="{{ emoji.fork_knife }}" class="emoji-img" alt="">Recomendación de Consumo</div>
    <div class="caja-tratamiento" style="background: #FAF5FF; border-left-color: #A855F7;">
      {% if recomendacion_consumo and recomendacion_consumo.lower() != 'sin contraindicaciones relevantes' %}
        {{ recomendacion_consumo }}
      {% else %}
        Sin contraindicaciones ni precauciones especiales detectadas.
      {% endif %}
    </div>
  </div>

  <!-- FUENTES -->
  {% if fuentes %}
  <div class="bloque">
    <div class="bloque-titulo fuentes"><img src="{{ emoji.books }}" class="emoji-img" alt="">Fuentes consultadas</div>
    {% for f in fuentes %}
      <div class="fuente-item">
        <span class="fuente-titulo">{{ f.titulo }}</span>
        {% if f.institucion %}<span class="fuente-inst"> — {{ f.institucion }}</span>{% endif %}
      </div>
    {% endfor %}
  </div>
  {% endif %}

  <!-- ADVERTENCIA -->
  <div class="advertencia">
    <img src="{{ emoji.warning }}" class="emoji-img" alt="">{{ advertencia or 'Este diagnóstico es orientativo y no reemplaza la evaluación de un ingeniero agrónomo certificado.' }}
  </div>

</body>
</html>
"""

@app.route("/reporte-pdf/<int:analisis_id>")
def reporte_pdf(analisis_id):
    """
    Genera y descarga el reporte de un analisis como PDF usando WeasyPrint.
    Resultado siempre identico, sin importar el viewport del navegador.
    """
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesion"}), 401

    analisis = obtener_analisis_por_id(analisis_id, session["usuario_id"])
    if not analisis:
        return jsonify({"error": "Analisis no encontrado"}), 404

    # Imagen del cultivo — ruta absoluta file:// para WeasyPrint
    imagen_path = None
    if analisis.get("imagen_path"):
        ruta_absoluta = os.path.join(app.root_path, "static", analisis["imagen_path"])
        if os.path.exists(ruta_absoluta):
            imagen_path = "file://" + ruta_absoluta

    # Logo — ruta absoluta file:// para WeasyPrint
    logo_path = None
    ruta_logo = os.path.join(app.root_path, "static", "assets", "logo.png")
    if os.path.exists(ruta_logo):
        logo_path = "file://" + ruta_logo

    ahora = datetime.now()
    html_final = render_template_string(
        REPORTE_PDF_TEMPLATE,
        cultivo=analisis.get("cultivo") or "Cultivo desconocido",
        maduracion=analisis.get("maduracion") or "—",
        confianza=analisis.get("confianza") or 0,
        enfermedades=analisis.get("enfermedades") or [],
        explicacion=analisis.get("explicacion") or [],
        tratamiento=analisis.get("tratamiento"),
        recomendacion_consumo=analisis.get("recomendacion_consumo"),
        fuentes=analisis.get("fuentes") or [],
        advertencia=analisis.get("advertencia"),
        imagen_path=imagen_path,
        logo_path=logo_path,
        emoji=obtener_pdf_emoji_paths(),
        fecha=ahora.strftime("%d/%m/%Y"),
        hora=ahora.strftime("%I:%M %p"),
    )

    try:
        pdf_bytes = HTML(string=html_final, base_url=app.root_path).write_pdf()
    except Exception as e:
        return jsonify({"error": f"Error al generar PDF: {str(e)}"}), 500

    nombre_cultivo = (analisis.get("cultivo") or "Cultivo").replace(" ", "_")
    filename = f"FrutIA_Reporte_{nombre_cultivo}.pdf"

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )



# ── Rutas Admin ───────────────────────────────────────────────────

# El admin puede: ver la lista de usuarios con sus estadísticas, crear
# nuevos usuarios, editar nombre/clave de uno existente (bloqueando nombres
# duplicados) y eliminar usuarios. No expone qué representa la "clave"
# (es el DNI) en ningún mensaje, por diseño — ver CHANGELOG [0.4.0].

NOMBRE_MAX_LEN = 30

@app.route("/admin/usuarios")
@requiere_admin
def admin_usuarios():
    return jsonify(obtener_todos_usuarios())

@app.route("/admin/usuarios/<int:uid>/historial")
@requiere_admin
def admin_usuario_historial(uid):
    from database import obtener_detalles_usuario_admin
    detalles = obtener_detalles_usuario_admin(uid)
    if not detalles:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(detalles)

@app.route("/admin/usuarios", methods=["POST"])
@requiere_admin
def admin_agregar_usuario():
    data   = request.get_json()
    nombre = data.get("nombre", "").strip()
    clave  = data.get("clave", "").strip()
    rol    = data.get("rol", "agricultor")
    region = data.get("region", "").strip()
    localidad = data.get("localidad", "").strip()

    if not nombre or not clave:
        return jsonify({"error": "Nombre y clave son requeridos"}), 400
    if len(nombre) > NOMBRE_MAX_LEN:
        return jsonify({"error": f"El nombre no puede superar {NOMBRE_MAX_LEN} caracteres"}), 400
    if len(clave) != 8 or not clave.isdigit():
        return jsonify({"error": "La clave debe tener exactamente 8 dígitos"}), 400
    if nombre_en_uso(nombre):
        return jsonify({"error": "Ya existe un usuario con ese nombre. Usa uno distinto (por ejemplo, agrega un apellido o inicial)."}), 409

    resultado = agregar_usuario(nombre, clave, rol, region, localidad)
    if resultado["ok"]:
        return jsonify({"mensaje": f"Usuario {nombre} creado correctamente"})
    return jsonify({"error": resultado.get("error", "La clave ya está registrada")}), 409

@app.route("/admin/usuarios/<int:uid>", methods=["PUT"])
@requiere_admin
def admin_editar_usuario(uid):
    """
    Permite cambiar nombre y/o clave de un usuario. Ambos campos son
    opcionales: solo se actualiza lo que venga en el body. El rol NO es
    editable desde aquí — el admin solo gestiona nombre y clave.
    """
    data   = request.get_json() or {}
    nombre = data.get("nombre")
    clave  = data.get("clave")
    region = data.get("region")
    localidad = data.get("localidad")

    if nombre is None and clave is None and region is None and localidad is None:
        return jsonify({"error": "Indica al menos un campo a actualizar"}), 400

    if nombre is not None:
        nombre = nombre.strip()
        if not nombre:
            return jsonify({"error": "El nombre no puede estar vacío"}), 400
        if len(nombre) > NOMBRE_MAX_LEN:
            return jsonify({"error": f"El nombre no puede superar {NOMBRE_MAX_LEN} caracteres"}), 400
        if nombre_en_uso(nombre, excluir_id=uid):
            return jsonify({"error": "Ya existe otro usuario con ese nombre. Elige uno distinto."}), 409

    if clave is not None:
        clave = clave.strip()
        if len(clave) != 8 or not clave.isdigit():
            return jsonify({"error": "La clave debe tener exactamente 8 dígitos"}), 400

    resultado = editar_usuario(uid, nombre=nombre, dni=clave, region=region, localidad=localidad)
    if resultado["ok"]:
        return jsonify({"mensaje": "Usuario actualizado correctamente"})
    return jsonify({"error": resultado.get("error", "No se pudo actualizar el usuario")}), 409

@app.route("/admin/usuarios/<int:uid>", methods=["DELETE"])
@requiere_admin
def admin_eliminar_usuario(uid):
    if uid == session["usuario_id"]:
        return jsonify({"error": "No puedes eliminarte a ti mismo"}), 400
    eliminar_usuario(uid)
    return jsonify({"mensaje": "Usuario eliminado"})

@app.route("/admin/estadisticas")
@requiere_admin
def admin_estadisticas():
    return jsonify(obtener_estadisticas_globales())

if __name__ == "__main__":
    app.run(debug=True, port=5000)
