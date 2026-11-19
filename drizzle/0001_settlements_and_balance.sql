CREATE TABLE `monthly_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`income_id` integer,
	`expense_id` integer,
	`month` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`settled_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`income_id`) REFERENCES `income_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `recurring_expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "settlements_exactly_one_source" CHECK(("monthly_settlements"."income_id" IS NOT NULL AND "monthly_settlements"."expense_id" IS NULL) OR ("monthly_settlements"."income_id" IS NULL AND "monthly_settlements"."expense_id" IS NOT NULL)),
	CONSTRAINT "settlements_amount_positive" CHECK("monthly_settlements"."amount_cents" > 0),
	CONSTRAINT "settlements_month_fmt" CHECK("monthly_settlements"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);
--> statement-breakpoint
CREATE INDEX `settlements_month_idx` ON `monthly_settlements` (`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_income_month_uq` ON `monthly_settlements` (`income_id`,`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_expense_month_uq` ON `monthly_settlements` (`expense_id`,`month`);--> statement-breakpoint
ALTER TABLE `settings` ADD `account_balance_cents` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `account_balance_date` text;