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
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.nombre, u.dni, u.rol,
               COUNT(a.id) as total_analisis
        FROM usuarios u
        LEFT JOIN analisis a ON a.usuario_id = u.id
        GROUP BY u.id
        ORDER BY u.rol DESC, u.nombre
    """)
    usuarios = [dict(r) for r in cur.fetchall()]
    conn.close()
    return usuarios


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


def eliminar_usuario(usuario_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM analisis WHERE usuario_id = ?", (usuario_id,))
    cur.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
    conn.commit()
    conn.close()


def obtener_estadisticas_globales():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM analisis")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM usuarios")
    total_usuarios = cur.fetchone()[0]

    cur.execute("SELECT AVG(confianza) FROM analisis WHERE confianza IS NOT NULL")
    row = cur.fetchone()
    confianza_promedio = round(row[0] or 0)

    cur.execute("""
        SELECT u.nombre, COUNT(a.id) as total
        FROM usuarios u
        LEFT JOIN analisis a ON a.usuario_id = u.id
        GROUP BY u.id ORDER BY total DESC
    """)
    por_usuario = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT cultivo, COUNT(*) as cantidad FROM analisis
        WHERE cultivo IS NOT NULL
        GROUP BY cultivo ORDER BY cantidad DESC LIMIT 6
    """)
    por_cultivo = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT enfermedades FROM analisis")
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

    hoy = datetime.now().date()
    ultimos_7 = [(hoy - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    cur.execute("""
        SELECT date(fecha) as dia, COUNT(*) as cantidad FROM analisis
        WHERE date(fecha) >= ? GROUP BY date(fecha)
    """, (ultimos_7[0],))
    act_dict = {r["dia"]: r["cantidad"] for r in cur.fetchall()}
    actividad_semanal = [{"dia": d, "cantidad": act_dict.get(d, 0)} for d in ultimos_7]

    conn.close()
    return {
        "total_analisis":     total,
        "total_usuarios":     total_usuarios,
        "confianza_promedio": confianza_promedio,
        "por_usuario":        por_usuario,
        "por_cultivo":        por_cultivo,
        "por_estado":         {"sanos": sanos, "enfermos": enfermos},
        "por_enfermedad":     sorted([{"nombre": k, "cantidad": v} for k, v in enf_freq.items()], key=lambda x: x["cantidad"], reverse=True)[:6],
        "actividad_semanal":  actividad_semanal
    }


# ── Funciones de admin ────────────────────────────────────────────

def obtener_todos_usuarios():
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


def agregar_usuario(nombre, dni, rol="agricultor"):
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO usuarios (nombre, dni, rol) VALUES (?, ?, ?)", (nombre, dni, rol))
        conn.commit()
        uid = cur.lastrowid
        conn.close()
        return {"ok": True, "id": uid}
    except Exception as e:
        conn.close()
        return {"ok": False, "error": str(e)}


def eliminar_usuario(usuario_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM analisis WHERE usuario_id = ?", (usuario_id,))
    cur.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
    conn.commit()
    conn.close()


def obtener_estadisticas_globales():
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
        "actividad_usuarios": actividad_usuarios
    }
