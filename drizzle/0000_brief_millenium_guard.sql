CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`segment` text NOT NULL,
	`status` text DEFAULT 'Actual' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`district` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`products` text DEFAULT '' NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`strategic` integer DEFAULT 0 NOT NULL,
	`potential` real,
	`potential_unit` text DEFAULT 'gal' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`next_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_code_unique` ON `clients` (`code`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`context` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`extracted_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`unchanged` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`segment` text NOT NULL,
	`product` text NOT NULL,
	`unit` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`total` real NOT NULL,
	`addressable` real,
	`source` text NOT NULL,
	`scope` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`date` text NOT NULL,
	`product` text NOT NULL,
	`unit` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`volume` real NOT NULL,
	`revenue` real,
	`cost` real,
	`source` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_key` ON `records` (`client_id`,`date`,`product`,`unit`,`location`);--> statement-breakpoint
CREATE INDEX `record_date` ON `records` (`date`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`batch_id` text,
	`created_at` text NOT NULL
);
