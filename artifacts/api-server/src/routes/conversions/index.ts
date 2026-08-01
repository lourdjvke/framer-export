import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { ZipArchive } from "archiver";
import { createJob, getJob, listJobs, updateJob } from "../../lib/jobStore.js";
import { startScrapeJob, getJobDir } from "../../lib/scraper.js";
import {
  StartConversionBody,
  GetConversionParams,
  GetConversionStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// List recent jobs
router.get("/conversions", async (_req, res): Promise<void> => {
  const jobs = listJobs();
  res.json(jobs);
});

// Start a new conversion
router.post("/conversions", async (req, res): Promise<void> => {
  const parsed = StartConversionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let { url } = parsed.data;

  // Normalise URL
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    url = u.href;
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const job = createJob(url);

  // Fire-and-forget scraping
  startScrapeJob(job.id, url).catch((err) => {
    req.log.error({ err, jobId: job.id }, "Scrape job failed");
    updateJob(job.id, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  });

  res.status(201).json(job);
});

// Get job status
router.get("/conversions/:id", async (req, res): Promise<void> => {
  const params = GetConversionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = getJob(params.data.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

// Get stats breakdown
router.get("/conversions/:id/stats", async (req, res): Promise<void> => {
  const params = GetConversionStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const job = getJob(params.data.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const catMap = new Map<string, { count: number; sizeBytes: number }>();
  for (const file of job.files) {
    const existing = catMap.get(file.category) ?? { count: 0, sizeBytes: 0 };
    existing.count++;
    existing.sizeBytes += file.size;
    catMap.set(file.category, existing);
  }

  const byCategory = Array.from(catMap.entries()).map(([category, stats]) => ({
    category,
    count: stats.count,
    sizeBytes: stats.sizeBytes,
  }));

  res.json({
    jobId: job.id,
    totalFiles: job.totalFiles,
    totalSizeBytes: job.totalSizeBytes,
    byCategory,
  });
});

// Search files within a job
router.get("/conversions/:id/files/search", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const q = String(req.query.q ?? "").toLowerCase().trim();
  const job = getJob(id);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  const results = q
    ? job.files.filter((f) => f.path.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
    : job.files;
  res.json(results);
});

// Download ZIP
router.get("/conversions/:id/download", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "done") {
    res.status(400).json({ error: "Conversion not complete yet" });
    return;
  }

  const jobDir = getJobDir(id);
  if (!fs.existsSync(jobDir)) {
    res.status(404).json({ error: "Files not found" });
    return;
  }

  const safeName = new URL(job.url).hostname.replace(/[^a-z0-9.-]/gi, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (err: Error) => {
    req.log.error({ err }, "Archive error");
    if (!res.headersSent) res.status(500).end();
  });

  archive.pipe(res);
  archive.directory(jobDir, false);
  await archive.finalize();
});

// Serve preview files
router.get("/preview/:id/{*splat}", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const splat = req.params.splat ?? "";
  const filePath = Array.isArray(splat) ? splat.join("/") : splat;

  const job = getJob(id);
  if (!job) {
    res.status(404).send("Job not found");
    return;
  }

  const jobDir = getJobDir(id);
  const requestedPath = filePath || "index.html";
  let fullPath = path.join(jobDir, requestedPath);

  // Prevent path traversal
  if (!fullPath.startsWith(jobDir)) {
    res.status(400).send("Bad path");
    return;
  }

  // If directory, serve index.html
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    fullPath = path.join(fullPath, "index.html");
  }

  if (!fs.existsSync(fullPath)) {
    // Try fully-decoded variant (handles %20, double-encoding, etc.)
    const tryDecode = (s: string): string => {
      let prev = s;
      for (let i = 0; i < 4; i++) {
        try { const next = decodeURIComponent(prev); if (next === prev) break; prev = next; } catch { break; }
      }
      return prev;
    };
    const decodedRequested = tryDecode(requestedPath);
    const decodedPath = path.join(jobDir, decodedRequested);
    if (decodedPath.startsWith(jobDir) && fs.existsSync(decodedPath)) {
      fullPath = decodedPath;
    } else if (decodedPath.startsWith(jobDir) && fs.existsSync(decodedPath) && fs.statSync(decodedPath).isDirectory?.() && fs.existsSync(path.join(decodedPath, "index.html"))) {
      fullPath = path.join(decodedPath, "index.html");
    } else if (fs.existsSync(fullPath + ".html")) {
      // Try appending .html for extensionless page routes
      fullPath = fullPath + ".html";
    } else if (fs.existsSync(decodedPath + ".html")) {
      fullPath = decodedPath + ".html";
    } else {
      res.status(404).send("File not found: " + requestedPath);
      return;
    }
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".html" || ext === "") {
    // Inject path-rewrite shim so root-relative JS/fetch calls resolve under the preview base
    const html = fs.readFileSync(fullPath, "utf-8");
    const previewBase = `/api/preview/${id}`;
    const shim = `<script>
(function(){
  var base = '${previewBase}';
  function rewrite(u){
    if(typeof u==='string' && u.startsWith('/') && !u.startsWith(base) && !u.startsWith('//')){
      return base + u;
    }
    return u;
  }
  var _fetch = window.fetch;
  window.fetch = function(u, opts){ return _fetch.call(this, rewrite(u), opts); };
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ return _open.apply(this, [m, rewrite(u)].concat(Array.prototype.slice.call(arguments,2))); };
  var _pushState = history.pushState;
  var _replaceState = history.replaceState;
})();
</script>`;
    const patched = html.replace("</head>", shim + "\n</head>");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(patched);
    return;
  }

  res.sendFile(fullPath);
});

// Handle root preview redirect
router.get("/preview/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.redirect(`/api/preview/${id}/`);
});

export default router;
