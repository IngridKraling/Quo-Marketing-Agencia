"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [detalle, setDetalle] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setDetalle(error ? explicar(error.message) : "");
    setEstado(error ? "error" : "enviado");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={enviar} className="card w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">Ingresar</h1>
        <input className="input" type="email" required placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn w-full" disabled={estado === "enviando"}>Enviarme un link</button>
        {estado === "enviado" && <p className="text-sm text-green-700">Revisá tu mail y abrí el link.</p>}
        {estado === "error" && <p className="text-sm text-red-700">No pudimos enviar el link: {detalle}</p>}
      </form>
    </main>
  );
}

/** Traduce los errores más comunes de Supabase Auth y deja el original para diagnóstico. */
function explicar(mensaje: string) {
  const m = mensaje.toLowerCase();
  if (m.includes("signups not allowed")) return "ese mail no está dado de alta como usuario.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "se pidieron demasiados links seguidos; esperá unos minutos y probá de nuevo.";
  if (m.includes("fetch") || m.includes("network")) return "no se pudo conectar con Supabase (revisar las variables de Vercel).";
  if (m.includes("invalid api key") || m.includes("apikey")) return "la clave de Supabase cargada en Vercel no es válida.";
  return mensaje;
}
