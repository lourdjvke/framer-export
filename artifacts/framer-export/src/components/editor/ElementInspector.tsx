import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Code2, Paintbrush, FileCode2 } from "lucide-react";

interface InspectedElement {
  el: HTMLElement;
  rect: DOMRect;
  tag: string;
  text: string;
  href?: string;
  styles: CSSStyleDeclaration;
  cssText: string;
  outerHTML: string;
}

interface ElementInspectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  active: boolean;
}

type InspectorTab = "style" | "css" | "html";

function getComputedStyleProps(el: HTMLElement): Record<string, string> {
  const cs = window.getComputedStyle(el);
  const props: Record<string, string> = {};
  const keys = [
    "color", "background-color", "font-size", "font-weight", "font-family",
    "text-decoration", "letter-spacing", "line-height", "padding",
    "margin", "border", "border-radius", "display", "opacity",
    "width", "height", "text-align",
  ];
  for (const k of keys) {
    props[k] = cs.getPropertyValue(k);
  }
  return props;
}

export function ElementInspector({ iframeRef, active }: ElementInspectorProps) {
  const [inspected, setInspected] = useState<InspectedElement | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [tab, setTab] = useState<InspectorTab>("style");
  const [editText, setEditText] = useState("");
  const [editHref, setEditHref] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editFontSize, setEditFontSize] = useState("");
  const [editFontWeight, setEditFontWeight] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    if (!active) {
      setHoverRect(null);
      setInspected(null);
      return;
    }

    const doc = iframe.contentDocument;

    function getAbsRect(el: HTMLElement): DOMRect {
      const iRect = iframe!.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      return new DOMRect(
        iRect.left + eRect.left,
        iRect.top + eRect.top,
        eRect.width,
        eRect.height
      );
    }

    function onMouseOver(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el || el === doc.body || el === doc.documentElement) return;
      setHoverRect(getAbsRect(el));
    }

    function onMouseOut() {
      setHoverRect(null);
    }

    function onClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as HTMLElement;
      if (!el) return;

      const tag = el.tagName.toLowerCase();
      const computed = getComputedStyleProps(el);
      const cssText = Object.entries(computed).map(([k, v]) => `${k}: ${v};`).join("\n");

      const insp: InspectedElement = {
        el,
        rect: getAbsRect(el),
        tag,
        text: el.innerText || el.textContent || "",
        href: el instanceof HTMLAnchorElement ? el.href : undefined,
        styles: el.style as unknown as CSSStyleDeclaration,
        cssText,
        outerHTML: el.outerHTML,
      };

      setInspected(insp);
      setEditText(insp.text);
      setEditHref(insp.href || "");
      const cs = window.getComputedStyle(el);
      setEditColor(cs.color);
      setEditFontSize(cs.fontSize);
      setEditFontWeight(cs.fontWeight);
      setTab("style");
    }

    doc.addEventListener("mouseover", onMouseOver);
    doc.addEventListener("mouseout", onMouseOut);
    doc.addEventListener("click", onClick, true);

    return () => {
      doc.removeEventListener("mouseover", onMouseOver);
      doc.removeEventListener("mouseout", onMouseOut);
      doc.removeEventListener("click", onClick, true);
    };
  }, [active, iframeRef]);

  function applyStyle(prop: string, value: string) {
    if (!inspected) return;
    (inspected.el.style as unknown as Record<string, string>)[prop] = value;
  }

  function applyText(val: string) {
    if (!inspected) return;
    inspected.el.innerText = val;
    setEditText(val);
  }

  function applyHref(val: string) {
    if (!inspected) return;
    if (inspected.el.tagName.toLowerCase() === "a") {
      (inspected.el as HTMLAnchorElement).href = val;
    }
    setEditHref(val);
  }

  // Position inspector panel intelligently near edge of screen
  function getPanelPosition(): React.CSSProperties {
    if (!inspected) return { top: 80, right: 16 };
    const r = inspected.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = 280;
    const panelH = 380;

    let left = r.right + 12;
    let top = r.top;

    if (left + panelW > vw - 8) left = r.left - panelW - 12;
    if (left < 8) left = 8;
    if (top + panelH > vh - 8) top = vh - panelH - 8;
    if (top < 64) top = 64;

    return { position: "fixed", left, top, width: panelW, zIndex: 9999 };
  }

  return (
    <>
      {/* Hover outline */}
      <AnimatePresence>
        {active && hoverRect && !inspected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed z-[9998]"
            style={{
              left: hoverRect.left,
              top: hoverRect.top,
              width: hoverRect.width,
              height: hoverRect.height,
              outline: "2px solid #3b82f6",
              outlineOffset: "1px",
              boxShadow: "0 0 0 9999px rgba(59,130,246,0.03)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Selected outline */}
      <AnimatePresence>
        {active && inspected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed z-[9998]"
            style={{
              left: inspected.rect.left,
              top: inspected.rect.top,
              width: inspected.rect.width,
              height: inspected.rect.height,
              outline: "2px solid #6366f1",
              outlineOffset: "1px",
            }}
          />
        )}
      </AnimatePresence>

      {/* Inspector panel */}
      <AnimatePresence>
        {active && inspected && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            style={getPanelPosition()}
            className="bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  &lt;{inspected.tag}&gt;
                </span>
              </div>
              <div className="flex items-center gap-1">
                {(["style", "css", "html"] as InspectorTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`p-1.5 rounded text-xs transition-colors ${tab === t ? "bg-gray-200 text-gray-800" : "text-gray-400 hover:text-gray-600"}`}
                    title={t === "style" ? "Visual Style" : t === "css" ? "CSS" : "HTML"}
                  >
                    {t === "style" ? <Paintbrush className="w-3.5 h-3.5" /> : t === "css" ? <FileCode2 className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
                <button
                  onClick={() => setInspected(null)}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-600 ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3 overflow-y-auto max-h-[340px] text-xs">
              {tab === "style" && (
                <div className="space-y-3">
                  {/* Text */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Text</label>
                    <textarea
                      value={editText}
                      onChange={(e) => applyText(e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      rows={2}
                    />
                  </div>

                  {/* Href (for anchor tags) */}
                  {inspected.tag === "a" && (
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Link (href)</label>
                      <input
                        type="text"
                        value={editHref}
                        onChange={(e) => applyHref(e.target.value)}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                  )}

                  {/* Color */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Color</label>
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="color"
                          value={editColor.startsWith("rgb") ? "#000000" : editColor}
                          onChange={(e) => { setEditColor(e.target.value); applyStyle("color", e.target.value); }}
                          className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={editColor}
                          onChange={(e) => { setEditColor(e.target.value); applyStyle("color", e.target.value); }}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Font size */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Font Size</label>
                      <input
                        type="text"
                        value={editFontSize}
                        onChange={(e) => { setEditFontSize(e.target.value); applyStyle("fontSize", e.target.value); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Weight</label>
                      <select
                        value={editFontWeight}
                        onChange={(e) => { setEditFontWeight(e.target.value); applyStyle("fontWeight", e.target.value); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        {["100","200","300","400","500","600","700","800","900"].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {tab === "css" && (
                <pre className="font-mono text-[10px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-2">
                  {inspected.cssText}
                </pre>
              )}

              {tab === "html" && (
                <pre className="font-mono text-[10px] text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-2 max-h-[280px] overflow-auto">
                  {inspected.outerHTML}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
