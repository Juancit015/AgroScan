# Changelog

Todos los cambios relevantes de AgroScan se documentan en este archivo.

El formato sigue el espíritu de [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/):
cada versión agrupa los cambios en **Agregado**, **Cambiado**, **Corregido** o
**Eliminado**. Las fechas usan formato `AAAA-MM-DD`.

---

## [No publicado]

### Agregado
- **Modal de Eliminación de Usuario**: Se reemplazó el cuadro de diálogo por defecto del navegador (`confirm()`) por un panel (modal) de advertencia personalizado e integrado en la interfaz de usuario en la sección de administración, mejorando la coherencia visual.
- **Tipografía Global**: Se aplicó la fuente **Montserrat** en toda la plataforma web (login, dashboard, paneles), exceptuando los reportes PDF generados en backend (los cuales mantienen Arial por seguridad de compatibilidad al imprimir).

### Corregido
- **Parpadeo en la navegación**: Se solucionó un efecto visual de "parpadeo" que ocurría al recargar la página (`F5`), donde la plataforma mostraba fugazmente la vista del 'Analizador' antes de redirigir a la sección guardada. La inicialización del estado ahora se ejecuta de forma síncrona antes del primer renderizado visual del navegador.
- **Menú móvil vs. notificaciones**: Se ordenó la escala de `z-index` del frontend
  mediante variables CSS (`--z-navbar`, `--z-toast`, `--z-mobile-nav`,
  `--z-modal`). El drawer hamburguesa móvil ahora queda por encima de los
  toasts cuando está abierto, sin alterar la posición ni animaciones de las
  notificaciones en escritorio.
- **Emojis del reporte PDF**: Los íconos del reporte generado con WeasyPrint
  ya no dependen de la fuente emoji instalada en el sistema. Se agregaron SVG
  locales en `static/assets/emoji/` y el template backend los incrusta como
  imágenes, evitando cuadros vacíos en secciones como "Observaciones Visuales"
  y "Tratamiento Recomendado".

### Por hacer (roadmap)
- Comparación temporal entre análisis del mismo cultivo (antes / después)
- Limpieza periódica de `static/uploads/`
- Rate limiting sobre `/analizar`
- Expiración explícita de sesión

## [0.8.1] — 2026-07-07

### Agregado
- **Recomendaciones de Consumo**: La IA ahora incluye advertencias dietéticas y sugerencias alimentarias basadas en el cultivo y su estado de maduración (por ejemplo, advertencias de altos niveles de azúcar para personas con diabetes). Esta información se muestra en la interfaz web y se exporta en el reporte PDF, incrementando el valor del diagnóstico.
- **Estandarización de Nombres Peruanos**: La IA ahora está forzada a devolver el nombre local del cultivo en Perú (ej. "Palta" en vez de "Aguacate") acompañado de su nombre científico, lo que hace el reporte mucho más profesional y útil para el sector agrícola local.

### Arreglado
- **Exportación a PDF**: Se solucionó un problema crítico de inconsistencia en el formato del reporte PDF. La generación dependía del tamaño de la ventana (viewport) del navegador (`html2pdf.js`). Ahora el PDF se renderiza en el backend de forma nativa (`WeasyPrint`), garantizando un formato profesional y estable tamaño A4, independiente del dispositivo o resolución del usuario. Además, se restauraron el logo oficial y la imagen original del cultivo en el reporte.


## [0.8.0] — 2026-06-30

### Agregado
- **Registro de Usuarios Autogestionado**: Los usuarios ahora pueden registrarse directamente desde la pantalla de login `/login`. Incluye campos para Nombre, Clave (8 dígitos), Región y Localidad.
- **Datos Geográficos de Usuarios**: Se agregó la funcionalidad de seleccionar Región y Localidad (con menús desplegables en cascada) tanto en el registro como en el panel de administrador, enriqueciendo el perfil del usuario.
- **Panel de Administración Mejorado**:
  - Buscador en tiempo real por nombre o DNI.
  - Filtros por Región y Localidad para encontrar usuarios de zonas específicas.
  - Al hacer clic en un usuario, se abre un **Modal de Detalles del Usuario** que muestra toda su información (Región, Localidad, Rol) y su **historial detallado de análisis** (imágenes, diagnósticos, confianza, etc.).
  - **Organización Inteligente**: La lista de usuarios ahora se ordena automáticamente mostrando primero a los Administradores y luego alfabéticamente.
  - **Identificador de Sesión Activa**: Se resalta al usuario logueado con la etiqueta `(Tú)` y se oculta el botón "Eliminar" en su propia fila para prevenir accidentes.

### Escaneo y Diagnóstico
- **Chat de Seguimiento Post-Diagnóstico**: Se incorporó un widget de chat conversacional directamente en el panel de resultados. El agricultor puede hacer preguntas libres sobre el cultivo recién analizado (clima, disponibilidad del tratamiento, plazo de cosecha, etc.) y la IA responde con el contexto exacto del diagnóstico. El historial del chat se reinicia con cada nuevo análisis. Nuevo endpoint `/chat`.
- **Alertas Epidemiológicas Regionales**: Sistema de "inteligencia comunitaria". Al finalizar un escaneo, AgroScan verifica en milisegundos si en la misma Localidad del usuario se han reportado múltiples casos de la misma enfermedad en los últimos 7 días. De ser así, despliega una alerta visual preventiva.
- **Exportación a PDF**: Se incorporó la opción de "Exportar a PDF" el resultado de los análisis. Genera un reporte agronómico formal y maquetado (tamaño A4) ideal para impresión usando `html2pdf.js`.
- **Fuentes de Búsqueda Confiables**: Se mejoró el prompt de la IA para evitar "alucinaciones" de enlaces caídos. Ahora el sistema extrae el título e institución y construye un acceso rápido y directo mediante *Google Search*.

### Historial del Usuario
- **Filtro de Cultivos**: Los usuarios ahora pueden filtrar dinámicamente su lista de análisis históricos mediante un menú desplegable que detecta y agrupa automáticamente los tipos de cultivo analizados.

### Diseño
- **Insignia de Administrador**: Se actualizó el color del rol Admin en toda la plataforma a un púrpura intenso (`#6D28D9`), creando un mayor contraste frente a la paleta verde/tierra predominante y facilitando su distinción rápida en la tabla.
- **Endpoint `/admin/usuarios/<uid>/historial`**: Permite al administrador consultar el perfil y todos los análisis pasados de un usuario específico de manera remota.

---

## [0.7.0] — 2026-06-21

### Agregado
- **Sistema de notificaciones (toast) reutilizable**: `mostrarToast(tipo,
  título, descripción, duraciónMs)` en `index.js`, con estilo "logro
  desbloqueado" — ícono circular según tipo (success/error/warning/info),
  entrada deslizante desde la esquina, barra de progreso de auto-cierre y
  botón de cierre manual. Reemplaza los `alert()` nativos del panel admin
  (crear/editar/eliminar usuario) y se conecta también a los errores de
  análisis, para que sean visibles aunque el usuario no esté mirando el
  panel de resultados en ese momento.
- **Detección inteligente de cámara**: en escritorio, el botón "Tomar
  foto" ahora verifica primero (`navigator.mediaDevices.enumerateDevices`)
  si existe una cámara física conectada. Si no la hay, se informa con un
  toast claro en vez de abrir un selector de archivos confuso o dejar que
  el navegador falle en silencio. En móvil el comportamiento no cambia:
  sigue abriendo la cámara nativa directamente.
- **Avatar de perfil**: columna `avatar_path` en la tabla `usuarios`
  (migración no destructiva), endpoint `POST /perfil/avatar` (multipart,
  valida extensión: png/jpg/jpeg/webp/gif) y funciones `actualizar_avatar`
  / `subir_avatar`. El avatar es siempre circular; sin foto se muestra un
  círculo con la inicial del nombre sobre fondo de marca (estilo
  GitHub/Discord), clicable tanto en el navbar de escritorio como dentro
  del drawer móvil para subir una nueva imagen sin recargar la página.
- **Logo editable con fallback automático**: `templates/login.html` e
  `templates/index.html` ahora cargan `static/assets/logo.png` mediante
  `<img onerror=...>`; si el archivo no existe, el `onerror` oculta la
  imagen y muestra el emoji 🌱 de respaldo sin romper el layout. Se agregó
  `static/assets/LEEME.txt` con las recomendaciones de tamaño/formato.

### Cambiado
- **Login totalmente responsive**: se reemplazaron los `font-size` fijos
  del panel de login por `clamp()` (título, subtítulo, logo, tags), se
  agregó `min-width: 0` a ambos paneles flex (la causa real del
  desbordamiento: por defecto los hijos flex no se encogen por debajo del
  ancho de su contenido) y `overflow-wrap: break-word` como red de
  seguridad. El `min-height` fijo de 540px del wrapper pasa a
  `min(540px, 90vh)` para no desbordar en pantallas bajas (móvil en
  horizontal), con un media query adicional para `max-height: 560px`.
- El navbar gana padding vertical (`.55rem`) para acomodar el avatar, que
  es visualmente más grande que el emoji que reemplaza.

### Corregido
- Se eliminó CSS huérfano (`.hint`) en `login.css`, resabio del bloque de
  "usuarios de prueba" retirado en una versión anterior del HTML.

---

## [0.6.0] — 2026-06-20

### Agregado
- **Edición de usuarios** desde el panel admin (`PUT /admin/usuarios/<id>`):
  permite cambiar nombre y/o clave de un usuario existente sin necesidad de
  eliminarlo y volver a crearlo. El rol no es editable desde esta ruta.
- **Bloqueo de nombres duplicados**: `nombre_en_uso()` en `database.py`
  compara nombres de forma insensible a mayúsculas/espacios y se usa tanto
  al crear como al editar usuarios, devolviendo `409 Conflict` con un
  mensaje claro si ya existe alguien con ese nombre.
- Límite de 30 caracteres en el campo nombre (formularios de creación y
  edición), validado en frontend y backend.
- **Persistencia real de imágenes en el historial**: cada análisis ahora
  guarda su foto en `static/uploads/` y el historial la muestra como
  miniatura en cada tarjeta, junto con una mini barra de confianza.
- Plugin `emptyStatePlugin` para Chart.js: dibuja un mensaje contextual
  ("Aún no hay análisis registrados" / "Activa categorías desde la
  leyenda") cuando un gráfico del dashboard queda sin datos visibles, en
  vez de mostrar un canvas vacío sin explicación.
- **Widget "Estado del sistema"** en la sección Analizar: nueva ruta
  `GET /estado` que reporta si la IA está configurada, qué modelo usa,
  cuánto tardó la última respuesta (medido en tiempo real alrededor de la
  llamada a Groq) y el total de análisis del usuario. Antes el HTML del
  widget existía sin ninguna ruta ni JS que lo alimentara, por lo que se
  quedaba indefinidamente en "Cargando...".
- **Navbar responsive rediseñado**: en escritorio el menú es siempre
  visible y se reorganiza solo con `flex-wrap` + `clamp()` al achicar la
  ventana, sin colapsar nunca a hamburguesa. En móvil aparece un menú
  hamburguesa con drawer lateral.

### Corregido
- **Cámara no funcionaba en Android (Chrome)**: `getUserMedia` requiere
  HTTPS o `localhost` real, y `127.0.0.1` accedido desde el teléfono en la
  misma red no califica como origen seguro para el navegador, por lo que
  la cámara fallaba en silencio. Se reemplazó por completo el flujo de
  captura por `<input type="file" capture="environment">`, que delega en
  la app de cámara nativa del sistema operativo y funciona igual de bien
  en PC y móvil. La opción "Cámara en vivo (solo PC)" basada en
  `getUserMedia` se evaluó como redundante una vez resuelto esto y se
  eliminó por completo (HTML, CSS y JS, incluyendo los elementos
  `<video>`/`<canvas>` que ya no se usaban).
- **Menú hamburguesa con opciones no clicables**: el overlay oscuro y el
  panel deslizante (drawer) vivían como elementos hermanos en el DOM con
  z-index distintos, lo que en ciertos casos de stacking context dejaba al
  overlay por encima del drawer y bloqueaba los toques. Se corrigió
  anidando el drawer **dentro** del overlay, de forma que ambos comparten
  el mismo contexto de apilamiento.
- **Texto del menú móvil "oscurecido"**: los links usaban un color con
  60% de opacidad que solo subía a blanco en `:hover` — un estado que no
  existe en pantallas táctiles. Ahora el texto tiene buen contraste desde
  el primer render.
- **Botón "Salir" duplicado y suelto en móvil**: al activarse el menú
  hamburguesa, el botón Salir del navbar principal seguía visible junto
  al ícono de hamburguesa, separado de su versión (correcta) dentro del
  drawer. Se oculta ahora el bloque completo `.nav-usuario` del navbar
  principal en el breakpoint móvil.
- Hover de elevación (`translateY` + sombra ampliada) en las tarjetas del
  dashboard, considerado innecesario una vez visto en uso — se mantiene el
  resto del retoque visual (sombra base, borde superior verde) sin el
  efecto de movimiento.
- Bug de funciones duplicadas en `database.py`: `obtener_todos_usuarios`,
  `agregar_usuario`, `eliminar_usuario` y `obtener_estadisticas_globales`
  estaban definidas dos veces; la segunda definición sobrescribía
  silenciosamente a la primera en tiempo de importación, perdiendo campos
  como `por_cultivo`, `por_enfermedad` y `actividad_semanal` del panel
  admin. Se fusionaron en una sola versión que conserva lo mejor de ambas.
- Bug de markup: quedaba un `</nav>` huérfano y un `<div class="nav-overlay">`
  vacío duplicado, remanentes de una reestructuración anterior del navbar.

### Diseño
- Rediseño del botón "Salir": de un botón rectangular discreto a una
  píldora con ícono de logout, borde sutil y estado hover que invierte a
  fondo blanco con texto verde, integrándose mejor con el resto de la
  interfaz.
- Tipografía y espaciado de los links del navbar de escritorio
  incrementados ligeramente (`.82rem` → `.92rem`) para mejorar legibilidad,
  y el estado "activo" pasa de un gris translúcido apenas perceptible al
  verde claro de la paleta con una sombra sutil.

- `requirements.txt` con las dependencias exactas del proyecto, y
  `.env.example` como plantilla para que un nuevo colaborador sepa qué
  variable de entorno necesita sin exponer ninguna key real.
- `LICENSE` (MIT) para dejar claros los términos de uso del código al
  publicarlo en un repositorio público.
- `README.md` reescrito de cero pensado específicamente para GitHub:
  badges, tabla de contenidos, diagrama de flujo simplificado, tabla de
  rutas de la API y guía de instalación verificada paso a paso.
- `ARCHITECTURE.md` reescrito de cero para reflejar el estado actual del
  proyecto (panel admin, validación de imágenes, navbar responsive, etc.),
  incluyendo una tabla de decisiones de diseño con sus alternativas
  consideradas y una sección de limitaciones conocidas.

---

## [0.5.0] — 2026-06-19

### Agregado
- `README.md`, `ARCHITECTURE.md` y este `CHANGELOG.md` como documentación
  formal del proyecto, pensados para que un desarrollador externo entienda
  el contexto, la arquitectura y la evolución sin depender del historial de
  chat.
- Docstrings de módulo en `app.py` y `database.py` describiendo su
  responsabilidad y apuntando a `ARCHITECTURE.md` / `CHANGELOG.md`.
- Comentarios explicativos dentro de `analizar()` (el endpoint más complejo
  del backend) describiendo el flujo de validación → guardado de imagen →
  persistencia en BD.
- `.gitignore` para evitar subir `.env`, `agroscan.db` y las imágenes de
  `static/uploads/` a un repositorio.

### Corregido
- El mensaje de error del login (`"DNI no registrado en el sistema"`) se
  generaliza a `"Clave incorrecta"`, consistente con el resto de la
  interfaz, que ya no expone que la clave es el DNI.

---

## [0.4.0] — 2026-06-18

### Agregado
- **Panel de administración** (`/admin/*`), visible solo para usuarios con
  rol `admin`:
  - Listado de todos los usuarios con su cantidad de análisis y fecha del
    último análisis.
  - Alta de usuarios (nombre, clave de 8 dígitos, rol) con validación.
  - Baja de usuarios (con confirmación; un admin no puede eliminarse a sí
    mismo).
  - Estadísticas globales de la plataforma: total de análisis, total de
    usuarios, confianza promedio, enfermedad más común, usuario más activo,
    proporción sanos / con posibles enfermedades.
- Decorador `requiere_admin` en `app.py` para proteger las rutas de admin.
- Funciones de acceso a datos para administración en `database.py`:
  `obtener_todos_usuarios`, `agregar_usuario`, `eliminar_usuario`,
  `obtener_estadisticas_globales`.
- Badge visual "Admin" junto al nombre de usuario y pestaña ⚙️ Admin en el
  navbar (solo se renderiza si `session["rol"] == "admin"`).

### Cambiado
- El login ya no expone que la clave de acceso corresponde al DNI del
  usuario, ni en el rótulo del campo ni en los mensajes de error — se
  generaliza como "clave de acceso" / "clave incorrecta".
- Tarjetas del historial: se incrementa el padding interno y se añade una
  sombra más pronunciada (`box-shadow` con tono verde) más un borde inferior
  verde para mejorar la separación visual entre tarjetas.

### Eliminado
- Bloque de ayuda "👥 Usuarios de prueba" en `login.html`, que mostraba en
  texto plano los datos de acceso de los usuarios semilla. Se retira por
  buenas prácticas de seguridad antes de cualquier presentación pública.

---

## [0.3.0] — 2026-06-18

### Agregado
- **Persistencia de imágenes**: cada foto analizada se guarda en
  `static/uploads/<usuario_id>_<timestamp>_<hash>.jpg` y su ruta relativa se
  almacena en la columna `imagen_path` de la tabla `analisis` (la columna
  existía desde el inicio del proyecto pero no se usaba).
- El historial ahora muestra la imagen real de cada análisis en lugar de
  solo texto, junto con una mini barra de confianza por tarjeta.
- Plugin personalizado de Chart.js (`emptyStatePlugin`) que dibuja un
  mensaje contextual cuando un gráfico queda sin series visibles:
  - "Aún no hay análisis registrados" si todos los valores son cero.
  - "Activa categorías desde la leyenda" si el usuario ocultó todas las
    categorías haciendo clic en la leyenda.

### Corregido
- Tarjetas del historial sin imagen mostraban un bloque negro junto a las
  que sí tenían foto, generando una grilla visualmente inconsistente; se
  reemplaza por un placeholder con degradado suave y la etiqueta "Sin
  imagen".

---

## [0.2.0] — 2026-06-17

### Agregado
- **Validación de imágenes agrícolas**: el prompt de la IA ahora resuelve
  primero si la imagen corresponde a un cultivo, fruta, hortaliza, planta u
  hoja; si no, responde `{"valido": false, ...}` y el backend no guarda nada
  en la base de datos. El frontend muestra una pantalla de "Imagen no
  compatible" en vez de inventar un diagnóstico.
- **Barra de confianza visual** que reemplaza el porcentaje plano: verde
  (80–100%), amarillo (60–79%), rojo (<60%).
- **Zona afectada**: la IA devuelve coordenadas aproximadas en porcentaje
  (`x`, `y`, `width`, `height`) que se dibujan como un recuadro rojo sobre
  la imagen analizada, con una nota aclarando que es una referencia visual
  aproximada.
- **Explicación del diagnóstico**: lista de 3 a 5 observaciones visuales
  concretas (p. ej. "se detectaron manchas oscuras") que justifican el
  resultado entregado por la IA.
- **Dashboard ampliado** con 4 gráficos (Chart.js):
  - Estado de los cultivos (sanos vs. posibles enfermedades).
  - Posibles enfermedades detectadas, por frecuencia.
  - Cultivos analizados con mayor frecuencia.
  - Actividad de análisis de los últimos 7 días.
  - Además, una barra de confianza promedio sobre el total de diagnósticos.
- **Sección "Futuras integraciones"**: contenido estático que describe la
  visión de escalabilidad del proyecto (drones, cámaras IoT, robots
  agrícolas, imágenes satelitales), sin implementación funcional.
- Migración automática y no destructiva en `inicializar_db()` que agrega
  las columnas `explicacion` y `zona_afectada` a la tabla `analisis` si la
  base de datos ya existía de una versión anterior.

### Cambiado
- Se migra el proveedor de IA de **Google Gemini** a **Groq** (modelo
  `meta-llama/llama-4-scout-17b-16e-instruct`), por límites de cuota del
  nivel gratuito de Gemini que impedían un uso fluido durante el
  desarrollo y la demo.

---

## [0.1.0] — 2026-06-16

### Agregado
- Estructura inicial del proyecto Flask: `app.py`, `database.py`, `.env`,
  carpetas `templates/` y `static/{css,js,uploads}/`.
- Base de datos SQLite con dos tablas: `usuarios` (id, nombre, dni, rol) y
  `analisis` (resultado de cada diagnóstico, ligado a un usuario).
- Tres usuarios de ejemplo creados automáticamente la primera vez que se
  inicializa la base de datos.
- **Login por clave de acceso** (DNI de 8 dígitos) con sesiones de Flask
  (`session["usuario_id"]`, `session["nombre"]`, `session["rol"]`).
- **Analizador de cultivos**: captura de foto por cámara del navegador
  (`getUserMedia`) o subida de archivo, envío a la IA y visualización del
  resultado (cultivo detectado, estado de madurez, enfermedades,
  tratamiento recomendado, fuentes citadas).
- **Historial** de análisis por usuario.
- **Dashboard** inicial con conteo de análisis y desglose por cultivo.
- Separación de HTML / CSS / JS en archivos independientes
  (`templates/*.html`, `static/css/*.css`, `static/js/*.js`) en lugar de
  estilos y scripts embebidos, siguiendo buenas prácticas de desarrollo
  web.
- Paleta de colores y tipografía propias del proyecto (verde profundo,
  verde medio, verde claro, tierra, crema — tipografías Syne e Inter),
  pensada para transmitir identidad agrícola.
- Favicon propio del proyecto.

### Notas de esta versión
- Proveedor de IA inicial: Google Gemini (`gemini-2.0-flash`, luego se
  intentó `gemini-1.5-flash`). Se abandona en la siguiente versión por
  problemas de cuota — ver `[0.2.0]`.
