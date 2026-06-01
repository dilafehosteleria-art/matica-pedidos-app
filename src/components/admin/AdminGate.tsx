"use client";

import { Lock, LogOut } from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";

const ADMIN_PIN_KEY = "matica:admin:pin";

export function AdminGate({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: (pin: string, clearPin: () => void) => ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState("");
  const [draftPin, setDraftPin] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_PIN_KEY) ?? "";
    setPin(stored);
    setDraftPin(stored);
    setReady(true);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(ADMIN_PIN_KEY, draftPin);
    setPin(draftPin);
  }

  function clearPin() {
    window.localStorage.removeItem(ADMIN_PIN_KEY);
    setPin("");
    setDraftPin("");
  }

  if (!ready) {
    return <div className="min-h-screen bg-matica-soft" />;
  }

  if (!pin) {
    return (
      <main className="grid min-h-screen place-items-center bg-matica-soft px-4">
        <form className="w-full max-w-sm rounded-lg border border-matica-line bg-white p-5 shadow-soft" onSubmit={submit}>
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-matica-mint text-matica-green">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-black">Admin Matica</h1>
          <p className="mt-1 text-sm font-semibold text-matica-ink/60">Introduce el PIN interno.</p>
          <label className="mt-5 block space-y-1">
            <span className="text-sm font-bold text-matica-ink/70">PIN</span>
            <input
              className="matica-focus w-full rounded-lg border border-matica-line px-3 py-3"
              value={draftPin}
              type="password"
              onChange={(event) => setDraftPin(event.target.value)}
              autoFocus
            />
          </label>
          <button className="matica-focus mt-4 min-h-12 w-full rounded-lg bg-matica-green px-4 font-black text-white">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-matica-soft text-matica-ink">
      <header className="border-b border-matica-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-black uppercase text-matica-green">Matica Fresh Food</p>
            <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm font-semibold text-matica-ink/60">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminLink href="/admin">Inicio</AdminLink>
            <AdminLink href="/admin/pedidos">Pedidos</AdminLink>
            <AdminLink href="/admin/informes">Informes</AdminLink>
            <AdminLink href="/admin/companies">Empresas</AdminLink>
            <AdminLink href="/admin/menu">Menú del día</AdminLink>
            <AdminLink href="/admin/products">Productos</AdminLink>
            <button
              className="matica-focus grid h-11 w-11 place-items-center rounded-lg border border-matica-line bg-white text-matica-ink"
              onClick={clearPin}
              aria-label="Salir"
              title="Salir"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      {children(pin, clearPin)}
    </main>
  );
}

function AdminLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="matica-focus rounded-lg border border-matica-line bg-white px-4 py-2 text-sm font-black text-matica-ink hover:border-matica-green"
      href={href}
    >
      {children}
    </Link>
  );
}
