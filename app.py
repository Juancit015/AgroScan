"""
app.py — FrutIA backend (Flask)

Punto de entrada de la aplicación. Expone:
  - Autenticación por clave de acceso (sesiones de Flask).
  - El endpoint /analizar, que recibe una imagen en base64, la envía a la
    IA de visión (Gemini / OpenRouter / Mistral con fallback) y persiste el resultado en SQLite.
  - Endpoints de lectura para historial y estadísticas del usuario logueado.
  - Endpoints /admin/* protegidos por rol, para gestión de usuarios y
    estadísticas globales de la plataforma.

El acceso a datos vive en database.py; este archivo no ejecuta SQL
directamente. Ver ARCHITECTURE.md para el flujo completo request → IA → DB.

Última actualización: 2026-06-18 (ver CHANGELOG.md → [0.4.0])
"""

from flask import Flask, request, jsonify, render_template, render_template_string, session, send_file, g, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps
from database import (inicializar_db, buscar_usuario_por_dni, guardar_analisis,
                      obtener_historial, obtener_estadisticas, eliminar_analisis,
                      obtener_todos_usuarios, agregar_usuario, eliminar_usuario,
                      editar_usuario, nombre_en_uso, actualizar_avatar,
                      obtener_estadisticas_globales, obtener_analisis_por_id,
                      actualizar_idioma)
from weasyprint import HTML
import httpx
import base64, os, json, re, uuid, time, io, random
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)
app.secret_key = "frutia_secret_2024"

_LLM_PROVIDERS = [
    {
        "name": "mistral",
        "api_key": os.getenv("MISTRAL_API_KEY"),
        "model": "mistral-large-latest",
        "base_url": "https://api.mistral.ai/v1/chat/completions",
        "format": "openai",
    },
    {
        "name": "gemini",
        "api_key": os.getenv("GEMINI_API_KEY"),
        "model": "gemini-2.5-flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
        "format": "gemini",
    },
    {
        "name": "openrouter",
        "api_key": os.getenv("OPENROUTER_API_KEY"),
        "model": "nvidia/nemotron-nano-12b-v2-vl:free",
        "base_url": "https://openrouter.ai/api/v1/chat/completions",
        "format": "openai",
    },
]

def _llm(messages, max_tokens=1024):
    token_limit = max(max_tokens, 8192)
    providers = list(_LLM_PROVIDERS)
    errores = []
    for prov in providers:
        if not prov["api_key"]:
            errores.append(f"{prov['name']}: sin key")
            continue
        try:
            if prov["format"] == "gemini":
                return _call_gemini(messages, prov, token_limit)
            else:
                return _call_openai(messages, prov, token_limit)
        except Exception as e:
            errores.append(f"{prov['name']}: {str(e)[:60]}")
            continue
    raise Exception("; ".join(errores))

def _call_gemini(messages, prov, token_limit):
    parts = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            for c in content:
                if c.get("type") == "text":
                    parts.append({"text": c["text"]})
                elif c.get("type") == "image_url":
                    url = c["image_url"]["url"]
                    raw = url.split(",", 1)[1] if "," in url else url
                    mime = "image/jpeg"
                    if "png" in url: mime = "image/png"
                    elif "webp" in url: mime = "image/webp"
                    parts.append({"inline_data": {"mime_type": mime, "data": raw}})
        else:
            parts.append({"text": str(content)})
    url = prov["base_url"].format(model=prov["model"], key=prov["api_key"])
    resp = httpx.post(url, headers={"Content-Type": "application/json"},
        json={"contents": [{"parts": parts}], "generationConfig": {"maxOutputTokens": token_limit}},
        timeout=60)
    if resp.status_code == 429:
        raise Exception("quota_exceeded")
    if resp.status_code != 200:
        raise Exception(f"HTTP {resp.status_code}")
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

def _call_openai(messages, prov, token_limit):
    resp = httpx.post(prov["base_url"],
        headers={"Authorization": f"Bearer {prov['api_key']}", "Content-Type": "application/json"},
        json={"model": prov["model"], "messages": messages, "max_tokens": min(token_limit, 2048)},
        timeout=60)
    if resp.status_code != 200:
        raise Exception(f"HTTP {resp.status_code}: {resp.text[:100]}")
    return resp.json()["choices"][0]["message"]["content"].strip()

inicializar_db()

@app.before_request
def idioma_desde_cookie():
    g.idioma = request.cookies.get("idioma") or session.get("idioma") or "es"
    if g.idioma not in ("es", "qu"):
        g.idioma = "es"

@app.context_processor
def inyectar_idioma():
    return {"idioma_global": g.get("idioma", "es")}

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

def obtener_prompt(idioma):
    if idioma == "qu":
        return """Eres un experto en agronomía y fitosanidad especializado en cultivos peruanos.
Analiza la imagen y responde ÚNICAMENTE con un JSON válido, sin texto extra, sin bloques de código.
IMPORTANTE: Los NOMBRES de los campos del JSON deben quedar EXACTAMENTE en español (cultivo, maduracion, confianza, enfermedades, explicacion, zona_afectada, tratamiento, recomendacion_consumo, advertencia, fuentes). Solo los VALORES de esos campos deben estar en QUECHUA (Runasimi).

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
  "zona_afectada": {"box_2d": [84, 184, 314, 584], "descripcion": "Zona afectada (usa formato [ymin, xmin, ymax, xmax] de 0 a 1000. ¡EXTREMA PRECISIÓN! Enmarcar ÚNICAMENTE la lesión o podredumbre exacta. NO marques todo el fruto entero. Centra la caja en la peor parte)"},
  "tratamiento": "Recomendación ordenada en pasos numerados. Usa **negritas** para palabras clave (productos, acciones, cifras, patógenos). Separa cada paso con un salto de línea. (si no necesita, escribir 'Mana hampiy recomendacionniyuq')",
  "recomendacion_consumo": "Breve advertencia o recomendación alimentaria (ej: Alto en azúcares, consumo moderado para diabéticos. Si no aplica, escribir 'Mana ima contraindicación tarikunchu')",
  "advertencia": "Kay diagnósticoqa orientativo. K'umuyuq agrónomo ingeniero nisqatawantaq.",
  "fuentes": [{"titulo":"título del documento o guía","institucion":"FAO / SENASA / MINAGRI"}]
}
Si el cultivo está sano (no presenta enfermedades, plagas ni daños físicos evidentes): "enfermedades"=[] y "zona_afectada"={}. ¡NO inventes enfermedades! Si está sano, "tratamiento" debe ser 'Mana hampiy recomendacionniyuq' y "explicacion" debe detallar por qué se ve sano (color uniforme, sin manchas, etc.).
explicacion: 3-5 observaciones visuales específicas, cada una en una sola línea sin saltos internos. Usa **negritas** para resaltar síntomas, patógenos o partes del cultivo.
RESPONDE SIEMPRE EN QUECHUA (Runasimi)."""
    return """Eres un experto en agronomía y fitosanidad especializado en cultivos peruanos.
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
  "zona_afectada": {"box_2d": [84, 184, 314, 584], "descripcion": "Zona afectada (usa formato [ymin, xmin, ymax, xmax] de 0 a 1000. ¡EXTREMA PRECISIÓN! Enmarcar ÚNICAMENTE la lesión o podredumbre exacta. NO marques todo el fruto entero. Centra la caja en la peor parte)"},
  "tratamiento": "Recomendación ordenada en pasos numerados. Usa **negritas** para palabras clave (productos, acciones, cifras, patógenos). Separa cada paso con un salto de línea.",
  "recomendacion_consumo": "Breve advertencia o recomendación alimentaria (ej: Alto en azúcares, consumo moderado para diabéticos. Si no aplica, dejar vacío o 'Sin contraindicaciones relevantes'). Usa **negritas** para términos importantes.",
  "advertencia": "Este diagnóstico es orientativo. Consulta a un ingeniero agrónomo para confirmación.",
  "fuentes": [{"titulo":"título del documento o guía","institucion":"FAO / SENASA / MINAGRI"}]
}
Si el cultivo está sano (no presenta enfermedades, plagas ni daños físicos evidentes): "enfermedades"=[] y "zona_afectada"={}. ¡NO inventes enfermedades! Si está sano, "tratamiento" debe indicar que no se requiere tratamiento y "explicacion" debe detallar por qué se ve sano (color uniforme, sin manchas, etc.).
explicacion: 3-5 observaciones visuales específicas, cada una en una sola línea sin saltos internos. Usa **negritas** para resaltar síntomas, patógenos o partes del cultivo.
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
                           avatar=session.get("avatar_path"),
                           idioma=g.idioma)

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    dni  = data.get("dni", "").strip()
    if not dni:
        return jsonify({"error": "Ingresa tu clave"}), 400
    usuario = buscar_usuario_por_dni(dni)
    if not usuario:
        return jsonify({"error": "Credenciales incorrectas"}), 401
    idioma = data.get("idioma") or usuario.get("idioma") or "es"
    if idioma != usuario.get("idioma"):
        actualizar_idioma(usuario["id"], idioma)
    session["usuario_id"]   = usuario["id"]
    session["nombre"]       = usuario["nombre"]
    session["rol"]          = usuario["rol"]
    session["avatar_path"]  = usuario.get("avatar_path")
    session["localidad"]    = usuario.get("localidad")
    session["idioma"]       = idioma
    resp = make_response(jsonify({"mensaje": f"Bienvenido, {usuario['nombre']}!",
                    "nombre": usuario["nombre"], "rol": usuario["rol"],
                    "idioma": idioma}))
    resp.set_cookie("idioma", idioma, max_age=31536000, path="/", samesite="Lax")
    return resp

@app.route("/debug/idioma")
def debug_idioma():
    return jsonify({
        "g.idioma": g.get("idioma", "no set"),
        "session.idioma": session.get("idioma", "no set"),
        "cookie": request.cookies.get("idioma", "no cookie"),
        "cookies_todas": dict(request.cookies),
        "usuario_id": session.get("usuario_id"),
    })

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
    if not _TIENE_LETRA.search(nombre):
        return jsonify({"error": "El nombre debe contener al menos una letra"}), 400
    if len(clave) != 8 or not clave.isdigit():
        return jsonify({"error": "La clave debe tener exactamente 8 dígitos numéricos"}), 400
    if nombre_en_uso(nombre):
        return jsonify({"error": "Ya existe un usuario con ese nombre. Usa uno distinto."}), 409

    idioma = data.get("idioma") or "es"
    resultado = agregar_usuario(nombre, clave, rol="agricultor", region=region, localidad=localidad)
    if resultado["ok"]:
        usuario = buscar_usuario_por_dni(clave)
        if idioma != "es":
            actualizar_idioma(usuario["id"], idioma)
        session["usuario_id"]   = usuario["id"]
        session["nombre"]       = usuario["nombre"]
        session["rol"]          = usuario["rol"]
        session["avatar_path"]  = usuario.get("avatar_path")
        session["localidad"]    = usuario.get("localidad")
        session["idioma"]       = idioma
        resp = make_response(jsonify({"mensaje": f"¡Registro exitoso! Bienvenido, {usuario['nombre']}!",
                        "nombre": usuario["nombre"], "rol": usuario["rol"],
                        "idioma": idioma}))
        resp.set_cookie("idioma", idioma, max_age=31536000, path="/", samesite="Lax")
        return resp
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

        # Detectar idioma para que la IA responda en el mismo
        idioma = request.cookies.get("idioma") or session.get("idioma", "es")
        if idioma not in ("es", "qu"):
            idioma = "es"
        t0 = time.time()
        mensajes = [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imagen_base64}"}},
            {"type": "text", "text": obtener_prompt(idioma)}
        ]}]
        texto = _llm(mensajes, max_tokens=1024)
        global ultimo_tiempo_respuesta
        ultimo_tiempo_respuesta = round(time.time() - t0, 1)

        # La IA a veces envuelve el JSON en ```json ... ``` pese a la
        # instrucción del prompt; se limpia antes de parsear.
        texto = texto.strip()
        texto    = re.sub(r"```json|```", "", texto).strip()
        resultado = json.loads(texto)

        # Imagen no agrícola: no se persiste nada, se informa al frontend.
        if not resultado.get("valido", True):
            return jsonify(resultado)

        # Si hay enfermedades pero la IA no devolvió coordenadas de zona
        # afectada (común con Gemini), se injecta una zona por defecto
        # centrada en la imagen para que el overlay del frontend funcione.
        enfermedades = resultado.get("enfermedades", [])
        zona = resultado.get("zona_afectada", {})
        
        if enfermedades:
            if "box_2d" in zona and isinstance(zona["box_2d"], list) and len(zona["box_2d"]) == 4:
                try:
                    ymin, xmin, ymax, xmax = [int(v) for v in zona["box_2d"]]
                    zona["x"] = xmin
                    zona["y"] = ymin
                    zona["width"] = xmax - xmin
                    zona["height"] = ymax - ymin
                except (ValueError, TypeError):
                    pass

            if zona.get("x") is None:
                resultado["zona_afectada"] = {
                    "x": 10, "y": 10,
                    "width": 80, "height": 80,
                    "descripcion": zona.get("descripcion", "Zona afectada")
                }

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
    cultivo_raw  = contexto.get("cultivo", "cultivo desconocido")
    # Se usa solo el nombre común (sin el nombre científico entre paréntesis)
    # para evitar que el modelo se obsesione repitiéndolo en cada frase.
    cultivo = cultivo_raw.split("(")[0].strip() or cultivo_raw
    enfermedades = contexto.get("enfermedades", [])
    tratamiento  = contexto.get("tratamiento", "")
    localidad    = session.get("localidad", "Perú")

    enf_texto = ", ".join([e.get("nombre", "") for e in enfermedades]) if enfermedades else "ninguna"

    idioma = request.cookies.get("idioma") or session.get("idioma", "es")
    if idioma not in ("es", "qu"):
        idioma = "es"
    if idioma == "qu":
        instruccion_idioma = "Responde OBLIGATORIAMENTE en quechua (Runasimi). NO uses español en tu respuesta."
        idioma_inicio = "ATENCIÓN: Debes responder SIEMPRE en quechua (Runasimi), nunca en español.\n\n"
        regla_coherencia = (
            "Escribe quechua correcto, natural y coherente. "
            "NO mezcles español. NO repitas el nombre del cultivo en cada frase. "
            "Responde máximo 2 oraciones cortas y directas."
        )
    else:
        instruccion_idioma = "Responde SIEMPRE en español."
        idioma_inicio = ""
        regla_coherencia = (
            "Responde máximo 2 oraciones cortas y directas. "
            "No repitas el nombre del cultivo en cada frase."
        )

    system_prompt = f"""{idioma_inicio}Eres el asistente agronómico de FrutIA, especializado en cultivos peruanos.
Acabas de analizar un cultivo y el agricultor tiene preguntas de seguimiento.

CONTEXTO DEL DIAGNÓSTICO ACTUAL:
- Cultivo: {cultivo}
- Enfermedades: {enf_texto}
- Tratamiento recomendado: {tratamiento}
- Localidad del agricultor: {localidad}

Responde de forma clara, práctica y breve. Usa lenguaje sencillo, sin tecnicismos.

IMPORTANTE:
- Incluye emojis relacionados al campo (🌱🌿🍎🌽🥬🚜💧☀️🐛🧑‍🌾✅⚠️❌🛑💊📚 según corresponda).
- Usa **negritas** (con doble asterisco) para resaltar palabras clave como nombres de cultivos, enfermedades, tratamientos o datos importantes.
- Si la pregunta es sobre el cultivo analizado, responde con precisión. Si es completamente ajena a la agronomía, indícalo amablemente y redirige la conversación al cultivo.
- {regla_coherencia}
- {instruccion_idioma}"""

    # Armar historial de mensajes para la IA (solo las últimas 4 intervenciones
    # para evitar que el modelo se degrade en idiomas de bajos recursos).
    messages_groq = [{"role": "system", "content": system_prompt}]
    for msg in mensajes[-4:]:
        if msg.get("rol") in ("user", "assistant"):
            messages_groq.append({"role": msg["rol"], "content": msg["texto"]})
    messages_groq.append({"role": "user", "content": pregunta})

    try:
        respuesta = _llm(messages_groq, max_tokens=320)
        # Guarda el límite de 15 preguntas también en el backend (defensa en profundidad)
        pregunta_num = int(data.get("pregunta_num", 0) or 0)
        extra = {}
        if pregunta_num >= 15:
            extra["limite"] = True
        return jsonify({"respuesta": respuesta, **extra})
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
    provider = next((p for p in _LLM_PROVIDERS if p["api_key"]), None)
    return jsonify({
        "online":           provider is not None,
        "modelo":           f"{provider['name']} · {provider['model']}" if provider else "Sin proveedor",
        "ultimo_tiempo_s":  ultimo_tiempo_respuesta,
        "total_analisis":   stats["total_analisis"]
    })


# ── Exportación a PDF (WeasyPrint) ────────────────────────────────
# Generado 100% en el backend — no depende del tamaño de la ventana
# del navegador. El resultado es siempre idéntico sin importar el
# cliente, el viewport o el estado de carga de fuentes.

def format_text_for_pdf(text):
    if not isinstance(text, str):
        return text
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'^\s*\* ', ' • ', text, flags=re.MULTILINE)
    text = re.sub(r'\*([^*]+)\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\n{2,}', '\n', text)
    return text.replace('\n', '<br>')

app.jinja_env.filters['render_formatted'] = format_text_for_pdf
app.jinja_env.filters['strip_asterisks'] = lambda v: (v or '').replace('*', '')

REPORTE_PDF_TEMPLATE = """
<!DOCTYPE html>
<html lang="{{ idioma }}">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
    @bottom-center {
      content: "{{ t.generado_por }} FrutIA  |  {{ fecha }} {{ hora }}";
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
          <div class="logo-sub">{{ t.reporte_subtitulo }}</div>
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
          <div class="sin-img">{{ t.sin_imagen }}</div>
        {% endif %}
      </td>
      <td class="datos-col">
        <div class="cultivo-nombre">{{ cultivo }}</div>
        <table class="dato-tabla">
          <tr>
            <td class="dato-label">{{ t.estado_maduracion }}</td>
            <td class="dato-valor">{{ maduracion }}</td>
          </tr>
          <tr>
            <td class="dato-label">{{ t.confianza_ia }}</td>
            <td class="dato-valor">{{ confianza }}%</td>
          </tr>
        </table>
        <!-- Barra de confianza -->
        <div class="conf-wrap">
          <div class="conf-label">{{ t.nivel_confianza }}</div>
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
      <div class="bloque-titulo enfermedad"><img src="{{ emoji.warning }}" class="emoji-img" alt="">{{ t.enfermedades_detectadas }}</div>
      {% for e in enfermedades %}
        <div class="enf-item">
          <span class="enf-nombre">{{ e.nombre | strip_asterisks }}</span>
          <span class="enf-severidad">[ {{ e.severidad }} ]</span>
          {% if e.descripcion %}
            <div class="enf-desc">{{ e.descripcion }}</div>
          {% endif %}
        </div>
      {% endfor %}
    {% else %}
      <div class="bloque-titulo sano"><img src="{{ emoji.check }}" class="emoji-img" alt="">{{ t.cultivo_sano }}</div>
    {% endif %}
  </div>

  <!-- OBSERVACIONES VISUALES -->
  {% if explicacion %}
  <div class="bloque">
    <div class="bloque-titulo obs"><img src="{{ emoji.microscope }}" class="emoji-img" alt="">{{ t.observaciones }}</div>
    <ul class="obs-lista">
      {% for obs in explicacion %}<li>{{ obs | render_formatted | safe }}</li>{% endfor %}
    </ul>
  </div>
  {% endif %}

  <!-- TRATAMIENTO -->
  <div class="bloque">
    <div class="bloque-titulo tratamiento"><img src="{{ emoji.pill }}" class="emoji-img" alt="">{{ t.tratamiento }}</div>
    <div class="caja-tratamiento">
      {% if tratamiento and tratamiento != '—' %}
        {{ tratamiento | render_formatted | safe }}
      {% else %}
        {{ t.tratamiento_default }}
      {% endif %}
    </div>
  </div>

  <!-- RECOMENDACIÓN DE CONSUMO -->
  <div class="bloque">
    <div class="bloque-titulo obs" style="color: #9333EA;"><img src="{{ emoji.fork_knife }}" class="emoji-img" alt="">{{ t.recomendacion_consumo }}</div>
    <div class="caja-tratamiento" style="background: #FAF5FF; border-left-color: #A855F7;">
       {% if recomendacion_consumo and recomendacion_consumo.lower() not in ('sin contraindicaciones relevantes', 'mana ima contraindicación tarikunchu') %}
        {{ recomendacion_consumo | render_formatted | safe }}
      {% else %}
        {{ t.consumo_default }}
      {% endif %}
    </div>
  </div>

  <!-- FUENTES -->
  {% if fuentes %}
  <div class="bloque">
    <div class="bloque-titulo fuentes"><img src="{{ emoji.books }}" class="emoji-img" alt="">{{ t.fuentes }}</div>
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
    <img src="{{ emoji.warning }}" class="emoji-img" alt="">    {{ advertencia or t.advertencia }}
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

    idioma = request.cookies.get("idioma") or g.get("idioma", "es")
    if idioma not in ("es", "qu"):
        idioma = "es"

    PDF_T = {
        "es": {
            "reporte_subtitulo": "Reporte de Diagnóstico Agronómico",
            "sin_imagen": "Sin imagen",
            "estado_maduracion": "Estado de maduración",
            "confianza_ia": "Confianza de la IA",
            "nivel_confianza": "Nivel de confianza del diagnóstico",
            "enfermedades_detectadas": "Enfermedades detectadas",
            "cultivo_sano": "Cultivo en buen estado — sin enfermedades detectadas",
            "observaciones": "Observaciones Visuales",
            "tratamiento": "Tratamiento Recomendado",
            "tratamiento_default": "No requiere tratamiento fitosanitario especial.",
            "recomendacion_consumo": "Recomendación de Consumo",
            "consumo_default": "Sin contraindicaciones ni precauciones especiales detectadas.",
            "fuentes": "Fuentes consultadas",
            "advertencia": "Este diagnóstico es orientativo y no reemplaza la evaluación de un ingeniero agrónomo certificado.",
            "cultivo_default": "Cultivo desconocido",
            "maduracion_default": "—",
            "generado_por": "Generado automáticamente por",
        },
        "qu": {
            "reporte_subtitulo": "Chakra Diagnóstico Willakuy",
            "sin_imagen": "Mana rikcha",
            "estado_maduracion": "Puquy kay",
            "confianza_ia": "IA confianza",
            "nivel_confianza": "Diagnóstico confianza nivel",
            "enfermedades_detectadas": "Unquykuna tarisqa",
            "cultivo_sano": "Allin yuka — mana unquy tarikunchu",
            "observaciones": "Qhawaykuna",
            "tratamiento": "Hampiy",
            "tratamiento_default": "Mana hampiy necesitachu.",
            "recomendacion_consumo": "Mikhuy yuyay",
            "consumo_default": "Mana ima contraindicación tarikunchu.",
            "fuentes": "Willakuykuna",
            "advertencia": "Kay diagnóstico yuyayllapaq, mana ingeniero agronomo rantinchu.",
            "cultivo_default": "Mana riqsisqa yuka",
            "maduracion_default": "—",
            "generado_por": "Kay ruwasqa FrutIAwan",
        },
    }

    t = PDF_T.get(idioma, PDF_T["es"])

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
        t=t,
        idioma=idioma,
        cultivo=analisis.get("cultivo") or t["cultivo_default"],
        maduracion=analisis.get("maduracion") or t["maduracion_default"],
        confianza=analisis.get("confianza") or 0,
        enfermedades=analisis.get("enfermedades") or [],
        explicacion=analisis.get("explicacion") or [],
        tratamiento=analisis.get("tratamiento"),
        recomendacion_consumo=analisis.get("recomendacion_consumo"),
        fuentes=analisis.get("fuentes") or [],
        advertencia=analisis.get("advertencia") or t["advertencia"],
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



# ── Perfil del usuario autenticado ───────────────────────────────
# El usuario puede ver su perfil, editar nombre/región/localidad
# y eliminar su propia cuenta.

import re as _re

_TIENE_LETRA = re.compile(r'[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]')

@app.route("/perfil", methods=["GET"])
def perfil_ver():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    from database import obtener_perfil
    perfil = obtener_perfil(session["usuario_id"])
    if not perfil:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(perfil)

@app.route("/perfil", methods=["PUT"])
def perfil_editar():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    data = request.get_json() or {}
    nombre = data.get("nombre")
    region = data.get("region")
    localidad = data.get("localidad")

    if nombre is None and region is None and localidad is None:
        return jsonify({"error": "Indica al menos un campo a actualizar"}), 400

    if nombre is not None:
        nombre = nombre.strip()
        if not nombre:
            return jsonify({"error": "El nombre no puede estar vacío"}), 400
        if len(nombre) < 3 or len(nombre) > 30:
            return jsonify({"error": "El nombre debe tener entre 3 y 30 caracteres"}), 400
        if not _TIENE_LETRA.search(nombre):
            return jsonify({"error": "El nombre debe contener al menos una letra"}), 400
        if nombre_en_uso(nombre, excluir_id=session["usuario_id"]):
            return jsonify({"error": "Ya existe otro usuario con ese nombre"}), 409

    resultado = editar_usuario(session["usuario_id"], nombre=nombre, region=region, localidad=localidad)
    if resultado["ok"]:
        if nombre:
            session["nombre"] = nombre
        if localidad:
            session["localidad"] = localidad
        return jsonify({"mensaje": "Perfil actualizado correctamente"})
    return jsonify({"error": resultado.get("error", "No se pudo actualizar")}), 409

@app.route("/perfil", methods=["DELETE"])
def perfil_eliminar():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    eliminar_usuario(session["usuario_id"])
    session.clear()
    return jsonify({"mensaje": "Cuenta eliminada correctamente"})

@app.route("/perfil/idioma", methods=["POST"])
def perfil_idioma():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    data = request.get_json() or {}
    idioma = data.get("idioma", "es")
    if idioma not in ("es", "qu"):
        return jsonify({"error": "Idioma no soportado"}), 400
    actualizar_idioma(session["usuario_id"], idioma)
    session["idioma"] = idioma
    resp = make_response(jsonify({"mensaje": "Idioma actualizado", "idioma": idioma}))
    resp.set_cookie("idioma", idioma, max_age=31536000, path="/", samesite="Lax")
    return resp


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
    if not _TIENE_LETRA.search(nombre):
        return jsonify({"error": "El nombre debe contener al menos una letra"}), 400
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
        if not _TIENE_LETRA.search(nombre):
            return jsonify({"error": "El nombre debe contener al menos una letra"}), 400
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
