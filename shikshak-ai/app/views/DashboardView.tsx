
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel, StatCard } from "../components/DashboardBase";
import { getAvgClass } from "@/lib/utils";
import { GRADE_GROUPS } from "@/lib/constants";

interface DashboardViewProps {
  date: string;
  classAvg: number;
  students: any[];
  attendanceSummary: any;
  aiReport: string;
  weakReport: string;
  generateAIReport: () => void;
  generateWeakAI: () => void;
  deleteStudent: (id: number) => void;
  addStudent: () => void;
  name: string;
  setName: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  avg: string;
  setAvg: (v: string) => void;
  loading: boolean;
}

export const DashboardView = React.memo(({
  date,
  classAvg,
  students,
  aiReport,
  weakReport,
  generateAIReport,
  generateWeakAI,
  deleteStudent,
  addStudent,
  name,
  setName,
  grade,
  setGrade,
  avg,
  setAvg,
  loading
}: DashboardViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">{date} · Welcome back, Teacher</p>
      </div>

      <div className="stat-grid">
        <StatCard label="Class Average" value={`${classAvg}%`} sub={classAvg >= 75 ? "Excellent performance" : "Needs attention"} accent="stat-accent" />
        <StatCard label="Total Students" value={students.length} sub="Enrolled" delay={0.07} />
        <StatCard label="Top Performer" value={students.length ? Math.max(...students.map(s => Number(s.avg))) + "%" : "—"} sub="Highest score" accent="stat-accent3" delay={0.14} />
        <StatCard label="At Risk" value={students.filter(s => Number(s.avg) < 50).length} sub="Needs support" accent="stat-accent2" delay={0.21} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <GlassPanel title={<span>👨‍🎓</span> + " Student Roster"}>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Grade</th><th>Avg %</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td style={{ color: "var(--text)", fontWeight: 500 }}>{s.name}</td>
                      <td>{s.grade}</td>
                      <td><span className={`avg-badge ${getAvgClass(Number(s.avg))}`}>{s.avg}%</span></td>
                      <td>
                        <span style={{ fontSize: 11, color: Number(s.avg) >= 75 ? "var(--accent3)" : Number(s.avg) >= 50 ? "var(--gold)" : "var(--accent2)" }}>
                          {Number(s.avg) >= 75 ? "✓ Good" : Number(s.avg) >= 50 ? "△ Average" : "⚠ Weak"}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => deleteStudent(s.id)} className="btn-ghost btn-sm">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {!students.length && (
                    <tr><td colSpan={5}><div className="empty-state">No students found.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="divider" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px", gap: 12, alignItems: "flex-end" }}>
              <div className="field-group">
                <label className="field-label">Student Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="field-input" placeholder="Aarav Shah" />
              </div>
              <div className="field-group">
                <label className="field-label">Grade</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} className="field-input">
                  <option value="">— Select —</option>
                  {GRADE_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>{g.opts.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Avg %</label>
                <input value={avg} onChange={e => setAvg(e.target.value)} className="field-input" type="number" />
              </div>
              <button onClick={addStudent} className="btn-primary" style={{ height: 44 }}>+ Add</button>
            </div>
          </GlassPanel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <GlassPanel title={<span>✨</span> + " AI Performance Insights"}>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button onClick={generateAIReport} className="btn-primary btn-sm" disabled={loading}>Analyze Class</button>
              <button onClick={generateWeakAI} className="btn-ghost btn-sm" disabled={loading}>Identify Risks</button>
            </div>
            {aiReport && <div className="ai-output">{aiReport}</div>}
            {weakReport && <div className="ai-output-danger">{weakReport}</div>}
            {!aiReport && !weakReport && (
              <div className="empty-state">Run AI Analysis for personalized classroom insights.</div>
            )}
          </GlassPanel>
        </div>
      </div>
    </>
  );
});
