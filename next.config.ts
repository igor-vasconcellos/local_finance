import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% local e de usuário único: todas as telas são dinâmicas (dependem
  // da sessão e do banco), então não usamos Cache Components / PPR.
  // Mantemos o modelo de renderização dinâmica padrão, mais simples e previsível.

  // better-sqlite3 é um módulo nativo e o pdfjs-dist (leitura das faturas em PDF)
  // carrega o próprio worker: os dois devem ser carregados pelo Node, não empacotados.
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist"],

  experimental: {
    // Faturas em PDF passam de 1 MB (limite padrão das Server Actions).
    serverActions: { bodySizeLimit: "10mb" },
  },

  poweredByHeader: false,

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
