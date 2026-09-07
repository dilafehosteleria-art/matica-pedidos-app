"use client";

import { AlertCircle, ImageIcon, Loader2, Save, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGate } from "./AdminGate";
import { employeeProductPrice, type PriceSubsidyRule } from "@/lib/product-prices";
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
  const [subsidyRules, setSubsidyRules] = useState<PriceSubsidyRule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [uploadingId, setUploadingId] = useState("");
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
    setSubsidyRules(payload.subsidyRules ?? []);
    setDrafts(
      Object.fromEntries(
        nextProducts.map((product) => [
          product.id,
          {
            id: product.id,
            active: product.active,
            sold_out: product.sold_out,
            base_price: Number(product.base_price),
            customer_price: employeeProductPrice(Number(product.base_price), product.product_type, payload.subsidyRules ?? []),
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
        [field]: value,
        ...(field === "base_price" ? {
          customer_price: employeeProductPrice(Number(value), products.find((product) => product.id === productId)?.product_type ?? "standard", subsidyRules)
        } : {})
      }
    }));
  }

  function mergeSavedProduct(productId: string, savedProduct: Product) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
              ...product,
              active: savedProduct.active,
              sold_out: savedProduct.sold_out,
              base_price: Number(savedProduct.base_price),
              customer_price: Number(savedProduct.customer_price),
              description: savedProduct.description,
              image_url: savedProduct.image_url
            }
          : product
      )
    );
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        active: savedProduct.active,
        sold_out: savedProduct.sold_out,
        base_price: Number(savedProduct.base_price),
        customer_price: Number(savedProduct.customer_price),
        description: savedProduct.description,
        image_url: savedProduct.image_url
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

    mergeSavedProduct(productId, payload.product as Product);
  }

  async function uploadProductImage(productId: string, file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Formato no valido. Sube una imagen JPG, PNG o WebP.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen no puede superar 2 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("product_id", productId);
    formData.append("file", file);
    setUploadingId(productId);
    setError("");

    const response = await fetch("/api/admin/products/images", {
      method: "POST",
      headers: { "x-admin-pin": pin },
      body: formData
    });
    const payload = await response.json();
    setUploadingId("");

    if (!response.ok) {
      setError(payload.error ?? "No se pudo subir la imagen.");
      return;
    }

    mergeSavedProduct(productId, payload.product as Product);
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
                      uploading={uploadingId === product.id}
                      onChange={(field, value) => updateDraft(product.id, field, value)}
                      onSave={() => saveProduct(product.id)}
                      onUpload={(file) => uploadProductImage(product.id, file)}
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
  uploading,
  onChange,
  onSave,
  onUpload
}: {
  product: Product;
  draft: ProductDraft | undefined;
  saving: boolean;
  uploading: boolean;
  onChange: (field: keyof ProductDraft, value: string | number | boolean | null) => void;
  onSave: () => void;
  onUpload: (file: File) => void;
}) {
  if (!draft) {
    return null;
  }

  const previewUrl = draft.image_url?.trim() ?? "";

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
          <span className="text-sm font-bold text-matica-ink/70">Precio del producto</span>
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            type="number"
            min="0.01"
            step="0.01"
            value={draft.base_price}
            onChange={(event) => onChange("base_price", Number(event.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-bold text-matica-ink/70">Precio cliente calculado</span>
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            type="number"
            min="0.01"
            step="0.01"
            value={draft.customer_price}
            readOnly
            aria-label="Precio cliente calculado con la subvención de Bureau Veritas"
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
      <p className="mt-2 text-xs text-matica-ink/65">El precio cliente se calcula automáticamente descontando la subvención de Bureau Veritas cuando corresponde.</p>
      <div className="mt-3">
        <span className="text-sm font-bold text-matica-ink/70">Imagen</span>
      </div>
      <div className="mt-2 grid gap-3 lg:grid-cols-[180px_1fr] lg:items-start">
        <div className="aspect-[16/10] overflow-hidden rounded-lg border border-matica-line bg-matica-soft">
          {previewUrl ? (
            <img className="block h-full w-full object-cover object-center" src={previewUrl} alt={product.name} />
          ) : (
            <div className="grid h-full place-items-center text-matica-green">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-white/80 shadow-sm">
                <ImageIcon className="h-5 w-5" />
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <input
            className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
            aria-label="URL imagen"
            value={draft.image_url ?? ""}
            onChange={(event) => onChange("image_url", event.target.value || null)}
            placeholder="https://..."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="matica-focus flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-matica-line bg-white px-4 text-sm font-black text-matica-green">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Subiendo..." : "Subir imagen"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";

                  if (file) {
                    onUpload(file);
                  }
                }}
              />
            </label>
            <p className="text-xs font-semibold leading-5 text-matica-ink/50">
              JPG, PNG o WebP. Max. 2 MB. Mejor cuadrada o 4:3.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
