import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionJwt } from "@/lib/auth/jwt";

/**
 * Checagem OTIMISTA: só confere a assinatura/validade do JWT do cookie, sem banco.
 * A validação completa (sessão existe, não revogada) acontece em requireSession()
 * nas páginas e Server Actions protegidas.
 */
const PUBLIC_PATHS = ["/login", "/verify", "/cadastro", "/esqueci-senha", "/redefinir-senha", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && pathname !== "/") {
    const claims = await verifySessionJwt(request.cookies.get(SESSION_COOKIE)?.value);
    if (!claims) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const response = NextResponse.next();
  // Cabeçalhos de segurança básicos para todas as páginas.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (request.nextUrl.protocol === "https:") {
    // Navegador passa a usar sempre HTTPS neste domínio por 1 ano.
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  // Ignora arquivos estáticos e internos do Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
