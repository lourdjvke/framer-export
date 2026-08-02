import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, Link2, LayoutTemplate, ArrowRight, Mail, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Tile = "framer" | "device" | null;
type LoginMethod = "google" | "github" | "email" | null;

interface AuthOverlayProps {
  onAuthenticated: (importType: Tile, framerUrl?: string, deviceFiles?: FileList) => void;
}

export function AuthOverlay({ onAuthenticated }: AuthOverlayProps) {
  const { signInGoogle, signInGithub, signInEmail, signUpEmail } = useAuth();

  const [activeTile, setActiveTile] = useState<Tile>(null);
  const [framerUrl, setFramerUrl] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  async function handleSocialLogin(provider: "google" | "github") {
    setLoading(true);
    setError("");
    try {
      if (provider === "google") await signInGoogle();
      else await signInGithub();
      onAuthenticated(activeTile, framerUrl || undefined, selectedFiles || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isSignUp) await signUpEmail(email, password);
      else await signInEmail(email, password);
      onAuthenticated(activeTile, framerUrl || undefined, selectedFiles || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function handleTileClick(tile: Tile) {
    if (activeTile === tile) {
      setActiveTile(null);
      setShowLogin(false);
    } else {
      setActiveTile(tile);
      setShowLogin(false);
    }
  }

  function handleFramerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && framerUrl.trim()) {
      setShowLogin(true);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files);
      setShowLogin(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Frosted glass background */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-xl" />

      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(#9ca3af 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 max-w-2xl w-full">
        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Visage
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Import your project to get started
          </p>
        </motion.div>

        {/* Tiles */}
        <div className="flex gap-4 w-full justify-center">
          {/* Tile: Import from Framer */}
          <motion.div
            layout
            className={`relative flex-1 max-w-[220px] rounded-xl border cursor-pointer select-none overflow-hidden
              ${activeTile === "framer"
                ? "border-gray-900 bg-white/90 shadow-lg"
                : "border-gray-300 bg-white/60 hover:border-gray-500 hover:bg-white/80"
              }`}
            style={{ backdropFilter: "blur(8px)" }}
            onClick={() => handleTileClick("framer")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="p-6 flex flex-col items-center gap-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center
                ${activeTile === "framer" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>
                <Link2 className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Import from Framer</p>
                <p className="text-xs text-gray-500 mt-0.5">Paste a Framer share link</p>
              </div>
            </div>

            {/* Framer URL input */}
            <AnimatePresence>
              {activeTile === "framer" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden border-t border-gray-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-3">
                    <input
                      autoFocus
                      type="url"
                      value={framerUrl}
                      onChange={(e) => setFramerUrl(e.target.value)}
                      onKeyDown={handleFramerKeyDown}
                      placeholder="https://framer.com/share/..."
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
                    />
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">Press Enter to continue</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Tile: Import from Device */}
          <motion.div
            layout
            className={`relative flex-1 max-w-[220px] rounded-xl border cursor-pointer select-none overflow-hidden
              ${activeTile === "device"
                ? "border-gray-900 bg-white/90 shadow-lg"
                : "border-gray-300 bg-white/60 hover:border-gray-500 hover:bg-white/80"
              }`}
            style={{ backdropFilter: "blur(8px)" }}
            onClick={() => {
              handleTileClick("device");
              if (activeTile !== "device") setTimeout(() => fileInputRef.current?.click(), 200);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="p-6 flex flex-col items-center gap-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center
                ${activeTile === "device" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Import from Device</p>
                <p className="text-xs text-gray-500 mt-0.5">Upload an HTML folder</p>
              </div>
            </div>

            <AnimatePresence>
              {activeTile === "device" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden border-t border-gray-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-3 text-center">
                    {selectedFiles ? (
                      <p className="text-xs text-green-600 font-medium">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected
                      </p>
                    ) : (
                      <button
                        className="text-xs text-gray-600 underline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose files
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Tile: Browse Templates */}
          <motion.div
            layout
            className="relative flex-1 max-w-[220px] rounded-xl border cursor-pointer select-none border-gray-300 bg-white/60 hover:border-gray-500 hover:bg-white/80"
            style={{ backdropFilter: "blur(8px)" }}
            onClick={() => {
              setActiveTile(null);
              setShowLogin(true);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-gray-100 text-gray-600">
                <LayoutTemplate className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Browse Templates</p>
                <p className="text-xs text-gray-500 mt-0.5">Community projects</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".html,.css,.js,.json,.png,.jpg,.jpeg,.gif,.svg,.woff,.woff2,.ttf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Login to continue */}
        <AnimatePresence>
          {showLogin && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-sm bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800">Login to continue</h2>
                <button onClick={() => setShowLogin(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                  {error}
                </p>
              )}

              {/* Social logins */}
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={() => handleSocialLogin("google")}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loading && loginMethod === "google" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Continue with Google
                </button>

                <button
                  onClick={() => handleSocialLogin("github")}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loading && loginMethod === "github" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  )}
                  Continue with GitHub
                </button>
              </div>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              {/* Email / password */}
              <form onSubmit={handleEmailLogin} className="flex flex-col gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isSignUp ? "Create account" : "Sign in"}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <button
                className="w-full text-center text-xs text-gray-400 mt-3 hover:text-gray-600"
                onClick={() => setIsSignUp((v) => !v)}
              >
                {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
