-- Supabase expõe o schema public pela Data API (PostgREST). O app NÃO usa essa API:
-- ele conecta direto no Postgres com o usuário dono das tabelas (que ignora RLS).
-- Ligar RLS sem nenhuma política bloqueia todo acesso pela Data API (anon/authenticated).
ALTER TABLE "auth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cdi_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "income_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "institutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "one_time_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "box_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "savings_boxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "simulation_installments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "simulations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "monthly_settlements" ENABLE ROW LEVEL SECURITY;
