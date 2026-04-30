
'use client';
import { motion } from "framer-motion";
import React from "react";
import { GlassPanel } from "../components/DashboardBase";

interface AnnouncementsViewProps {
  announcements: any[];
  annTitle: string; setAnnTitle: (v: string) => void;
  annBody: string; setAnnBody: (v: string) => void;
  annType: string; setAnnType: (v: string) => void;
  annTarget: string; setAnnTarget: (v: string) => void;
  students: any[];
  postAnnouncement: () => void;
  deleteAnnouncement: (id: string) => void;
  loading: boolean;
}

export const AnnouncementsView = React.memo(({
  announcements, annTitle, setAnnTitle, annBody, setAnnBody, annType, setAnnType, annTarget, setAnnTarget,
  students, postAnnouncement, deleteAnnouncement, loading
}: AnnouncementsViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Announcements</h1>
        <p className="page-sub">Broadcast updates and notices to your students</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr", gap: 24 }}>
         <GlassPanel title={<span>✍️</span> + " New Announcement"}>
            <div className="field-group">
               <label className="field-label">Announcement Title</label>
               <input value={annTitle} onChange={e => setAnnTitle(e.target.value)} className="field-input" placeholder="e.g. Unit Test Revised Date" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.fr 1fr", gap: 12, marginBottom: 14 }}>
               <div className="field-group" style={{marginBottom:0}}>
                  <label className="field-label">Type</label>
                  <select value={annType} onChange={e => setAnnType(e.target.value)} className="field-input">
                     <option value="info">📢 General Info</option>
                     <option value="urgent">🚨 Urgent</option>
                     <option value="event">📅 Event</option>
                  </select>
               </div>
               <div className="field-group" style={{marginBottom:0}}>
                  <label className="field-label">Audience</label>
                  <select value={annTarget} onChange={e => setAnnTarget(e.target.value)} className="field-input">
                     <option value="all">All Students</option>
                     {students.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
               </div>
            </div>
            <div className="field-group">
               <label className="field-label">Message Content</label>
               <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} className="field-input" rows={5} placeholder="Type your message here..." />
            </div>
            <button onClick={postAnnouncement} className="btn-primary" style={{ width: "100%" }} disabled={loading}>
               {loading ? "Broadcasting..." : "Post Announcement"}
            </button>
         </GlassPanel>

         <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h3 className="label-caps">Recent History ({announcements.length})</h3>
            {announcements.length === 0 ? (
               <div className="panel"><div className="empty-state">No announcements posted yet.</div></div>
            ) : (
               announcements.map(ann => (
                  <motion.div key={ann.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass" style={{ padding: 20 }}>
                     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <span className={`ann-badge ${ann.type === "urgent" ? "ann-urgent" : "ann-info"}`} style={{ 
                           background: ann.type === "urgent" ? "rgba(255,95,160,0.1)" : "rgba(124,111,255,0.1)",
                           color: ann.type === "urgent" ? "var(--accent2)" : "var(--accent)",
                           padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700
                        }}>
                           {ann.type.toUpperCase()}
                        </span>
                        <div style={{ fontSize: 10, color: "var(--muted)" }}>{new Date(ann.created_at).toLocaleDateString()}</div>
                     </div>
                     <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{ann.title}</div>
                     <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{ann.body}</div>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Target: {ann.target === "all" ? "All" : "Individual"}</div>
                        <button onClick={() => deleteAnnouncement(ann.id)} className="btn-ghost btn-sm" style={{ color: "var(--accent2)" }}>Delete</button>
                     </div>
                  </motion.div>
               ))
            )}
         </div>
      </div>
    </>
  );
});
