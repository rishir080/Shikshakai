
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
           <div className="score-hero glass" style={{ marginBottom: 24, padding: 32, display: "flex", alignItems: "center", gap: 40 }}>
              <div style={{ textAlign: "center" }}>
                 <div className="label-caps" style={{ marginBottom: 8 }}>Final Score</div>
                 <div style={{ fontSize: 56, fontFamily: "var(--font-serif)", color: "var(--accent3)" }}>
                    {evaluation.totalMarks}<sub style={{ fontSize: 20, opacity: 0.5 }}>/{evaluation.maxMarks}</sub>
                 </div>
              </div>
              <div style={{ flex: 1 }}>
                 <div className="label-caps" style={{ marginBottom: 12 }}>Competency Analysis</div>
                 <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{ width: `${evaluation.percentage}%`, height: "100%", background: "linear-gradient(90deg, var(--accent), var(--accent3))" }} />
                 </div>
                 <div style={{ fontSize: 13, color: "var(--text2)" }}>
                    The student has achieved a grade of <strong>{evaluation.grade}</strong>. 
                    {evaluation.teacherNote && <span style={{ marginLeft: 8 }}>Note: {evaluation.teacherNote}</span>}
                 </div>
              </div>
              <button onClick={downloadReportCard} className="btn-success">Export PDF Report</button>
           </div>

           <GlassPanel title={<span>📋</span> + " Itemized Feedback"}>
              <div className="data-table-wrap">
                 <table className="data-table">
                    <thead>
                       <tr><th>Q</th><th>Topic</th><th>Marks</th><th>AI Reasoning</th><th>Improvement Path</th></tr>
                    </thead>
                    <tbody>
                       {evaluation.questions.map((q: any, i: number) => (
                          <tr key={i}>
                             <td><strong style={{ color: "var(--text)" }}>{q.qNo}</strong></td>
                             <td>{q.topic}</td>
                             <td><span className={`avg-badge ${q.awarded >= q.max * 0.75 ? "avg-high" : q.awarded >= q.max * 0.5 ? "avg-mid" : "avg-low"}`}>{q.awarded}/{q.max}</span></td>
                             <td style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 300 }}>{q.reasoning}</td>
                             <td style={{ fontSize: 12, color: "var(--muted)" }}>{q.improvement}</td>
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
