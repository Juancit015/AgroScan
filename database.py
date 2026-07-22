"""
database.py — Capa de acceso a datos de FrutIA (SQLite)

Encapsula toda la interacción con frutia.db. Ninguna otra parte del
proyecto ejecuta SQL directamente: app.py solo llama a las funciones
públicas definidas aquí (buscar_usuario_por_dni, guardar_analisis,
obtener_historial, etc.).

Tablas:
  - usuarios  (id, nombre, dni, rol)        rol ∈ {"agricultor", "admin"}
  - analisis  (resultado de cada diagnóstico, FK a usuarios.id)

inicializar_db() crea las tablas si no existen, aplica migraciones simples
(ALTER TABLE ... ADD COLUMN envuelto en try/except) y siembra 3 usuarios de
ejemplo la primera vez que se ejecuta. Es seguro llamarla en cada arranque.

Última actualización: 2026-06-18 (ver CHANGELOG.md → [0.4.0])
"""

import sqlite3, json, re
from datetime import datetime, timedelta

DB_PATH = "frutia.db"


def top5_y_otros(filas, clave_nombre="cultivo", clave_cantidad="cantidad"):
    """
    Recibe una lista de dicts ordenada de mayor a menor por `clave_cantidad`.
    Devuelve como máximo 6 elementos: los 5 primeros más una entrada "Otros"
    que agrega el conteo de todos los restantes (solo si existen ≥ 6 tipos).

    Este patrón (Top N + Others) es el estándar de dashboards profesionales
    (Google Analytics, Mixpanel, Metabase): mantiene el gráfico legible a
    cualquier escala — con 10, 100 o 1.000 cultivares distintos el chart
    siempre muestra exactamente 6 barras/segmentos, sin cortar ni saturar.
    """
    if len(filas) <= 5:
        return filas
    top5  = filas[:5]
    resto = filas[5:]
    total_otros = sum(f[clave_cantidad] for f in resto)
    return top5 + [{clave_nombre: "Otros", clave_cantidad: total_otros,
                    "_n_otros": len(resto)}]  # _n_otros útil para tooltip/modal

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def inicializar_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT    NOT NULL,
            dni    TEXT    NOT NULL UNIQUE,
            rol    TEXT    DEFAULT 'agricultor'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS analisis (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id    INTEGER NOT NULL,
            cultivo       TEXT,
            maduracion    TEXT,
            confianza     INTEGER,
            enfermedades  TEXT,
            tratamiento   TEXT,
            explicacion   TEXT,
            zona_afectada TEXT,
            fuentes       TEXT,
            imagen_path   TEXT,
            fecha         DATETIME DEFAULT CURRENT_TIMESTAMP,
            recomendacion_consumo TEXT,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """)

    for col in [("explicacion", "TEXT"), ("zona_afectada", "TEXT"), ("recomendacion_consumo", "TEXT")]:
        try:
            cur.execute(f"ALTER TABLE analisis ADD COLUMN {col[0]} {col[1]}")
        except:
            pass

    try:
        cur.execute("ALTER TABLE usuarios ADD COLUMN avatar_path TEXT")
    except:
        pass

    try:
        cur.execute("ALTER TABLE usuarios ADD COLUMN region TEXT")
        cur.execute("ALTER TABLE usuarios ADD COLUMN localidad TEXT")
    except:
        pass

    try:
        cur.execute("ALTER TABLE usuarios ADD COLUMN idioma TEXT DEFAULT 'es'")
    except:
        pass

    try:
        cur.execute("ALTER TABLE usuarios ADD COLUMN fecha_registro TEXT")
    except:
        pass

    # Backfill: usuarios creados antes de existir la columna (p. ej. semilla)
    cur.execute("UPDATE usuarios SET fecha_registro = CURRENT_TIMESTAMP WHERE fecha_registro IS NULL")

    cur.execute("SELECT COUNT(*) FROM usuarios")
    if cur.fetchone()[0] == 0:
        cur.executemany("INSERT INTO usuarios (nombre, dni, rol) VALUES (?, ?, ?)", [
            ("Juan",  "71184654", "admin"),
            ("David", "45231789", "agricultor"),
            ("Maria", "62398541", "agricultor"),
        ])
        print("✅ Usuarios de ejemplo creados")

    conn.commit()
    conn.close()
    print("✅ Base de datos lista")


def buscar_usuario_por_dni(dni):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, dni, rol, avatar_path, localidad, region, idioma FROM usuarios WHERE dni = ?", (dni,))
    u = cur.fetchone()
    conn.close()
    return dict(u) if u else None


def _limpiar_asteriscos(val):
    if isinstance(val, str):
        return re.sub(r'\*+', '', val)
    return val

def guardar_analisis(usuario_id, resultado, imagen_path=None):
    conn = get_connection()
    cur = conn.cursor()
    enfermedades = resultado.get("enfermedades", [])
    for e in enfermedades:
        if "nombre" in e:
            e["nombre"] = _limpiar_asteriscos(e["nombre"])
    cur.execute("""
        INSERT INTO analisis
            (usuario_id, cultivo, maduracion, confianza, enfermedades,
             tratamiento, explicacion, zona_afectada, fuentes, imagen_path, recomendacion_consumo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        usuario_id,
        resultado.get("cultivo"),
        resultado.get("maduracion"),
        resultado.get("confianza"),
        json.dumps(enfermedades,  ensure_ascii=False),
        resultado.get("tratamiento"),
        json.dumps(resultado.get("explicacion", []),   ensure_ascii=False),
        json.dumps(resultado.get("zona_afectada", {}), ensure_ascii=False),
        json.dumps(resultado.get("fuentes", []),       ensure_ascii=False),
        imagen_path,
        resultado.get("recomendacion_consumo")
    ))
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return aid


def obtener_historial(usuario_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM analisis WHERE usuario_id = ? ORDER BY fecha DESC", (usuario_id,))
    rows = cur.fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        item["enfermedades"]  = json.loads(item.get("enfermedades")  or "[]")
        item["fuentes"]       = json.loads(item.get("fuentes")       or "[]")
        item["explicacion"]   = json.loads(item.get("explicacion")   or "[]")
        item["zona_afectada"] = json.loads(item.get("zona_afectada") or "{}")
        result.append(item)
    return result


def eliminar_analisis(analisis_id, usuario_id):
    """
    Elimina uno o varios análisis. analisis_id puede ser un int (uno solo)
    o una lista de ints (eliminación masiva). Se verifica que cada registro
    pertenezca al usuario_id antes de borrarlo.
    """
    conn = get_connection()
    cur = conn.cursor()
    if isinstance(analisis_id, (list, tuple)):
        placeholders = ",".join("?" * len(analisis_id))
        cur.execute(
            f"DELETE FROM analisis WHERE id IN ({placeholders}) AND usuario_id = ?",
            (*analisis_id, usuario_id)
        )
    else:
        cur.execute(
            "DELETE FROM analisis WHERE id = ? AND usuario_id = ?",
            (analisis_id, usuario_id)
        )
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted


def obtener_analisis_por_id(analisis_id, usuario_id):
    """
    Devuelve un único análisis, verificando que pertenezca a usuario_id
    (evita que un usuario pida por ID el reporte de otro). Usado por el
    endpoint /reporte-pdf. Devuelve None si no existe o no le pertenece.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM analisis WHERE id = ? AND usuario_id = ?", (analisis_id, usuario_id))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    item["enfermedades"]  = json.loads(item.get("enfermedades")  or "[]")
    item["fuentes"]       = json.loads(item.get("fuentes")       or "[]")
    item["explicacion"]   = json.loads(item.get("explicacion")   or "[]")
    item["zona_afectada"] = json.loads(item.get("zona_afectada") or "{}")
    return item


def verificar_brotes_regionales(enfermedades_detectadas, localidad, dias=7):
    """
    Busca análisis en la misma localidad durante los últimos `dias` que contengan
    las enfermedades recién detectadas. Si el total de ocurrencias > 1, lanza alerta.
    """
    if not enfermedades_detectadas or not localidad:
        return []
    
    fecha_limite = datetime.now() - timedelta(days=dias)
    conn = get_connection()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT a.enfermedades
        FROM analisis a
        JOIN usuarios u ON a.usuario_id = u.id
        WHERE u.localidad = ? AND a.fecha >= ?
    """, (localidad, fecha_limite.strftime("%Y-%m-%d %H:%M:%S")))
    
    filas = cur.fetchall()
    conn.close()
    
    conteo = {}
    for fila in filas:
        if not fila["enfermedades"]: continue
        try:
            enfs = json.loads(fila["enfermedades"])
            for e in enfs:
                nombre = _limpiar_asteriscos(e.get("nombre"))
                if nombre:
                    conteo[nombre] = conteo.get(nombre, 0) + 1
        except:
            pass
            
    alertas = []
    for e in enfermedades_detectadas:
        nombre = _limpiar_asteriscos(e.get("nombre"))
        casos = conteo.get(nombre, 0)
        if casos > 1:
            alertas.append({
                "enfermedad": nombre,
                "casos": casos,
                "localidad": localidad,
                "dias": dias
            })
            
    return alertas


def obtener_estadisticas(usuario_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM analisis WHERE usuario_id = ?", (usuario_id,))
    total = cur.fetchone()[0]

    cur.execute("""
        SELECT cultivo, COUNT(*) as cantidad FROM analisis
        WHERE usuario_id = ? AND cultivo IS NOT NULL
        GROUP BY cultivo ORDER BY cantidad DESC
    """, (usuario_id,))
    por_cultivo = top5_y_otros([dict(r) for r in cur.fetchall()])

    cur.execute("SELECT AVG(confianza) FROM analisis WHERE usuario_id = ? AND confianza IS NOT NULL", (usuario_id,))
    row = cur.fetchone()
    confianza_promedio = round(row[0] or 0)

    hoy = datetime.now().date()
    ultimos_7 = [(hoy - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    cur.execute("""
        SELECT date(fecha) as dia, COUNT(*) as cantidad FROM analisis
        WHERE usuario_id = ? AND date(fecha) >= ?
        GROUP BY date(fecha)
    """, (usuario_id, ultimos_7[0]))
    act_dict = {r["dia"]: r["cantidad"] for r in cur.fetchall()}
    actividad_semanal = [{"dia": d, "cantidad": act_dict.get(d, 0)} for d in ultimos_7]

    cur.execute("SELECT enfermedades FROM analisis WHERE usuario_id = ?", (usuario_id,))
    sanos = enfermos = 0
    enf_freq = {}
    for r in cur.fetchall():
        enfs = json.loads(r["enfermedades"] or "[]")
        if enfs:
            enfermos += 1
            for e in enfs:
                n = e.get("nombre", "Desconocida")
                enf_freq[n] = enf_freq.get(n, 0) + 1
        else:
            sanos += 1

    por_enfermedad = sorted(
        [{"nombre": k, "cantidad": v} for k, v in enf_freq.items()],
        key=lambda x: x["cantidad"], reverse=True
    )[:6]

    conn.close()
    return {
        "total_analisis":     total,
        "por_cultivo":        por_cultivo,
        "confianza_promedio": confianza_promedio,
        "actividad_semanal":  actividad_semanal,
        "por_estado":         {"sanos": sanos, "enfermos": enfermos, "total": total},
        "por_enfermedad":     por_enfermedad
    }


# ── Funciones admin ──────────────────────────────────────────────



def obtener_todos_usuarios():
    """Lista todos los usuarios con su cantidad de análisis y el más reciente."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.nombre, u.dni, u.rol, u.region, u.localidad,
               COUNT(a.id) as total_analisis,
               MAX(a.fecha) as ultimo_analisis
        FROM usuarios u
        LEFT JOIN analisis a ON a.usuario_id = u.id
        GROUP BY u.id ORDER BY u.nombre
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def nombre_en_uso(nombre, excluir_id=None):
    """
    True si ya existe un usuario con ese nombre (comparación insensible a
    mayúsculas/espacios extremos). Si excluir_id se indica, ese usuario no
    cuenta (para permitir guardar sin cambios al editar).
    """
    conn = get_connection()
    cur = conn.cursor()
    nombre_normalizado = nombre.strip().lower()
    if excluir_id:
        cur.execute(
            "SELECT 1 FROM usuarios WHERE LOWER(TRIM(nombre)) = ? AND id != ?",
            (nombre_normalizado, excluir_id)
        )
    else:
        cur.execute(
            "SELECT 1 FROM usuarios WHERE LOWER(TRIM(nombre)) = ?",
            (nombre_normalizado,)
        )
    existe = cur.fetchone() is not None
    conn.close()
    return existe


def agregar_usuario(nombre, dni, rol="agricultor", region=None, localidad=None):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO usuarios (nombre, dni, rol, region, localidad, idioma, fecha_registro) VALUES (?, ?, ?, ?, ?, ?, ?)", (nombre, dni, rol, region, localidad, 'es', datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        uid = cur.lastrowid
        conn.close()
        return {"ok": True, "id": uid}
    except sqlite3.IntegrityError:
        conn.close()
        return {"ok": False, "error": "La clave ya está registrada"}
    except Exception as e:
        conn.close()
        return {"ok": False, "error": str(e)}


def editar_usuario(usuario_id, nombre=None, dni=None, region=None, localidad=None):
    """
    Actualiza datos de un usuario existente. El llamador
    (app.py) es responsable de validar previamente que el nombre no esté
    duplicado (ver nombre_en_uso) y que la clave tenga el formato correcto;
    aquí solo se protege la unicidad de la clave a nivel de base de datos.
    """
    conn = get_connection()
    cur = conn.cursor()
    try:
        if nombre is not None:
            cur.execute("UPDATE usuarios SET nombre = ? WHERE id = ?", (nombre, usuario_id))
        if dni is not None:
            cur.execute("UPDATE usuarios SET dni = ? WHERE id = ?", (dni, usuario_id))
        if region is not None:
            cur.execute("UPDATE usuarios SET region = ? WHERE id = ?", (region, usuario_id))
        if localidad is not None:
            cur.execute("UPDATE usuarios SET localidad = ? WHERE id = ?", (localidad, usuario_id))
        conn.commit()
        conn.close()
        return {"ok": True}
    except sqlite3.IntegrityError:
        conn.close()
        return {"ok": False, "error": "La clave ya está registrada por otro usuario"}
    except Exception as e:
        conn.close()
        return {"ok": False, "error": str(e)}


def actualizar_avatar(usuario_id, avatar_path):
    """Guarda (o limpia, si avatar_path es None) la ruta del avatar de un usuario."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE usuarios SET avatar_path = ? WHERE id = ?", (avatar_path, usuario_id))
    conn.commit()
    conn.close()


def actualizar_idioma(usuario_id, idioma):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE usuarios SET idioma = ? WHERE id = ?", (idioma, usuario_id))
    conn.commit()
    conn.close()


def obtener_detalles_usuario_admin(usuario_id):
    """Devuelve el perfil e historial de análisis de un usuario para el admin."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, dni, rol, region, localidad, avatar_path FROM usuarios WHERE id = ?", (usuario_id,))
    u_row = cur.fetchone()
    if not u_row:
        conn.close()
        return None
    
    perfil = dict(u_row)
    
    cur.execute("SELECT * FROM analisis WHERE usuario_id = ? ORDER BY fecha DESC", (usuario_id,))
    rows = cur.fetchall()
    conn.close()
    
    historial = []
    for row in rows:
        item = dict(row)
        item["enfermedades"]  = json.loads(item.get("enfermedades")  or "[]")
        historial.append(item)
        
    return {"perfil": perfil, "historial": historial}


def obtener_perfil(usuario_id):
    """Devuelve datos del perfil del usuario autenticado."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nombre, dni, rol, region, localidad, avatar_path, idioma,
               (SELECT COUNT(*) FROM analisis WHERE usuario_id = usuarios.id) as total_analisis,
               fecha_registro
        FROM usuarios WHERE id = ?
    """, (usuario_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def eliminar_usuario(usuario_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM analisis WHERE usuario_id = ?", (usuario_id,))
    cur.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
    conn.commit()
    conn.close()


def obtener_estadisticas_globales():
    """Estadísticas agregadas de toda la plataforma, para el panel admin."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM analisis")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM usuarios")
    total_usuarios = cur.fetchone()[0]

    cur.execute("""
        SELECT u.nombre, COUNT(a.id) as cantidad
        FROM usuarios u LEFT JOIN analisis a ON a.usuario_id = u.id
        GROUP BY u.id ORDER BY cantidad DESC LIMIT 1
    """)
    r = cur.fetchone()
    usuario_mas_activo = dict(r) if r else {}

    cur.execute("SELECT AVG(confianza) FROM analisis WHERE confianza IS NOT NULL")
    r = cur.fetchone()
    confianza_promedio = round(r[0] or 0)

    cur.execute("""
        SELECT cultivo, COUNT(*) as cantidad FROM analisis
        WHERE cultivo IS NOT NULL
        GROUP BY cultivo ORDER BY cantidad DESC
    """)
    por_cultivo = top5_y_otros([dict(r) for r in cur.fetchall()])

    cur.execute("SELECT enfermedades FROM analisis")
    enf_freq = {}
    sanos = enfermos = 0
    for row in cur.fetchall():
        enfs = json.loads(row["enfermedades"] or "[]")
        if enfs:
            enfermos += 1
            for e in enfs:
                n = e.get("nombre", "Desconocida")
                enf_freq[n] = enf_freq.get(n, 0) + 1
        else:
            sanos += 1

    enfermedad_comun = max(enf_freq, key=enf_freq.get) if enf_freq else "—"
    por_enfermedad = sorted(
        [{"nombre": k, "cantidad": v} for k, v in enf_freq.items()],
        key=lambda x: x["cantidad"], reverse=True
    )[:6]

    hoy = datetime.now().date()
    ultimos_7 = [(hoy - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    cur.execute("""
        SELECT date(fecha) as dia, COUNT(*) as cantidad FROM analisis
        WHERE date(fecha) >= ? GROUP BY date(fecha)
    """, (ultimos_7[0],))
    act_dict = {r["dia"]: r["cantidad"] for r in cur.fetchall()}
    actividad_semanal = [{"dia": d, "cantidad": act_dict.get(d, 0)} for d in ultimos_7]

    cur.execute("""
        SELECT u.nombre, COUNT(a.id) as cantidad
        FROM usuarios u LEFT JOIN analisis a ON a.usuario_id = u.id
        GROUP BY u.id ORDER BY u.nombre
    """)
    actividad_usuarios = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "total_analisis":     total,
        "total_usuarios":     total_usuarios,
        "usuario_mas_activo": usuario_mas_activo,
        "confianza_promedio": confianza_promedio,
        "enfermedad_comun":   enfermedad_comun,
        "por_estado":         {"sanos": sanos, "enfermos": enfermos},
        "por_cultivo":        por_cultivo,
        "por_enfermedad":     por_enfermedad,
        "actividad_semanal":  actividad_semanal,
        "actividad_usuarios": actividad_usuarios
    }
