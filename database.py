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

    # Migración: agrega columnas nuevas si no existen
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

    # Actividad últimos 7 días
    hoy = datetime.now().date()
    ultimos_7 = [(hoy - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    cur.execute("""
        SELECT date(fecha) as dia, COUNT(*) as cantidad FROM analisis
        WHERE usuario_id = ? AND date(fecha) >= ?
        GROUP BY date(fecha)
    """, (usuario_id, ultimos_7[0]))
    act_dict = {r["dia"]: r["cantidad"] for r in cur.fetchall()}
    actividad_semanal = [{"dia": d, "cantidad": act_dict.get(d, 0)} for d in ultimos_7]

    # Por estado y frecuencia de enfermedades
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
        "total_analisis":    total,
        "por_cultivo":       por_cultivo,
        "confianza_promedio": confianza_promedio,
        "actividad_semanal": actividad_semanal,
        "por_estado":        {"sanos": sanos, "enfermos": enfermos, "total": total},
        "por_enfermedad":    por_enfermedad
    }
