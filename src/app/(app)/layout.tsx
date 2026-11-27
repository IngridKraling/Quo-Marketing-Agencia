import { Suspense } from "react";
import { cerrarSesion } from "@/app/actions";
import { MenuLateral, MenuLateralSinRuta } from "@/components/menu-lateral";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen md:flex">
      <Suspense fallback={<MenuLateralSinRuta salir={cerrarSesion} />}>
        <MenuLateral salir={cerrarSesion} />
      </Suspense>
      <main className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
