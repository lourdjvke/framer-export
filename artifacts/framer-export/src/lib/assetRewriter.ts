/**
 * Utilities for rewriting a local HTML project's asset references to Blob URLs,
 * so the project can be loaded in a sandboxed srcDoc iframe without losing CSS,
 * images, fonts, or scripts.
 */

export type BlobUrlMap = Map<string, string>; // normalized relative path → blob: URL

// ─── MIME type ────────────────────────────────────────────────────────────────

export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    cjs: "application/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    txt: "text/plain",
    xml: "application/xml",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Returns true for paths that are local (not http, data:, blob:, //, #, etc). */
export function isLocalRef(url: string): boolean {
  const s = (url ?? "").trim();
  return (
    s !== "" &&
    !s.startsWith("http://") &&
    !s.startsWith("https://") &&
    !s.startsWith("data:") &&
    !s.startsWith("blob:") &&
    !s.startsWith("//") &&
    !s.startsWith("#") &&
    !s.startsWith("javascript:")
  );
}

/**
 * Resolve `rel` relative to `base` (both are slash-separated relative paths,
 * e.g. base="pages/about.html", rel="../css/style.css").
 */
export function resolvePath(base: string, rel: string): string {
  let r = rel.trim();
  // Absolute-from-root → treat as root-relative
  if (r.startsWith("/")) return r.replace(/^\/+/, "");
  // Strip leading ./
  if (r.startsWith("./")) r = r.slice(2);

  const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
  const combined = baseDir + r;

  // Collapse ../ and ./ segments
  const parts = combined.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") {
      if (out.length > 0) out.pop();
    } else if (p !== ".") {
      out.push(p);
    }
  }
  return out.join("/");
}

// ─── CSS url() rewriting ──────────────────────────────────────────────────────

/** Replace every url(...) in `css` with the corresponding blob: URL. */
export function rewriteCssUrls(
  css: string,
  blobUrls: BlobUrlMap,
  cssPath: string
): string {
  return css.replace(/url\((['"]?)([^'")\s]+)\1\)/g, (match, quote, url) => {
    if (!isLocalRef(url)) return match;
    const resolved = resolvePath(cssPath, url);
    const blob = blobUrls.get(resolved) ?? blobUrls.get(url);
    return blob ? `url(${quote}${blob}${quote})` : match;
  });
}

// ─── HTML rewriting ───────────────────────────────────────────────────────────

/**
 * Parse `htmlContent`, rewrite all local asset references to blob: URLs, and
 * inline CSS files as <style> tags so font/image url() refs inside them also resolve.
 *
 * @param htmlContent  Raw HTML string
 * @param blobUrls     Map of normalized path → blob: URL (for binary assets & scripts)
 * @param cssContents  Map of normalized path → CSS text (for stylesheet inlining)
 * @param htmlPath     The file's own relative path (e.g. "index.html", "pages/about.html")
 */
export function rewriteHtmlAssets(
  htmlContent: string,
  blobUrls: BlobUrlMap,
  cssContents: Map<string, string>,
  htmlPath: string
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");

  // Helper: look up a blob URL for an attribute value
  function blobFor(ref: string): string | undefined {
    const resolved = resolvePath(htmlPath, ref);
    return blobUrls.get(resolved) ?? blobUrls.get(ref);
  }

  // Helper: rewrite a single attribute in-place
  function rewriteAttr(el: Element, attr: string) {
    const val = el.getAttribute(attr);
    if (val && isLocalRef(val)) {
      const blob = blobFor(val);
      if (blob) el.setAttribute(attr, blob);
    }
  }

  // ── <link rel="stylesheet"> — inline CSS so internal url() refs also work ──
  doc.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]').forEach((linkEl) => {
    const href = linkEl.getAttribute("href");
    if (!href || !isLocalRef(href)) return;
    const resolvedPath = resolvePath(htmlPath, href);
    const cssText = cssContents.get(resolvedPath) ?? cssContents.get(href);
    if (cssText !== undefined) {
      // Rewrite url() inside the CSS, then inline it
      const rewritten = rewriteCssUrls(cssText, blobUrls, resolvedPath);
      const styleEl = doc.createElement("style");
      styleEl.setAttribute("data-src", href); // preserve origin for debugging
      styleEl.textContent = rewritten;
      linkEl.replaceWith(styleEl);
    } else {
      // No text available; fall back to blob URL (url() refs inside won't work)
      rewriteAttr(linkEl, "href");
    }
  });

  // ── <script src> ───────────────────────────────────────────────────────────
  doc.querySelectorAll("script[src]").forEach((el) => rewriteAttr(el, "src"));

  // ── Media/image src ────────────────────────────────────────────────────────
  doc.querySelectorAll("img[src], video[src], audio[src], source[src], track[src]").forEach((el) =>
    rewriteAttr(el, "src")
  );
  doc.querySelectorAll("video[poster]").forEach((el) => rewriteAttr(el, "poster"));
  doc.querySelectorAll("input[src]").forEach((el) => rewriteAttr(el, "src")); // <input type=image>

  // ── Inline <style> url() ───────────────────────────────────────────────────
  doc.querySelectorAll("style").forEach((styleEl) => {
    const text = styleEl.textContent ?? "";
    if (text.includes("url(")) {
      styleEl.textContent = rewriteCssUrls(text, blobUrls, htmlPath);
    }
  });

  // ── Inline style attribute url() ──────────────────────────────────────────
  doc.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style")!;
    if (style.includes("url(")) {
      el.setAttribute("style", rewriteCssUrls(style, blobUrls, htmlPath));
    }
  });

  return doc.documentElement.outerHTML;
}

// ─── File type helpers ────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "json", "txt", "xml", "svg",
]);

export function isTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

export function isCssFile(filename: string): boolean {
  return filename.split(".").pop()?.toLowerCase() === "css";
}

export function isHtmlFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ext === "html" || ext === "htm";
}
