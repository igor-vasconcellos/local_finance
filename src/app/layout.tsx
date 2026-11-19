import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

// Fontes empacotadas com o app (pacote `geist`): nada é carregado de servidores externos.

export const metadata: Metadata = {
  title: { default: "BeaconFinance", template: "%s · BeaconFinance" },
  description: "Gerenciador financeiro pessoal: rendas, gastos, cartões, caixinhas e metas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
