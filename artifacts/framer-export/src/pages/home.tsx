import { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ConversionJob } from "@workspace/api-client-react";
import { useListConversions, useStartConversion } from "@workspace/api-client-react";
import { ConversionProgress } from "@/components/conversion-progress";
import { ConversionResults } from "@/components/conversion-results";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import {
  ArrowRight, CheckCircle2, XCircle, Loader2, Code2, Sparkles,
  ChevronDown, Globe, Link, Mic, Plus, Image, Layers,
  LayoutTemplate, Zap, BookOpen, Folder, FolderOpen, File,
  FileCode, FileText, FileVideo, FileImage, FileType, ChevronRight,
  Download, ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewState =
  | { type: "idle" }
  | { type: "converting"; jobId: string }
  | { type: "complete"; job: ConversionJob };

type RightTab = "templates" | "inspiration" | "files";

interface TreeNode {
  name: string;
  type: "file" | "dir";
  children: TreeNode[];
  filePath?: string;
  category?: string;
  size?: number;
}

// ─── File tree builder ────────────────────────────────────────────────────────

function buildTree(files: ConversionJob["files"]): TreeNode {
  const root: TreeNode = { name: "", type: "dir", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = isLast
          ? { name: part, type: "file", children: [], filePath: f.path, category: f.category, size: f.size }
          : { name: part, type: "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root;
}

function categoryIcon(cat?: string) {
  switch (cat) {
    case "html": return <FileText className="w-3 h-3 text-blue-500" />;
    case "css": return <FileCode className="w-3 h-3 text-purple-500" />;
    case "js": return <FileCode className="w-3 h-3 text-yellow-500" />;
    case "image": return <FileImage className="w-3 h-3 text-green-500" />;
    case "video": return <FileVideo className="w-3 h-3 text-red-500" />;
    case "font": return <FileType className="w-3 h-3 text-pink-500" />;
    default: return <File className="w-3 h-3 text-gray-400" />;
  }
}

function TreeNodeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === "dir") {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full px-2 py-0.5 rounded hover:bg-gray-100 text-xs text-gray-700 font-medium"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpen className="w-3 h-3 text-amber-400" /> : <Folder className="w-3 h-3 text-amber-400" />}
          <span className="truncate">{node.name || "/"}</span>
          <span className="ml-auto text-gray-400 font-normal">{node.children.length}</span>
        </button>
        {open && node.children.map((c, i) => (
          <TreeNodeRow key={i} node={c} depth={depth + 1} />
        ))}
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-gray-100 text-xs text-gray-600"
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      {categoryIcon(node.category)}
      <span className="truncate flex-1">{node.name}</span>
      {node.size != null && <span className="text-gray-400 shrink-0">{formatBytes(node.size)}</span>}
    </div>
  );
}

// ─── Card flip variants ───────────────────────────────────────────────────────

const flipVariants = {
  enter: (dir: number) => ({
    rotateY: dir > 0 ? 90 : -90,
    opacity: 0,
    scale: 0.95,
  }),
  visible: {
    rotateY: 0,
    opacity: 1,
    scale: 1,
    transition: { duration: 0.38, ease: "easeOut" as const },
  },
  exit: (dir: number) => ({
    rotateY: dir > 0 ? -90 : 90,
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.28, ease: "easeIn" as const },
  }),
};

// ─── History card ─────────────────────────────────────────────────────────────

function HistoryCard({ job, onClick }: { job: ConversionJob; onClick: () => void }) {
  const hostname = (() => { try { return new URL(job.url).hostname; } catch { return job.url; } })();
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-200 p-5"
    >
      <div className="bg-blue-50/60 rounded-lg p-3 text-sm text-gray-800 mb-3 border border-blue-100/60">
        <p className="font-medium text-blue-900 mb-0.5 truncate">{hostname}</p>
        <p className="text-gray-400 text-xs">{formatRelativeTime(job.createdAt)}</p>
      </div>
      <div className="flex items-center space-x-2 text-xs text-gray-500 mb-3">
        {job.status === "done"
          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          : job.status === "error"
            ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            : <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
        <span>
          {job.status === "done"
            ? `${job.totalFiles} files · ${formatBytes(job.totalSizeBytes)}`
            : job.message}
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed truncate">
        {job.status === "done"
          ? `Click to view results`
          : job.status === "error"
            ? job.errorMessage ?? "Conversion failed"
            : `In progress… ${job.progress}%`}
      </p>
    </button>
  );
}

// ─── Inline URL form ──────────────────────────────────────────────────────────

function InlineUrlForm({ onJobCreated }: { onJobCreated: (id: string) => void }) {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const startConversion = useStartConversion();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    try { new URL(url.startsWith("http") ? url : `https://${url}`); } catch {
      toast({ title: "Invalid URL", variant: "destructive" }); return;
    }
    startConversion.mutate(
      { data: { url: url.startsWith("http") ? url : `https://${url}` } },
      {
        onSuccess: (job) => { setUrl(""); onJobCreated(job.id); },
        onError: (err: any) => toast({ title: "Failed", description: err?.error ?? "Could not start", variant: "destructive" }),
      }
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col">
      <textarea
        className="w-full bg-transparent border-none focus:ring-0 resize-none p-3 text-sm text-gray-800 placeholder-gray-400 outline-none"
        rows={1}
        placeholder="Paste a Framer site URL to extract…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as any); } }}
        style={{ minHeight: 44, maxHeight: 120 }}
      />
      <div className="px-2 pb-2 pt-1 flex justify-between items-center">
        <div className="flex space-x-1">
          <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Image className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center space-x-1">
          <button type="button" className="flex items-center space-x-1 px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 transition-colors">
            <Layers className="w-3 h-3" />
            <span>Standard</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={startConversion.isPending || !url.trim()}
            className="p-1.5 bg-gray-800 disabled:bg-gray-200 text-white disabled:text-gray-400 hover:bg-gray-900 rounded-lg transition-colors ml-1"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Canvas Content ───────────────────────────────────────────────────────────

function CanvasContent({
  viewState,
  onJobCreated,
  onComplete,
  onError,
  onNewConversion,
}: {
  viewState: ViewState;
  onJobCreated: (id: string) => void;
  onComplete: (job: ConversionJob) => void;
  onError: (e: string) => void;
  onNewConversion: () => void;
}) {
  return (
    <div className="w-full h-full bg-[#0f0f0f] text-white flex flex-col relative overflow-hidden font-sans">
      {/* Fake nav bar */}
      <div className="flex justify-between items-center px-10 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 font-bold tracking-widest text-xs">
          <Code2 className="w-4 h-4 text-teal-400" />
          FRAMEEXPORT
        </div>
        <div className="flex items-center gap-6 text-[11px] text-gray-500 font-medium">
          <span className="hover:text-white cursor-pointer transition-colors">DOCS</span>
          <span className="hover:text-white cursor-pointer transition-colors">API</span>
          <span className="text-teal-400 bg-teal-900/30 px-2 py-0.5 rounded border border-teal-800/50">v1.0</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center px-10 py-8 overflow-hidden">
        {viewState.type === "idle" && (
          <div className="w-full max-w-xl space-y-6">
            <div className="space-y-3">
              <div className="inline-block border border-teal-800/50 bg-teal-900/20 text-teal-400 text-[10px] font-bold tracking-widest px-3 py-1 rounded-full">
                • FRAMER → STATIC HTML
              </div>
              <h1 className="text-4xl font-bold leading-tight">
                Your site.<br />
                <span className="text-teal-400">Extracted.</span><br />
                <span className="text-gray-500">Self-hosted.</span>
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                Paste any Framer-published URL. We'll pull down every asset — HTML, CSS, JS, fonts, images, video — into a clean ZIP, ready to deploy anywhere.
              </p>
            </div>
            <div className="relative">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2 mb-3">
                <Globe className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="text-gray-500 text-xs font-mono">Use the input below ↓ or paste here</span>
              </div>
              <p className="text-gray-600 text-xs">Or use the panel on the left to paste a URL and start extracting.</p>
            </div>
            {/* subtle glow */}
            <div className="absolute -right-20 -bottom-20 w-72 h-72 bg-teal-500/8 blur-[100px] pointer-events-none rounded-full" />
          </div>
        )}

        {viewState.type === "converting" && (
          <div className="w-full max-w-xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span className="text-sm font-medium text-white">Extracting site…</span>
              </div>
              <button
                onClick={onNewConversion}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
            <ConversionProgress
              jobId={viewState.jobId}
              onComplete={onComplete}
              onError={onError}
            />
          </div>
        )}

        {viewState.type === "complete" && (
          <div className="w-full max-w-xl space-y-4 overflow-y-auto max-h-full py-2">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-semibold text-white">Extraction Complete</span>
              </div>
              <button
                onClick={onNewConversion}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                New extraction
              </button>
            </div>
            {/* quick action buttons */}
            <div className="flex gap-2 shrink-0">
              {viewState.job.previewPath && (
                <a
                  href={viewState.job.previewPath + "/"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-xs text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview
                </a>
              )}
              {viewState.job.downloadPath && (
                <a
                  href={viewState.job.downloadPath}
                  download
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 rounded-lg text-xs text-teal-300 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download ZIP
                </a>
              )}
            </div>
            <div className="border-t border-white/10 pt-4">
              <ConversionResults job={viewState.job} />
            </div>
          </div>
        )}
      </div>

      {/* bottom status bar */}
      <div className="absolute bottom-5 left-10 flex items-center text-[10px] font-bold tracking-widest text-gray-600">
        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full mr-2 animate-pulse" />
        READY
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>({ type: "idle" });
  const [rightTab, setRightTab] = useState<RightTab>("templates");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Card flip state
  const [cardIndex, setCardIndex] = useState(0);
  const [flipDir, setFlipDir] = useState(1);
  const wheelAccum = useRef(0);
  const flipping = useRef(false);

  const { toast } = useToast();
  const { data: conversions } = useListConversions({ query: { refetchInterval: 3000, queryKey: ["conversions"] } });

  const handleJobCreated = (jobId: string) => {
    setViewState({ type: "converting", jobId });
    setHistoryOpen(false);
  };

  const handleComplete = (job: ConversionJob) => {
    setViewState({ type: "complete", job });
    setRightTab("files");
    toast({ title: "Extraction complete", description: `${job.totalFiles} files captured` });
  };

  const handleError = (error: string) => {
    setViewState({ type: "idle" });
    toast({ title: "Extraction failed", description: error, variant: "destructive" });
  };

  const handleSelectJob = (jobId: string) => {
    setViewState({ type: "converting", jobId });
    setHistoryOpen(false);
  };

  const handleNewConversion = () => {
    setViewState({ type: "idle" });
    setHistoryOpen(true);
  };

  // Card flip on wheel
  const history = conversions ?? [];
  const onHistoryWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (history.length <= 1 || flipping.current) return;
    wheelAccum.current += e.deltaY;
    if (Math.abs(wheelAccum.current) < 50) return;
    const dir = wheelAccum.current > 0 ? 1 : -1;
    wheelAccum.current = 0;
    setCardIndex((prev) => {
      const next = prev + dir;
      if (next < 0 || next >= history.length) return prev;
      flipping.current = true;
      setFlipDir(dir);
      setTimeout(() => { flipping.current = false; }, 450);
      return next;
    });
  }, [history.length]);

  // Current job for Files tab
  const currentJob = viewState.type === "complete" ? viewState.job : null;
  const fileTree = currentJob ? buildTree(currentJob.files) : null;

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative select-none"
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: "#f7f7f7",
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* ── Top Nav ── */}
      <header className="absolute top-2 left-2 right-2 h-14 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl flex items-center justify-between px-3 z-50 shadow-sm">
        <div className="flex items-center space-x-3">
          <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-700">
            <Code2 className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-1 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded-md">
            <span className="font-semibold text-sm text-gray-800">FrameExport</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </div>

          <div className="h-6 w-px bg-gray-200 mx-2" />

          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/50">
            <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-gray-800">Extract</button>
            <button className="px-3 py-1 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-md transition-colors">Preview</button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Docs</button>
          <button className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100/80 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200/50 flex items-center space-x-1.5">
            <Globe className="w-4 h-4 text-gray-500" />
            <span>API</span>
          </button>
          <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            <Link className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-gray-200 mx-1" />
          <button
            onClick={() => setRightPanelOpen((o) => !o)}
            className={`p-1.5 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-200 transition-colors ${rightPanelOpen ? "bg-gray-100 text-gray-700" : "bg-white text-gray-500"}`}
          >
            <Layers className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Canvas ── */}
      <main className="flex-1 pt-16 relative overflow-hidden flex items-center justify-center">
        {/* iframe-style wrapper */}
        <div
          className="rounded-lg overflow-hidden border border-gray-200 shadow-2xl ring-1 ring-black/5"
          style={{
            width: 1100,
            height: 700,
            transform: "scale(0.62)",
            transformOrigin: "center center",
            flexShrink: 0,
          }}
        >
          <CanvasContent
            viewState={viewState}
            onJobCreated={handleJobCreated}
            onComplete={handleComplete}
            onError={handleError}
            onNewConversion={handleNewConversion}
          />
        </div>
      </main>

      {/* ── Bottom Toolbar ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center p-1.5 space-x-1 z-40">
        <button className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ transform: "rotate(-45deg)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        <button className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
        </button>
        <div className="h-6 w-px bg-gray-200 mx-1" />
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2 text-sm font-medium"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span>History</span>
        </button>
        <button className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2 text-sm font-medium">
          <Zap className="w-4 h-4 text-gray-500" />
          <span>Extract</span>
        </button>
        <button className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2 text-sm font-medium">
          <Globe className="w-4 h-4 text-gray-500" />
          <span>Preview</span>
        </button>
        <div className="h-6 w-px bg-gray-200 mx-1" />
        <button className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2 text-sm font-medium">
          <Plus className="w-4 h-4 text-gray-500" />
          <span>New</span>
        </button>
      </div>

      {/* ── Left Panel ── */}
      <div className="absolute bottom-6 left-6 w-[380px] z-40 flex flex-col justify-end space-y-3">

        {/* History stack — card flip on scroll */}
        <AnimatePresence>
          {historyOpen && history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              {/* Scroll hint */}
              <p className="text-[11px] text-gray-400 text-center mb-1.5 font-medium tracking-wide">
                {cardIndex + 1} / {history.length} — scroll to browse
              </p>

              {/* Stacked card container */}
              <div
                className="relative"
                style={{ perspective: "1000px" }}
                onWheel={onHistoryWheel}
              >
                {/* Ghost cards behind (representing depth of history) */}
                {history.length > 1 && (
                  <div
                    className="absolute inset-x-0 top-0 h-full bg-white border border-gray-200 rounded-xl z-0 shadow-sm"
                    style={{ transform: "translateY(-8px) scale(0.96)" }}
                  />
                )}
                {history.length > 2 && (
                  <div
                    className="absolute inset-x-0 top-0 h-full bg-white border border-gray-200 rounded-xl"
                    style={{ transform: "translateY(-16px) scale(0.92)", zIndex: -1 }}
                  />
                )}

                {/* Flip card */}
                <div className="relative z-10" style={{ transformStyle: "preserve-3d" }}>
                  <AnimatePresence custom={flipDir} mode="wait">
                    <motion.div
                      key={cardIndex}
                      custom={flipDir}
                      variants={flipVariants}
                      initial="enter"
                      animate="visible"
                      exit="exit"
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      <HistoryCard
                        job={history[cardIndex]}
                        onClick={() => handleSelectJob(history[cardIndex].id)}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          {/* Credits / status bar */}
          <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2 flex items-center space-x-3">
            <Zap className="w-4 h-4 text-teal-500" />
            <div className="text-xs">
              <span className="text-gray-600">
                {viewState.type === "idle"
                  ? "Ready to extract"
                  : viewState.type === "converting"
                    ? "Extraction in progress…"
                    : "Extraction complete"}
              </span>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="ml-auto text-xs text-blue-500 hover:underline"
              >
                {historyOpen ? "Hide" : `History (${history.length})`}
              </button>
            )}
          </div>

          {/* URL input */}
          <div className="p-3">
            <div className="flex flex-col border border-gray-200 rounded-xl bg-white shadow-sm hover:border-gray-300 transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
              <InlineUrlForm onJobCreated={handleJobCreated} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Sidebar ── */}
      <motion.aside
        animate={{ x: rightPanelOpen ? 0 : "110%", opacity: rightPanelOpen ? 1 : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="absolute top-[72px] right-2 bottom-6 w-[340px] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col z-40 overflow-hidden"
      >
        {/* Tabs */}
        <div className="flex p-2 border-b border-gray-100 shrink-0">
          <button
            onClick={() => setRightTab("templates")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center space-x-1.5 transition-colors ${rightTab === "templates" ? "bg-white shadow-sm border border-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <LayoutTemplate className="w-4 h-4" />
            <span>Templates</span>
          </button>
          <button
            onClick={() => setRightTab("inspiration")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center space-x-1.5 transition-colors ${rightTab === "inspiration" ? "bg-white shadow-sm border border-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Zap className="w-4 h-4" />
            <span>Inspiration</span>
          </button>
          <button
            onClick={() => setRightTab("files")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center space-x-1.5 transition-colors ${rightTab === "files" ? "bg-white shadow-sm border border-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-50"}`}
          >
            <Folder className="w-4 h-4" />
            <span>Files</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>

          {/* ── Templates tab ── */}
          {rightTab === "templates" && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 mb-3">Starting points for your extraction</h3>
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input type="text" className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm" placeholder="Search examples" />
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                {["All", "Agency", "Portfolio", "SaaS", "E-commerce", "Blog"].map((tag, i) => (
                  <span key={tag} className={`px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-colors ${i === 0 ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200"}`}>{tag}</span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Agency Hero", sub: "Agency", bg: "#0f0f0f", accent: "#2dd4bf" },
                  { label: "SaaS Landing", sub: "SaaS", bg: "#1e1b4b", accent: "#818cf8" },
                  { label: "Portfolio Grid", sub: "Portfolio", bg: "#f1481b", accent: "#fff" },
                  { label: "E-commerce", sub: "E-commerce", bg: "#e9f0ea", accent: "#000" },
                ].map((t) => (
                  <div key={t.label} className="group cursor-pointer flex flex-col">
                    <div
                      className="rounded-lg overflow-hidden border border-gray-200 mb-2 group-hover:border-gray-300 transition-colors aspect-[3/4] flex flex-col items-center justify-center p-4"
                      style={{ background: t.bg }}
                    >
                      <div className="w-8 h-1 rounded mb-2" style={{ background: t.accent, opacity: 0.8 }} />
                      <div className="w-12 h-1 rounded mb-1" style={{ background: t.accent, opacity: 0.4 }} />
                      <div className="w-10 h-1 rounded" style={{ background: t.accent, opacity: 0.3 }} />
                    </div>
                    <div className="text-xs font-medium text-gray-800 truncate">{t.label}</div>
                    <div className="text-[10px] text-gray-500">{t.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Inspiration tab ── */}
          {rightTab === "inspiration" && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-gray-500 mb-3">Sites worth extracting</h3>
              {[
                { url: "https://framer.com", label: "Framer.com", note: "Official site" },
                { url: "https://linear.app", label: "Linear.app", note: "SaaS landing" },
                { url: "https://vercel.com", label: "Vercel.com", note: "Dev tool marketing" },
                { url: "https://loom.com", label: "Loom.com", note: "Video messaging" },
              ].map((site) => (
                <button
                  key={site.url}
                  onClick={() => handleJobCreated(site.url)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{site.label}</p>
                    <p className="text-xs text-gray-400">{site.note}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* ── Files tab ── */}
          {rightTab === "files" && (
            <div>
              {!currentJob ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Folder className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No files yet</p>
                  <p className="text-xs text-gray-400 mt-1">Complete an extraction to browse the file tree</p>
                </div>
              ) : (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">
                        {(() => { try { return new URL(currentJob.url).hostname; } catch { return currentJob.url; } })()}
                      </p>
                      <p className="text-[10px] text-gray-400">{currentJob.totalFiles} files · {formatBytes(currentJob.totalSizeBytes)}</p>
                    </div>
                    {currentJob.downloadPath && (
                      <a
                        href={currentJob.downloadPath}
                        download
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        ZIP
                      </a>
                    )}
                  </div>
                  {/* Tree */}
                  <div className="border border-gray-100 rounded-lg bg-gray-50/50 py-1 overflow-hidden">
                    {fileTree && fileTree.children.map((node, i) => (
                      <TreeNodeRow key={i} node={node} depth={0} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
