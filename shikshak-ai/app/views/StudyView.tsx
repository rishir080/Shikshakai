
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";
import { StudyCard, FlipCard } from "../components/StudyTools";

interface StudyViewProps {
  studyTopic: string; setStudyTopic: (v: string) => void;
  studyData: any;
  studyLoading: boolean;
  studyImages: any[];
  generateStudy: () => void;
}

export const StudyView = React.memo(({
  studyTopic, setStudyTopic, studyData, studyLoading, studyImages, generateStudy
}: StudyViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Study Tool</h1>
        <p className="page-sub">Comprehensive deep-study guides with AI-curated images</p>
      </div>

      <GlassPanel title={<span>◆</span> + " Topic Explorer"}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
             <label className="field-label">Topic / Concept Name</label>
             <input value={studyTopic} onChange={e => setStudyTopic(e.target.value)} className="field-input" placeholder="e.g. Plate Tectonics, Neural Networks, Stock Market..." />
          </div>
          <button onClick={generateStudy} className="btn-primary" style={{ height: 44, minWidth: 160 }} disabled={studyLoading}>
             {studyLoading ? "Curating guide..." : "Generate Guide"}
          </button>
        </div>
      </GlassPanel>

      {studyData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
           <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                 <StudyCard icon="📝" title="Essential Definition" subtitle="Foundational understanding">
                    <div className="ai-output" style={{ fontSize: 16, lineHeight: 1.8 }}>{studyData.definition}</div>
                 </StudyCard>

                 <StudyCard icon="📖" title="Detailed Explanation" subtitle="In-depth step-by-step analysis">
                    <div className="ai-output">{studyData.explanation}</div>
                 </StudyCard>

                 {studyImages.length > 0 && (
                   <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                      {studyImages.map((img, i) => (
                        <div key={i} className="panel" style={{ padding: 10, margin: 0 }}>
                           <img src={img.src} alt={img.caption} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
                           <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{img.caption}</div>
                        </div>
                      ))}
                   </div>
                 )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                 <StudyCard icon="⚡" title="Key Vocabulary" subtitle="Essential terminology">
                    <div className="ai-output" style={{ fontSize: 13, lineHeight: 2 }}>{studyData.keyConcepts}</div>
                 </StudyCard>

                 <StudyCard icon="🌟" title="Pro Study Cards" subtitle="Flashcards for quick revision">
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                       {studyData.funFacts.slice(0, 3).map((fact: string, i: number) => (
                          <FlipCard key={i} card={{ q: `Key Point ${i+1}`, a: fact }} />
                       ))}
                    </div>
                 </StudyCard>
              </div>
           </div>
        </motion.div>
      )}
    </>
  );
});
