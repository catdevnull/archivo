import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const crawlJobs = sqliteTable("crawl_jobs", {
  id: text()
    .primaryKey()
    .$defaultFn(() => nanoid()),

  urls: text({ mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),

  status: text({ enum: ["pending", "working", "completed", "failed"] })
    .notNull()
    .default("pending"),

  createdAt: text().default(sql`(CURRENT_TIMESTAMP)`),
});
