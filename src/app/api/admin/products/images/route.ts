import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "product-images";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

type UploadedImage = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function storageSetupMessage(message?: string) {
  return [
    message,
    "Configura SUPABASE_SERVICE_ROLE_KEY en el backend y crea el bucket publico product-images si Supabase no permite crearlo automaticamente."
  ]
    .filter(Boolean)
    .join(" ");
}

async function ensureProductImagesBucket(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  if (!supabase) {
    return "Cliente Supabase no disponible.";
  }

  const { error: getError } = await supabase.storage.getBucket(BUCKET_NAME);

  if (!getError) {
    return null;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: Array.from(ALLOWED_TYPES.keys())
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    return storageSetupMessage(createError.message);
  }

  return null;
}

function getUploadedImage(value: FormDataEntryValue | null): UploadedImage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as unknown as Record<string, unknown>;

  if (typeof candidate.arrayBuffer !== "function") {
    return null;
  }

  return {
    name: typeof candidate.name === "string" ? candidate.name.trim() : "",
    type: typeof candidate.type === "string" ? candidate.type.trim() : "",
    size: typeof candidate.size === "number" ? candidate.size : 0,
    arrayBuffer: candidate.arrayBuffer.bind(value) as () => Promise<ArrayBuffer>
  };
}

function safePathSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function POST(request: NextRequest) {
  const adminError = assertAdmin(request);

  if (adminError) {
    return adminError;
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: storageSetupMessage("No hay credenciales de escritura para Supabase Storage.") },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const productId = String(formData.get("product_id") ?? "").trim();
  const uploadedImage = getUploadedImage(formData.get("file"));

  if (!productId) {
    return NextResponse.json({ error: "Producto requerido." }, { status: 400 });
  }

  if (!uploadedImage) {
    return NextResponse.json({ error: "Archivo de imagen requerido." }, { status: 400 });
  }

  if (!uploadedImage.name) {
    return NextResponse.json({ error: "El archivo de imagen debe tener nombre." }, { status: 400 });
  }

  if (!Number.isFinite(uploadedImage.size) || uploadedImage.size <= 0) {
    return NextResponse.json({ error: "El archivo de imagen esta vacio." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES.get(uploadedImage.type);

  if (!extension) {
    return NextResponse.json({ error: "Formato no valido. Sube una imagen JPG, PNG o WebP." }, { status: 400 });
  }

  if (uploadedImage.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "La imagen no puede superar 2 MB." }, { status: 400 });
  }

  const bucketError = await ensureProductImagesBucket(supabase);

  if (bucketError) {
    return NextResponse.json({ error: bucketError }, { status: 503 });
  }

  const { data: existingProduct, error: productError } = await supabase
    .from("products")
    .select("id,name")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !existingProduct) {
    return NextResponse.json({ error: productError?.message ?? "Producto no encontrado." }, { status: 404 });
  }

  const safeProductName = safePathSegment(String(existingProduct.name ?? "producto")) || "producto";
  const path = `products/${productId}/${Date.now()}-${safeProductName}-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await uploadedImage.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(path, bytes, {
    cacheControl: "31536000",
    contentType: uploadedImage.type,
    upsert: false
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  const imageUrl = publicUrlData.publicUrl;

  const { data: product, error: updateError } = await supabase
    .from("products")
    .update({ image_url: imageUrl })
    .eq("id", productId)
    .select("*")
    .single();

  if (updateError) {
    await supabase.storage.from(BUCKET_NAME).remove([path]);

    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ image_url: imageUrl, product });
}
