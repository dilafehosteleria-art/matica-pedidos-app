"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type PedidoItem = {
  nombre?: string;
  precio?: number;
};

type Pedido = {
  id: string;
  created_at: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  pedido: PedidoItem[] | null;
  total: number | null;
  estado: string | null;
};

const ESTADOS = [
  { key: "nuevo", label: "Nuevos", color: "#e8f5e9", border: "#43a047" },
  { key: "preparando", label: "Preparando", color: "#fff8e1", border: "#f9a825" },
  { key: "listo", label: "Listos", color: "#e3f2fd", border: "#1e88e5" },
  { key: "entregado", label: "Entregados", color: "#eeeeee", border: "#616161" },
];

export default function AdminPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarPedidos = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("Pedidos")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setPedidos(data as Pedido[]);
    }

    setCargando(false);
  };

  useEffect(() => {
    cargarPedidos();

    const intervalo = setInterval(() => {
      cargarPedidos();
    }, 5000);

    return () => clearInterval(intervalo);
  }, []);

  const cambiarEstado = async (id: string, estado: string) => {
    const { error } = await supabase
      .from("Pedidos")
      .update({ estado })
      .eq("id", id);

    if (!error) {
      cargarPedidos();
    }
  };

  const pedidosPorEstado = useMemo(() => {
    return ESTADOS.map((estado) => ({
      ...estado,
      pedidos: pedidos.filter((p) => (p.estado || "nuevo") === estado.key),
    }));
  }, [pedidos]);

  const formatearHora = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 36 }}>Panel de pedidos</h1>
          <div style={{ color: "#666", marginTop: 6 }}>
            Gestión interna · refresco automático cada 5 segundos
          </div>
        </div>

        <button
          onClick={cargarPedidos}
          style={{
            background: "#111827",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "12px 18px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </div>

      {cargando ? (
        <div style={{ fontSize: 18 }}>Cargando pedidos...</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {pedidosPorEstado.map((columna) => (
            <div
              key={columna.key}
              style={{
                background: "white",
                borderRadius: 16,
                padding: 14,
                boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                minHeight: 500,
              }}
            >
              <div
                style={{
                  background: columna.color,
                  border: `2px solid ${columna.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 14,
                  fontWeight: 700,
                  fontSize: 20,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{columna.label}</span>
                <span>{columna.pedidos.length}</span>
              </div>

              {columna.pedidos.length === 0 ? (
                <div style={{ color: "#777", padding: 10 }}>Sin pedidos</div>
              ) : (
                columna.pedidos.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      border: `2px solid ${columna.border}`,
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "start",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{p.nombre || "Sin nombre"}</div>
                        <div style={{ color: "#555", fontSize: 15 }}>{p.empresa || "-"}</div>
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 18,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatearHora(p.created_at)}
                      </div>
                    </div>

                    <div style={{ fontSize: 14, color: "#444", marginBottom: 4 }}>
                      📞 {p.telefono || "-"}
                    </div>
                    <div style={{ fontSize: 14, color: "#444", marginBottom: 10 }}>
                      ✉ {p.email || "-"}
                    </div>

                    <div
                      style={{
                        background: "#f8fafc",
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Pedido</div>

                      {Array.isArray(p.pedido) && p.pedido.length > 0 ? (
                        p.pedido.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "4px 0",
                              borderBottom:
                                i !== p.pedido!.length - 1 ? "1px solid #e5e7eb" : "none",
                            }}
                          >
                            <span>{item.nombre || "Producto"}</span>
                            <strong>{Number(item.precio || 0).toFixed(2)} €</strong>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#777" }}>Sin detalle</div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                        fontSize: 22,
                        fontWeight: 700,
                      }}
                    >
                      <span>Total</span>
                      <span>{Number(p.total || 0).toFixed(2)} €</span>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {columna.key !== "nuevo" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "nuevo")}
                          style={botonStyle("#43a047")}
                        >
                          Pasar a nuevo
                        </button>
                      )}

                      {columna.key !== "preparando" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "preparando")}
                          style={botonStyle("#f9a825")}
                        >
                          Pasar a preparando
                        </button>
                      )}

                      {columna.key !== "listo" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "listo")}
                          style={botonStyle("#1e88e5")}
                        >
                          Pasar a listo
                        </button>
                      )}

                      {columna.key !== "entregado" && (
                        <button
                          onClick={() => cambiarEstado(p.id, "entregado")}
                          style={botonStyle("#616161")}
                        >
                          Marcar entregado
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function botonStyle(color: string): React.CSSProperties {
  return {
    width: "100%",
    background: color,
    color: "white",
    border: "none",
    borderRadius: 10,
    padding: "12px 10px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  };
}
