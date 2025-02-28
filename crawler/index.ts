import { drizzle } from "drizzle-orm/bun-sqlite";
import { crawlJobs } from "./schema";
import { eq, sql } from "drizzle-orm";
import { exists, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { $, s3, serve, write } from "bun";
import homepage from "./src/index.html";

const db = drizzle(process.env.DATABASE_URL || "./db.sqlite");

// Global limit for concurrent crawls
const MAX_CONCURRENT_CRAWLS = 2;
let activeCrawls = 0;

if (!process.env.API_TOKEN) {
  console.warn(
    "WARNING: API_TOKEN is not set in .env file. Using an insecure default token."
  );
}

const validateApiToken = (req: Request) =>
  req.headers.get("Authorization")?.replace("Bearer ", "") ===
    process.env.API_TOKEN ||
  new URL(req.url).searchParams.get("token") === process.env.API_TOKEN;

serve({
  routes: {
    "/": homepage,
    "/api/info": {
      GET: async () =>
        Response.json({
          S3_BUCKET: process.env.S3_BUCKET,
          S3_ENDPOINT: process.env.S3_ENDPOINT,
        }),
    },
    "/api/crawls": {
      GET: async (req) => {
        if (!validateApiToken(req))
          return new Response("Unauthorized", { status: 401 });

        const jobs = await db.select().from(crawlJobs);
        return Response.json(jobs);
      },
      POST: async (req) => {
        if (!validateApiToken(req))
          return new Response("Unauthorized", { status: 401 });

        const body = await req.json();
        console.log({ body });
        const job = await db
          .insert(crawlJobs)
          .values({
            urls: body.urls,
            status: "pending",
          })
          .returning();

        return Response.json(job[0]);
      },
    },
    "/api/crawls/:id": {
      GET: async (req) => {
        if (!validateApiToken(req))
          return new Response("Unauthorized", { status: 401 });

        const job = await db
          .select()
          .from(crawlJobs)
          .where(eq(crawlJobs.id, req.params.id));
        return Response.json(job);
      },
    },
    "/api/public/jmilei-crawls": {
      GET: async () => {
        // Public endpoint that doesn't require auth
        // Find crawls that include jmilei and x.com/twitter.com in the URLs
        const jobs = await db
          .select()
          .from(crawlJobs)
          .where(
            sql`json_array_length(${crawlJobs.urls}) > 0 AND (
              ${crawlJobs.urls} LIKE '%jmilei%' AND 
              (${crawlJobs.urls} LIKE '%x.com%' OR ${crawlJobs.urls} LIKE '%twitter.com%')
            )`
          )
          .orderBy(sql`${crawlJobs.createdAt} DESC`)
          .limit(10);

        return Response.json(jobs);
      },
    },
  },
});

while (true) {
  // Check how many crawls are currently active
  const workingJobs = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.status, "working"));

  activeCrawls = workingJobs.length;

  // Only get new jobs if we're under the limit
  const availableSlots = MAX_CONCURRENT_CRAWLS - activeCrawls;

  if (availableSlots <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    continue;
  }

  const jobs = await db.transaction(async (tx) => {
    const pendingJobs = await tx
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.status, "pending"))
      .limit(availableSlots);

    if (pendingJobs.length > 0) {
      await Promise.all(
        pendingJobs.map((job) =>
          tx
            .update(crawlJobs)
            .set({ status: "working", startedAt: new Date() })
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
        console.error(`failed to crawl ${job.id} (${job.urls}):`, error);
      } finally {
        // Decrement active crawls when done
        activeCrawls--;
      }
    })();
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function crawl(job: typeof crawlJobs.$inferSelect) {
  const crawlPath = join("crawls", job.id);
  await mkdir(crawlPath, { recursive: true });

  const tempDir = join(crawlPath, "temp");
  await mkdir(tempDir, { recursive: true });

  const profilePath = (name: string) => `profiles/${name}.tar.gz`;

  let profileName = null;
  if (
    job.urls.some((url) => url.includes("//x.com")) ||
    job.urls.some((url) => url.includes("//twitter.com"))
  ) {
    if (await exists(profilePath("profile"))) {
      console.info(`[${job.id}] Using existing profile for Twitter...`);
      profileName = "profile";
    }
  }

  await write(join(tempDir, "links.txt"), job.urls.join("\n"));

  await $`docker run --rm -it \
  ${
    process.env.PROXY_URL ? `--env=PROXY_SERVER=${process.env.PROXY_URL}` : ""
  } \
  -v ./${crawlPath}:/crawls/ \
  -v ./profiles:/crawls/profiles/ \
  --cpus=0.8 \
  --memory=1g \
  webrecorder/browsertrix-crawler crawl \
  --urlFile /crawls/temp/links.txt \
  --generateWACZ --scopeType page --diskUtilization 99 \
  --collection ${job.id} \
  ${profileName ? `--profile=/crawls/${profilePath(profileName)}` : ""}`;

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
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(crawlJobs.id, job.id));
}
