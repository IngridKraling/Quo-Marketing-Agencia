import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las variables de Supabase se llaman SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (sin NEXT_PUBLIC_).
  // `env` las inyecta al compilar para que también las vea el navegador (login). Son datos públicos
  // por diseño: la seguridad está en las políticas RLS y en el login, no en esconder esta clave.
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
