import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MousePointer2, Hand, Sparkles, MessageSquare, Pencil, Maximize2,
  Github, LogOut, ChevronDown, Globe, Link, Plus, Zap,
  LayoutTemplate, BookOpen, Layers, AlertTriangle,
} from "lucide-react";
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

// ─── Main Editor ─────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { toast } = useToast();

  // Stage
  const [stage, setStage] = useState<AppStage>("auth");

  // Project
  const [projectName, setProjectName] = useState("Untitled Project");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Editor state
  const [tool, setTool] = useState<Tool>("pan");
  const [viewMode, setViewMode] = useState<ViewMode>("design");
  const [rightTab, setRightTab] = useState<RightTab>("templates");
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showGithubSync, setShowGithubSync] = useState(false);
  const [points, setPoints] = useState<number | null>(null);

  // Import state
  const [importType, setImportType] = useState<"framer" | "device" | null>(null);
  const [pendingFramerUrl, setPendingFramerUrl] = useState<string | undefined>();
  const [pendingFiles, setPendingFiles] = useState<FileList | undefined>();

  // Iframe ref for element inspector
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
    }
    // Don't auto-advance; auth overlay calls onAuthenticated which handles stage
  }, [user, authLoading]);

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

    // Kick off import
    if (importType === "framer" && pendingFramerUrl) {
      await doFramerImport(pendingFramerUrl);
    } else if (importType === "device" && pendingFiles) {
      await doDeviceImport(pendingFiles);
    }

    setStage("editor");
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
    // Show placeholder — real Framer scraping is done by the api-server
    setPreviewHtml(
      `<html><body style="margin:0;background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px">
        <div style="font-size:14px;opacity:.7">Loading Framer export…</div>
        <div style="font-size:11px;opacity:.4;font-family:monospace">${url}</div>
      </body></html>`
    );
    toast({ title: "Framer import started", description: "4 points used." });
  }

  async function doDeviceImport(files: FileList) {
    const indexFile = Array.from(files).find((f) => f.name === "index.html");
    if (!indexFile) {
      // Use first .html file
      const htmlFile = Array.from(files).find((f) => f.name.endsWith(".html"));
      if (!htmlFile) {
        toast({ title: "No HTML file found", description: "Please include an index.html.", variant: "destructive" });
        return;
      }
      const text = await htmlFile.text();
      setPreviewHtml(text);
    } else {
      const text = await indexFile.text();
      setPreviewHtml(text);
    }
  }

  // ── Tool handlers ──────────────────────────────────────────────────────────

  function handleToolClick(t: Tool) {
    if (t === "cursor" && !previewHtml) {
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
  }

  // ── Preview mode ───────────────────────────────────────────────────────────

  const isPreview = viewMode === "preview";

  // Check balance gate
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
                      toast({ title: "Not enough points", description: `You need at least ${POINTS.MIN_EDIT_BALANCE} points to edit.`, variant: "destructive" });
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
            {previewHtml ? (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                style={{ cursor: tool === "cursor" ? "default" : tool === "pan" ? "grab" : "default" }}
              />
            ) : (
              <div className="w-full h-full bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden">
                {/* Simulated hero (matches design reference) */}
                <div className="flex justify-between items-center p-6 px-12 border-b border-gray-800/50">
                  <div className="font-bold tracking-wider text-sm flex items-center">
                    VISAGE<span className="w-2 h-2 bg-white ml-1 inline-block" />
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
                      Import from Framer or upload your own HTML. Inspect and edit elements visually. Push to GitHub in one click.
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
                        <span className="text-teal-500 mr-1">•</span> visage-editor
                      </div>
                    </div>
                    <div className="p-5 font-mono text-sm leading-relaxed text-gray-300">
                      <div className="text-gray-500 mb-2">$ visage import --framer</div>
                      <div className="text-teal-400 mb-1">✓ Fetching Framer export…</div>
                      <div className="text-teal-400 mb-1">✓ Stripping layout wrappers…</div>
                      <div className="text-gray-300 mb-1">→ Opening in editor…</div>
                      <div className="text-gray-600 mt-3 text-xs">Ready to inspect &amp; edit</div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-5 left-12 flex items-center text-[10px] font-bold tracking-widest text-gray-500">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full mr-2" />
                  VISAGE EDITOR READY
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Element Inspector ── */}
      <ElementInspector iframeRef={iframeRef} active={tool === "cursor" && !!previewHtml} />

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
              title={previewHtml ? "Cursor — inspect elements" : "Load a preview first"}
              disabled={!previewHtml}
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

            <div className="flex-1 overflow-hidden p-3">
              {rightTab === "templates" && (
                <TemplateGallery onSelect={handleTemplateSelect} />
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
                  <p className="text-xs font-medium text-gray-600 mb-2">Project files</p>
                  {previewHtml ? (
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                        index.html
                        <span className="text-gray-400 ml-auto">
                          {Math.round(previewHtml.length / 1024)} KB
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No files imported yet.</p>
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
            html={previewHtml || ""}
            onClose={() => setShowGithubSync(false)}
          />
        )}
      </AnimatePresence>
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
