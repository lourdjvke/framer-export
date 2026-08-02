import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MousePointer2, Hand, Sparkles, MessageSquare, Pencil, Maximize2,
  Github, LogOut, ChevronDown, Globe, Link, Plus, Zap,
  LayoutTemplate, BookOpen, Layers, AlertTriangle, FileCode2,
  Download, Loader2, FileText, Image, File,
} from "lucide-react";
import {
  getMimeType, isTextFile, isCssFile, isHtmlFile,
  rewriteHtmlAssets, rewriteCssUrls,
  type BlobUrlMap,
} from "@/lib/assetRewriter";
import { useAuth } from "@/contexts/AuthContext";
import { AuthOverlay } from "@/components/auth/AuthOverlay";
import { GithubCredentialsModal } from "@/components/auth/GithubCredentialsModal";
import { ProjectNameModal } from "@/components/editor/ProjectNameModal";
import { ElementInspector } from "@/components/editor/ElementInspector";
import { TemplateGallery } from "@/components/editor/TemplateGallery";
import type { Template } from "@/components/editor/TemplateGallery";
import { GithubSync } from "@/components/editor/GithubSync";
import { watchPoints, adjustPoints, canAfford, POINTS } from "@/lib/points";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppStage =
  | "auth"          // Not logged in
  | "github-creds"  // Post-login: collect GitHub creds
  | "project-name"  // Name the project
  | "editor";       // Main editor

type Tool = "pan" | "cursor" | "chat" | "draw" | "edit" | "generate";
type RightTab = "templates" | "inspiration" | "files";
type ViewMode = "design" | "preview";

interface HistoryEntry {
  id: string;
  summary: string;
  time: number;
}

/** A file from a Framer (api-server) conversion job. */
interface FramerFile {
  path: string;
  size: number;
  category: string;
}

/** A file from a local device import. */
interface DeviceFile {
  path: string;
  content: string;
  size: number;
}

type FramerJobStatus = "pending" | "crawling" | "downloading" | "processing" | "done" | "error";

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  onClose,
  projectName,
}: {
  onClose: () => void;
  projectName: string;
}) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setHistory((h) => [
      ...h,
      { id: crypto.randomUUID(), summary: message, time: Date.now() },
    ]);
    setMessage("");
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute bottom-20 left-4 w-80 z-40 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col"
      style={{ maxHeight: "60vh" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-700">Chat — {projectName}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {history.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No messages yet. Describe what you'd like to change.
          </p>
        ) : (
          history.map((h) => (
            <div key={h.id} className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
              <p className="text-xs text-gray-800">{h.summary}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(h.time).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-gray-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you want to design…"
            className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="bg-gray-900 text-white rounded-xl px-3 py-2 text-xs disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            ↑
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Framer Loading Placeholder ───────────────────────────────────────────────

function FramerLoadingView({ status, url }: { status: FramerJobStatus; url: string }) {
  const labels: Record<FramerJobStatus, string> = {
    pending: "Starting import…",
    crawling: "Crawling pages…",
    downloading: "Downloading assets…",
    processing: "Processing files…",
    done: "Done!",
    error: "Import failed",
  };

  return (
    <div className="w-full h-full bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-5 px-8">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        <p className="text-sm font-medium text-white">{labels[status]}</p>
        <p className="text-xs text-gray-500 font-mono truncate max-w-xs text-center">{url}</p>
      </div>

      <div className="w-full max-w-xs">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1.5">
          {(["pending", "crawling", "downloading", "processing", "done"] as FramerJobStatus[]).map((s) => (
            <span
              key={s}
              className={status === s ? "text-teal-400 font-medium" : ""}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-teal-400 rounded-full"
            initial={{ width: "5%" }}
            animate={{
              width:
                status === "pending" ? "10%" :
                status === "crawling" ? "35%" :
                status === "downloading" ? "60%" :
                status === "processing" ? "85%" :
                status === "done" ? "100%" : "10%",
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── File Icon ────────────────────────────────────────────────────────────────

function FileIcon({ path }: { path: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html") return <FileCode2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
  if (ext === "css") return <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (ext === "js") return <FileText className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
  if (["png","jpg","jpeg","gif","svg","webp"].includes(ext)) return <Image className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  return <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { toast } = useToast();

  // Stage
  const [stage, setStage] = useState<AppStage>("auth");

  // Project
  const [projectName, setProjectName] = useState("Untitled Project");

  // srcDoc preview — used for device/template imports
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Framer job — used for Framer imports (iframe src)
  const [framerJobId, setFramerJobId] = useState<string | null>(null);
  const [framerJobStatus, setFramerJobStatus] = useState<FramerJobStatus>("pending");
  const [framerJobUrl, setFramerJobUrl] = useState("");
  const [framerFiles, setFramerFiles] = useState<FramerFile[]>([]);
  const [framerActivePath, setFramerActivePath] = useState("index.html");

  // Device project files (for multi-file imports & file tree)
  const [deviceFiles, setDeviceFiles] = useState<DeviceFile[]>([]);
  const [deviceActivePath, setDeviceActivePath] = useState("index.html");

  // Editor state
  const [tool, setTool] = useState<Tool>("pan");
  const [viewMode, setViewMode] = useState<ViewMode>("design");
  const [rightTab, setRightTab] = useState<RightTab>("templates");
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showGithubSync, setShowGithubSync] = useState(false);
  const [points, setPoints] = useState<number | null>(null);

  // Import state (pre-auth)
  const [importType, setImportType] = useState<"framer" | "device" | null>(null);
  const [pendingFramerUrl, setPendingFramerUrl] = useState<string | undefined>();
  const [pendingFiles, setPendingFiles] = useState<FileList | undefined>();

  // Iframe ref for element inspector
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Track blob URLs created during device import so we can revoke on unmount
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Whether any preview is loaded
  const hasPreview = !!(previewHtml || (framerJobId && framerJobStatus === "done"));

  // Watch points
  useEffect(() => {
    if (!user) return;
    const unsub = watchPoints(user.uid, setPoints);
    return () => unsub();
  }, [user]);

  // Auth state → stage
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStage("auth");
    } else if (stage === "auth") {
      // User already authenticated (session restore) → skip to editor
      setStage("editor");
    }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth flow ──────────────────────────────────────────────────────────────

  function handleAuthenticated(
    type: "framer" | "device" | null,
    framerUrl?: string,
    files?: FileList
  ) {
    setImportType(type);
    setPendingFramerUrl(framerUrl);
    setPendingFiles(files);
    setStage("github-creds");
  }

  function handleGithubCredsComplete() {
    setStage("project-name");
  }

  async function handleProjectName(name: string) {
    setProjectName(name);
    setStage("editor"); // advance immediately

    if (importType === "framer" && pendingFramerUrl) {
      await doFramerImport(pendingFramerUrl);
    } else if (importType === "device" && pendingFiles) {
      await doDeviceImport(pendingFiles);
    }
  }

  // ── Import handlers ────────────────────────────────────────────────────────

  async function doFramerImport(url: string) {
    if (!user) return;

    const affordable = await canAfford(user.uid, Math.abs(POINTS.IMPORT_FRAMER));
    if (!affordable) {
      toast({ title: "Not enough points", description: "Importing from Framer costs 4 points.", variant: "destructive" });
      return;
    }
    await adjustPoints(user.uid, POINTS.IMPORT_FRAMER);

    // Reset any prior device state
    setPreviewHtml(null);
    setDeviceFiles([]);
    setFramerActivePath("index.html");
    setFramerFiles([]);

    // Kick off the conversion job on the api-server
    let jobId: string;
    try {
      const res = await fetch("/api/conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const job = await res.json() as { id: string };
      jobId = job.id;
    } catch (err) {
      toast({
        title: "Framer import failed",
        description: err instanceof Error ? err.message : "Could not reach the conversion server. Make sure the API server is running.",
        variant: "destructive",
      });
      return;
    }

    setFramerJobId(jobId);
    setFramerJobUrl(url);
    setFramerJobStatus("pending");
    toast({ title: "Framer import started", description: "4 points used. Fetching your site…" });

    // Poll for job completion
    const pollInterval = setInterval(async () => {
      try {
        const sr = await fetch(`/api/conversions/${jobId}`);
        if (!sr.ok) return;
        const status = await sr.json() as {
          status: FramerJobStatus;
          files?: FramerFile[];
          errorMessage?: string;
        };

        setFramerJobStatus(status.status);

        if (status.status === "done") {
          clearInterval(pollInterval);
          setFramerFiles(status.files ?? []);
          setRightTab("files"); // auto-switch to files tab
          toast({ title: "Import complete!", description: "Your Framer site is ready to edit." });
        } else if (status.status === "error") {
          clearInterval(pollInterval);
          toast({
            title: "Import failed",
            description: status.errorMessage || "The scraper encountered an error.",
            variant: "destructive",
          });
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 2000);

    // Safety: stop polling after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 600_000);
  }

  async function doDeviceImport(files: FileList) {
    const allFiles = Array.from(files);

    // Revoke any prior blob URLs
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];

    const blobUrls: BlobUrlMap = new Map();
    const cssContents: Map<string, string> = new Map();
    const deviceFileList: DeviceFile[] = [];

    // First pass: read all files, create blob URLs for binaries, store text content
    for (const file of allFiles) {
      const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const path = rawPath.includes("/") ? rawPath.slice(rawPath.indexOf("/") + 1) : rawPath;
      const filePath = path || file.name;

      if (isTextFile(filePath)) {
        const content = await file.text();
        if (isCssFile(filePath)) {
          cssContents.set(filePath, content);
        }
        deviceFileList.push({ path: filePath, content, size: file.size });
      } else {
        // Binary asset — create a blob URL
        const buf = await file.arrayBuffer();
        const mime = getMimeType(filePath);
        const blob = new Blob([buf], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.set(filePath, blobUrl);
        blobUrlsRef.current.push(blobUrl);
        deviceFileList.push({ path: filePath, content: "", size: file.size });
      }
    }

    // Sort: index.html first, then by path
    deviceFileList.sort((a, b) => {
      if (a.path === "index.html") return -1;
      if (b.path === "index.html") return 1;
      return a.path.localeCompare(b.path);
    });

    setDeviceFiles(deviceFileList);
    setFramerJobId(null);

    // Find index.html or first html file
    const indexFile =
      deviceFileList.find((f) => f.path === "index.html") ||
      deviceFileList.find((f) => isHtmlFile(f.path));

    if (!indexFile || !indexFile.content) {
      toast({ title: "No HTML file found", description: "Please include an index.html.", variant: "destructive" });
      return;
    }

    // Rewrite asset references in the HTML to blob URLs / inlined CSS
    const processedHtml = rewriteHtmlAssets(
      indexFile.content,
      blobUrls,
      cssContents,
      indexFile.path
    );

    setDeviceActivePath(indexFile.path);
    setPreviewHtml(processedHtml);
    setRightTab("files");
  }

  // ── Current HTML getter (used by GithubSync at push-time) ─────────────────

  const getCurrentHtml = useCallback((): string => {
    // Always try to read the live DOM first — this captures any edits made in ElementInspector
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.documentElement) {
        return doc.documentElement.outerHTML;
      }
    } catch {
      // Cross-origin or not loaded yet — fall through
    }
    return previewHtml || "";
  }, [previewHtml]);

  // ── Handle HTML change from ElementInspector ───────────────────────────────
  // We intentionally do NOT update previewHtml here — doing so would reload the
  // srcDoc iframe and detach the inspected element. Instead, we always read the
  // live DOM at export/push time via getCurrentHtml().
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleHtmlChange = useCallback((_html: string) => {
    // no-op: edits stay in the live iframe DOM; serialized only on export
  }, []);

  // ── Download current project as HTML ──────────────────────────────────────

  function downloadCurrentHtml() {
    const html = getCurrentHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, "-") || "project"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Tool handlers ──────────────────────────────────────────────────────────

  function handleToolClick(t: Tool) {
    if (t === "cursor" && !hasPreview) {
      toast({ title: "No preview loaded", description: "Import a project first to use the cursor tool.", variant: "destructive" });
      return;
    }
    if (t === "chat") {
      setShowChat((v) => !v);
      return;
    }
    setTool(t);
  }

  // ── Template select ────────────────────────────────────────────────────────

  function handleTemplateSelect(template: Template) {
    setPreviewHtml(
      `<html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{height:100vh}</style></head><body>${template.previewHtml}</body></html>`
    );
    setProjectName(template.name);
    setFramerJobId(null);
    setDeviceFiles([]);
  }

  // ── Preview mode ───────────────────────────────────────────────────────────

  const isPreview = viewMode === "preview";
  const canEdit = points !== null && points >= POINTS.MIN_EDIT_BALANCE;

  // ── Loading spinner while auth resolves ───────────────────────────────────

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Stage: Auth ────────────────────────────────────────────────────────────

  if (!user || stage === "auth") {
    return <AuthOverlay onAuthenticated={handleAuthenticated} />;
  }

  if (stage === "github-creds") {
    return <GithubCredentialsModal onComplete={handleGithubCredsComplete} />;
  }

  if (stage === "project-name") {
    return <ProjectNameModal onConfirm={handleProjectName} />;
  }

  // ── Stage: Editor ─────────────────────────────────────────────────────────

  // Framer iframe src — changes when the user clicks a different HTML file in the tree
  const framerIframeSrc =
    framerJobId && framerJobStatus === "done"
      ? `/api/preview/${framerJobId}/${framerActivePath === "index.html" ? "" : framerActivePath}`
      : null;

  return (
    <div
      className="h-screen w-screen flex flex-col relative overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "#f7f7f7",
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* ── Top Navigation ── */}
      <AnimatePresence>
        {!isPreview && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-2 left-2 right-2 h-14 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl flex items-center justify-between px-3 z-50 shadow-sm"
          >
            {/* Left */}
            <div className="flex items-center gap-2">
              {/* Logo */}
              <div className="p-1.5 hover:bg-gray-100 rounded-md text-gray-700">
                <Layers className="w-5 h-5" />
              </div>

              {/* Project name */}
              <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded-md">
                <span className="font-medium text-sm text-gray-800">{projectName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </div>

              <div className="h-5 w-px bg-gray-200 mx-1" />

              {/* Design / Preview tabs */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/50">
                <button
                  onClick={() => setViewMode("design")}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${viewMode === "design" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Design
                </button>
                <button
                  onClick={() => {
                    if (!canEdit) {
                      toast({ title: "Not enough points", description: `You need at least ${POINTS.MIN_EDIT_BALANCE} points to enter Preview.`, variant: "destructive" });
                      return;
                    }
                    setViewMode("preview");
                  }}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${(viewMode as string) === "preview" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Preview
                </button>
              </div>

              <div className="h-5 w-px bg-gray-200 mx-1" />

              {/* Points meter */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-xs font-semibold text-gray-700">
                    {points !== null ? points : "—"} pts
                  </span>
                </div>
                {points !== null && points <= 3 && (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Low balance</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-1.5">
              {/* Download current HTML */}
              {hasPreview && (
                <button
                  onClick={downloadCurrentHtml}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100/80 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200/50 flex items-center gap-1.5"
                  title="Download current HTML (includes your edits)"
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              )}

              <button
                onClick={() => setShowGithubSync((v) => !v)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100/80 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200/50 flex items-center gap-1.5"
              >
                <Github className="w-4 h-4" />
                Push
              </button>

              <div className="h-5 w-px bg-gray-200 mx-0.5" />

              {/* Avatar + logout */}
              <div className="flex items-center gap-1.5">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border border-gray-200" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {(user.email || "U")[0].toUpperCase()}
                  </div>
                )}
                <button
                  onClick={logout}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowRightPanel((v) => !v)}
                className="p-1.5 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-200 transition-colors ml-1"
              >
                <LayoutTemplate className="w-4 h-4" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ── Central Canvas ── */}
      <main className="flex-1 flex overflow-hidden pt-16">
        <div className="flex-1 relative z-10 flex items-center justify-center overflow-hidden">

          {/* Canvas frame */}
          <div
            className="relative bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden rounded-lg"
            style={{
              width: isPreview ? "100vw" : "calc(100vw - 380px)",
              height: isPreview ? "100vh" : "calc(100vh - 120px)",
              maxWidth: isPreview ? "100vw" : "1200px",
              transition: "all 0.3s ease",
            }}
          >
            {/* Framer job — loading */}
            {framerJobId && framerJobStatus !== "done" && framerJobStatus !== "error" && (
              <FramerLoadingView status={framerJobStatus} url={framerJobUrl} />
            )}

            {/* Framer job — error */}
            {framerJobId && framerJobStatus === "error" && (
              <div className="w-full h-full bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <p className="text-sm font-medium">Import failed</p>
                <p className="text-xs text-gray-500">Check that the Framer link is public and try again.</p>
              </div>
            )}

            {/* Framer job — done (src iframe) */}
            {framerIframeSrc && (
              <iframe
                ref={iframeRef}
                key={framerIframeSrc} // remount on src change
                src={framerIframeSrc}
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                style={{ cursor: tool === "cursor" ? "default" : tool === "pan" ? "grab" : "default" }}
              />
            )}

            {/* Device / template import (srcDoc iframe) */}
            {previewHtml && !framerIframeSrc && (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                style={{ cursor: tool === "cursor" ? "default" : tool === "pan" ? "grab" : "default" }}
              />
            )}

            {/* Empty state */}
            {!hasPreview && !framerJobId && (
              <div className="w-full h-full bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden">
                {/* Simulated hero */}
                <div className="flex justify-between items-center p-6 px-12 border-b border-gray-800/50">
                  <div className="font-bold tracking-wider text-sm flex items-center">
                    BREACHER<span className="w-2 h-2 bg-white ml-1 inline-block" />
                  </div>
                  <div className="flex gap-6 text-xs text-gray-400 font-medium">
                    <span className="hover:text-white cursor-pointer transition-colors">DOCS</span>
                    <span className="hover:text-white cursor-pointer transition-colors">STATUS</span>
                    <span className="text-teal-400 bg-teal-900/30 px-2 py-0.5 rounded border border-teal-800/50">v1.0.0</span>
                  </div>
                </div>

                <div className="flex-1 flex px-12 py-16 items-center justify-between max-w-5xl mx-auto w-full">
                  <div className="max-w-lg">
                    <div className="inline-block border border-teal-800/50 bg-teal-900/20 text-teal-400 text-[10px] font-bold tracking-widest px-2 py-1 rounded-full mb-6">
                      • IMPORT. EDIT. PUBLISH.
                    </div>
                    <h1 className="text-5xl font-bold leading-tight mb-4">
                      Import your site.<br />
                      <span className="text-teal-400">Edit it.</span><br />
                      Push to <span className="text-gray-500">GitHub.</span>
                    </h1>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                      Import from Framer or upload your HTML folder. Inspect and edit elements visually. Push your edited version to GitHub.
                    </p>
                    <div className="flex gap-3">
                      <div className="px-5 py-2.5 text-xs text-gray-500 border border-gray-800 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        Import a project above to get started
                      </div>
                    </div>
                  </div>

                  {/* Terminal mock */}
                  <div className="w-[360px] bg-[#111] rounded-lg border border-gray-800 shadow-2xl overflow-hidden">
                    <div className="flex items-center px-4 py-3 bg-[#1a1a1a] border-b border-gray-800">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-gray-600" />
                        <div className="w-3 h-3 rounded-full bg-gray-600" />
                        <div className="w-3 h-3 rounded-full bg-gray-600" />
                      </div>
                      <div className="flex-1 text-center text-xs text-gray-500 font-mono">
                        <span className="text-teal-500 mr-1">•</span> breacher-editor
                      </div>
                    </div>
                    <div className="p-5 font-mono text-sm leading-relaxed text-gray-300">
                      <div className="text-gray-500 mb-2">$ breacher import --framer</div>
                      <div className="text-teal-400 mb-1">✓ Fetching Framer export…</div>
                      <div className="text-teal-400 mb-1">✓ Stripping layout wrappers…</div>
                      <div className="text-gray-300 mb-1">→ Opening in editor…</div>
                      <div className="text-gray-600 mt-3 text-xs">Ready to inspect &amp; edit</div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-5 left-12 flex items-center text-[10px] font-bold tracking-widest text-gray-500">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full mr-2" />
                  BREACHER EDITOR READY
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Element Inspector ── */}
      <ElementInspector
        iframeRef={iframeRef}
        active={tool === "cursor" && hasPreview}
        onHtmlChange={handleHtmlChange}
      />

      {/* ── Bottom Toolbar ── */}
      <AnimatePresence>
        {!isPreview && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center p-1.5 gap-0.5 z-40"
          >
            <ToolButton
              active={tool === "pan"}
              onClick={() => handleToolClick("pan")}
              title="Pan (default)"
            >
              <Hand className="w-5 h-5" />
            </ToolButton>

            <ToolButton
              active={tool === "cursor"}
              onClick={() => handleToolClick("cursor")}
              title={hasPreview ? "Cursor — inspect & edit elements" : "Load a preview first"}
              disabled={!hasPreview}
            >
              <MousePointer2 className="w-5 h-5" />
            </ToolButton>

            <div className="h-6 w-px bg-gray-200 mx-0.5" />

            <ToolButton
              active={showChat}
              onClick={() => handleToolClick("chat")}
              title="Chat"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-xs ml-1.5 font-medium">Chat</span>
            </ToolButton>

            <ToolButton
              active={tool === "draw"}
              onClick={() => handleToolClick("draw")}
              title="Draw"
            >
              <Pencil className="w-5 h-5" />
              <span className="text-xs ml-1.5 font-medium">Draw</span>
            </ToolButton>

            <ToolButton
              active={tool === "edit"}
              onClick={() => handleToolClick("edit")}
              title="Edit"
            >
              <Maximize2 className="w-5 h-5" />
              <span className="text-xs ml-1.5 font-medium">Edit</span>
            </ToolButton>

            <div className="h-6 w-px bg-gray-200 mx-0.5" />

            <ToolButton
              active={tool === "generate"}
              onClick={() => handleToolClick("generate")}
              title="Generate"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs ml-1.5 font-medium">Generate</span>
            </ToolButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Preview exit button ── */}
      <AnimatePresence>
        {isPreview && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => setViewMode("design")}
            className="absolute top-4 right-4 z-50 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 shadow-md hover:bg-white transition-colors flex items-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            Exit Preview
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat Panel ── */}
      <AnimatePresence>
        {showChat && !isPreview && (
          <ChatPanel onClose={() => setShowChat(false)} projectName={projectName} />
        )}
      </AnimatePresence>

      {/* ── Right Panel ── */}
      <AnimatePresence>
        {showRightPanel && !isPreview && (
          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute top-16 right-2 bottom-5 w-[340px] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col z-40 overflow-hidden"
          >
            {/* Tabs */}
            <div className="flex p-2 border-b border-gray-100 gap-1">
              {(["templates", "inspiration", "files"] as RightTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize
                    ${rightTab === t
                      ? "bg-white shadow-sm border border-gray-200 text-gray-800"
                      : "text-gray-500 hover:bg-gray-50"
                    }`}
                >
                  {t === "templates" && <LayoutTemplate className="w-3.5 h-3.5 inline mr-1" />}
                  {t === "inspiration" && <Sparkles className="w-3.5 h-3.5 inline mr-1" />}
                  {t === "files" && <BookOpen className="w-3.5 h-3.5 inline mr-1" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {rightTab === "templates" && (
                <div className="h-full overflow-auto p-3">
                  <TemplateGallery onSelect={handleTemplateSelect} />
                </div>
              )}
              {rightTab === "inspiration" && (
                <div className="flex flex-col items-center justify-center h-full text-center text-sm text-gray-400 gap-2">
                  <Sparkles className="w-8 h-8 text-gray-300" />
                  <p>Inspiration gallery coming soon</p>
                  <p className="text-xs">Community-shared Framer imports</p>
                </div>
              )}
              {rightTab === "files" && (
                <div className="flex flex-col h-full">
                  {/* Framer file tree */}
                  {framerJobId ? (
                    <FramerFileTree
                      jobId={framerJobId}
                      jobStatus={framerJobStatus}
                      files={framerFiles}
                      activePath={framerActivePath}
                      onSelect={setFramerActivePath}
                      downloadUrl={`/api/conversions/${framerJobId}/download`}
                    />
                  ) : deviceFiles.length > 0 ? (
                    /* Device file tree */
                    <DeviceFileTree
                      files={deviceFiles}
                      activePath={deviceActivePath}
                      onSelect={(path) => {
                        setDeviceActivePath(path);
                        const file = deviceFiles.find((f) => f.path === path);
                        if (file && file.content) setPreviewHtml(file.content);
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 gap-2 p-4 text-center">
                      <BookOpen className="w-6 h-6 text-gray-300" />
                      <p>No files imported yet.</p>
                      <p className="text-gray-300">Import a project to see its files here.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── GitHub Sync Panel ── */}
      <AnimatePresence>
        {showGithubSync && !isPreview && (
          <GithubSync
            projectName={projectName}
            getHtml={getCurrentHtml}
            onClose={() => setShowGithubSync(false)}
            downloadUrl={
              framerJobId && framerJobStatus === "done"
                ? `/api/conversions/${framerJobId}/download`
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Framer File Tree ─────────────────────────────────────────────────────────

function FramerFileTree({
  jobId,
  jobStatus,
  files,
  activePath,
  onSelect,
  downloadUrl,
}: {
  jobId: string;
  jobStatus: FramerJobStatus;
  files: FramerFile[];
  activePath: string;
  onSelect: (path: string) => void;
  downloadUrl: string;
}) {
  const htmlFiles = files.filter((f) => f.path.endsWith(".html"));
  const otherFiles = files.filter((f) => !f.path.endsWith(".html"));

  if (jobStatus !== "done") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
        <p className="text-xs text-gray-500 capitalize">{jobStatus}…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">
          Framer import — {files.length} files
        </p>
        <a
          href={downloadUrl}
          download
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
        >
          <Download className="w-3 h-3" />
          ZIP
        </a>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {htmlFiles.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-1 pt-2 pb-1">
              Pages
            </p>
            {htmlFiles.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                size={f.size}
                active={activePath === f.path}
                onClick={() => onSelect(f.path)}
                clickable
              />
            ))}
          </>
        )}
        {otherFiles.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-1 pt-2 pb-1">
              Assets ({otherFiles.length})
            </p>
            {otherFiles.slice(0, 40).map((f) => (
              <FileRow key={f.path} path={f.path} size={f.size} />
            ))}
            {otherFiles.length > 40 && (
              <p className="text-[10px] text-gray-400 px-2 py-1">
                + {otherFiles.length - 40} more…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Device File Tree ─────────────────────────────────────────────────────────

function DeviceFileTree({
  files,
  activePath,
  onSelect,
}: {
  files: DeviceFile[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const htmlFiles = files.filter((f) => f.path.endsWith(".html"));
  const otherFiles = files.filter((f) => !f.path.endsWith(".html"));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-1">
        <p className="text-xs font-medium text-gray-600">
          Uploaded — {files.length} file{files.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {htmlFiles.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-1 pt-2 pb-1">
              Pages
            </p>
            {htmlFiles.map((f) => (
              <FileRow
                key={f.path}
                path={f.path}
                size={f.size}
                active={activePath === f.path}
                onClick={() => onSelect(f.path)}
                clickable
              />
            ))}
          </>
        )}
        {otherFiles.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide px-1 pt-2 pb-1">
              Other files ({otherFiles.length})
            </p>
            {otherFiles.map((f) => (
              <FileRow key={f.path} path={f.path} size={f.size} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── File Row ─────────────────────────────────────────────────────────────────

function FileRow({
  path,
  size,
  active = false,
  onClick,
  clickable = false,
}: {
  path: string;
  size: number;
  active?: boolean;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const filename = path.split("/").pop() || path;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors
        ${clickable ? "cursor-pointer" : "cursor-default"}
        ${active
          ? "bg-blue-50 border border-blue-200 text-blue-800"
          : clickable
            ? "hover:bg-gray-50 text-gray-700"
            : "text-gray-500"
        }`}
    >
      <FileIcon path={path} />
      <div className="flex-1 min-w-0">
        <span className="block truncate font-medium">{filename}</span>
        {dir && <span className="text-[10px] text-gray-400 truncate block">{dir}/</span>}
      </div>
      <span className="text-[10px] text-gray-400 shrink-0">
        {size > 1024 * 1024
          ? `${(size / 1024 / 1024).toFixed(1)}MB`
          : size > 1024
            ? `${Math.round(size / 1024)}KB`
            : `${size}B`}
      </span>
    </div>
  );
}

// ─── ToolButton ───────────────────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  title,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center px-2.5 py-2 rounded-lg transition-colors text-sm disabled:opacity-40
        ${active
          ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
          : "text-gray-600 hover:bg-gray-100"
        }`}
    >
      {children}
    </button>
  );
}
