CREATE TABLE `fleet_accounts` (
	`account` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`source_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fleet_account_client` ON `fleet_accounts` (`client_id`);--> statement-breakpoint
CREATE TABLE `fleet_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`offset` integer NOT NULL,
	`content_hash` text NOT NULL,
	`rows` integer NOT NULL,
	`inserted` integer NOT NULL,
	`changed` integer NOT NULL,
	`unchanged` integer NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `fleet_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_batch_offset` ON `fleet_batches` (`import_id`,`offset`);--> statement-breakpoint
CREATE TABLE `fleet_imports` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`file_hash` text NOT NULL,
	`source` text NOT NULL,
	`total_rows` integer NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL,
	`unchanged` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'loading' NOT NULL,
	`source_key` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_import_id` ON `fleet_imports` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_file_hash` ON `fleet_imports` (`file_hash`);--> statement-breakpoint
CREATE TABLE `fleet_transactions` (
	`version_id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`import_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`account` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`status` text NOT NULL,
	`kind` text NOT NULL,
	`merchant` text NOT NULL,
	`customer_name` text NOT NULL,
	`driver` text DEFAULT '' NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`volume_milli` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`authorised_volume_milli` integer,
	`authorised_amount_cents` integer,
	`odometer` text DEFAULT '' NOT NULL,
	`card_last4` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`coupon` text DEFAULT '' NOT NULL,
	`coupon_description` text DEFAULT '' NOT NULL,
	`pump` text DEFAULT '' NOT NULL,
	`employee` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `fleet_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account`) REFERENCES `fleet_accounts`(`account`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_version_unique` ON `fleet_transactions` (`import_id`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `fleet_tx_id` ON `fleet_transactions` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `fleet_tx_date` ON `fleet_transactions` (`date`);--> statement-breakpoint
CREATE INDEX `fleet_tx_account_date` ON `fleet_transactions` (`account`,`date`);--> statement-breakpoint
CREATE INDEX `fleet_tx_import` ON `fleet_transactions` (`import_id`);
--> statement-breakpoint
CREATE VIEW `fleet_current` AS
SELECT t.* FROM fleet_transactions t JOIN fleet_imports i ON i.id=t.import_id AND i.status='complete'
WHERE NOT EXISTS (
 SELECT 1 FROM fleet_transactions newer JOIN fleet_imports ni ON ni.id=newer.import_id AND ni.status='complete'
 WHERE newer.transaction_id=t.transaction_id AND ni.sequence>i.sequence
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_one_active_import` ON `fleet_imports` (`status`) WHERE `status`='loading';
