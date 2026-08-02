import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Loader2, Check, X, ExternalLink, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adjustPoints, canAfford, getGithubCredentials, POINTS } from "@/lib/points";
import { useToast } from "@/hooks/use-toast";

interface GithubSyncProps {
  projectName: string;
  /** Called at push-time to get the current HTML (includes any live edits). */
  getHtml: () => string;
  onClose: () => void;
  /** Optional ZIP download URL for Framer imports (from api-server). */
  downloadUrl?: string;
}

type GithubApiError = { message?: string };
type GithubRepo = { full_name: string; html_url: string };
type GithubFileContent = { sha: string };

/** Pushes a single file to GitHub. Returns the repo URL on success, throws on any failure. */
async function pushToGithub(
  pat: string,
  username: string,
  repoName: string,
  html: string
): Promise<string> {
  const authHeader = { Authorization: `token ${pat}`, "Content-Type": "application/json" };
  const fullName = `${username}/${repoName}`;

  // ── Step 1: Ensure the repo exists ─────────────────────────────────────────
  const createRes = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ name: repoName, description: "Created with Breacher", private: false, auto_init: false }),
  });

  if (!createRes.ok && createRes.status !== 422) {
    const err = (await createRes.json()) as GithubApiError;
    throw new Error(err.message ?? `Failed to create repository (${createRes.status})`);
  }

  // If 201, we have the repo; if 422 (already exists), we'll use the known full_name.
  const repoFullName: string =
    createRes.status === 201
      ? ((await createRes.json()) as GithubRepo).full_name
      : fullName;

  // ── Step 2: Get existing file SHA if present ────────────────────────────────
  const contentsUrl = `https://api.github.com/repos/${repoFullName}/contents/index.html`;
  let existingSha: string | undefined;

  const getRes = await fetch(contentsUrl, { headers: { Authorization: `token ${pat}` } });
  if (getRes.ok) {
    const data = (await getRes.json()) as GithubFileContent;
    existingSha = data.sha;
  } else if (getRes.status !== 404) {
    const err = (await getRes.json()) as GithubApiError;
    throw new Error(err.message ?? `Failed to check existing file (${getRes.status})`);
  }

  // ── Step 3: Create or update the file ──────────────────────────────────────
  const content = btoa(unescape(encodeURIComponent(html)));
  const body: Record<string, string> = {
    message: "Update from Breacher",
    content,
    ...(existingSha ? { sha: existingSha } : {}),
  };

  const putRes = await fetch(contentsUrl, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = (await putRes.json()) as GithubApiError;
    throw new Error(err.message ?? `Failed to push file (${putRes.status})`);
  }

  return `https://github.com/${repoFullName}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GithubSync({ projectName, getHtml, onClose, downloadUrl }: GithubSyncProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [repoName, setRepoName] = useState(
    projectName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "my-project"
  );
  const [loading, setLoading] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [done, setDone] = useState(false);

  async function handlePush() {
    if (!user) return;
    setLoading(true);

    try {
      // ── Pre-flight checks ──────────────────────────────────────────────────
      const affordable = await canAfford(user.uid, Math.abs(POINTS.PUSH_GITHUB));
      if (!affordable) {
        toast({ title: "Not enough points", description: "Pushing to GitHub costs 1 point.", variant: "destructive" });
        return;
      }

      const creds = await getGithubCredentials(user.uid);
      if (!creds) {
        toast({ title: "No GitHub credentials", description: "Set up your GitHub credentials first.", variant: "destructive" });
        return;
      }

      // ── Get the latest HTML at push-time (includes any live edits) ─────────
      const html = getHtml();
      if (!html) {
        toast({ title: "Nothing to push", description: "Import a project first.", variant: "destructive" });
        return;
      }

      // ── Push (throws on any failure) ───────────────────────────────────────
      const url = await pushToGithub(creds.pat, creds.username, repoName, html);

      // ── Deduct points only after confirmed success ─────────────────────────
      await adjustPoints(user.uid, POINTS.PUSH_GITHUB);
      setRepoUrl(url);
      setDone(true);
      toast({ title: "Pushed to GitHub!", description: "1 point used." });
    } catch (err: unknown) {
      toast({
        title: "Push failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-80 bg-white rounded-2xl border border-gray-200 shadow-2xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4 text-gray-900" />
            <span className="text-sm font-semibold text-gray-900">Push to GitHub</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-800">Successfully pushed!</p>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              View on GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Repository name</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <p className="text-[10px] text-gray-400 mb-3">
              Costs <strong>1 point</strong> per push. Pushes the <strong>current edited version</strong> of your project.
            </p>
            <button
              onClick={handlePush}
              disabled={loading || !repoName}
              className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Push edited version
            </button>

            {/* Download ZIP link for Framer imports */}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="w-full mt-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download full project ZIP
              </a>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
