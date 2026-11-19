import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as telas são dinâmicas (dependem da sessão e do banco), então não usamos
  // Cache Components / PPR: renderização dinâmica padrão, mais simples e previsível.

  // O pdfjs-dist (leitura das faturas em PDF) carrega o próprio worker:
  // deve ser carregado pelo Node, não empacotado.
  serverExternalPackages: ["pdfjs-dist"],
  // O worker do pdf.js é importado dinamicamente: garante que ele vá junto para a Vercel.
  outputFileTracingIncludes: {
    "/cartoes/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },

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
