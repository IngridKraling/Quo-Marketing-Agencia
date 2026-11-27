"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const ICONOS: Record<string, ReactNode> = {
  presupuestos: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  facturacion: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  conceptos: <path d="M4 6h16M4 12h16M4 18h10" />,
  clientes: <path d="M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 19v-1a3 3 0 0 0-2-2.8M17 5.2a3 3 0 0 1 0 5.6" />,
  configuracion: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2" />,
  salir: <path d="M15 17l5-5-5-5M20 12H9M12 21H5V3h7" />,
};

const Icono = ({ nombre }: { nombre: string }) => (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {ICONOS[nombre]}
  </svg>
);

const LINKS = [
  { href: "/presupuestos", label: "Presupuestos", icono: "presupuestos" },
  { href: "/facturacion", label: "Facturación", icono: "facturacion" },
  { href: "/conceptos", label: "Conceptos", icono: "conceptos" },
  { href: "/clientes", label: "Clientes", icono: "clientes" },
  { href: "/configuracion", label: "Configuración", icono: "configuracion" },
];

const CLAVE = "quo-menu-plegado";

/**
 * Menú lateral con el logo. En pantallas grandes se puede plegar (queda solo con íconos, para dar lugar a las
 * tablas anchas) y recuerda la elección. En el celular es un menú que se abre con el botón de arriba.
 */
export function MenuLateral({ salir }: { salir: () => Promise<void> }) {
  return <MenuLateralVista salir={salir} pathname={usePathname()} />;
}

/** Mientras se resuelve la ruta (prerender), el mismo menú sin la sección actual resaltada. */
export function MenuLateralSinRuta({ salir }: { salir: () => Promise<void> }) {
  return <MenuLateralVista salir={salir} pathname="" />;
}

function MenuLateralVista({ salir, pathname }: { salir: () => Promise<void>; pathname: string }) {
  const [plegado, setPlegado] = useState(false);
  const [abierto, setAbierto] = useState(false); // celular

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este navegador
      setPlegado(localStorage.getItem(CLAVE) === "1");
    } catch {}
  }, []);
  // Al navegar en el celular, se cierra el menú.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAbierto(false), [pathname]);

  function plegar() {
    setPlegado((p) => {
      try {
        localStorage.setItem(CLAVE, p ? "0" : "1");
      } catch {}
      return !p;
    });
  }

  const enlaces = (compacto: boolean) => (
    <nav className="flex flex-1 flex-col gap-1">
      {LINKS.map((l) => {
        const activo = !!pathname && (pathname === l.href || pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            title={compacto ? l.label : undefined}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
              activo ? "bg-sky-50 font-medium text-sky-800" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            } ${compacto ? "justify-center px-2" : ""}`}
          >
            <Icono nombre={l.icono} />
            {!compacto && l.label}
          </Link>
        );
      })}
      <form action={salir} className="mt-auto">
        <button
          title={compacto ? "Salir" : undefined}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 ${compacto ? "justify-center px-2" : ""}`}
        >
          <Icono nombre="salir" />
          {!compacto && "Salir"}
        </button>
      </form>
    </nav>
  );

  return (
    <>
      {/* Celular: barra de arriba con logo y botón de menú */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 md:hidden print:hidden">
        <Link href="/presupuestos" aria-label="Quo Marketing · Presupuestos">
          <Image src="/logo-quo.png" alt="quo·marketing" width={140} height={22} priority />
        </Link>
        <button type="button" className="btn-sec" onClick={() => setAbierto(true)} aria-expanded={abierto} aria-controls="menu-celular">
          Menú
        </button>
      </header>
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" id="menu-celular">
          <button type="button" className="absolute inset-0 bg-black/30" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <aside className="relative flex h-full w-64 flex-col gap-6 bg-white p-4 shadow-xl">
            <Image src="/logo-quo.png" alt="quo·marketing" width={170} height={27} />
            {enlaces(false)}
          </aside>
        </div>
      )}

      {/* Pantallas grandes: menú fijo a la izquierda, plegable */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white py-4 transition-[width] md:flex print:hidden ${
          plegado ? "w-16 px-2" : "w-56 px-3"
        }`}
      >
        <Link href="/presupuestos" className={`block ${plegado ? "mx-auto" : "px-2"}`} aria-label="Quo Marketing · Presupuestos">
          {plegado ? (
            <Image src="/logo-quo-corto.png" alt="quo" width={36} height={36} />
          ) : (
            <>
              <Image src="/logo-quo.png" alt="quo·marketing" width={180} height={28} priority />
              <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">Presupuestos</span>
            </>
          )}
        </Link>
        {enlaces(plegado)}
        <button
          type="button"
          onClick={plegar}
          className="flex items-center justify-center rounded-md py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={plegado ? "Desplegar menú" : "Plegar menú"}
          title={plegado ? "Desplegar menú" : "Plegar menú (más lugar para las tablas)"}
        >
          {plegado ? "»" : "« Plegar"}
        </button>
      </aside>
    </>
  );
}
