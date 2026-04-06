"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);

  const cargarPedidos = async () => {
    const { data } = await supabase
      .from("Pedidos")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setPedidos(data);
  };

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cambiarEstado = async (id: string, estado: string) => {
    await supabase
      .from("Pedidos")
      .update({ estado })
      .eq("id", id);

    cargarPedidos();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Panel de pedidos</h1>

      {pedidos.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid #ccc",
            marginBottom: 10,
            padding: 10,
          }}
        >
          <div><strong>{p.nombre}</strong> ({p.empresa})</div>
          <div>Total: {p.total} €</div>
          <div>Estado: {p.estado}</div>

          <button onClick={() => cambiarEstado(p.id, "preparando")}>
            Preparando
          </button>

          <button onClick={() => cambiarEstado(p.id, "listo")}>
            Listo
          </button>

          <button onClick={() => cambiarEstado(p.id, "entregado")}>
            Entregado
          </button>
        </div>
      ))}
    </div>
  );
}
