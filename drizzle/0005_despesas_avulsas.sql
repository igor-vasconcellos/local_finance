DROP TABLE "account_movements" CASCADE;--> statement-breakpoint
ALTER TABLE "one_time_expenses" ADD COLUMN "paid_at" text;--> statement-breakpoint
-- Avulsas que já existiam (compras de débito/Pix do simulador) contavam como pagas
-- na data. As que já aconteceram continuam pagas; as futuras ficam pendentes.
UPDATE "one_time_expenses"
SET "paid_at" = "date" || 'T12:00:00.000Z'
WHERE "date" <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
