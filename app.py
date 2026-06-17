from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from dotenv import load_dotenv
from database import inicializar_db, buscar_usuario_por_dni, guardar_analisis, obtener_historial, obtener_estadisticas
from groq import Groq
import base64, os, json, re

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
    {
      "nombre": "nombre de la enfermedad o plaga",
      "severidad": "Leve / Moderada / Severa",
      "descripcion": "breve descripción visual"
    }
  ],
  "explicacion": [
    "Observación visual 1 que llevó al diagnóstico",
    "Observación visual 2 que llevó al diagnóstico",
    "Observación visual 3 que llevó al diagnóstico"
  ],
  "zona_afectada": {
    "x": 20,
    "y": 30,
    "width": 40,
    "height": 35,
    "descripcion": "Zona con mayor evidencia de la condición detectada"
  },
  "tratamiento": "recomendación concreta de qué hacer",
  "advertencia": "Este diagnóstico es orientativo. Consulta a un ingeniero agrónomo para confirmación.",
  "fuentes": [
    {
      "titulo": "título de la fuente",
      "url": "https://url-de-la-fuente.com",
      "institucion": "FAO / SENASA / MINAGRI / otro"
    }
  ]
}

Notas:
- Si no hay enfermedades: "enfermedades" = [] y "zona_afectada" = {}
- zona_afectada: coordenadas aproximadas en % (0-100) de la zona más afectada visible
- explicacion: 3 a 5 observaciones visuales específicas y concretas
"""

@app.route("/")
def index():
    if "usuario_id" not in session:
        return render_template("login.html")
    return render_template("index.html", usuario=session.get("nombre"))


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    dni = data.get("dni", "").strip()
    if not dni:
        return jsonify({"error": "Ingresa tu DNI"}), 400
    usuario = buscar_usuario_por_dni(dni)
    if not usuario:
        return jsonify({"error": "DNI no registrado en el sistema"}), 401
    session["usuario_id"] = usuario["id"]
    session["nombre"]     = usuario["nombre"]
    session["rol"]        = usuario["rol"]
    return jsonify({"mensaje": f"Bienvenido, {usuario['nombre']}!", "nombre": usuario["nombre"], "rol": usuario["rol"]})


@app.route("/logout")
def logout():
    session.clear()
    return jsonify({"mensaje": "Sesión cerrada"})


@app.route("/analizar", methods=["POST"])
def analizar():
    if "usuario_id" not in session:
        return jsonify({"error": "No has iniciado sesión"}), 401
    data = request.get_json()
    if not data or "imagen" not in data:
        return jsonify({"error": "No se recibió ninguna imagen"}), 400
    try:
        imagen_base64 = data["imagen"]
        if "," in imagen_base64:
            imagen_base64 = imagen_base64.split(",")[1]

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imagen_base64}"}},
                    {"type": "text", "text": PROMPT}
                ]
            }],
            max_tokens=1024
        )

        texto = response.choices[0].message.content.strip()
        texto = re.sub(r"```json|```", "", texto).strip()
        resultado = json.loads(texto)

        # Si la imagen no es agrícola, no guardar en DB
        if not resultado.get("valido", True):
            return jsonify(resultado)

        resultado["analisis_id"] = guardar_analisis(session["usuario_id"], resultado)
        return jsonify(resultado)

    except json.JSONDecodeError:
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
