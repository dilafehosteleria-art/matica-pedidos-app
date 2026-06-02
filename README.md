# Matica B2B Orders

App de pedidos B2B para Matica Fresh Food. La V1 esta enfocada en Bureau Veritas, pero el modelo de datos ya separa empresas, sociedades, productos, reglas de subvencion y pedidos para poder ampliar a nuevos clientes.

## Stack

- Next.js + TypeScript
- Tailwind CSS
- Supabase
- Preparada para Railway

## Rutas

- `/bureau-veritas`: carta publica y confirmacion de pedidos.
- `/admin`: tablero interno de cocina por estados.
- `/admin/menu`: edicion del menu del dia.
- `/admin/products`: activacion, agotados, precios y descripcion.

## Variables de entorno

Copia `.env.example` a `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
ADMIN_PIN=un-pin-interno
```

No uses la service role key en el frontend. Esta clave solo se usa en rutas API del backend para operaciones de administracion como la subida de imagenes.

## Supabase

1. Crea un proyecto en Supabase.
2. Ve a `SQL Editor`.
3. Ejecuta el contenido de `supabase/migrations/001_initial_schema.sql`.
4. Copia `Project URL`, `anon public key` y `service_role key` desde `Project Settings > API`.
5. Configura esas claves en `.env.local` y en Railway.

La migracion crea:

- Tablas `companies`, `company_branches`, `customers`, `categories`, `products`, `daily_menus`, `orders`, `order_items`, `subsidy_rules`.
- Datos iniciales de Bureau Veritas, sociedades, categorias, productos de prueba y reglas de subvencion.
- Funcion `submit_b2b_order(jsonb)` para confirmar pedidos y calcular precios/subvencion desde base de datos.
- RLS basico para esta V1. El admin se protege en las rutas API de Next mediante `ADMIN_PIN`.

### Storage de imagenes

El admin de productos sube imagenes a Supabase Storage en el bucket `product-images`.

- La ruta backend intenta crear el bucket automaticamente con lectura publica, limite de 2 MB y formatos `jpg`, `png` y `webp`.
- Si Supabase no permite crearlo automaticamente, crealo manualmente en `Storage > New bucket` con nombre `product-images` y opcion `Public bucket` activada.
- Las subidas se hacen desde `/api/admin/products/images`, protegidas por `ADMIN_PIN` y usando `SUPABASE_SERVICE_ROLE_KEY` solo en servidor.
- El panel guarda la URL publica resultante en `products.image_url`, que es la imagen usada por la carta publica.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre:

- `http://localhost:3000/bureau-veritas`
- `http://localhost:3000/admin`

Build de produccion:

```bash
npm run build
npm run start
```

## Horario y subvencion

- La carta se puede ver siempre.
- Solo se puede confirmar pedido de lunes a jueves de 09:30 a 12:30, hora de Madrid.
- Entrega informativa: 13:00 a 13:30.
- Bureau Veritas subvenciona 4 EUR en `Menu del dia` y 3,50 EUR en `Medio menu`.
- La funcion de Supabase aplica solo una subvencion por email y dia. Si el email ya tiene una subvencion hoy, los siguientes menus se cobran a precio completo.

## Railway

1. Sube el repositorio a GitHub.
2. Crea un nuevo proyecto en Railway desde ese repositorio.
3. Configura las variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PIN`
   - `CRON_SECRET`
4. Railway usara Nixpacks. El `startCommand` esta en `railway.json`.
5. Despliega y abre `/bureau-veritas`.

### Cierre automatico diario

Para cerrar la operativa diaria sin tocar pedidos nuevos ni cancelados, configura un scheduler/cron en Railway a las 23:59 hora de Madrid contra:

```bash
curl -X POST https://TU_DOMINIO/api/cron/close-daily-orders \
  -H "Authorization: Bearer $CRON_SECRET"
```

El endpoint marca como `entregado` los pedidos del dia en `pendiente_pago`, `preparando` o `listo`. No modifica pedidos en `nuevo` ni `cancelado`. Para pruebas controladas se puede anadir `?date=YYYY-MM-DD`.

## GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial Matica B2B orders app"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/matica-b2b-orders.git
git push -u origin main
```

## Nota de seguridad

Esta V1 usa `ADMIN_PIN` como proteccion simple en las rutas API internas. Para una version multiempresa en produccion conviene sustituirlo por autenticacion real, endurecer las politicas RLS de administracion y separar permisos por rol/empresa.
