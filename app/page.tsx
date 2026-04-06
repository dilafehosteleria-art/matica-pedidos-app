"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const empresas = [
  "Bureau Veritas Iberia",
  "Bureau Veritas Inversiones",
  "Bureau Veritas Solutions",
  "Bureau Veritas Insp. y Test.",
  "Bureau Veritas Sus. Fuels"
];

const bebidasPostres = [
  "Agua",
  "Agua con gas",
  "Coca Cola",
  "Coca Cola Zero",
  "Fanta Naranja",
  "Lipton",
  "Plátano",
  "Manzana",
  "Natillas",
  "Flan",
  "Yogur de frutas",
  "Gelatina"
];

type CartItem = {
  nombre: string;
  tipo: string;
  total: number;
  lineas: string[];
};

type Pedido = {
  id: string;
  created_at: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  pedido: CartItem[];
  total: number;
  tipo: string;
  estado: string;
};

const estados = [
  { key: "nuevo", label: "Nuevo" },
  { key: "en_preparacion", label: "En preparación" },
  { key: "listo", label: "Listo" },
  { key: "entregado", label: "Entregado" },
  { key: "cancelado", label: "Cancelado" }
];

function eur(v: number) {
  return `${Number(v).toFixed(2).replace(".", ",")} €`;
}

export default function HomePage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState(empresas[0]);
  const [telefono, setTelefono] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Pedido[]>([]);

  const [menuChoice, setMenuChoice] = useState(bebidasPostres[0]);
  const [menuPrimero, setMenuPrimero] = useState("Primero 1");
  const [menuSegundo, setMenuSegundo] = useState("Segundo 1");
  const [medioChoice, setMedioChoice] = useState(bebidasPostres[0]);
  const [medioPrimero, setMedioPrimero] = useState("Primero 1");

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);

  const addMenu = () => {
    setCart((prev) => [
      ...prev,
      { nombre: "Menú del día", tipo: "menu", total: 9, lineas: [menuChoice, menuPrimero, menuSegundo] }
    ]);
  };

  const addMedio = () => {
    setCart((prev) => [
      ...prev,
      { nombre: "Medio menú", tipo: "medio_menu", total: 6.5, lineas: [medioChoice, medioPrimero] }
    ]);
  };

  const addSimple = (nombreProducto: string, precio: number, tipo = "otros") => {
    setCart((prev) => [...prev, { nombre: nombreProducto, tipo, total: precio, lineas: [] }]);
  };

  const loadPedidos = async () => {
    const { data } = await supabase.from("Pedidos").select("*").order("created_at", { ascending: false });
    setItems((data as Pedido[]) || []);
  };

  useEffect(() => {
    loadPedidos();
  }, []);

  const saveOrder = async () => {
    setMessage("");

    if (!nombre || !email || !empresa) {
      setMessage("Completa al menos nombre, email y empresa.");
      return;
    }

    if (cart.length === 0) {
      setMessage("Añade al menos un producto al carrito.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        nombre,
        email,
        empresa,
        telefono,
        pedido: cart,
        total,
        tipo: cart.length === 1 ? cart[0].tipo : "mixto",
        estado: "nuevo"
      };

      const { error } = await supabase.from("Pedidos").insert(payload);
      if (error) throw error;

      setCart([]);
      setMessage("Pedido guardado correctamente en Supabase.");
      await loadPedidos();
    } catch (err: any) {
      setMessage(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page">
      <div className="hero">
        <div className="badge">Pedidos abiertos · L-J · 09:30 a 12:30</div>
        <h1>Matica Fresh Food</h1>
        <p>Versión limpia para arrancar: formulario real + guardado en Supabase + vista básica de pedidos.</p>
      </div>

      <div className="grid">
        <div className="stack">
          <div className="card">
            <h2>Datos del cliente</h2>
            <div className="formGrid">
              <label className="field">
                <span>Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
              </label>
              <label className="field">
                <span>Correo corporativo</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.com" />
              </label>
              <label className="field">
                <span>Empresa</span>
                <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                  {empresas.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600000000" />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Menús</h2>
            <div className="productGrid">
              <div className="productCard">
                <h4>Menú del día</h4>
                <div className="price">{eur(9)}</div>
                <div className="stack">
                  <label className="field">
                    <span>Postre o bebida</span>
                    <select value={menuChoice} onChange={(e) => setMenuChoice(e.target.value)}>
                      {bebidasPostres.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Primer plato</span>
                    <select value={menuPrimero} onChange={(e) => setMenuPrimero(e.target.value)}>
                      {[1, 2, 3, 4].map((n) => <option key={n}>{`Primero ${n}`}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Segundo plato</span>
                    <select value={menuSegundo} onChange={(e) => setMenuSegundo(e.target.value)}>
                      {[1, 2, 3, 4].map((n) => <option key={n}>{`Segundo ${n}`}</option>)}
                    </select>
                  </label>
                  <button className="button" onClick={addMenu}>Añadir menú</button>
                </div>
              </div>

              <div className="productCard">
                <h4>Medio menú</h4>
                <div className="price">{eur(6.5)}</div>
                <div className="stack">
                  <label className="field">
                    <span>Postre o bebida</span>
                    <select value={medioChoice} onChange={(e) => setMedioChoice(e.target.value)}>
                      {bebidasPostres.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Primer plato</span>
                    <select value={medioPrimero} onChange={(e) => setMedioPrimero(e.target.value)}>
                      {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{`Primero ${n}`}</option>)}
                    </select>
                  </label>
                  <button className="button" onClick={addMedio}>Añadir medio menú</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Productos rápidos</h2>
            <div className="productGrid">
              <div className="productCard">
                <h4>Wrap a tu manera</h4>
                <div className="price">{eur(7)}</div>
                <button className="button" onClick={() => addSimple("Wrap a tu manera", 7, "wrap")}>Añadir</button>
              </div>
              <div className="productCard">
                <h4>Ensalada mediana</h4>
                <div className="price">{eur(7)}</div>
                <button className="button" onClick={() => addSimple("Ensalada mediana", 7, "ensalada")}>Añadir</button>
              </div>
              <div className="productCard">
                <h4>Bocadillo Serrano</h4>
                <div className="price">{eur(5.5)}</div>
                <button className="button" onClick={() => addSimple("Bocadillo Serrano", 5.5, "bocadillo")}>Añadir</button>
              </div>
              <div className="productCard">
                <h4>Coca Cola</h4>
                <div className="price">{eur(2)}</div>
                <button className="button" onClick={() => addSimple("Coca Cola", 2, "bebida")}>Añadir</button>
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Carrito</h2>
            <div className="stack">
              {cart.length === 0 && <div className="muted">Aún no has añadido productos.</div>}
              {cart.map((item, index) => (
                <div key={index} className="productCard">
                  <div className="row">
                    <strong>{item.nombre}</strong>
                    <strong>{eur(item.total)}</strong>
                  </div>
                  {item.lineas.length > 0 && (
                    <ul className="lineList small muted">
                      {item.lineas.map((linea, idx) => <li key={idx}>{linea}</li>)}
                    </ul>
                  )}
                </div>
              ))}
              <div className="hr" />
              <div className="row">
                <strong>Total</strong>
                <strong>{eur(total)}</strong>
              </div>
              <button className="button" onClick={saveOrder} disabled={saving}>
                {saving ? "Guardando..." : "Guardar pedido en Supabase"}
              </button>
              {message && <div className={message.startsWith("Pedido") ? "success" : "notice"}>{message}</div>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 24 }} />

      <div className="card">
        <div className="row">
          <div>
            <h2>Pedidos guardados</h2>
            <div className="small muted">Vista básica de dashboard conectada a Supabase</div>
          </div>
          <button className="button secondary" onClick={loadPedidos}>Recargar</button>
        </div>

        <div style={{ height: 18 }} />

        <div className="orderBoard">
          {estados.map((estado) => (
            <div key={estado.key} className="column">
              <div className="row" style={{ marginBottom: 10 }}>
                <strong>{estado.label}</strong>
                <span className="small muted">
                  {items.filter((item) => item.estado === estado.key).length}
                </span>
              </div>

              {items.filter((item) => item.estado === estado.key).map((item) => (
                <div key={item.id} className="orderItem">
                  <div className="row">
                    <strong>{item.nombre}</strong>
                    <strong>{eur(Number(item.total || 0))}</strong>
                  </div>
                  <div className="small muted">{item.empresa}</div>
                  <div className="small muted">{new Date(item.created_at).toLocaleString("es-ES")}</div>
                  <div className="hr" />
                  <div className="small">
                    {(item.pedido || []).map((p, idx) => (
                      <div key={idx}>• {p.nombre}</div>
                    ))}
                  </div>
                </div>
              ))}

              {items.filter((item) => item.estado === estado.key).length === 0 && (
                <div className="small muted">Sin pedidos</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}