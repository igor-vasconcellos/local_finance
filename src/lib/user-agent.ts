/** "Chrome no Windows", "Safari no iPhone"… (resumo simples, sem biblioteca). */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Aparelho desconhecido";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "sistema desconhecido";
  return `${browser} no ${os}`;
}

/** Esconde o fim do IP: 187.45.12.34 → 187.45.x.x */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "IP desconhecido";
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".x.x";
  return ip.split(":").slice(0, 3).join(":") + ":…";
}
