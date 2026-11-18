CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_challenges_attempts_nonneg" CHECK("auth_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_user_idx` ON `auth_challenges` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_single_user" CHECK("users"."id" = 1),
	CONSTRAINT "users_email_lowercase" CHECK("users"."email" = lower("users"."email")),
	CONSTRAINT "users_failed_logins_nonneg" CHECK("users"."failed_logins" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `cdi_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`annual_rate_bp` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "cdi_rates_positive" CHECK("cdi_rates"."annual_rate_bp" > 0 AND "cdi_rates"."annual_rate_bp" <= 10000),
	CONSTRAINT "cdi_rates_date_fmt" CHECK("cdi_rates"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cdi_rates_effective_from_unique` ON `cdi_rates` (`effective_from`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`green_threshold_bp` integer DEFAULT 2000 NOT NULL,
	`yellow_threshold_bp` integer DEFAULT 500 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_thresholds_order" CHECK("settings"."yellow_threshold_bp" >= 0 AND "settings"."green_threshold_bp" > "settings"."yellow_threshold_bp" AND "settings"."green_threshold_bp" <= 10000)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text,
	`icon` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "categories_kind" CHECK("categories"."kind" IN ('income', 'expense'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_kind_uq` ON `categories` (`name`,`kind`);--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`recurrence` text NOT NULL,
	`pay_day` integer,
	`pay_date` text,
	`start_month` text NOT NULL,
	`end_month` text,
	`category_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "income_type" CHECK("income_sources"."type" IN ('salary', 'pro_labore', 'extra', 'other')),
	CONSTRAINT "income_amount_positive" CHECK("income_sources"."amount_cents" > 0),
	CONSTRAINT "income_recurrence" CHECK("income_sources"."recurrence" IN ('monthly', 'once')),
	CONSTRAINT "income_recurrence_fields" CHECK(("income_sources"."recurrence" = 'monthly' AND "income_sources"."pay_day" IS NOT NULL AND "income_sources"."pay_day" BETWEEN 1 AND 31)
       OR ("income_sources"."recurrence" = 'once' AND "income_sources"."pay_date" IS NOT NULL AND "income_sources"."pay_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')),
	CONSTRAINT "income_start_month_fmt" CHECK("income_sources"."start_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "income_end_month" CHECK("income_sources"."end_month" IS NULL OR ("income_sources"."end_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND "income_sources"."end_month" >= "income_sources"."start_month"))
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_name_unique` ON `institutions` (`name`);--> statement-breakpoint
CREATE TABLE `one_time_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`category_id` integer,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`simulation_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_time_amount_positive" CHECK("one_time_expenses"."amount_cents" > 0),
	CONSTRAINT "one_time_date_fmt" CHECK("one_time_expenses"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_expenses_simulation_id_unique` ON `one_time_expenses` (`simulation_id`);--> statement-breakpoint
CREATE INDEX `one_time_expenses_date_idx` ON `one_time_expenses` (`date`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "recurring_amount_positive" CHECK("recurring_expenses"."amount_cents" > 0),
	CONSTRAINT "recurring_due_day" CHECK("recurring_expenses"."due_day" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_start_month_fmt" CHECK("recurring_expenses"."start_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "recurring_end_month" CHECK("recurring_expenses"."end_month" IS NULL OR ("recurring_expenses"."end_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND "recurring_expenses"."end_month" >= "recurring_expenses"."start_month"))
);
--> statement-breakpoint
CREATE INDEX `recurring_expenses_category_idx` ON `recurring_expenses` (`category_id`);--> statement-breakpoint
CREATE TABLE `card_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`category_id` integer,
	`description` text NOT NULL,
	`total_cents` integer NOT NULL,
	`installments_count` integer NOT NULL,
	`purchase_date` text NOT NULL,
	`simulation_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "purchases_total_positive" CHECK("card_purchases"."total_cents" > 0),
	CONSTRAINT "purchases_installments_range" CHECK("card_purchases"."installments_count" BETWEEN 1 AND 48),
	CONSTRAINT "purchases_date_fmt" CHECK("card_purchases"."purchase_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_purchases_simulation_id_unique` ON `card_purchases` (`simulation_id`);--> statement-breakpoint
CREATE INDEX `card_purchases_card_idx` ON `card_purchases` (`card_id`);--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`institution_id` integer,
	`limit_cents` integer NOT NULL,
	`closing_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`color` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "cards_limit_nonneg" CHECK("credit_cards"."limit_cents" >= 0),
	CONSTRAINT "cards_closing_day" CHECK("credit_cards"."closing_day" BETWEEN 1 AND 31),
	CONSTRAINT "cards_due_day" CHECK("credit_cards"."due_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`number` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `card_purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "installments_number_positive" CHECK("installments"."number" >= 1),
	CONSTRAINT "installments_amount_positive" CHECK("installments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `installments_invoice_idx` ON `installments` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `installments_purchase_number_uq` ON `installments` (`purchase_id`,`number`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`reference_month` text NOT NULL,
	`closing_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoices_status" CHECK("invoices"."status" IN ('open', 'closed', 'paid')),
	CONSTRAINT "invoices_month_fmt" CHECK("invoices"."reference_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "invoices_dates" CHECK("invoices"."closing_date" <= "invoices"."due_date")
);
--> statement-breakpoint
CREATE INDEX `invoices_month_idx` ON `invoices` (`reference_month`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_card_month_uq` ON `invoices` (`card_id`,`reference_month`);--> statement-breakpoint
CREATE TABLE `box_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`box_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `savings_boxes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "box_tx_type" CHECK("box_transactions"."type" IN ('deposit', 'withdrawal')),
	CONSTRAINT "box_tx_amount_positive" CHECK("box_transactions"."amount_cents" > 0),
	CONSTRAINT "box_tx_date_fmt" CHECK("box_transactions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `box_transactions_box_date_idx` ON `box_transactions` (`box_id`,`date`);--> statement-breakpoint
CREATE TABLE `savings_boxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`name` text NOT NULL,
	`cdi_percent_bp` integer NOT NULL,
	`goal_cents` integer,
	`goal_date` text,
	`color` text,
	`icon` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "boxes_cdi_percent" CHECK("savings_boxes"."cdi_percent_bp" > 0 AND "savings_boxes"."cdi_percent_bp" <= 50000),
	CONSTRAINT "boxes_goal_positive" CHECK("savings_boxes"."goal_cents" IS NULL OR "savings_boxes"."goal_cents" > 0),
	CONSTRAINT "boxes_goal_date_fmt" CHECK("savings_boxes"."goal_date" IS NULL OR "savings_boxes"."goal_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `savings_boxes_institution_idx` ON `savings_boxes` (`institution_id`);--> statement-breakpoint
CREATE TABLE `simulation_installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`simulation_id` integer NOT NULL,
	`number` integer NOT NULL,
	`reference_month` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sim_installments_number_positive" CHECK("simulation_installments"."number" >= 1),
	CONSTRAINT "sim_installments_amount_positive" CHECK("simulation_installments"."amount_cents" > 0),
	CONSTRAINT "sim_installments_month_fmt" CHECK("simulation_installments"."reference_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);
--> statement-breakpoint
CREATE INDEX `sim_installments_month_idx` ON `simulation_installments` (`reference_month`);--> statement-breakpoint
CREATE UNIQUE INDEX `sim_installments_number_uq` ON `simulation_installments` (`simulation_id`,`number`);--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`payment_method` text NOT NULL,
	`card_id` integer,
	`category_id` integer,
	`total_cents` integer NOT NULL,
	`installments_count` integer DEFAULT 1 NOT NULL,
	`purchase_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`effectivated_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "simulations_method" CHECK("simulations"."payment_method" IN ('credit', 'debit')),
	CONSTRAINT "simulations_method_fields" CHECK(("simulations"."payment_method" = 'credit' AND "simulations"."card_id" IS NOT NULL AND "simulations"."installments_count" BETWEEN 1 AND 48)
       OR ("simulations"."payment_method" = 'debit' AND "simulations"."card_id" IS NULL AND "simulations"."installments_count" = 1)),
	CONSTRAINT "simulations_total_positive" CHECK("simulations"."total_cents" > 0),
	CONSTRAINT "simulations_status" CHECK("simulations"."status" IN ('active', 'archived', 'effectivated')),
	CONSTRAINT "simulations_date_fmt" CHECK("simulations"."purchase_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "simulations_effectivated" CHECK(("simulations"."status" = 'effectivated') = ("simulations"."effectivated_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `simulations_status_idx` ON `simulations` (`status`);