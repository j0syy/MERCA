from flask import Flask, jsonify, request, session, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")
# ----- NUEVAS CONFIGURACIONES PARA HTTPS -----
app.config.update(
    SESSION_COOKIE_SECURE=True,        # Requiere HTTPS (necesario en Render)
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax'
)

app.secret_key = os.environ.get('211213', os.urandom(24))
DATABASE = 'mercadito.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        # Tabla usuarios (con password hasheada)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nombre TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Productos ahora con user_id
        conn.execute('''
            CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                nombre TEXT NOT NULL,
                categoria TEXT,
                costo REAL NOT NULL,
                precio REAL NOT NULL,
                stock INTEGER NOT NULL,
                stock_min INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        ''')
        # Ventas con user_id (redundante pero facilita consultas)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ventas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                producto_id INTEGER NOT NULL,
                cantidad INTEGER NOT NULL,
                precio_unit REAL NOT NULL,
                total REAL NOT NULL,
                ganancia REAL NOT NULL,
                fecha TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE CASCADE
            )
        ''')
        # Crear usuario demo (opcional)
        cursor = conn.execute("SELECT id FROM users WHERE usuario = 'demo'")
        if not cursor.fetchone():
            hashed = generate_password_hash("demo123")
            conn.execute("INSERT INTO users (usuario, password, nombre) VALUES (?, ?, ?)",
                         ('demo', hashed, 'Emprendedor Demo'))
if os.path.exists(DATABASE):
    os.remove(DATABASE)
init_db()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "No autorizado"}), 401
        return f(*args, **kwargs)
    return decorated

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

# ---------- Registro ----------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    usuario = data.get("usuario")
    password = data.get("password")
    nombre = data.get("nombre", usuario)
    if not usuario or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400
    with get_db() as conn:
        existe = conn.execute("SELECT id FROM users WHERE usuario = ?", (usuario,)).fetchone()
        if existe:
            return jsonify({"error": "El usuario ya existe"}), 400
        hashed = generate_password_hash(password)
        conn.execute("INSERT INTO users (usuario, password, nombre) VALUES (?, ?, ?)",
                     (usuario, hashed, nombre))
        conn.commit()
    return jsonify({"ok": True, "mensaje": "Usuario registrado. Ahora inicia sesión."})

# ---------- Login ----------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    usuario = data.get("usuario")
    password = data.get("password")
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE usuario = ?", (usuario,)).fetchone()
        if user and check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            session["usuario"] = user["usuario"]
            return jsonify({
                "id": user["id"],
                "nombre": user["nombre"],
                "usuario": user["usuario"]
            })
    return jsonify({"error": "Credenciales inválidas"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/session", methods=["GET"])
def check_session():
    if 'user_id' in session:
        return jsonify({
            "autenticado": True,
            "user_id": session["user_id"],
            "nombre": session.get("usuario", "Usuario")
        })
    return jsonify({"autenticado": False}), 401

# ---------- Productos (solo del usuario logueado) ----------
@app.route("/api/productos", methods=["GET"])
@login_required
def get_productos():
    user_id = session['user_id']
    with get_db() as conn:
        productos = conn.execute("SELECT * FROM productos WHERE user_id = ? ORDER BY nombre", (user_id,)).fetchall()
        return jsonify([dict(p) for p in productos])

@app.route("/api/productos", methods=["POST"])
@login_required
def add_producto():
    try:
        data = request.json
        required = ['nombre', 'costo', 'precio', 'stock']
        
        # Validar que existan todos los campos
        if not all(k in data for k in required):
            return jsonify({"error": "Faltan datos requeridos"}), 400
        
        # Validar y convertir datos
        nombre = str(data['nombre']).strip()
        if not nombre:
            return jsonify({"error": "El nombre no puede estar vacío"}), 400
        
        try:
            costo = float(data['costo'])
            precio = float(data['precio'])
            stock = int(data['stock'])
            stock_min = int(data.get('stock_min', 0))
        except (ValueError, TypeError):
            return jsonify({"error": "Costo y precio deben ser números, stock debe ser entero"}), 400
        
        # Validaciones lógicas
        if costo < 0 or precio < 0:
            return jsonify({"error": "Costo y precio no pueden ser negativos"}), 400
        if stock < 0:
            return jsonify({"error": "El stock no puede ser negativo"}), 400
        
        user_id = session['user_id']
        categoria = str(data.get('categoria', 'Otro')).strip()
        
        with get_db() as conn:
            conn.execute('''
                INSERT INTO productos (user_id, nombre, categoria, costo, precio, stock, stock_min)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, nombre, categoria, costo, precio, stock, stock_min))
            conn.commit()
        
        return jsonify({"ok": True, "mensaje": "Producto guardado exitosamente"})
    
    except Exception as e:
        print(f"Error en add_producto: {str(e)}")
        return jsonify({"error": f"Error del servidor: {str(e)}"}), 500

@app.route("/api/productos/<int:id>", methods=["PUT"])
@login_required
def update_producto(id):
    data = request.json
    user_id = session['user_id']
    with get_db() as conn:
        # Verificar que el producto pertenezca al usuario
        prod = conn.execute("SELECT id FROM productos WHERE id = ? AND user_id = ?", (id, user_id)).fetchone()
        if not prod:
            return jsonify({"error": "Producto no encontrado"}), 404
        conn.execute('''
            UPDATE productos
            SET nombre=?, categoria=?, costo=?, precio=?, stock=?, stock_min=?
            WHERE id=?
        ''', (data['nombre'], data.get('categoria', 'Otro'), data['costo'],
              data['precio'], data['stock'], data.get('stock_min', 0), id))
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/productos/<int:id>", methods=["DELETE"])
@login_required
def delete_producto(id):
    user_id = session['user_id']
    with get_db() as conn:
        conn.execute("DELETE FROM productos WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
    return jsonify({"ok": True})

# ---------- Ventas (solo del usuario logueado) ----------
@app.route("/api/ventas", methods=["GET"])
@login_required
def get_ventas():
    user_id = session['user_id']
    desde = request.args.get('desde')
    hasta = request.args.get('hasta')
    q = request.args.get('q')
    query = '''
        SELECT v.*, p.nombre as producto_nombre
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.user_id = ?
    '''
    params = [user_id]
    if desde:
        query += " AND date(v.fecha) >= date(?)"
        params.append(desde)
    if hasta:
        query += " AND date(v.fecha) <= date(?)"
        params.append(hasta)
    if q:
        query += " AND p.nombre LIKE ?"
        params.append(f'%{q}%')
    query += " ORDER BY v.fecha DESC"
    with get_db() as conn:
        ventas = conn.execute(query, params).fetchall()
        return jsonify([dict(v) for v in ventas])

@app.route("/api/ventas", methods=["POST"])
@login_required
def add_venta():
    data = request.json
    producto_id = data.get('producto_id')
    cantidad = data.get('cantidad')
    precio_unit = data.get('precio_unit')
    if not all([producto_id, cantidad, precio_unit]):
        return jsonify({"error": "Datos incompletos"}), 400
    user_id = session['user_id']
    with get_db() as conn:
        prod = conn.execute("SELECT * FROM productos WHERE id = ? AND user_id = ?", (producto_id, user_id)).fetchone()
        if not prod:
            return jsonify({"error": "Producto no existe"}), 404
        if prod['stock'] < cantidad:
            return jsonify({"error": f"Stock insuficiente (disponible: {prod['stock']})"}), 400
        total = precio_unit * cantidad
        ganancia = (precio_unit - prod['costo']) * cantidad
        fecha = datetime.now().isoformat()
        conn.execute('''
            INSERT INTO ventas (user_id, producto_id, cantidad, precio_unit, total, ganancia, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, producto_id, cantidad, precio_unit, total, ganancia, fecha))
        conn.execute("UPDATE productos SET stock = stock - ? WHERE id = ?", (cantidad, producto_id))
        conn.commit()
        return jsonify({
            "ok": True,
            "producto_nombre": prod['nombre'],
            "total": total,
            "ganancia": ganancia
        })

# ---------- Dashboard (datos del usuario) ----------
@app.route("/api/dashboard", methods=["GET"])
@login_required
def dashboard():
    user_id = session['user_id']
    with get_db() as conn:
        ingresos = conn.execute("SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE user_id = ?", (user_id,)).fetchone()['total']
        ganancia = conn.execute("SELECT COALESCE(SUM(ganancia),0) as total FROM ventas WHERE user_id = ?", (user_id,)).fetchone()['total']
        productos_count = conn.execute("SELECT COUNT(*) as cnt FROM productos WHERE user_id = ?", (user_id,)).fetchone()['cnt']
        hoy = datetime.now().strftime("%Y-%m-%d")
        ventas_hoy = conn.execute("SELECT COALESCE(SUM(cantidad),0) as cnt FROM ventas WHERE user_id = ? AND date(fecha) = ?", (user_id, hoy)).fetchone()['cnt']
        # stock bajo
        stock_bajo = conn.execute("SELECT nombre, stock FROM productos WHERE user_id = ? AND stock <= stock_min", (user_id,)).fetchall()
        # últimas 5 ventas
        ultimas_ventas = conn.execute('''
            SELECT v.*, p.nombre as producto_nombre
            FROM ventas v JOIN productos p ON v.producto_id = p.id
            WHERE v.user_id = ?
            ORDER BY v.fecha DESC LIMIT 5
        ''', (user_id,)).fetchall()
        # top productos
        top_productos = conn.execute('''
            SELECT p.nombre, SUM(v.cantidad) as unidades
            FROM ventas v JOIN productos p ON v.producto_id = p.id
            WHERE v.user_id = ?
            GROUP BY v.producto_id
            ORDER BY unidades DESC LIMIT 5
        ''', (user_id,)).fetchall()
        # últimos 7 días
        hoy_date = datetime.now().date()
        dias_7 = []
        for i in range(6, -1, -1):
            dia = hoy_date - timedelta(days=i)
            dia_str = dia.isoformat()
            total_dia = conn.execute('''
                SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE user_id = ? AND date(fecha) = ?
            ''', (user_id, dia_str)).fetchone()['total']
            dias_7.append({"dia": dia_str, "total": total_dia})
        return jsonify({
            "ingresos": ingresos,
            "ganancia": ganancia,
            "productos_count": productos_count,
            "ventas_hoy": ventas_hoy,
            "stock_bajo": [{"nombre": sb["nombre"], "stock": sb["stock"]} for sb in stock_bajo],
            "ultimas_ventas": [dict(v) for v in ultimas_ventas],
            "top_productos": [{"nombre": tp["nombre"], "unidades": tp["unidades"]} for tp in top_productos],
            "dias_7": dias_7
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
