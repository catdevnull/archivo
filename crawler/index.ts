import { drizzle } from "drizzle-orm/bun-sqlite";
import { crawlJobs } from "./schema";
import { eq } from "drizzle-orm";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { $, s3, serve, write } from "bun";
const db = drizzle(process.env.DATABASE_URL || "./db.sqlite");

serve({
  routes: {
    "/api/crawls": {
      GET: async (req) => {
        const jobs = await db.select().from(crawlJobs);
        return Response.json(jobs);
      },
      POST: async (req) => {
        const body = await req.json();
        const job = await db
          .insert(crawlJobs)
          .values({
            url: body.url,
            status: "pending",
          })
          .returning();

        return Response.json(job);
      },
    },
    "/api/crawls/:id": {
      GET: async (req) => {
        const job = await db
          .select()
          .from(crawlJobs)
          .where(eq(crawlJobs.id, req.params.id));
        return Response.json(job);
      },
    },
  },
});

while (true) {
  const jobs = await db.transaction(async (tx) => {
    const pendingJobs = await tx
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.status, "pending"))
      .limit(2);

    if (pendingJobs.length > 0) {
      await Promise.all(
        pendingJobs.map((job) =>
          tx
            .update(crawlJobs)
            .set({ status: "working" })
            .where(eq(crawlJobs.id, job.id))
        )
      );
    }

    return pendingJobs;
  });

  if (jobs.length) console.info("[starting]", jobs);

  for (const job of jobs) {
    (async () => {
      try {
        await crawl(job);
      } catch (error) {
        await db
          .update(crawlJobs)
          .set({ status: "failed" })
          .where(eq(crawlJobs.id, job.id));
        console.error(`failed to crawl ${job.id} (${job.url}):`, error);
      }
    })();
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function crawl(job: typeof crawlJobs.$inferSelect) {
  const crawlPath = join("crawls", job.id);
  await mkdir(crawlPath, { recursive: true });

  await $`docker run --rm -it \
  ${
    process.env.PROXY_URL ? `--env=PROXY_SERVER=${process.env.PROXY_URL}` : ""
  } \
  -v ./${crawlPath}:/crawls/ \
  webrecorder/browsertrix-crawler crawl --url ${job.url} \
  --generateWACZ --scopeType page --diskUtilization 99 \
  --collection ${job.id}`;

  const outputPath = join(crawlPath, "collections", job.id);

  if (process.env.S3_BUCKET) {
    console.info(`[${job.id}] Syncing crawl to S3...`);
    const files = await readdir(outputPath, { recursive: true });
    await Promise.all(
      files.map(async (file) => {
        const filePath = join(outputPath, file);
        const stats = await stat(filePath);
        if (stats.isFile()) {
          await write(s3.file(join(crawlPath, file)), Bun.file(filePath));
        }
      })
    );

    console.info(`[${job.id}] Successfully synced crawl to S3`);
    await $`rm -rf ${crawlPath}`;
  }

  await db
    .update(crawlJobs)
    .set({ status: "completed" })
    .where(eq(crawlJobs.id, job.id));
}
