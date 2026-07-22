// ── Utilidad para limpiar asteriscos de nombres (enfermedades, etc.) ──
function limpiarNombre(txt) {
  return (txt || '').replace(/\*+/g, '');
}

// ── Sistema de notificaciones (toast) ───────────────────────────────
// Reutilizable en toda la plataforma: mostrarToast('success'|'error'|
// 'warning'|'info', 'Título', 'Descripción opcional', duraciónMs).
// Estilo "logro desbloqueado": entra deslizando desde la esquina, barra
// de progreso de auto-cierre, y botón para cerrar manualmente.
//
// Cola con tope de visibles: si se generan muchas notificaciones de
// golpe (ej. spam de clics en "Tomar foto" sin cámara), crear y animar
// docenas de elementos DOM en el mismo instante satura el hilo principal
// — el reloj de las animaciones CSS sigue corriendo en tiempo real
// aunque el navegador esté ocupado, así que para cuando por fin pinta un
// frame, varias animaciones ya "vencieron" sin haberse visto nunca en
// pantalla (se ven saltar directo al estado final). Limitar cuántos
// toasts existen a la vez evita esa saturación de raíz, además de ser
// mejor UX: una pared de 20 notificaciones apiladas nunca es legible.
const TOAST_ICONOS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
// Duración por defecto según tipo: las advertencias suelen traer texto
// más largo que conviene dar tiempo a leer (ej. "no se detectó cámara"),
// así que se quedan más tiempo en pantalla que un éxito/info rápido.
const TOAST_DURACION_POR_DEFECTO = { warning: 15000, error: 8000, success: 5000, info: 5000 };
const TOAST_MAX_VISIBLES = 3;
const toastContainer = document.getElementById('toast-container');
const colaToasts = [];
let toastsVisiblesActuales = 0;

// ── Traducciones Español / Quechua ───────────────────────────────
const TRADUCCIONES = {
  es: {
    // Chat
    chat_pensando: 'Pensando...',
    chat_adjuntando: 'Adjuntando imagen...',
    chat_pregunta_larga: 'Procesando...',
    chat_placeholder: 'Escribe tu pregunta...',
    chat_no_repetir: 'Ya hiciste esa pregunta antes. Intenta con otra.',
    chat_sin_analisis: 'Primero analiza un cultivo para poder preguntar sobre él.',
    chat_limite: 'Has alcanzado el límite de 15 preguntas por conversación.',
    chat_limite_msg: '⚠️ Has alcanzado el límite de 15 preguntas para esta conversación. Inicia un **nuevo análisis** para seguir consultando.',
    chat_error_respuesta: 'Hubo un problema al obtener la respuesta. Intenta de nuevo.',
    chat_error_conexion: 'Error de conexión. Verifica tu internet e intenta de nuevo.',
    chat_escribiendo: '🌿 Escribiendo...',
    // Historial
    hist_vacio: 'Aún no tienes análisis guardados',
    hist_vacio_desc: 'Toma una foto de un cultivo para comenzar.',
    hist_filtro_vacio: 'No hay resultados para este filtro',
    hist_filtro_vacio_desc: 'Intenta con otro rango de fechas.',
    hist_sin_resultados: 'Sin análisis aún',
    hist_sin_resultados_desc: 'No se encontraron análisis registrados. Analiza un cultivo para verlo aquí.',
    hist_sin_analisis: 'Aún no hay análisis',
    hist_sin_analisis_desc: 'No hay análisis guardados aún. Analiza un cultivo y los resultados aparecerán acá.',
    hist_error_cargar: 'Error al cargar historial.',
    hist_eliminar_individual: '¿Eliminar el análisis de {0}?',
    hist_eliminar_individual_desc: 'Esta acción es permanente. Se eliminará este diagnóstico de tu historial.',
    hist_eliminar_multi: '¿Eliminar {0} registro seleccionado?',
    hist_eliminar_multi_plural: '¿Eliminar {0} registros seleccionados?',
    hist_eliminar_multi_desc: 'Esta acción es permanente y no se puede deshacer. Se eliminarán {0} análisis de tu historial.',
    hist_seleccionados: '{0} registro seleccionado',
    hist_seleccionados_plural: '{0} registros seleccionados',
    hist_hoy: 'Hoy',
    hist_ayer: 'Ayer',
    hist_sano: '✅ Sano',
    hist_sano_desc: 'No se detectaron enfermedades.',
    hist_desconocido: 'Desconocido',
    // Admin
    admin_vacio: 'No hay usuarios registrados aún',
    admin_vacio_desc: 'Los agricultores se registrarán desde la pantalla de login.',
    admin_stats_error: 'Error al cargar estadísticas.',
    admin_usuarios_error: 'Error al cargar usuarios.',
    admin_sin_resultados: 'Sin resultados',
    admin_sin_resultados_desc: 'No se encontraron usuarios con esos filtros.',
    admin_rol_admin: '⚙️ Admin',
    admin_rol_agricultor: '🌱 Agricultor',
    admin_editar: 'Editar',
    admin_eliminar: 'Eliminar',
    admin_guardar: 'Guardar cambios',
    admin_cancelar: 'Cancelar',
    admin_nombre_placeholder: 'Nombre completo',
    admin_clave_placeholder: 'Nueva clave (opcional, 8 dígitos)',
    admin_analisis_totales: 'Análisis totales',
    admin_usuarios_registrados: 'Usuarios registrados',
    admin_confianza_promedio: 'Confianza promedio global',
    admin_enfermedad_comun: 'Enfermedad más común',
    admin_usuario_activo: 'Usuario más activo',
    admin_sanos_enfermos: 'Sanos / Con posibles enfermedades',
    admin_todas_localidades: 'Todas las localidades',
    admin_localidad_placeholder: 'Localidad...',
    admin_error_nombre_vacio: 'El nombre no puede estar vacío.',
    admin_error_nombre_largo: 'El nombre no puede superar 30 caracteres.',
    admin_error_clave_digitos: 'La clave debe tener exactamente 8 dígitos.',
    admin_error_conexion: 'Error de conexión.',
    admin_completa_campos: 'Completa nombre y clave.',
    admin_confirmar_eliminar: '¿Estás seguro de que deseas eliminar a <strong>{0}</strong>?<br><br>Se borrarán también todos sus análisis de forma permanente.',
    admin_sin_analisis: 'Sin análisis',
    admin_sin_analisis_desc: 'Este usuario aún no ha realizado ningún análisis.',
    admin_rol: 'Rol: ',
    admin_historial: 'Historial de Peticiones',
    admin_tu: '(Tú)',
    admin_analisis: 'análisis',
    admin_ultimo: 'último: ',
    admin_sin_analisis_label: 'sin análisis',
    admin_error_usuario: 'No se pudo cargar la información del usuario.',
    admin_crear_cuenta: 'Crear cuenta',
    admin_usuario_creado: 'Usuario creado',
    admin_usuario_actualizado: 'Usuario actualizado',
    admin_usuario_eliminado: 'Usuario eliminado',
    // Modal detalle
    modal_sin_datos: 'No hay información del análisis',
    modal_sin_datos_desc: 'Selecciona una tarjeta del historial.',
    modal_estado_maduracion: 'Estado de Maduración',
    modal_confianza_ia: 'Confianza de la IA',
    modal_diagnostico: 'Diagnóstico',
    modal_zona_afectada: '📍 Zona Afectada',
    modal_porque_diagnostico: '🔍 ¿Por qué este diagnóstico?',
    modal_tratamiento: 'Tratamiento Recomendado',
    modal_tratamiento_default: 'No requiere tratamiento fitosanitario especial.',
    modal_recomendacion_consumo: 'Recomendación de Consumo',
    modal_fuentes: '📚 Fuentes Consultadas',
    modal_eliminar: '🗑️ Eliminar registro',
    modal_cerrar: 'Cerrar',
    modal_exportar: '📄 Exportar PDF',
    modal_sano: '✅ Sano',
    modal_sano_desc: 'No se detectaron enfermedades.',
    modal_contraindicaciones: 'Sin contraindicaciones ni precauciones especiales detectadas.',
    // Gráficos
    graf_sin_datos: 'Aún no hay datos suficientes',
    graf_sin_datos_desc: 'Realiza más análisis para ver estadísticas.',
    graf_sin_datos_chart: 'Sin datos visibles',
    graf_activa_categorias: 'Activa categorías desde la leyenda',
    graf_sin_analisis: 'Aún no hay análisis registrados',
    graf_sanos: 'Sanos',
    graf_posibles_enfermedades: 'Posibles enfermedades',
    graf_frecuencia: 'Frecuencia',
    graf_sin_enfermedades: 'Sin enfermedades',
    graf_sin_enfermedades_desc: 'Aún no hay enfermedades registradas.',
    graf_sin_cultivos: 'Sin cultivos',
    graf_sin_cultivos_desc: 'Aún no hay datos de cultivos.',
    graf_agrupa: 'Agrupa {0} tipo de cultivo con menor frecuencia.',
    graf_agrupa_plural: 'Agrupa {0} tipos de cultivo con menor frecuencia.',
    graf_tipos_agrupados: '({0} tipo agrupados)',
    graf_tipos_agrupados_plural: '({0} tipos agrupados)',
    graf_analisis: 'Análisis',
    // error general
    error_cargar: 'Error al cargar datos',
    error_intentar: 'Intenta de nuevo más tarde.',
    error_conexion: 'Error de conexión',
    error_conexion_desc: 'No se pudo conectar con el servidor.',
    // Perfil
    perfil_guardado: 'Perfil actualizado correctamente',
    perfil_error: 'Error al guardar el perfil',
    perfil_cargando: 'Cargando perfil...',
    perfil_cargar_error: 'Error al cargar perfil.',
    perfil_conexion_error: 'Error de conexión.',
    perfil_rol_admin: '⚙️ Administrador',
    perfil_rol_agricultor: '🌱 Agricultor',
    perfil_analisis_label: 'Análisis',
    perfil_miembro_desde: 'Miembro desde',
    perfil_ubicacion: 'Ubicación',
    perfil_idioma_titulo: 'Idioma / Simi',
    perfil_idioma_label: 'Idioma / Simi',
    perfil_quechua: '🇵🇪 Quechua',
    perfil_espanol: '🇪🇸 Español',
    perfil_editar: 'Editar',
    perfil_info_personal: 'Información personal',
    perfil_nombre: 'Nombre',
    perfil_region: 'Región',
    perfil_localidad: 'Localidad',
    perfil_zona_peligro: 'Zona de peligro',
    perfil_cerrar_sesion: '🚪 Cerrar sesión',
    perfil_eliminar_cuenta: '🗑️ Eliminar cuenta',
    perfil_selecciona: 'Selecciona...',
    perfil_nombre_guardado: 'Nombre guardado',
    perfil_region_actualizada: 'Región actualizada',
    perfil_localidad_actualizada: 'Localidad actualizada',
    perfil_confirmar_eliminar: '¿Estás seguro de eliminar tu cuenta?<br><br>Se borrarán <strong>todos tus análisis</strong> de forma permanente. Esta acción no se puede deshacer.',
    perfil_cuenta_eliminada: 'Cuenta eliminada',
    perfil_cuenta_eliminada_desc: 'Tu cuenta y datos han sido eliminados.',
    perfil_idioma_cambiado: '🌐 Idioma cambiado a {0}',
    perfil_selecciona_region: 'Primero selecciona una región',
    // Secciones
    dashboard_titulo: '📊 Dashboard',
    historial_titulo: '📋 Historial',
    admin_titulo: '⚙️ Admin',
    perfil_titulo: '👤 Perfil',
    chat_titulo: '💬 Chat',
    analizar_titulo: '📷 Analizar',
    futuro_titulo: '🔮 Futuro',
    // Botones y filtros
    camara_titulo: 'Captura de cultivo',
    camara_desc: 'Enfoca bien el cultivo y toma la foto',
    dashboard_desc: 'Resumen visual de tus análisis',
    btn_tomar_foto: '📷 Tomar foto',
    btn_galeria: '🖼️ Galería',
    historial_titulo_seccion: '📋 Historial de análisis',
    historial_buscar: 'Buscar por cultivo o enfermedad...',
    filtro_todos: 'Todos',
    filtro_sano: 'Sano',
    filtro_enfermo: 'Con enfermedades',
    // Nav y layout
    nav_analizar: '📷 Analizar',
    nav_salir: 'Salir',
    nav_avatar_title: 'Cambiar foto de perfil',
    nav_avatar_alt: 'Foto de perfil',
    bottom_historial: 'Historial',
    bottom_dashboard: 'Dashboard',
    bottom_analizar: 'Analizar',
    bottom_futuro: 'Futuro',
    bottom_perfil: 'Perfil',
    bottom_admin: 'Admin',
    drawer_analizar: '📷 Analizar',
    drawer_historial: '📋 Historial',
    drawer_dashboard: '📊 Dashboard',
    drawer_futuro: '🔮 Futuro',
    drawer_perfil: '👤 Perfil',
    drawer_admin: '⚙️ Admin',
    // Cámara
    zona_detectada: '⚠️ Zona detectada',
    camara_no_iniciada: 'Cámara no iniciada',
    analizando_cultivo: 'Analizando cultivo con IA...',
    referencia_visual: 'Referencia visual aproximada — no reemplaza evaluación profesional',
    nueva_foto: 'Nueva foto',
    listo_analizar: 'Listo para analizar',
    tomar_foto_desc: 'Toma una foto del cultivo para obtener el diagnóstico con IA',
    // Imagen no compatible
    imagen_no_compatible: 'Imagen no compatible',
    imagen_no_compatible_desc: 'La imagen no corresponde a un cultivo o producto agrícola.',
    frutia_analiza: 'FrutIA solo analiza:',
    item_frutas: '🍎 Frutas',
    item_hortalizas: '🥦 Hortalizas',
    item_plantas: '🌿 Plantas',
    item_hojas: '🍃 Hojas',
    item_cultivos: '🌾 Cultivos agrícolas',
    subir_valida: 'Por favor, sube una imagen válida.',
    // Resultado
    confianza_diagnostico: 'Confianza del diagnóstico',
    enfermedades_detectadas: '⚠️ Posibles enfermedades detectadas',
    cultivo_sano_html: '✅ Cultivo en buen estado — sin enfermedades detectadas',
    porque_diagnostico: '🔬 ¿Por qué se obtuvo este diagnóstico?',
    tratamiento_recomendado: '💊 Tratamiento recomendado',
    recomendacion_consumo_label: '🍽️ Recomendación de Consumo',
    fuentes_consultadas: '📚 Fuentes consultadas',
    exportar_pdf: '📄 Exportar PDF',
    // Chat
    chat_dudas: '¿Tienes dudas sobre este diagnóstico?',
    chat_asistente: 'Pregúntale al asistente agronómico de FrutIA',
    chat_placeholder_input: 'Ej: ¿Puedo aplicar el fungicida si va a llover hoy?',
    // Error
    error_analizar: 'Ocurrió un error al analizar.',
    intentar_de_nuevo: 'Intentar de nuevo',
    // Historial
    historial_desc: 'Todos tus diagnósticos guardados',
    seleccion_registros_title: 'Seleccionar registros',
    seleccionados_cero: '0 seleccionados',
    cancelar: 'Cancelar',
    eliminar_seleccionados: '🗑️ Eliminar seleccionados',
    cargando_historial: 'Cargando historial...',
    cargar_mas: 'Cargar más registros',
    // Dashboard
    chart_estado_cultivos: 'Estado de los cultivos',
    chart_enfermedades: 'Posibles enfermedades detectadas',
    chart_cultivos: 'Cultivos analizados',
    chart_actividad: 'Actividad semanal',
    chart_confianza: 'Confianza promedio de diagnósticos',
    chart_basado_en: 'Basado en {0} análisis realizados',
    // Futuro
    futuro_titulo_seccion: 'Futuras integraciones',
    futuro_desc: 'Visión de escalabilidad del proyecto',
    futuro_texto: 'FrutIA está diseñado para analizar imágenes independientemente de su origen. Actualmente utiliza fotografías tomadas desde un teléfono móvil, pero en futuras versiones podrá integrarse con drones, robots, cámaras inteligentes e imágenes satelitales para facilitar el monitoreo de grandes extensiones agrícolas.',
    futuro_card1_titulo: '🚁 Integración con drones',
    futuro_card2_titulo: '📷 Cámaras inteligentes (IoT)',
    futuro_card3_titulo: '🤖 Robots agrícolas',
    futuro_card4_titulo: '🛰️ Imágenes satelitales',
    futuro_card1_li1: 'Captura automática en grandes extensiones agrícolas',
    futuro_card1_li2: 'Envío automático de fotografías a FrutIA',
    futuro_card2_li1: 'Monitoreo continuo de cultivos en tiempo real',
    futuro_card2_li2: 'Alertas automáticas al detectar enfermedades',
    futuro_card3_li1: 'Inspección autónoma de plantas',
    futuro_card3_li2: 'Captura y análisis en tiempo real',
    futuro_card4_li1: 'Detección temprana de anomalías en grandes áreas',
    futuro_card4_li2: 'Complementar el análisis individual',
    futuro_planificacion: 'En planificación',
    futuro_investigacion: 'En investigación',
    futuro_nota: '⚠️ FrutIA es un asistente de apoyo al diagnóstico y no reemplaza la evaluación de un ingeniero agrónomo certificado.',
    // Admin
    admin_panel: 'Panel de administración',
    admin_panel_desc: 'Gestión de usuarios y estadísticas globales',
    admin_usuarios_titulo: 'Usuarios registrados',
    admin_buscar: 'Buscar por nombre...',
    admin_todas_regiones: 'Todas las regiones',
    admin_nuevo_usuario: '+ Nuevo usuario',
    admin_clave_placeholder_alt: 'Clave (8 dígitos)',
    admin_region_placeholder: 'Región...',
    admin_rol_agricultor_lbl: 'Agricultor',
    admin_rol_admin_lbl: 'Administrador',
    admin_guardar_btn: 'Guardar',
    admin_cancelar_btn: 'Cancelar',
    // Perfil sección
    perfil_titulo_seccion: 'Mi Perfil',
    perfil_desc: 'Tus datos y configuración de cuenta',
    // Modales
    cargando: 'Cargando...',
    cargando_detalles: 'Cargando detalles...',
    cargando_analisis: 'Cargando análisis...',
    cargando_usuarios: 'Cargando usuarios...',
    advertencia_titulo: '⚠️ Advertencia',
    escribir_eliminar: 'Escribe <strong>ELIMINAR</strong> para confirmar',
    eliminar_placeholder: 'ELIMINAR',
    si_eliminar: 'Sí, eliminar',
    // Reportes
    reporte_generando: 'Generando reporte...',
    reporte_error: 'Error al generar el reporte',
    reporte_btn: 'Descargar reporte en PDF',
    reporte_btn_exportar: '📄 Exportar a PDF',
    reporte_no_guardado: 'Este análisis no fue guardado. Intenta de nuevo.',
    reporte_error_servidor: 'Error del servidor ({0})',
    // Análisis
    analisis_iniciado: 'Análisis iniciado',
    analisis_procesando: 'Analizando cultivo con IA...',
    analisis_analizando: '⏳ Analizando…',
    analisis_error: 'Error al analizar.',
    analisis_error_conexion: 'Error de conexión con el servidor.',
    analisis_cultivo_default: 'Cultivo desconocido',
    analisis_maduracion_default: '—',
    analisis_tratamiento_default: 'No requiere tratamiento fitosanitario especial.',
    analisis_alerta_zona: '<span>🚨</span> Alerta en tu zona',
    analisis_alerta_texto: 'Hemos detectado <strong>{0} casos</strong> recientes de <strong>{1}</strong> en <strong>{2}</strong> durante los últimos {3} días. Te recomendamos aplicar medidas preventivas y avisar a tu comunidad.',
    res_advertencia_default: 'Este diagnóstico es orientativo.',
    // Toast
    toast_error: 'Error',
    toast_exito: 'Éxito',
    toast_advertencia: 'Advertencia',
    toast_info: 'Información',
    // Frases
    bienvenido: 'Bienvenido',
    cerrando_sesion: 'Cerrando sesión...',
    sesion_cerrada: 'Sesión cerrada correctamente',
    foto_actualizar_error: 'No se pudo actualizar la foto',
    foto_actualizar_error_desc: 'Intenta con otra imagen.',
    foto_actualizada: 'Foto de perfil actualizada',
    foto_actualizada_desc: 'Tu nueva imagen ya está visible.',
    foto_subir_error: 'No se pudo subir la imagen.',
    camara_no_detectada: 'No se detectó ninguna cámara',
    camara_no_detectada_desc: 'Conecta una webcam o selecciona una imagen desde tu equipo con el botón "Galería".',
    limite_alcanzado: 'Límite alcanzado',
    limite_alcanzado_desc: 'Llegaste a las 15 preguntas. Inicia un nuevo análisis para seguir.',
    no_exportar: 'No se puede exportar',
    exportar_error: 'Error al exportar',
    analisis_no: 'No se pudo analizar',
    // Estado sistema
    sistema_no_disponible: 'No disponible',
    sistema_online: 'IA Online',
    sistema_sin_configurar: 'IA sin configurar',
    sistema_sin_datos: 'Sin datos aún',
    sistema_sin_conexion: 'Sin conexión',
    // Registros selección múltiple
    registros_eliminados: 'Registros eliminados',
    registro_eliminado: 'Registro eliminado',
    eliminar_error: 'No se pudieron eliminar los registros.',
    eliminar_registro_error: 'No se pudo eliminar el registro.',
    // Admin nombres de mensajes dinámicos
    usuario_actualizado_msg: 'Los datos de {0} se guardaron correctamente.',
    usuario_creado_msg: '{0} ya puede acceder a la plataforma.',
    usuario_eliminado_msg: '{0} y su historial fueron eliminados.',
    usuario_eliminar_error: 'No se pudo eliminar el usuario.',
    usuario_eliminar_conexion: 'No se pudo eliminar el usuario.',
  },
  qu: {
    // Chat
    chat_pensando: 'Yuyaykuchkan...',
    chat_adjuntando: 'Rikchata churaykuchkan...',
    chat_pregunta_larga: 'Ruwaq kachkan...',
    chat_placeholder: 'Tapuykita qillqay...',
    chat_no_repetir: 'Kay tapuytaña ruwarqanki. Wakta ruway.',
    chat_sin_analisis: 'Ñawpaqta chakra yukata llimphiy, chaymanta tapuy atinki.',
    chat_limite: '15 tapuykunaña ruwarqanki. Mana aswan atinkichu.',
    chat_limite_msg: '⚠️ 15 tapuykunataña ruwarqanki. **Musuq análisis** qallariy tapuyta wiñaypaq.',
    chat_error_respuesta: 'Pantasqa kutichiyta chaskispa. Wakmanta ruwapay.',
    chat_error_conexion: 'Internet pantasqa. Llampukaqninta qhaway wakmanta ruwapay.',
    chat_escribiendo: '🌿 Qillqakuchkan...',
    // Historial
    hist_vacio: 'Manaraq ima análisis niyuqchu kanki',
    hist_vacio_desc: 'Chakra yukata llimphiy qallarichun.',
    hist_filtro_vacio: 'Kay filtrupaq ima niyuqchu',
    hist_filtro_vacio_desc: 'Wak pacha tantata ruway.',
    hist_sin_resultados: 'Manaraq análisis',
    hist_sin_resultados_desc: 'Manam tarikunchu análisis ruwasqa. Chakra yukata llimphiy kaypi rikunaq.',
    hist_sin_analisis: 'Manaraq análisis',
    hist_sin_analisis_desc: 'Manam análisis waqaychasqa kanchu. Chakra yukata llimphiy, qhipaman kaypi rikukunqa.',
    hist_error_cargar: 'Pantasqa wiñay wiñayta apaypi.',
    hist_eliminar_individual: '¿{0} análisista qulluchiy?',
    hist_eliminar_individual_desc: 'Kay ruway mana kutichiy atikunchu. Kay diagnóstico qulluchun.',
    hist_eliminar_multi: '¿{0} registro qulluchiy?',
    hist_eliminar_multi_plural: '¿{0} registrokunata qulluchiy?',
    hist_eliminar_multi_desc: 'Kay ruway mana kutichiy atikunchu. {0} análisis qulluchun.',
    hist_seleccionados: '{0} registro',
    hist_seleccionados_plural: '{0} registrokuna',
    hist_hoy: 'Kunan p\'unchaw',
    hist_ayer: 'Qayna',
    hist_sano: '✅ Allin',
    hist_sano_desc: 'Manam ima unquy tarikunchu.',
    hist_desconocido: 'Mana riqsisqa',
    // Admin
    admin_vacio: 'Manaraq pipas qillqarakunchu',
    admin_vacio_desc: 'Yapuqkuna qillqakunqaku login pantallamanta.',
    admin_stats_error: 'Pantasqa estadísticas apaypi.',
    admin_usuarios_error: 'Pantasqa ruwaqkuna apaypi.',
    admin_sin_resultados: 'Manam ima',
    admin_sin_resultados_desc: 'Mana ruwaq tarikunchu chay filtrukunawan.',
    admin_rol_admin: '⚙️ Kamachiq',
    admin_rol_agricultor: '🌱 Yapuq',
    admin_editar: 'Allinchay',
    admin_eliminar: 'Qulluchiy',
    admin_guardar: 'Waqaychay',
    admin_cancelar: 'Sayachiy',
    admin_nombre_placeholder: 'Sutiyki',
    admin_clave_placeholder: 'Musuq kichay (8 qillqa)',
    admin_analisis_totales: 'Análisis tukuy',
    admin_usuarios_registrados: 'Ruwaqkuna qillqasqa',
    admin_confianza_promedio: 'Confianza global',
    admin_enfermedad_comun: 'Unquy aswan riqsisqa',
    admin_usuario_activo: 'Ruwaq aswan ruwaq',
    admin_sanos_enfermos: 'Allin / Unquy',
    admin_todas_localidades: 'Tukuy llaqtakuna',
    admin_localidad_placeholder: 'Llaqta...',
    admin_error_nombre_vacio: 'Suti mana qillqasqa.',
    admin_error_nombre_largo: 'Suti 30 qillqamanta aswan.',
    admin_error_clave_digitos: 'Kichay 8 qillqalla.',
    admin_error_conexion: 'Pantasqa tinkiy.',
    admin_completa_campos: 'Sutita kichayta qillqay.',
    admin_confirmar_eliminar: '¿Cheqaqchu <strong>{0}</strong> qulluchiyta munanki?<br><br>Paypa análisisninkunapas qulluchun.',
    admin_sin_analisis: 'Mana análisis',
    admin_sin_analisis_desc: 'Kay ruwaq manaraq análisis ruwachkanchu.',
    admin_rol: 'Rol: ',
    admin_historial: 'Mañakuy wiñay',
    admin_tu: '(Qan)',
    admin_analisis: 'análisis',
    admin_ultimo: 'qhipa: ',
    admin_sin_analisis_label: 'mana análisis',
    admin_error_usuario: 'Mana ruwaq willakuyninta apay atikunchu.',
    admin_crear_cuenta: 'Cuenta kamariy',
    admin_usuario_creado: 'Ruwaq kamarisqa',
    admin_usuario_actualizado: 'Ruwaq allinchasqa',
    admin_usuario_eliminado: 'Ruwaq qulluchisqa',
    // Modal detalle
    modal_sin_datos: 'Analisispa willakuynin mana kanchu',
    modal_sin_datos_desc: 'Historialmanta huk tarjeta akllay.',
    modal_estado_maduracion: 'Puquy kay',
    modal_confianza_ia: 'IA confianza',
    modal_diagnostico: 'Diagnóstico',
    modal_zona_afectada: '📍 Qispisqa lugar',
    modal_porque_diagnostico: '🔍 ¿Imarayku kay diagnóstico?',
    modal_tratamiento: 'Hampiy',
    modal_tratamiento_default: 'Mana hampiy necesitachu.',
    modal_recomendacion_consumo: 'Mikhuy yuyay',
    modal_fuentes: '📚 Willakuykuna',
    modal_eliminar: '🗑️ Qulluchiy',
    modal_cerrar: 'Wisq\'ay',
    modal_exportar: '📄 PDF apay',
    modal_sano: '✅ Allin',
    modal_sano_desc: 'Manam ima unquy tarikunchu.',
    modal_contraindicaciones: 'Mana ima contraindicación tarikunchu.',
    // Gráficos
    graf_sin_datos: 'Manaraq askha willakuy kanchu',
    graf_sin_datos_desc: 'Aswan análisis ruway estadísticas rikunaq.',
    graf_sin_datos_chart: 'Mana willakuy rikuchkan',
    graf_activa_categorias: 'Categorías leyenda manta akllay',
    graf_sin_analisis: 'Manaraq análisis qillqasqa',
    graf_sanos: 'Allin',
    graf_posibles_enfermedades: 'Unquy',
    graf_frecuencia: 'Frecuencia',
    graf_sin_enfermedades: 'Mana unquy',
    graf_sin_enfermedades_desc: 'Manaraq unquy qillqasqa kanchu.',
    graf_sin_cultivos: 'Mana yuka',
    graf_sin_cultivos_desc: 'Manaraq yuka willakuy kanchu.',
    graf_agrupa: '{0} yuka tupuyta huñun.',
    graf_agrupa_plural: '{0} yuka tupuykunata huñun.',
    graf_tipos_agrupados: '({0} tupuy)',
    graf_tipos_agrupados_plural: '({0} tupuykuna)',
    graf_analisis: 'Análisis',
    // error general
    error_cargar: 'Pantasqa willakuyta apaypi',
    error_intentar: 'Wak kutin ruwapay.',
    error_conexion: 'Pantasqa tinkiy',
    error_conexion_desc: 'Mana servidorwan tinkiy atikunchu.',
    // Perfil
    perfil_guardado: 'Perfil allinchasqa',
    perfil_error: 'Pantasqa perfil allinchaypi',
    perfil_cargando: 'Perfil apakuchkan...',
    perfil_cargar_error: 'Pantasqa perfil apaypi.',
    perfil_conexion_error: 'Pantasqa tinkiy.',
    perfil_rol_admin: '⚙️ Kamachiq',
    perfil_rol_agricultor: '🌱 Yapuq',
    perfil_analisis_label: 'Análisis',
    perfil_miembro_desde: 'Qillqasqa',
    perfil_ubicacion: 'Llaqta',
    perfil_idioma_titulo: 'Idioma / Simi',
    perfil_idioma_label: 'Idioma / Simi',
    perfil_quechua: '🇵🇪 Runasimi',
    perfil_espanol: '🇪🇸 Kastillanu',
    perfil_editar: 'Allinchay',
    perfil_info_personal: 'Pay willakuy',
    perfil_nombre: 'Suti',
    perfil_region: 'Suyu',
    perfil_localidad: 'Llaqta',
    perfil_zona_peligro: 'Mana allin lugar',
    perfil_cerrar_sesion: '🚪 Lluqsiy',
    perfil_eliminar_cuenta: '🗑️ Cuenta qulluchiy',
    perfil_selecciona: 'Akllay...',
    perfil_nombre_guardado: 'Suti waqaychasqa',
    perfil_region_actualizada: 'Suyu allinchasqa',
    perfil_localidad_actualizada: 'Llaqta allinchasqa',
    perfil_confirmar_eliminar: '¿Cheqaqchu cuentaykita qulluchiyta munanki?<br><br><strong>Tukuy análisisnikikuna</strong> qulluchun. Mana kutichiy atikunchu.',
    perfil_cuenta_eliminada: 'Cuenta qulluchisqa',
    perfil_cuenta_eliminada_desc: 'Cuenta willakuykunapas qulluchisqa.',
    perfil_idioma_cambiado: '🌐 Simi allinchasqa {0}',
    perfil_selecciona_region: 'Ñawpaqta suyuta akllay',
    // Secciones
    dashboard_titulo: '📊 Tawla',
    historial_titulo: '📋 Hayñin',
    admin_titulo: '⚙️ Kamachiq',
    perfil_titulo: '👤 Pay',
    chat_titulo: '💬 Tapuy',
    analizar_titulo: '📷 Qhaway',
    futuro_titulo: '🔮 Hamuq',
    // Botones y filtros
    camara_titulo: 'Yuka hap\'iy',
    camara_desc: 'Yukata allinta qhaway rikchata hap\'iy',
    dashboard_desc: 'Análisis rikuy',
    btn_tomar_foto: '📷 Rikchata hap\'iy',
    btn_galeria: '🖼️ Wakichina',
    historial_titulo_seccion: '📋 Hayñin análisis',
    historial_buscar: 'Yukamanta utaq unquymanta maskhay...',
    filtro_todos: 'Tukuy',
    filtro_sano: 'Allin',
    filtro_enfermo: 'Unquywan',
    // Nav y layout
    nav_analizar: '📷 Qhaway',
    nav_salir: 'Lluqsiy',
    nav_avatar_title: 'Rikchata allinchay',
    nav_avatar_alt: 'Rikcha',
    bottom_historial: 'Hayñin',
    bottom_dashboard: 'Tawla',
    bottom_analizar: 'Analizar',
    bottom_futuro: 'Hamuq',
    bottom_perfil: 'Pay',
    bottom_admin: 'Kamachiq',
    drawer_analizar: '📷 Qhaway',
    drawer_historial: '📋 Hayñin',
    drawer_dashboard: '📊 Tawla',
    drawer_futuro: '🔮 Hamuq',
    drawer_perfil: '👤 Pay',
    drawer_admin: '⚙️ Kamachiq',
    // Cámara
    zona_detectada: '⚠️ Tarisqa lugar',
    camara_no_iniciada: 'Cámara manaraq qallarichkanchu',
    analizando_cultivo: 'Yukata IAwan qhawaykuchkan...',
    referencia_visual: 'Qhaway yuyay — mana kamachiq rantinchu',
    nueva_foto: 'Musuq rikcha',
    listo_analizar: 'Listo qhawanaypaq',
    tomar_foto_desc: 'Yukamanta rikchata hap\'iy IA diagnóstico hap\'inaypaq',
    // Imagen no compatible
    imagen_no_compatible: 'Mana allin rikcha',
    imagen_no_compatible_desc: 'Kay rikcha mana yukamantachu.',
    frutia_analiza: 'FrutIA kaykunata qhawan:',
    item_frutas: '🍎 Rurukuna',
    item_hortalizas: '🥦 Chakra yuyukuna',
    item_plantas: '🌿 Yurakuna',
    item_hojas: '🍃 Rapikuna',
    item_cultivos: '🌾 Chakra yukakuna',
    subir_valida: 'Allin rikchata churay.',
    // Resultado
    confianza_diagnostico: 'Diagnóstico confianza',
    enfermedades_detectadas: '⚠️ Unquykuna tarisqa',
    cultivo_sano_html: '✅ Allin yuka — mana unquy tarikunchu',
    porque_diagnostico: '🔬 ¿Imarayku kay diagnóstico?',
    tratamiento_recomendado: '💊 Hampiy',
    recomendacion_consumo_label: '🍽️ Mikhuy yuyay',
    fuentes_consultadas: '📚 Willakuykuna',
    exportar_pdf: '📄 PDF apay',
    // Chat
    chat_dudas: '¿Kay diagnóstico willakuy?',
    chat_asistente: 'FrutIA yapuq yanapaqta tapuy',
    chat_placeholder_input: 'Ej: ¿Hampiyta churani chuya para kanan?',
    // Error
    error_analizar: 'Pantasqa análisispi.',
    intentar_de_nuevo: 'Wakmanta ruwapay',
    // Historial
    historial_desc: 'Tukuy waqaychasqa análisis',
    seleccion_registros_title: 'Registrokunata akllay',
    seleccionados_cero: '0 akllasqa',
    cancelar: 'Sayachiy',
    eliminar_seleccionados: '🗑️ Akllasqakuna qulluchiy',
    cargando_historial: 'Hayñin apakuchkan...',
    cargar_mas: 'Aswan registro apay',
    // Dashboard
    chart_estado_cultivos: 'Yuka kay',
    chart_enfermedades: 'Unquykuna tarisqa',
    chart_cultivos: 'Yuka qhaway',
    chart_actividad: 'Semana ruway',
    chart_confianza: 'Confianza promedio',
    chart_basado_en: '{0} análisis ruwasqamanta',
    // Futuro
    futuro_titulo_seccion: 'Hamuq ruwaykuna',
    futuro_desc: 'Proyecto wiñay',
    futuro_texto: 'FrutIA imamanta rikchata qhawanapaq ruwasqa. Kunan teléfono rikchakunata hap\'in, hamuq pachapi drones, robots, cámaras inteligentes, satélite rikchakunawan ruwanqa.',
    futuro_card1_titulo: '🚁 Droneswan ruway',
    futuro_card2_titulo: '📷 Cámara yuyayniyuq (IoT)',
    futuro_card3_titulo: '🤖 Yapuq robot',
    futuro_card4_titulo: '🛰️ Satélite rikchakuna',
    futuro_card1_li1: 'Hatun chakrakunamanta kikinmanta hap\'iy',
    futuro_card1_li2: 'Rikchakuna FrutIAman kikinmanta apachiy',
    futuro_card2_li1: 'Yukakunata kikinmanta qhaway',
    futuro_card2_li2: 'Unquy tarikuspalla willakuy',
    futuro_card3_li1: 'Yukakunata kikinmanta qhaway',
    futuro_card3_li2: 'Hap\'iy chaymanta qhaway',
    futuro_card4_li1: 'Hatun chakrakunamanta unquyta ñawpaqmanta tarikuy',
    futuro_card4_li2: 'Sapa yuka qhawayta yanapay',
    futuro_planificacion: 'Ruwanapaq',
    futuro_investigacion: 'Maskhaypi',
    futuro_nota: '⚠️ FrutIA yanapaqlla, mana kamachiq rantinchu.',
    // Admin
    admin_panel: 'Kamachiq tawla',
    admin_panel_desc: 'Ruwaqkuna estadísticas global',
    admin_usuarios_titulo: 'Ruwaqkuna',
    admin_buscar: 'Sutimanta maskhay...',
    admin_todas_regiones: 'Tukuy suyukuna',
    admin_nuevo_usuario: '+ Musuq ruwaq',
    admin_clave_placeholder_alt: 'Kichay (8 qillqa)',
    admin_region_placeholder: 'Suyu...',
    admin_rol_agricultor_lbl: 'Yapuq',
    admin_rol_admin_lbl: 'Kamachiq',
    admin_guardar_btn: 'Waqaychay',
    admin_cancelar_btn: 'Sayachiy',
    // Perfil sección
    perfil_titulo_seccion: 'Pay',
    perfil_desc: 'Willakuykuna yupaykuna',
    // Modales
    cargando: 'Apakuchkan...',
    cargando_detalles: 'Willakuykuna apakuchkan...',
    cargando_analisis: 'Análisis apakuchkan...',
    cargando_usuarios: 'Ruwaqkuna apakuchkan...',
    advertencia_titulo: '⚠️ Yuyay',
    escribir_eliminar: '<strong>QULLUCHIY</strong> qillqay kamachinaykipaq',
    eliminar_placeholder: 'QULLUCHIY',
    si_eliminar: 'Arí, qulluchiy',
    // Reportes
    reporte_generando: 'Reporte ruwakuchkan...',
    reporte_error: 'Pantasqa reporte ruwaypi',
    reporte_btn: 'PDF reporte uraykachiy',
    reporte_btn_exportar: '📄 PDF apay',
    reporte_no_guardado: 'Kay análisis mana waqaychasqachu. Wakmanta ruwapay.',
    reporte_error_servidor: 'Servidor pantasqa ({0})',
    // Análisis
    analisis_iniciado: 'Análisis qallarichisqa',
    analisis_procesando: 'Chakra yukata IAwan qhawaykuchkan...',
    analisis_analizando: '⏳ Qhawaykuchkan…',
    analisis_error: 'Pantasqa análisis.',
    analisis_error_conexion: 'Servidorwan tinkiy pantasqa.',
    analisis_cultivo_default: 'Mana riqsisqa yuka',
    analisis_maduracion_default: '—',
    analisis_tratamiento_default: 'Mana hampiy necesitachu.',
    analisis_alerta_zona: '<span>🚨</span> Llaqtaykipi willakuy',
    analisis_alerta_texto: '<strong>{0} kasu</strong> <strong>{1}</strong> <strong>{2}</strong> llaqtapi {3} p\'unchaw. Kamachiyta ruway aylluyki willanaykipaq.',
    res_advertencia_default: 'Kay diagnóstico yuyayllapaq. Ingeniero agrícola tapukuy.',
    // Toast
    toast_error: 'Pantasqa',
    toast_exito: 'Allin',
    toast_advertencia: 'Yuyay',
    toast_info: 'Willakuy',
    // Frases
    bienvenido: 'Allin hamuy',
    cerrando_sesion: 'Lluqsiq kachkan...',
    sesion_cerrada: 'Allinta lluqsisqanki',
    foto_actualizar_error: 'Pantasqa rikchata allinchaypi',
    foto_actualizar_error_desc: 'Wak rikchawan ruwapay.',
    foto_actualizada: 'Rikcha allinchasqa',
    foto_actualizada_desc: 'Musuq rikchayki rikuchkan.',
    foto_subir_error: 'Mana rikchata apay atikunchu.',
    camara_no_detectada: 'Mana cámara tarikunchu',
    camara_no_detectada_desc: 'Webcam tinkiy utaq "Galería" nisqawan rikchata akllay.',
    limite_alcanzado: 'Tukuy',
    limite_alcanzado_desc: '15 tapuykunataña ruwarqanki. Musuq análisis qallariy.',
    no_exportar: 'Mana apay atikunchu',
    exportar_error: 'Pantasqa apaypi',
    analisis_no: 'Mana análisis atikunchu',
    // Estado sistema
    sistema_no_disponible: 'Mana kanchu',
    sistema_online: 'IA kachkan',
    sistema_sin_configurar: 'IA mana allinchasqa',
    sistema_sin_datos: 'Mana willakuy',
    sistema_sin_conexion: 'Mana tinkiy',
    // Registros selección múltiple
    registros_eliminados: 'Registros qulluchisqa',
    registro_eliminado: 'Registro qulluchisqa',
    eliminar_error: 'Mana registros qulluchiy atikunchu.',
    eliminar_registro_error: 'Mana registro qulluchiy atikunchu.',
    // Admin nombres de mensajes dinámicos
    usuario_actualizado_msg: '{0} willakuykuna allinchasqa.',
    usuario_creado_msg: '{0} plataforma ukhuman yaykunmanña.',
    usuario_eliminado_msg: '{0} análisisninkunapas qulluchisqa.',
    usuario_eliminar_error: 'Mana ruwaq qulluchiy atikunchu.',
    usuario_eliminar_conexion: 'Mana ruwaq qulluchiy atikunchu.',
  }
};

function obtenerLang() {
  if (window.idiomaGlobal) return window.idiomaGlobal;
  const m = document.cookie.match(/(?:^|;\s*)idioma=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : 'es';
}

function traducirHTML() {
  const lang = obtenerLang();

  // data-i18n elements (content)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const t = TRADUCCIONES[lang]?.[key] || TRADUCCIONES['es']?.[key];
    if (t !== undefined) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t;
      } else if (el.tagName === 'OPTION') {
        el.textContent = t;
      } else {
        el.innerHTML = t;
      }
    }
  });

  // data-i18n-title elements (title attribute)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const t = TRADUCCIONES[lang]?.[key] || TRADUCCIONES['es']?.[key];
    if (t !== undefined) el.title = t;
  });

  // data-i18n-alt elements (alt attribute)
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.dataset.i18nAlt;
    const t = TRADUCCIONES[lang]?.[key] || TRADUCCIONES['es']?.[key];
    if (t !== undefined) el.alt = t;
  });

  // Nav links by data-section
  const mapaNav = {
    analizador: __('analizar_titulo'),
    historial: __('historial_titulo'),
    dashboard: __('dashboard_titulo'),
    perfil: __('perfil_titulo'),
    admin: __('admin_titulo'),
    futuro: __('futuro_titulo'),
  };
  document.querySelectorAll('.nav-link[data-section], .nav-link-movil[data-section]').forEach(el => {
    const t = mapaNav[el.dataset.section];
    if (!t) return;
    const span = el.querySelector('span');
    if (span) {
      span.textContent = t.replace(/^[^\s]+\s/, '');
    } else {
      el.innerHTML = t;
    }
  });

  // Section titles (h2 in secciones) - only for sections without data-i18n
  mapaNav.analizador = __('analizar_titulo');
  document.querySelectorAll('.seccion > h2:not([data-i18n])').forEach(h2 => {
    const padre = h2.closest('.seccion');
    if (!padre) return;
    const id = padre.id?.replace('sec-', '');
    if (id && mapaNav[id]) h2.innerHTML = mapaNav[id];
  });

  // Admin badge in header
  document.querySelectorAll('.admin-badge').forEach(el => {
    el.textContent = __('admin_titulo').replace(/^[^\s]+\s/, '');
  });
}

function __(clave, ...args) {
  const lang = obtenerLang();
  let t = TRADUCCIONES[lang]?.[clave];
  if (t === undefined) t = TRADUCCIONES['es']?.[clave];
  if (t === undefined) return clave;
  args.forEach((arg, i) => { t = t.replace(new RegExp('\\{' + i + '\\}', 'g'), arg); });
  return t;
}

function mostrarToast(tipo, titulo, descripcion = '', duracionMs = null) {
  if (!toastContainer) return;
  colaToasts.push({ tipo, titulo, descripcion, duracionMs });
  procesarColaToasts();
}

function procesarColaToasts() {
  while (toastsVisiblesActuales < TOAST_MAX_VISIBLES && colaToasts.length > 0) {
    crearToast(colaToasts.shift());
  }
}

function crearToast({ tipo, titulo, descripcion, duracionMs }) {
  toastsVisiblesActuales++;
  const duracionTotal = duracionMs ?? TOAST_DURACION_POR_DEFECTO[tipo] ?? 5000;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <div class="toast-icono">${TOAST_ICONOS[tipo] || 'ℹ️'}</div>
    <div class="toast-cuerpo">
      <div class="toast-titulo">${escaparHtml(titulo)}</div>
      ${descripcion ? `<div class="toast-descripcion">${escaparHtml(descripcion)}</div>` : ''}
    </div>
    <button class="toast-cerrar" type="button" aria-label="Cerrar notificación">✕</button>
    <div class="toast-progreso" style="animation-duration:${duracionTotal}ms"></div>
  `;

  const barraProgreso = toast.querySelector('.toast-progreso');
  let temporizador = null;
  let restante = duracionTotal;
  let inicio = 0;
  let cerrado = false; // evita que cerrar() se ejecute dos veces para el mismo toast

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    toast.classList.add('saliendo');

    // Eliminación garantizada aunque animationend no dispare (bajo carga
    // el navegador puede retrasarse). IMPORTANTE: filtramos por nombre de
    // animación porque con { once: true } genérico el evento de ENTRADA
    // (toastIn, 350ms) dispara primero si cerrar() se llama mientras la
    // entrada aún corre — causando la desaparición instantánea reportada.
    const DURACION_ANIMACION_SALIDA_MS = 350; // 0.25s + margen generoso
    const fallback = setTimeout(eliminar, DURACION_ANIMACION_SALIDA_MS);

    function eliminar() {
      clearTimeout(fallback);
      toast.removeEventListener('animationend', onAnimEnd); // limpieza
      if (!toast.isConnected) return;
      toast.remove();
      toastsVisiblesActuales = Math.max(0, toastsVisiblesActuales - 1);
      procesarColaToasts();
    }

    // NO usar { once: true } aquí: necesitamos filtrar por animationName
    // para ignorar el evento de toastIn y solo reaccionar a toastOut.
    function onAnimEnd(e) {
      if (e.animationName === 'toastOut') eliminar();
    }
    toast.addEventListener('animationend', onAnimEnd);
  };

  const iniciarTemporizador = () => {
    inicio = Date.now();
    temporizador = setTimeout(cerrar, restante);
    barraProgreso.style.animationPlayState = 'running';
  };

  // Al pausar, se descuenta el tiempo ya transcurrido del restante, así
  // que al reanudar el cierre ocurre exactamente cuando debía (y la
  // barra de progreso se congela/descongela en el mismo instante real,
  // quedando siempre sincronizada con el temporizador real).
  const pausarTemporizador = () => {
    clearTimeout(temporizador);
    restante -= Date.now() - inicio;
    barraProgreso.style.animationPlayState = 'paused';
  };

  toast.querySelector('.toast-cerrar').addEventListener('click', cerrar);
  toast.addEventListener('mouseenter', pausarTemporizador);
  toast.addEventListener('mouseleave', iniciarTemporizador);

  toastContainer.appendChild(toast);
  iniciarTemporizador();
}

function escaparHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// ── Referencias DOM ──────────────────────────────────────────────
const preview      = document.getElementById('preview');
const placeholder  = document.getElementById('placeholder');
const overlay      = document.getElementById('overlay');
const zonaOverlay  = document.getElementById('zona-overlay');
const zonaDescDiv  = document.getElementById('zona-descripcion');
const zonaDescText = document.getElementById('zona-desc-texto');
const btnReiniciar = document.getElementById('btn-reiniciar');
const btnLogout    = document.getElementById('btn-logout');

let chartEstado = null, chartEnfermedades = null, chartCultivos = null, chartActividad = null;

const VERDE_PROFUNDO = '#1B4332';
const VERDE_CLARO    = '#52B788';
const TIERRA         = '#C8A96E';
const WARNING        = '#D97706';
const PALETTE = ['#1B4332','#52B788','#C8A96E','#2D6A4F','#B7E4C7','#D97706','#DC2626','#95D5B2'];

// ── Inicialización de estado ─────────────────────────────────────
(function initState() {
  traducirHTML();
  const seccionGuardada = localStorage.getItem('frutia_seccion_actual');
  if (seccionGuardada && seccionGuardada !== 'analizador') {
    const link = document.querySelector(`.nav-link[data-section="${seccionGuardada}"], .nav-link-movil[data-section="${seccionGuardada}"]`);
    if (link) {
      document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`.nav-link[data-section="${seccionGuardada}"], .nav-link-movil[data-section="${seccionGuardada}"]`).forEach(l => l.classList.add('active'));
      document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
      document.getElementById(`sec-${seccionGuardada}`).classList.add('activa');
      if (seccionGuardada === 'historial') cargarHistorial();
      if (seccionGuardada === 'dashboard') cargarDashboard();
      if (seccionGuardada === 'admin') cargarAdmin();
      if (seccionGuardada === 'perfil') cargarPerfil();
    }
  }

  const analisisGuardado = localStorage.getItem('frutia_ultimo_analisis');
  if (analisisGuardado) {
    try {
      const data = JSON.parse(analisisGuardado);
      window.ultimoDiagnosticoData = data;
      const prv = document.getElementById('preview');
      const ph  = document.getElementById('placeholder');
      const btn = document.getElementById('btn-reiniciar');
      if (data.imagen_path && prv && ph) {
        prv.src = '/static/' + data.imagen_path;
        prv.style.display = 'block';
        ph.style.display = 'none';
      }
      if (btn) btn.style.display = 'block';
      if (!seccionGuardada || seccionGuardada === 'analizador') {
        document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
        document.getElementById('sec-analizador').classList.add('activa');
        document.querySelectorAll('.nav-link[data-section="analizador"], .nav-link-movil[data-section="analizador"]').forEach(l => l.classList.add('active'));
        mostrarResultado(data, true);
      }
    } catch (e) {}
  }
})();

// ── Plugin: mensaje cuando el chart queda vacío ──────────────────
const emptyStatePlugin = {
  id: 'emptyState',
  afterDraw(chart) {
    let isEmpty = false;
    let mensaje = __('graf_sin_datos_chart');

    if (chart.config.type === 'doughnut' || chart.config.type === 'pie') {
      const meta   = chart.getDatasetMeta(0);
      const allHidden = !meta.data.length || meta.data.every(d => d.hidden);
      const allZero   = chart.data.datasets[0]?.data.every(v => v === 0);
      isEmpty = allHidden || allZero;
      if (allHidden && !allZero) mensaje = __('graf_activa_categorias');
      if (allZero) mensaje = __('graf_sin_analisis');
    } else {
      isEmpty = chart.data.datasets.every((_, i) => !chart.isDatasetVisible(i));
      if (isEmpty) mensaje = __('graf_activa_categorias');
    }

    if (isEmpty) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#9CA3AF';
      ctx.font         = '13px Montserrat, sans-serif';
      ctx.fillText(mensaje, width / 2, height / 2);
      ctx.restore();
    }
  }
};
Chart.register(emptyStatePlugin);

// ── Menú hamburguesa (móvil) ───────────────────────────────────────
const navToggle  = document.getElementById('nav-toggle');
const navOverlay = document.getElementById('nav-overlay');

function abrirMenuMovil() {
  if(navToggle) navToggle.classList.add('abierto');
  navOverlay.classList.add('visible');
}
function cerrarMenuMovil() {
  if(navToggle) navToggle.classList.remove('abierto');
  navOverlay.classList.remove('visible');
}

if(navToggle) {
  navToggle.addEventListener('click', () => {
    navOverlay.classList.contains('visible') ? cerrarMenuMovil() : abrirMenuMovil();
  });
}

// Clic en el fondo oscuro (fuera del panel) cierra el menú; el panel en sí
// detiene la propagación (ver onclick inline en el HTML) para que tocar
// un link o el botón Salir no cierre el drawer antes de procesar la acción.
navOverlay.addEventListener('click', cerrarMenuMovil);

// ── Navegación ───────────────────────────────────────────────────
// Selecciona los links de AMBAS barras (escritorio + drawer móvil), ya
// que comparten la clase .nav-link; así el estado "activa" queda
// sincronizado sin importar desde cuál se haya navegado.
document.querySelectorAll('.nav-link, .nav-link-movil[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    if(!sec) return;
    localStorage.setItem('frutia_seccion_actual', sec);
    document.querySelectorAll('.nav-link, .nav-link-movil').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`.nav-link[data-section="${sec}"], .nav-link-movil[data-section="${sec}"]`).forEach(l => l.classList.add('active'));
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.getElementById(`sec-${sec}`).classList.add('activa');
    if (sec === 'analizador' && window.ultimoDiagnosticoData && document.getElementById('resultado-contenido').style.display !== 'flex') {
      mostrarResultado(window.ultimoDiagnosticoData, true);
    }
    if (sec === 'historial') cargarHistorial();
    if (sec === 'dashboard') cargarDashboard();
    if (sec === 'admin') cargarAdmin();
    if (sec === 'perfil') cargarPerfil();
    cerrarMenuMovil();
  });
});

// ── Logout ───────────────────────────────────────────────────────
async function cerrarSesion() {
  localStorage.removeItem('frutia_ultimo_analisis');
  localStorage.removeItem('frutia_chat');
  localStorage.removeItem('frutia_chat_count');
  localStorage.removeItem('frutia_seccion_actual');
  await fetch('/logout');
  window.location.href = '/';
}
btnLogout.addEventListener('click', cerrarSesion);
document.getElementById('btn-logout-movil')?.addEventListener('click', cerrarSesion);

// ── Avatar de perfil ─────────────────────────────────────────────
// Un único <input type="file"> compartido por los dos botones de avatar
// (navbar de escritorio y drawer móvil). Al elegir una imagen se sube
// con FormData (es un archivo binario, no JSON) y, si el servidor la
// acepta, se reemplaza la vista previa en AMBOS botones al instante.
const inputAvatar = document.getElementById('input-avatar');

document.getElementById('avatar-btn-desktop')?.addEventListener('click', () => inputAvatar.click());
document.getElementById('avatar-btn-movil')?.addEventListener('click', () => inputAvatar.click());

inputAvatar.addEventListener('change', async () => {
  const file = inputAvatar.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res  = await fetch('/perfil/avatar', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      mostrarToast('error', __('foto_actualizar_error'), data.error || __('foto_actualizar_error_desc'));
      return;
    }

    // Vista previa inmediata en ambos avatares sin recargar la página
    const urlNueva = `/static/${data.avatar_path}?t=${Date.now()}`; // cache-bust
    ['avatar-btn-desktop', 'avatar-btn-movil'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.querySelector('.avatar-iniciales')?.remove();
      let img = btn.querySelector('.avatar-img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'avatar-img';
        img.alt = 'Foto de perfil';
        btn.prepend(img);
      }
      img.src = urlNueva;
    });

    mostrarToast('success', __('foto_actualizada'), __('foto_actualizada_desc'));
  } catch {
    mostrarToast('error', __('error_conexion'), __('foto_subir_error'));
  } finally {
    inputAvatar.value = '';
  }
});

// ── Captura de imagen ────────────────────────────────────────────
// En móvil, "Tomar foto" abre directo la cámara nativa vía input[capture]
// (funciona sin HTTPS, ver ajustes previos). En PC, antes de abrir nada,
// se verifica si existe una cámara física conectada; si no la hay, se
// avisa con un toast claro en vez de dejar que el navegador abra un
// selector confuso o falle en silencio.
const inputCamara   = document.getElementById('input-camara');
const inputGaleria  = document.getElementById('input-galeria');
const btnTomarFoto  = document.getElementById('btn-tomar-foto');

const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ── Bloqueo de controles durante captura/análisis ───────────────────
// Mientras haya una captura o un análisis en curso, todos los controles
// que podrían iniciar OTRO proceso quedan deshabilitados. Esto evita por
// completo la condición de carrera: sin esto, el usuario podía pulsar
// "Nueva foto" o "Tomar foto" mientras la petición anterior seguía en
// vuelo, y cuando esa respuesta tardía llegaba, sobrescribía a la fuerza
// lo que el usuario ya había hecho mientras tanto (resultado viejo +
// "Cámara no iniciada" mostrados a la vez).
let analisisEnCurso = false;
let solicitudActual = 0; // se incrementa en cada análisis; sirve para
                          // descartar respuestas que ya quedaron obsoletas

const labelGaleria = document.querySelector('label[for="input-galeria"]');

function bloquearControlesCaptura(bloqueado) {
  analisisEnCurso = bloqueado;
  btnTomarFoto.disabled  = bloqueado;
  inputCamara.disabled   = bloqueado;
  inputGaleria.disabled  = bloqueado;
  btnReiniciar.disabled  = bloqueado;
  labelGaleria?.classList.toggle('deshabilitada', bloqueado);

  // Feedback claro de estado: durante el análisis el botón "Nueva foto"
  // cambia a "Analizando…" para que el usuario entienda por qué no
  // responde — no simplemente se ve apagado sin explicación.
  if (bloqueado) {
    btnReiniciar.dataset.textoOriginal = btnReiniciar.textContent;
    btnReiniciar.textContent = __('analisis_analizando');
  } else if (btnReiniciar.dataset.textoOriginal) {
    btnReiniciar.textContent = btnReiniciar.dataset.textoOriginal;
    delete btnReiniciar.dataset.textoOriginal;
  }
}

btnTomarFoto.addEventListener('click', async () => {
  if (analisisEnCurso) return; // defensa adicional, el botón ya estaría disabled
  if (esMovil) {
    inputCamara.click();
    return;
  }
  await abrirCamaraEscritorio();
});

async function abrirCamaraEscritorio() {
  // enumerateDevices() no requiere permiso previo para LISTAR dispositivos,
  // solo para ver sus etiquetas — nos basta con saber si existe al menos
  // un videoinput para decidir si tiene sentido abrir el selector.
  if (!navigator.mediaDevices?.enumerateDevices) {
    // Navegador muy antiguo sin soporte: dejamos que el input intente igual.
    inputCamara.click();
    return;
  }
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const hayCamara = dispositivos.some(d => d.kind === 'videoinput');
    if (hayCamara) {
      inputCamara.click();
    } else {
      mostrarToast('warning', __('camara_no_detectada'), __('camara_no_detectada_desc'));
    }
  } catch {
    // Si la detección falla por cualquier motivo, no bloqueamos al
    // usuario: dejamos que el navegador decida qué mostrar.
    inputCamara.click();
  }
}

function manejarArchivoSeleccionado(file) {
  if (!file || analisisEnCurso) return;
  localStorage.removeItem('frutia_ultimo_analisis');
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    preview.src = b64;
    preview.style.display      = 'block';
    placeholder.style.display  = 'none';
    btnReiniciar.style.display = 'block';
    analizarImagen(b64);
  };
  reader.readAsDataURL(file);
}

inputCamara.addEventListener('change', e  => manejarArchivoSeleccionado(e.target.files[0]));
inputGaleria.addEventListener('change', e => manejarArchivoSeleccionado(e.target.files[0]));

btnReiniciar.addEventListener('click', reiniciar);

function reiniciar() {
  if (analisisEnCurso) return;
  localStorage.removeItem('frutia_ultimo_analisis');
  preview.style.display      = 'none';
  placeholder.style.display  = 'flex';
  overlay.style.display      = 'none';
  zonaOverlay.style.display  = 'none';
  zonaDescDiv.style.display  = 'none';
  btnReiniciar.style.display = 'none';
  mostrarEstadoVacio();
  inputCamara.value  = '';
  inputGaleria.value = '';
}

// ── Analizar imagen ──────────────────────────────────────────────
async function analizarImagen(b64) {
  const miSolicitud = ++solicitudActual;
  bloquearControlesCaptura(true);

  overlay.style.display     = 'flex';
  zonaOverlay.style.display = 'none';
  zonaDescDiv.style.display = 'none';
  mostrarEstadoVacio();

  try {
    const res  = await fetch('/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen: b64 })
    });
    const data = await res.json();

    // Guarda de seguridad: si mientras esta petición estaba en vuelo se
    // disparó OTRA más reciente (no debería poder pasar con los controles
    // bloqueados, pero se deja como defensa en profundidad), se descarta
    // esta respuesta obsoleta para que nunca pise el estado actual.
    if (miSolicitud !== solicitudActual) return;

    overlay.style.display = 'none';
    if (!res.ok)              { mostrarError(data.error || __('analisis_error')); return; }
    if (data.valido === false) { mostrarInvalido(); return; }

    mostrarResultado(data);
    cargarEstadoSistema(); // refresca "última respuesta" y total de análisis
    cargarDashboard();     // refresca dashboard (actividad semanal, cultivos, etc.)
  } catch {
    if (miSolicitud !== solicitudActual) return;
    overlay.style.display = 'none';
    mostrarError(__('analisis_error_conexion'));
  } finally {
    if (miSolicitud === solicitudActual) bloquearControlesCaptura(false);
  }
}

// ── Mostrar resultado ────────────────────────────────────────────
function guardarChat() {
  try {
    localStorage.setItem('frutia_chat', JSON.stringify(window.chatHistorial));
    localStorage.setItem('frutia_chat_count', window.chatPregCount || 0);
  } catch (e) {}
}

function renderFormatted(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*\* /gm, ' • ')
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n/g, '<br>');
}

function mostrarResultado(data, restaurar) {
  window.ultimoDiagnosticoData = data;
  try { localStorage.setItem('frutia_ultimo_analisis', JSON.stringify(data)); } catch (e) {}
  const contMsg = document.getElementById('chat-mensajes');
  if (restaurar) {
    try {
      const chatGuardado = localStorage.getItem('frutia_chat');
      window.chatHistorial = chatGuardado ? JSON.parse(chatGuardado).slice(-15) : [];
      window.chatPregCount = parseInt(localStorage.getItem('frutia_chat_count') || '0', 10);
      contMsg.innerHTML = '';
      window.chatHistorial.forEach(m => chatAgregarBurbuja(m.texto, m.rol === 'user' ? 'usuario' : 'ia'));
      if (window.chatPregCount >= 15) {
        chatAgregarBurbuja(__('chat_limite_msg'), 'ia');
        document.getElementById('chat-input').disabled = true;
        document.getElementById('chat-btn-enviar').disabled = true;
        document.getElementById('chat-sugerencias').innerHTML = '';
      }
    } catch (e) { window.chatHistorial = []; window.chatPregCount = 0; contMsg.innerHTML = ''; }
  } else {
    window.chatHistorial = [];
    window.chatPregCount = 0;
    contMsg.innerHTML = '';
    guardarChat();
  }
  mostrarSugerenciasChat(data);
  ocultarTodos();
  document.getElementById('resultado-contenido').style.display = 'flex';
  document.querySelector('.analizador-grid')?.classList.add('tiene-resultado');

  document.getElementById('res-cultivo').textContent    = data.cultivo    || __('analisis_cultivo_default');
  document.getElementById('res-maduracion').textContent = data.maduracion || __('analisis_maduracion_default');
  
  // Tratamiento
  const txtTratamiento = (data.tratamiento || '').trim();
  document.getElementById('res-tratamiento').innerHTML = txtTratamiento && txtTratamiento !== '—' 
    ? renderFormatted(txtTratamiento) 
    : __('analisis_tratamiento_default');
    
  document.getElementById('res-advertencia').innerHTML = data.advertencia 
    ? renderFormatted(data.advertencia) 
    : '';

  // Recomendación de consumo
  const bloqueRecomendacion = document.getElementById('bloque-recomendacion');
  const resRecomendacion = document.getElementById('res-recomendacion');
  const recConsumo = (data.recomendacion_consumo || '').trim();
  
  if (recConsumo && recConsumo.toLowerCase() !== 'sin contraindicaciones relevantes') {
    resRecomendacion.innerHTML = renderFormatted(recConsumo);
    bloqueRecomendacion.style.display = 'block';
  } else {
    resRecomendacion.innerHTML = __('modal_contraindicaciones');
    bloqueRecomendacion.style.display = 'block';
  }

  renderConfianzaBar(data.confianza || 0, 'res-confianza-fill', 'res-confianza-pct');

  // Enfermedades
  const enfs    = data.enfermedades || [];
  const bloqEnf = document.getElementById('bloque-enfermedades');
  const bloqSano = document.getElementById('bloque-sano');
  const contEnf  = document.getElementById('res-enfermedades');
  contEnf.innerHTML = '';
  
  // Alertas Regionales
  const alertasContainer = document.getElementById('alertas-regionales-container');
  if (data.alertas_regionales && data.alertas_regionales.length > 0) {
    alertasContainer.style.display = 'block';
    alertasContainer.innerHTML = data.alertas_regionales.map(alerta => `
      <div class="alerta-regional-banner">
        <div class="alerta-regional-header">
          ${__('analisis_alerta_zona')}
        </div>
        <p class="alerta-regional-texto">
          ${__('analisis_alerta_texto', alerta.casos, limpiarNombre(alerta.enfermedad), alerta.localidad, alerta.dias)}
        </p>
      </div>
    `).join('');
  } else {
    alertasContainer.style.display = 'none';
    alertasContainer.innerHTML = '';
  }

  if (enfs.length > 0) {
    bloqEnf.style.display  = 'block';
    bloqSano.style.display = 'none';
    enfs.forEach(e => {
      contEnf.innerHTML += `
        <div class="enfermedad-card">
          <div><span class="enfermedad-nombre">${limpiarNombre(e.nombre)}</span>
               <span class="enfermedad-severidad">${e.severidad}</span></div>
          <p>${e.descripcion}</p>
        </div>`;
    });
  } else {
    bloqEnf.style.display  = 'none';
    bloqSano.style.display = 'block';
  }

  // Explicación
  const exp     = data.explicacion || [];
  const bloqExp = document.getElementById('bloque-explicacion');
  const listaExp = document.getElementById('res-explicacion');
  listaExp.innerHTML = '';
  if (exp.length > 0) {
    bloqExp.style.display = 'block';
    exp.forEach(obs => { listaExp.innerHTML += `<li><span>${renderFormatted(obs.replace(/\n/g, ' '))}</span></li>`; });
  } else {
    bloqExp.style.display = 'none';
  }

  // Zona afectada
  const zona = data.zona_afectada;
  if (zona && zona.x !== undefined && enfs.length > 0) {
    let zx = Number(zona.x), zy = Number(zona.y), zw = Number(zona.width), zh = Number(zona.height);
    if (zx > 100 || zy > 100 || zw > 100 || zh > 100) {
      const scale = 10;
      zx /= scale; zy /= scale; zw /= scale; zh /= scale;
    }
    zonaOverlay.style.left   = zx      + '%';
    zonaOverlay.style.top    = zy      + '%';
    zonaOverlay.style.width  = zw  + '%';
    zonaOverlay.style.height = zh + '%';
    zonaOverlay.style.display = 'block';
    if (zona.descripcion) {
      zonaDescText.textContent  = zona.descripcion;
      zonaDescDiv.style.display = 'flex';
    }
  }

// Fuentes
  const fuentes = data.fuentes || [];
  const fuentesDiv = document.getElementById('res-fuentes');
  fuentesDiv.innerHTML = fuentes.map(f => {
    // La IA suele alucinar URLs que están rotas o no existen. 
    // En su lugar, construimos una búsqueda directa en Google con el título y la institución.
    const query = encodeURIComponent(`${f.institucion} ${f.titulo}`);
    const searchUrl = `https://www.google.com/search?q=${query}`;
    return `
      <a href="${searchUrl}" target="_blank" class="fuente-link" title="Buscar documento en Google">
        <span class="fuente-inst">${f.institucion}</span>
        <span class="fuente-titulo">${f.titulo}</span>
        <span class="fuente-search">🔍</span>
      </a>
    `;
  }).join('');
}

// ── Chat de Seguimiento ──────────────────────────────────────────
window.chatHistorial = [];
window.chatPregCount = 0;

function mostrarSugerenciasChat(data) {
  const cont = document.getElementById('chat-sugerencias');
  if (!cont) return;
  if (!data || !data.cultivo) { cont.innerHTML = ''; return; }
  const cultivo = data.cultivo.toLowerCase();
  const enfNombres = (data.enfermedades || []).map(e => (e.nombre || '').toLowerCase());
  const tieneEnf = enfNombres.length > 0 && enfNombres[0] !== 'sano' && enfNombres[0] !== '';
  const lang = obtenerLang();
  if (lang === 'qu') {
    const base = [
      `¿Hayk'ata ${cultivo}ta parquchay?`,
      `¿Ima qallunatachá ${cultivo}ta mikhuwan?`,
      `¿Hayk'a intichá ${cultivo}ta necesitan?`
    ];
    const enf = tieneEnf ? [
      `¿Kay hampiy runa mikhunapaq allinchu?`,
      `¿Imaynan kay unquymanta hark'akuy?`,
      `¿Ima pachapachallan unquyta wiñachin?`
    ] : [];
    const limiteAlcanzado = window.chatPregCount >= 15;
    const todas = [...base, ...enf].slice(0, 3);
    cont.innerHTML = todas.map(q =>
      `<span class="chat-chip${limiteAlcanzado ? ' chip-disabled' : ''}" onclick="${limiteAlcanzado ? '' : "enviarSugerencia('" + q.replace(/'/g, "\\'") + "')"}">${q}</span>`
    ).join('');
    return;
  }
  const base = [
    `¿Cada cuánto debo regar ${cultivo}?`,
    `¿Qué plagas atacan a ${cultivo}?`,
    `¿Cuánto sol necesita ${cultivo} al día?`
  ];
  const enf = tieneEnf ? [
    `¿El tratamiento es seguro para consumo humano?`,
    `¿Cómo prevenir esta enfermedad en el futuro?`,
    `¿Qué condiciones climáticas favorecen esta enfermedad?`
  ] : [];
  const limiteAlcanzado = window.chatPregCount >= 15;
  const todas = [...base, ...enf].slice(0, 3);
  cont.innerHTML = todas.map(q =>
    `<span class="chat-chip${limiteAlcanzado ? ' chip-disabled' : ''}" onclick="${limiteAlcanzado ? '' : "enviarSugerencia('" + q.replace(/'/g, "\\'") + "')"}">${q}</span>`
  ).join('');
}

function enviarSugerencia(pregunta) {
  if (window.chatOcupado) return;
  document.getElementById('chat-input').value = pregunta;
  enviarChatMensaje();
}

function generarSugerenciasDinamicas() {
  const cont = document.getElementById('chat-sugerencias');
  if (!cont || !window.ultimoDiagnosticoData) return;
  const lang = obtenerLang();
  const cultivo = (window.ultimoDiagnosticoData.cultivo || '').toLowerCase();
  const hist = window.chatHistorial || [];
  const pregHechas = hist.filter(m => m.rol === 'user').map(m => m.texto.toLowerCase());
  const ultimoUser = pregHechas.length ? pregHechas[pregHechas.length - 1] : '';
  const ultimoAI = hist.length && hist[hist.length - 1].rol === 'assistant'
    ? hist[hist.length - 1].texto.toLowerCase() : '';
  const contexto = ultimoUser + ' ' + ultimoAI;

  const temas = [
    { id: 'riego', pal: ['riego','agua','regar','humedad','sequía','mojar','secado','parqu','yaku','chiri'],
      qs: lang === 'qu' ? [
        `¿Ima p\'unchaykunapi ${cultivo}ta parquchay?`,
        `¿Yakumanta achkata ${cultivo}ta nanachinchu?`,
        `¿Ima p\'unchaykunapi parquchay lluvyapi?`
      ] : [
        `¿Cómo saber si ${cultivo} necesita agua?`,`¿El exceso de agua daña ${cultivo}?`,`¿Cada cuánto regar en temporada de lluvia?`
      ] },
    { id: 'plaga', pal: ['plaga','plagas','insecto','bicho','pesticida','insecticida','oruga','ácaro','qallu','ch\'uspi'],
      qs: lang === 'qu' ? [
        `¿Imaniray k\'alluykunatachá ${cultivo}ta?`,
        `¿Mayq\'aykunapi insecticidata qulluchiy?`,
        `¿Mayq\'aykunapi señalitokunata qhaway?`
      ] : [
        `¿Cómo controlar plagas en ${cultivo} sin químicos?`,`¿Cada cuánto aplicar insecticida?`,`¿Qué señales indican una plaga?`
      ] },
    { id: 'sol', pal: ['sol','luz','sombra','solares','fotosíntesis','inti','lampu'],
      qs: lang === 'qu' ? [
        `¿${cultivo}ta inti p\'unchaykipi qhaway?`,
        `¿Mayq\'aykunapi intita qhaway?`
      ] : [
        `¿${cultivo} necesita sol directo o media sombra?`,`¿Qué pasa si ${cultivo} recibe poca luz?`
      ] },
    { id: 'suelo', pal: ['suelo','tierra','abono','fertilizante','nutrientes','ph','sustrato','alli','wanu','hallpa'],
      qs: lang === 'qu' ? [
        `¿Ima wanuta ${cultivo}paq munayki?`,
        `¿Hayk\'ata ${cultivo}ta wanuchay?`,
        `¿Imaynan hallp\'ata allichay?`
      ] : [
        `¿Qué abono recomiendas para ${cultivo}?`,`¿Cada cuánto fertilizar ${cultivo}?`,`¿Cómo mejorar el suelo?`
      ] },
    { id: 'enfermedad', pal: ['enfermedad','enfermedades','hongo','virus','bacterias','prevenir','síntomas','unquy','hark\'a'],
      qs: lang === 'qu' ? [
        `¿Imaynan ${cultivo}pa unquyninta hark\'akuy?`,
        `¿Imaniray unquy wiñan?`,
        `¿Kay hampiy allinchu?`
      ] : [
        `¿Cómo prevenir enfermedades en ${cultivo}?`,`¿Qué hacer si la enfermedad avanza?`,`¿El tratamiento recomendado es suficiente?`
      ] },
    { id: 'tratamiento', pal: ['tratamiento','fungicida','producto','aplicar','dosis','químico','orgánico','hampiy','wishk\'a'],
      qs: lang === 'qu' ? [
        `¿Hayk\'ata hampiyta wishk\'ay?`,
        `¿Hayk\'a p\'unchaw suyay hampiyta?`,
        `¿Wak productokunawan chillt\'ay atikunichu?`
      ] : [
        `¿Cada cuánto aplicar el tratamiento?`,`¿Cuánto tiempo esperar después del tratamiento?`,`¿Se puede mezclar con otros productos?`
      ] },
    { id: 'cosecha', pal: ['cosecha','cosechar','maduración','maduro','listo','recoger','pallay','puquy'],
      qs: lang === 'qu' ? [
        `¿Imaynan yachanayki pallanapaq?`,
        `¿Ñawpaq pacha pallay atikunichu?`,
        `¿Imaynan waqaychay ${cultivo}ta pallaspayki?`
      ] : [
        `¿Cómo saber si está listo para cosechar?`,`¿Se puede cosechar antes de tiempo?`,`¿Cómo almacenar ${cultivo} después de cosechar?`
      ] },
    { id: 'poda', pal: ['poda','podar','ramas','hojas','tallo','kuchi','ruruh','q\'umir'],
      qs: lang === 'qu' ? [
        `¿Imaynan ${cultivo}ta kuchuy mana nanachispa?`,
        `¿Mayq\'aykunapi allin ${cultivo}ta kuchuy?`
      ] : [
        `¿Cómo podar ${cultivo} sin dañarlo?`,`¿Cuándo es mejor podar ${cultivo}?`
      ] },
    { id: 'clima', pal: ['clima','temperatura','lluvia','helada','calor','frio','estación','pacha','chiri','ruphay'],
      qs: lang === 'qu' ? [
        `¿${cultivo} chiri pachata resistinchu?`,
        `¿Mayq\'a temperatura ${cultivo}ta nanachin?`
      ] : [
        `¿${cultivo} resiste heladas?`,`¿Qué temperatura daña a ${cultivo}?`
      ] },
    { id: 'consumo', pal: ['consumo','comer','alimento','seguro','tóxico','lavar','cocinar','mikhuy','lampa'],
      qs: lang === 'qu' ? [
        `¿Imaynan ${cultivo}ta mikhunaykipaq llump\'ayay?`,
        `¿Hayk\'a suyay mikhunaykipaq hampiyta?`
      ] : [
        `¿Cómo lavar ${cultivo} antes de consumir?`,`¿Cuánto esperar para consumir tras el tratamiento?`
      ] }
  ];

  const bancoGeneral = lang === 'qu' ? [
    `¿Ima cuidadota ${cultivo} sapa p\'unchay necesitan?`,
    `¿Hayk\'ata ${cultivo}ta parquchay?`,
    `¿Ima qallunatachá ${cultivo}ta mikhuwan?`,
    `¿Mayq\'aykunapi ${cultivo} pallan?`,
    `¿${cultivo} achka intita necesitan?`,
    `¿Mayq\'a hallpa allin ${cultivo}paq?`,
    `¿${cultivo} macetapi allinchu?`,
    `¿Hayk\'a tiempochá ${cultivo} kawsan?`,
    `¿${cultivo} ima pachapipas tarpuy atikunichu?`,
    `¿${cultivo} achka kuchuyta necesitan?`
  ] : [
    `¿Qué cuidados necesita ${cultivo} a diario?`,
    `¿Cada cuánto debo regar ${cultivo}?`,
    `¿Qué plagas atacan a ${cultivo}?`,
    `¿Cuándo se cosecha ${cultivo}?`,
    `¿${cultivo} necesita mucho sol?`,
    `¿Qué tipo de suelo es mejor para ${cultivo}?`,
    `¿${cultivo} se da bien en maceta?`,
    `¿Cuánto tiempo vive ${cultivo}?`,
    `¿Se puede plantar ${cultivo} en cualquier época?`,
    `¿El ${cultivo} necesita poda frecuente?`
  ];

  // Detectar temas del último mensaje
  const temasDetectados = temas.filter(t => t.pal.some(p => contexto.includes(p))).map(t => t.id);
  let sugerencias = [];

  // Priorizar temas detectados (hasta 2 temas)
  for (const id of temasDetectados) {
    const t = temas.find(x => x.id === id);
    if (!t) continue;
    sugerencias.push(...t.qs.filter(q => !pregHechas.some(p => q.toLowerCase().slice(0,25) === p.slice(0,25))));
    if (sugerencias.length >= 4) break;
  }

  // Si faltan, llenar con banco general (excluyendo preguntas ya hechas)
  if (sugerencias.length < 3) {
    const restantes = bancoGeneral.filter(q =>
      !pregHechas.some(p => q.toLowerCase().slice(0,25) === p.slice(0,25)) &&
      !sugerencias.includes(q)
    );
    sugerencias.push(...restantes);
  }

  const limiteAlcanzado = window.chatPregCount >= 15;
  cont.innerHTML = sugerencias.slice(0, 3).map(q =>
    `<span class="chat-chip${limiteAlcanzado ? ' chip-disabled' : ''}" onclick="${limiteAlcanzado ? '' : "enviarSugerencia('" + q.replace(/'/g, "\\'") + "')"}">${q}</span>`
  ).join('');
}

function chatAgregarBurbuja(texto, tipo) {
  const cont = document.getElementById('chat-mensajes');
  const div = document.createElement('div');
  div.className = `chat-burbuja chat-burbuja-${tipo}`;
  let html = texto
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*\* /gm, ' • ')
    .replace(/\n/g, '<br>');
  div.innerHTML = html;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

async function enviarChatMensaje() {
  if (window.chatOcupado) return;
  const input  = document.getElementById('chat-input');
  const btn    = document.getElementById('chat-btn-enviar');
  const pregunta = input.value.trim();

  if (!pregunta) return;
  if (!window.ultimoDiagnosticoData) return;

  if (window.chatPregCount >= 15) {
    chatAgregarBurbuja(__('chat_limite_msg'), 'ia');
    document.getElementById('chat-input').disabled = true;
    document.getElementById('chat-btn-enviar').disabled = true;
    document.getElementById('chat-sugerencias').innerHTML = '';
    mostrarToast('warning', __('limite_alcanzado'), __('limite_alcanzado_desc'), 6000);
    return;
  }

  window.chatOcupado = true;

  // Mostrar mensaje del usuario
  chatAgregarBurbuja(pregunta, 'usuario');
  window.chatHistorial.push({ rol: 'user', texto: pregunta });
  window.chatHistorial = window.chatHistorial.slice(-15);
  window.chatPregCount++;
  guardarChat();
  input.value = '';
  input.disabled = true;
  btn.disabled   = true;

  // Indicador "Escribiendo..."
  const typing = chatAgregarBurbuja(__('chat_escribiendo'), 'typing');

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pregunta,
        pregunta_num: window.chatPregCount,
        contexto: {
          cultivo:       window.ultimoDiagnosticoData.cultivo,
          enfermedades:  window.ultimoDiagnosticoData.enfermedades,
          tratamiento:   window.ultimoDiagnosticoData.tratamiento,
        },
        mensajes: window.chatHistorial.slice(0, -1) // sin la última pregunta, ya va aparte
      })
    });
    const data = await res.json();
    typing.remove();

    if (data.respuesta) {
      chatAgregarBurbuja(data.respuesta, 'ia');
      window.chatHistorial.push({ rol: 'assistant', texto: data.respuesta });
      window.chatHistorial = window.chatHistorial.slice(-15);
      guardarChat();
      if (window.chatPregCount >= 15) {
        chatAgregarBurbuja(__('chat_limite_msg'), 'ia');
        document.getElementById('chat-input').disabled = true;
        document.getElementById('chat-btn-enviar').disabled = true;
        document.getElementById('chat-sugerencias').innerHTML = '';
        mostrarToast('warning', __('limite_alcanzado'), __('limite_alcanzado_desc'), 6000);
      } else {
        generarSugerenciasDinamicas();
      }
    } else {
      chatAgregarBurbuja(__('chat_error_respuesta'), 'ia');
    }
  } catch {
    typing.remove();
    chatAgregarBurbuja(__('chat_error_conexion'), 'ia');
  } finally {
    input.disabled = false;
    btn.disabled   = false;
    input.focus();
    window.chatOcupado = false;
  }
}

// ── Exportar a PDF ───────────────────────────────────────────────

function descargarPDF() {
  const data = window.ultimoDiagnosticoData;
  if (!data) return;

  // Si no tenemos el ID del análisis guardado en BD, no podemos usar el endpoint backend.
  if (!data.analisis_id) {
    mostrarToast('error', __('no_exportar'), __('reporte_no_guardado'));
    return;
  }

  const btn = document.getElementById('btn-descargar-pdf');
  btn.textContent = __('reporte_generando');
  btn.disabled = true;

  // Usa el endpoint backend /reporte-pdf/<id> (WeasyPrint).
  // El PDF se genera 100% en el servidor: no captura el DOM del navegador
  // ni depende del tamaño de la ventana — el resultado es siempre idéntico.
  const nombreArchivo = `FrutIA_Reporte_${(data.cultivo || 'Cultivo').replace(/\s+/g, '_')}.pdf`;

  fetch(`/reporte-pdf/${data.analisis_id}`)
    .then(async res => {
      if (!res.ok) {
        // Intentar leer el mensaje de error del servidor
        let msg = __('reporte_error_servidor', res.status);
        try {
          const body = await res.json();
          if (body.error) msg = body.error;
        } catch (_) {}
        throw new Error(msg);
      }
      return res.blob();
    })
    .then(blob => {
      // Crea un enlace temporal y lo "clica" para forzar la descarga
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = __('reporte_btn_exportar');
      btn.disabled = false;
    })
    .catch(err => {
      console.error('Error al generar PDF:', err);
      btn.textContent = __('reporte_btn_exportar');
      btn.disabled = false;
      mostrarToast('error', __('exportar_error'), err.message || __('reporte_error'));
    });
}



// ── Barra de confianza ───────────────────────────────────────────


function renderConfianzaBar(valor, fillId, pctId) {
  const fill = document.getElementById(fillId);
  const pct  = pctId ? document.getElementById(pctId) : null;
  fill.style.width = valor + '%';
  fill.className   = 'confianza-fill';
  if (valor >= 80)      fill.classList.add('verde');
  else if (valor >= 60) fill.classList.add('amarillo');
  else                  fill.classList.add('rojo');
  if (pct) pct.textContent = valor + '%';
}

// ── Estados UI ───────────────────────────────────────────────────
function ocultarTodos() {
  ['resultado-vacio','resultado-invalido','resultado-contenido','resultado-error']
    .forEach(id => document.getElementById(id).style.display = 'none');
}
function mostrarEstadoVacio() { ocultarTodos(); document.getElementById('resultado-vacio').style.display = 'flex'; document.querySelector('.analizador-grid')?.classList.remove('tiene-resultado'); }
function mostrarInvalido()    { ocultarTodos(); document.getElementById('resultado-invalido').style.display = 'flex'; document.querySelector('.analizador-grid')?.classList.remove('tiene-resultado'); }
function mostrarError(msg)    {
  ocultarTodos();
  document.getElementById('resultado-error').style.display = 'flex';
  document.getElementById('error-texto').textContent = msg;
  document.querySelector('.analizador-grid')?.classList.remove('tiene-resultado');
  mostrarToast('error', __('analisis_no'), msg);
}

// ── Historial ────────────────────────────────────────────────────
let historialPaginaActual = 1;
const HISTORIAL_POR_PAGINA = 15;
let historialFiltradoCache = [];
let historialModoSeleccion = false;
let historialSeleccionados = new Set();

function toggleVistaHistorial() {
  const lista = document.getElementById('historial-lista');
  const iconLista = document.getElementById('icon-lista');
  const iconCuadricula = document.getElementById('icon-cuadricula');
  if (lista.classList.contains('historial-vista-compacta')) {
    lista.classList.remove('historial-vista-compacta');
    iconLista.style.display = 'block';
    iconCuadricula.style.display = 'none';
  } else {
    lista.classList.add('historial-vista-compacta');
    iconLista.style.display = 'none';
    iconCuadricula.style.display = 'block';
  }
}

function toggleModoSeleccion() {
  historialModoSeleccion = !historialModoSeleccion;
  historialSeleccionados.clear();
  const lista = document.getElementById('historial-lista');
  const btn = document.getElementById('btn-seleccionar-historial');
  lista.classList.toggle('historial-modo-seleccion', historialModoSeleccion);
  btn.style.background = historialModoSeleccion ? 'var(--verde-profundo)' : '';
  btn.style.color = historialModoSeleccion ? 'white' : '';
  actualizarBarraSeleccion();
  renderHistorial(false); // re-render para mostrar/ocultar checkboxes
}

function cancelarSeleccion() {
  historialModoSeleccion = false;
  historialSeleccionados.clear();
  const lista = document.getElementById('historial-lista');
  const btn = document.getElementById('btn-seleccionar-historial');
  lista.classList.remove('historial-modo-seleccion');
  btn.style.background = '';
  btn.style.color = '';
  actualizarBarraSeleccion();
  renderHistorial(false);
}

function toggleSeleccionItem(id, e) {
  if (e) e.stopPropagation();
  if (historialSeleccionados.has(id)) {
    historialSeleccionados.delete(id);
  } else {
    historialSeleccionados.add(id);
  }
  const card = document.querySelector(`.historial-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('seleccionada', historialSeleccionados.has(id));
    const checkbox = card.querySelector('.historial-checkbox');
    if (checkbox) checkbox.checked = historialSeleccionados.has(id);
  }
  actualizarBarraSeleccion();
}

function actualizarBarraSeleccion() {
  const barra = document.getElementById('historial-barra-accion');
  const texto = document.getElementById('barra-seleccion-texto');
  const n = historialSeleccionados.size;
  if (historialModoSeleccion && n > 0) {
    barra.classList.add('visible');
    texto.textContent = __(n === 1 ? 'hist_seleccionados' : 'hist_seleccionados_plural', n);
  } else {
    barra.classList.remove('visible');
  }
}

function confirmarEliminarSeleccion() {
  const ids = [...historialSeleccionados];
  if (!ids.length) return;
  const n = ids.length;
  mostrarConfirmacionEliminar(
    __(n === 1 ? 'hist_eliminar_multi' : 'hist_eliminar_multi_plural', n),
    __('hist_eliminar_multi_desc', n),
    async () => {
      try {
        const res = await fetch('/historial/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        });
        const data = await res.json();
        if (res.ok) {
          window.historialData = (window.historialData || []).filter(i => !ids.includes(i.id));
          cancelarSeleccion();
          renderHistorial(true);
          cargarEstadoSistema(); // Actualiza KPI de total de análisis automáticamente
          if (document.getElementById('sec-dashboard').classList.contains('activa')) {
            cargarDashboard();
          }
          mostrarToast('success', __('registros_eliminados'), data.mensaje);
        } else {
          mostrarToast('error', __('toast_error'), data.error);
        }
      } catch { mostrarToast('error', __('error_conexion'), __('eliminar_error')); }
    }
  );
}

function eliminarAnalisisUnico(id, nombre) {
  mostrarConfirmacionEliminar(
    __('hist_eliminar_individual', nombre),
    __('hist_eliminar_individual_desc'),
    async () => {
      try {
        const res = await fetch('/historial/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [id] })
        });
        const data = await res.json();
        if (res.ok) {
          window.historialData = (window.historialData || []).filter(i => i.id !== id);
          cerrarModalHistorial();
          renderHistorial(true);
          cargarEstadoSistema(); // Actualiza KPI de total de análisis automáticamente
          if (document.getElementById('sec-dashboard').classList.contains('activa')) {
            cargarDashboard();
          }
          mostrarToast('success', __('registro_eliminado'), data.mensaje);
        } else {
          mostrarToast('error', __('toast_error'), data.error);
        }
      } catch { mostrarToast('error', __('error_conexion'), __('eliminar_registro_error')); }
    }
  );
}

function resetModalConfirmacion() {
  document.getElementById('modal-confirmacion-input-wrap').style.display = 'none';
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  btnConfirmar.disabled = false;
}

function mostrarConfirmacionEliminar(titulo, descripcion, onConfirmar) {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');
  resetModalConfirmacion();
  texto.innerHTML = `<strong style="display:block;margin-bottom:0.5rem;">${titulo}</strong><span style="font-size:0.9rem;color:#64748b;">${descripcion}</span>`;
  modal.style.display = 'flex';
  btnCancelar.onclick = () => { modal.style.display = 'none'; };
  btnConfirmar.onclick = async () => { modal.style.display = 'none'; await onConfirmar(); };
}

function cargarMasHistorial() {
  historialPaginaActual++;
  renderHistorial(false);
}

function getFechaGrupo(fechaStr) {
  if (!fechaStr) return __('hist_desconocido');
  const date = new Date(fechaStr);
  if (isNaN(date)) return fechaStr.split(' ')[0];
  
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  
  const lang = obtenerLang();
  const dString = date.toLocaleDateString();
  if (dString === hoy.toLocaleDateString()) return __('hist_hoy');
  if (dString === ayer.toLocaleDateString()) return __('hist_ayer');
  
  const dia = date.getDate();
  const mes = date.getMonth();
  const año = date.getFullYear();
  const meses = lang === 'qu' ? MESES_QU_LARGO : MESES_ES_LARGO;
  return `${dia} de ${meses[mes]} de ${año}`;
}

function renderHistorial(reiniciarPagina = false) {
  const lista = document.getElementById('historial-lista');
  const busquedaVal = document.getElementById('historial-buscar').value.toLowerCase();
  const estadoVal = document.getElementById('historial-filtro-estado').value;
  const data = window.historialData || [];

  if (reiniciarPagina) {
    historialPaginaActual = 1;
    historialFiltradoCache = data.filter(item => {
      // 1. Filtro texto
      const textMatch = !busquedaVal || 
                        (item.cultivo || '').toLowerCase().includes(busquedaVal) ||
                        (item.enfermedades || []).some(e => e.nombre.toLowerCase().includes(busquedaVal));
      if (!textMatch) return false;
      
      // 2. Filtro estado
      if (estadoVal === 'sanos' && (item.enfermedades && item.enfermedades.length > 0)) return false;
      if (estadoVal === 'enfermos' && (!item.enfermedades || item.enfermedades.length === 0)) return false;
      
      return true;
    });
  }

  const itemsAMostrar = historialFiltradoCache.slice(0, historialPaginaActual * HISTORIAL_POR_PAGINA);

  if (!itemsAMostrar.length) { 
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>' + __('hist_sin_resultados') + '</h3><p>' + __('hist_sin_resultados_desc') + '</p></div>'; 
    return; 
  }

  let html = '';
  let ultimoGrupo = null;

  itemsAMostrar.forEach(item => {
    const grupo = getFechaGrupo(item.fecha);
    if (grupo !== ultimoGrupo) {
      html += `<div class="historial-fecha-header">${grupo}</div>`;
      ultimoGrupo = grupo;
    }

    const imgHtml = item.imagen_path
      ? `<div class="historial-img-wrap"><img src="/static/${item.imagen_path}" alt="${item.cultivo}" class="historial-img"/></div>`
      : `<div class="historial-img-wrap historial-img-placeholder">📷</div>`;

    const enfs = item.enfermedades || [];
    const estaEnfermo = enfs.length > 0;
    const enfsHtml = estaEnfermo
      ? enfs.map(e => `<span class="historial-enfermedad-tag">⚠️ ${limpiarNombre(e.nombre)}</span>`).join('')
      : '<span class="historial-enfermedad-tag historial-tag-sano" style="background:#d1fae5;color:#065f46;">' + __('hist_sano') + '</span>';

    const borderColor = estaEnfermo ? '#ef4444' : 'var(--verde-claro)';

    html += `
      <div class="historial-card ${historialSeleccionados.has(item.id) ? 'seleccionada' : ''}" data-id="${item.id}"
           onclick="${historialModoSeleccion ? `toggleSeleccionItem(${item.id}, event)` : `abrirDetalleHistorial(${item.id})`}"
           style="border-left-color:${borderColor}; border-bottom-color:${borderColor}; cursor:pointer;">
        <input type="checkbox" class="historial-checkbox" ${historialSeleccionados.has(item.id) ? 'checked' : ''}
               onclick="toggleSeleccionItem(${item.id}, event)" />
        ${imgHtml}
        <div class="historial-info">
          <div class="historial-card-header">
            <div class="historial-cultivo">${item.cultivo || __('hist_desconocido')}</div>
            <div class="historial-fecha">${formatearFecha(item.fecha)}</div>
          </div>
          <div class="historial-maduracion">${item.maduracion || __('analisis_maduracion_default')}</div>
          <div class="historial-confianza-wrap">
            <div class="confianza-track historial-confianza-track">
              <div class="confianza-fill ${item.confianza >= 80 ? 'verde' : item.confianza >= 60 ? 'amarillo' : 'rojo'}"
                   style="width:${item.confianza||0}%"></div>
            </div>
            <span class="historial-confianza-pct">${item.confianza||0}%</span>
          </div>
          <div>${enfsHtml}</div>
        </div>
      </div>`;
  });

  lista.innerHTML = html;

  // Mostrar u ocultar botón "Cargar más"
  const wrapCargar = document.getElementById('historial-cargar-mas-wrap');
  if (wrapCargar) {
    wrapCargar.style.display = itemsAMostrar.length < historialFiltradoCache.length ? 'block' : 'none';
  }
}

function abrirDetalleHistorial(id) {
  const data = (window.historialData || []).find(item => item.id === id);
  if (!data) return;

  const modal = document.getElementById('modal-historial-analisis');
  const cuerpo = document.getElementById('modal-historial-cuerpo');

  const enfs = data.enfermedades || [];
  const enfsHtml = enfs.length > 0 
    ? enfs.map(e => `
        <div style="background:#FEF3C7; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #F59E0B;">
          <h4 style="margin:0; color:#92400E; display:flex; justify-content:space-between; align-items:center;">
            ${limpiarNombre(e.nombre)} 
            <span style="font-size:0.75rem; background:#fff; padding:2px 6px; border-radius:4px; font-weight:bold;">${e.severidad}</span>
          </h4>
          <p style="margin:0.5rem 0 0; font-size:0.9rem; line-height:1.4;">${e.descripcion}</p>
        </div>
      `).join('')
    : `<div style="background:#d1fae5; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #10b981;">
         <h4 style="margin:0; color:#065f46;">${__('modal_sano')}</h4>
         <p style="margin:0.5rem 0 0; font-size:0.9rem;">${__('modal_sano_desc')}</p>
       </div>`;

  const imgHtml = data.imagen_path
      ? `<img src="/static/${data.imagen_path}" style="width:100%; height:220px; object-fit:cover; border-radius:8px; margin-bottom:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.1);"/>`
      : '';

  cuerpo.innerHTML = `
    <h2 style="margin:0 0 0.2rem 0; color:var(--verde-profundo); font-family:var(--font-sans); font-size:1.5rem;">${data.cultivo || __('analisis_cultivo_default')}</h2>
    <p style="color:var(--texto-suave); font-size:0.85rem; margin-bottom:1.5rem;">${formatearFecha(data.fecha)}</p>
    
    ${imgHtml}
    
    <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">
      <div style="flex:1; background:#f8fafc; padding:1rem; border-radius:8px; border:1px solid #e2e8f0; min-width:140px;">
        <strong style="display:block; font-size:0.75rem; color:var(--texto-suave); margin-bottom:0.2rem; text-transform:uppercase; letter-spacing:0.5px;">${__('modal_estado_maduracion')}</strong>
        <span style="font-weight:700; color:var(--verde-medio); font-size:1.1rem;">${data.maduracion || __('analisis_maduracion_default')}</span>
      </div>
      <div style="flex:1; background:#f8fafc; padding:1rem; border-radius:8px; border:1px solid #e2e8f0; min-width:140px;">
        <strong style="display:block; font-size:0.75rem; color:var(--texto-suave); margin-bottom:0.2rem; text-transform:uppercase; letter-spacing:0.5px;">${__('modal_confianza_ia')}</strong>
        <span style="font-weight:800; font-size:1.1rem; color:${data.confianza >= 80 ? 'var(--verde)' : data.confianza >= 60 ? '#d97706' : 'var(--rojo)'};">${data.confianza}%</span>
      </div>
    </div>

    <h3 style="margin-bottom:0.8rem; font-size:1.1rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">${__('modal_diagnostico')}</h3>
    ${enfsHtml}

    ${(data.zona_afectada && data.zona_afectada.descripcion && enfs.length > 0) ? `
      <div style="background:#fff7ed; padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid #f97316; margin-top:-0.5rem;">
        <strong style="font-size:0.8rem; color:#c2410c; text-transform:uppercase; letter-spacing:0.5px;">${__('modal_zona_afectada')}</strong>
        <p style="margin:0.3rem 0 0; font-size:0.9rem; color:#9a3412;">${data.zona_afectada.descripcion}</p>
      </div>
    ` : ''}

    ${(data.explicacion && data.explicacion.length > 0) ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">${__('modal_porque_diagnostico')}</h3>
      <ul style="margin:0 0 1rem; padding-left:1.2rem; display:flex; flex-direction:column; gap:0.4rem;">
        ${(data.explicacion || []).map(obs => `<li style="font-size:0.9rem; color:#334155; line-height:1.5;">${renderFormatted(obs.replace(/\n/g, ' '))}</li>`).join('')}
      </ul>
    ` : ''}

    <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">${__('modal_tratamiento')}</h3>
    <p style="font-size:0.95rem; line-height:1.35; color:#334155;">${data.tratamiento ? renderFormatted(data.tratamiento) : __('modal_tratamiento_default')}</p>

    ${data.recomendacion_consumo ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; color:#b45309; border-bottom:2px solid #fef3c7; padding-bottom:0.4rem;">${__('modal_recomendacion_consumo')}</h3>
      <p style="font-size:0.95rem; line-height:1.35; color:#92400E; background:#fffbeb; padding:1rem; border-radius:8px; border-left:4px solid #f59e0b;">${data.recomendacion_consumo ? renderFormatted(data.recomendacion_consumo) : ''}</p>
    ` : ''}

    ${(data.fuentes && data.fuentes.length > 0) ? `
      <h3 style="margin-bottom:0.8rem; font-size:1.1rem; margin-top:1.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.4rem;">${__('modal_fuentes')}</h3>
      <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
        ${(data.fuentes || []).map(f => {
          const q = encodeURIComponent(f.institucion + ' ' + f.titulo);
          return '<a href="https://www.google.com/search?q=' + q + '" target="_blank" style="display:flex; gap:0.5rem; align-items:center; padding:0.6rem 0.8rem; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; text-decoration:none; color:inherit; font-size:0.85rem;"><span style=\'font-weight:700; color:var(--verde-profundo); flex-shrink:0;\'>' + f.institucion + '</span><span style=\'color:var(--texto-suave);\'>🔍 ' + f.titulo + '</span></a>';
        }).join('')}
      </div>
    ` : ''}

    <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid #f1f5f9; display:flex; gap:0.8rem; justify-content:space-between; flex-wrap:wrap; align-items:center;">
      <button onclick="eliminarAnalisisUnico(${data.id}, '${(data.cultivo||'Registro').replace(/'/g, "\\'")}')"
        style="padding:0.5rem 1rem; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:8px; cursor:pointer; font-family:var(--font-sans); font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
        ${__('modal_eliminar')}
      </button>
      <div style="display:flex; gap:0.8rem;">
        <button onclick="cerrarModalHistorial()" style="padding:0.6rem 1.2rem; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; font-family:var(--font-sans); color:#334155; font-size:0.9rem;">${__('modal_cerrar')}</button>
        <a href="/reporte-pdf/${data.id}" target="_blank" class="btn-secundario btn-pdf" style="text-decoration:none;">${__('modal_exportar')}</a>
      </div>
    </div>
  `;

  document.body.style.overflow = 'hidden';
  modal.style.display = 'flex';
}

function cerrarModalHistorial() {
  document.getElementById('modal-historial-analisis').style.display = 'none';
  document.body.style.overflow = '';
}

function observarScrollHistorial() {
  const trigger = document.getElementById('historial-scroll-trigger');
  if (!trigger) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      historialPaginaActual++;
      renderHistorial(false);
    }
  });
  observer.observe(trigger);
}

async function cargarHistorial() {
  const lista = document.getElementById('historial-lista');
  const skeletonHTML = `
    <div class="skeleton-card skeleton">
      <div class="skeleton-img skeleton"></div>
      <div class="skeleton-text skeleton"></div>
      <div class="skeleton-text skeleton short"></div>
      <div class="skeleton-text skeleton tall"></div>
    </div>
  `.repeat(4);
  lista.innerHTML = skeletonHTML;
  try {
    const res  = await fetch('/historial');
    const data = await res.json();
    
    window.historialData = data;
    
    if (!data.length) { 
      lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>' + __('hist_sin_analisis') + '</h3><p>' + __('hist_sin_analisis_desc') + '</p></div>'; 
      return; 
    }

    renderHistorial(true);
  } catch { lista.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('hist_error_cargar') + '</p></div>'; }
}

// ── Dashboard ────────────────────────────────────────────────────
async function cargarDashboard() {
  try {
    cargarEstadoSistema(); // Actualiza KPI de total de análisis y estado del sistema
    const res  = await fetch('/estadisticas', { cache: 'no-cache' });
    const data = await res.json();

    document.getElementById('dash-total').textContent = data.total_analisis;
    document.querySelector('.chart-nota') && (document.querySelector('.chart-nota').innerHTML = __('chart_basado_en', data.total_analisis));
    renderConfianzaBar(data.confianza_promedio, 'dash-confianza-fill', null);
    document.getElementById('dash-confianza-pct').textContent = data.confianza_promedio + '%';

    const baseOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Montserrat', size: 11 }, padding: 12, usePointStyle: true }
        }
      }
    };

    // 1. Estado
    if (chartEstado) chartEstado.destroy();
    const wrapEstado = document.getElementById('wrap-chart-estado');
    if (wrapEstado) {
      wrapEstado.innerHTML = '<canvas id="chart-estado"></canvas>';
    }
    const estado = data.por_estado;
    chartEstado = new Chart(document.getElementById('chart-estado'), {
      type: 'doughnut',
      data: {
        labels: [__('graf_sanos'), __('graf_posibles_enfermedades')],
        datasets: [{ data: [estado.sanos, estado.enfermos], backgroundColor: [VERDE_CLARO, WARNING], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { ...baseOpts, cutout: '65%' }
    });

    // 2. Enfermedades
    if (chartEnfermedades) chartEnfermedades.destroy();
    const wrapEnfs = document.getElementById('wrap-chart-enfermedades');
    const enfs = data.por_enfermedad;
    if (wrapEnfs) {
      if (enfs.length > 0) {
        wrapEnfs.innerHTML = '<canvas id="chart-enfermedades"></canvas>';
        chartEnfermedades = new Chart(document.getElementById('chart-enfermedades'), {
          type: 'bar',
          data: {
            labels: enfs.map(e => limpiarNombre(e.nombre)),
            datasets: [{ label: __('graf_frecuencia'), data: enfs.map(e => e.cantidad), backgroundColor: WARNING, borderRadius: 6, borderSkipped: false }]
          },
          options: { ...baseOpts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 }, grid: { display: false } }, y: { grid: { display: false } } } }
        });
      } else {
        wrapEnfs.innerHTML = '<div class="empty-state is-chart"><div class="empty-state-icon">🩺</div><h3>' + __('graf_sin_enfermedades') + '</h3><p>' + __('graf_sin_enfermedades_desc') + '</p></div>';
      }
    }

    // 3. Cultivos — Top 5 + "Otros" (patrón estándar de dashboards escalables)
    if (chartCultivos) chartCultivos.destroy();
    const wrapCultivos = document.getElementById('wrap-chart-cultivos');
    const cultivos = data.por_cultivo;
    if (wrapCultivos) {
      if (cultivos.length > 0) {
        wrapCultivos.innerHTML = '<canvas id="chart-cultivos"></canvas>';
        // "Otros" recibe un gris neutro para que quede visualmente claro que
        // es una agregación y no un cultivo real con identidad propia.
        const coloresCultivos = cultivos.map((c, i) =>
          c.cultivo === 'Otros' ? '#9CA3AF' : PALETTE[i % PALETTE.length]
        );

        // Si hay "Otros", mostramos una nota informativa debajo del gráfico
        // con cuántos tipos agrupa — información útil que no cabe en el chart.
        const nOtros = cultivos.find(c => c.cultivo === 'Otros')?._n_otros;
        const notaEl = document.getElementById('chart-cultivos-nota');
        if (notaEl) notaEl.textContent = nOtros
          ? __(nOtros === 1 ? 'graf_agrupa' : 'graf_agrupa_plural', nOtros)
          : '';

        chartCultivos = new Chart(document.getElementById('chart-cultivos'), {
          type: 'doughnut',
          data: {
            labels: cultivos.map(c => c.cultivo),
            datasets: [{
              data: cultivos.map(c => c.cantidad),
              backgroundColor: coloresCultivos,
              borderWidth: 0,
              hoverOffset: 6
            }]
          },
          options: {
            ...baseOpts,
            cutout: '55%',
            plugins: {
              ...baseOpts.plugins,
              tooltip: {
                callbacks: {
                  // Añade contexto extra en "Otros": "X tipos con menor frecuencia"
                  afterLabel: (ctx) => {
                    const item = cultivos[ctx.dataIndex];
                    return item._n_otros
                      ? __(item._n_otros === 1 ? 'graf_tipos_agrupados' : 'graf_tipos_agrupados_plural', item._n_otros)
                      : '';
                  }
                }
              }
            }
          }
        });
      } else {
        wrapCultivos.innerHTML = '<div class="empty-state is-chart"><div class="empty-state-icon">🌱</div><h3>' + __('graf_sin_cultivos') + '</h3><p>' + __('graf_sin_cultivos_desc') + '</p></div>';
        const notaEl = document.getElementById('chart-cultivos-nota');
        if (notaEl) notaEl.textContent = '';
      }
    }

    // 4. Actividad semanal
    if (chartActividad) chartActividad.destroy();
    const wrapActividad = document.getElementById('wrap-chart-actividad');
    if (wrapActividad) {
      wrapActividad.innerHTML = '<canvas id="chart-actividad"></canvas>';
    }
    const act = data.actividad_semanal;
    chartActividad = new Chart(document.getElementById('chart-actividad'), {
      type: 'line',
      data: {
        labels: act.map(a => formatearDia(a.dia)),
        datasets: [{
          label: __('graf_analisis'),
          data: act.map(a => a.cantidad),
          borderColor: VERDE_CLARO,
          backgroundColor: 'rgba(82,183,136,0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: VERDE_PROFUNDO,
          pointRadius: 4
        }]
      },
      options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
    });

  } catch (err) { console.error('Dashboard error:', err); }
}

// ── Helpers ──────────────────────────────────────────────────────
const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_QU = ['Ini','Hat','Pau','Ayr','Aym','Int','Ant','Qap','Uma','Kan','Aya','Qap'];
const MESES_ES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_QU_LARGO = ['Qhulla','Hatun','Paucar','Ayrway','Aymuray','Inti','Anta','Qapaq','Uma','Kantaray','Ayamarq\'a','Qhapaq'];

function formatearFecha(f) {
  if (!f) return __('analisis_maduracion_default');
  const lang = obtenerLang();
  const d = new Date(f);
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = d.getMonth();
  const año = d.getFullYear();
  if (lang === 'qu') return `${dia} ${MESES_QU[mes]}. ${año}`;
  return `${dia} ${MESES_ES[mes]}. ${año}`;
}
function formatearDia(d) {
  if (!d) return '';
  const lang = obtenerLang();
  const meses = lang === 'qu' ? MESES_QU : MESES_ES;
  const [,m, dia] = d.split('-');
  return `${parseInt(dia)} ${meses[parseInt(m)-1]}`;
}

// ── Admin ─────────────────────────────────────────────────────────
const esAdmin = document.querySelector('.nav-admin') !== null;

let adminUsersCache = []; // Caché para búsqueda y filtros locales

const regionesDataAdmin = {
  "La Libertad": ["Paiján", "Trujillo", "Chepén", "Pacasmayo", "Ascope"],
  "Lima": ["Lima Central", "Cañete", "Huaral", "Barranca", "Huaura"],
  "Piura": ["Piura", "Sullana", "Paita", "Talara", "Sechura"],
  "Ica": ["Ica", "Chincha", "Pisco", "Nazca", "Palpa"],
  "Cusco": ["Cusco", "Urubamba", "Quillabamba", "Sicuani", "Calca"],
  "Arequipa": ["Arequipa", "Camaná", "Mollendo", "Chivay", "Caravelí"]
};

if (esAdmin) {
  document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => {
    document.getElementById('admin-form').style.display = 'flex';
    document.getElementById('btn-nuevo-usuario').style.display = 'none';
  });

  document.getElementById('btn-cancelar-usuario')?.addEventListener('click', () => {
    document.getElementById('admin-form').style.display = 'none';
    document.getElementById('btn-nuevo-usuario').style.display = 'block';
    limpiarFormAdmin();
  });

  document.getElementById('btn-guardar-usuario')?.addEventListener('click', guardarUsuario);

  // Filtros y buscador
  document.getElementById('admin-buscar')?.addEventListener('input', renderUsuariosFiltrados);
  document.getElementById('admin-filtro-region')?.addEventListener('change', function() {
    const region = this.value;
    const locSelect = document.getElementById('admin-filtro-localidad');
    locSelect.innerHTML = '<option value="">' + __('admin_todas_localidades') + '</option>';
    if (region && regionesDataAdmin[region]) {
      locSelect.disabled = false;
      regionesDataAdmin[region].forEach(loc => locSelect.innerHTML += `<option value="${loc}">${loc}</option>`);
    } else {
      locSelect.disabled = true;
    }
    renderUsuariosFiltrados();
  });
  document.getElementById('admin-filtro-localidad')?.addEventListener('change', renderUsuariosFiltrados);

  // Poblar regiones en los select de filtro y formulario
  const selectRegFiltro = document.getElementById('admin-filtro-region');
  const selectRegForm = document.getElementById('form-region');
  for (const region in regionesDataAdmin) {
    if(selectRegFiltro) selectRegFiltro.innerHTML += `<option value="${region}">${region}</option>`;
    if(selectRegForm) selectRegForm.innerHTML += `<option value="${region}">${region}</option>`;
  }

  selectRegForm?.addEventListener('change', function() {
    const region = this.value;
    const locSelect = document.getElementById('form-localidad');
    locSelect.innerHTML = '<option value="">' + __('admin_localidad_placeholder') + '</option>';
    if (region && regionesDataAdmin[region]) {
      locSelect.disabled = false;
      regionesDataAdmin[region].forEach(loc => locSelect.innerHTML += `<option value="${loc}">${loc}</option>`);
    } else {
      locSelect.disabled = true;
    }
  });

  // Solo números en clave
  document.getElementById('form-clave')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '');
  });
  
  // Cerrar modal
  document.getElementById('btn-cerrar-modal')?.addEventListener('click', () => {
    document.getElementById('modal-usuario').style.display = 'none';
  });
}

async function cargarAdmin() {
  await Promise.all([cargarAdminStats(), cargarAdminUsuarios()]);
}

async function cargarAdminStats() {
  const grid = document.getElementById('admin-stats-grid');
  try {
    const res  = await fetch('/admin/estadisticas');
    const data = await res.json();

    grid.innerHTML = `
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.total_analisis}</div>
        <div class="admin-stat-label">${__('admin_analisis_totales')}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.total_usuarios}</div>
        <div class="admin-stat-label">${__('admin_usuarios_registrados')}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.confianza_promedio}%</div>
        <div class="admin-stat-label">${__('admin_confianza_promedio')}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">🦠</div>
        <div class="admin-stat-label">${__('admin_enfermedad_comun')}</div>
        <div class="admin-stat-sub">${data.enfermedad_comun}</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">🏆</div>
        <div class="admin-stat-label">${__('admin_usuario_activo')}</div>
        <div class="admin-stat-sub">${data.usuario_mas_activo?.nombre || '—'} (${data.usuario_mas_activo?.cantidad || 0} ${__('admin_analisis')})</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${data.por_estado?.sanos || 0} / ${data.por_estado?.enfermos || 0}</div>
        <div class="admin-stat-label">${__('admin_sanos_enfermos')}</div>
      </div>
    `;
  } catch { grid.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('admin_stats_error') + '</p></div>'; }
}

async function cargarAdminUsuarios() {
  const lista = document.getElementById('admin-usuarios-lista');
  const skeletonHTML = `
    <div class="admin-usuario-row" style="background:#fff; border-color:transparent;">
      <div class="skeleton-text skeleton" style="margin:0; width:40%;"></div>
      <div class="skeleton-text skeleton short" style="margin-top:8px;"></div>
    </div>
  `.repeat(3);
  lista.innerHTML = skeletonHTML;
  try {
    const res   = await fetch('/admin/usuarios');
    adminUsersCache = await res.json();
    renderUsuariosFiltrados();
  } catch { lista.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('admin_usuarios_error') + '</p></div>'; }
}

function renderUsuariosFiltrados() {
  const lista = document.getElementById('admin-usuarios-lista');
  if(!lista) return;
  const textoBusqueda = (document.getElementById('admin-buscar')?.value || '').toLowerCase();
  const filtroRegion = document.getElementById('admin-filtro-region')?.value || '';
  const filtroLocalidad = document.getElementById('admin-filtro-localidad')?.value || '';
  
  // Obtener el nombre del admin actual para mostrar "(Tú)"
  // Extraemos el primer nodo de texto de .usuario-nombre para evitar el badge
  const elemNombre = document.querySelector('.usuario-nombre');
  const nombreAdminActual = elemNombre ? elemNombre.childNodes[0].textContent.trim() : '';

  let filtrados = adminUsersCache.filter(u => {
    const coincideTexto = u.nombre.toLowerCase().includes(textoBusqueda) || u.dni.includes(textoBusqueda);
    const coincideRegion = !filtroRegion || u.region === filtroRegion;
    const coincideLocalidad = !filtroLocalidad || u.localidad === filtroLocalidad;
    return coincideTexto && coincideRegion && coincideLocalidad;
  });

  // Ordenar: Admins primero, luego orden alfabético
  filtrados.sort((a, b) => {
    if (a.rol === 'admin' && b.rol !== 'admin') return -1;
    if (a.rol !== 'admin' && b.rol === 'admin') return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>' + __('admin_sin_resultados') + '</h3><p>' + __('admin_sin_resultados_desc') + '</p></div>';
    return;
  }

  lista.innerHTML = filtrados.map(u => {
    const esElMismo = (u.nombre === nombreAdminActual);
    const badgeTu = esElMismo ? ' <span style="font-size:0.8rem;color:var(--verde-medio);font-weight:700;">' + __('admin_tu') + '</span>' : '';
    
    return `
    <div class="admin-usuario-row" id="user-row-${u.id}">
      <div class="admin-usuario-fila" onclick="abrirDetallesUsuario(event, ${u.id})" style="cursor: pointer;">
        <div class="admin-usuario-info">
          <div class="admin-usuario-nombre">${escaparHtml(u.nombre)}${badgeTu}</div>
          <div class="admin-usuario-meta">
            ${u.region && u.localidad ? u.localidad + ', ' + u.region + ' · ' : ''}
            ${u.total_analisis} ${__('admin_analisis')}
            ${u.ultimo_analisis ? '· ' + __('admin_ultimo') + formatearFecha(u.ultimo_analisis) : '· ' + __('admin_sin_analisis_label')}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;" onclick="event.stopPropagation()">
          <span class="admin-usuario-rol rol-${u.rol}">${u.rol === 'admin' ? __('admin_rol_admin') : __('admin_rol_agricultor')}</span>
          <button class="btn-editar" data-uid="${u.id}" onclick="toggleEditarUsuario(${u.id})">${__('admin_editar')}</button>
          ${!esElMismo ? `<button class="btn-eliminar" data-uid="${u.id}" data-nombre="${escaparHtml(u.nombre)}" onclick="eliminarUsuario(${u.id}, this.dataset.nombre)">${__('admin_eliminar')}</button>` : ''}
        </div>
      </div>

      <!-- Form de edición inline -->
      <div class="admin-edit-form" id="edit-form-${u.id}" style="display:none;" onclick="event.stopPropagation()">
        <input type="text" id="edit-nombre-${u.id}" value="${escaparHtml(u.nombre)}" maxlength="30" class="admin-input" placeholder="${__('admin_nombre_placeholder')}"/>
        <input type="text" id="edit-clave-${u.id}" placeholder="${__('admin_clave_placeholder')}" maxlength="8" inputmode="numeric" class="admin-input"/>
        <div class="admin-form-btns" style="margin-top: 0.5rem;">
          <button class="btn-principal btn-sm" onclick="guardarEdicionUsuario(${u.id})">${__('admin_guardar')}</button>
          <button class="btn-secundario btn-sm" onclick="toggleEditarUsuario(${u.id})">${__('admin_cancelar')}</button>
        </div>
        <p class="admin-form-error" id="edit-error-${u.id}" style="display:none;"></p>
      </div>
    </div>
  `}).join('');
}

async function abrirDetallesUsuario(event, uid) {
  // Solo abrir si no se hizo clic en los botones de editar o form
  if (event.target.closest('.btn-editar') || event.target.closest('.btn-eliminar') || event.target.closest('.admin-edit-form')) {
    return;
  }
  
  const modal = document.getElementById('modal-usuario');
  const cuerpo = document.getElementById('modal-cuerpo');
  modal.style.display = 'flex';
  const skeletonHTML = `
    <div style="padding:1rem;">
      <div class="skeleton-text skeleton" style="width:60%; height:24px;"></div>
      <div class="skeleton-text skeleton tall" style="width:100%; height:80px;"></div>
      <div class="skeleton-text skeleton tall" style="width:100%; height:80px;"></div>
    </div>
  `;
  cuerpo.innerHTML = skeletonHTML;
  
  try {
    const res = await fetch(`/admin/usuarios/${uid}/historial`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    const u = data.perfil;
    const inicial = u.nombre.charAt(0).toUpperCase();
    
    const historialHtml = data.historial.length === 0 
      ? '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>' + __('admin_sin_analisis') + '</h3><p>' + __('admin_sin_analisis_desc') + '</p></div>'
      : '<div class="modal-historial-lista">' + data.historial.map(item => {
          const enf = item.enfermedades.length ? `⚠️ ${limpiarNombre(item.enfermedades[0].nombre)}` : __('hist_sano');
          const fecha = formatearFecha(item.fecha);
          const imgSrc = item.imagen_path ? `/static/${item.imagen_path}` : '';
          const imgHtml = imgSrc ? `<img src="${imgSrc}" alt="Cultivo">` : '<div style="width:80px;height:80px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;">📷</div>';
          return `
            <div class="modal-historial-item">
              ${imgHtml}
              <div class="modal-historial-item-info">
                <h4>${item.cultivo || __('analisis_cultivo_default')}</h4>
                <div style="font-size:0.8rem;color:var(--texto-suave);margin-bottom:0.2rem;">${fecha}</div>
                <div style="font-size:0.85rem;font-weight:600;color:var(--verde-medio);">${enf} (Confianza: ${item.confianza||0}%)</div>
              </div>
            </div>
          `;
        }).join('') + '</div>';
        
    cuerpo.innerHTML = `
      <div class="modal-header">
        <div class="modal-avatar">${inicial}</div>
        <div class="modal-header-info">
          <h3>${escaparHtml(u.nombre)}</h3>
          <p>${u.localidad ? u.localidad + ', ' : ''}${u.region || ''} — ${__('admin_rol')} ${u.rol}</p>
        </div>
      </div>
      <h4 style="margin-bottom:1rem;font-family:var(--font-sans);">${__('admin_historial')}</h4>
      ${historialHtml}
    `;
  } catch(e) {
    cuerpo.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('admin_error_usuario') + '</p></div>';
  }
}

function toggleEditarUsuario(uid) {
  const form = document.getElementById(`edit-form-${uid}`);
  const yaAbierto = form.style.display !== 'none';
  // Cierra cualquier otro formulario de edición abierto
  document.querySelectorAll('.admin-edit-form').forEach(f => f.style.display = 'none');
  form.style.display = yaAbierto ? 'none' : 'flex';
  if (!yaAbierto) document.getElementById(`edit-nombre-${uid}`)?.focus();
}

async function guardarEdicionUsuario(uid) {
  const nombre  = document.getElementById(`edit-nombre-${uid}`).value.trim();
  const clave   = document.getElementById(`edit-clave-${uid}`).value.trim();
  const errEl   = document.getElementById(`edit-error-${uid}`);
  errEl.style.display = 'none';

  if (!nombre) { errEl.textContent = __('admin_error_nombre_vacio'); errEl.style.display = 'block'; return; }
  if (nombre.length > 30) { errEl.textContent = __('admin_error_nombre_largo'); errEl.style.display = 'block'; return; }
  if (clave && clave.length !== 8) { errEl.textContent = __('admin_error_clave_digitos'); errEl.style.display = 'block'; return; }

  const payload = { nombre };
  if (clave) payload.clave = clave;

  try {
    const res  = await fetch(`/admin/usuarios/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    cargarAdminUsuarios();
    mostrarToast('success', __('admin_usuario_actualizado'), __('usuario_actualizado_msg', nombre));
  } catch { errEl.textContent = __('admin_error_conexion'); errEl.style.display = 'block'; }
}

async function guardarUsuario() {
  const nombre = document.getElementById('form-nombre').value.trim();
  const clave  = document.getElementById('form-clave').value.trim();
  const region = document.getElementById('form-region').value;
  const localidad = document.getElementById('form-localidad').value;
  const rol    = document.getElementById('form-rol').value;
  const errEl  = document.getElementById('admin-form-error');

  errEl.style.display = 'none';

  if (!nombre || !clave) { mostrarErrorAdmin(__('admin_completa_campos')); return; }
  if (nombre.length > 30) { mostrarErrorAdmin(__('admin_error_nombre_largo')); return; }
  if (clave.length !== 8) { mostrarErrorAdmin(__('admin_error_clave_digitos')); return; }

  try {
    const res  = await fetch('/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, clave, rol, region, localidad })
    });
    const data = await res.json();
    if (!res.ok) { mostrarErrorAdmin(data.error); return; }

    document.getElementById('admin-form').style.display = 'none';
    document.getElementById('btn-nuevo-usuario').style.display = 'block';
    limpiarFormAdmin();
    cargarAdminUsuarios();
    mostrarToast('success', __('admin_usuario_creado'), __('usuario_creado_msg', nombre));
  } catch { mostrarErrorAdmin(__('admin_error_conexion')); }
}

function eliminarUsuario(uid, nombre) {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');

  resetModalConfirmacion();
  texto.innerHTML = __('admin_confirmar_eliminar', nombre);
  modal.style.display = 'flex';

  btnCancelar.onclick = () => {
    modal.style.display = 'none';
  };

  btnConfirmar.onclick = async () => {
    modal.style.display = 'none';
    try {
      const res = await fetch(`/admin/usuarios/${uid}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        document.getElementById(`user-row-${uid}`)?.remove();
        // Remove from cache
        adminUsersCache = adminUsersCache.filter(u => u.id !== uid);
        cargarAdminStats();
        mostrarToast('success', __('admin_usuario_eliminado'), __('usuario_eliminado_msg', nombre));
      } else {
        mostrarToast('error', __('usuario_eliminar_error'), data.error);
      }
    } catch { mostrarToast('error', __('error_conexion'), __('usuario_eliminar_conexion')); }
  };
}

function mostrarErrorAdmin(msg) {
  const el = document.getElementById('admin-form-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function limpiarFormAdmin() {
  document.getElementById('form-nombre').value = '';
  document.getElementById('form-clave').value  = '';
  document.getElementById('form-region').value = '';
  const loc = document.getElementById('form-localidad');
  loc.innerHTML = '<option value="">' + __('admin_localidad_placeholder') + '</option>';
  loc.disabled = true;
  document.getElementById('form-rol').value    = 'agricultor';
  document.getElementById('admin-form-error').style.display = 'none';
}

// ── Estado del sistema (widget en la sección Analizar) ─────────────
async function cargarEstadoSistema() {
  const stStatus = document.getElementById('st-status');
  const stModelo = document.getElementById('st-modelo');
  const stTiempo = document.getElementById('st-tiempo');
  const stTotal  = document.getElementById('st-total');
  if (!stStatus) return; // el widget no está en esta vista

  try {
    const res  = await fetch('/estado');
    const data = await res.json();
    if (!res.ok) { stStatus.textContent = __('sistema_no_disponible'); return; }

    stStatus.textContent = data.online ? __('sistema_online') : __('sistema_sin_configurar');
    document.querySelector('#status-bar .status-dot')?.classList.toggle('online', data.online);

    stModelo.textContent = data.modelo || '—';
    stTiempo.textContent = data.ultimo_tiempo_s ? `${data.ultimo_tiempo_s}s` : __('sistema_sin_datos');
    stTotal.textContent  = data.total_analisis ?? 0;
  } catch {
    stStatus.textContent = __('sistema_sin_conexion');
  }
}

cargarEstadoSistema();

// ── Perfil ────────────────────────────────────────────────────────
const regionesDataPerfil = {
  "La Libertad": ["Paiján", "Trujillo", "Chepén", "Pacasmayo", "Ascope"],
  "Lima": ["Lima Central", "Cañete", "Huaral", "Barranca", "Huaura"],
  "Piura": ["Piura", "Sullana", "Paita", "Talara", "Sechura"],
  "Ica": ["Ica", "Chincha", "Pisco", "Nazca", "Palpa"],
  "Cusco": ["Cusco", "Urubamba", "Quillabamba", "Sicuani", "Calca"],
  "Arequipa": ["Arequipa", "Camaná", "Mollendo", "Chivay", "Caravelí"]
};

let perfilData = null;

async function cargarPerfil() {
  const cont = document.getElementById('perfil-contenido');
  cont.innerHTML = '<div class="cargando">' + __('perfil_cargando') + '</div>';
  try {
    const res = await fetch('/perfil');
    if (!res.ok) { cont.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('perfil_cargar_error') + '</p></div>'; return; }
    perfilData = await res.json();
    renderPerfil(perfilData);
  } catch { cont.innerHTML = '<div class="empty-state is-error"><div class="empty-state-icon" >⚠️</div><h3>' + __('toast_error') + '</h3><p>' + __('perfil_conexion_error') + '</p></div>'; }
}

function renderPerfil(p) {
  const inicial = (p.nombre || '?')[0].toUpperCase();
  const avatarHtml = p.avatar_path
    ? `<img src="/static/${p.avatar_path}?t=${Date.now()}" alt="Avatar">`
    : `<span>${inicial}</span>`;

  const fechaReg = p.fecha_registro
    ? formatearFecha(p.fecha_registro)
    : '—';

  const esAdmin = p.rol === 'admin';
  const rolLabel = esAdmin ? __('perfil_rol_admin') : __('perfil_rol_agricultor');

  document.getElementById('perfil-contenido').innerHTML = `
    <div class="perfil-card">
      <div class="perfil-banner"></div>
      <div class="perfil-header">
        <div class="perfil-avatar" id="perfil-avatar-click" title="Cambiar foto">
          ${avatarHtml}
          <div class="perfil-avatar-overlay">✎</div>
        </div>
        <div class="perfil-header-info">
          <div class="perfil-nombre" id="perfil-nombre-display">${escaparHtml(p.nombre)}</div>
          <span class="perfil-rol-badge ${esAdmin ? 'es-admin' : ''}">${rolLabel}</span>
        </div>
      </div>

      <div class="perfil-stats">
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${p.total_analisis || 0}</div>
          <div class="perfil-stat-label">${__('perfil_analisis_label')}</div>
        </div>
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${fechaReg}</div>
          <div class="perfil-stat-label">${__('perfil_miembro_desde')}</div>
        </div>
        <div class="perfil-stat">
          <div class="perfil-stat-valor">${p.localidad || p.region || __('analisis_maduracion_default')}</div>
          <div class="perfil-stat-label">${__('perfil_ubicacion')}</div>
        </div>
      </div>

      <div class="perfil-section-title">${__('perfil_idioma_titulo')}</div>
      <div class="perfil-lista">
        <div class="perfil-item">
          <span class="perfil-item-icono">🌐</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">${__('perfil_idioma_label')}</span>
            <div class="perfil-valor" id="perfil-campo-idioma">
              <span id="perfil-valor-idioma">${p.idioma === 'qu' ? __('perfil_quechua') : __('perfil_espanol')}</span>
              <button class="perfil-editar-btn" onclick="editarIdiomaPerfil()">${__('perfil_editar')}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="perfil-section-title">${__('perfil_info_personal')}</div>
      <div class="perfil-lista">
        <div class="perfil-item">
          <span class="perfil-item-icono">👤</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">${__('perfil_nombre')}</span>
            <div class="perfil-valor" id="perfil-campo-nombre">
              <span id="perfil-valor-nombre">${escaparHtml(p.nombre)}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('nombre')">${__('perfil_editar')}</button>
            </div>
          </div>
        </div>
        <div class="perfil-item">
          <span class="perfil-item-icono">📍</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">${__('perfil_region')}</span>
            <div class="perfil-valor" id="perfil-campo-region">
              <span id="perfil-valor-region">${p.region || __('analisis_maduracion_default')}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('region')">${__('perfil_editar')}</button>
            </div>
          </div>
        </div>
        <div class="perfil-item">
          <span class="perfil-item-icono">🏘️</span>
          <div class="perfil-item-body perfil-campo">
            <span class="perfil-label">${__('perfil_localidad')}</span>
            <div class="perfil-valor" id="perfil-campo-localidad">
              <span id="perfil-valor-localidad">${p.localidad || __('analisis_maduracion_default')}</span>
              <button class="perfil-editar-btn" onclick="editarCampoPerfil('localidad')">${__('perfil_editar')}</button>
            </div>
          </div>
        </div>
      </div>

      <p class="perfil-error" id="perfil-error"></p>

      <div class="perfil-zona-peligro">
        <div class="perfil-zona-peligro-label">${__('perfil_zona_peligro')}</div>
        <div class="perfil-acciones">
          <button class="btn-principal btn-sm" onclick="cerrarSesion()" style="flex:1;">${__('perfil_cerrar_sesion')}</button>
          <button class="perfil-btn-peligro" onclick="eliminarMiCuenta()" style="flex:1;">${__('perfil_eliminar_cuenta')}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('perfil-avatar-click').addEventListener('click', () => {
    document.getElementById('input-avatar').click();
  });
}

function editarCampoPerfil(campo) {
  const contEl = document.getElementById(`perfil-campo-${campo}`);
  const valorActual = perfilData[campo] || '';

  const acciones = () => `
    <div class="perfil-edit-acciones">
      <button type="button" class="perfil-btn-guardar" id="perfil-btn-guardar-${campo}" title="Guardar">✓</button>
      <button type="button" class="perfil-btn-cancelar" id="perfil-btn-cancelar-${campo}" title="Cancelar">✕</button>
    </div>`;

  if (campo === 'region') {
    const wrap = document.createElement('div');
    wrap.className = 'perfil-edit-row';
    wrap.innerHTML = `<select class="perfil-select" id="perfil-edit-${campo}"><option value="">${__('perfil_selecciona')}</option>${
      Object.keys(regionesDataPerfil).map(r => `<option value="${r}" ${r === valorActual ? 'selected' : ''}>${r}</option>`).join('')
    }</select>${acciones()}`;
    contEl.innerHTML = '';
    contEl.appendChild(wrap);
    const select = document.getElementById(`perfil-edit-${campo}`);
    select.focus();

    document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => {
      const val = select.value;
      if (val && val !== perfilData.region) {
        perfilData.localidad = '';
      }
      guardarCampoPerfil(campo, val);
    });
    document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);
    return;
  }

  if (campo === 'localidad') {
    const region = perfilData.region;
    if (!region || !regionesDataPerfil[region]) {
      mostrarToast('warning', __('perfil_selecciona_region'));
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'perfil-edit-row';
    wrap.innerHTML = `<select class="perfil-select" id="perfil-edit-${campo}"><option value="">${__('perfil_selecciona')}</option>${
      regionesDataPerfil[region].map(l => `<option value="${l}" ${l === valorActual ? 'selected' : ''}>${l}</option>`).join('')
    }</select>${acciones()}`;
    contEl.innerHTML = '';
    contEl.appendChild(wrap);
    const select = document.getElementById(`perfil-edit-${campo}`);
    select.focus();

    document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => guardarCampoPerfil(campo, select.value));
    document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'perfil-edit-row';
  wrap.innerHTML = `<input type="text" class="perfil-input" id="perfil-edit-${campo}" maxlength="30">${acciones()}`;
  contEl.innerHTML = '';
  contEl.appendChild(wrap);
  const input = document.getElementById(`perfil-edit-${campo}`);
  input.value = valorActual;
  input.focus();
  input.select();

  document.getElementById(`perfil-btn-guardar-${campo}`).addEventListener('click', () => guardarCampoPerfil(campo, input.value.trim()));
  document.getElementById(`perfil-btn-cancelar-${campo}`).addEventListener('click', cancelarEdicionPerfil);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') guardarCampoPerfil(campo, input.value.trim());
    if (e.key === 'Escape') cancelarEdicionPerfil();
  });
}

async function guardarCampoPerfil(campo, valor) {
  const payload = {};
  payload[campo] = valor;
  const errEl = document.getElementById('perfil-error');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.style.display = 'block';
      return;
    }
    perfilData[campo] = valor;
    renderPerfil(perfilData);
    if (campo === 'nombre') {
      document.querySelectorAll('.usuario-nombre').forEach(el => {
        el.childNodes[0].textContent = valor;
      });
    }
    const msgs = { nombre: __('perfil_nombre_guardado'), region: __('perfil_region_actualizada'), localidad: __('perfil_localidad_actualizada') };
    mostrarToast('success', msgs[campo] || __('perfil_guardado'));
  } catch {
    errEl.textContent = __('error_conexion');
    errEl.style.display = 'block';
  }
}

function cancelarEdicionPerfil() {
  if (perfilData) renderPerfil(perfilData);
}

function eliminarMiCuenta() {
  const modal = document.getElementById('modal-confirmacion');
  const texto = document.getElementById('modal-confirmacion-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-eliminar');
  const btnCancelar = document.getElementById('btn-cancelar-eliminar');
  const inputWrap = document.getElementById('modal-confirmacion-input-wrap');
  const input = document.getElementById('modal-confirmacion-input');

  texto.innerHTML = __('perfil_confirmar_eliminar');
  inputWrap.style.display = 'block';
  input.value = '';
  btnConfirmar.disabled = true;
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 50);

  input.oninput = () => {
    btnConfirmar.disabled = input.value.trim().toUpperCase() !== 'ELIMINAR';
  };

  btnCancelar.onclick = () => { modal.style.display = 'none'; resetModalConfirmacion(); };
  btnConfirmar.onclick = async () => {
    if (input.value.trim().toUpperCase() !== 'ELIMINAR') return;
    modal.style.display = 'none';
    resetModalConfirmacion();
    try {
      const res = await fetch('/perfil', { method: 'DELETE' });
      if (res.ok) {
        mostrarToast('success', __('perfil_cuenta_eliminada'), __('perfil_cuenta_eliminada_desc'));
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } else {
        const data = await res.json();
        mostrarToast('error', __('toast_error'), data.error);
      }
    } catch { mostrarToast('error', __('error_conexion')); }
  };
}

// ── Idioma (Quechua / Español) ─────────────────────────────────────
function editarIdiomaPerfil() {
  const contEl = document.getElementById('perfil-campo-idioma');
  const langActual = perfilData.idioma || 'es';

  const wrap = document.createElement('div');
  wrap.className = 'perfil-edit-row';
  wrap.style.gap = '0.5rem';
  wrap.innerHTML = `
    <button class="perfil-lang-opt ${langActual === 'es' ? 'active' : ''}" data-lang="es" onclick="this.parentElement.querySelectorAll('.perfil-lang-opt').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${__('perfil_espanol')}</button>
    <button class="perfil-lang-opt ${langActual === 'qu' ? 'active' : ''}" data-lang="qu" onclick="this.parentElement.querySelectorAll('.perfil-lang-opt').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${__('perfil_quechua')}</button>
    <div class="perfil-edit-acciones">
      <button type="button" class="perfil-btn-guardar" id="perfil-btn-guardar-idioma" title="Guardar">✓</button>
      <button type="button" class="perfil-btn-cancelar" onclick="cancelarEdicionPerfil()" title="Cancelar">✕</button>
    </div>`;
  contEl.innerHTML = '';
  contEl.appendChild(wrap);

  document.getElementById('perfil-btn-guardar-idioma').addEventListener('click', async () => {
    const selected = wrap.querySelector('.perfil-lang-opt.active');
    if (!selected) return;
    const lang = selected.dataset.lang;
    try {
      const res = await fetch('/perfil/idioma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idioma: lang })
      });
      const data = await res.json();
      if (res.ok) {
        perfilData.idioma = lang;
        window.idiomaGlobal = lang;
        document.cookie = `idioma=${lang};path=/;max-age=31536000;samesite=Lax`;
        renderPerfil(perfilData);
        traducirHTML();
        mostrarToast('success', __('perfil_idioma_cambiado', lang === 'qu' ? __('perfil_quechua') : __('perfil_espanol')));
      } else {
        mostrarToast('error', __('toast_error'), data.error);
      }
    } catch {
      mostrarToast('error', __('perfil_conexion_error'));
    }
  });
}
