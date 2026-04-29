// ════════════════════════════════════════════════════════════
// MERCADITO — app.js 
// ════════════════════════════════════════════════════════════

const API = "";
let products = [];
let ventas   = [];
let currentUser = null;
let deleteProdId = null;
let chartBar = null, chartPie = null, chartGanancia = null, chartIngresoPie = null, chartHora = null, chartDiaSem = null;

// ────────── HTTP HELPER ─────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error del servidor");
  return data;
}

// ────────── AUTENTICACIÓN ───────────────────────────────────
async function doLogin() {
  const usuario = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  try {
    const data = await api("POST", "/api/login", { usuario, password });
    currentUser = data;
    mostrarApp(data);
    await renderAll();
  } catch (e) {
    document.getElementById("login-err").classList.remove("hidden");
  }
}

async function doRegister() {
  const nombre = document.getElementById("reg-nombre").value.trim();
  const usuario = document.getElementById("reg-user").value.trim();
  const password = document.getElementById("reg-pass").value;
  const errDiv = document.getElementById("register-err");
  if (!usuario || !password) {
    errDiv.textContent = "Usuario y contraseña requeridos";
    errDiv.classList.remove("hidden");
    return;
  }
  try {
    await api("POST", "/api/register", { usuario, password, nombre });
    alert("Registro exitoso. Ahora inicia sesión.");
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
    document.getElementById("login-user").value = usuario;
    document.getElementById("login-pass").value = "";
    errDiv.classList.add("hidden");
  } catch (e) {
    errDiv.textContent = e.message;
    errDiv.classList.remove("hidden");
  }
}

function mostrarApp(user) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  let inicial = (user.nombre || user.usuario || "U")[0].toUpperCase();
  document.getElementById("sb-avatar").textContent = inicial;
  document.getElementById("sb-name").textContent = user.nombre || user.usuario;
  document.getElementById("topbar-date").textContent =
    new Date().toLocaleDateString("es-MX", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  showPage("dashboard");
}

async function doLogout() {
  await api("POST", "/api/logout");
  location.reload();
}

async function checkSession() {
  try {
    const data = await api("GET", "/api/session");
    if (data.autenticado) {
      currentUser = { id: data.user_id, nombre: data.nombre, usuario: data.usuario };
      mostrarApp(currentUser);
      await renderAll();
    }
  } catch (_) {}
}

// ────────── NAVEGACIÓN ──────────────────────────────────────
const pages = ["dashboard","inventario","ventas","analisis","historial"];
function showPage(name, navEl) {
  pages.forEach(p => document.getElementById("page-"+p).classList.add("hidden"));
  document.getElementById("page-"+name).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  if (navEl) navEl.classList.add("active");
  else document.querySelectorAll(".nav-item").forEach(n => {
    if (n.getAttribute("onclick")?.includes("'"+name+"'")) n.classList.add("active");
  });
  const titles = { dashboard:"Dashboard", inventario:"Inventario", ventas:"Registro de Ventas", analisis:"Análisis y Ganancias", historial:"Historial de Ventas" };
  document.getElementById("page-title").textContent = titles[name];
  if (name === "dashboard")  renderDashboard();
  if (name === "inventario") renderInventario();
  if (name === "ventas")     renderVentas();
  if (name === "analisis")   renderAnalisis();
  if (name === "historial")  renderHistorial();
}

function switchTab(name, el) {
  document.getElementById("tab-por-producto").classList.add("hidden");
  document.getElementById("tab-tendencias").classList.add("hidden");
  document.getElementById("tab-"+name).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  if (name === "tendencias") renderTendencias();
}

// ────────── RENDER ALL ──────────────────────────────────────
async function renderAll() {
  await loadProducts();
  await loadVentas();
}

async function loadProducts() {
  products = await api("GET", "/api/productos");
}
async function loadVentas() {
  ventas = await api("GET", "/api/ventas");
}

// ────────── DASHBOARD ───────────────────────────────────────
async function renderDashboard() {
  const d = await api("GET", "/api/dashboard");
  document.getElementById("kpi-ingresos").textContent = fmt(d.ingresos);
  document.getElementById("kpi-ganancia").textContent = fmt(d.ganancia);
  document.getElementById("kpi-productos").textContent = d.productos_count;
  document.getElementById("kpi-hoy").textContent = d.ventas_hoy;
  const alertDiv = document.getElementById("stock-alerts");
  alertDiv.innerHTML = d.stock_bajo.length
    ? `<div class="alert-bar">⚠️ <strong>${d.stock_bajo.length} producto(s)</strong> con stock bajo: ${d.stock_bajo.map(p=>`<em>${p.nombre}</em> (${p.stock} uds.)`).join(", ")}</div>`
    : "";
  // Gráfica barras
  const diasMap = {};
  d.dias_7.forEach(r => diasMap[r.dia] = r.total);
  const labels = [], datos = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0,10);
    labels.push(dt.toLocaleDateString("es-MX", { weekday:"short", day:"numeric" }));
    datos.push(diasMap[key] || 0);
  }
  if (chartBar) chartBar.destroy();
  chartBar = new Chart(document.getElementById("chart-bar"), {
    type: "bar",
    data: { labels, datasets: [{ label:"Ingresos", data:datos, backgroundColor:"rgba(245,200,0,.7)", borderRadius:6 }] },
    options: { plugins:{legend:{display:false}}, scales:{ x:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888"}}, y:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888",callback:v=>"$"+v}} }, responsive:true }
  });
  if (chartPie) chartPie.destroy();
  chartPie = new Chart(document.getElementById("chart-pie"), {
    type: "doughnut",
    data: { labels: d.top_productos.map(x=>x.nombre), datasets: [{ data: d.top_productos.map(x=>x.unidades), backgroundColor:["#f5c800","#3b82f6","#22c55e","#e84040","#a855f7"], borderWidth:0 }] },
    options: { plugins:{legend:{position:"bottom",labels:{color:"#aaa",boxWidth:12}}}, responsive:true, cutout:"60%" }
  });
  document.getElementById("dash-ventas-body").innerHTML = d.ultimas_ventas.map(v =>
    `<tr><td>${v.producto_nombre}</td><td>${v.cantidad}</td><td>${fmt(v.total)}</td><td><span class="${v.ganancia>=0?"badge badge-green":"badge badge-red"}">${fmt(v.ganancia)}</span></td><td>${new Date(v.fecha).toLocaleDateString("es-MX")}</td></tr>`
  ).join("");
}

// ────────── INVENTARIO ──────────────────────────────────────
async function renderInventario() {
  await loadProducts();
  document.getElementById("inv-body").innerHTML = products.map(p => {
    const margen = p.precio > 0 ? ((p.precio - p.costo) / p.precio * 100).toFixed(0) : 0;
    const cls = p.stock <= p.stock_min ? "badge-red" : p.stock <= p.stock_min*2 ? "badge-yellow" : "badge-green";
    return `<tr>
      <td><strong>${p.nombre}</strong><br><span style="font-size:11px">${p.categoria}</span></td>
      <td>${fmt(p.costo)}</td><td>${fmt(p.precio)}</td>
      <td><span class="badge ${cls}">${p.stock} uds.</span></td>
      <td>${margen}%</td>
      <td style="display:flex;gap:6px;"><button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">Editar</button><button class="btn btn-danger btn-sm" onclick="openDeleteProduct(${p.id})">Eliminar</button></td>
     </tr>`;
  }).join("");
}

// ────────── VENTAS ──────────────────────────────────────────
async function renderVentas() {
  await loadVentas();
  document.getElementById("ventas-body").innerHTML = ventas.map((v,i) =>
    `<tr><td style="color:var(--muted)">#${ventas.length-i}</td><td>${v.producto_nombre}</td><td>${v.cantidad}</td><td>${fmt(v.precio_unit)}</td><td>${fmt(v.total)}</td><td><span class="${v.ganancia>=0?"badge badge-green":"badge badge-red"}">${fmt(v.ganancia)}</span></td><td>${new Date(v.fecha).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</td></tr>`
  ).join("");
}

// ────────── ANÁLISIS ────────────────────────────────────────
async function renderAnalisis() {
  await loadProducts(); await loadVentas();
  const stats = {};
  products.forEach(p => { stats[p.id] = { nombre:p.nombre, cant:0, ingresos:0, costos:0, ganancia:0 }; });
  ventas.forEach(v => {
    if (!stats[v.producto_id]) return;
    stats[v.producto_id].cant += v.cantidad;
    stats[v.producto_id].ingresos += v.total;
    stats[v.producto_id].costos += (v.total - v.ganancia);
    stats[v.producto_id].ganancia += v.ganancia;
  });
  const arr = Object.values(stats).filter(s=>s.cant>0).sort((a,b)=>b.ganancia-a.ganancia);
  if (chartGanancia) chartGanancia.destroy();
  chartGanancia = new Chart(document.getElementById("chart-ganancia"), {
    type:"bar",
    data:{ labels:arr.map(x=>x.nombre), datasets:[
      { label:"Ingresos", data:arr.map(x=>x.ingresos), backgroundColor:"rgba(59,130,246,.7)", borderRadius:4 },
      { label:"Ganancia", data:arr.map(x=>x.ganancia), backgroundColor:"rgba(34,197,94,.7)", borderRadius:4 }
    ]},
    options:{ plugins:{legend:{labels:{color:"#aaa"}}}, scales:{x:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888"}},y:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888",callback:v=>"$"+v}}}, responsive:true }
  });
  if (chartIngresoPie) chartIngresoPie.destroy();
  chartIngresoPie = new Chart(document.getElementById("chart-ingreso-pie"), {
    type:"pie",
    data:{ labels:arr.map(x=>x.nombre), datasets:[{ data:arr.map(x=>x.ingresos), backgroundColor:["#f5c800","#3b82f6","#22c55e","#e84040","#a855f7"], borderWidth:0 }] },
    options:{ plugins:{legend:{position:"bottom",labels:{color:"#aaa",boxWidth:12}}}, responsive:true }
  });
  document.getElementById("analisis-body").innerHTML = arr.map(s => {
    const margen = s.ingresos>0 ? (s.ganancia/s.ingresos*100).toFixed(1) : "0.0";
    const cls = parseFloat(margen)>=30?"badge-green":parseFloat(margen)>=10?"badge-yellow":"badge-red";
    return `<tr><td>${s.nombre}</td><td>${s.cant}</td><td>${fmt(s.ingresos)}</td><td>${fmt(s.costos)}</td><td>${fmt(s.ganancia)}</td><td><span class="badge ${cls}">${margen}%</span></td></tr>`;
  }).join("");
}

function renderTendencias() {
  const horas = Array(24).fill(0);
  ventas.forEach(v => horas[new Date(v.fecha).getHours()] += v.cantidad);
  if (chartHora) chartHora.destroy();
  chartHora = new Chart(document.getElementById("chart-hora"), {
    type:"line",
    data:{ labels:Array.from({length:24},(_,i)=>i+":00"), datasets:[{ label:"Unidades", data:horas, borderColor:"#f5c800", backgroundColor:"rgba(245,200,0,.1)", tension:.4, fill:true, pointRadius:3 }] },
    options:{ plugins:{legend:{display:false}}, scales:{x:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888"}},y:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888"}}}, responsive:true }
  });
  const diasData = Array(7).fill(0);
  ventas.forEach(v => diasData[new Date(v.fecha).getDay()] += v.total);
  if (chartDiaSem) chartDiaSem.destroy();
  chartDiaSem = new Chart(document.getElementById("chart-diasem"), {
    type:"bar",
    data:{ labels:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"], datasets:[{ label:"Ingresos", data:diasData, backgroundColor:"rgba(168,85,247,.7)", borderRadius:6, borderSkipped:false }] },
    options:{ plugins:{legend:{display:false}}, scales:{x:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888"}},y:{grid:{color:"rgba(255,255,255,.05)"},ticks:{color:"#888",callback:v=>"$"+v}}}, responsive:true }
  });
}

// ────────── HISTORIAL ───────────────────────────────────────
async function renderHistorial() {
  const desde  = document.getElementById("hist-from").value;
  const hasta  = document.getElementById("hist-to").value;
  const q      = document.getElementById("hist-search").value;
  let url = "/api/ventas?";
  if (desde) url += `desde=${desde}&`;
  if (hasta) url += `hasta=${hasta}&`;
  if (q)     url += `q=${encodeURIComponent(q)}&`;
  const data = await api("GET", url);
  const total = data.reduce((s,v)=>s+v.total,0);
  const gan   = data.reduce((s,v)=>s+v.ganancia,0);
  document.getElementById("historial-body").innerHTML = data.map((v,i) =>
    `<tr><td style="color:var(--muted)">#${data.length-i}</td><td>${v.producto_nombre}</td><td>${v.cantidad}</td><td>${fmt(v.total)}</td><td><span class="badge badge-green">${fmt(v.ganancia)}</span></td><td>${new Date(v.fecha).toLocaleString("es-MX")}</td></tr>`
  ).join("");
  document.getElementById("hist-total").textContent = `${data.length} registros · Total: ${fmt(total)} · Ganancia: ${fmt(gan)}`;
}

// ────────── CRUD PRODUCTOS ──────────────────────────────────
function openModal(name) {
  if (name === "add-product" && !document.getElementById("prod-edit-id").value) {
    ["prod-nombre","prod-costo","prod-precio","prod-stock","prod-min"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("prod-modal-title").textContent = "Nuevo Producto";
  }
  document.getElementById("modal-"+name).classList.remove("hidden");
  if (name === "add-venta") {
    const sel = document.getElementById("venta-producto");
    sel.innerHTML = products.map(p=>`<option value="${p.id}">${p.nombre} (Stock: ${p.stock})</option>`).join("");
    updateVentaCalc();
  }
}
function closeModal(name) {
  document.getElementById("modal-"+name).classList.add("hidden");
  if (name === "add-product") document.getElementById("prod-edit-id").value = "";
}
async function saveProduct() {
  const id = document.getElementById("prod-edit-id").value;
  const nombre = document.getElementById("prod-nombre").value.trim();
  const costo = parseFloat(document.getElementById("prod-costo").value);
  const precio = parseFloat(document.getElementById("prod-precio").value);
  const stock = parseInt(document.getElementById("prod-stock").value);
  const stock_min = parseInt(document.getElementById("prod-min").value) || 0;
  const categoria = document.getElementById("prod-cat").value;
  if (!nombre || isNaN(costo) || isNaN(precio) || isNaN(stock)) {
    toast("Completa todos los campos requeridos.", "error"); return;
  }
  if (costo < 0 || precio < 0) { toast("Costo y precio no pueden ser negativos.", "error"); return; }
  if (precio < costo) { toast("⚠️ Precio de venta menor al costo.", "error"); return; }
  try {
    if (id) {
      await api("PUT", `/api/productos/${id}`, { nombre, costo, precio, stock, stock_min, categoria });
      toast("Producto actualizado.", "success");
    } else {
      await api("POST", "/api/productos", { nombre, costo, precio, stock, stock_min, categoria });
      toast("Producto agregado.", "success");
    }
    closeModal("add-product");
    await renderInventario();
    renderDashboard();
  } catch (e) { toast(e.message, "error"); }
}
function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById("prod-modal-title").textContent = "Editar Producto";
  document.getElementById("prod-edit-id").value = p.id;
  document.getElementById("prod-nombre").value = p.nombre;
  document.getElementById("prod-costo").value = p.costo;
  document.getElementById("prod-precio").value = p.precio;
  document.getElementById("prod-stock").value = p.stock;
  document.getElementById("prod-min").value = p.stock_min;
  document.getElementById("prod-cat").value = p.categoria;
  openModal("add-product");
}
function openDeleteProduct(id) {
  deleteProdId = id;
  openModal("del-product");
}
async function confirmDeleteProduct() {
  try {
    await api("DELETE", `/api/productos/${deleteProdId}`);
    toast("Producto eliminado.", "info");
    closeModal("del-product");
    await renderInventario();
    renderDashboard();
  } catch (e) { toast(e.message, "error"); }
}

// ────────── CRUD VENTAS ─────────────────────────────────────
function updateVentaCalc() {
  const pid = parseInt(document.getElementById("venta-producto").value);
  const cant = parseInt(document.getElementById("venta-cant").value) || 0;
  const p = products.find(x => x.id === pid);
  if (!p) return;
  let precio = parseFloat(document.getElementById("venta-precio").value);
  if (isNaN(precio) || precio === 0) {
    document.getElementById("venta-precio").value = p.precio;
    precio = p.precio;
  }
  document.getElementById("venta-total-display").textContent = fmt(precio * cant);
  document.getElementById("venta-ganancia-display").textContent = fmt((precio - p.costo) * cant);
}
async function saveVenta() {
  const pid = parseInt(document.getElementById("venta-producto").value);
  const cantidad = parseInt(document.getElementById("venta-cant").value);
  const precio_unit = parseFloat(document.getElementById("venta-precio").value);
  if (cantidad <= 0 || isNaN(cantidad)) { toast("Cantidad inválida.", "error"); return; }
  const prod = products.find(x => x.id === pid);
  if (prod && cantidad > prod.stock) { toast(`Stock insuficiente. Disponible: ${prod.stock} uds.`, "error"); return; }
  try {
    const v = await api("POST", "/api/ventas", { producto_id: pid, cantidad, precio_unit });
    toast(`Venta registrada: ${cantidad} x ${v.producto_nombre}`, "success");
    closeModal("add-venta");
    await renderVentas();
    await renderInventario();
    renderDashboard();
  } catch (e) { toast(e.message, "error"); }
}

// ────────── UTILS ───────────────────────────────────────────
function fmt(n) { return "$"+Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,","); }
function toast(msg, type="info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type==="success"?"✓":type==="error"?"✕":"ℹ"}</span> ${msg}`;
  document.getElementById("toast-area").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
["add-product","add-venta"].forEach(name => {
  const modal = document.getElementById("modal-"+name);
  if(modal) modal.addEventListener("click", e => { if (e.target === modal) closeModal(name); });
});
document.getElementById("login-pass")?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
document.getElementById("login-user")?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

// ────────── INICIO ──────────────────────────────────────────
checkSession();
