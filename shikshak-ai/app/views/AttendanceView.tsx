
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel, StatCard } from "../components/DashboardBase";

interface AttendanceViewProps {
  students: any[];
  attendance: any;
  setAttendance: (v: any) => void;
  attDate: string;
  setAttDate: (v: string) => void;
  saveAttendance: () => void;
  exportAttendance: () => void;
  attendanceSummary: any;
}

export const AttendanceView = React.memo(({
  students,
  attendance,
  setAttendance,
  attDate,
  setAttDate,
  saveAttendance,
  exportAttendance,
  attendanceSummary
}: AttendanceViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <p className="page-sub">Mark daily attendance and track consistency</p>
      </div>

      <div className="stat-grid">
        <StatCard label="Total Strength" value={students.length} sub="Enrolled students" accent="stat-accent" />
        <StatCard label="Records Saved" value={Object.values(attendanceSummary).length} sub="Students with data" accent="stat-accent3" delay={0.1} />
      </div>

      <GlassPanel title={<span>✅</span> + " Mark Attendance"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label className="field-label" style={{ marginBottom: 0 }}>Date:</label>
            <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="field-input" style={{ width: 180 }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={exportAttendance} className="btn-ghost">Export CSV</button>
            <button onClick={saveAttendance} className="btn-success">Save Attendance</button>
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Grade</th><th>Current Marks</th><th>Status Selection</th></tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                   <td style={{ color: "var(--text)", fontWeight: 500 }}>{s.name}</td>
                   <td>{s.grade}</td>
                   <td>{s.avg}%</td>
                   <td>
                      <div style={{ display: "flex", gap: 8 }}>
                         {["Present", "Absent", "Late", "Medical"].map(st => (
                            <button 
                              key={st}
                              onClick={() => setAttendance({ ...attendance, [s.id]: st })}
                              className={`btn-sm ${attendance[s.id] === st || (!attendance[s.id] && st === "Present") ? "btn-primary" : "btn-ghost"}`}
                              style={{fontSize:11, padding:"4px 10px"}}
                            >
                              {st}
                            </button>
                         ))}
                      </div>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </>
  );
});
