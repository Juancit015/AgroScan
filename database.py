"""
database.py — Capa de acceso a datos de AgroScan (SQLite)

Encapsula toda la interacción con agroscan.db. Ninguna otra parte del
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

import sqlite3, json
from datetime import datetime, timedelta

DB_PATH = "agroscan.db"

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
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    """)

    for col in [("explicacion", "TEXT"), ("zona_afectada", "TEXT")]:
        try:
            cur.execute(f"ALTER TABLE analisis ADD COLUMN {col[0]} {col[1]}")
        except:
            pass

    try:
        cur.execute("ALTER TABLE usuarios ADD COLUMN avatar_path TEXT")
    except:
        pass

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
    cur.execute("SELECT * FROM usuarios WHERE dni = ?", (dni,))
    u = cur.fetchone()
    conn.close()
    return dict(u) if u else None


def guardar_analisis(usuario_id, resultado, imagen_path=None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO analisis
            (usuario_id, cultivo, maduracion, confianza, enfermedades,
             tratamiento, explicacion, zona_afectada, fuentes, imagen_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        usuario_id,
        resultado.get("cultivo"),
        resultado.get("maduracion"),
        resultado.get("confianza"),
        json.dumps(resultado.get("enfermedades", []),  ensure_ascii=False),
        resultado.get("tratamiento"),
        json.dumps(resultado.get("explicacion", []),   ensure_ascii=False),
        json.dumps(resultado.get("zona_afectada", {}), ensure_ascii=False),
        json.dumps(resultado.get("fuentes", []),       ensure_ascii=False),
        imagen_path
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


def obtener_estadisticas(usuario_id):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM analisis WHERE usuario_id = ?", (usuario_id,))
    total = cur.fetchone()[0]

    cur.execute("""
        SELECT cultivo, COUNT(*) as cantidad FROM analisis
        WHERE usuario_id = ? AND cultivo IS NOT NULL
        GROUP BY cultivo ORDER BY cantidad DESC LIMIT 6
    """, (usuario_id,))
    por_cultivo = [dict(r) for r in cur.fetchall()]

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
        SELECT u.id, u.nombre, u.dni, u.rol,
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


def agregar_usuario(nombre, dni, rol="agricultor"):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO usuarios (nombre, dni, rol) VALUES (?, ?, ?)", (nombre, dni, rol))
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


def editar_usuario(usuario_id, nombre=None, dni=None):
    """
    Actualiza nombre y/o clave de un usuario existente. El llamador
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
        GROUP BY cultivo ORDER BY cantidad DESC LIMIT 6
    """)
    por_cultivo = [dict(r) for r in cur.fetchall()]

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
