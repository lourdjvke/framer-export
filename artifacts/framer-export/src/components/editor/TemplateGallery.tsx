import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Zap, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adjustPoints, canAfford, POINTS } from "@/lib/points";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  name: string;
  author: string;
  category: string;
  previewHtml: string;
  bgColor: string;
}

const TEMPLATES: Template[] = [
  {
    id: "dark-landing",
    name: "Dark Landing",
    author: "breacher",
    category: "Landing Pages",
    bgColor: "#0a0a0a",
    previewHtml: `<div style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:28px;font-weight:700;margin:0 0 8px">Dark Landing</h1><p style="color:#888;font-size:12px;margin:0">Minimal dark theme</p></div>`,
  },
  {
    id: "clean-saas",
    name: "Clean SaaS",
    author: "breacher",
    category: "Landing Pages",
    bgColor: "#f8fafc",
    previewHtml: `<div style="background:#f8fafc;font-family:sans-serif;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:24px;font-weight:700;margin:0 0 8px;color:#0f172a">Clean SaaS</h1><p style="color:#64748b;font-size:12px;margin:0">Light professional layout</p></div>`,
  },
  {
    id: "portfolio",
    name: "Portfolio",
    author: "breacher",
    category: "Portfolio",
    bgColor: "#fafaf9",
    previewHtml: `<div style="background:#fafaf9;font-family:sans-serif;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:24px;font-weight:700;margin:0 0 8px;color:#1c1917">Portfolio</h1><p style="color:#78716c;font-size:12px;margin:0">Creative showcase</p></div>`,
  },
  {
    id: "blog",
    name: "Blog",
    author: "breacher",
    category: "Content",
    bgColor: "#fff",
    previewHtml: `<div style="background:#fff;font-family:Georgia,serif;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:24px;font-weight:700;margin:0 0 8px;color:#111">The Blog</h1><p style="color:#555;font-size:12px;margin:0">Typography-first writing</p></div>`,
  },
  {
    id: "mobile-app",
    name: "Mobile App",
    author: "breacher",
    category: "Mobile",
    bgColor: "#6366f1",
    previewHtml: `<div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-family:sans-serif;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:24px;font-weight:700;margin:0 0 8px">Mobile App</h1><p style="color:rgba(255,255,255,0.7);font-size:12px;margin:0">App landing + CTA</p></div>`,
  },
  {
    id: "docs",
    name: "Documentation",
    author: "breacher",
    category: "Content",
    bgColor: "#f1f5f9",
    previewHtml: `<div style="background:#f1f5f9;font-family:monospace;padding:24px;height:100%;display:flex;flex-direction:column;justify-content:center"><h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1e293b">Docs</h1><p style="color:#64748b;font-size:11px;margin:0">Developer documentation</p></div>`,
  },
];

const CATEGORIES = ["All", "Landing Pages", "Portfolio", "Content", "Mobile"];

interface TemplateGalleryProps {
  onSelect: (template: Template) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const filtered = TEMPLATES.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || t.category === category;
    return matchSearch && matchCat;
  });

  async function handleUnlock(template: Template) {
    if (!user) return;
    setUnlocking(template.id);
    try {
      const affordable = await canAfford(user.uid, Math.abs(POINTS.UNLOCK_TEMPLATE));
      if (!affordable) {
        toast({ title: "Not enough points", description: "Unlocking a template costs 10 points.", variant: "destructive" });
        return;
      }
      await adjustPoints(user.uid, POINTS.UNLOCK_TEMPLATE);
      onSelect(template);
      toast({ title: "Template unlocked!", description: `${template.name} — 10 points used.` });
    } catch {
      toast({ title: "Error", description: "Failed to unlock template.", variant: "destructive" });
    } finally {
      setUnlocking(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates"
          className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      {/* Category tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors
              ${category === c
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 overflow-y-auto flex-1 pb-2">
        {filtered.map((t) => (
          <motion.div
            key={t.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group cursor-pointer flex flex-col"
          >
            {/* Preview */}
            <div
              className="rounded-xl overflow-hidden border border-gray-200 mb-1.5 relative"
              style={{ aspectRatio: "3/4", background: t.bgColor }}
            >
              <iframe
                srcDoc={`<style>*{margin:0;padding:0;box-sizing:border-box}body{height:100vh}</style>${t.previewHtml}`}
                className="w-full h-full pointer-events-none"
                sandbox="allow-same-origin"
                title={t.name}
              />
              {/* Unlock overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => handleUnlock(t)}
                  disabled={unlocking === t.id}
                  className="bg-white text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg hover:bg-gray-100 transition-colors disabled:opacity-70"
                >
                  {unlocking === t.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  Use (10 pts)
                </button>
              </div>
            </div>
            <p className="text-xs font-medium text-gray-800 truncate">{t.name}</p>
            <p className="text-[10px] text-gray-400">{t.category}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export type { Template };
