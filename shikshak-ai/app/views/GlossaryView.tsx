'use client';
import { useState, useMemo } from "react";

// ── Difficulty pill colours ──────────────────────────────────────────────────
const DIFF_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  easy:   { bg: "rgba(0,219,160,0.08)",   color: "#00dba0", border: "rgba(0,219,160,0.25)"   },
  medium: { bg: "rgba(255,204,92,0.08)",  color: "#ffd060", border: "rgba(255,204,92,0.25)"  },
  hard:   { bg: "rgba(255,95,160,0.08)",  color: "#ff5fa0", border: "rgba(255,95,160,0.25)"  },
};

// ── Category pill colours (cycling palette) ──────────────────────────────────
const CAT_COLORS = [
  { bg: "rgba(136,117,255,0.1)", color: "#8875ff", border: "rgba(136,117,255,0.28)" },
  { bg: "rgba(0,219,160,0.08)",  color: "#00dba0", border: "rgba(0,219,160,0.2)"   },
  { bg: "rgba(90,180,255,0.08)", color: "#5ab4ff", border: "rgba(90,180,255,0.2)"  },
  { bg: "rgba(255,140,66,0.1)",  color: "#ff8c42", border: "rgba(255,140,66,0.25)" },
  { bg: "rgba(255,95,160,0.08)", color: "#ff5fa0", border: "rgba(255,95,160,0.22)" },
  { bg: "rgba(255,204,92,0.08)", color: "#ffd060", border: "rgba(255,204,92,0.22)" },
];

function getCatStyle(cat: string, allCats: string[]) {
  const idx = allCats.indexOf(cat) % CAT_COLORS.length;
  return CAT_COLORS[Math.max(0, idx)];
}

// ── Flip-card component ──────────────────────────────────────────────────────
function FlipCard({ term, definition, example, difficulty, category, allCats }: {
  term: string; definition: string; example: string;
  difficulty: string; category: string; allCats: string[];
}) {
  const [flipped, setFlipped] = useState(false);
  const diff   = DIFF_STYLE[difficulty] || DIFF_STYLE.medium;
  const catSty = getCatStyle(category, allCats);

  return (
    <div
      onClick={() => setFlipped(f => !f)}
      style={{
        cursor: "pointer",
        perspective: 1000,
        height: 220,
        position: "relative",
        userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
        transformStyle: "preserve-3d",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
      }}>
        {/* ── FRONT ── */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          background: "rgba(14,14,36,0.85)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column",
          justifyContent: "space-between", backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          {/* Top badges */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, textTransform: "uppercase", letterSpacing: 1 }}>
              {difficulty}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: catSty.bg, color: catSty.color, border: `1px solid ${catSty.border}` }}>
              {category}
            </span>
          </div>
          {/* Term */}
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 26, color: "#f0f0ff", lineHeight: 1.2, fontWeight: 600, letterSpacing: -0.5 }}>
            {term}
          </div>
          {/* Hint */}
          <div style={{ fontSize: 11, color: "rgba(144,144,184,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>↩</span> Click to reveal definition
          </div>
        </div>

        {/* ── BACK ── */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          background: "linear-gradient(135deg, rgba(136,117,255,0.1), rgba(14,14,36,0.95))",
          border: "1px solid rgba(136,117,255,0.25)", borderRadius: 16,
          padding: "18px 20px", display: "flex", flexDirection: "column",
          justifyContent: "space-between", backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(136,117,255,0.15)",
        }}>
          {/* Term small */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8875ff", letterSpacing: 1, textTransform: "uppercase" }}>
            {term}
          </div>
          {/* Definition */}
          <div style={{ fontSize: 13, lineHeight: 1.75, color: "#d0d0f0", fontWeight: 400, flex: 1, margin: "10px 0" }}>
            {definition}
          </div>
          {/* Example */}
          {example && (
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(144,144,184,0.8)", fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
              💡 {example}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Glossary Page ───────────────────────────────────────────────────────
export default function GlossaryPage() {
  const [inputText, setInputText]     = useState("");
  const [subject, setSubject]         = useState("");
  const [level, setLevel]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [extracting, setExtracting]   = useState(false);
  const [pdfFile, setPdfFile]         = useState<File | null>(null);
  const [pdfInfo, setPdfInfo]         = useState<{ pages: number; chars: number } | null>(null);
  const [terms, setTerms]             = useState<any[]>([]);
  const [detected, setDetected]       = useState("");
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [filterDiff, setFilterDiff]   = useState("all");
  const [filterCat, setFilterCat]     = useState("all");
  const [view, setView]               = useState<"cards" | "table">("cards");
  const [inputMode, setInputMode]     = useState<"text" | "pdf">("text");

  const allCats = useMemo(() => [...new Set(terms.map(t => t.category))], [terms]);

  const filtered = useMemo(() => {
    return terms.filter(t => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      const matchDiff   = filterDiff === "all" || t.difficulty === filterDiff;
      const matchCat    = filterCat  === "all" || t.category   === filterCat;
      return matchSearch && matchDiff && matchCat;
    });
  }, [terms, search, filterDiff, filterCat]);

  // ── Extract text from typed PDF via backend ──────────────────────────────
  const handlePdfUpload = async (file: File) => {
    setPdfFile(file);
    setPdfInfo(null);
    setInputText("");
    setError("");
    setExtracting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      bytes.forEach(b => binary += String.fromCharCode(b));
      const pdfBase64 = btoa(binary);

      const res = await fetch("/api/extract-pdf-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64 }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setInputText(data.text);
        setPdfInfo({ pages: data.total_pages, chars: data.text.length });
      } else {
        setError(data.message || "Failed to extract PDF text");
        setPdfFile(null);
      }
    } catch (e: any) {
      setError(`PDF extraction failed: ${e.message}`);
      setPdfFile(null);
    } finally {
      setExtracting(false);
    }
  };

  const generate = async () => {
    if (!inputText.trim()) return;
    setLoading(true); setError(""); setTerms([]); setDetected("");
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, subject, level }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setTerms(data.terms || []);
        setDetected(data.subject_detected || "");
      } else {
        setError(data.error || data.message || "Generation failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    const text = terms.map(t => `${t.term}\n${t.definition}\nExample: ${t.example}\n`).join("\n---\n");
    navigator.clipboard.writeText(text).then(() => alert("Glossary copied to clipboard!"));
  };

  const diffCounts = {
    easy:   terms.filter(t => t.difficulty === "easy").length,
    medium: terms.filter(t => t.difficulty === "medium").length,
    hard:   terms.filter(t => t.difficulty === "hard").length,
  };

  const clearAll = () => {
    setPdfFile(null); setPdfInfo(null); setInputText("");
    setTerms([]); setDetected(""); setError("");
  };

  return (
    <>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces',Georgia,serif", fontSize: 34, color: "#fff", letterSpacing: -0.5, lineHeight: 1.1, fontWeight: 400, fontStyle: "italic" }}>
              Smart Glossary Creator
            </h1>
            <p style={{ fontSize: 12, color: "#4a4a72", marginTop: 6, fontWeight: 300, letterSpacing: 0.3 }}>
              Upload a typed PDF or paste text — AI extracts every key academic term with contextual definitions & flashcards.
            </p>
          </div>
          {terms.length > 0 && (
            <button onClick={copyAll} style={{ padding: "9px 20px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "rgba(136,117,255,0.1)", color: "#8875ff", border: "1px solid rgba(136,117,255,0.28)", transition: "all 0.2s", flexShrink: 0 }}>
              📋 Copy All
            </button>
          )}
        </div>
      </div>

      {/* ── Input Panel ── */}
      <div style={{ background: "rgba(14,14,36,0.8)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "24px 28px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)" }} />

        {/* ── Mode Toggle ── */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 4, gap: 3, marginBottom: 20, width: "fit-content" }}>
          {[
            { id: "pdf",  label: "📄 Upload PDF",   desc: "Typed / computer-written" },
            { id: "text", label: "📝 Paste Text",   desc: "Any text or notes" },
          ].map(m => (
            <button key={m.id} onClick={() => setInputMode(m.id as any)}
              style={{ padding: "9px 22px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", transition: "all 0.2s", background: inputMode === m.id ? "rgba(136,117,255,0.18)" : "transparent", color: inputMode === m.id ? "#8875ff" : "#4a4a72", fontFamily: "inherit" }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* ── Optional hints ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#9090b8", letterSpacing: 1.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Subject (Optional)</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Biology, Economics..."
              style={{ background: "rgba(18,18,44,0.85)", border: "1px solid rgba(255,255,255,0.07)", color: "#f0f0ff", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", width: "100%", outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#9090b8", letterSpacing: 1.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Student Level (Optional)</label>
            <select value={level} onChange={e => setLevel(e.target.value)}
              style={{ background: "rgba(18,18,44,0.85)", border: "1px solid rgba(255,255,255,0.07)", color: level ? "#f0f0ff" : "#4a4a72", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", width: "100%", outline: "none", cursor: "pointer" }}>
              <option value="">Any level</option>
              {["Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","1st Year","2nd Year","3rd Year","4th Year","Postgraduate"].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── PDF Upload Mode ── */}
        {inputMode === "pdf" && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#9090b8", letterSpacing: 1.8, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              Upload PDF ✦ Computer-typed text only
            </label>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.type === "application/pdf") handlePdfUpload(f); }}
              style={{ position: "relative", border: `2px dashed ${pdfFile ? "rgba(0,219,160,0.4)" : "rgba(136,117,255,0.25)"}`, background: pdfFile ? "rgba(0,219,160,0.03)" : "rgba(136,117,255,0.03)", borderRadius: 14, padding: "28px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}>
              <input type="file" accept=".pdf,application/pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />

              {extracting ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, border: "3px solid rgba(136,117,255,0.2)", borderTopColor: "#8875ff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <div style={{ fontSize: 13, color: "#8875ff", fontWeight: 500 }}>Extracting text from PDF…</div>
                </div>
              ) : pdfFile && pdfInfo ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 28 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#00dba0" }}>{pdfFile.name}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, background: "rgba(0,219,160,0.08)", color: "#00dba0", border: "1px solid rgba(0,219,160,0.25)" }}>
                      📑 {pdfInfo.pages} pages
                    </span>
                    <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, background: "rgba(136,117,255,0.08)", color: "#8875ff", border: "1px solid rgba(136,117,255,0.2)" }}>
                      {pdfInfo.chars.toLocaleString()} characters extracted
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); clearAll(); }} style={{ marginTop: 4, fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "rgba(255,95,160,0.08)", color: "#ff5fa0", border: "1px solid rgba(255,95,160,0.2)", cursor: "pointer" }}>
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.6 }}>📄</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f0f0ff", marginBottom: 6 }}>Drop PDF here or click to browse</div>
                  <div style={{ fontSize: 11, color: "#4a4a72", lineHeight: 1.6 }}>
                    Works with textbooks, notes, slides — any <strong style={{ color: "#9090b8" }}>computer-typed</strong> PDF.<br />
                    For handwritten/scanned PDFs, use the <strong style={{ color: "#9090b8" }}>Document AI</strong> OCR feature instead.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Text Paste Mode ── */}
        {inputMode === "text" && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#9090b8", letterSpacing: 1.8, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              Paste Academic Text ✦ Required
            </label>
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={10}
              placeholder={"Paste your textbook chapter, lecture notes, or syllabus topic here...\n\nThe AI will scan it and extract all important academic terms with simple, contextual definitions."}
              style={{ width: "100%", background: "rgba(7,7,26,0.9)", border: "1px solid rgba(255,255,255,0.08)", color: "#d0d0f0", padding: "16px 18px", borderRadius: 12, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.75, resize: "vertical", outline: "none" }} />
          </div>
        )}

        {/* ── Stats & Generate ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#4a4a72", fontWeight: 300 }}>
            {inputText.length > 0
              ? `${inputText.length.toLocaleString()} chars · ~${Math.round(inputText.split(/\s+/).length)} words ready`
              : inputMode === "pdf" ? "Upload a PDF to extract its text" : "No text yet"}
          </div>
          <button onClick={generate} disabled={loading || extracting || !inputText.trim()}
            style={{ padding: "12px 32px", borderRadius: 12, border: "none",
              background: (loading || extracting || !inputText.trim()) ? "rgba(136,117,255,0.2)" : "linear-gradient(135deg,#8875ff,#5540cc)",
              color: (loading || extracting || !inputText.trim()) ? "rgba(136,117,255,0.5)" : "#fff",
              fontSize: 14, fontWeight: 700, cursor: (loading || extracting || !inputText.trim()) ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.25s",
              boxShadow: (loading || extracting || !inputText.trim()) ? "none" : "0 6px 24px rgba(136,117,255,0.4)",
              display: "flex", alignItems: "center", gap: 9 }}>
            {loading ? (
              <><div style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Extracting Terms…</>
            ) : "✨ Generate Glossary"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "rgba(255,95,160,0.07)", border: "1px solid rgba(255,95,160,0.25)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, fontSize: 13, color: "#ff5fa0" }}>
          ❌ {error}
        </div>
      )}

      {/* ── Results ── */}
      {terms.length > 0 && (
        <>
          {/* Stats bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4a4a72", letterSpacing: 2, textTransform: "uppercase" }}>
              {detected && `${detected} · `}{terms.length} Terms Extracted
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["easy","medium","hard"] as const).map(d => diffCounts[d] > 0 && (
                <span key={d} style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: DIFF_STYLE[d].bg, color: DIFF_STYLE[d].color, border: `1px solid ${DIFF_STYLE[d].border}` }}>
                  {d}: {diffCounts[d]}
                </span>
              ))}
            </div>
          </div>

          {/* Filter & search row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search terms or definitions..."
              style={{ flex: 1, minWidth: 200, background: "rgba(14,14,36,0.8)", border: "1px solid rgba(255,255,255,0.07)", color: "#f0f0ff", padding: "9px 14px", borderRadius: 10, fontSize: 12, fontFamily: "inherit", outline: "none" }}
            />
            <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)}
              style={{ background: "rgba(14,14,36,0.9)", border: "1px solid rgba(255,255,255,0.07)", color: "#9090b8", padding: "9px 14px", borderRadius: 10, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
              <option value="all">All Levels</option>
              <option value="easy">Easy Only</option>
              <option value="medium">Medium Only</option>
              <option value="hard">Hard Only</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ background: "rgba(14,14,36,0.9)", border: "1px solid rgba(255,255,255,0.07)", color: "#9090b8", padding: "9px 14px", borderRadius: 10, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
              <option value="all">All Categories</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* View toggle */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 3, gap: 2 }}>
              {(["cards","table"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", transition: "all 0.2s", background: view === v ? "rgba(136,117,255,0.18)" : "transparent", color: view === v ? "#8875ff" : "#4a4a72" }}>
                  {v === "cards" ? "🃏 Cards" : "📋 Table"}
                </button>
              ))}
            </div>
          </div>

          {/* ── CARD VIEW ── */}
          {view === "cards" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {filtered.map((t, i) => (
                <FlipCard key={i} {...t} allCats={allCats} />
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#4a4a72", fontSize: 13 }}>
                  No terms match your search or filters.
                </div>
              )}
            </div>
          )}

          {/* ── TABLE VIEW ── */}
          {view === "table" && (
            <div style={{ background: "rgba(14,14,36,0.8)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Term","Category","Difficulty","Definition","Example"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4a4a72", background: "rgba(255,255,255,0.01)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => {
                    const diff   = DIFF_STYLE[t.difficulty] || DIFF_STYLE.medium;
                    const catSty = getCatStyle(t.category, allCats);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.025)", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.015)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "13px 16px", color: "#f0f0ff", fontWeight: 600, fontSize: 14, fontFamily: "'Fraunces', Georgia, serif", whiteSpace: "nowrap" }}>{t.term}</td>
                        <td style={{ padding: "13px 16px" }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: catSty.bg, color: catSty.color, border: `1px solid ${catSty.border}` }}>{t.category}</span>
                        </td>
                        <td style={{ padding: "13px 16px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, textTransform: "uppercase", letterSpacing: 0.8 }}>{t.difficulty}</span>
                        </td>
                        <td style={{ padding: "13px 16px", color: "#9090b8", lineHeight: 1.7, fontWeight: 300, maxWidth: 340 }}>{t.definition}</td>
                        <td style={{ padding: "13px 16px", color: "#4a4a72", lineHeight: 1.6, fontStyle: "italic", fontWeight: 300, maxWidth: 280 }}>💡 {t.example}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "#4a4a72", fontSize: 13 }}>No terms match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tip footer */}
          <div style={{ marginTop: 20, padding: "12px 18px", background: "rgba(136,117,255,0.04)", border: "1px solid rgba(136,117,255,0.12)", borderRadius: 12, fontSize: 12, color: "#4a4a72", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span>Click any card to flip it and reveal the definition and example sentence. Use Table view for a quick overview of all terms.</span>
          </div>
        </>
      )}

      {/* Empty state (no results yet) */}
      {!loading && terms.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#4a4a72" }}>
          <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.4 }}>📖</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#9090b8", marginBottom: 8 }}>Paste any academic text above</div>
          <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            The AI will scan it and extract all important terms with contextual definitions — far better than a standard dictionary because it understands the topic and student level.
          </div>
        </div>
      )}
    </>
  );
}
