
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";
import { UploadZone } from "../components/UploadZone";

interface PaperViewProps {
  es: string; setEvalStep: (v: any) => void;
  evaluation: any; setEvaluation: (v: any) => void;
  loading: boolean;
  subject: string; setSubject: (v: string) => void;
  paperTitle: string; setPaperTitle: (v: string) => void;
  totalMarksInput: string; setTotalMarksInput: (v: string) => void;
  marksDistribution: string; setMarksDistribution: (v: string) => void;
  answerSheetFile: any; setAnswerSheetFile: (v: any) => void;
  questionPaperFile: any; setQuestionPaperFile: (v: any) => void;
  syllabusFile: any; setSyllabusFile: (v: any) => void;
  evaluatePaper: () => void;
  downloadReportCard: () => void;
  evalProgress: string;
}

export const PaperView = React.memo(({
  es, setEvalStep, evaluation, setEvaluation, loading, subject, setSubject, paperTitle, setPaperTitle, totalMarksInput, setTotalMarksInput, 
  marksDistribution, setMarksDistribution, answerSheetFile, setAnswerSheetFile, questionPaperFile, setQuestionPaperFile, syllabusFile, setSyllabusFile,
  evaluatePaper, downloadReportCard, evalProgress
}: PaperViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Paper Evaluation</h1>
        <p className="page-sub">Intelligent AI marking for handwritten answer sheets</p>
      </div>

      {es === "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 24 }}>
             <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <GlassPanel title={<span>📋</span> + " Exam Configuration"}>
                   <div className="field-group">
                      <label className="field-label">Subject *</label>
                      <input value={subject} onChange={e => setSubject(e.target.value)} className="field-input" placeholder="e.g. Physics" />
                   </div>
                   <div className="field-group">
                      <label className="field-label">Total Marks *</label>
                      <input value={totalMarksInput} onChange={e => setTotalMarksInput(e.target.value)} className="field-input" type="number" />
                   </div>
                   <div className="field-group">
                      <label className="field-label">Marks Distribution *</label>
                      <textarea value={marksDistribution} onChange={e => setMarksDistribution(e.target.value)} className="field-input" rows={4} placeholder="Q1: 5 marks, Q2: 10 marks..." />
                   </div>
                </GlassPanel>
             </div>
             
             <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <GlassPanel title={<span>📸</span> + " Material Upload"}>
                   <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <UploadZone icon="✍️" label="Answer Sheet" desc="Handwritten paper (JPG/PDF)" required setter={setAnswerSheetFile} file={answerSheetFile} />
                      <UploadZone icon="📃" label="Question Paper" desc="Helps AI understand context" setter={setQuestionPaperFile} file={questionPaperFile} />
                      <UploadZone icon="📚" label="Syllabus" desc="Refines marking logic" setter={setSyllabusFile} file={syllabusFile} />
                   </div>
                   <button onClick={evaluatePaper} className="btn-primary" style={{ marginTop: 20, width: "100%", height: 48 }} disabled={loading}>
                      {loading ? "AI is reviewing paper..." : "Begin Intelligence Marking"}
                   </button>
                </GlassPanel>
             </div>
          </div>
        </motion.div>
      )}

      {(es === "ocr" || es === "ai") && (
        <div className="progress-screen" style={{ textAlign: "center", padding: "100px 0" }}>
           <div style={{ fontSize: 40, marginBottom: 20 }}>{es === "ocr" ? "📄" : "🧠"}</div>
           <h2 className="premium-title" style={{ fontSize: 24, marginBottom: 10 }}>{es === "ocr" ? "Reading Handwriting..." : "Analyzing Answers..."}</h2>
           <p style={{ color: "var(--muted)", maxWidth: 400, margin: "0 auto" }}>{evalProgress}</p>
        </div>
      )}

       {es === "done" && evaluation && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
           <div className="score-hero glass" style={{ marginBottom: 20, padding: 28, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", minWidth: 120 }}>
                 <div className="label-caps" style={{ marginBottom: 6 }}>Final Score</div>
                 <div style={{ fontSize: 48, fontFamily: "var(--font-serif)", color: "var(--accent3)", lineHeight: 1.1 }}>
                    {evaluation.totalMarks}<sub style={{ fontSize: 18, opacity: 0.5 }}>/{evaluation.maxMarks}</sub>
                 </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 100, borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: 24 }}>
                 <div className="label-caps" style={{ marginBottom: 6, color: "#ff8080" }}>Marks Reduced</div>
                 <div style={{ fontSize: 36, fontFamily: "var(--font-serif)", color: "#ff5a5a", lineHeight: 1.1 }}>
                    {evaluation.totalReduced !== undefined && evaluation.totalReduced > 0 ? `-${evaluation.totalReduced}` : "0"}
                 </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                 <div className="label-caps" style={{ marginBottom: 10 }}>Performance & Grade</div>
                 <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${evaluation.percentage}%`, height: "100%", background: evaluation.percentage >= 75 ? "linear-gradient(90deg, var(--accent), var(--accent3))" : evaluation.percentage >= 50 ? "linear-gradient(90deg, #f59e0b, #10b981)" : "linear-gradient(90deg, #ef4444, #f59e0b)" }} />
                 </div>
                 <div style={{ fontSize: 13, color: "var(--text2)" }}>
                    Scored <strong>{evaluation.percentage}%</strong> · Grade <strong>{evaluation.grade}</strong>
                    {evaluation.teacherNote && <span style={{ marginLeft: 8, color: "var(--muted)" }}>({evaluation.teacherNote})</span>}
                 </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={downloadReportCard} className="btn-success">Export PDF Report</button>
                <button onClick={() => { setEvalStep("idle"); setEvaluation(null); }} className="btn-ghost" style={{ fontSize: 12 }}>↺ New</button>
              </div>
           </div>

           {evaluation.markLossAnalysis && evaluation.markLossAnalysis.length > 0 && (
              <div style={{ background: "rgba(255,90,90,0.06)", border: "1px solid rgba(255,90,90,0.2)", borderRadius: 12, padding: "14px 20px", marginBottom: 20 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#ff7070", marginBottom: 8 }}>
                    <span>🔻</span> Paper Mark Reduction & Deduction Analysis:
                 </div>
                 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {evaluation.markLossAnalysis.map((loss: string, idx: number) => (
                       <div key={idx} style={{ fontSize: 12.5, color: "var(--text2)", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5 }}>
                          <span style={{ color: "#ff5a5a", fontWeight: 700 }}>•</span>
                          <span>{loss}</span>
                       </div>
                    ))}
                 </div>
              </div>
           )}

           <GlassPanel title={<span>📋</span> + " Question Evaluation & Deduction Breakdown"}>
              <div className="data-table-wrap">
                 <table className="data-table">
                    <thead>
                       <tr><th>Q No.</th><th>Question Asked</th><th>Marks</th><th>Reason for Deduction & Evaluation</th><th>Improvement Path</th></tr>
                    </thead>
                    <tbody>
                       {evaluation.questions.map((q: any, i: number) => (
                          <tr key={i}>
                             <td><strong style={{ color: "var(--text)" }}>{q.qNo}</strong></td>
                             <td style={{ fontSize: 12, color: "var(--text2)", maxWidth: 220 }}>
                                <div>{q.questionText || q.topic || "—"}</div>
                                {q.studentAnswerSummary && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>↳ {q.studentAnswerSummary}</div>}
                             </td>
                             <td style={{ textAlign: "center", minWidth: 90 }}>
                                <span className={`avg-badge ${q.awarded >= q.max * 0.75 ? "avg-high" : q.awarded >= q.max * 0.5 ? "avg-mid" : "avg-low"}`}>
                                   {q.awarded}/{q.max}
                                </span>
                                {q.reduced !== undefined && q.reduced > 0 && (
                                   <div style={{ fontSize: 10.5, color: "#ff5a5a", fontWeight: 700, marginTop: 4 }}>
                                      🔻 -{q.reduced} Lost
                                   </div>
                                )}
                                {q.awarded === q.max && (
                                   <div style={{ fontSize: 10.5, color: "#10b981", fontWeight: 700, marginTop: 4 }}>
                                      ✅ Full Marks
                                   </div>
                                )}
                             </td>
                             <td style={{ fontSize: 12, lineHeight: 1.6, minWidth: 260 }}>
                                {q.whyMarksReduced && (
                                   <div style={{ background: "rgba(255, 90, 90, 0.08)", borderLeft: "3px solid #ff5a5a", padding: "6px 10px", borderRadius: "0 6px 6px 0", marginBottom: 6, fontSize: 12, color: "#fca5a5" }}>
                                      <strong style={{ color: "#ff5a5a" }}>🔻 Deduction Reason: </strong>
                                      {q.whyMarksReduced}
                                   </div>
                                )}
                                {Array.isArray(q.deductions) && q.deductions.length > 0 && (
                                   <div style={{ marginBottom: 6, background: "rgba(255, 255, 255, 0.02)", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255, 90, 90, 0.15)" }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: "#ff7070", marginBottom: 2 }}>Deductions:</div>
                                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#fca5a5" }}>
                                         {q.deductions.map((d: any, dIdx: number) => (
                                            <li key={dIdx}>
                                               {typeof d === "string" ? d : `${d.reason || d.mistake || d.description} ${d.marks_deducted ? `(-${d.marks_deducted})` : ""}`}
                                            </li>
                                         ))}
                                      </ul>
                                   </div>
                                )}
                                {q.whatWasCorrect && (
                                   <div style={{ fontSize: 11.5, color: "#86efac", marginBottom: 4 }}>
                                      <strong style={{ color: "#22c55e" }}>✅ Correct: </strong>{q.whatWasCorrect}
                                   </div>
                                )}
                                {q.reasoning && <div style={{ color: "var(--text2)", marginBottom: 4 }}>{q.reasoning}</div>}
                                {q.redPen && <div style={{ fontSize: 11, color: "var(--accent2)", fontStyle: "italic" }}>✍️ {q.redPen}</div>}
                             </td>
                             <td style={{ fontSize: 12, color: "var(--muted)", minWidth: 150 }}>
                                {q.improvement ? (
                                   <div style={{ background: "rgba(124, 111, 255, 0.08)", padding: "6px 10px", borderRadius: 6, color: "#818cf8" }}>
                                      💡 {q.improvement}
                                   </div>
                                ) : "—"}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </GlassPanel>
        </motion.div>
      )}
    </>
  );
});
