"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setEstado(error ? "error" : "enviado");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={enviar} className="card w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">Ingresar</h1>
        <input className="input" type="email" required placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn w-full" disabled={estado === "enviando"}>Enviarme un link</button>
        {estado === "enviado" && <p className="text-sm text-green-700">Revisá tu mail y abrí el link.</p>}
        {estado === "error" && <p className="text-sm text-red-700">No pudimos enviar el link. ¿Tu usuario está dado de alta?</p>}
      </form>
    </main>
  );
}
