# 🏗️ Arquitectura de FrutIA

Este documento explica cómo están organizadas las piezas del proyecto, el
flujo de datos y el contrato de la API, pensado para que cualquier
desarrollador nuevo pueda orientarse rápido en el código.

---

## 1. Visión general

```
┌─────────────┐      fetch()       ┌──────────────┐      Groq API      ┌─────────────┐
│  Navegador   │ ─────────────────▶ │   Flask      │ ──────────────────▶│  Llama 4    │
│ (HTML/CSS/JS)│ ◀───────────────── │   app.py     │ ◀──────────────────│  Scout (IA) │
└─────────────┘      JSON          └──────┬───────┘      JSON          └─────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  database.py │
                                    │  (SQLite)    │
                                    └──────────────┘
```

- El **frontend** no tiene lógica de negocio: solo captura la imagen, la
  envía como base64 y pinta la respuesta JSON que recibe.
- **`app.py`** es el único punto que habla con la IA y con la base de datos.
  El frontend nunca llama a Groq directamente (la API key nunca se expone al
  navegador).
- **`database.py`** centraliza todo el acceso a SQLite. Ninguna ruta en
  `app.py` ejecuta SQL directamente.

---

## 2. Backend (`app.py`)

### 2.1 Responsabilidades

1. Servir las plantillas HTML (`/` decide entre login o app según la sesión)
2. Autenticar usuarios por clave (`/login`, `/logout`)
3. Recibir la imagen, armar el prompt, llamar a Groq y parsear la respuesta
   (`/analizar`)
4. Exponer historial y estadísticas del usuario logueado
5. Exponer rutas de administración protegidas por rol

### 2.2 Sesiones

Flask guarda en la cookie de sesión:

```python
session["usuario_id"]   # id numérico en la tabla usuarios
session["nombre"]       # nombre a mostrar en el navbar
session["rol"]          # "admin" | "agricultor"
session["idioma"]       # "es" o "qu" — idioma de la interfaz
```

Todas las rutas que requieren login verifican `"usuario_id" not in session`.
Las rutas de administración usan el decorador `requiere_admin`, que revisa
`session.get("rol") != "admin"` antes de ejecutar la función.

### 2.3 El prompt de IA

`PROMPT` (en `app.py`) le pide al modelo dos cosas en un solo paso:

1. **Validar** si la imagen es agrícola. Si no lo es, responde solo
   `{"valido": false, "motivo": "..."}` y el backend corta ahí — no se
   guarda nada en la base de datos.
2. Si es válida, devolver un **diagnóstico estructurado** en JSON: cultivo,
   maduración, confianza, enfermedades, explicación, zona afectada,
   tratamiento, advertencia y fuentes.

El backend limpia la respuesta de Groq con una regex (por si el modelo
envuelve el JSON en bloques ```json) y la parsea con `json.loads`. Si el
parseo falla, se devuelve un error 500 controlado en vez de romper la app.

### 2.4 Guardado de imágenes

Cada imagen analizada (si es válida) se guarda como archivo `.jpg` en
`static/uploads/` con un nombre único:

```
{usuario_id}_{fecha_hora}_{hash_corto}.jpg
```

La ruta relativa (`uploads/archivo.jpg`) se guarda en la columna
`imagen_path` de la tabla `analisis`, y es lo que el frontend usa para
mostrar la miniatura en el historial.

### 2.5 Reportes PDF

El endpoint `/reporte-pdf/<analisis_id>` genera el informe en backend con
`WeasyPrint` a partir de `REPORTE_PDF_TEMPLATE`. Esto evita depender del
viewport del navegador y produce un A4 estable para impresión.

Los íconos del reporte no se renderizan como caracteres emoji directos: se
incrustan como SVG locales desde `static/assets/emoji/`. Esta decisión evita
cuadros vacíos cuando el servidor no tiene instalada una fuente emoji completa.

---

## 3. Base de datos (`database.py`)

### 3.1 Motor

SQLite, archivo único `frutia.db` en la raíz del proyecto. No requiere
servidor de base de datos — ideal para una demo local o feria.

### 3.2 Esquema

**Tabla `usuarios`**

| Columna | Tipo    | Notas                          |
|---------|---------|----------------------------------|
| id      | INTEGER | PK autoincremental              |
| nombre  | TEXT    | Nombre a mostrar                |
| dni     | TEXT    | Clave de acceso (8 dígitos), UNIQUE |
| rol     | TEXT    | `"admin"` o `"agricultor"`      |
| avatar_path | TEXT | Ruta de la foto de perfil        |
| region  | TEXT    | Región de residencia            |
| localidad| TEXT   | Localidad de residencia         |
| idioma  | TEXT    | `"es"` o `"qu"` — defecto `"es"` |

> El nombre de columna `dni` se mantiene por compatibilidad histórica, pero
> en la interfaz **no se menciona como DNI** — se presenta como "clave de
> acceso" para no implicar que es un documento oficial.

**Tabla `analisis`**

| Columna        | Tipo     | Notas                                    |
|-----------------|----------|--------------------------------------------|
| id              | INTEGER  | PK autoincremental                         |
| usuario_id      | INTEGER  | FK → usuarios.id                           |
| cultivo         | TEXT     | Detectado por la IA                        |
| maduracion      | TEXT     | Verde / En desarrollo / Listo / Sobre maduro |
| confianza       | INTEGER  | 0–100                                       |
| enfermedades    | TEXT     | JSON serializado (lista de objetos)        |
| tratamiento     | TEXT     | Recomendación en texto libre               |
| explicacion     | TEXT     | JSON serializado (lista de strings)        |
| zona_afectada   | TEXT     | JSON serializado (objeto x/y/width/height) |
| fuentes         | TEXT     | JSON serializado (lista de objetos)        |
| imagen_path     | TEXT     | Ruta relativa dentro de `static/`          |
| fecha           | DATETIME | `CURRENT_TIMESTAMP` por defecto            |

Los campos `enfermedades`, `explicacion`, `zona_afectada` y `fuentes` se
guardan como **texto JSON** (no como tablas separadas) porque su estructura
viene directa de la respuesta de la IA y no necesita consultarse por
columnas individuales. `database.py` se encarga de serializar al guardar y
deserializar al leer (`obtener_historial`).

`inicializar_db()` crea ambas tablas si no existen, hace una migración
simple (`ALTER TABLE ... ADD COLUMN`, ignorando el error si la columna ya
existe) para proyectos que vengan de una versión anterior del esquema, y
siembra 3 usuarios de ejemplo si la tabla está vacía.

### 3.3 Funciones principales

| Función                        | Uso                                          |
|--------------------------------|-----------------------------------------------|
| `buscar_usuario_por_dni`       | Login                                          |
| `guardar_analisis`             | Persistir un diagnóstico                       |
| `obtener_historial`            | Listar análisis de un usuario (más recientes primero) |
| `obtener_estadisticas`         | Datos para el dashboard personal              |
| `obtener_todos_usuarios`       | Listado para el panel admin                   |
| `agregar_usuario` / `eliminar_usuario` | Gestión de usuarios (admin)            |
| `obtener_estadisticas_globales`| Datos para el dashboard de administración     |
| `actualizar_idioma`           | Cambia el idioma (es/qu) de un usuario         |

---

## 4. Frontend

### 4.1 Organización

Cada pantalla tiene **3 archivos separados** (HTML / CSS / JS), sin mezclar
estilos o lógica inline — facilita mantenimiento y es buena práctica para
proyectos que crecen:

```
templates/login.html  ──▶  static/css/login.css + static/js/login.js
templates/index.html  ──▶  static/css/index.css + static/js/index.js
```

Los templates usan Jinja2 (`{{ url_for('static', filename='...') }}`) para
generar las rutas a CSS/JS — nunca rutas hardcodeadas como `/static/...`,
para que sigan funcionando si la app se despliega en otra ruta base.

### 4.2 `index.html` — Single Page con secciones

La app principal es una sola página con 5 "secciones" (`<section class="seccion">`)
que se muestran/ocultan con JavaScript según el link del navbar que se
clickea: **Analizar, Historial, Dashboard, Futuro, Admin** (esta última solo
si `rol == "admin"`, controlado tanto en el HTML con Jinja2 como en el CSS).

No hay recarga de página al navegar entre secciones — todo ocurre vía
`fetch()` a las rutas JSON de Flask.

### 4.3 `index.js` — Flujo del analizador

1. `activarCamara()` pide permiso de cámara con `getUserMedia` (o se usa
   `<input type="file">` como alternativa)
2. Al tomar/subir la foto, se convierte a base64 y se llama a `analizarImagen()`
3. `analizarImagen()` hace `POST /analizar` y según la respuesta:
   - `data.valido === false` → `mostrarInvalido()`
   - error HTTP → `mostrarError()`
   - éxito → `mostrarResultado()`, que rellena el DOM con cultivo,
     confianza (barra de color), enfermedades, explicación, zona afectada
     (overlay posicionado con `%` sobre la imagen) y fuentes.
     El resultado se persiste en `localStorage` (`frutia_ultimo_analisis`)
     y al recargar la página `initState()` lo restaura automáticamente
     sin forzar la sección activa si el usuario está en otra sección.

### 4.4 Gráficas del dashboard

Usan **Chart.js** cargado por CDN. Se registró un plugin propio
(`emptyStatePlugin`) que dibuja un mensaje centrado ("Aún no hay análisis
registrados" / "Activa categorías desde la leyenda") cuando un gráfico no
tiene datos visibles — evita que el usuario vea un canvas en blanco sin
explicación.

### 4.5 Capas visuales

### 4.6 Internacionalización (Quechua/Español)

El sistema de idioma es 100% frontend con persistencia en backend:

- **Login**: selector flotante (🇪🇸 ES / 🇵🇪 QU) que cambia todos los textos vía
  `data-i18n` + diccionario `TRADUCCIONES{es, qu}` en `login.js`. El idioma
  se guarda en `localStorage` y se envía al backend al iniciar sesión.
- **Backend**: `POST /perfil/idioma` persiste el idioma en la columna `idioma`
  de la tabla `usuarios` y lo guarda en `session["idioma"]` para que sobreviva
  entre recargas.
- **Perfil**: el selector sigue el mismo patrón que nombre/región/localidad:
  icono 🌐, label "Idioma / Simi", botón "Editar" que muestra dos opciones
  toggle con banderas.

El idioma seleccionado persiste en localStorage y en la sesión del servidor,
por lo que un análisis en curso no se pierde al cambiar de idioma.

`index.css` centraliza el orden de apilamiento con variables CSS:
`--z-navbar`, `--z-toast`, `--z-mobile-nav` y `--z-modal`. El drawer móvil
vive por encima de los toasts cuando está abierto, mientras que los toasts
siguen apareciendo normalmente sobre el contenido en escritorio.

---

## 5. Contrato de la API

Todas las rutas devuelven JSON. Las que requieren sesión devuelven
`401 {"error": "..."}` si no hay usuario logueado; las de admin devuelven
`403 {"error": "Acceso denegado"}` si el rol no es `admin`.

| Método | Ruta                      | Auth   | Descripción                              |
|--------|---------------------------|--------|---------------------------------------------|
| GET    | `/`                       | —      | Sirve login o app según sesión              |
| POST   | `/login`                  | —      | `{dni}` → inicia sesión                     |
| POST   | `/registro`               | —      | `{nombre, region, localidad, dni}` → crea usuario  |
| GET    | `/logout`                 | —      | Cierra sesión                               |
| POST   | `/analizar`               | Sesión | `{imagen: base64}` → diagnóstico IA         |
| GET    | `/historial`              | Sesión | Lista de análisis del usuario               |
| GET    | `/estadisticas`           | Sesión | Datos para el dashboard personal            |
| POST   | `/perfil/avatar`          | Sesión | `{avatar: file}` → actualiza foto de perfil |
| GET    | `/perfil`                 | Sesión | Datos del perfil del usuario autenticado      |
| PUT    | `/perfil`                 | Sesión | `{nombre, region, localidad}` → edita perfil  |
| DELETE | `/perfil`                 | Sesión | Elimina la cuenta del usuario y sus análisis  |
| POST   | `/perfil/idioma`          | Sesión | `{idioma}` → cambia idioma (es/qu) del usuario       |
| POST   | `/chat`                   | Sesión | Pregunta de seguimiento con contexto del diagnóstico |
| GET    | `/reporte-pdf/<id>`       | Sesión | Genera y descarga el reporte PDF de un análisis |
| GET    | `/admin/usuarios`         | Admin  | Lista de todos los usuarios                 |
| POST   | `/admin/usuarios`         | Admin  | `{nombre, clave, rol, region, localidad}` → crea usuario |
| PUT    | `/admin/usuarios/<id>`    | Admin  | `{nombre, clave}` → edita usuario           |
| DELETE | `/admin/usuarios/<id>`    | Admin  | Elimina usuario (y sus análisis)            |
| GET    | `/admin/usuarios/<id>/historial` | Admin  | Obtiene perfil y todos los análisis de un usuario específico |
| GET    | `/admin/estadisticas`     | Admin  | Estadísticas globales de la plataforma      |

---

## 6. Decisiones de diseño relevantes

- **¿Por qué SQLite y no PostgreSQL/MySQL?** El proyecto está pensado para
  correr localmente en una demo o feria, sin infraestructura adicional. Si
  el proyecto creciera a producción real, sería el primer punto a migrar.
- **¿Por qué Groq y no la API directa de algún proveedor de pago?** Groq
  ofrece acceso gratuito a un modelo de visión (Llama 4 Scout) suficiente
  para esta demo, sin necesidad de tarjeta de crédito.
- **¿Por qué JSON serializado en columnas de texto en vez de tablas
  normalizadas para enfermedades/fuentes?** La cardinalidad es baja (pocas
  enfermedades/fuentes por análisis) y nunca se consultan de forma aislada
  fuera del contexto de "un análisis completo" — normalizar agregaría
  complejidad sin beneficio real en este caso de uso.
- **¿Por qué la validación de "imagen agrícola" vive en el prompt y no en
  un modelo de clasificación aparte?** Mantiene la arquitectura simple (una
  sola llamada a la IA) a costa de depender de que el modelo siga bien la
  instrucción — suficiente para el alcance actual del proyecto.
