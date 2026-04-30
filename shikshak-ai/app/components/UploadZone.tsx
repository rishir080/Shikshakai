
'use client';
import React from "react";

interface UploadZoneProps {
  icon: string;
  label: string;
  desc: string;
  required?: boolean;
  setter: (f: File | null) => void;
  file: File | null;
}

export const UploadZone = React.memo(({ icon, label, desc, required, setter, file }: UploadZoneProps) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div 
      className={`upload-zone ${file ? "has-file" : ""}`}
      onClick={() => inputRef.current?.click()}
      style={{
        padding: "16px 20px",
        background: file ? "rgba(0,219,160,0.05)" : "rgba(255,255,255,0.03)",
        border: "1px dashed " + (file ? "var(--accent3)" : "var(--border)"),
        borderRadius: 12,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "all 0.2s"
      }}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={e => setter(e.target.files?.[0] || null)} 
        style={{ display: "none" }}
      />
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: file ? "var(--accent3)" : "var(--text)" }}>
          {label} {required && <span style={{ color: "var(--accent2)" }}>*</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{file ? `Selected: ${file.name}` : desc}</div>
      </div>
      {file && <div style={{ fontSize: 12, color: "var(--accent3)", fontWeight: 700 }}>✓ READY</div>}
    </div>
  );
});
