import { drizzle } from "drizzle-orm/bun-sqlite";
import { crawlJobs } from "./schema";
import { eq } from "drizzle-orm";
import { exists, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { $, s3, serve, write } from "bun";
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
    "/": {
      GET: async (req) => {
        try {
          const crawls = await db.select().from(crawlJobs);

          const crawlFiles = crawls.map((obj) => ({
            id: obj.id,
            urls: obj.urls,
            status: obj.status,
            createdAt: obj.createdAt,
            waczUrl:
              obj.status === "completed"
                ? `https://${
                    process.env.S3_BUCKET
                  }.${process.env.S3_ENDPOINT?.replace(
                    "https://",
                    ""
                  )}/crawls/${obj.id}/${obj.id}.wacz`
                : null,
          }));

          const html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Web Archive Crawls</title>
            <style>
              body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
              h1 { color: #333; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #f2f2f2; }
              tr:hover { background-color: #f5f5f5; }
              a { color: #0066cc; text-decoration: none; }
              a:hover { text-decoration: underline; }
              .size, .date { white-space: nowrap; }
              .status-pending { color: #ff9900; }
              .status-working { color: #0099cc; }
              .status-completed { color: #00cc66; }
              .status-failed { color: #cc0000; }
            </style>
          </head>
          <body>
            <h1>Web Archive Crawls</h1>
            <p>Click on a completed archive to open it in ReplayWeb.page</p>
            <form id="crawlForm" style="margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9;">
              <h2 style="margin-top: 0;">Start a New Crawl</h2>
              <div style="margin-bottom: 15px;">
                <label for="url" style="display: block; margin-bottom: 5px; font-weight: bold;">URL to Crawl:</label>
                <input type="url" id="url" name="url" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                  placeholder="https://example.com">
              </div>
              <div style="margin-bottom: 15px;">
                <label for="apiToken" style="display: block; margin-bottom: 5px; font-weight: bold;">API Token:</label>
                <input type="password" id="apiToken" name="apiToken" required style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                  placeholder="Enter your API token">
              </div>
              <button type="submit" style="background-color: #0066cc; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer;">
                Start Crawl
              </button>
              <p id="formStatus" style="margin-top: 10px; color: #666;"></p>
            </form>
            
            <script>
              document.getElementById('crawlForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const statusEl = document.getElementById('formStatus');
                statusEl.textContent = 'Submitting crawl job...';
                const apiToken = document.getElementById('apiToken').value;
                
                try {
                  const response = await fetch('/api/crawls', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': \`Bearer \${apiToken}\`
                    },
                    body: JSON.stringify({
                      urls: [document.getElementById('url').value],
                    }),
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    statusEl.textContent = \`Crawl job started! Job ID: \${result.id}\`;
                    document.getElementById('url').value = '';
                    // Store the API token in session storage for future requests
                    sessionStorage.setItem('apiToken', apiToken);
                    setTimeout(() => { window.location.reload(); }, 1000);
                  } else {
                    const errorText = await response.text();
                    statusEl.textContent = \`Error: \${errorText}\`;
                  }
                } catch (err) {
                  statusEl.textContent = \`Error: \${err instanceof Error ? err.message : String(err)}\`;
                }
              });
              
              // Pre-fill API token from session storage if available
              window.addEventListener('DOMContentLoaded', () => {
                const savedToken = sessionStorage.getItem('apiToken');
                if (savedToken) {
                  document.getElementById('apiToken').value = savedToken;
                }
              });
            </script>
            <table>
              <thead>
                <tr>
                  <th>Archive ID</th>
                  <th>URLs</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                ${
                  crawlFiles.length > 0
                    ? crawlFiles
                        .map(
                          (file) => `
                    <tr>
                      <td>${
                        file.waczUrl
                          ? `<a href="https://replayweb.page/?source=${encodeURIComponent(
                              file.waczUrl
                            )}" target="_blank">${file.id}</a>`
                          : file.id
                      }</td>
                      <td>${file.urls.join(", ")}</td>
                      <td class="status-${file.status}">${file.status}</td>
                      <td class="date">${file.createdAt}</td>
                    </tr>
                  `
                        )
                        .join("")
                    : '<tr><td colspan="4">No archives found</td></tr>'
                }
              </tbody>
            </table>
          </body>
          </html>
          `;

          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        } catch (error: any) {
          console.error("Error serving index:", error);
          return new Response("Error loading archives: " + error.message, {
            status: 500,
          });
        }
      },
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
    console.info(
      `[info] Maximum concurrent crawls (${MAX_CONCURRENT_CRAWLS}) reached. Waiting...`
    );
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
