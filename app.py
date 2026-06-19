"""
app.py — AgroScan backend (Flask)

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

from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps
from database import (inicializar_db, buscar_usuario_por_dni, guardar_analisis,
                      obtener_historial, obtener_estadisticas,
                      obtener_todos_usuarios, agregar_usuario, eliminar_usuario,
                      obtener_estadisticas_globales)
from groq import Groq
import base64, os, json, re, uuid
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)
app.secret_key = "agroscan_secret_2024"

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
inicializar_db()

PROMPT = """
Eres un experto en agronomía y fitosanidad especializado en cultivos peruanos.
Analiza la imagen y responde ÚNICAMENTE con un JSON válido, sin texto extra, sin bloques de código.

PASO 1 — Validación:
Determina si la imagen contiene un cultivo, fruta, hortaliza, planta, hoja o producto agrícola.
Si NO es agrícola responde SOLO: {"valido": false, "motivo": "descripción breve de lo que se ve"}

PASO 2 — Diagnóstico (solo si es agrícola):
{
  "valido": true,
  "cultivo": "nombre del cultivo detectado",
  "maduracion": "Verde / En desarrollo / Listo para cosecha / Sobre maduro",
  "confianza": 85,
  "enfermedades": [
    {"nombre": "nombre","severidad": "Leve / Moderada / Severa","descripcion": "descripción visual"}
  ],
  "explicacion": ["Observación 1","Observación 2","Observación 3"],
  "zona_afectada": {"x":20,"y":30,"width":40,"height":35,"descripcion":"Zona afectada"},
  "tratamiento": "recomendación concreta",
  "advertencia": "Este diagnóstico es orientativo. Consulta a un ingeniero agrónomo para confirmación.",
  "fuentes": [{"titulo":"título","url":"https://url.com","institucion":"FAO / SENASA / MINAGRI"}]
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
                           rol=session.get("rol"))

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    dni  = data.get("dni", "").strip()
    if not dni:
        return jsonify({"error": "Ingresa tu clave"}), 400
    usuario = buscar_usuario_por_dni(dni)
    if not usuario:
        return jsonify({"error": "Credenciales incorrectas"}), 401
    session["usuario_id"] = usuario["id"]
    session["nombre"]     = usuario["nombre"]
    session["rol"]        = usuario["rol"]
    return jsonify({"mensaje": f"Bienvenido, {usuario['nombre']}!",
                    "nombre": usuario["nombre"], "rol": usuario["rol"]})

@app.route("/logout")
def logout():
    session.clear()
    return jsonify({"mensaje": "Sesión cerrada"})

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

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imagen_base64}"}},
                {"type": "text", "text": PROMPT}
            ]}],
            max_tokens=1024
        )

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
        return jsonify(resultado)

    except json.JSONDecodeError:
        # La IA no devolvió JSON válido (raro, pero puede pasar).
        return jsonify({"error": "La IA no devolvió un formato válido. Intenta de nuevo."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/historial")
def historial():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    return jsonify(obtener_historial(session["usuario_id"]))

@app.route("/estadisticas")
def estadisticas():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    return jsonify(obtener_estadisticas(session["usuario_id"]))

# ── Rutas Admin ───────────────────────────────────────────────────

@app.route("/admin/usuarios")
@requiere_admin
def admin_usuarios():
    return jsonify(obtener_todos_usuarios())

@app.route("/admin/usuarios", methods=["POST"])
@requiere_admin
def admin_agregar_usuario():
    data   = request.get_json()
    nombre = data.get("nombre", "").strip()
    clave  = data.get("clave", "").strip()
    rol    = data.get("rol", "agricultor")
    if not nombre or not clave:
        return jsonify({"error": "Nombre y clave son requeridos"}), 400
    if len(clave) != 8 or not clave.isdigit():
        return jsonify({"error": "La clave debe tener exactamente 8 dígitos"}), 400
    resultado = agregar_usuario(nombre, clave, rol)
    if resultado["ok"]:
        return jsonify({"mensaje": f"Usuario {nombre} creado correctamente"})
    return jsonify({"error": "La clave ya está registrada"}), 409

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
