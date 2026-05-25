"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { formatCurrency } from "@/lib/format";
import type { Category, Product, ProductDraft } from "@/lib/types";

export function AdminProductsClient() {
  return (
    <AdminGate title="Productos" subtitle="Activa, desactiva, marca agotados y ajusta precios.">
      {(pin, clearPin) => <ProductsEditor pin={pin} clearPin={clearPin} />}
    </AdminGate>
  );
}

function ProductsEditor({ pin, clearPin }: { pin: string; clearPin: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/products", {
      headers: { "x-admin-pin": pin }
    });
    const payload = await response.json();

    if (response.status === 401) {
      clearPin();
      return;
    }

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los productos.");
      setLoading(false);
      return;
    }

    const nextProducts = (payload.products ?? []) as Product[];
    setCategories((payload.categories ?? []) as Category[]);
    setProducts(nextProducts);
    setDrafts(
      Object.fromEntries(
        nextProducts.map((product) => [
          product.id,
          {
            id: product.id,
            active: product.active,
            sold_out: product.sold_out,
            base_price: Number(product.base_price),
            customer_price: Number(product.customer_price),
            description: product.description,
            image_url: product.image_url
          }
        ])
      )
    );
    setError("");
    setLoading(false);
  }, [clearPin, pin]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const productsByCategory = useMemo(() => {
    const grouped = new Map<string, Product[]>();

    for (const product of products) {
      const list = grouped.get(product.category_id) ?? [];
      grouped.set(product.category_id, [...list, product]);
    }

    return grouped;
  }, [products]);

  function updateDraft(productId: string, field: keyof ProductDraft, value: string | number | boolean | null) {
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        [field]: value
      }
    }));
  }

  async function saveProduct(productId: string) {
    const draft = drafts[productId];
    setSavingId(productId);
    setError("");

    const response = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": pin
      },
      body: JSON.stringify(draft)
    });
    const payload = await response.json();
    setSavingId("");

    if (!response.ok) {
      setError(payload.error ?? "No se pudo guardar el producto.");
      return;
    }

    setProducts((current) => current.map((product) => (product.id === productId ? payload.product : product)));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-72 place-items-center rounded-lg border border-matica-line bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-matica-green" />
        </div>
      ) : (
        <div className="space-y-5">
          {categories.map((category) => {
            const list = productsByCategory.get(category.id) ?? [];

            return (
              <section key={category.id} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">{category.name}</h2>
                  <span className="rounded-lg bg-matica-mint px-3 py-1 text-sm font-black text-matica-green">
                    {list.length}
                  </span>
                </div>
                <div className="grid gap-3">
                  {list.map((product) => (
                    <ProductEditorCard
                      key={product.id}
                      product={product}
                      draft={drafts[product.id]}
                      saving={savingId === product.id}
                      onChange={(field, value) => updateDraft(product.id, field, value)}
                      onSave={() => saveProduct(product.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductEditorCard({
  product,
  draft,
  saving,
  onChange,
  onSave
}: {
  product: Product;
  draft: ProductDraft | undefined;
  saving: boolean;
  onChange: (field: keyof ProductDraft, value: string | number | boolean | null) => void;
  onSave: () => void;
}) {
  if (!draft) {
    return null;
  }

  return (
    <article className="rounded-lg border border-matica-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black">{product.name}</h3>
          <p className="mt-1 text-sm font-semibold text-matica-ink/55">
            Base {formatCurrency(Number(product.base_price))} · Cliente {formatCurrency(Number(product.customer_price))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => onChange("active", event.target.checked)}
            />
            Activo
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-matica-line px-3 font-bold">
            <input
              type="checkbox"
              checked={draft.sold_out}
              onChange={(event) => onChange("sold_out", event.target.checked)}
            />
            Agotado
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto] md:items-end">
        <label className="space-y-1">
          <span className="text-sm font-bold text-matica-ink/70">Precio base</span>
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            type="number"
            min="0"
            step="0.01"
            value={draft.base_price}
            onChange={(event) => onChange("base_price", Number(event.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-bold text-matica-ink/70">Precio cliente</span>
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            type="number"
            min="0"
            step="0.01"
            value={draft.customer_price}
            onChange={(event) => onChange("customer_price", Number(event.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-bold text-matica-ink/70">Descripción</span>
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            value={draft.description ?? ""}
            onChange={(event) => onChange("description", event.target.value)}
          />
        </label>
        <button
          className="matica-focus flex min-h-12 items-center justify-center gap-2 rounded-lg bg-matica-green px-4 font-black text-white disabled:cursor-wait disabled:bg-matica-ink/30"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Guardar
        </button>
      </div>
      <label className="mt-3 block space-y-1">
        <span className="text-sm font-bold text-matica-ink/70">URL imagen</span>
        <input
          className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
          value={draft.image_url ?? ""}
          onChange={(event) => onChange("image_url", event.target.value || null)}
          placeholder="https://..."
        />
      </label>
    </article>
  );
}
