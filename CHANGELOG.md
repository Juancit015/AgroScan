# Changelog

Todos los cambios relevantes de AgroScan se documentan en este archivo.

El formato sigue el espíritu de [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/):
cada versión agrupa los cambios en **Agregado**, **Cambiado**, **Corregido** o
**Eliminado**. Las fechas usan formato `AAAA-MM-DD`.

---

## [No publicado]

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

### Por hacer (roadmap)
- Comparación temporal entre análisis del mismo cultivo (antes / después)
- Alertas automáticas por aumento de casos de una enfermedad
- Exportar diagnóstico a PDF
- Filtros en el historial (por cultivo, enfermedad, fecha)
- Limpieza periódica de `static/uploads/`

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
