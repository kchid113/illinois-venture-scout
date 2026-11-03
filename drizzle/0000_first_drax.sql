CREATE TABLE `affiliations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`university` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`classification` text NOT NULL,
	`status` text NOT NULL,
	`first_observed` text NOT NULL,
	`verified_at` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `claim_company_idx` ON `claims` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `claim_value_idx` ON `claims` (`company_id`,`field`,`value`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`profile` text NOT NULL,
	`status` text DEFAULT 'Not verified' NOT NULL,
	`first_observed` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_profile_unique` ON `companies` (`profile`);--> statement-breakpoint
CREATE INDEX `company_name_idx` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`source_id` text NOT NULL,
	`excerpt` text NOT NULL,
	`relationship` text DEFAULT 'supports' NOT NULL,
	`method` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_pair_idx` ON `evidence` (`claim_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `source_history` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`hash` text NOT NULL,
	`observed_at` text NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_version_idx` ON `source_history` (`source_id`,`hash`);--> statement-breakpoint
CREATE TABLE `ingestion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`connector` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`count` integer DEFAULT 0 NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`event_date` text,
	`first_observed` text NOT NULL,
	`dedup_key` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_dedup_key_unique` ON `signals` (`dedup_key`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`type` text NOT NULL,
	`published_at` text,
	`retrieved_at` text NOT NULL,
	`last_checked` text NOT NULL,
	`hash` text NOT NULL,
	`accessibility` text DEFAULT 'Accessible' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_owner_key` ON `workspace` (`user_id`,`kind`,`key`);