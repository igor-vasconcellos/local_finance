-- Contas múltiplas: cada tabela "raiz" ganha user_id (dados existentes → conta já cadastrada).
-- Roda com foreign_keys=OFF (ver src/db/migrate.ts) e é conferido por PRAGMA foreign_key_check.
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`avatar_color` text,
	`email_verified_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK("__new_users"."email" = lower("__new_users"."email")),
	CONSTRAINT "users_failed_logins_nonneg" CHECK("__new_users"."failed_logins" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "password_hash", "failed_logins", "locked_until", "avatar_color", "email_verified_at", "created_at", "updated_at") SELECT "id", "name", "email", "password_hash", "failed_logins", "locked_until", "avatar_color", "created_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`green_threshold_bp` integer DEFAULT 2000 NOT NULL,
	`yellow_threshold_bp` integer DEFAULT 500 NOT NULL,
	`account_balance_cents` integer,
	`account_balance_date` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "settings_thresholds_order" CHECK("__new_settings"."yellow_threshold_bp" >= 0 AND "__new_settings"."green_threshold_bp" > "__new_settings"."yellow_threshold_bp" AND "__new_settings"."green_threshold_bp" <= 10000)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "green_threshold_bp", "yellow_threshold_bp", "account_balance_cents", "account_balance_date", "updated_at") SELECT (SELECT min("id") FROM `users`), "green_threshold_bp", "yellow_threshold_bp", "account_balance_cents", "account_balance_date", "updated_at" FROM `settings` WHERE EXISTS (SELECT 1 FROM `users`) LIMIT 1;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
DROP INDEX `cdi_rates_effective_from_unique`;--> statement-breakpoint
ALTER TABLE `cdi_rates` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `cdi_rates` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `cdi_rates` WHERE `user_id` = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `cdi_rates_user_date_uq` ON `cdi_rates` (`user_id`,`effective_from`);--> statement-breakpoint
DROP INDEX `categories_name_kind_uq`;--> statement-breakpoint
ALTER TABLE `categories` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `categories` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `categories` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_kind_uq` ON `categories` (`user_id`,`name`,`kind`);--> statement-breakpoint
DROP INDEX `institutions_name_unique`;--> statement-breakpoint
ALTER TABLE `institutions` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `institutions` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `institutions` WHERE `user_id` = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_user_name_uq` ON `institutions` (`user_id`,`name`);--> statement-breakpoint
DROP INDEX `one_time_expenses_date_idx`;--> statement-breakpoint
ALTER TABLE `one_time_expenses` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `one_time_expenses` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `one_time_expenses` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `one_time_expenses_user_date_idx` ON `one_time_expenses` (`user_id`,`date`);--> statement-breakpoint
DROP INDEX `merchant_rules_merchant_key_unique`;--> statement-breakpoint
ALTER TABLE `merchant_rules` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `merchant_rules` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `merchant_rules` WHERE `user_id` = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_rules_user_key_uq` ON `merchant_rules` (`user_id`,`merchant_key`);--> statement-breakpoint
DROP INDEX `simulations_status_idx`;--> statement-breakpoint
ALTER TABLE `simulations` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `simulations` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `simulations` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `simulations_user_status_idx` ON `simulations` (`user_id`,`status`);--> statement-breakpoint
DROP INDEX `settlements_month_idx`;--> statement-breakpoint
ALTER TABLE `monthly_settlements` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `monthly_settlements` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `monthly_settlements` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `settlements_user_month_idx` ON `monthly_settlements` (`user_id`,`month`);--> statement-breakpoint
CREATE TABLE `__new_auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`purpose` text DEFAULT 'login' NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_challenges_attempts_nonneg" CHECK("__new_auth_challenges"."attempts" >= 0),
	CONSTRAINT "auth_challenges_purpose" CHECK("__new_auth_challenges"."purpose" IN ('login', 'signup', 'reset'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_challenges`("id", "user_id", "purpose", "code_hash", "expires_at", "attempts", "consumed_at", "created_at") SELECT "id", "user_id", 'login', "code_hash", "expires_at", "attempts", "consumed_at", "created_at" FROM `auth_challenges`;--> statement-breakpoint
DROP TABLE `auth_challenges`;--> statement-breakpoint
ALTER TABLE `__new_auth_challenges` RENAME TO `auth_challenges`;--> statement-breakpoint
CREATE INDEX `auth_challenges_user_idx` ON `auth_challenges` (`user_id`);--> statement-breakpoint
ALTER TABLE `income_sources` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `income_sources` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `income_sources` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `income_sources_user_idx` ON `income_sources` (`user_id`);--> statement-breakpoint
ALTER TABLE `recurring_expenses` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `recurring_expenses` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `recurring_expenses` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `recurring_expenses_user_idx` ON `recurring_expenses` (`user_id`);--> statement-breakpoint
ALTER TABLE `credit_cards` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `credit_cards` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `credit_cards` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `credit_cards_user_idx` ON `credit_cards` (`user_id`);--> statement-breakpoint
ALTER TABLE `savings_boxes` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `savings_boxes` SET `user_id` = coalesce((SELECT min(`id`) FROM `users`), 0);--> statement-breakpoint
DELETE FROM `savings_boxes` WHERE `user_id` = 0;--> statement-breakpoint
CREATE INDEX `savings_boxes_user_idx` ON `savings_boxes` (`user_id`);