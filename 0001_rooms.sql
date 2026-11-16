CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`expires` integer NOT NULL
);
