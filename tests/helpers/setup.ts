// Executado antes de cada arquivo de teste.
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.DATABASE_URL = "postgres://test@localhost/test"; // não é usado: "@/db/client" vira PGlite
process.env.MAIL_MODE = "console";
process.env.EMAIL_MX_CHECK = "false";
process.env.TWO_FACTOR_TTL_MINUTES = "5";
process.env.TWO_FACTOR_MAX_ATTEMPTS = "5";
process.env.SESSION_TTL_HOURS = "12";

process.env.ADMIN_EMAILS = "admin@example.com";
export {};
// Mercado Pago: valores falsos; os testes trocam o fetch por um servidor simulado.
process.env.MP_ACCESS_TOKEN = "TEST-token-falso";
process.env.MP_WEBHOOK_SECRET = "segredo-webhook-teste";
process.env.MP_API_BASE = "http://mp.test";
