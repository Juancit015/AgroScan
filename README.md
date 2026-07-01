# 🌱 AgroScan

Diagnóstico inteligente de cultivos mediante visión artificial. Sube o captura
una foto de un cultivo y AgroScan identifica la especie, evalúa su estado de
madurez, detecta posibles enfermedades y recomienda un tratamiento — citando
fuentes agronómicas confiables.

Proyecto desarrollado como herramienta de apoyo para la carrera de
Agropecuaria, con foco en cultivos de **Paijan, La Libertad, Perú** (región
líder en exportación de espárrago).

> ⚠️ AgroScan es un asistente de apoyo al diagnóstico. No reemplaza la
> evaluación de un ingeniero agrónomo certificado.

---

## ✨ Funcionalidades

- 📷 **Captura por cámara o subida de archivo** desde el navegador
- 🤖 **Diagnóstico con IA** (Groq · Llama 4 Scout, modelo de visión)
- 🚫 **Validación de imágenes** — rechaza fotos que no sean de cultivos
- 📊 **Barra de confianza** con código de color (verde / amarillo / rojo)
- 🔴 **Zona afectada** marcada visualmente sobre la imagen
- 🔬 **Explicación del diagnóstico** — observaciones que justifican el resultado
- 🚨 **Alertas Regionales Epidemiológicas** — cruzamiento de datos de la zona para alertar sobre brotes recientes
- 📄 **Exportación a PDF** — descarga de informes agronómicos listos para imprimir (`html2pdf.js`)
- 📚 **Fuentes citadas** con enlaces directos verificados mediante Google Search
- 📋 **Historial** de análisis con imagen guardada, barra de confianza y filtros dinámicos por tipo de cultivo
- 📈 **Dashboard** con gráficas (estado de cultivos, enfermedades frecuentes,
  cultivos analizados, actividad semanal, confianza promedio)
- 🔐 **Login y Registro de Usuarios** (Clave de 8 dígitos numérica, registro con datos de Región y Localidad)
- ⚙️ **Panel de administración avanzado** — gestión de usuarios, buscador, filtros por región/localidad, vista de historial detallado por usuario, y estadísticas globales
- 🔮 Sección de **futuras integraciones** (drones, IoT, robots, satélites)

---

## 🛠️ Stack tecnológico

| Capa           | Tecnología                                   |
|----------------|-----------------------------------------------|
| Backend        | Python 3 + Flask                              |
| Base de datos  | SQLite (archivo único, sin servidor)          |
| IA / Visión    | Groq API — `meta-llama/llama-4-scout-17b-16e-instruct` |
| Frontend       | HTML + CSS + JavaScript (vanilla)             |
| Gráficas       | Chart.js                                      |
| Sesiones       | Flask session (cookie firmada)                |

---

## 📁 Estructura del proyecto

```
AgroScan/
├── app.py              # Rutas Flask, lógica de la API y llamada a Groq
├── database.py         # Acceso a SQLite (usuarios, análisis, estadísticas)
├── .env                # Variables de entorno (API key) — no se sube a git
├── agroscan.db          # Base de datos SQLite (se crea sola al arrancar)
├── templates/
│   ├── login.html       # Pantalla de inicio de sesión
│   └── index.html       # App principal (analizador, historial, dashboard, admin)
└── static/
    ├── css/
    │   ├── login.css
    │   └── index.css
    ├── js/
    │   ├── login.js
    │   └── index.js
    ├── uploads/          # Imágenes analizadas, guardadas por el backend
    └── favicon.ico
```

Ver **[ARCHITECTURE.md](ARCHITECTURE.md)** para el detalle de cómo se
comunican estas piezas, el modelo de datos y el contrato de la API.

---

## 🚀 Instalación y arranque

### 1. Requisitos
- Python 3.10+
- Una API key gratuita de [Groq](https://console.groq.com)

### 2. Instalar dependencias

```bash
pip install flask flask-cors python-dotenv groq --break-system-packages
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```
GROQ_API_KEY=tu_api_key_aqui
```

### 4. Arrancar el servidor

```bash
python3 app.py
```

Abre **http://127.0.0.1:5000** en el navegador.

La base de datos (`agroscan.db`) y sus tablas se crean automáticamente la
primera vez que se ejecuta `app.py`, junto con 3 usuarios de ejemplo (ver
`database.py → inicializar_db()`).

---

## 🔑 Acceso

El sistema usa una **clave numérica de 8 dígitos** por usuario. Los usuarios nuevos pueden registrarse desde la pantalla de login indicando su nombre, región, localidad y clave de acceso de 8 dígitos. Los roles son:

- `agricultor` — acceso al analizador, historial y dashboard personal (rol por defecto al registrarse).
- `admin` — además accede al panel de administración (gestión de usuarios, estadísticas globales, y detalles e historial de todos los usuarios). Solo puede ser asignado por otro admin.

---

## 📌 Notas de diseño

- La paleta de colores y tipografías (Syne + Inter) se mantienen consistentes
  en todas las pantallas — ver variables CSS en la cabecera de cada archivo
  `.css`.
- El servidor de desarrollo de Flask (`debug=True`) **no está pensado para
  producción**. Para una feria o demo local es suficiente.
- Las imágenes analizadas se guardan en `static/uploads/`; este directorio
  puede crecer con el uso y no se limpia automáticamente.

---

## 📄 Documentación relacionada

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — arquitectura, modelo de datos, rutas de la API
- **[CHANGELOG.md](CHANGELOG.md)** — historial de cambios del proyecto
