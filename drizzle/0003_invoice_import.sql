CREATE TABLE `invoice_credits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`credit_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`import_id` integer,
	`import_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_id`) REFERENCES `invoice_imports`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoice_credits_amount_positive" CHECK("invoice_credits"."amount_cents" > 0),
	CONSTRAINT "invoice_credits_date_fmt" CHECK("invoice_credits"."credit_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `invoice_credits_invoice_idx` ON `invoice_credits` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_credits_import_idx` ON `invoice_credits` (`import_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_credits_import_key_uq` ON `invoice_credits` (`invoice_id`,`import_key`);--> statement-breakpoint
CREATE TABLE `invoice_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`bank` text NOT NULL,
	`file_name` text NOT NULL,
	`reference_month` text NOT NULL,
	`purchases_count` integer DEFAULT 0 NOT NULL,
	`credits_count` integer DEFAULT 0 NOT NULL,
	`net_cents` integer DEFAULT 0 NOT NULL,
	`paid_invoice_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_imports_bank" CHECK("invoice_imports"."bank" IN ('nubank', 'picpay', 'mercadopago')),
	CONSTRAINT "invoice_imports_month_fmt" CHECK("invoice_imports"."reference_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "invoice_imports_counts" CHECK("invoice_imports"."purchases_count" >= 0 AND "invoice_imports"."credits_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `invoice_imports_card_idx` ON `invoice_imports` (`card_id`);--> statement-breakpoint
CREATE TABLE `merchant_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_key` text NOT NULL,
	`category_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "merchant_rules_key_nonempty" CHECK(length("merchant_rules"."merchant_key") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_rules_merchant_key_unique` ON `merchant_rules` (`merchant_key`);--> statement-breakpoint
ALTER TABLE `card_purchases` ADD `import_id` integer REFERENCES invoice_imports(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `card_purchases` ADD `import_key` text;--> statement-breakpoint
ALTER TABLE `card_purchases` ADD `first_invoice_month` text;--> statement-breakpoint
CREATE INDEX `card_purchases_import_idx` ON `card_purchases` (`import_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_purchases_import_key_uq` ON `card_purchases` (`card_id`,`import_key`);