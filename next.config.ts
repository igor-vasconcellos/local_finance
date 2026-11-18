import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% local e de usuário único: todas as telas são dinâmicas (dependem
  // da sessão e do banco), então não usamos Cache Components / PPR.
  // Mantemos o modelo de renderização dinâmica padrão, mais simples e previsível.

  // better-sqlite3 é um módulo nativo: deve ser carregado pelo Node, não empacotado.
  serverExternalPackages: ["better-sqlite3"],

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
