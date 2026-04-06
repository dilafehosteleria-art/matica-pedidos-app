create extension if not exists pgcrypto;

create table if not exists public."Pedidos" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  nombre text,
  email text,
  empresa text,
  telefono text,
  pedido jsonb,
  total numeric,
  tipo text,
  estado text
);
