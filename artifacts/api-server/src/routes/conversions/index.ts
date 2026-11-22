import { Router, type IRouter } from "express";
import { ZipArchive } from "archiver";
import { waitUntil } from "@vercel/functions";
import {
  createJob, getJob, listJobs, updateJob, consumeDownloadRequest,
} from "../../lib/jobStore.js";
import { startScrapeJob } from "../../lib/scraper.js";
import {
  StartConversionBody, GetConversionParams, GetConversionStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/conversions", async (_req, res): Promise<void> => {
  res.json(await listJobs());
});

router.post("/conversions", async (req, res): Promise<void> => {
  const parsed = StartConversionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let url = parsed.data.url;
  try {
    const parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported URL protocol");
    if (["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) || parsedUrl.hostname.endsWith(".local")) {
      throw new Error("Local URLs cannot be imported");
    }
    url = parsedUrl.href;
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid URL" });
    return;
  }

  const job = await createJob(url);
  const task = startScrapeJob(job.id, url).catch(async (error) => {
    console.error("Scrape job failed", { error, jobId: job.id });
    await updateJob(job.id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
      message: "Conversion failed",
    });
  });
  if (process.env.VERCEL) waitUntil(task);
  else void task;
  res.status(201).json(job);
});

router.get("/conversions/:id", async (req, res): Promise<void> => {
  const params = GetConversionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const job = await getJob(params.data.id);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  res.json(job);
});

router.get("/conversions/:id/stats", async (req, res): Promise<void> => {
  const params = GetConversionStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const job = await getJob(params.data.id);
  if (!job) {
    res.status(404).json({ error: "Job not found or expired" });
    return;
  }
  const categories = new Map<string, { count: number; sizeBytes: number }>();
  for (const file of job.files) {
    const stats = categories.get(file.category) ?? { count: 0, sizeBytes: 0 };
    stats.count++;
    stats.sizeBytes += file.size;
    categories.set(file.category, stats);
  }
  res.json({
    jobId: job.id, totalFiles: job.totalFiles, totalSizeBytes: job.totalSizeBytes,
    byCategory: Array.from(categories, ([category, stats]) => ({ category, ...stats })),
  });
});

router.get("/conversions/:id/files/search", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const q = String(req.query.q ?? "").toLowerCase().trim();
  const job = await getJob(id);
  if (!job) { res.status(404).json({ error: "Job not found or expired" }); return; }
  res.json(q ? job.files.filter((f) => f.path.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) : job.files);
});

router.get("/conversions/:id/download", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getJob(id);
  if (!existing) { res.status(404).json({ error: "Job not found or expired" }); return; }
  if (existing.status !== "done") { res.status(400).json({ error: "Conversion not complete yet" }); return; }
  const job = await consumeDownloadRequest(id);
  if (!job) { res.status(429).json({ error: "Download limit reached" }); return; }

  const safeName = new URL(job.url).hostname.replace(/[^a-z0-9.-]/gi, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (error: Error) => {
    console.error("Archive error", { error, jobId: id });
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);
  for (const file of job.files) {
    const asset = await fetch(file.blobUrl);
    if (!asset.ok) throw new Error(`Stored asset unavailable: ${file.path}`);
    archive.append(Buffer.from(await asset.arrayBuffer()), { name: file.path });
  }
  archive.append("# Netlify SPA routing\n/* /index.html 200\n", { name: "_redirects" });
  archive.append(JSON.stringify({ rewrites: [{ source: "/((?!_next|assets).*)", destination: "/index.html" }] }, null, 2), { name: "vercel.json" });
  await archive.finalize();
});

router.get("/preview/:id/{*splat}", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const splat = req.params.splat ?? "";
  const requestedPath = (Array.isArray(splat) ? splat.join("/") : splat) || "index.html";
  const job = await getJob(id);
  if (!job) { res.status(404).send("Job not found or expired"); return; }
  const safePath = requestedPath.split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  const file = job.files.find((entry) => entry.path === safePath) ??
    job.files.find((entry) => entry.path === `${safePath}.html`);
  if (!file) { res.status(404).send("File not found"); return; }
  const response = await fetch(file.blobUrl);
  if (!response.ok) { res.status(502).send("Stored preview file unavailable"); return; }
  const contentType = file.mimeType || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  if (contentType.includes("text/html") || file.path.endsWith(".html")) {
    const html = await response.text();
    const previewBase = `/api/preview/${id}`;
    const shim = `<script>(function(){var base='${previewBase}';function rewrite(u){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith(base)&&!u.startsWith('//'))return base+u;return u;}var f=window.fetch;window.fetch=function(u,o){return f.call(this,rewrite(u),o);};var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return x.apply(this,[m,rewrite(u)].concat(Array.prototype.slice.call(arguments,2)));};})();</script>`;
    res.send(html.includes("</head>") ? html.replace("</head>", shim + "</head>") : shim + html);
    return;
  }
  res.send(Buffer.from(await response.arrayBuffer()));
});

router.get("/preview/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.redirect(`/api/preview/${id}/`);
});

export default router;
