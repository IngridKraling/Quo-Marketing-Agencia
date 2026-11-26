import Link from "next/link";
import { cerrarSesion } from "@/app/actions";

const links = [
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/equipo", label: "Equipo y tarifas" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold">Quo · Presupuestos</span>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-zinc-600 hover:text-zinc-900">
              {l.label}
            </Link>
          ))}
          <form action={cerrarSesion} className="ml-auto">
            <button className="text-sm text-zinc-500 hover:text-zinc-900">Salir</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
