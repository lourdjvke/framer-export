import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { updateJob, addFile, type FileCategory } from "./jobStore.js";
import { logger } from "./logger.js";

const JOBS_DIR = "/tmp/framer-jobs";
const MAX_CONCURRENT = 8;
const MAX_PAGES = 20;
const TIMEOUT_MS = 20000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

export function getJobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

function mimeToCategory(mimeType: string): FileCategory {
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("css")) return "css";
  if (mimeType.includes("javascript") || mimeType.includes("ecmascript")) return "js";
  if (mimeType.includes("video")) return "video";
  if (mimeType.includes("image") || mimeType.includes("svg")) return "image";
  if (
    mimeType.includes("font") ||
    mimeType.includes("woff") ||
    mimeType.includes("ttf") ||
    mimeType.includes("otf")
  )
    return "font";
  if (mimeType.includes("json")) return "json";
  return "other";
}

/** Map actual Content-Type to the correct file extension so Framer's disguised avif/webp files get the right ext. */
const MIME_TO_EXT: Record<string, string> = {
  "image/avif": ".avif",
  "image/webp": ".webp",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "application/javascript": ".js",
  "text/javascript": ".js",
  "application/x-javascript": ".mjs",
  "text/css": ".css",
  "text/html": ".html",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
};

/** If the actual mime type implies a different extension than what the URL had, return the corrected path. */
function correctExtension(localPath: string, mimeType: string): string {
  const correctExt = MIME_TO_EXT[mimeType];
  if (!correctExt) return localPath;
  const currentExt = path.extname(localPath).toLowerCase();
  if (currentExt === correctExt) return localPath;
  // Only rename image/video types — JS/CSS/HTML extensions come from the URL intentionally
  const isMedia = mimeType.startsWith("image/") || mimeType.startsWith("video/");
  if (!isMedia) return localPath;
  return localPath.slice(0, localPath.length - currentExt.length) + correctExt;
}

function extToCategory(ext: string): FileCategory {
  const e = ext.toLowerCase();
  if ([".html", ".htm"].includes(e)) return "html";
  if (e === ".css") return "css";
  if ([".js", ".mjs", ".cjs"].includes(e)) return "js";
  if ([".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv", ".m4v"].includes(e)) return "video";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".ico", ".bmp"].includes(e))
    return "image";
  if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(e)) return "font";
  if (e === ".json") return "json";
  return "other";
}

interface ScrapeContext {
  baseUrl: URL;
  cdnMap: Map<string, string>;         // absUrl → localPath
  cdnBasenameUsed: Map<string, string>; // candidateName → first URL (per-job, avoids collisions)
}

/** Fully decode a percent-encoded string, handling double/triple-encoding */
function fullyDecode(s: string): string {
  let prev = s;
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(prev);
      if (next === prev) break;
      prev = next;
    } catch {
      break;
    }
  }
  return prev;
}

/** Sanitise a filename stem so it is safe on all OSes and round-trips through URLs cleanly */
function sanitiseStem(stem: string): string {
  return (
    stem
      .replace(/[^a-zA-Z0-9._\-]/g, "_") // replace unsafe chars
      .replace(/__+/g, "_")               // collapse runs of _
      .replace(/^_+|_+$/g, "")           // trim leading/trailing _
      .slice(0, 100) || "asset"
  );
}

function urlToLocalPath(urlStr: string, ctx: ScrapeContext): string {
  const { baseUrl, cdnMap, cdnBasenameUsed } = ctx;
  try {
    const u = new URL(urlStr, baseUrl);
    if (u.hostname === baseUrl.hostname) {
      // Same-origin: use fully-decoded path (strip leading slash)
      const decoded = fullyDecode(u.pathname);
      const p = decoded.replace(/^\//, "");
      return p || "index.html";
    } else {
      // External CDN — preserve original basename. Framer already content-hashes filenames.
      if (cdnMap.has(urlStr)) return cdnMap.get(urlStr)!;

      // Fully decode the pathname so filenames on disk never contain %20 etc.
      const decodedPathname = fullyDecode(u.pathname);
      const rawBasename = path.basename(decodedPathname);
      const ext = path.extname(rawBasename);
      const stem = sanitiseStem(path.basename(rawBasename, ext));
      const candidateName = `${stem}${ext}`;

      let localPath: string;
      const existing = cdnBasenameUsed.get(candidateName);
      if (!existing || existing === urlStr) {
        localPath = `assets/cdn/${candidateName}`;
        cdnBasenameUsed.set(candidateName, urlStr);
      } else {
        // Collision — add a short hash to differentiate
        const hash = crypto.createHash("md5").update(urlStr).digest("hex").slice(0, 8);
        localPath = `assets/cdn/${stem}-${hash}${ext}`;
      }
      cdnMap.set(urlStr, localPath);
      return localPath;
    }
  } catch {
    const hash = crypto.createHash("md5").update(urlStr).digest("hex").slice(0, 8);
    return `assets/unknown/${hash}`;
  }
}

function makeRelative(fromFilePath: string, toFilePath: string): string {
  const fromDir = path.dirname(fromFilePath);
  return path.relative(fromDir, toFilePath).replace(/\\/g, "/");
}

async function fetchWithRetry(
  url: string,
  retries = 2,
): Promise<{ data: Buffer; mimeType: string; status: number }> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: TIMEOUT_MS,
        headers: BROWSER_HEADERS,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      });
      const ct = String(res.headers["content-type"] || "application/octet-stream");
      const mimeType = ct.split(";")[0].trim();
      return { data: Buffer.from(res.data), mimeType, status: res.status };
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error("fetch failed");
}

function extractUrlsFromHtml(html: string, baseUrl: URL): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  const push = (u: string | undefined) => {
    if (u && !u.startsWith("data:") && !u.startsWith("#")) urls.push(u);
  };

  $('link[rel="stylesheet"], link[rel="preload"][as="style"]').each((_, el) =>
    push($(el).attr("href")),
  );
  $("script[src]").each((_, el) => push($(el).attr("src")));
  $('link[rel="preload"], link[rel="modulepreload"]').each((_, el) => push($(el).attr("href")));
  $('link[rel~="icon"], link[rel~="apple-touch-icon"]').each((_, el) =>
    push($(el).attr("href")),
  );
  $("img[src]").each((_, el) => push($(el).attr("src")));
  $("video[src]").each((_, el) => push($(el).attr("src")));
  $("source").each((_, el) => {
    push($(el).attr("src"));
    const srcset = $(el).attr("srcset") || "";
    srcset.split(",").forEach((part) => push(part.trim().split(/\s+/)[0]));
  });
  $("img[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset") || "";
    srcset.split(",").forEach((part) => push(part.trim().split(/\s+/)[0]));
  });
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) =>
    push($(el).attr("content")),
  );

  // Scan inline scripts for framerusercontent CDN URLs and /_next/ paths
  $("script:not([src])").each((_, el) => {
    const text = $(el).html() || "";
    for (const m of text.matchAll(/["'](https:\/\/framerusercontent\.com\/[^"'?#\s]+)["']/g)) {
      push(m[1]);
    }
    for (const m of text.matchAll(/["'](\/_next\/static\/[^"'?#]+)["']/g)) {
      push(m[1]);
    }
    // Framer sites CDN base URL pattern
    for (const m of text.matchAll(/["'](https:\/\/[a-z0-9]+\.framer\.website\/[^"'?#\s]+)["']/g)) {
      push(m[1]);
    }
  });

  return urls;
}

function extractUrlsFromCss(css: string): string[] {
  const urls: string[] = [];
  for (const m of css.matchAll(/url\(\s*['"]?([^'")?\s]+)['"]?\s*\)/g)) {
    if (m[1] && !m[1].startsWith("data:") && !m[1].startsWith("#")) urls.push(m[1]);
  }
  for (const m of css.matchAll(/@import\s+(?:url\(\s*['"]?)?([^'");\s]+)(?:['"]?\s*\))?/g)) {
    if (m[1] && !m[1].startsWith("data:")) urls.push(m[1]);
  }
  return urls;
}

/** Extract module specifiers from ES module JS files */
function extractUrlsFromJs(js: string): string[] {
  const urls: string[] = [];
  // static import/export from '...' and import('...')
  for (const m of js.matchAll(
    /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
  )) {
    if (m[1] && !m[1].startsWith("node:")) urls.push(m[1]);
  }
  for (const m of js.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1]) urls.push(m[1]);
  }
  // Also grab any framerusercontent URLs embedded in JS
  for (const m of js.matchAll(/["'](https:\/\/framerusercontent\.com\/[^"'?#\s]+)["']/g)) {
    urls.push(m[1]);
  }
  return urls;
}

function extractInternalLinks(html: string, baseUrl: URL): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, baseUrl);
      if (u.hostname === baseUrl.hostname && !u.pathname.includes(".")) {
        links.push(u.href);
      }
    } catch {
      /* ignore */
    }
  });
  return links;
}

function rewriteHtmlUrls(
  html: string,
  localPath: string,
  baseUrl: URL,
  urlToLocal: (u: string) => string,
): string {
  const $ = cheerio.load(html, { xmlMode: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rewriteAttr = (el: any, attr: string) => {
    const val = $(el).attr(attr);
    if (
      !val ||
      val.startsWith("data:") ||
      val.startsWith("#") ||
      val.startsWith("javascript:")
    )
      return;
    try {
      const abs = new URL(val, baseUrl).href;
      const lp = urlToLocal(abs);
      const rel = makeRelative(localPath, lp);
      $(el).attr(attr, rel);
    } catch {
      /* ignore */
    }
  };

  $("link[href]").each((_, el) => rewriteAttr(el, "href"));
  $("script[src]").each((_, el) => rewriteAttr(el, "src"));
  $("img[src]").each((_, el) => rewriteAttr(el, "src"));
  $("source[src]").each((_, el) => rewriteAttr(el, "src"));
  $("video[src]").each((_, el) => rewriteAttr(el, "src"));

  $("img[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset") || "";
    const rewritten = srcset.split(",").map((part) => {
      const pieces = part.trim().split(/\s+/);
      const u = pieces[0];
      if (!u || u.startsWith("data:")) return part;
      try {
        const abs = new URL(u, baseUrl).href;
        const lp = urlToLocal(abs);
        pieces[0] = makeRelative(localPath, lp);
        return pieces.join(" ");
      } catch {
        return part;
      }
    });
    $(el).attr("srcset", rewritten.join(", "));
  });

  $("base").remove();
  return $.html();
}

function rewriteCssUrls(
  css: string,
  localPath: string,
  baseUrl: URL,
  urlToLocal: (u: string) => string,
): string {
  let result = css.replace(/url\(\s*(['"]?)([^'")?\s]+)\1\s*\)/g, (match, quote, u) => {
    if (u.startsWith("data:") || u.startsWith("#")) return match;
    try {
      const abs = new URL(u, baseUrl).href;
      const lp = urlToLocal(abs);
      return `url(${quote}${makeRelative(localPath, lp)}${quote})`;
    } catch {
      return match;
    }
  });
  result = result.replace(
    /@import\s+url\(\s*(['"]?)([^'");\s]+)\1\s*\)/g,
    (match, quote, u) => {
      if (u.startsWith("data:")) return match;
      try {
        const abs = new URL(u, baseUrl).href;
        const lp = urlToLocal(abs);
        return `@import url(${quote}${makeRelative(localPath, lp)}${quote})`;
      } catch {
        return match;
      }
    },
  );
  result = result.replace(/@import\s+(['"])([^'";\s]+)\1/g, (match, quote, u) => {
    if (u.startsWith("data:")) return match;
    try {
      const abs = new URL(u, baseUrl).href;
      const lp = urlToLocal(abs);
      return `@import ${quote}${makeRelative(localPath, lp)}${quote}`;
    } catch {
      return match;
    }
  });
  return result;
}

/**
 * Rewrite ES module import/export specifiers in JS files.
 * Handles: import '...' | import x from '...' | export from '...' | import('...')
 */
function rewriteJsImports(
  js: string,
  localPath: string,
  baseUrl: URL,
  urlToLocal: (u: string) => string,
): string {
  const rewriteSpecifier = (specifier: string): string => {
    if (
      specifier.startsWith("node:") ||
      specifier.startsWith("https://") ||
      specifier.startsWith("http://") ||
      specifier.startsWith("//")
    ) {
      // Absolute URL in import — resolve and rewrite
      if (specifier.startsWith("http://") || specifier.startsWith("https://")) {
        try {
          const lp = urlToLocal(specifier);
          return makeRelative(localPath, lp);
        } catch {
          return specifier;
        }
      }
      return specifier;
    }
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      // Bare specifier (e.g. 'react') — leave as-is
      return specifier;
    }
    try {
      const abs = new URL(specifier, baseUrl).href;
      const lp = urlToLocal(abs);
      const rel = makeRelative(localPath, lp);
      // Ensure relative path starts with ./
      return rel.startsWith(".") ? rel : "./" + rel;
    } catch {
      return specifier;
    }
  };

  // static: import ... from '...' / export ... from '...' / import '...'
  let result = js.replace(
    /((?:import|export)\s+(?:(?:\*\s+as\s+\w+|\{[^}]*\}|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*)\s+from\s+|(?:type\s+)?))(['"])([^'"]+)\2/g,
    (match, prefix, quote, specifier) => {
      return `${prefix}${quote}${rewriteSpecifier(specifier)}${quote}`;
    },
  );

  // dynamic: import('...')
  result = result.replace(/import\(\s*(['"])([^'"]+)\1\s*\)/g, (match, quote, specifier) => {
    return `import(${quote}${rewriteSpecifier(specifier)}${quote})`;
  });

  return result;
}

async function runQueue(
  tasks: (() => Promise<void>)[],
  concurrency: number,
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      await task();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length || 1) }, () => worker()),
  );
}

export async function startScrapeJob(jobId: string, siteUrl: string): Promise<void> {
  const jobDir = getJobDir(jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const ctx: ScrapeContext = {
    baseUrl: new URL(siteUrl),
    cdnMap: new Map(),
    cdnBasenameUsed: new Map(),
  };

  const urlToLocal = (u: string) => urlToLocalPath(u, ctx);
  const downloaded = new Set<string>();

  const saveFile = async (
    localPath: string,
    data: Buffer,
    mimeType: string,
    originalUrl: string,
  ): Promise<void> => {
    const fullPath = path.join(jobDir, localPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
    const category =
      mimeToCategory(mimeType) === "other"
        ? extToCategory(path.extname(localPath))
        : mimeToCategory(mimeType);
    addFile(jobId, { path: localPath, originalUrl, size: data.length, mimeType, category });
  };

  updateJob(jobId, { status: "crawling", progress: 5, message: "Fetching site…" });

  const urlQueue: string[] = [];
  const pagesVisited = new Set<string>();

  const processPage = async (pageUrl: string): Promise<void> => {
    if (pagesVisited.has(pageUrl) || pagesVisited.size >= MAX_PAGES) return;
    pagesVisited.add(pageUrl);

    try {
      const { data, mimeType, status } = await fetchWithRetry(pageUrl);
      if (status >= 400) return;

      const pageUrlObj = new URL(pageUrl);
      const isRoot = pageUrlObj.pathname === "/" || pageUrlObj.pathname === "";
      const localPath = isRoot
        ? "index.html"
        : pageUrlObj.pathname.replace(/^\//, "").replace(/\/$/, "") +
          (pageUrlObj.pathname.endsWith("/") ? "/index.html" : ".html");

      const html = data.toString("utf-8");
      extractUrlsFromHtml(html, pageUrlObj).forEach((u) => {
        try {
          const abs = new URL(u, pageUrlObj).href;
          if (!downloaded.has(abs)) urlQueue.push(abs);
        } catch {
          /* ignore */
        }
      });
      extractInternalLinks(html, ctx.baseUrl).forEach((link) => {
        if (!pagesVisited.has(link)) urlQueue.push(`__PAGE__${link}`);
      });

      const rewritten = rewriteHtmlUrls(html, localPath, pageUrlObj, urlToLocal);
      await saveFile(localPath, Buffer.from(rewritten, "utf-8"), mimeType, pageUrl);
    } catch (err) {
      logger.warn({ err, pageUrl }, "Failed to fetch page");
    }
  };

  await processPage(siteUrl);

  updateJob(jobId, {
    status: "downloading",
    progress: 15,
    message: `Found ${urlQueue.length} assets, downloading…`,
  });

  let processed = 0;

  const downloadAsset = async (rawUrl: string): Promise<void> => {
    if (rawUrl.startsWith("__PAGE__")) {
      await processPage(rawUrl.slice("__PAGE__".length));
      return;
    }

    let absUrl: string;
    try {
      absUrl = new URL(rawUrl).href;
    } catch {
      return;
    }

    if (downloaded.has(absUrl)) return;
    downloaded.add(absUrl);

    let localPath = urlToLocal(absUrl);
    if (!localPath) return;

    try {
      const { data, mimeType, status } = await fetchWithRetry(absUrl);
      if (status >= 400) return;

      // Fix extension when Framer serves avif/webp behind a .jpg/.png URL
      const corrected = correctExtension(localPath, mimeType);
      if (corrected !== localPath) {
        // Update cdnMap so HTML/CSS url-rewriting uses the corrected name
        ctx.cdnMap.set(absUrl, corrected);
        localPath = corrected;
      }

      const ext = path.extname(localPath).toLowerCase();
      let finalData = data;

      if (mimeType.includes("css") || ext === ".css") {
        const cssText = data.toString("utf-8");
        extractUrlsFromCss(cssText).forEach((u) => {
          try {
            const abs = new URL(u, absUrl).href;
            if (!downloaded.has(abs)) urlQueue.push(abs);
          } catch {
            /* ignore */
          }
        });
        finalData = Buffer.from(
          rewriteCssUrls(cssText, localPath, new URL(absUrl), urlToLocal),
          "utf-8",
        );
      } else if (
        mimeType.includes("javascript") ||
        mimeType.includes("ecmascript") ||
        ext === ".js" ||
        ext === ".mjs" ||
        ext === ".cjs"
      ) {
        // Rewrite ES module imports and discover more assets
        const jsText = data.toString("utf-8");
        extractUrlsFromJs(jsText).forEach((u) => {
          try {
            const abs = new URL(u, absUrl).href;
            if (!downloaded.has(abs)) urlQueue.push(abs);
          } catch {
            /* ignore */
          }
        });
        finalData = Buffer.from(
          rewriteJsImports(jsText, localPath, new URL(absUrl), urlToLocal),
          "utf-8",
        );
      }

      await saveFile(localPath, finalData, mimeType, absUrl);
    } catch (err) {
      logger.debug({ err, absUrl }, "Failed to download asset");
    } finally {
      processed++;
      const progress = Math.min(
        90,
        15 + Math.floor((processed / Math.max(urlQueue.length, 1)) * 75),
      );
      updateJob(jobId, {
        progress,
        message: `Downloading… (${processed}/${urlQueue.length})`,
      });
    }
  };

  // Dynamic queue — new items are pushed during processing
  let queueIdx = 0;
  while (queueIdx < urlQueue.length) {
    const batch = urlQueue.slice(queueIdx, queueIdx + MAX_CONCURRENT * 4);
    queueIdx += batch.length;
    await runQueue(
      batch.map((u) => () => downloadAsset(u)),
      MAX_CONCURRENT,
    );
  }

  updateJob(jobId, { status: "processing", progress: 92, message: "Finalising output…" });

  // Write static-host routing configs so the downloaded ZIP works on Netlify/Vercel/etc.
  // These are not included in the preview file list (they're hosting metadata, not site files).
  const netlifyRedirects = `# Netlify SPA routing\n/* /index.html 200\n`;
  fs.writeFileSync(path.join(jobDir, "_redirects"), netlifyRedirects, "utf-8");

  const vercelJson = JSON.stringify(
    { rewrites: [{ source: "/((?!_next|assets).*)", destination: "/index.html" }] },
    null,
    2,
  );
  fs.writeFileSync(path.join(jobDir, "vercel.json"), vercelJson, "utf-8");

  updateJob(jobId, {
    status: "done",
    progress: 100,
    message: "Conversion complete",
    previewPath: `/api/preview/${jobId}/`,
    downloadPath: `/api/conversions/${jobId}/download`,
    completedAt: new Date().toISOString(),
  });
}
