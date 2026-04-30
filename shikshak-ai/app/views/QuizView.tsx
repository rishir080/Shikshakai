
'use client';
import { motion, AnimatePresence } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";

interface QuizViewProps {
  quizView: string;
  setQuizView: (v: string) => void;
  quizzes: any[];
  activeSession: any;
  endSession: () => void;
  startSession: (q: any) => void;
  deleteQuiz: (id: number) => void;
  saveQuiz: () => void;
  generateAIQuiz: () => void;
  qaTitle: string; setQaTitle: (v: string) => void;
  qaSubject: string; setQaSubject: (v: string) => void;
  qaGrade: string; setQaGrade: (v: string) => void;
  qaTopic: string; setQaTopic: (v: string) => void;
  qaCount: string; setQaCount: (v: string) => void;
  loading: boolean;
}

export const QuizView = React.memo(({
  quizView, setQuizView, quizzes, activeSession, endSession, startSession, deleteQuiz, saveQuiz, generateAIQuiz,
  qaTitle, setQaTitle, qaSubject, setQaSubject, qaGrade, setQaGrade, qaTopic, setQaTopic, qaCount, setQaCount, loading
}: QuizViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Quiz & Tests</h1>
        <p className="page-sub">AI-powered assessment suite with live monitoring</p>
      </div>

      <AnimatePresence mode="wait">
        {quizView === "list" && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setQuizView("create")} className="btn-primary">+ Create Manual</button>
              <button onClick={() => setQuizView("ai-gen")} className="btn-gold">✦ AI Generate</button>
            </div>

            {activeSession && (
              <GlassPanel className="session-banner" style={{ background: "rgba(0,219,160,0.05)", borderColor: "var(--accent3)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                   <div className="live-dot" />
                   <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Live: {activeSession.quizTitle}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{activeSession.results?.length || 0} Submissions</div>
                   </div>
                   <button onClick={() => setQuizView("session")} className="btn-success btn-sm">Join Control Room</button>
                   <button onClick={endSession} className="btn-danger btn-sm">Terminate</button>
                </div>
              </GlassPanel>
            )}

            {!quizzes.length ? (
              <div className="panel"><div className="empty-state">No quizzes yet.</div></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
                {quizzes.map(q => (
                  <GlassPanel key={q.id} style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                       <div>
                         <div style={{ fontSize: 15, fontWeight: 600 }}>{q.title}</div>
                         <div style={{ fontSize: 11, color: "var(--muted)" }}>{q.subject} · {q.grade}</div>
                       </div>
                       <div style={{ textAlign: "right" }}>
                         <div style={{ fontSize: 18, color: "var(--accent)", fontWeight: 700 }}>{q.questions.length}</div>
                         <div style={{ fontSize: 8, color: "var(--muted)", letterSpacing: 1 }}>ITEMS</div>
                       </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                       <button onClick={() => startSession(q)} className="btn-success btn-sm" style={{ flex: 1 }}>Start Session</button>
                       <button onClick={() => deleteQuiz(q.id)} className="btn-ghost btn-sm">Delete</button>
                    </div>
                  </GlassPanel>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {quizView === "ai-gen" && (
          <motion.div key="ai" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="panel">
             <div className="panel-title"><span>✦</span> AI Quiz Weaver</div>
             <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12, marginBottom: 14 }}>
                <div className="field-group">
                   <label className="field-label">Subject</label>
                   <input value={qaSubject} onChange={e => setQaSubject(e.target.value)} className="field-input" placeholder="Physics" />
                </div>
                <div className="field-group">
                   <label className="field-label">Questions</label>
                   <input value={qaCount} onChange={e => setQaCount(e.target.value)} className="field-input" type="number" />
                </div>
             </div>
             <div className="field-group">
                <label className="field-label">Focus Topic</label>
                <input value={qaTopic} onChange={e => setQaTopic(e.target.value)} className="field-input" placeholder="Quantum Mechanics basics..." />
             </div>
             <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setQuizView("list")} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button onClick={generateAIQuiz} className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                   {loading ? "AI is weaving questions..." : "Generate Pro Quiz"}
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
