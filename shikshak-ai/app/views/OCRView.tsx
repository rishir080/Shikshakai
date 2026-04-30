
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";
import { UploadZone } from "../components/UploadZone";

interface OCRViewProps {
  ocrImage: any; setOcrImage: (v: any) => void;
  ocrImageUrl: string; setOcrImageUrl: (v: string) => void;
  ocrResults: any; setOcrResults: (v: any) => void;
  ocrLoading: boolean;
  ocrProgress: any;
  processOCR: () => void;
  activeComparisonModels: string[]; setActiveComparisonModels: (v: string[]) => void;
  selectedOcrModel: string; setSelectedOcrModel: (v: string) => void;
  enhanceOCR: (t: string) => void;
  ocrEnhanced: string;
  downloadPDF: () => void;
}

export const OCRView = React.memo(({
  ocrImage, setOcrImage, ocrImageUrl, setOcrImageUrl, ocrResults, setOcrResults, ocrLoading, ocrProgress,
  processOCR, activeComparisonModels, setActiveComparisonModels, selectedOcrModel, setSelectedOcrModel,
  enhanceOCR, ocrEnhanced, downloadPDF
}: OCRViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">OCR Benchmark</h1>
        <p className="page-sub">Compare 7+ state-of-the-art vision models on your handwriting</p>
      </div>

      <GlassPanel title={<span>✨</span> + " Vision Engine Comparison"}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <UploadZone 
            icon="📸" label="Batch Answer Sheet" desc="Upload JPG or PDF for benchmarking" 
            setter={(f) => { setOcrImage(f); if(f) setOcrImageUrl(URL.createObjectURL(f)); }} 
            file={ocrImage} 
          />
          <button onClick={processOCR} className="btn-primary" style={{ height: 50, minWidth: 220 }} disabled={ocrLoading || !ocrImage}>
             {ocrProgress ? `🚀 Processing P${ocrProgress.current}/${ocrProgress.total}` : ocrLoading ? "Syncing AI Engines..." : "Run Multi-Model Benchmark"}
          </button>
        </div>
        
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
           {['groq', 'gemini-1.5-pro', 'tesseract', 'paddleocr'].map(m => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,0.03)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
                 <input type="checkbox" checked={activeComparisonModels.includes(m)} onChange={e => {
                    if(e.target.checked) setActiveComparisonModels([...activeComparisonModels, m]);
                    else setActiveComparisonModels(activeComparisonModels.filter(x => x !== m));
                 }} />
                 <span style={{ textTransform: "capitalize" }}>{m}</span>
              </label>
           ))}
        </div>
      </GlassPanel>

      {ocrResults && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24 }}>
           <GlassPanel title={<span>⚙️</span> + " Model Benchmarks"}>
              <div className="data-table-wrap">
                 <table className="data-table">
                    <thead>
                       <tr><th>Model</th><th>Confidence</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                       {Object.keys(ocrResults).map(m => (
                          <tr key={m} onClick={() => setSelectedOcrModel(m)} style={{ cursor: "pointer", background: selectedOcrModel === m ? "rgba(124,111,255,0.1)" : "transparent" }}>
                             <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{m}</td>
                             <td><span className={`avg-badge ${ocrResults[m].confidence >= 80 ? "avg-high" : "avg-mid"}`}>{ocrResults[m].confidence || 0}%</span></td>
                             <td><span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent3)" }}>{ocrResults[m].error ? "ERROR" : "READY"}</span></td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </GlassPanel>

           <GlassPanel title={<span>📄</span> + " Transcription View"}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                 <button onClick={() => enhanceOCR(ocrResults[selectedOcrModel]?.text || "")} className="btn-primary btn-sm">✨ AI Enhance</button>
                 <button onClick={downloadPDF} className="btn-ghost btn-sm">📥 Save Text</button>
              </div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 20, fontSize: 13, lineHeight: 1.8, height: 400, overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>
                 {ocrResults[selectedOcrModel]?.text || "Select a model to view output..."}
              </div>
              {ocrEnhanced && (
                 <div style={{ marginTop: 20, padding: 16, background: "rgba(0,219,160,0.05)", border: "1px solid var(--accent3)", borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "var(--accent3)" }}>TRANSCRIPTION POLISHED BY AI</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>{ocrEnhanced}</div>
                 </div>
              )}
           </GlassPanel>
        </motion.div>
      )}
    </>
  );
});
