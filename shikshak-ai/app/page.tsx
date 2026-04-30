'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";
import { useRouter } from "next/navigation";
import { generateAILesson } from "@/lib/ai";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

type EvalStep = "idle" | "ocr" | "ai" | "done";
type Page = "dashboard" | "attendance" | "lesson" | "study" | "paper" | "announcements" | "analytics" | "quiz" | "settings";

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.cdnfonts.com/css/google-sans');
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:wght@400;700&display=swap');

  /* ── RESET & VARS ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#05050f; --surface:rgba(14,14,36,0.8); --surface2:rgba(18,18,44,0.85); --surface3:rgba(22,22,52,0.95);
    --border:rgba(255,255,255,0.07); --border2:rgba(255,255,255,0.14); --border-accent:rgba(124,111,255,0.35);
    --accent:#8875ff; --accent-dim:#5540cc; --accent-glow:rgba(136,117,255,0.28);
    --accent2:#ff5fa0; --accent3:#00dba0; --gold:#ffd060; --blue:#5ab4ff; --orange:#ff8c42;
    --text:#f0f0ff; --text2:#9090b8; --muted:#4a4a72;
    --radius:16px; --radius-sm:10px; --radius-lg:24px; --radius-xl:32px;
    --font-serif:'Fraunces',Georgia,serif; --font-sans:'Times New Roman', Times, serif; --font-mono:'JetBrains Mono',monospace;
    --sidebar-w:240px;
    --sidebar-collapsed:64px;
    --shadow-sm:0 2px 16px rgba(0,0,0,0.4);
    --shadow-md:0 8px 40px rgba(0,0,0,0.5);
    --shadow-lg:0 24px 70px rgba(0,0,0,0.6);
    --shadow-accent:0 8px 32px rgba(136,117,255,0.3);
    --shadow-accent2:0 8px 32px rgba(0,219,160,0.2);
  }
  html { scroll-behavior:smooth; }
  body { background:var(--bg); color:var(--text); font-family:var(--font-sans) !important; font-size:14px; line-height:1.6; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
  body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
    background: radial-gradient(ellipse 90% 70% at 15% -5%, rgba(136,117,255,0.11) 0%, transparent 55%),
                radial-gradient(ellipse 70% 60% at 85% 105%, rgba(0,219,160,0.07) 0%, transparent 55%),
                radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,95,160,0.03) 0%, transparent 60%);
  }
  body::after { content:''; position:fixed; inset:0; z-index:999; pointer-events:none;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='0.018'/%3E%3C/svg%3E"); }
  ::-webkit-scrollbar{width:4px;height:4px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:var(--muted);border-radius:4px;} ::-webkit-scrollbar-thumb:hover{background:var(--accent-dim);}


  /* ── FLOATING FAB TOGGLE ── */
  .edu-app{display:flex;min-height:100vh;position:relative;z-index:1;}
  
  .sidebar-fab {
    position:fixed;
    top:24px;
    left:24px;
    z-index:100;
    background:rgba(14,14,36,0.85);
    backdrop-filter:blur(12px);
    border:1px solid rgba(124,111,255,0.2);
    border-radius:100px;
    padding:6px 20px 6px 6px;
    display:flex;
    align-items:center;
    gap:12px;
    color:#fff;
    cursor:pointer;
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
    font-family:var(--font-sans);
  }
  .sidebar-fab:hover {
    background:rgba(124,111,255,0.15);
    border-color:rgba(124,111,255,0.4);
    transform:translateY(-2px);
    box-shadow:0 8px 30px rgba(124,111,255,0.2);
  }
  .sidebar-fab.hidden {
    opacity:0;
    pointer-events:none;
    transform:translateY(-20px);
  }
  .fab-icon {
    width:36px;
    height:36px;
    background:linear-gradient(135deg,rgba(124,111,255,0.35),rgba(74,63,181,0.6));
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:18px;
  }
  .fab-text {
    font-size:18px;
    font-weight:600;
    letter-spacing:0.5px;
  }

  /* ── BACKDROP ── */
  .sidebar-backdrop {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.5);
    backdrop-filter:blur(4px);
    z-index:190;
    animation:fadeIn 0.3s;
  }
  @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }

  /* ── DRAWER SIDEBAR ── */
  .sidebar-drawer {
    width:var(--sidebar-w);
    background:#080816;
    border-right:1px solid rgba(255,255,255,0.08);
    display:flex;
    flex-direction:column;
    position:fixed;
    top:0;
    bottom:0;
    left:calc(var(--sidebar-w) * -1.2);
    z-index:200;
    transition:left 0.4s cubic-bezier(0.16,1,0.3,1);
    box-shadow:20px 0 60px rgba(0,0,0,0.8);
    overflow:hidden;
  }
  .sidebar-drawer.open {
    left:0;
  }

  /* Logo area */
  .sidebar-logo{display:flex;align-items:center;padding:24px 16px 20px;border-bottom:1px solid rgba(255,255,255,0.05);}
  .sidebar-logo-row{display:flex;align-items:center;gap:13px;}
  .sidebar-logo-icon{width:40px;height:40px;min-width:40px;background:rgba(124,111,255,0.15);border:1px solid rgba(124,111,255,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
  .sidebar-logo-text{font-family:var(--font-serif);font-size:20px;color:#fff;letter-spacing:-0.3px;line-height:1;font-weight:600;}
  .sidebar-logo-sub{font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-top:6px;font-weight:500;}
  .close-sidebar-btn {
    margin-left:auto;
    background:none;
    border:none;
    color:var(--muted);
    font-size:28px;
    cursor:pointer;
    line-height:1;
    padding:0 8px;
    transition:color 0.2s;
  }
  .close-sidebar-btn:hover { color:#fff; }

  /* Nav */
  .sidebar-nav{flex:1;padding:20px 8px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;overflow-x:hidden;}
  .nav-section-label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding:10px 12px 6px;margin-top:8px;}
  .nav-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:500;color:var(--text2);transition:all 0.2s;border:1px solid transparent;background:none;width:100%;text-align:left;position:relative;font-family:var(--font-sans);}
  .nav-item:hover{background:rgba(255,255,255,0.05);color:var(--text);}
  .nav-item.active{background:rgba(124,111,255,0.1);color:var(--accent);font-weight:700;}
  .nav-icon{width:32px;height:32px;min-width:32px;border-radius:6px;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;transition:all 0.2s;}
  .nav-item.active .nav-icon{background:rgba(124,111,255,0.2);color:#fff;}
  .nav-badge{margin-left:auto;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:var(--accent2);color:#fff;flex-shrink:0;}

  /* Bottom */
  .sidebar-bottom{padding:12px 8px 20px;border-top:1px solid rgba(255,255,255,0.05);}
  .sidebar-user-card{background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;margin-bottom:12px;}
  .sidebar-user-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
  .sidebar-user-info{font-size:14px;color:var(--text);font-weight:600;}
  .sidebar-user-sub{font-size:13px;color:var(--muted);margin-top:2px;}
  .logout-btn{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:600;color:var(--muted);transition:all 0.2s;border:1px solid transparent;background:none;width:100%;text-align:left;font-family:var(--font-sans);}
  .logout-btn:hover{background:rgba(255,95,160,0.1);color:var(--accent2);}

  /* Main content */
  .main {
    flex:1;
    padding:80px 48px 40px; /* Leave space for FAB at top */
    min-height:100vh;
    width:100vw;
    max-width:100vw;
    margin:0;
    transition:filter 0.4s;
  }
  .edu-app.sidebar-open .main {
    filter:blur(4px) brightness(0.6);
    pointer-events:none;
  }
  .page-title{font-family:var(--font-serif);font-size:36px;color:#fff;letter-spacing:-0.5px;line-height:1.05;font-weight:400;font-style:italic;}
  .page-sub{font-size:12px;color:var(--muted);margin-top:6px;font-weight:300;letter-spacing:0.3px;}

  /* ── CARDS & PANELS ── */
  .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px;}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px;position:relative;overflow:hidden;transition:border-color 0.25s,transform 0.25s,box-shadow 0.25s;animation:fadeUp 0.4s cubic-bezier(0.4,0,0.2,1) both;}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);}
  .stat-card:hover{border-color:rgba(124,111,255,0.25);transform:translateY(-3px);box-shadow:var(--shadow-accent);}
  .stat-label{font-size:9px;font-weight:700;letter-spacing:2.8px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;}
  .stat-value{font-family:var(--font-serif);font-size:36px;color:#fff;line-height:1;font-weight:400;}
  .stat-sub{font-size:11px;color:var(--muted);margin-top:7px;font-weight:300;}
  .stat-accent{color:var(--accent);} .stat-accent2{color:var(--accent2);} .stat-accent3{color:var(--accent3);} .stat-gold{color:var(--gold);}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:26px 28px;margin-bottom:16px;position:relative;overflow:hidden;animation:fadeUp 0.4s cubic-bezier(0.4,0,0.2,1) both;}
  .panel::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent);}
  .panel-title{font-size:10px;font-weight:700;color:var(--text2);margin-bottom:22px;display:flex;align-items:center;gap:9px;letter-spacing:2px;text-transform:uppercase;}

  /* ── BUTTONS ── */
  .btn-primary{background:rgba(124,111,255,0.12);color:var(--accent);border:1px solid rgba(124,111,255,0.32);padding:10px 22px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;cursor:pointer;letter-spacing:0.3px;transition:all 0.18s;font-family:var(--font-sans);box-shadow:0 2px 12px rgba(124,111,255,0.1);}
  .btn-primary:hover{background:rgba(124,111,255,0.2);border-color:rgba(124,111,255,0.55);transform:translateY(-1px);box-shadow:var(--shadow-accent);color:#fff;}
  .btn-primary:disabled{opacity:0.4;cursor:not-allowed;transform:none;}
  .btn-success{background:rgba(0,219,160,0.08);color:var(--accent3);border:1px solid rgba(0,219,160,0.25);padding:10px 22px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.18s;font-family:var(--font-sans);}
  .btn-success:hover{background:rgba(0,219,160,0.16);border-color:rgba(0,219,160,0.4);transform:translateY(-1px);}
  .btn-danger{background:rgba(255,95,160,0.08);color:var(--accent2);border:1px solid rgba(255,95,160,0.25);padding:10px 22px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.18s;font-family:var(--font-sans);}
  .btn-danger:hover{background:rgba(255,95,160,0.16);border-color:rgba(255,95,160,0.4);transform:translateY(-1px);}
  .btn-ghost{background:rgba(255,255,255,0.03);color:var(--text2);border:1px solid var(--border);padding:10px 22px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.18s;font-family:var(--font-sans);}
  .btn-ghost:hover{background:rgba(255,255,255,0.07);border-color:var(--border2);color:var(--text);}
  .btn-gold{background:rgba(255,204,92,0.08);color:var(--gold);border:1px solid rgba(255,204,92,0.25);padding:10px 22px;border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.18s;font-family:var(--font-sans);}
  .btn-gold:hover{background:rgba(255,204,92,0.16);border-color:rgba(255,204,92,0.4);transform:translateY(-1px);}
  .btn-sm{padding:6px 14px;font-size:11px;}
  .btn-row{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px;}

  /* ── FORM ── */
  .field-group{display:flex;flex-direction:column;gap:7px;margin-bottom:16px;}
  .field-label{font-size:9.5px;font-weight:700;color:var(--text2);letter-spacing:1.8px;text-transform:uppercase;}
  .field-input{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:11px 15px;border-radius:var(--radius-sm);font-size:13px;font-family:var(--font-sans);transition:all 0.2s;width:100%;font-weight:300;}
  .field-input:focus{outline:none;border-color:rgba(124,111,255,0.45);background:var(--surface3);box-shadow:0 0 0 3px rgba(124,111,255,0.08);}
  .field-input::placeholder{color:var(--muted);font-weight:300;}

  /* ── TABLE ── */
  .data-table{width:100%;border-collapse:collapse;font-size:13px;}
  .data-table th{padding:10px 14px;text-align:left;font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);background:rgba(255,255,255,0.01);}
  .data-table td{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,0.025);color:var(--text2);font-weight:300;}
  .data-table tr:last-child td{border-bottom:none;}
  .data-table tr:hover td{background:rgba(255,255,255,0.018);color:var(--text);transition:all 0.15s;}
  .avg-badge{display:inline-flex;align-items:center;justify-content:center;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:600;}
  .avg-high{background:rgba(0,219,160,0.09);color:var(--accent3);border:1px solid rgba(0,219,160,0.2);}
  .avg-mid{background:rgba(255,204,92,0.09);color:var(--gold);border:1px solid rgba(255,204,92,0.2);}
  .avg-low{background:rgba(255,95,160,0.09);color:var(--accent2);border:1px solid rgba(255,95,160,0.2);}

  /* ── AI OUTPUTS ── */
  .ai-output{background:linear-gradient(135deg,rgba(124,111,255,0.04),rgba(74,63,181,0.02));border:1px solid rgba(124,111,255,0.15);border-radius:var(--radius);padding:22px 24px;margin-top:18px;font-size:13px;line-height:2;color:var(--text2);white-space:pre-wrap;font-family:var(--font-sans);font-weight:300;position:relative;}
  .ai-output::before{content:'CLASS ANALYSIS';position:absolute;top:-8px;left:16px;font-size:8px;font-weight:700;letter-spacing:2.5px;color:var(--accent);background:var(--surface);padding:0 8px;}
  .ai-output-danger{background:linear-gradient(135deg,rgba(255,95,160,0.04),transparent);border:1px solid rgba(255,95,160,0.15);border-radius:var(--radius);padding:22px 24px;margin-top:18px;font-size:13px;line-height:2;color:var(--text2);white-space:pre-wrap;font-family:var(--font-sans);font-weight:300;position:relative;}
  .ai-output-danger::before{content:'INTERVENTION NEEDED';position:absolute;top:-8px;left:16px;font-size:8px;font-weight:700;letter-spacing:2.5px;color:var(--accent2);background:var(--surface);padding:0 8px;}

  /* ── ATTENDANCE ── */
  .attendance-row{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:5px;transition:all 0.18s;position:relative;overflow:hidden;}
  .attendance-row:hover{border-color:var(--border2);background:var(--surface3);}
  .attendance-name{font-size:13px;font-weight:500;color:var(--text);}
  .att-select{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:7px 30px 7px 12px;border-radius:var(--radius-sm);font-size:12px;font-family:var(--font-sans);cursor:pointer;transition:border-color 0.2s;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%233c3c5c' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;font-weight:300;}
  .att-select:focus{outline:none;border-color:rgba(124,111,255,0.4);}
  .att-summary{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;}
  .att-pill{display:flex;align-items:center;gap:7px;padding:7px 15px;border-radius:100px;font-size:12px;font-weight:500;}
  .att-pill-present{background:rgba(0,219,160,0.08);border:1px solid rgba(0,219,160,0.22);color:var(--accent3);}
  .att-pill-absent{background:rgba(255,95,160,0.08);border:1px solid rgba(255,95,160,0.22);color:var(--accent2);}
  .att-pill-rate{background:rgba(124,111,255,0.08);border:1px solid rgba(124,111,255,0.22);color:var(--accent);}

  /* ── LOADING ── */
  .loading-bar{display:flex;align-items:center;gap:12px;background:rgba(124,111,255,0.07);border:1px solid rgba(124,111,255,0.2);border-radius:var(--radius);padding:13px 20px;margin-bottom:20px;font-size:12.5px;color:var(--accent);font-weight:400;letter-spacing:0.3px;}
  .spinner{width:15px;height:15px;border:2px solid rgba(124,111,255,0.2);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;}
  @keyframes spin{to{transform:rotate(360deg);}}

  /* ── LESSON ── */
  .lesson-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s;animation:fadeUp 0.35s ease both;}
  .lesson-section:hover{border-color:rgba(124,111,255,0.18);box-shadow:var(--shadow-md);}
  .lesson-section-header{display:flex;align-items:center;gap:13px;padding:15px 20px;cursor:pointer;user-select:none;transition:background 0.18s;}
  .lesson-section-header:hover{background:rgba(255,255,255,0.018);}
  .lesson-section-icon{width:34px;height:34px;border-radius:8px;background:rgba(124,111,255,0.08);border:1px solid rgba(124,111,255,0.14);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
  .lesson-section-title{font-size:13.5px;font-weight:500;color:var(--text);flex:1;}
  .lesson-section-body{font-size:13px;line-height:1.9;color:var(--text2);white-space:pre-wrap;border-top:1px solid var(--border);padding:18px 20px 20px 67px;font-weight:300;}
  .lesson-config{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
  .lesson-meta-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(124,111,255,0.05);border:1px solid rgba(124,111,255,0.14);border-radius:var(--radius-sm);margin-bottom:14px;flex-wrap:wrap;}
  .lesson-meta-item{font-size:11px;color:var(--accent);font-weight:500;display:flex;align-items:center;gap:5px;padding:3px 12px;background:rgba(124,111,255,0.08);border-radius:20px;}

  /* ── STUDY TOOL ── */
  .study-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s;animation:fadeUp 0.35s ease both;}
  .study-card:hover{border-color:rgba(124,111,255,0.2);box-shadow:var(--shadow-md);}
  .study-card-header{display:flex;align-items:center;gap:13px;padding:17px 22px;cursor:pointer;user-select:none;transition:background 0.18s;}
  .study-card-header:hover{background:rgba(255,255,255,0.014);}
  .study-card-header.open{border-bottom:1px solid var(--border);}
  .study-card-icon{width:40px;height:40px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;border:1px solid rgba(124,111,255,0.16);background:rgba(124,111,255,0.08);}
  .study-card-title{font-size:14px;font-weight:600;color:var(--text);flex:1;}
  .study-card-sub{font-size:11.5px;color:var(--muted);margin-top:2px;font-weight:300;}
  .study-card-body{padding:24px 26px;font-size:13.5px;line-height:2;color:var(--text2);font-weight:300;}
  .study-image-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
  .study-image-item{border-radius:12px;overflow:hidden;border:1px solid var(--border);background:var(--surface2);}
  .study-image-item img{width:100%;height:180px;object-fit:cover;display:block;transition:transform 0.3s;}
  .study-image-item:hover img{transform:scale(1.04);}
  .study-image-caption{padding:8px 13px;font-size:11px;color:var(--muted);font-weight:300;line-height:1.4;}

  /* ── PAPER EVAL ── */
  .eval-steps{display:flex;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:100px;padding:6px;margin-bottom:30px;gap:3px;width:fit-content;}
  .eval-step-pill{display:flex;align-items:center;gap:7px;padding:7px 18px;border-radius:100px;font-size:11.5px;font-weight:500;color:var(--muted);transition:all 0.3s;}
  .eval-step-pill.active{background:rgba(124,111,255,0.14);color:var(--accent);border:1px solid rgba(124,111,255,0.28);}
  .eval-step-pill.done{background:rgba(0,219,160,0.08);color:var(--accent3);border:1px solid rgba(0,219,160,0.2);}
  .eval-step-num{width:20px;height:20px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;}
  .eval-step-sep{width:22px;height:1px;background:var(--muted);flex-shrink:0;opacity:0.35;}
  .upload-zone{background:var(--surface2);border:1.5px dashed rgba(124,111,255,0.22);border-radius:var(--radius);padding:20px;transition:all 0.22s;cursor:pointer;position:relative;}
  .upload-zone:hover{border-color:rgba(124,111,255,0.5);background:rgba(124,111,255,0.035);}
  .upload-zone.has-file{border-color:rgba(0,219,160,0.38)!important;background:rgba(0,219,160,0.025)!important;}
  .upload-zone-inner{display:flex;align-items:center;gap:15px;}
  .upload-zone-icon{width:44px;height:44px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:19px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03);transition:all 0.22s;}
  .upload-zone.has-file .upload-zone-icon{background:rgba(0,219,160,0.1);border-color:rgba(0,219,160,0.22);}
  .upload-zone-label{font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;display:flex;align-items:center;gap:8px;}
  .upload-req-badge{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(124,111,255,0.1);color:var(--accent);border:1px solid rgba(124,111,255,0.22);}
  .upload-opt-badge{font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--muted);border:1px solid rgba(255,255,255,0.09);}
  .upload-zone-desc{font-size:12px;color:var(--muted);font-weight:300;line-height:1.5;}
  .upload-zone-desc.success{color:var(--accent3);font-weight:400;}
  .upload-zone input[type="file"]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
  .eval-cta-wrap{background:linear-gradient(135deg,rgba(124,111,255,0.07),rgba(0,219,160,0.04));border:1px solid rgba(124,111,255,0.2);border-radius:var(--radius);padding:24px 26px;display:flex;align-items:center;gap:20px;}
  .eval-cta-btn{padding:13px 32px;border:none;border-radius:var(--radius-sm);background:linear-gradient(135deg,#7c6fff,#4a3fb5);color:#fff;font-family:var(--font-sans);font-size:13.5px;font-weight:600;cursor:pointer;transition:all 0.22s;box-shadow:0 6px 26px rgba(124,111,255,0.32);}
  .eval-cta-btn:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(124,111,255,0.45);}
  .eval-cta-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;}
  .progress-screen{padding:48px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:16px;}
  .progress-icon{width:68px;height:68px;border-radius:50%;margin:0 auto 22px;background:rgba(124,111,255,0.09);border:1px solid rgba(124,111,255,0.22);display:flex;align-items:center;justify-content:center;font-size:28px;animation:iconPulse 2s ease-in-out infinite;}
  @keyframes iconPulse{0%,100%{box-shadow:0 0 40px rgba(124,111,255,0.2);}50%{box-shadow:0 0 70px rgba(124,111,255,0.38);}}
  .score-hero{display:grid;grid-template-columns:2fr 1fr 1fr;gap:13px;margin-bottom:18px;}
  .score-hero-main{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:30px 32px;display:flex;align-items:center;gap:26px;position:relative;overflow:hidden;animation:fadeUp 0.4s ease both;}
  .score-hero-main::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent),var(--accent3),transparent);}
  .score-big{font-family:var(--font-serif);font-size:60px;line-height:1;font-weight:400;}
  .score-big sub{font-family:var(--font-sans);font-size:22px;color:var(--muted);font-weight:300;}
  .score-bar-track{height:6px;background:rgba(255,255,255,0.05);border-radius:20px;overflow:hidden;margin-bottom:9px;}
  .score-bar-fill{height:100%;border-radius:20px;transition:width 1.5s cubic-bezier(0.4,0,0.2,1);}
  .score-card-sm{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px 22px;text-align:center;position:relative;overflow:hidden;animation:fadeUp 0.4s ease both;}
  .score-card-sm::before{content:'';position:absolute;top:0;left:20%;right:20%;height:1px;background:linear-gradient(90deg,transparent,rgba(124,111,255,0.18),transparent);}
  .score-card-val{font-family:var(--font-serif);font-size:42px;line-height:1;margin-bottom:8px;font-weight:400;}
  .score-card-lbl{font-size:9px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:var(--muted);}
  .eval-table{width:100%;border-collapse:collapse;font-size:13px;}
  .eval-table th{padding:10px 14px;text-align:left;font-size:8.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);background:rgba(255,255,255,0.01);}
  .eval-table td{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,0.022);vertical-align:top;line-height:1.7;font-size:12.5px;color:var(--text2);font-weight:300;}
  .eval-table tr:last-child td{border-bottom:none;}
  .eval-table tr:hover td{background:rgba(255,255,255,0.016);transition:all 0.15s;}
  .marks-full{color:var(--accent3);font-weight:600;} .marks-partial{color:var(--gold);font-weight:600;} .marks-zero{color:var(--accent2);font-weight:600;}
  .feedback-hero{background:linear-gradient(135deg,rgba(124,111,255,0.05),rgba(0,219,160,0.03));border:1px solid rgba(124,111,255,0.14);border-radius:var(--radius);padding:24px 28px;font-size:14px;line-height:2;color:var(--text2);font-weight:300;font-style:italic;}

  /* ── ANNOUNCEMENTS ── */
  .ann-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:20px 22px;margin-bottom:9px;transition:border-color 0.2s,transform 0.18s;position:relative;overflow:hidden;}
  .ann-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--accent),var(--accent3));}
  .ann-card:hover{border-color:rgba(124,111,255,0.25);transform:translateX(3px);}
  .ann-badge{font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:3px 9px;border-radius:4px;}
  .ann-info{background:rgba(124,111,255,0.1);color:var(--accent);border:1px solid rgba(124,111,255,0.22);}
  .ann-urgent{background:rgba(255,95,160,0.1);color:var(--accent2);border:1px solid rgba(255,95,160,0.22);}
  .ann-event{background:rgba(255,204,92,0.1);color:var(--gold);border:1px solid rgba(255,204,92,0.22);}
  .ann-homework{background:rgba(0,219,160,0.1);color:var(--accent3);border:1px solid rgba(0,219,160,0.22);}

  /* ── ANALYTICS ── */
  .custom-tooltip{background:var(--surface3);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:9px 15px;font-size:12px;color:var(--text);box-shadow:var(--shadow-lg);}
  .chart-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
  .insight-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}
  .insight-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;transition:border-color 0.2s;}
  .insight-card:hover{border-color:rgba(124,111,255,0.2);}
  .insight-label{font-size:9px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;}
  .insight-value{font-family:var(--font-serif);font-size:28px;color:var(--text);font-weight:400;}
  .insight-sub{font-size:11px;color:var(--muted);margin-top:4px;font-weight:300;}

  /* ── QUIZ / PROCTORING ── */
  .quiz-builder-grid{display:grid;grid-template-columns:1fr 340px;gap:18px;}
  .q-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:8px;transition:border-color 0.2s,box-shadow 0.2s;position:relative;}
  .q-card:hover{border-color:rgba(124,111,255,0.2);box-shadow:var(--shadow-sm);}
  .q-card-num{font-family:var(--font-serif);font-size:20px;color:var(--accent);font-weight:400;flex-shrink:0;}
  .q-option-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;}
  .q-option-radio{width:18px;height:18px;border-radius:50%;border:2px solid var(--muted);flex-shrink:0;cursor:pointer;transition:border-color 0.2s;}
  .q-option-radio.correct{border-color:var(--accent3);background:rgba(0,219,160,0.15);}
  .proctor-status{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:var(--radius-sm);font-size:12px;font-weight:500;margin-bottom:10px;}
  .proctor-ok{background:rgba(0,219,160,0.07);border:1px solid rgba(0,219,160,0.2);color:var(--accent3);}
  .proctor-warn{background:rgba(255,204,92,0.07);border:1px solid rgba(255,204,92,0.2);color:var(--gold);}
  .proctor-fail{background:rgba(255,95,160,0.07);border:1px solid rgba(255,95,160,0.2);color:var(--accent2);}
  .proctor-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex-shrink:0;}
  .proctor-dot.pulse{animation:procDot 1.2s ease-in-out infinite;}
  @keyframes procDot{0%,100%{opacity:1;}50%{opacity:0.3;}}
  .session-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;margin-bottom:8px;display:flex;align-items:center;gap:16px;transition:border-color 0.2s;}
  .session-card:hover{border-color:rgba(124,111,255,0.2);}
  .session-status-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
  .session-live{background:var(--accent3);box-shadow:0 0 8px rgba(0,219,160,0.5);animation:livePulse 2s ease-in-out infinite;}
  .session-ended{background:var(--muted);}
  @keyframes livePulse{0%,100%{box-shadow:0 0 8px rgba(0,219,160,0.5);}50%{box-shadow:0 0 16px rgba(0,219,160,0.9);}}
  .quiz-result-row{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 16px;margin-bottom:7px;display:flex;align-items:center;gap:14px;}
  .quiz-result-score{font-family:var(--font-serif);font-size:22px;color:var(--accent);font-weight:400;}
  .proctor-log{background:var(--surface3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;font-family:var(--font-mono);font-size:11px;color:var(--muted);line-height:1.9;max-height:160px;overflow-y:auto;margin-top:10px;}
  .proctor-log .log-warn{color:var(--gold);}
  .proctor-log .log-fail{color:var(--accent2);}
  .proctor-log .log-ok{color:var(--accent3);}
  .cam-preview{border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);background:#000;position:relative;}
  .cam-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);font-size:13px;color:var(--muted);}
  .face-box{position:absolute;border:2px solid var(--accent3);border-radius:6px;transition:all 0.1s;}
  .face-box.no-face{border-color:var(--accent2);}

  /* ── MISC ── */
  .divider{border:none;border-top:1px solid var(--border);margin:24px 0;}
  .context-info{display:flex;gap:11px;padding:14px 18px;background:rgba(255,204,92,0.04);border:1px solid rgba(255,204,92,0.17);border-radius:var(--radius-sm);margin-bottom:16px;font-size:12.5px;color:var(--text2);line-height:1.7;font-weight:300;}
  .empty-state{text-align:center;padding:48px 24px;color:var(--muted);font-size:13px;font-weight:300;}
  .empty-state-icon{font-size:40px;margin-bottom:14px;opacity:0.45;}
  .marks-example{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 16px;margin-bottom:13px;font-size:12px;line-height:1.85;color:var(--muted);font-weight:300;font-family:var(--font-mono);}
  .upload-section-header{display:flex;align-items:center;gap:13px;margin-bottom:18px;}
  .upload-section-num{width:28px;height:28px;border-radius:50%;background:rgba(124,111,255,0.1);border:1px solid rgba(124,111,255,0.28);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;color:var(--accent);flex-shrink:0;}
  .upload-section-title{font-size:13px;font-weight:600;color:var(--text);}
  .upload-section-sub{font-size:11.5px;color:var(--muted);margin-top:1px;}
  .source-badge{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:4px;}
  .source-paper{background:rgba(255,204,92,0.1);color:var(--gold);border:1px solid rgba(255,204,92,0.22);}
  .source-dist{background:rgba(124,111,255,0.1);color:var(--accent);border:1px solid rgba(124,111,255,0.22);}
  .progress-steps{display:flex;flex-direction:column;gap:8px;width:100%;max-width:420px;margin:0 auto;}
  .progress-step-row{display:flex;align-items:center;gap:12px;padding:10px 18px;border-radius:var(--radius-sm);font-size:12.5px;transition:all 0.3s;}
  .progress-step-row.waiting{color:var(--muted);background:rgba(255,255,255,0.02);}
  .progress-step-row.running{color:var(--accent);background:rgba(124,111,255,0.07);border:1px solid rgba(124,111,255,0.2);}
  .progress-step-row.complete{color:var(--accent3);background:rgba(0,219,160,0.04);border:1px solid rgba(0,219,160,0.16);}
  .progress-step-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex-shrink:0;}
  .progress-step-row.running .progress-step-dot{animation:dotPulse 1.2s ease-in-out infinite;}
  @keyframes dotPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(0.6);}}

  @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes shake{0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-6px);}40%,80%{transform:translateX(6px);}}

  /* ── AURORA & EFFECTS ── */
  .aurora-wrap{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
  .aurora-blob{position:absolute;border-radius:50%;filter:blur(90px);animation:auroraFloat 22s infinite alternate ease-in-out;}
  .blob-1{width:700px;height:700px;background:rgba(136,117,255,0.12);top:-15%;left:-10%;animation-duration:28s;}
  .blob-2{width:600px;height:600px;background:rgba(0,219,160,0.07);bottom:-15%;right:-8%;animation-duration:20s;animation-delay:-8s;}
  .blob-3{width:400px;height:400px;background:rgba(255,95,160,0.06);top:40%;left:45%;animation-duration:16s;animation-delay:-4s;}
  @keyframes auroraFloat{0%{transform:translate(0,0) scale(1);}50%{transform:translate(60px,40px) scale(1.08);}100%{transform:translate(-30px,70px) scale(0.94);}}

  /* ── AI CO-TEACHER SIDECAR ── */
  .co-teacher-fab{position:fixed;bottom:24px;right:24px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
  .co-teacher-btn{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dim));border:1px solid rgba(255,255,255,0.18);box-shadow:0 8px 32px rgba(136,117,255,0.4),0 0 0 0 rgba(136,117,255,0.3);display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;transition:all 0.25s;animation:fabulousPulse 3s ease-in-out infinite;}
  .co-teacher-btn:hover{transform:scale(1.1);box-shadow:0 12px 40px rgba(136,117,255,0.6);}
  @keyframes fabulousPulse{0%,100%{box-shadow:0 8px 32px rgba(136,117,255,0.4),0 0 0 0 rgba(136,117,255,0.3);}60%{box-shadow:0 8px 32px rgba(136,117,255,0.4),0 0 0 12px rgba(136,117,255,0);}}
  .co-teacher-card{width:300px;background:rgba(8,8,28,0.95);border:1px solid rgba(136,117,255,0.4);border-radius:18px;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 30px rgba(136,117,255,0.15);backdrop-filter:blur(32px);}
  .co-teacher-header{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
  .co-teacher-dot{width:8px;height:8px;border-radius:50%;background:var(--accent3);box-shadow:0 0 8px var(--accent3);animation:dotPulse 2s ease-in-out infinite;}
  .co-teacher-label{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent3);}
  .co-teacher-text{font-size:12.5px;line-height:1.7;color:var(--text2);font-style:italic;font-weight:300;}
  .ocr-bench-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;}
  .ocr-result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px;}
  .ocr-res-box{background:var(--surface);border:1px solid var(--border);padding:12px;border-radius:var(--radius-sm);font-size:11px;color:var(--text2);font-family:var(--font-mono);max-height:200px;overflow-y:auto;}
`;

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const NAV_MAIN = [
  { id:"dashboard",     icon:"⚡", label:"Dashboard"        },
  { id:"analytics",     icon:"📊", label:"Analytics"        },
  { id:"attendance",    icon:"✅", label:"Attendance"        },
  { id:"announcements", icon:"📢", label:"Announcements"    },
];
const NAV_TOOLS = [
  { id:"quiz",    icon:"🎯", label:"Quiz & Tests",     badge:"NEW" },
  { id:"lesson",  icon:"📋", label:"Lesson Planner"    },
  { id:"study",   icon:"🔬", label:"Study Tool"        },
  { id:"paper",   icon:"📄", label:"Document AI",      badge:"AI"  },
];
const GRADE_GROUPS = [
  { label:"School", opts:["Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"] },
  { label:"College", opts:["1st Year","2nd Year","3rd Year","4th Year","Postgraduate Y1","Postgraduate Y2","PhD"] },
];
const PIE_COLORS = ["#7c6fff","#00dba0","#ffcc5c","#ff5fa0","#5ab4ff","#ff8c42"];

// ─────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="custom-tooltip">
        <p style={{fontWeight:600,marginBottom:3}}>{label}</p>
        {payload.map((p:any,i:number)=>(
          <p key={i} style={{color:p.color||"var(--accent)"}}>{p.name}: {p.value}{typeof p.value==="number"&&p.name!=="Students"?"%":""}</p>
        ))}
      </div>
    );
  }
  return null;
}

function LessonSection({ icon, title, body }: { icon:string; title:string; body:string }) {
  const [open,setOpen]=useState(true);
  return (
    <div className="lesson-section">
      <div className="lesson-section-header" onClick={()=>setOpen(!open)}>
        <div className="lesson-section-icon">{icon}</div>
        <div className="lesson-section-title">{title}</div>
        <span style={{color:"var(--muted)",fontSize:10,transform:open?"rotate(180deg)":"none",transition:"transform 0.25s",display:"inline-block"}}>▼</span>
      </div>
      {open && <div className="lesson-section-body">{body}</div>}
    </div>
  );
}

function UploadZone({ icon,label,desc,required,setter,file }:{ icon:string;label:string;desc:string;required:boolean;setter:(f:File|null)=>void;file:File|null }) {
  return (
    <div className={`upload-zone ${file?"has-file":""}`}>
      <div className="upload-zone-inner">
        <div className="upload-zone-icon">{file?"✅":icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div className="upload-zone-label">
            {label}
            {required?<span className="upload-req-badge">Required</span>:<span className="upload-opt-badge">Optional</span>}
          </div>
          <div className={`upload-zone-desc ${file?"success":""}`}>{file?`✓ ${file.name}`:desc}</div>
        </div>
        <span style={{fontSize:11,color:"var(--accent)",fontWeight:500,flexShrink:0,paddingLeft:12}}>{file?"Change":"Upload ↑"}</span>
      </div>
      <input type="file" accept="image/*,.pdf" onChange={e=>setter(e.target.files?.[0]||null)}/>
    </div>
  );
}

function StudyCard({ icon,title,subtitle,children }:{ icon:string;title:string;subtitle:string;children:React.ReactNode }) {
  const [open,setOpen]=useState(true);
  return (
    <div className="study-card">
      <div className={`study-card-header ${open?"open":""}`} onClick={()=>setOpen(!open)}>
        <div className="study-card-icon">{icon}</div>
        <div style={{flex:1}}>
          <div className="study-card-title">{title}</div>
          <div className="study-card-sub">{subtitle}</div>
        </div>
        <span style={{color:"var(--muted)",fontSize:10,transform:open?"rotate(180deg)":"none",transition:"transform 0.25s",display:"inline-block"}}>▼</span>
      </div>
      {open && <div className="study-card-body">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// PROCTORED QUIZ STUDENT VIEW (Embedded Modal)
// This is what students see in the SAME browser tab
// ─────────────────────────────────────────────
function ProctoredQuizModal({ quiz, onClose }: { quiz: any; onClose: (results: any) => void }) {
  const [answers, setAnswers] = useState<Record<number,number>>({});
  const [timeLeft, setTimeLeft] = useState(quiz.duration * 60);
  const [logs, setLogs] = useState<{t:string;msg:string;type:string}[]>([]);
  const [faceStatus, setFaceStatus] = useState<"ok"|"warn"|"fail">("ok");
  const [tabViolations, setTabViolations] = useState(0);
  const [faceViolations, setFaceViolations] = useState(0);
  const [terminated, setTerminated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [camError, setCamError] = useState("");
  const [facesDetected, setFacesDetected] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const tabViolRef = useRef(0);
  const faceViolRef = useRef(0);
  const terminatedRef = useRef(false);
  const faceCheckInterval = useRef<any>(null);
  const timerInterval = useRef<any>(null);

  const addLog = useCallback((msg:string, type:"ok"|"warn"|"fail") => {
    const t = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), {t, msg, type}]);
  }, []);

  const terminate = useCallback((reason:string) => {
    if (terminatedRef.current) return;
    terminatedRef.current = true;
    setTerminated(true);
    addLog(`❌ TEST TERMINATED: ${reason}`, "fail");
    clearInterval(faceCheckInterval.current);
    clearInterval(timerInterval.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  }, [addLog]);

  const autoSubmit = useCallback(() => {
    if (terminatedRef.current || submitted) return;
    setSubmitted(true);
    clearInterval(timerInterval.current);
    clearInterval(faceCheckInterval.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    // calculate score
    let correct = 0;
    quiz.questions.forEach((q: any, i: number) => {
      if (answers[i] === q.correct) correct++;
    });
    onClose({ correct, total: quiz.questions.length, answers, logs, terminated: false, timeUp: true });
  }, [answers, quiz, onClose, logs, submitted]);

  // Timer
  useEffect(() => {
    timerInterval.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { autoSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerInterval.current);
  }, [autoSubmit]);

  // Tab visibility detection
  useEffect(() => {
    const handleVisChange = () => {
      if (document.hidden && !terminatedRef.current) {
        tabViolRef.current++;
        setTabViolations(tabViolRef.current);
        addLog(`⚠ Tab switch / app switch detected (violation #${tabViolRef.current})`, "warn");
        if (tabViolRef.current >= 3) {
          terminate("3 tab switches detected — possible cheating");
        }
      }
    };
    const handleBlur = () => {
      if (!terminatedRef.current) {
        tabViolRef.current++;
        setTabViolations(tabViolRef.current);
        addLog(`⚠ Window focus lost (violation #${tabViolRef.current})`, "warn");
        if (tabViolRef.current >= 3) {
          terminate("Repeated window switching detected");
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisChange);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [addLog, terminate]);

  // Right-click & copy prevention
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
    };
  }, []);

  // Camera + Face Detection using color analysis heuristic
  useEffect(() => {
    let mounted = true;
    const startCam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width:320, height:240, facingMode:"user" } });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          const video = videoRef.current;
          // ✅ FIX: Use onloadedmetadata to ensure stream is ready before play()
          // This prevents "play() interrupted by new load request" error
          video.onloadedmetadata = () => {
            if (!mounted) return;
            video.play().catch(() => {
              // Silently ignore — stream may have been stopped already
            });
            addLog("✓ Camera started successfully", "ok");
          };
          video.srcObject = stream;
        }
      } catch (e) {
        setCamError("Camera access denied — proctoring requires camera");
        addLog("❌ Camera access denied", "fail");
      }
    };
    startCam();

    // ─── ADVANCED FRAME ANALYSIS ───
    // Uses spatial region segmentation to:
    // 1. Count face-like skin regions (multiple people detection)
    // 2. Detect bright screen/electronic device glow (blue-white light patterns)
    // 3. Check for sudden scene changes (person left camera area)
    const detectFace = () => {
      if (!videoRef.current || !canvasRef.current || !mounted || terminatedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Use 160x120 for better spatial resolution
      canvas.width = 160; canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);
      const imgData = ctx.getImageData(0, 0, 160, 120).data;
      const W = 160, H = 120, TOTAL = W * H;

      let skinPixels = 0;
      let brightScreenPixels = 0; // detect phone/laptop screen glow
      let darkPixels = 0;

      // Divide into 4 horizontal regions to detect face positions
      // Region-based skin detection helps separate 2 people side by side
      const regionSkin = [0, 0, 0, 0]; // left, center-left, center-right, right
      const regionW = W / 4;

      for (let idx = 0; idx < imgData.length; idx += 4) {
        const r = imgData[idx], g = imgData[idx+1], b = imgData[idx+2];
        const pixelNum = (idx / 4);
        const px = pixelNum % W;
        const region = Math.min(3, Math.floor(px / regionW));

        // ── Skin tone detection (works for multiple skin tones) ──
        // Covers fair, medium, and dark skin tones
        const isSkin = (
          // Fair/medium skin
          (r > 95 && g > 40 && b > 20 &&
           r > g && r > b &&
           Math.abs(r - g) > 15 &&
           r - Math.min(g, b) > 15 &&
           r < 250) ||
          // Darker skin tones (higher saturation difference)
          (r > 60 && g > 30 && b > 15 &&
           r > g * 1.15 && r > b * 1.2 &&
           r - b > 20)
        );

        if (isSkin) {
          skinPixels++;
          regionSkin[region]++;
        }

        // ── Electronic device / phone screen detection ──
        // Screens emit blue-white light: high brightness, blue-ish or neutral cool tone
        const brightness = (r + g + b) / 3;
        const isScreenGlow = (
          brightness > 200 &&                    // very bright
          Math.abs(r - g) < 30 &&               // neutral/cool (not skin warm)
          b >= g * 0.85 &&                       // blue component strong
          !(r > g && r > b && r - b > 25)        // not warm/skin colored
        );
        if (isScreenGlow) brightScreenPixels++;

        // Dark pixels (person moved away)
        if (brightness < 30) darkPixels++;
      }

      const skinRatio = skinPixels / TOTAL;
      const screenRatio = brightScreenPixels / TOTAL;
      const darkRatio = darkPixels / TOTAL;

      // ── Count skin-active regions (detect multiple people) ──
      // Each region is ~40px wide — a face occupies roughly 1-2 regions
      // If 3+ regions have significant skin → multiple people likely
      const activeSkinRegions = regionSkin.filter(s => s > (H * regionW * 0.06)).length;

      // ── Detect screen/device in frame ──
      // If >8% of frame is screen-glow AND there is a face → phone/laptop present
      const screenDetected = screenRatio > 0.08 && skinRatio > 0.03;

      // ── Detect multiple people ──
      // 3+ active skin regions OR very high skin ratio in spread-out pattern
      const multiplePeopleDetected = activeSkinRegions >= 3 ||
        (activeSkinRegions === 2 && regionSkin[0] > H * regionW * 0.08 && regionSkin[3] > H * regionW * 0.08);

      // ─── ACT ON DETECTIONS ───
      if (skinRatio < 0.025 && darkRatio < 0.7) {
        // No face, normal lighting — person stepped away
        setFaceStatus("fail");
        setFacesDetected(0);
        faceViolRef.current++;
        setFaceViolations(faceViolRef.current);
        addLog(`⚠ Face not detected in camera (violation #${faceViolRef.current})`, "warn");
        if (faceViolRef.current >= 5) {
          terminate("Face absent from camera for extended duration");
        }
      } else if (screenDetected) {
        // Electronic device (phone/laptop/tablet) detected in frame
        setFaceStatus("warn");
        faceViolRef.current++;
        setFaceViolations(faceViolRef.current);
        addLog(`⚠ Electronic device / screen detected in camera (violation #${faceViolRef.current})`, "warn");
        if (faceViolRef.current >= 4) {
          terminate("Electronic device repeatedly detected in camera view");
        }
      } else if (multiplePeopleDetected) {
        // Multiple people in frame
        setFaceStatus("warn");
        setFacesDetected(activeSkinRegions);
        faceViolRef.current++;
        setFaceViolations(faceViolRef.current);
        addLog(`⚠ Multiple people detected in camera (${activeSkinRegions} face regions, violation #${faceViolRef.current})`, "warn");
        if (faceViolRef.current >= 4) {
          terminate("Multiple people detected repeatedly — possible external assistance");
        }
      } else if (skinRatio < 0.025 && darkRatio >= 0.7) {
        // Camera covered or very dark
        setFaceStatus("fail");
        faceViolRef.current++;
        setFaceViolations(faceViolRef.current);
        addLog(`⚠ Camera appears blocked or covered (violation #${faceViolRef.current})`, "warn");
        if (faceViolRef.current >= 3) {
          terminate("Camera blocked — proctoring cannot continue");
        }
      } else {
        // All clear
        setFaceStatus("ok");
        setFacesDetected(1);
      }
    };
    faceCheckInterval.current = setInterval(detectFace, 2500); // check every 2.5s for responsiveness
    return () => {
      mounted = false;
      clearInterval(faceCheckInterval.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [addLog, terminate]);

  const handleSubmit = () => {
    if (submitted || terminated) return;
    setSubmitted(true);
    clearInterval(timerInterval.current);
    clearInterval(faceCheckInterval.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    let correct = 0;
    quiz.questions.forEach((q: any, i: number) => {
      if (answers[i] === q.correct) correct++;
    });
    onClose({ correct, total: quiz.questions.length, answers, logs, terminated: false, timeUp: false });
  };

  const mins = Math.floor(timeLeft/60).toString().padStart(2,"0");
  const secs = (timeLeft%60).toString().padStart(2,"0");
  const timerColor = timeLeft < 300 ? "var(--accent2)" : timeLeft < 600 ? "var(--gold)" : "var(--accent3)";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",backdropFilter:"blur(16px)",zIndex:1000,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Top bar */}
      <div style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",padding:"12px 28px",display:"flex",alignItems:"center",gap:20,flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,color:"var(--muted)",marginBottom:2}}>Proctored Exam</div>
          <div style={{fontSize:15,fontWeight:600,color:"var(--text)"}}>{quiz.title}</div>
        </div>
        {/* Violations */}
        <div style={{display:"flex",gap:10}}>
          <div style={{textAlign:"center",padding:"6px 14px",background:"rgba(255,204,92,0.08)",border:"1px solid rgba(255,204,92,0.2)",borderRadius:8}}>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--font-serif)",color:"var(--gold)"}}>{tabViolations}</div>
            <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>TAB VIOLATIONS</div>
          </div>
          <div style={{textAlign:"center",padding:"6px 14px",background:"rgba(255,95,160,0.08)",border:"1px solid rgba(255,95,160,0.2)",borderRadius:8}}>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--font-serif)",color:"var(--accent2)"}}>{faceViolations}</div>
            <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>FACE ALERTS</div>
          </div>
        </div>
        {/* Timer */}
        <div style={{textAlign:"center",padding:"8px 20px",background:timeLeft<300?"rgba(255,95,160,0.08)":"rgba(0,219,160,0.06)",border:`1px solid ${timeLeft<300?"rgba(255,95,160,0.25)":"rgba(0,219,160,0.2)"}`,borderRadius:10}}>
          <div style={{fontSize:26,fontWeight:700,fontFamily:"var(--font-mono)",color:timerColor,letterSpacing:2}}>{mins}:{secs}</div>
          <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>REMAINING</div>
        </div>
        {/* Face status */}
        <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",gap:4}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:faceStatus==="ok"?"var(--accent3)":faceStatus==="warn"?"var(--gold)":"var(--accent2)",boxShadow:faceStatus==="ok"?"0 0 8px var(--accent3)":faceStatus==="fail"?"0 0 8px var(--accent2)":"none",animation:faceStatus!=="ok"?"procDot 1s infinite":"none"}}/>
          <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:0.5}}>{faceStatus==="ok"?"FACE OK":faceStatus==="warn"?"MULTIPLE?":"NO FACE"}</div>
        </div>
      </div>

      {terminated ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" as const,gap:20}}>
          <div style={{fontSize:64}}>🚫</div>
          <div style={{fontFamily:"var(--font-serif)",fontSize:28,color:"var(--accent2)",fontWeight:400}}>Test Terminated</div>
          <div style={{fontSize:14,color:"var(--muted)",maxWidth:420,textAlign:"center",lineHeight:1.7}}>
            This test has been automatically terminated due to proctoring violations. The teacher has been notified with full violation logs.
          </div>
          <button onClick={()=>onClose({ correct:0, total:quiz.questions.length, answers:{}, logs, terminated:true, timeUp:false })} className="btn-danger" style={{marginTop:10}}>Close & Report to Teacher</button>
        </div>
      ) : submitted ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" as const,gap:16}}>
          <div style={{fontSize:64}}>✅</div>
          <div style={{fontFamily:"var(--font-serif)",fontSize:28,color:"var(--accent3)",fontWeight:400}}>Submitted!</div>
          <div style={{fontSize:14,color:"var(--muted)"}}>{Object.keys(answers).length} of {quiz.questions.length} questions answered</div>
        </div>
      ) : (
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 300px",overflow:"hidden"}}>
          {/* Questions */}
          <div style={{padding:"24px 32px",overflowY:"auto"}}>
            {quiz.questions.map((q:any, qi:number) => (
              <div key={qi} className="q-card" style={{borderColor:answers[qi]!==undefined?"rgba(124,111,255,0.25)":undefined}}>
                <div style={{display:"flex",gap:14,marginBottom:14}}>
                  <div className="q-card-num">{qi+1}</div>
                  <div style={{fontSize:14,fontWeight:500,color:"var(--text)",lineHeight:1.6,flex:1}}>{q.text}</div>
                  <div style={{fontSize:11,color:"var(--muted)",fontWeight:500,whiteSpace:"nowrap" as const}}>{q.marks} mark{q.marks>1?"s":""}</div>
                </div>
                <div style={{paddingLeft:34}}>
                  {q.options.map((opt:string, oi:number) => (
                    <div key={oi} className="q-option-row" onClick={()=>setAnswers({...answers,[qi]:oi})} style={{cursor:"pointer",padding:"9px 12px",borderRadius:8,background:answers[qi]===oi?"rgba(124,111,255,0.09)":"transparent",border:answers[qi]===oi?"1px solid rgba(124,111,255,0.22)":"1px solid transparent",transition:"all 0.15s"}}>
                      <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${answers[qi]===oi?"var(--accent)":"var(--muted)"}`,background:answers[qi]===oi?"rgba(124,111,255,0.2)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                        {answers[qi]===oi && <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)"}}/>}
                      </div>
                      <span style={{fontSize:13,color:answers[qi]===oi?"var(--text)":"var(--text2)",fontWeight:answers[qi]===oi?500:300}}>{opt}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{padding:"20px 0",display:"flex",justifyContent:"flex-end",gap:12}}>
              <div style={{fontSize:12,color:"var(--muted)",alignSelf:"center"}}>
                {Object.keys(answers).length}/{quiz.questions.length} answered
              </div>
              <button onClick={handleSubmit} className="btn-success" style={{padding:"12px 32px",fontSize:14}}>
                Submit Test →
              </button>
            </div>
          </div>

          {/* Proctor panel */}
          <div style={{background:"var(--surface2)",borderLeft:"1px solid var(--border)",padding:"20px",overflowY:"auto",display:"flex",flexDirection:"column" as const,gap:12}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,color:"var(--muted)"}}>Proctor Monitor</div>
            {/* Camera */}
            <div className="cam-preview" style={{aspectRatio:"4/3"}}>
              <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}} muted playsInline/>
              <canvas ref={canvasRef} style={{display:"none"}}/>
              {camError && <div className="cam-overlay">{camError}</div>}
              {/* Face indicator */}
              <div style={{position:"absolute",bottom:8,left:8,right:8,display:"flex",alignItems:"center",gap:6,background:"rgba(0,0,0,0.75)",borderRadius:6,padding:"5px 10px",backdropFilter:"blur(4px)"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:faceStatus==="ok"?"var(--accent3)":faceStatus==="warn"?"var(--gold)":"var(--accent2)",flexShrink:0,boxShadow:faceStatus!=="ok"?`0 0 6px ${faceStatus==="warn"?"var(--gold)":"var(--accent2)"}`:undefined,animation:faceStatus!=="ok"?"procDot 1s infinite":undefined}}/>
                <span style={{fontSize:11,color:"#fff",fontWeight:500,flex:1}}>
                  {faceStatus==="ok"
                    ? "✓ Face detected — All clear"
                    : faceStatus==="warn"
                    ? (facesDetected > 1 ? `⚠ ${facesDetected} people in frame!` : "⚠ Screen/device in frame!")
                    : "❌ Face not visible!"}
                </span>
                {faceStatus!=="ok" && (
                  <span style={{fontSize:9,fontWeight:700,color:"var(--accent2)",background:"rgba(255,95,160,0.2)",borderRadius:4,padding:"2px 6px",flexShrink:0}}>VIOLATION</span>
                )}
              </div>
            </div>

            {/* Status pills */}
            <div className={`proctor-status ${faceStatus==="ok"?"proctor-ok":faceStatus==="warn"?"proctor-warn":"proctor-fail"}`}>
              <div className={`proctor-dot ${faceStatus!=="ok"?"pulse":""}`}/>
              {faceStatus==="ok"
                ? "✓ All clear — proctoring active"
                : faceStatus==="warn"
                ? (facesDetected > 1 ? `⚠ Multiple people detected (${facesDetected} faces)!` : "⚠ Electronic device detected in frame!")
                : "❌ Face not visible — look at camera"}
            </div>

            {/* Rules reminder */}
            <div style={{background:"rgba(255,204,92,0.05)",border:"1px solid rgba(255,204,92,0.15)",borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:9.5,fontWeight:700,color:"var(--gold)",letterSpacing:1.5,marginBottom:7}}>RULES</div>
              <div style={{fontSize:11.5,color:"var(--text2)",lineHeight:1.8,fontWeight:300}}>
                • Stay on this tab at all times<br/>
                • Keep your face visible in camera<br/>
                • No other people in frame<br/>
                • 3 tab switches = auto terminate<br/>
                • 5 face absences = auto terminate
              </div>
            </div>

            {/* Progress */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",marginBottom:6}}>
                <span>Progress</span>
                <span>{Object.keys(answers).length}/{quiz.questions.length}</span>
              </div>
              <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(Object.keys(answers).length/quiz.questions.length)*100}%`,background:"var(--accent)",borderRadius:4,transition:"width 0.3s"}}/>
              </div>
            </div>

            {/* Log */}
            <div>
              <div style={{fontSize:9.5,fontWeight:700,color:"var(--muted)",letterSpacing:1.5,marginBottom:6}}>ACTIVITY LOG</div>
              <div className="proctor-log">
                {logs.length===0 && <span style={{color:"var(--muted)"}}>Monitoring started…</span>}
                {logs.map((l,i)=>(
                  <div key={i} className={`log-${l.type}`}>[{l.t}] {l.msg}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function Page() {
  const router = useRouter();
  const [page, setPage] = useState<Page>("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  // AI Co-Teacher Sidecar
  const [coTeacherOpen, setCoTeacherOpen] = useState(false);
  const [coTeacherInsight, setCoTeacherInsight] = useState("");
  const [coTeacherLoading, setCoTeacherLoading] = useState(false);

  // OCR Benchmark — enhanced for multi-page PDF
  const [ocrBenchFile, setOcrBenchFile] = useState<File|null>(null);
  const [ocrBenchLoading, setOcrBenchLoading] = useState(false);
  const [ocrBenchResults, setOcrBenchResults] = useState<any>(null);
  const [ocrBenchSelected, setOcrBenchSelected] = useState("groq");
  const [ocrEnhanced, setOcrEnhanced] = useState("");
  const [ocrEnhLoading, setOcrEnhLoading] = useState(false);
  // Multi-page PDF specific
  const [ocrIsPdf, setOcrIsPdf] = useState(false);
  const [ocrPageData, setOcrPageData] = useState<any[]>([]);
  const [ocrSelectedPage, setOcrSelectedPage] = useState(1);
  const [ocrMergedText, setOcrMergedText] = useState("");
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrEngine, setOcrEngine] = useState("groq-vision"); // 'groq-vision' (Turbo) or 'trocr' (Local)
  const [ocrSendToEval, setOcrSendToEval] = useState(false);

  // UI Extras
  const [studentSearch, setStudentSearch] = useState("");

  // Students
  const [students, setStudents] = useState<any[]>([]);
  const [name, setName] = useState(""); const [grade, setGrade] = useState(""); const [avg, setAvg] = useState("");

  // AI Reports
  const [aiReport, setAiReport] = useState(""); const [weakReport, setWeakReport] = useState("");

  // Attendance
  const [attendance, setAttendance] = useState<Record<string,string>>({});
  const [attendanceSummary, setAttendanceSummary] = useState<Record<string,{present:number;absent:number}>>({});
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0,10));

  // Lesson
  const [lessonTopic, setLessonTopic] = useState(""); const [lessonContext, setLessonContext] = useState("");
  const [lessonGrade, setLessonGrade] = useState("Grade 10"); const [lessonDuration, setLessonDuration] = useState("45 minutes");
  const [lessonSections, setLessonSections] = useState<{title:string;body:string;icon:string}[]>([]);
  const [lessonOutput, setLessonOutput] = useState("");

  // Study Tool
  const [studyTopic, setStudyTopic] = useState("");
  const [studyData, setStudyData] = useState<any>(null);
  const [studyImages, setStudyImages] = useState<{src:string;caption:string}[]>([]);
  const [studyLoading, setStudyLoading] = useState(false);

  // Paper Eval
  const [evalStep, setEvalStep] = useState<EvalStep>("idle");
  const [evalProgress, setEvalProgress] = useState("");
  const [answerSheetFile, setAnswerSheetFile] = useState<File|null>(null);
  const [questionPaperFile, setQuestionPaperFile] = useState<File|null>(null);
  const [syllabusFile, setSyllabusFile] = useState<File|null>(null);
  const [modelAnswersFile, setModelAnswersFile] = useState<File|null>(null);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [paperTitle, setPaperTitle] = useState(""); const [subject, setSubject] = useState("");
  const [totalMarksInput, setTotalMarksInput] = useState(""); const [marksDistribution, setMarksDistribution] = useState("");
  const [evaluation, setEvaluation] = useState<any>(null);
  const [evalMode, setEvalMode] = useState<""|"Mode 1"|"Mode 2"|"Mode 3">("");
  const [evalFromOcr, setEvalFromOcr] = useState(""); // pre-filled from OCR page
  const [evalPhase, setEvalPhase] = useState<"scan"|"action"|"evaluate"|"progress"|"done">("scan");
  
  // Pro Evaluator Mode
  const [proMode, setProMode] = useState(false);
  const [proReportUrl, setProReportUrl] = useState("");

  // Announcements
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annTitle, setAnnTitle] = useState(""); const [annBody, setAnnBody] = useState("");
  const [annType, setAnnType] = useState("info"); const [annTarget, setAnnTarget] = useState("all");

  // ─── QUIZ STATE ───
  const [quizView, setQuizView] = useState<"list"|"create"|"ai-gen"|"session"|"results">("list");
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [showProctoredQuiz, setShowProctoredQuiz] = useState(false);
  const [lastQuizResult, setLastQuizResult] = useState<any>(null);
  const [showResultScreen, setShowResultScreen] = useState(false);

  // Quiz builder
  const [qTitle, setQTitle] = useState("");
  const [qSubject, setQSubject] = useState("");
  const [qDuration, setQDuration] = useState(30);
  const [qGrade, setQGrade] = useState("Grade 10");
  const [qPassMark, setQPassMark] = useState(50);
  const [questions, setQuestions] = useState<any[]>([]);
  const [aiQuizTopic, setAiQuizTopic] = useState("");
  const [aiQuizNum, setAiQuizNum] = useState(10);
  const [aiQuizDiff, setAiQuizDiff] = useState("Medium");
  const [aiGenLoading, setAiGenLoading] = useState(false);

  // ── AUTH ──
  const checkUser = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) router.push("/login");
  };

  // ── DATA FETCH ──
  const fetchStudents = async () => {
    const { data:u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("students").select("*").eq("user_id", u.user.id).order("id", {ascending:true});
    if (!error && data) setStudents(data);
  };

  const fetchAttendanceSummary = useCallback(async () => {
    if (!students.length) return;
    const ids = students.map(s => s.id);
    const { data, error } = await supabase.from("attendance").select("student_id,status,date").in("student_id", ids).order("date", {ascending:false});
    if (error || !data) return;
    const summary: Record<string,{present:number;absent:number}> = {};
    ids.forEach(id => { summary[String(id)] = {present:0, absent:0}; });
    data.forEach((row:any) => {
      const k = String(row.student_id);
      if (!summary[k]) return;
      if (row.status === "Present") summary[k].present++;
      else summary[k].absent++;
    });
    setAttendanceSummary(summary);
  }, [students]);

  const fetchAnnouncements = async () => {
    const { data:u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("announcements").select("*").eq("user_id", u.user.id).order("created_at", {ascending:false});
    if (data) setAnnouncements(data);
  };

  // Load quizzes from localStorage (local persistence, no extra DB tables needed)
  const loadQuizzes = useCallback(() => {
    try {
      const stored = localStorage.getItem("edu_quizzes");
      if (stored) setQuizzes(JSON.parse(stored));
      const storedSessions = localStorage.getItem("edu_sessions");
      if (storedSessions) setSessions(JSON.parse(storedSessions));
    } catch {}
  }, []);

  const saveQuizzes = (updated: any[]) => {
    setQuizzes(updated);
    try { localStorage.setItem("edu_quizzes", JSON.stringify(updated)); } catch {}
  };

  const saveSessions = (updated: any[]) => {
    setSessions(updated);
    try { localStorage.setItem("edu_sessions", JSON.stringify(updated)); } catch {}
  };

  useEffect(() => {
    setDate(new Date().toLocaleDateString("en-IN", {day:"numeric",month:"long",year:"numeric"}));
    checkUser();
    fetchStudents();
    loadQuizzes();
  }, []);
  useEffect(() => { fetchAttendanceSummary(); }, [fetchAttendanceSummary]);
  useEffect(() => { if (page==="announcements") fetchAnnouncements(); }, [page]);

  // ── STUDENTS CRUD ──
  const addStudent = async () => {
    if (!name.trim() || !grade || !avg) return alert("Fill all fields");
    const numAvg = Number(avg);
    if (isNaN(numAvg) || numAvg < 0 || numAvg > 100) return alert("Average must be 0–100");
    setLoading(true);
    try {
      const { data:u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("students")
        .insert([{ name:name.trim(), grade, avg:numAvg, user_id:u.user?.id }]).select();
      if (error) throw error;
      if (data) setStudents(prev => [...prev, ...data]);
      setName(""); setGrade(""); setAvg("");
    } catch { alert("Failed to add student"); } finally { setLoading(false); }
  };

  const deleteStudent = async (id: number) => {
    if (!confirm("Delete this student? All their data will be removed.")) return;
    await supabase.from("attendance").delete().eq("student_id", id);
    await supabase.from("students").delete().eq("id", id);
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  // ── AI REPORTS ──
  const generateAIReport = async () => {
    if (!students.length) return alert("No student data");
    setLoading(true); setAiReport(""); setWeakReport("");
    const rows = students.map(s => `${s.name} (${s.grade}): ${s.avg}%`).join("\n");
    const prompt = `You are a school analytics expert. Analyse this class performance data and write a concise teacher report.

CLASS DATA:
${rows}
CLASS AVERAGE: ${classAvg}%  |  TOTAL STUDENTS: ${students.length}

Write a structured analysis with these exact sections:
1. OVERALL PERFORMANCE SUMMARY — 2-3 sentences about the class as a whole
2. TOP PERFORMERS — list students above 75% with a brief note on each
3. PERFORMANCE PATTERNS — what the score distribution reveals
4. AREAS OF CONCERN — students or trends that need attention
5. TEACHER RECOMMENDATIONS — 3 specific, actionable suggestions

Reference actual student names and exact percentages.`;
    const r = await generateAILesson(prompt);
    setAiReport(r); setLoading(false);
  };

  const generateWeakAI = async () => {
    if (!students.length) return alert("No data");
    setLoading(true); setWeakReport(""); setAiReport("");
    const rows = students.map(s => `${s.name} (${s.grade}): ${s.avg}%`).join("\n");
    const weak = students.filter(s => Number(s.avg) < 50);
    const prompt = `You are a student support specialist. Analyse weak students and write an intervention plan.

ALL STUDENTS:
${rows}

STUDENTS BELOW 50%:
${weak.length ? weak.map(s => `${s.name}: ${s.avg}%`).join("\n") : "None below 50%. Check students between 50-65% for early support."}

Write:
1. STUDENT-WISE INTERVENTION — specific issues and support strategies per student
2. PRIORITY RANKING — who needs help immediately vs monitoring
3. PARENT COMMUNICATION TEMPLATE — brief message for parents
4. REMEDIAL STRATEGIES — 3-4 specific techniques
5. PROGRESS TRACKING — how to measure if interventions work`;
    const r = await generateAILesson(prompt);
    setWeakReport(r); setLoading(false);
  };

  // ── ATTENDANCE ──
  const saveAttendance = async () => {
    if (!students.length) return;
    const records = students.map(id => ({
      student_id: id.id,
      status: attendance[id.id] || "Present",
      date: attDate,
    }));
    const { error } = await supabase.from("attendance").insert(records);
    if (error) return alert("Failed to save: " + error.message);
    alert("Attendance saved for " + new Date(attDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}));
    setAttendance({});
    fetchAttendanceSummary();
  };

  // ── LESSON ──
  const generateLesson = async () => {
    if (!lessonTopic.trim()) return alert("Enter a topic");
    setLoading(true); setLessonSections([]); setLessonOutput("");
    const prompt = `You are an expert curriculum designer. Create a detailed, classroom-ready lesson plan for: "${lessonTopic}".
Target: ${lessonGrade} | Duration: ${lessonDuration}
${lessonContext ? `Context: ${lessonContext}` : ""}
Return EXACTLY in this format:
##OBJECTIVE##
2-3 clear learning objectives starting with action verbs.
##HOOK##
An engaging 5-minute opener.
##MAIN_CONTENT##
Step-by-step lesson delivery with teacher actions and student activities. Be detailed and practical.
##ACTIVITY##
A hands-on activity with clear instructions.
##ASSESSMENT##
3-4 assessment questions mixing easy and challenging.
##HOMEWORK##
One meaningful homework task.
##TEACHER_TIPS##
2-3 pro tips: common misconceptions, differentiation ideas, engagement tricks.`;
    const raw = await generateAILesson(prompt);
    const ps = (text:string, tag:string) => { const m = text.split(`##${tag}##`)[1]; if(!m) return ""; return (m.split(/##[A-Z_]+##/)[0]||"").trim(); };
    const defs = [
      {tag:"OBJECTIVE",title:"Learning Objectives",icon:"🎯"},
      {tag:"HOOK",title:"Opening Hook",icon:"⚡"},
      {tag:"MAIN_CONTENT",title:"Lesson Content",icon:"📖"},
      {tag:"ACTIVITY",title:"Student Activity",icon:"🔬"},
      {tag:"ASSESSMENT",title:"Assessment Questions",icon:"✅"},
      {tag:"HOMEWORK",title:"Homework Task",icon:"🏠"},
      {tag:"TEACHER_TIPS",title:"Teacher Tips",icon:"💡"},
    ];
    const parsed = defs.map(s => ({...s, body:ps(raw,s.tag)})).filter(s => s.body);
    if (parsed.length > 0) setLessonSections(parsed); else setLessonOutput(raw);
    setLoading(false);
  };

  // ── STUDY TOOL ──
  const generateStudy = async () => {
    if (!studyTopic.trim()) return alert("Enter a topic");
    setStudyLoading(true); setStudyData(null); setStudyImages([]);
    try {
      const prompt = `You are a world-class educator. Write an extremely comprehensive, detailed study guide on: "${studyTopic}".

SECTION_DEFINITION
Write 4-5 detailed sentences defining "${studyTopic}". Include etymology, field, and significance.
END_SECTION

SECTION_EXPLANATION
Thorough step-by-step explanation. Use numbered steps. Minimum 250 words.
END_SECTION

SECTION_KEY_CONCEPTS
List 6-8 key concepts:
• ConceptName — Detailed 2-3 sentence explanation.
END_SECTION

SECTION_TYPES
Explain 4-6 different types/categories. For each: name, detailed explanation, real example.
END_SECTION

SECTION_APPLICATIONS
Give 5 specific real-world applications in different industries. Minimum 200 words.
END_SECTION

SECTION_HISTORY
History and development: who discovered it, when, key milestones. Minimum 200 words.
END_SECTION

SECTION_MISCONCEPTIONS
List 4 common misconceptions:
⚠ Misconception: [wrong belief]
✓ Reality: [correct understanding]
END_SECTION

SECTION_EXAM_TIPS
List 6 numbered exam tips:
1. [specific actionable tip]
END_SECTION

SECTION_FUN_FACTS
List exactly 5 fascinating facts:
★ [2-3 interesting sentences]
END_SECTION`;

      const raw = await generateAILesson(prompt);
      const extractSection = (text: string, tag: string): string => {
        const start = text.indexOf(`SECTION_${tag}`);
        if (start === -1) return "";
        const contentStart = text.indexOf("\n", start) + 1;
        const end = text.indexOf("END_SECTION", contentStart);
        if (end === -1) return text.slice(contentStart).trim();
        return text.slice(contentStart, end).trim();
      };
      const funFactsRaw = extractSection(raw, "FUN_FACTS");
      const funFacts = funFactsRaw.split("\n").filter((l:string) => l.trim().startsWith("★")).map((l:string) => l.replace(/^★\s*/, "").trim()).filter(Boolean);
      setStudyData({ definition:extractSection(raw,"DEFINITION"), explanation:extractSection(raw,"EXPLANATION"), keyConcepts:extractSection(raw,"KEY_CONCEPTS"), types:extractSection(raw,"TYPES"), applications:extractSection(raw,"APPLICATIONS"), history:extractSection(raw,"HISTORY"), misconceptions:extractSection(raw,"MISCONCEPTIONS"), examTips:extractSection(raw,"EXAM_TIPS"), funFacts, rawText:raw });

      const imgs: {src:string;caption:string}[] = [];
      try {
        const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(studyTopic)}&srlimit=5&format=json&origin=*`);
        const searchData = await searchRes.json();
        for (const result of (searchData?.query?.search||[]).slice(0,5)) {
          if (imgs.length >= 3) break;
          try {
            const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(result.title)}`);
            const summaryData = await summaryRes.json();
            const src = summaryData?.thumbnail?.source || summaryData?.originalimage?.source;
            if (src && !imgs.some(i => i.src === src)) imgs.push({src, caption:`${result.title}${summaryData.description?` — ${summaryData.description}`:""}`});
          } catch {}
        }
      } catch {}
      setStudyImages(imgs.slice(0,3));
    } catch (e:any) { alert("Study generation failed: " + (e.message||"Try again")); }
    setStudyLoading(false);
  };

  // ── PAPER EVAL ──
  const fileToBase64 = (file:File): Promise<string> => new Promise((res,rej) => {
    const r = new FileReader(); r.readAsDataURL(file);
    r.onload = () => res((r.result as string).split(",")[1]); r.onerror = rej;
  });

  const readFileText = async (file:File): Promise<string> => {
    const base64 = await fileToBase64(file);
    const isPdf = file.type === "application/pdf";
    if (isPdf) {
      // PDF → use fast Groq Vision multi-page backend instead of slow local trocr
      const res = await fetch("/api/ocr", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pdfBase64:base64, mimeType:file.type, model:"groq-vision"})});
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || e.error || "PDF OCR failed"); }
      const d = await res.json(); return d.merged_text || d.text || "";
    } else {
      // Image → use Groq vision
      const res = await fetch("/api/ocr", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({imageBase64:base64, mimeType:file.type||"image/jpeg"})});
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || e.error || "OCR failed"); }
      const d = await res.json(); return d.text || "";
    }
  };

  // Keep old alias for compat
  const readImageText = readFileText;

  const parseEvalJSON = (raw:string): any => {
    const clean = raw.replace(/```json|```/g,"").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    return JSON.parse(match[0]);
  };

  const getLetterGrade = (pct:number) => pct>=90?"A+":pct>=80?"A":pct>=70?"B":pct>=60?"C":pct>=50?"D":"F";

  const evaluatePaper = async () => {
    // Student text can come from pre-filled OCR OR from uploaded file
    const hasPrefilledText = !!evalFromOcr.trim();
    if (!hasPrefilledText && !answerSheetFile) return alert("Upload the handwritten answer sheet (or use 'Send to Evaluator' from the OCR page)");
    if (proMode && !answerSheetFile) return alert("Pro Mode requires the original PDF/Image file to draw annotations.");
    if (!totalMarksInput) return alert("Enter total marks");
    if (!marksDistribution.trim() && !modelAnswersFile && !questionPaperFile) return alert("Please enter marks distribution, or upload a Question Paper / Marking Scheme.");
    
    setEvaluation(null); setEvalStep("ocr"); setLoading(true); setEvalPhase("progress");
    setProReportUrl(""); // reset old report
    
    try {
      let questionPaperText = "";
      if (questionPaperFile) { setEvalProgress("Reading question paper…"); questionPaperText = await readFileText(questionPaperFile); }

      let syllabusText = "";
      if (syllabusFile) { setEvalProgress("Reading syllabus…"); syllabusText = await readFileText(syllabusFile); }

      let modelAnswersText = "";
      if (modelAnswersFile) { setEvalProgress("Reading model answers…"); modelAnswersText = await readFileText(modelAnswersFile); }

      let studentText = "";
      if (!proMode) {
        if (hasPrefilledText) {
          studentText = evalFromOcr;
          setEvalProgress("Using pre-scanned text from OCR Scanner…");
        } else {
          setEvalProgress("Reading handwritten answer sheet…");
          studentText = await readFileText(answerSheetFile!);
        }
      }

      setEvalStep("ai"); 
      setEvalProgress(proMode ? "AI is running strict Autonomous Evaluation & generating Pro Report…" : "AI is evaluating and marking answers…");

      let evalRes: any;
      
      if (proMode) {
        // Convert file to base64
        const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = error => reject(error);
        });
        
        const pdfBase64 = await fileToBase64(answerSheetFile!);
        
        evalRes = await fetch("/api/evaluate-pro", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            pdfBase64: pdfBase64,
            question_paper_text: questionPaperText || `Exam: ${paperTitle||"Exam"} | Subject: ${subject||"N/A"} | Total Marks: ${totalMarksInput}\nMarks Distribution: ${marksDistribution}`,
            model_answers_text: modelAnswersText || syllabusText,
            total_marks: parseInt(totalMarksInput) || 0,
            target_model: "tesseract"
          }),
        }).then(r=>r.json());
        
      } else {
        // Standard Evaluation
        evalRes = await fetch("/api/evaluate", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            student_text: studentText,
            question_paper_text: questionPaperText || `Exam: ${paperTitle||"Exam"} | Subject: ${subject||"N/A"} | Total Marks: ${totalMarksInput}\nMarks Distribution: ${marksDistribution}`,
            model_answers_text: modelAnswersText,
            syllabus_text: syllabusText,
            total_marks: parseInt(totalMarksInput) || 0,
            class_level: students.find((s:any)=>String(s.id)===selectedStudent)?.grade || "",
          }),
        }).then(r=>r.json());
      }

      if (evalRes.status !== "success") throw new Error(evalRes.detail || evalRes.message || evalRes.error || "Evaluation failed");

      const ev = evalRes.evaluation;
      
      // Save the Pro Report URL if available
      if (evalRes.pdf_url) {
        setProReportUrl(evalRes.pdf_url);
      }

      // Normalize to existing result schema expected by the UI
      const result = {
        totalMarks: ev.total_awarded,
        maxMarks: ev.total_possible || parseInt(totalMarksInput),
        percentage: ev.percentage,
        grade: ev.grade || getLetterGrade(ev.percentage),
        overallFeedback: ev.overall_feedback,
        teacherNote: proMode ? `Evaluated via Autonomous Pro Mode (University Rules)` : `Evaluated via ${evalRes.mode || "AI Engine"}`,
        questions: (ev.questions || []).map((q:any) => ({
          qNo: q.question_no,
          topic: "",
          questionText: q.question,
          awarded: q.marks_awarded,
          max: q.marks_total,
          reasoning: proMode ? q.red_pen_comment : q.feedback,
          graceAwarded: false,
          graceReason: "",
          improvement: q.status === "wrong" || q.status === "partial" ? (q.feedback || q.red_pen_comment) : "",
          pageNo: q.page_no,
          redPen: q.red_pen_comment,
        })),
      };
      
      setEvaluation(result);
      setEvalMode(evalRes.mode || "");
      setEvalStep("done");
      setEvalPhase("done");
    } catch (err:any) {
      alert("Evaluation failed: " + (err.message || "Try again"));
      setEvalStep("idle");
      setEvalPhase("evaluate");
    }
    setLoading(false);
  };


  const downloadReportCard = () => {
    if (!evaluation) return;
    
    // If Pro Mode PDF is available, download it directly
    if (proReportUrl) {
       // Since the backend might be on 8080, we route through our Next API proxy or direct
       // We'll assume the Next proxy is available or we fallback to 8080
       const url = proReportUrl.startsWith("/") ? `http://127.0.0.1:8080${proReportUrl}` : proReportUrl;
       const a = document.createElement("a");
       a.href = url;
       a.target = "_blank";
       a.download = "ShikshakAI_Pro_Report.pdf";
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       return;
    }
    
    const sn = selectedStudent ? students.find((s:any)=>String(s.id)===selectedStudent)?.name||"Student" : "Student";
    const gc = evaluation.percentage>=75?"#00dba0":evaluation.percentage>=50?"#ffcc5c":"#ff5fa0";
    const now = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
    const rowsHtml = evaluation.questions.map((q:any)=>{
      const c=q.awarded===q.max?"full":q.awarded===0?"zero":"partial";
      return `<tr>
        <td><strong>${q.qNo||""}</strong></td>
        <td style="color:#888;font-size:11px">${q.topic||"—"}</td>
        <td style="font-size:11px;max-width:160px">${q.questionText||"—"}</td>
        <td class="${c}">${q.awarded}/${q.max}</td>
        <td style="text-align:center">${q.graceAwarded?"★":"—"}</td>
        <td style="font-size:11px">${q.reasoning||"—"}</td>
        <td style="font-size:11px;color:#888">${q.improvement||"—"}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Report Card — ${sn}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400&family=DM+Sans:wght@300;400;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#fff;color:#1a1a2e;padding:36px;max-width:960px;margin:0 auto;font-size:13px;}
.header{text-align:center;border-bottom:2px solid #7c6fff;padding-bottom:20px;margin-bottom:24px;}
.school{font-family:'Fraunces',serif;font-size:28px;color:#4a3fb5;font-style:italic;}
.report-title{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#999;margin-top:4px;}
.hero{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#f8f8ff,#f0efff);border:1px solid #e0dfff;border-radius:14px;padding:20px 26px;margin-bottom:22px;}
.student-name{font-family:'Fraunces',serif;font-size:22px;color:#1a1a2e;font-style:italic;}
.student-sub{font-size:11px;color:#999;margin-top:3px;}
.score-num{font-family:'Fraunces',serif;font-size:52px;color:${gc};line-height:1;}
.score-denom{font-size:20px;color:#bbb;font-family:'DM Sans',sans-serif;}
.grade-pill{display:inline-block;background:${gc}22;color:${gc};border:2px solid ${gc};border-radius:8px;padding:5px 14px;font-size:22px;font-weight:700;font-family:'Fraunces',serif;margin-left:14px;}
.pct{font-size:12px;color:#888;margin-top:4px;}
.bar-bg{background:#ede;border-radius:6px;height:6px;margin-top:10px;width:180px;background:#f0efff;}
.bar-fill{background:${gc};border-radius:6px;height:6px;width:${evaluation.percentage}%;}
.section-title{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#999;margin-bottom:10px;margin-top:22px;padding-bottom:6px;border-bottom:1px solid #f0f0f0;}
table{width:100%;border-collapse:collapse;}
th{padding:9px 12px;text-align:left;background:#f0efff;color:#4a3fb5;font-weight:600;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;}
td{padding:10px 12px;border-bottom:1px solid #f5f5f5;vertical-align:top;line-height:1.5;}
tr:last-child td{border-bottom:none;}
tr:nth-child(even){background:#fafafa;}
.full{color:#00c87e;font-weight:700;}
.partial{color:#e5a800;font-weight:700;}
.zero{color:#e0005a;font-weight:700;}
.feedback-box{background:#f8f8ff;border-left:3px solid #7c6fff;border-radius:0 8px 8px 0;padding:16px 20px;margin-top:20px;font-size:13.5px;line-height:1.8;color:#444;font-style:italic;}
.teacher-note{display:flex;gap:10px;background:#f8fff8;border:1px solid #d0f0e0;border-radius:8px;padding:12px 16px;margin-top:14px;font-size:12.5px;color:#2a5a3a;line-height:1.6;}
.footer{text-align:center;font-size:9px;color:#bbb;margin-top:32px;padding-top:16px;border-top:1px solid #eee;letter-spacing:1.5px;text-transform:uppercase;}
@media print{body{padding:20px;}@page{margin:1.5cm;}}
</style></head><body>
<div class="header">
  <div class="school">EduSahayak</div>
  <div class="report-title">Academic Evaluation Report · AI-Powered Assessment</div>
</div>
<div class="hero">
  <div>
    <div class="student-name">${sn}</div>
    <div class="student-sub">${paperTitle||"Exam"} · ${subject||""} · ${now}</div>
    <div class="bar-bg" style="margin-top:12px"><div class="bar-fill"></div></div>
    <div class="pct" style="margin-top:4px">${evaluation.percentage}% · Grade ${evaluation.grade}</div>
  </div>
  <div style="display:flex;align-items:center;">
    <div>
      <div style="font-size:10px;color:#999;font-weight:600;letter-spacing:2px;text-align:right;margin-bottom:4px">TOTAL SCORE</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span class="score-num">${evaluation.totalMarks}</span>
        <span class="score-denom">/ ${evaluation.maxMarks}</span>
        <span class="grade-pill">${evaluation.grade}</span>
      </div>
    </div>
  </div>
</div>
${evaluation.teacherNote ? `<div class="teacher-note">👨‍🏫 <div><strong>Teacher's Note:</strong> ${evaluation.teacherNote}</div></div>` : ""}
<div class="section-title">Question-wise Breakdown</div>
<table>
  <thead><tr><th>Q</th><th>Topic</th><th>Question Asked</th><th>Marks</th><th>Grace</th><th>AI Reasoning & Deductions</th><th>Improvement Tip</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="section-title">Overall Feedback</div>
<div class="feedback-box">${evaluation.overallFeedback}</div>
<div class="footer">Generated by EduSahayak · ${now} · AI-Powered Paper Evaluation</div>
</body></html>`;

    // ✅ Direct PDF download via Blob — no popup, no print dialog needed
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ReportCard_${sn.replace(/\s+/g,"_")}_${paperTitle||"Exam"}.html`.replace(/[^a-zA-Z0-9._-]/g,"_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── ANNOUNCEMENTS ──
  const postAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) return alert("Fill title and message");
    setLoading(true);
    try {
      const { data:u } = await supabase.auth.getUser();
      const { error } = await supabase.from("announcements").insert([{ user_id:u.user?.id, title:annTitle, body:annBody, type:annType, target:annTarget, created_at:new Date().toISOString() }]);
      if (error) throw error;
      setAnnTitle(""); setAnnBody(""); fetchAnnouncements();
    } catch { alert("Failed to post"); } finally { setLoading(false); }
  };

  const deleteAnnouncement = async (id:number) => {
    await supabase.from("announcements").delete().eq("id",id);
    fetchAnnouncements();
  };

  // ── QUIZ FUNCTIONS ──
  const addQuestion = () => {
    setQuestions(prev => [...prev, { text:"", options:["","","",""], correct:0, marks:1 }]);
  };

  const updateQuestion = (qi:number, field:string, val:any) => {
    setQuestions(prev => prev.map((q,i) => i===qi ? {...q,[field]:val} : q));
  };

  const updateOption = (qi:number, oi:number, val:string) => {
    setQuestions(prev => prev.map((q,i) => {
      if (i!==qi) return q;
      const opts = [...q.options]; opts[oi] = val;
      return {...q, options:opts};
    }));
  };

  const removeQuestion = (qi:number) => setQuestions(prev => prev.filter((_,i) => i!==qi));

  const saveQuiz = () => {
    if (!qTitle.trim()) return alert("Enter quiz title");
    if (questions.length === 0) return alert("Add at least one question");
    if (questions.some(q => !q.text.trim())) return alert("All questions need text");
    if (questions.some(q => q.options.some((o:string) => !o.trim()))) return alert("All options must be filled");
    const quiz = {
      id: Date.now(),
      title: qTitle,
      subject: qSubject,
      grade: qGrade,
      duration: qDuration,
      passMark: qPassMark,
      questions,
      createdAt: new Date().toISOString(),
      totalMarks: questions.reduce((a:number,q:any)=>a+q.marks,0)
    };
    const updated = [...quizzes, quiz];
    saveQuizzes(updated);
    setQTitle(""); setQSubject(""); setQuestions([]); setQDuration(30); setQPassMark(50);
    setQuizView("list");
    alert("Quiz saved!");
  };

  const generateAIQuiz = async () => {
    if (!aiQuizTopic.trim()) return alert("Enter a topic");
    setAiGenLoading(true);
    const prompt = `Create exactly ${aiQuizNum} multiple-choice questions on "${aiQuizTopic}" for ${qGrade} students. Difficulty: ${aiQuizDiff}.

Return ONLY valid JSON array:
[{"text":"<question>","options":["A","B","C","D"],"correct":<0-3>,"marks":1,"explanation":"<why correct>"}]

Make sure options are complete sentences or phrases, not just letters. Mix difficulty within the set.`;
    try {
      const raw = await generateAILesson(prompt);
      const clean = raw.replace(/```json|```/g,"").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON array found");
      const parsed = JSON.parse(match[0]);
      setQuestions(parsed.map((q:any)=>({ text:q.text||"", options:q.options||["","","",""], correct:q.correct||0, marks:q.marks||1, explanation:q.explanation||"" })));
      alert(`${parsed.length} questions generated! Review them below and save.`);
      setQuizView("create");
    } catch (e:any) {
      alert("AI generation failed: " + e.message);
    }
    setAiGenLoading(false);
  };

  const startSession = (quiz: any) => {
    const session = {
      id: Date.now(),
      quizId: quiz.id,
      quizTitle: quiz.title,
      startedAt: new Date().toISOString(),
      active: true,
      results: [] as any[],
    };
    const updated = [...sessions, session];
    saveSessions(updated);
    setActiveQuiz(quiz);
    setActiveSession(session);
    setQuizView("session");
  };

  const startStudentTest = () => {
    setShowProctoredQuiz(true);
  };

  const handleQuizComplete = (result: any) => {
    setShowProctoredQuiz(false);
    if (!activeQuiz) return;
    const percentage = Math.round((result.correct / result.total) * 100);
    const studentResult = {
      ...result,
      percentage,
      grade: getLetterGrade(percentage),
      passed: percentage >= activeQuiz.passMark,
      completedAt: new Date().toISOString(),
    };
    // ✅ FIX: store last result separately so student sees it immediately
    setLastQuizResult(studentResult);
    setShowResultScreen(true);
    // ✅ FIX: use functional updater so we never read stale sessions/activeSession
    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === activeSession?.id
          ? { ...s, results: [...(s.results || []), studentResult] }
          : s
      );
      try { localStorage.setItem("edu_sessions", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveSession((prev: any) =>
      prev ? { ...prev, results: [...(prev.results || []), studentResult] } : prev
    );
  };

  const endSession = () => {
    if (!activeSession) return;
    const updatedSessions = sessions.map(s => s.id===activeSession.id ? {...s, active:false, endedAt:new Date().toISOString()} : s);
    saveSessions(updatedSessions);
    setActiveSession(null);
    setActiveQuiz(null);
    setQuizView("list");
  };

  const deleteQuiz = (id:number) => {
    if (!confirm("Delete this quiz?")) return;
    saveQuizzes(quizzes.filter(q=>q.id!==id));
  };

  // ── COMPUTED ──
  const classAvg = useMemo(() => {
    if (!students.length) return 0;
    return Math.round(students.reduce((a,s)=>a+Number(s.avg),0)/students.length);
  }, [students]);

  const gradeDistribution = useMemo(() => {
    const dist = [{name:"A+ (90+)",val:0},{name:"A (80-89)",val:0},{name:"B (70-79)",val:0},{name:"C (60-69)",val:0},{name:"D (50-59)",val:0},{name:"F (<50)",val:0}];
    students.forEach(s=>{
      const a=Number(s.avg);
      if(a>=90)dist[0].val++;else if(a>=80)dist[1].val++;else if(a>=70)dist[2].val++;else if(a>=60)dist[3].val++;else if(a>=50)dist[4].val++;else dist[5].val++;
    });
    return dist.filter(d=>d.val>0).map(d=>({...d,Students:d.val}));
  }, [students]);

  const attendanceChartData = useMemo(() => {
    return students.map(s => {
      const rec = attendanceSummary[String(s.id)] || {present:0,absent:0};
      const total = rec.present + rec.absent;
      return { name:s.name.split(" ")[0], rate:total>0?Math.round((rec.present/total)*100):0, present:rec.present, absent:rec.absent };
    });
  }, [students, attendanceSummary]);

  const chartData = students.map(s => ({name:s.name.split(" ")[0], avg:Number(s.avg)}));
  const getAvgClass = (v:number) => v>=75?"avg-high":v>=50?"avg-mid":"avg-low";
  // ─────────────────────────────────────────────
  // OCR BENCHMARK
  // ─────────────────────────────────────────────
  // ── Helper: render one page from an already-loaded pdfDoc to base64 JPEG ──
  const renderPageToBase64 = async (pdfDoc: any, pageNum: number, scale = 0.9): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await (page.render as any)({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
  };

  const runOcrBenchmark = async () => {
    if (!ocrBenchFile) return alert("Upload a document or PDF for OCR");
    setOcrBenchLoading(true); setOcrBenchResults(null); setOcrEnhanced("");
    setOcrPageData([]); setOcrMergedText(""); setOcrSelectedPage(1);
    const isPdf = ocrBenchFile.type === "application/pdf";
    setOcrIsPdf(isPdf);

    try {
      if (isPdf && (ocrEngine === "groq-vision" || ocrEngine === "gemini-vision")) {
        // ── TURBO MODE: Browser renders PDF → Groq Vision API ──
        // No Python backend needed!
        setOcrProgress("📖 Loading PDF in browser…");

        // Load PDF ONCE — reuse for all pages
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const arrayBuffer = await ocrBenchFile.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdfDoc.numPages;
        const isGemini = ocrEngine === "gemini-vision";
        setOcrProgress(`📄 Found ${totalPages} pages. Starting ${isGemini ? "⚡ Parallel Gemini" : "🚀 Groq"} scan…`);

        const pages: any[] = [];

        // Helper to process one page
        const processPage = async (pageNum: number) => {
          try {
            const imgBase64 = await renderPageToBase64(pdfDoc, pageNum);
            let pushed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              const res = await fetch("/api/ocr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageBase64: imgBase64, mimeType: "image/jpeg", model: ocrEngine }),
              }).then(r => r.json()).catch(e => ({ error: e.message }));

              if (res.status === "success" || res.text !== undefined) {
                pages.push({ page: pageNum, text: res.text || "", confidence: res.confidence || 98 });
                setOcrProgress(`⚡ Scanned ${pages.length}/${totalPages} pages…`);
                pushed = true;
                break;
              } else if (res.detail?.includes("429") || res.error?.includes("429")) {
                await new Promise(r => setTimeout(r, attempt * 5000));
              } else {
                pages.push({ page: pageNum, text: `[Error: ${res.error || "Failed"}]`, confidence: 0 });
                pushed = true;
                break;
              }
            }
            if (!pushed) pages.push({ page: pageNum, text: "[Failed after retries]", confidence: 0 });
          } catch (e) {
            pages.push({ page: pageNum, text: "[Render Error]", confidence: 0 });
          }
        };

        if (isGemini) {
          // Gemini: High concurrency (process 10 pages at once)
          const chunks: number[][] = [];
          for (let i = 0; i < totalPages; i += 10) chunks.push(Array.from({length: Math.min(10, totalPages-i)}, (_, k) => i + k + 1));
          for (const chunk of chunks) {
            await Promise.all(chunk.map(p => processPage(p)));
          }
        } else {
          // Groq: Strict sequential with 2s delay
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            await processPage(pageNum);
            if (pageNum < totalPages) await new Promise(r => setTimeout(r, 2000));
          }
        }

        pages.sort((a, b) => a.page - b.page);
        const mergedText = pages
          .map(p => `── Page ${p.page} of ${totalPages} ──\n${p.text}`)
          .join("\n\n");

        setOcrPageData(pages.map(p => ({
          page: p.page,
          text: p.text,
          confidence: p.confidence,
          lines: p.text.split("\n").filter(Boolean).map((t: string, i: number) => ({ line: i + 1, text: t })),
        })));
        setOcrMergedText(mergedText);
        setOcrBenchResults({ [ocrEngine]: { text: mergedText, confidence: 90 } });
        setOcrBenchSelected(ocrEngine);
        setOcrProgress(`✅ Scanned all ${totalPages} pages with ${ocrEngine}`);
        setEvalPhase("action");

      } else if (isPdf && ocrEngine === "trocr") {
        // ── ONE-SHOT MODE (Local TrOCR) ──
        setOcrProgress("⏳ Launching PRIVATE Scan (Local TrOCR)…");
        const base64 = await fileToBase64(ocrBenchFile);
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, mimeType: "application/pdf", model: ocrEngine }),
        }).then(r => r.json()).catch(e => ({ error: "Fetch failed", detail: e.message }));

        if (res.status === "success") {
          setOcrPageData(res.pages || []);
          setOcrMergedText(res.merged_text || "");
          setOcrBenchResults({ [ocrEngine]: { text: res.merged_text, confidence: 90 } });
          setOcrBenchSelected(ocrEngine);
          setOcrProgress(`✓ Scanned ${res.total_pages} pages with Local Mode`);
          setEvalPhase("action");
        } else {
          setOcrProgress(`Error: ${res.error || res.message}`);
        }

      } else {
        // ── SINGLE IMAGE: run groq engine ──
        const base64 = await fileToBase64(ocrBenchFile);
        setOcrProgress("Running OCR scan…");
        const groqRes = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: ocrBenchFile.type, model: "groq-vision" }),
        }).then(r => r.json()).catch(e => ({ error: "Fetch failed", detail: e.message }));

        setOcrBenchResults({ "groq-vision": groqRes });
        setOcrBenchSelected("groq-vision");
        setOcrProgress("✓ Scan complete");
        setEvalPhase("action");
      }
    } catch (e: any) {
      alert("OCR failed: " + e.message);
      setOcrProgress("");
    }
    setOcrBenchLoading(false);
  };

  const enhanceOcrText = async () => {
    const textToEnhance = ocrIsPdf ? ocrMergedText : (ocrBenchResults?.[ocrBenchSelected]?.text || "");
    if (!textToEnhance) return;
    setOcrEnhLoading(true);
    try {
      const res = await fetch("/api/ocr/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocr_text: textToEnhance }),
      }).then(r => r.json());
      if (res.status === "success") setOcrEnhanced(res.enhanced_text);
      else alert("Enhancement failed: " + res.message);
    } catch(e:any) { alert(e.message); }
    setOcrEnhLoading(false);
  };

  const sendOcrToEvaluator = () => {
    const text = ocrEnhanced || ocrMergedText || ocrBenchResults?.[ocrBenchSelected]?.text || "";
    if (!text) return alert("No OCR text to send. Run OCR first.");
    setEvalFromOcr(text);
    if (ocrBenchFile) setAnswerSheetFile(ocrBenchFile); // Carry over the file so Pro Mode has it!
    setEvalPhase("evaluate"); // move to the evaluation mode selector
    setPage("paper");
  };

  const logout = async () => { await supabase.auth.signOut(); router.push("/login"); };
  const es: EvalStep = evalStep;

  // ─────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      
      {/* ── AURORA AMBIENT BACKGROUND ── */}
      <div className="aurora-wrap" aria-hidden="true">
        <div className="aurora-blob blob-1" />
        <div className="aurora-blob blob-2" />
        <div className="aurora-blob blob-3" />
      </div>

      {/* Proctored Quiz Overlay */}
      {showProctoredQuiz && activeQuiz && (
        <ProctoredQuizModal quiz={activeQuiz} onClose={handleQuizComplete}/>
      )}

      <div className={`edu-app ${isSidebarOpen ? "sidebar-open" : ""}`}>
        
        {/* ── FLOATING TOGGLE FAB ── */}
        <button 
          className={`sidebar-fab ${isSidebarOpen ? "hidden" : ""}`}
          onClick={() => setIsSidebarOpen(true)}
        >
          <div className="fab-icon">🎓</div>
          <div className="fab-text">EduSahayak</div>
        </button>

        {/* ── BACKDROP ── */}
        {isSidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* ── SIDEBAR DRAWER ── */}
        <aside className={`sidebar-drawer ${isSidebarOpen ? "open" : ""}`}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-row">
              <div className="sidebar-logo-icon">🎓</div>
              <div>
                <div className="sidebar-logo-text">EduSahayak</div>
                <div className="sidebar-logo-sub">Teacher Platform</div>
              </div>
            </div>
            <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)} title="Close Sidebar">×</button>
          </div>
          <nav className="sidebar-nav">
            <div className="nav-section-label">Main</div>
            {NAV_MAIN.map(n=>(
              <button key={n.id} onClick={()=>setPage(n.id as Page)} className={`nav-item ${page===n.id?"active":""}`}>
                <span className="nav-icon">{n.icon}</span><span className="nav-item-label">{n.label}</span>
              </button>
            ))}
            <div className="nav-section-label">AI Tools</div>
            {NAV_TOOLS.map((n:any)=>(
              <button key={n.id} onClick={()=>{setPage(n.id as Page); if(n.id==="quiz") setQuizView("list");}} className={`nav-item ${page===n.id?"active":""}`}>
                <span className="nav-icon">{n.icon}</span><span className="nav-item-label" style={{flex:1}}>{n.label}</span>
                {n.badge && <span className="nav-badge">{n.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-user-card">
              <div className="sidebar-user-label">Class Summary</div>
              <div className="sidebar-user-info">{students.length} students · {classAvg}% avg</div>
              <div className="sidebar-user-sub">{quizzes.length} quiz{quizzes.length!==1?"zes":""} created</div>
            </div>
            <button onClick={logout} className="logout-btn"><span className="nav-icon">🚪</span><span className="logout-label">Sign Out</span></button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="main">
          {loading && es!=="ocr" && es!=="ai" && !studyLoading && !aiGenLoading && (
            <div className="loading-bar"><div className="spinner"/>Processing — please wait…</div>
          )}

          {/* ═══ DASHBOARD ═══ */}
          {page==="dashboard" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-sub">{date} · Welcome back, Teacher</p>
              </div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Class Average</div>
                  <div className="stat-value stat-accent">{classAvg}%</div>
                  <div className="stat-sub">{classAvg>=75?"Excellent performance":"Needs attention"}</div>
                </div>
                <div className="stat-card" style={{animationDelay:"0.07s"}}>
                  <div className="stat-label">Total Students</div>
                  <div className="stat-value">{students.length}</div>
                  <div className="stat-sub">Enrolled</div>
                </div>
                <div className="stat-card" style={{animationDelay:"0.14s"}}>
                  <div className="stat-label">Top Score</div>
                  <div className="stat-value stat-accent2">{students.length?Math.max(...students.map(s=>Number(s.avg))):0}%</div>
                  <div className="stat-sub">{students.length?students.find(s=>Number(s.avg)===Math.max(...students.map(x=>Number(x.avg))))?.name||"—":"—"}</div>
                </div>
                <div className="stat-card" style={{animationDelay:"0.21s"}}>
                  <div className="stat-label">Needs Support</div>
                  <div className="stat-value stat-gold">{students.filter(s=>Number(s.avg)<50).length}</div>
                  <div className="stat-sub">Below 50%</div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title"><span>◈</span> Performance Overview</div>
                <div style={{width:"100%",height:260}}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} barSize={22}>
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c6fff"/>
                          <stop offset="100%" stopColor="#4a3fb5" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.034)" vertical={false}/>
                      <XAxis dataKey="name" stroke="#3c3c5c" tick={{fontSize:11,fontFamily:"DM Sans",fill:"#8a8aaa"}} axisLine={false} tickLine={false}/>
                      <YAxis stroke="#3c3c5c" tick={{fontSize:11,fontFamily:"DM Sans",fill:"#8a8aaa"}} axisLine={false} tickLine={false} domain={[0,100]}/>
                      <Tooltip content={<CustomTooltip/>} cursor={{fill:"rgba(255,255,255,0.022)"}}/>
                      <Bar dataKey="avg" name="Average" fill="url(#barGrad)" radius={[6,6,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="btn-row">
                  <button onClick={generateAIReport} className="btn-success">✦ Class Performance Analysis</button>
                  <button onClick={generateWeakAI} className="btn-danger">⚠ Intervention Report</button>
                </div>
                {aiReport && <div className="ai-output">{aiReport}</div>}
                {weakReport && <div className="ai-output-danger">{weakReport}</div>}
              </div>

              <div className="panel">
                <div className="panel-title" style={{justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}><span>✦</span> Grade Records</div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr><th>Student Name</th><th>Grade/Year</th><th>Average</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id}>
                        <td style={{color:"var(--text)",fontWeight:500}}>{s.name}</td>
                        <td>{s.grade}</td>
                        <td><span className={`avg-badge ${getAvgClass(Number(s.avg))}`}>{s.avg}%</span></td>
                        <td>
                          <span style={{fontSize:11,color:Number(s.avg)>=75?"var(--accent3)":Number(s.avg)>=50?"var(--gold)":"var(--accent2)"}}>
                            {Number(s.avg)>=75?"✓ Good":Number(s.avg)>=50?"△ Average":"⚠ Weak"}
                          </span>
                        </td>
                        <td>
                          <button onClick={()=>deleteStudent(s.id)} className="btn-ghost btn-sm">Remove</button>
                        </td>
                      </tr>
                    ))}
                    {!students.length && (
                      <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">👨‍🎓</div><p>No students yet. Add one below.</p></div></td></tr>
                    )}
                  </tbody>
                </table>
                <hr className="divider"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 120px 100px",gap:12,alignItems:"flex-end"}}>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Student Name</label>
                    <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStudent()} className="field-input" placeholder="Aarav Shah"/>
                  </div>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Grade / Year</label>
                    <select value={grade} onChange={e=>setGrade(e.target.value)} className="field-input" style={{cursor:"pointer"}}>
                      <option value="">— Select —</option>
                      {GRADE_GROUPS.map(g=>(
                        <optgroup key={g.label} label={g.label}>{g.opts.map(o=><option key={o}>{o}</option>)}</optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Average %</label>
                    <input value={avg} onChange={e=>setAvg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStudent()} className="field-input" placeholder="84" type="number" min="0" max="100"/>
                  </div>
                  <button onClick={addStudent} className="btn-primary" style={{whiteSpace:"nowrap" as const,height:44}}>+ Add</button>
                </div>
              </div>
            </>
          )}

          {/* ═══ ANALYTICS ═══ */}
          {page==="analytics" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Analytics</h1>
                <p className="page-sub">Deep insights into class and student performance</p>
              </div>
              {!students.length ? (
                <div className="panel"><div className="empty-state"><div className="empty-state-icon">📊</div><p>Add students in Dashboard to see analytics.</p></div></div>
              ) : (
                <>
                  <div className="insight-row">
                    <div className="insight-card">
                      <div className="insight-label">Class Average</div>
                      <div className="insight-value stat-accent">{classAvg}%</div>
                      <div className="insight-sub">{students.length} students total</div>
                    </div>
                    <div className="insight-card">
                      <div className="insight-label">Passing Rate</div>
                      <div className="insight-value stat-accent2">{Math.round((students.filter(s=>Number(s.avg)>=50).length/students.length)*100)}%</div>
                      <div className="insight-sub">{students.filter(s=>Number(s.avg)>=50).length} of {students.length} passing</div>
                    </div>
                    <div className="insight-card">
                      <div className="insight-label">Std Deviation</div>
                      <div className="insight-value stat-gold">{
                        (() => { const v=students.reduce((a,s)=>a+Math.pow(Number(s.avg)-classAvg,2),0)/students.length; return Math.round(Math.sqrt(v)); })()
                      }%</div>
                      <div className="insight-sub">Score spread</div>
                    </div>
                  </div>
                  <div className="chart-row">
                    <div className="panel" style={{marginBottom:0}}>
                      <div className="panel-title"><span>📈</span> Score Distribution</div>
                      <div style={{height:220}}>
                        <ResponsiveContainer>
                          <BarChart data={chartData} barSize={18}>
                            <CartesianGrid stroke="rgba(255,255,255,0.034)" vertical={false}/>
                            <XAxis dataKey="name" tick={{fontSize:10,fill:"#8a8aaa"}} axisLine={false} tickLine={false}/>
                            <YAxis domain={[0,100]} tick={{fontSize:10,fill:"#8a8aaa"}} axisLine={false} tickLine={false}/>
                            <Tooltip content={<CustomTooltip/>} cursor={{fill:"rgba(255,255,255,0.02)"}}/>
                            <Bar dataKey="avg" name="Average" fill="url(#barGrad)" radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="panel" style={{marginBottom:0}}>
                      <div className="panel-title"><span>🥧</span> Grade Distribution</div>
                      <div style={{height:220}}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={gradeDistribution} dataKey="Students" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                              {gradeDistribution.map((_:any,i:number)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/>
                            <Legend wrapperStyle={{fontSize:11,color:"var(--text2)"}}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-title"><span>✅</span> Attendance Rate by Student</div>
                    {attendanceChartData.some(d=>d.rate>0) ? (
                      <div style={{height:230}}>
                        <ResponsiveContainer>
                          <BarChart data={attendanceChartData} barSize={18}>
                            <CartesianGrid stroke="rgba(255,255,255,0.034)" vertical={false}/>
                            <XAxis dataKey="name" tick={{fontSize:10,fill:"#8a8aaa"}} axisLine={false} tickLine={false}/>
                            <YAxis domain={[0,100]} tick={{fontSize:10,fill:"#8a8aaa"}} axisLine={false} tickLine={false}/>
                            <Tooltip content={<CustomTooltip/>} cursor={{fill:"rgba(255,255,255,0.02)"}}/>
                            <Bar dataKey="rate" name="Attendance" fill="var(--accent3)" radius={[4,4,0,0]} opacity={0.85}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="empty-state"><p>No attendance data yet. Mark attendance first.</p></div>
                    )}
                  </div>
                  <div className="panel">
                    <div className="panel-title"><span>📋</span> Full Student Report</div>
                    <table className="data-table">
                      <thead>
                        <tr><th>Name</th><th>Grade</th><th>Avg %</th><th>Grade</th><th>Present</th><th>Absent</th><th>Att. Rate</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {students.map(s=>{
                          const rec=attendanceSummary[String(s.id)]||{present:0,absent:0};
                          const total=rec.present+rec.absent;
                          const rate=total>0?Math.round((rec.present/total)*100):0;
                          return (
                            <tr key={s.id}>
                              <td style={{color:"var(--text)",fontWeight:500}}>{s.name}</td>
                              <td>{s.grade}</td>
                              <td><span className={`avg-badge ${getAvgClass(Number(s.avg))}`}>{s.avg}%</span></td>
                              <td style={{color:"var(--accent)",fontWeight:600}}>{getLetterGrade(Number(s.avg))}</td>
                              <td style={{color:"var(--accent3)"}}>{rec.present}</td>
                              <td style={{color:"var(--accent2)"}}>{rec.absent}</td>
                              <td>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{flex:1,height:4,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden",maxWidth:60}}>
                                    <div style={{width:`${rate}%`,height:"100%",background:rate>=75?"var(--accent3)":rate>=50?"var(--gold)":"var(--accent2)",borderRadius:4}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:500,color:rate>=75?"var(--accent3)":rate>=50?"var(--gold)":"var(--accent2)"}}>{total?rate+"%":"—"}</span>
                                </div>
                              </td>
                              <td><span style={{fontSize:11,color:Number(s.avg)>=75&&rate>=75?"var(--accent3)":Number(s.avg)<50||rate<50?"var(--accent2)":"var(--gold)"}}>
                                {Number(s.avg)>=75&&rate>=75?"✓ On track":Number(s.avg)<50||rate<50?"⚠ At risk":"△ Monitor"}
                              </span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ═══ ATTENDANCE ═══ */}
          {page==="attendance" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Attendance</h1>
                <p className="page-sub">Track and manage daily student attendance</p>
              </div>
              {students.length > 0 && (
                <div className="panel">
                  <div className="panel-title"><span>📊</span> All-Time Attendance Summary</div>
                  {Object.keys(attendanceSummary).length === 0 ? (
                    <div className="empty-state"><p>No attendance records yet. Mark attendance below.</p></div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr><th>Student</th><th>Grade</th><th>Present</th><th>Absent</th><th>Total Days</th><th>Rate</th></tr>
                      </thead>
                      <tbody>
                        {students.map(s => {
                          const rec = attendanceSummary[String(s.id)] || {present:0,absent:0};
                          const total = rec.present + rec.absent;
                          const rate = total > 0 ? Math.round((rec.present/total)*100) : 0;
                          return (
                            <tr key={s.id}>
                              <td style={{color:"var(--text)",fontWeight:500}}>{s.name}</td>
                              <td>{s.grade}</td>
                              <td><span style={{color:"var(--accent3)",fontWeight:500}}>✓ {rec.present}</span></td>
                              <td><span style={{color:"var(--accent2)",fontWeight:500}}>✗ {rec.absent}</span></td>
                              <td style={{color:"var(--text)"}}>{total || "—"}</td>
                              <td>
                                {total > 0 ? (
                                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                                    <div style={{flex:1,height:5,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden",maxWidth:80}}>
                                      <div style={{width:`${rate}%`,height:"100%",background:rate>=75?"var(--accent3)":rate>=50?"var(--gold)":"var(--accent2)",borderRadius:4,transition:"width 0.8s ease"}}/>
                                    </div>
                                    <span className={`avg-badge ${rate>=75?"avg-high":rate>=50?"avg-mid":"avg-low"}`}>{rate}%</span>
                                  </div>
                                ) : <span style={{color:"var(--muted)",fontSize:12}}>No records</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <div className="panel">
                <div className="panel-title" style={{justifyContent:"space-between",flexWrap:"wrap" as const,gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}><span>✦</span> Mark Attendance</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <label style={{fontSize:10,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>DATE</label>
                    <input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} className="field-input" style={{width:"auto",padding:"6px 11px",fontSize:12}}/>
                  </div>
                </div>
                {!students.length ? (
                  <div className="empty-state"><div className="empty-state-icon">👨‍🎓</div><p>No students. Add them in Dashboard first.</p></div>
                ) : (
                  <>
                    <div className="att-summary">
                      <div className="att-pill att-pill-present">✓ Present: {students.filter(s=>(attendance[s.id]||"Present")==="Present").length}</div>
                      <div className="att-pill att-pill-absent">✗ Absent: {students.filter(s=>attendance[s.id]==="Absent").length}</div>
                      <div className="att-pill att-pill-rate">Total: {students.length} students</div>
                    </div>
                    <div style={{marginBottom:14,display:"flex",gap:9}}>
                      <button onClick={()=>{const all:Record<string,string>={};students.forEach(s=>all[s.id]="Present");setAttendance(all);}} className="btn-success btn-sm">✓ All Present</button>
                      <button onClick={()=>{const all:Record<string,string>={};students.forEach(s=>all[s.id]="Absent");setAttendance(all);}} className="btn-danger btn-sm">✗ All Absent</button>
                    </div>
                    {students.map(s => (
                      <div key={s.id} className="attendance-row">
                        <div>
                          <div className="attendance-name">{s.name}<span style={{marginLeft:10,fontSize:11,color:"var(--muted)",fontWeight:300}}>{s.grade}</span></div>
                          {attendanceSummary[String(s.id)] && (() => {
                            const rec=attendanceSummary[String(s.id)]; const total=rec.present+rec.absent; const rate=total>0?Math.round((rec.present/total)*100):0;
                            return <div style={{fontSize:11,color:"var(--muted)",marginTop:2,fontWeight:300}}>Overall: {rec.present}P / {rec.absent}A · {total>0?rate+"%":"No records"}</div>;
                          })()}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:(attendance[s.id]||"Present")==="Present"?"var(--accent3)":"var(--accent2)",transition:"background 0.2s"}}/>
                          <select className="att-select" value={attendance[s.id]||"Present"} onChange={e=>setAttendance({...attendance,[s.id]:e.target.value})}>
                            <option>Present</option><option>Absent</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    <div className="btn-row">
                      <button onClick={saveAttendance} className="btn-primary">💾 Save Attendance</button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ═══ QUIZ & TESTS ═══ */}
          {page==="quiz" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Quiz & Tests</h1>
                <p className="page-sub">Create AI-powered quizzes with advanced proctoring — face detection, tab monitoring, auto-termination</p>
              </div>

              {/* ─── QUIZ LIST ─── */}
              {quizView==="list" && (
                <>
                  <div style={{display:"flex",gap:10,marginBottom:20}}>
                    <button onClick={()=>setQuizView("create")} className="btn-primary">+ Create Quiz</button>
                    <button onClick={()=>setQuizView("ai-gen")} className="btn-gold">✦ AI Generate Quiz</button>
                  </div>

                  {/* Active Session Banner */}
                  {activeSession && (
                    <div style={{background:"rgba(0,219,160,0.07)",border:"1px solid rgba(0,219,160,0.25)",borderRadius:"var(--radius)",padding:"18px 22px",marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:"var(--accent3)",boxShadow:"0 0 10px rgba(0,219,160,0.6)",animation:"livePulse 2s infinite",flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Live Session: {activeSession.quizTitle}</div>
                        <div style={{fontSize:11.5,color:"var(--muted)",marginTop:2}}>{activeSession.results?.length||0} submission{activeSession.results?.length!==1?"s":""} received</div>
                      </div>
                      <button onClick={()=>setQuizView("session")} className="btn-success btn-sm">View Session →</button>
                      <button onClick={endSession} className="btn-danger btn-sm">End Session</button>
                    </div>
                  )}

                  {!quizzes.length ? (
                    <div className="panel"><div className="empty-state"><div className="empty-state-icon">🎯</div><p>No quizzes yet. Create one above or generate with AI.</p></div></div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
                      {quizzes.map(quiz => (
                        <div key={quiz.id} style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"20px 22px",transition:"border-color 0.2s,box-shadow 0.2s"}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(124,111,255,0.25)";(e.currentTarget as HTMLElement).style.boxShadow="0 8px 28px rgba(0,0,0,0.3)";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.055)";(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14}}>
                            <div>
                              <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:4}}>{quiz.title}</div>
                              <div style={{fontSize:11.5,color:"var(--muted)",fontWeight:300}}>{quiz.subject} · {quiz.grade}</div>
                            </div>
                            <div style={{textAlign:"right" as const,flexShrink:0}}>
                              <div style={{fontSize:22,fontWeight:700,fontFamily:"var(--font-serif)",color:"var(--accent)"}}>{quiz.questions.length}</div>
                              <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>QUESTIONS</div>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap" as const,marginBottom:16}}>
                            <span style={{fontSize:11,color:"var(--muted)",background:"rgba(255,255,255,0.04)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px"}}>⏱ {quiz.duration} min</span>
                            <span style={{fontSize:11,color:"var(--muted)",background:"rgba(255,255,255,0.04)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px"}}>📊 {quiz.totalMarks} marks</span>
                            <span style={{fontSize:11,color:"var(--muted)",background:"rgba(255,255,255,0.04)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px"}}>✓ Pass: {quiz.passMark}%</span>
                            <span style={{fontSize:11,color:"var(--accent3)",background:"rgba(0,219,160,0.07)",border:"1px solid rgba(0,219,160,0.18)",borderRadius:6,padding:"3px 10px"}}>🔒 Proctored</span>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>startSession(quiz)} className="btn-primary btn-sm" style={{flex:1}}>▶ Start Session</button>
                            <button onClick={()=>deleteQuiz(quiz.id)} className="btn-danger btn-sm">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Past Sessions */}
                  {sessions.filter(s=>!s.active).length > 0 && (
                    <div className="panel" style={{marginTop:16}}>
                      <div className="panel-title"><span>📁</span> Past Sessions</div>
                      {sessions.filter(s=>!s.active).slice().reverse().map(sess => (
                        <div key={sess.id} className="session-card">
                          <div className="session-status-dot session-ended"/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>{sess.quizTitle}</div>
                            <div style={{fontSize:11.5,color:"var(--muted)",marginTop:2}}>
                              {new Date(sess.startedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · {sess.results?.length||0} submissions
                            </div>
                          </div>
                          {sess.results?.length > 0 && (
                            <div style={{textAlign:"right" as const}}>
                              <div style={{fontSize:13,fontWeight:600,color:"var(--accent)"}}>
                                Avg: {Math.round(sess.results.reduce((a:number,r:any)=>a+r.percentage,0)/sess.results.length)}%
                              </div>
                              <div style={{fontSize:11,color:"var(--muted)"}}>{sess.results.filter((r:any)=>r.terminated).length} terminated</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ─── AI GENERATE ─── */}
              {quizView==="ai-gen" && (
                <>
                  <div style={{display:"flex",gap:10,marginBottom:20}}>
                    <button onClick={()=>setQuizView("list")} className="btn-ghost">← Back to Quizzes</button>
                  </div>
                  <div className="panel">
                    <div className="panel-title"><span>✦</span> AI Quiz Generator</div>
                    <div style={{background:"linear-gradient(135deg,rgba(124,111,255,0.06),rgba(0,219,160,0.04))",border:"1px solid rgba(124,111,255,0.18)",borderRadius:"var(--radius)",padding:"18px 22px",marginBottom:22}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--accent)",letterSpacing:1.5,marginBottom:7}}>✦ HOW IT WORKS</div>
                      <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.8,fontWeight:300}}>
                        Enter a topic and configure options → AI generates complete MCQ questions with correct answers → Review and edit questions → Save as proctored quiz → Share with students
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div className="field-group" style={{gridColumn:"span 2"}}>
                        <label className="field-label">Topic *</label>
                        <input className="field-input" placeholder="e.g. Photosynthesis, Newton's Laws, World War II, Algebra…" value={aiQuizTopic} onChange={e=>setAiQuizTopic(e.target.value)}/>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Grade / Class</label>
                        <select className="field-input" value={qGrade} onChange={e=>setQGrade(e.target.value)} style={{cursor:"pointer"}}>
                          {[...GRADE_GROUPS[0].opts,...GRADE_GROUPS[1].opts].map(g=><option key={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Difficulty</label>
                        <select className="field-input" value={aiQuizDiff} onChange={e=>setAiQuizDiff(e.target.value)} style={{cursor:"pointer"}}>
                          <option>Easy</option><option>Medium</option><option>Hard</option><option>Mixed</option>
                        </select>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Number of Questions</label>
                        <select className="field-input" value={aiQuizNum} onChange={e=>setAiQuizNum(Number(e.target.value))} style={{cursor:"pointer"}}>
                          {[5,10,15,20,25,30].map(n=><option key={n}>{n}</option>)}
                        </select>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Quiz Title</label>
                        <input className="field-input" placeholder="e.g. Chapter 3 Quiz" value={qTitle} onChange={e=>setQTitle(e.target.value)}/>
                      </div>
                    </div>
                    <div className="btn-row">
                      <button onClick={generateAIQuiz} className="btn-gold" disabled={aiGenLoading}>
                        {aiGenLoading?<><div className="spinner" style={{display:"inline-block",marginRight:8}}/>Generating…</>:"✦ Generate Questions with AI"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ─── CREATE / EDIT QUIZ ─── */}
              {quizView==="create" && (
                <>
                  <div style={{display:"flex",gap:10,marginBottom:20}}>
                    <button onClick={()=>setQuizView("list")} className="btn-ghost">← Back</button>
                    <button onClick={saveQuiz} className="btn-success">💾 Save Quiz</button>
                  </div>
                  <div className="quiz-builder-grid">
                    <div>
                      {/* Quiz config */}
                      <div className="panel" style={{marginBottom:14}}>
                        <div className="panel-title"><span>⚙</span> Quiz Settings</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                          <div className="field-group" style={{gridColumn:"span 2",marginBottom:0}}>
                            <label className="field-label">Quiz Title *</label>
                            <input className="field-input" placeholder="e.g. Chapter 4 Mid-Term Quiz" value={qTitle} onChange={e=>setQTitle(e.target.value)}/>
                          </div>
                          <div className="field-group" style={{marginBottom:0}}>
                            <label className="field-label">Subject</label>
                            <input className="field-input" placeholder="Physics, Maths…" value={qSubject} onChange={e=>setQSubject(e.target.value)}/>
                          </div>
                          <div className="field-group" style={{marginBottom:0}}>
                            <label className="field-label">Grade</label>
                            <select className="field-input" value={qGrade} onChange={e=>setQGrade(e.target.value)} style={{cursor:"pointer"}}>
                              {[...GRADE_GROUPS[0].opts,...GRADE_GROUPS[1].opts].map(g=><option key={g}>{g}</option>)}
                            </select>
                          </div>
                          <div className="field-group" style={{marginBottom:0}}>
                            <label className="field-label">Duration (minutes)</label>
                            <input className="field-input" type="number" min="5" max="180" value={qDuration} onChange={e=>setQDuration(Number(e.target.value))}/>
                          </div>
                          <div className="field-group" style={{marginBottom:0}}>
                            <label className="field-label">Pass Mark (%)</label>
                            <input className="field-input" type="number" min="1" max="100" value={qPassMark} onChange={e=>setQPassMark(Number(e.target.value))}/>
                          </div>
                        </div>
                      </div>

                      {/* Questions */}
                      <div className="panel-title" style={{paddingLeft:4,marginBottom:12}}><span>❓</span> Questions ({questions.length})</div>
                      {questions.map((q,qi) => (
                        <div key={qi} className="q-card">
                          <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
                            <div className="q-card-num">{qi+1}</div>
                            <div style={{flex:1}}>
                              <textarea
                                className="field-input"
                                rows={2}
                                placeholder="Enter question text…"
                                value={q.text}
                                onChange={e=>updateQuestion(qi,"text",e.target.value)}
                                style={{resize:"none",marginBottom:8}}
                              />
                              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                                <label style={{fontSize:10,color:"var(--muted)",fontWeight:600,letterSpacing:1}}>MARKS</label>
                                <input type="number" min="1" max="10" value={q.marks} onChange={e=>updateQuestion(qi,"marks",Number(e.target.value))}
                                  className="field-input" style={{width:70,padding:"5px 10px",fontSize:12}}/>
                                <span style={{fontSize:11,color:"var(--muted)"}}>· Mark correct option:</span>
                              </div>
                              {q.options.map((opt:string,oi:number) => (
                                <div key={oi} className="q-option-row">
                                  <div onClick={()=>updateQuestion(qi,"correct",oi)} className={`q-option-radio ${q.correct===oi?"correct":""}`}
                                    style={{cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    {q.correct===oi && <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent3)"}}/>}
                                  </div>
                                  <input
                                    className="field-input"
                                    style={{flex:1,padding:"7px 12px",fontSize:12.5}}
                                    placeholder={`Option ${String.fromCharCode(65+oi)}`}
                                    value={opt}
                                    onChange={e=>updateOption(qi,oi,e.target.value)}
                                  />
                                </div>
                              ))}
                            </div>
                            <button onClick={()=>removeQuestion(qi)} className="btn-danger btn-sm" style={{padding:"4px 10px",fontSize:11,flexShrink:0}}>✕</button>
                          </div>
                        </div>
                      ))}
                      <button onClick={addQuestion} className="btn-ghost" style={{width:"100%",padding:"12px",textAlign:"center" as const,borderStyle:"dashed"}}>
                        + Add Question
                      </button>
                    </div>

                    {/* Sidebar summary */}
                    <div>
                      <div className="panel" style={{position:"sticky",top:20}}>
                        <div className="panel-title"><span>📊</span> Quiz Summary</div>
                        <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
                          <div style={{background:"var(--surface2)",borderRadius:"var(--radius-sm)",padding:"14px 16px",border:"1px solid var(--border)"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginBottom:6}}>TOTAL QUESTIONS</div>
                            <div style={{fontSize:32,fontFamily:"var(--font-serif)",color:"var(--accent)"}}>{questions.length}</div>
                          </div>
                          <div style={{background:"var(--surface2)",borderRadius:"var(--radius-sm)",padding:"14px 16px",border:"1px solid var(--border)"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginBottom:6}}>TOTAL MARKS</div>
                            <div style={{fontSize:32,fontFamily:"var(--font-serif)",color:"var(--accent3)"}}>{questions.reduce((a,q)=>a+q.marks,0)}</div>
                          </div>
                          <div style={{background:"var(--surface2)",borderRadius:"var(--radius-sm)",padding:"14px 16px",border:"1px solid var(--border)"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginBottom:6}}>DURATION</div>
                            <div style={{fontSize:32,fontFamily:"var(--font-serif)",color:"var(--gold)"}}>{qDuration}<span style={{fontSize:16,color:"var(--muted)",fontFamily:"var(--font-sans)"}}>m</span></div>
                          </div>
                        </div>
                        <div style={{marginTop:16,background:"rgba(0,219,160,0.05)",border:"1px solid rgba(0,219,160,0.18)",borderRadius:"var(--radius-sm)",padding:"12px 14px"}}>
                          <div style={{fontSize:9.5,fontWeight:700,color:"var(--accent3)",letterSpacing:1.5,marginBottom:7}}>🔒 PROCTORING ACTIVE</div>
                          <div style={{fontSize:11.5,color:"var(--text2)",lineHeight:1.8,fontWeight:300}}>
                            ✓ Face detection<br/>
                            ✓ Tab switch monitoring<br/>
                            ✓ Auto-terminate on 3 violations<br/>
                            ✓ Full violation log<br/>
                            ✓ Screen activity tracking
                          </div>
                        </div>
                        <button onClick={saveQuiz} className="btn-success" style={{width:"100%",marginTop:14}}>💾 Save Quiz</button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ─── LIVE SESSION ─── */}
              {quizView==="session" && activeSession && activeQuiz && (
                <>
                  <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center"}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:"var(--accent3)",boxShadow:"0 0 8px rgba(0,219,160,0.6)",animation:"livePulse 2s infinite"}}/>
                    <span style={{fontSize:13,color:"var(--accent3)",fontWeight:500}}>Live Session</span>
                    <div style={{flex:1}}/>
                    <button onClick={endSession} className="btn-danger btn-sm">⏹ End Session</button>
                  </div>

                  {/* Session info */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
                    <div className="stat-card">
                      <div className="stat-label">Quiz</div>
                      <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginTop:4}}>{activeQuiz.title}</div>
                      <div className="stat-sub">{activeQuiz.questions.length} questions · {activeQuiz.duration} min</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Submissions</div>
                      <div className="stat-value stat-accent">{activeSession.results?.length||0}</div>
                      <div className="stat-sub">{(activeSession.results||[]).filter((r:any)=>!r.terminated).length} completed · {(activeSession.results||[]).filter((r:any)=>r.terminated).length} terminated</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Avg Score</div>
                      <div className="stat-value stat-accent3">
                        {(activeSession.results||[]).length > 0
                          ? Math.round((activeSession.results||[]).filter((r:any)=>!r.terminated).reduce((a:number,r:any)=>a+r.percentage,0)/Math.max(1,(activeSession.results||[]).filter((r:any)=>!r.terminated).length))
                          : 0}%
                      </div>
                      <div className="stat-sub">Among completed</div>
                    </div>
                  </div>

                  {/* Student Takes Test */}
                  <div className="panel">
                    <div className="panel-title"><span>🎯</span> Take Test (Student View)</div>
                    <div style={{background:"rgba(255,204,92,0.04)",border:"1px solid rgba(255,204,92,0.18)",borderRadius:"var(--radius-sm)",padding:"14px 18px",marginBottom:18}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",letterSpacing:1.5,marginBottom:6}}>⚠ PROCTORING NOTICE</div>
                      <div style={{fontSize:12.5,color:"var(--text2)",lineHeight:1.7,fontWeight:300}}>
                        When you click "Start Proctored Test", the camera will activate and monitoring will begin. The test will automatically close if:
                        (1) you switch tabs or windows 3+ times, or (2) your face is absent from camera for extended periods.
                        All activity is logged and reported to the teacher.
                      </div>
                    </div>
                    <button onClick={()=>{setShowResultScreen(false);setLastQuizResult(null);startStudentTest();}} className="eval-cta-btn" style={{fontSize:14}}>
                      🔒 Start Proctored Test
                    </button>
                  </div>

                  {/* ✅ Instant result screen shown to student after test */}
                  {showResultScreen && lastQuizResult && (
                    <div className="panel" style={{border:"1px solid rgba(124,111,255,0.25)",background:"linear-gradient(135deg,rgba(124,111,255,0.06),rgba(0,219,160,0.04))"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                        <div className="panel-title" style={{marginBottom:0}}><span>🎉</span> Test Result</div>
                        <button onClick={()=>setShowResultScreen(false)} className="btn-ghost btn-sm">Dismiss</button>
                      </div>
                      {lastQuizResult.terminated ? (
                        <div style={{textAlign:"center",padding:"24px 0"}}>
                          <div style={{fontSize:48,marginBottom:12}}>🚫</div>
                          <div style={{fontFamily:"var(--font-serif)",fontSize:22,color:"var(--accent2)",marginBottom:8}}>Test Terminated</div>
                          <div style={{fontSize:13,color:"var(--muted)",fontWeight:300}}>Proctoring violations exceeded the allowed limit. Result has been logged.</div>
                        </div>
                      ) : (
                        <>
                          {/* ─── Marks earned calculation ─── */}
                          {(() => {
                            const marksEarned = activeQuiz?.questions
                              ? activeQuiz.questions.filter((_:any,qi:number)=>lastQuizResult.answers?.[qi]===activeQuiz.questions[qi].correct).reduce((a:number,q:any)=>a+q.marks,0)
                              : lastQuizResult.correct;
                            const totalMarks = activeQuiz?.totalMarks || lastQuizResult.total;
                            return (
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:20}}>
                                <div style={{textAlign:"center",background:"var(--surface2)",border:"1px solid rgba(124,111,255,0.2)",borderRadius:"var(--radius)",padding:"16px 10px"}}>
                                  <div style={{fontFamily:"var(--font-serif)",fontSize:36,color:"var(--accent)",lineHeight:1}}>
                                    {marksEarned}
                                    <span style={{fontSize:16,color:"var(--muted)",fontFamily:"var(--font-sans)"}}>/{totalMarks}</span>
                                  </div>
                                  <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginTop:6}}>MARKS</div>
                                </div>
                                <div style={{textAlign:"center",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 10px"}}>
                                  <div style={{fontFamily:"var(--font-serif)",fontSize:36,color:lastQuizResult.percentage>=75?"var(--accent3)":lastQuizResult.percentage>=50?"var(--gold)":"var(--accent2)",lineHeight:1}}>{lastQuizResult.percentage}%</div>
                                  <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginTop:6}}>PERCENTAGE</div>
                                </div>
                                <div style={{textAlign:"center",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 10px"}}>
                                  <div style={{fontFamily:"var(--font-serif)",fontSize:36,color:"var(--accent3)",lineHeight:1}}>{lastQuizResult.correct}/{lastQuizResult.total}</div>
                                  <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginTop:6}}>CORRECT</div>
                                </div>
                                <div style={{textAlign:"center",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 10px"}}>
                                  <div style={{fontFamily:"var(--font-serif)",fontSize:36,color:["A+","A"].includes(lastQuizResult.grade)?"var(--accent3)":["B","C"].includes(lastQuizResult.grade)?"var(--gold)":"var(--accent2)",lineHeight:1}}>{lastQuizResult.grade}</div>
                                  <div style={{fontSize:9,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginTop:6}}>GRADE</div>
                                </div>
                              </div>
                            );
                          })()}
                          <div style={{textAlign:"center",padding:"14px",background:lastQuizResult.passed?"rgba(0,219,160,0.07)":"rgba(255,95,160,0.07)",border:`1px solid ${lastQuizResult.passed?"rgba(0,219,160,0.25)":"rgba(255,95,160,0.25)"}`,borderRadius:"var(--radius-sm)"}}>
                            <span style={{fontSize:15,fontWeight:600,color:lastQuizResult.passed?"var(--accent3)":"var(--accent2)"}}>
                              {lastQuizResult.passed?"✓ PASSED — Well done!":"✗ FAILED — Keep practising!"}
                            </span>
                          </div>
                          {/* Per-question review */}
                          {activeQuiz.questions && (
                            <div style={{marginTop:18}}>
                              <div style={{fontSize:9.5,fontWeight:700,color:"var(--muted)",letterSpacing:2,marginBottom:10}}>ANSWER REVIEW</div>
                              {activeQuiz.questions.map((q:any, qi:number) => {
                                const studentAns = lastQuizResult.answers?.[qi];
                                const isCorrect = studentAns === q.correct;
                                const notAnswered = studentAns === undefined;
                                return (
                                  <div key={qi} style={{background:isCorrect?"rgba(0,219,160,0.04)":notAnswered?"rgba(255,255,255,0.02)":"rgba(255,95,160,0.04)",border:`1px solid ${isCorrect?"rgba(0,219,160,0.2)":notAnswered?"var(--border)":"rgba(255,95,160,0.2)"}`,borderRadius:"var(--radius-sm)",padding:"12px 16px",marginBottom:8}}>
                                    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                                      <span style={{fontSize:18,flexShrink:0}}>{isCorrect?"✅":notAnswered?"⬜":"❌"}</span>
                                      <div style={{flex:1}}>
                                        <div style={{fontSize:13,fontWeight:500,color:"var(--text)",marginBottom:6}}>{qi+1}. {q.text}</div>
                                        <div style={{display:"flex",flexDirection:"column" as const,gap:3}}>
                                          {q.options.map((opt:string, oi:number) => {
                                            const isStudentPick = studentAns===oi;
                                            const isCorrectOpt = q.correct===oi;
                                            return (
                                              <div key={oi} style={{fontSize:12,padding:"4px 10px",borderRadius:5,fontWeight:300,
                                                background:isCorrectOpt?"rgba(0,219,160,0.1)":isStudentPick&&!isCorrectOpt?"rgba(255,95,160,0.08)":"transparent",
                                                color:isCorrectOpt?"var(--accent3)":isStudentPick&&!isCorrectOpt?"var(--accent2)":"var(--text2)",
                                                border:isCorrectOpt?"1px solid rgba(0,219,160,0.2)":isStudentPick&&!isCorrectOpt?"1px solid rgba(255,95,160,0.2)":"1px solid transparent"}}>
                                                {isCorrectOpt?"✓ ":isStudentPick&&!isCorrectOpt?"✗ ":String.fromCharCode(65+oi)+". "}{opt}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {q.explanation && <div style={{fontSize:11.5,color:"var(--muted)",marginTop:7,fontStyle:"italic",fontWeight:300}}>💡 {q.explanation}</div>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Results */}
                  {(activeSession.results||[]).length > 0 && (
                    <div className="panel">
                      <div className="panel-title"><span>📋</span> Submissions Received</div>
                      {(activeSession.results||[]).map((result:any, i:number) => (
                        <div key={i} className="quiz-result-row">
                          {result.terminated ? (
                            <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,95,160,0.1)",border:"1px solid rgba(255,95,160,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🚫</div>
                          ) : (
                            <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(0,219,160,0.1)",border:"1px solid rgba(0,219,160,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>✅</div>
                          )}
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:500,color:result.terminated?"var(--accent2)":"var(--text)"}}>
                              {result.terminated ? "🚫 Test Terminated (Cheating Detected)" : `✅ Submission ${i+1}`}
                            </div>
                            <div style={{fontSize:11.5,color:"var(--muted)",marginTop:3,lineHeight:1.7}}>
                              {result.terminated
                                ? <>
                                    Tab / face violations exceeded limit
                                    {result.logs && <span style={{color:"var(--accent2)",marginLeft:6}}>· {result.logs.filter((l:any)=>l.type!=="ok").length} violations logged</span>}
                                  </>
                                : <>
                                    <span style={{color:"var(--accent3)",fontWeight:500}}>{result.correct}/{result.total} correct</span>
                                    <span style={{margin:"0 6px",opacity:0.4}}>·</span>
                                    {/* Show actual marks earned out of total */}
                                    <span style={{color:"var(--accent)",fontWeight:500}}>
                                      {activeQuiz?.questions
                                        ? `${activeQuiz.questions.filter((_:any,qi:number)=>result.answers?.[qi]===activeQuiz.questions[qi].correct).reduce((a:number,q:any)=>a+q.marks,0)} / ${activeQuiz.totalMarks} marks`
                                        : `${result.percentage}%`}
                                    </span>
                                    <span style={{margin:"0 6px",opacity:0.4}}>·</span>
                                    <span>{result.percentage}%</span>
                                    {result.logs && <span style={{margin:"0 6px",opacity:0.4}}>·</span>}
                                    {result.logs && <span style={{color:"var(--muted)"}}>{result.logs.filter((l:any)=>l.type!=="ok").length} violation{result.logs.filter((l:any)=>l.type!=="ok").length!==1?"s":""}</span>}
                                  </>
                              }
                            </div>
                          </div>
                          {!result.terminated && (
                            <div style={{textAlign:"right" as const,flexShrink:0}}>
                              <div style={{fontFamily:"var(--font-serif)",fontSize:24,color:result.percentage>=75?"var(--accent3)":result.percentage>=50?"var(--gold)":"var(--accent2)",lineHeight:1}}>
                                {activeQuiz?.questions
                                  ? `${activeQuiz.questions.filter((_:any,qi:number)=>result.answers?.[qi]===activeQuiz.questions[qi].correct).reduce((a:number,q:any)=>a+q.marks,0)}/${activeQuiz.totalMarks}`
                                  : `${result.correct}/${result.total}`}
                              </div>
                              <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,letterSpacing:1,marginTop:2}}>MARKS</div>
                              <div style={{fontSize:11,color:result.passed?"var(--accent3)":"var(--accent2)",fontWeight:600,marginTop:4}}>{result.passed?"✓ PASS":"✗ FAIL"}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ LESSON PLANNER ═══ */}
          {page==="lesson" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Lesson Planner</h1>
                <p className="page-sub">Full classroom-ready lesson plan in seconds</p>
              </div>
              <div className="panel">
                <div className="panel-title"><span>✧</span> Configure Your Lesson</div>
                <div className="field-group">
                  <label className="field-label">Topic *</label>
                  <input className="field-input" placeholder="e.g. Photosynthesis, Quadratic Equations, French Revolution…"
                    value={lessonTopic} onChange={e=>setLessonTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generateLesson()}/>
                </div>
                <div className="lesson-config">
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Grade / Class</label>
                    <select className="field-input" value={lessonGrade} onChange={e=>setLessonGrade(e.target.value)} style={{cursor:"pointer"}}>
                      {[...GRADE_GROUPS[0].opts,...GRADE_GROUPS[1].opts,"College Level"].map(g=><option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Duration</label>
                    <select className="field-input" value={lessonDuration} onChange={e=>setLessonDuration(e.target.value)} style={{cursor:"pointer"}}>
                      {["30 minutes","45 minutes","60 minutes","90 minutes"].map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Additional Context (optional)</label>
                  <input className="field-input" placeholder="e.g. focus on experiments, visual learners, CBSE board…"
                    value={lessonContext} onChange={e=>setLessonContext(e.target.value)}/>
                </div>
                <button onClick={generateLesson} className="btn-primary" disabled={loading}>
                  {loading?"Generating…":"✧ Generate Lesson Plan"}
                </button>
              </div>
              {lessonSections.length > 0 && (
                <>
                  <div className="lesson-meta-bar">
                    <div className="lesson-meta-item">✧ {lessonTopic}</div>
                    <div className="lesson-meta-item">👥 {lessonGrade}</div>
                    <div className="lesson-meta-item">⏱ {lessonDuration}</div>
                    <div className="lesson-meta-item">📋 {lessonSections.length} sections</div>
                  </div>
                  {lessonSections.map((sec,i)=><LessonSection key={i} icon={sec.icon} title={sec.title} body={sec.body}/>)}
                </>
              )}
              {lessonOutput && !lessonSections.length && <div className="ai-output">{lessonOutput}</div>}
            </>
          )}

          {/* ═══ STUDY TOOL ═══ */}
          {page==="study" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Study Tool</h1>
                <p className="page-sub">Expert-level deep study guide — 9 comprehensive sections</p>
              </div>
              <div className="panel">
                <div className="panel-title"><span>◆</span> Topic Explorer</div>
                <div style={{display:"flex",gap:11,alignItems:"flex-end"}}>
                  <div className="field-group" style={{flex:1,marginBottom:0}}>
                    <label className="field-label">Enter Topic</label>
                    <input className="field-input"
                      placeholder="e.g. Photosynthesis, Newton's Laws, French Revolution, Cell Division…"
                      value={studyTopic}
                      onChange={e=>setStudyTopic(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&generateStudy()}/>
                  </div>
                  <button onClick={generateStudy} className="btn-primary" disabled={studyLoading} style={{whiteSpace:"nowrap" as const,padding:"11px 26px",height:44}}>
                    {studyLoading?"Generating…":"◆ Deep Study"}
                  </button>
                </div>
              </div>

              {studyLoading && (
                <div className="progress-screen">
                  <div className="progress-icon">🔬</div>
                  <div style={{fontFamily:"var(--font-serif)",fontSize:22,color:"#fff",marginBottom:8}}>Building Study Guide…</div>
                  <div style={{fontSize:13,color:"var(--muted)",marginBottom:24,fontWeight:300}}>Generating comprehensive content for "{studyTopic}"</div>
                  <div className="progress-steps">
                    <div className="progress-step-row running"><div className="progress-step-dot"/>Generating 9 detailed sections</div>
                    <div className="progress-step-row waiting"><div className="progress-step-dot"/>Fetching reference images</div>
                    <div className="progress-step-row waiting"><div className="progress-step-dot"/>Formatting study guide</div>
                  </div>
                </div>
              )}

              {studyData && !studyLoading && (
                <>
                  <div style={{background:"linear-gradient(135deg,rgba(124,111,255,0.08),rgba(0,219,160,0.04))",border:"1px solid rgba(124,111,255,0.22)",borderRadius:20,padding:"34px 38px",marginBottom:14,position:"relative",overflow:"hidden",animation:"fadeUp 0.4s ease both"}}>
                    <div style={{position:"absolute",top:0,right:0,width:200,height:200,background:"radial-gradient(circle,rgba(124,111,255,0.08),transparent 70%)"}}/>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:2.5,color:"var(--accent)",textTransform:"uppercase" as const,marginBottom:13}}>◈ Definition — {studyTopic}</div>
                    <p style={{fontSize:16,lineHeight:1.9,color:"var(--text)",fontWeight:300,maxWidth:720,position:"relative"}}>
                      {studyData.definition || <span style={{color:"var(--muted)"}}>Definition not available — see Explanation section below.</span>}
                    </p>
                  </div>

                  {studyImages.length > 0 && (
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"var(--muted)",textTransform:"uppercase" as const,marginBottom:10}}>Visual Reference</div>
                      <div className="study-image-grid">
                        {studyImages.map((img,i)=>(
                          <div key={i} className="study-image-item">
                            <img src={img.src} alt={img.caption} onError={e=>{(e.target as HTMLImageElement).parentElement!.style.display="none";}}/>
                            <div className="study-image-caption">{img.caption}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {studyData.explanation && (
                    <StudyCard icon="📖" title="Detailed Explanation" subtitle="Step-by-step breakdown">
                      <div style={{fontSize:13.5,lineHeight:2,color:"var(--text2)",whiteSpace:"pre-wrap" as const,fontWeight:300}}>{studyData.explanation}</div>
                    </StudyCard>
                  )}
                  {studyData.keyConcepts && (
                    <StudyCard icon="🧩" title="Key Concepts" subtitle={`Core components of ${studyTopic}`}>
                      {studyData.keyConcepts.includes("•") ? (
                        <div style={{display:"flex",flexWrap:"wrap" as const,gap:8}}>
                          {studyData.keyConcepts.split("\n").filter((l:string)=>l.trim().startsWith("•")).map((line:string,i:number)=>{
                            const parts=line.replace(/^•\s*/,"").split("—");
                            return (
                              <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start",background:"rgba(124,111,255,0.06)",border:"1px solid rgba(124,111,255,0.16)",borderRadius:9,padding:"12px 15px",flex:"1 1 300px"}}>
                                <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)",flexShrink:0,marginTop:7}}/>
                                <div style={{fontSize:13.5,color:"var(--text)",fontWeight:300,lineHeight:1.75}}>
                                  {parts[0]&&<strong style={{color:"var(--text)",fontWeight:600}}>{parts[0].trim()}</strong>}
                                  {parts.slice(1).join("—")&&<span style={{color:"var(--text2)"}}> — {parts.slice(1).join("—").trim()}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{fontSize:13.5,lineHeight:2,color:"var(--text2)",whiteSpace:"pre-wrap" as const,fontWeight:300}}>{studyData.keyConcepts}</div>
                      )}
                    </StudyCard>
                  )}
                  {studyData.types && <StudyCard icon="📂" title="Types & Classifications" subtitle={`Different categories of ${studyTopic}`}><div style={{fontSize:13.5,lineHeight:2,color:"var(--text2)",whiteSpace:"pre-wrap" as const,fontWeight:300}}>{studyData.types}</div></StudyCard>}
                  {studyData.applications && <StudyCard icon="🌍" title="Real World Applications" subtitle="Where and how this topic is used"><div style={{fontSize:13.5,lineHeight:2,color:"var(--text2)",whiteSpace:"pre-wrap" as const,fontWeight:300}}>{studyData.applications}</div></StudyCard>}
                  {studyData.history && <StudyCard icon="📜" title="Historical Context" subtitle={`Origin and evolution of ${studyTopic}`}><div style={{fontSize:13.5,lineHeight:2,color:"var(--text2)",whiteSpace:"pre-wrap" as const,fontWeight:300}}>{studyData.history}</div></StudyCard>}
                  {studyData.misconceptions && (
                    <StudyCard icon="⚠️" title="Common Misconceptions" subtitle="What students often get wrong">
                      {studyData.misconceptions.split("\n").filter((l:string)=>l.trim()).map((line:string,i:number)=>(
                        <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 16px",borderRadius:"var(--radius-sm)",border:"1px solid rgba(255,95,160,0.15)",background:"rgba(255,95,160,0.03)",marginBottom:7}}>
                          <span style={{fontSize:14,flexShrink:0,marginTop:2}}>{line.startsWith("✓")?"✓":"⚠"}</span>
                          <p style={{fontSize:13.5,lineHeight:1.75,color:line.startsWith("✓")?"var(--accent3)":"var(--text2)",fontWeight:300}}>{line.replace(/^[⚠✓]\s*/,"")}</p>
                        </div>
                      ))}
                    </StudyCard>
                  )}
                  {studyData.examTips && (
                    <StudyCard icon="✏️" title="Exam Tips" subtitle="How to score well in exams">
                      {studyData.examTips.split("\n").filter((l:string)=>l.trim()).map((line:string,i:number)=>{
                        const m=line.match(/^(\d+)\.\s*(.*)/s);
                        return (
                          <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 16px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"rgba(0,219,160,0.03)",marginBottom:7}}>
                            <span style={{fontSize:11,fontWeight:700,color:"var(--accent3)",background:"rgba(0,219,160,0.1)",border:"1px solid rgba(0,219,160,0.22)",borderRadius:4,padding:"2px 7px",flexShrink:0,marginTop:1,minWidth:24,textAlign:"center" as const}}>{m?m[1]:i+1}</span>
                            <p style={{fontSize:13.5,lineHeight:1.75,color:"var(--text2)",fontWeight:300}}>{m?m[2]:line}</p>
                          </div>
                        );
                      })}
                    </StudyCard>
                  )}
                  {studyData.funFacts?.length>0 && (
                    <StudyCard icon="⭐" title="Fun Facts" subtitle={`Surprising things about ${studyTopic}`}>
                      {studyData.funFacts.map((fact:string,i:number)=>(
                        <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 18px",marginBottom:8}}>
                          <div style={{fontFamily:"var(--font-serif)",fontSize:24,color:"var(--gold)",lineHeight:1,flexShrink:0,width:30,fontWeight:400}}>{i+1}</div>
                          <div style={{fontSize:13.5,lineHeight:1.8,color:"var(--text)",fontWeight:300}}>{fact}</div>
                        </div>
                      ))}
                    </StudyCard>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ DOCUMENT AI — UNIFIED SCAN + EVALUATE ═══ */}
          {page==="paper" && (
            <>
              <div className="page-header" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                <div>
                  <h1 className="page-title">Document AI</h1>
                  <p className="page-sub">
                    {evalPhase==="scan" && "Upload a handwritten PDF or image — AI reads & evaluates intelligently"}
                    {evalPhase==="action" && "✓ Scan complete — choose what to do next"}
                    {evalPhase==="evaluate" && "Configure grading options and evaluate the paper"}
                    {evalPhase==="progress" && "AI is working…"}
                    {evalPhase==="done" && "Evaluation complete — review results below"}
                  </p>
                </div>
                {evalPhase!=="scan" && (
                  <button className="btn-ghost" style={{flexShrink:0,marginTop:8,fontSize:12}} onClick={()=>{
                    setEvalPhase("scan"); setOcrBenchFile(null); setOcrBenchResults(null);
                    setOcrPageData([]); setOcrEnhanced(""); setOcrProgress(""); setOcrMergedText("");
                    setEvalFromOcr(""); setEvaluation(null); setEvalStep("idle");
                    setAnswerSheetFile(null); setQuestionPaperFile(null); setModelAnswersFile(null); setSyllabusFile(null);
                  }}>↺ New Scan</button>
                )}
              </div>

              {/* ── PHASE 1: SCAN ── */}
              {(evalPhase==="scan" || evalPhase==="action") && (
                <>
                  {/* ── OCR UPLOAD PANEL ── */}
                  <div className="panel">
                    <div className="panel-title"><span>📤</span> Upload Document</div>
                    <div style={{display:"flex",gap:32,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{border:"2px dashed var(--border2)",background:"rgba(255,255,255,0.02)",borderRadius:"var(--radius)",padding:32,textAlign:"center",marginBottom:16,position:"relative",cursor:"pointer",transition:"border-color 0.2s"}}
                          onDragOver={e=>e.preventDefault()}
                          onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f){setOcrBenchFile(f);setOcrBenchResults(null);setOcrPageData([]);setOcrEnhanced("");setOcrProgress("");setEvalPhase("scan");}}}>
                          <div style={{fontSize:36,marginBottom:10}}>📄</div>
                          <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:6}}>
                            {ocrBenchFile ? ocrBenchFile.name : "Drop answer sheet here or click to browse"}
                          </div>
                          <div style={{fontSize:11,color:"var(--muted)"}}>Supports: PDF (multi-page) · JPG · PNG · WEBP</div>
                          {ocrBenchFile && (
                            <div style={{marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
                              {ocrBenchFile.type==="application/pdf"
                                ? <span style={{fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:20,background:"rgba(136,117,255,0.15)",color:"var(--accent)",border:"1px solid rgba(136,117,255,0.3)"}}>📑 PDF · all pages scanned</span>
                                : <span style={{fontSize:11,fontWeight:700,padding:"3px 12px",borderRadius:20,background:"rgba(0,219,160,0.1)",color:"var(--accent3)",border:"1px solid rgba(0,219,160,0.25)"}}>🖼 Image · OCR ready</span>
                              }
                              <button onClick={()=>{setOcrBenchFile(null);setOcrBenchResults(null);setOcrPageData([]);setOcrEnhanced("");setOcrProgress("");setEvalPhase("scan");}} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(255,95,160,0.1)",color:"var(--accent2)",border:"1px solid rgba(255,95,160,0.25)",cursor:"pointer"}}>✕ Clear</button>
                            </div>
                          )}
                          <input type="file" accept="image/*,.pdf" onChange={e=>{const f=e.target.files?.[0]||null;setOcrBenchFile(f);setOcrBenchResults(null);setOcrPageData([]);setOcrEnhanced("");setOcrProgress("");if(f)setEvalPhase("scan");}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
                        </div>
                        {ocrProgress && (
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:ocrProgress.startsWith("✓")?"rgba(0,219,160,0.07)":ocrProgress.startsWith("Error")?"rgba(255,95,160,0.07)":"rgba(136,117,255,0.07)",border:`1px solid ${ocrProgress.startsWith("✓")?"rgba(0,219,160,0.25)":ocrProgress.startsWith("Error")?"rgba(255,95,160,0.25)":"rgba(136,117,255,0.2)"}`,borderRadius:"var(--radius-sm)",marginBottom:12,fontSize:12.5,color:ocrProgress.startsWith("✓")?"var(--accent3)":ocrProgress.startsWith("Error")?"var(--accent2)":"var(--accent)"}}>
                            {!ocrProgress.startsWith("✓")&&!ocrProgress.startsWith("Error")&&<div className="spinner"/>}
                            <span>{ocrProgress}</span>
                          </div>
                        )}
                        {ocrBenchFile && ocrBenchFile.type==="application/pdf" && (
                          <div style={{display:"flex",background:"rgba(255,255,255,0.03)",border:"1px solid var(--border)",borderRadius:12,padding:3,marginBottom:15,gap:3}}>
                            <button onClick={()=>setOcrEngine("groq-vision")} style={{flex:1,padding:"10px",borderRadius:9,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.2s",border:"none",background:ocrEngine==="groq-vision"?"var(--accent)":"transparent",color:ocrEngine==="groq-vision"?"#fff":"var(--muted)"}}>🚀 Turbo (Groq)</button>
                            <button onClick={()=>setOcrEngine("gemini-vision")} style={{flex:1,padding:"10px",borderRadius:9,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.2s",border:"none",background:ocrEngine==="gemini-vision"?"var(--accent3)":"transparent",color:ocrEngine==="gemini-vision"?"#fff":"var(--muted)"}}>✨ High Speed (Gemini)</button>
                            <button onClick={()=>setOcrEngine("trocr")} style={{flex:1,padding:"10px",borderRadius:9,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.2s",border:"none",background:ocrEngine==="trocr"?"rgba(124,111,255,0.15)":"transparent",color:ocrEngine==="trocr"?"var(--accent)":"var(--muted)"}}>🔒 Private (Local)</button>
                          </div>
                        )}
                        <button onClick={runOcrBenchmark} disabled={ocrBenchLoading||!ocrBenchFile} className="btn-primary" style={{width:"100%",padding:"13px 0",fontSize:14,letterSpacing:0.3}}>
                          {ocrBenchLoading ? "⏳ Scanning…" : "▶ Run OCR Scan"}
                        </button>
                      </div>
                      {ocrBenchFile && ocrBenchFile.type!=="application/pdf" && (
                        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <img src={URL.createObjectURL(ocrBenchFile)} alt="Preview" style={{maxHeight:240,maxWidth:"100%",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",boxShadow:"var(--shadow-md)"}}/>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── PDF RESULTS (per-page) ── */}
                  {ocrIsPdf && ocrPageData.length > 0 && (
                    <div className="panel" style={{animationDelay:"0.1s"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
                        <div className="panel-title" style={{marginBottom:0}}><span>📑</span> Scanned Pages ({ocrPageData.length})</div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={enhanceOcrText} disabled={ocrEnhLoading} className="btn-primary btn-sm">{ocrEnhLoading?"Fixing…":"🪄 Fix OCR Errors"}</button>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
                        {ocrPageData.map((p:any)=>(
                          <button key={p.page} onClick={()=>setOcrSelectedPage(p.page)} style={{padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:"1px solid",transition:"all 0.15s",background:ocrSelectedPage===p.page?"rgba(136,117,255,0.18)":"rgba(255,255,255,0.03)",borderColor:ocrSelectedPage===p.page?"rgba(136,117,255,0.45)":"var(--border)",color:ocrSelectedPage===p.page?"var(--accent)":"var(--muted)"}}>Pg {p.page}</button>
                        ))}
                      </div>
                      {ocrPageData.filter((p:any)=>p.page===ocrSelectedPage).map((p:any)=>(
                        <div key={p.page}>
                          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                            <span style={{fontSize:11,fontWeight:700,color:"var(--text2)",letterSpacing:1}}>PAGE {p.page} OF {ocrPageData.length}</span>
                            <span style={{fontSize:11,padding:"2px 9px",borderRadius:10,background:"rgba(0,219,160,0.08)",color:"var(--accent3)",border:"1px solid rgba(0,219,160,0.2)"}}>{p.confidence}% conf.</span>
                            <span style={{fontSize:11,color:"var(--muted)",marginLeft:"auto"}}>{p.lines?.length||0} lines detected</span>
                          </div>
                          <div style={{background:"#07071a",padding:20,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",fontFamily:"var(--font-mono)",fontSize:13,whiteSpace:"pre-wrap",color:"#c4c4e0",minHeight:180,maxHeight:440,overflowY:"auto",lineHeight:1.85}}>
                            {p.text||<span style={{color:"var(--muted)"}}>No text detected on this page.</span>}
                          </div>
                        </div>
                      ))}
                      {ocrEnhanced && (
                        <div style={{marginTop:20,borderTop:"1px solid var(--border)",paddingTop:20}}>
                          <div className="panel-title" style={{marginBottom:12}}><span>✨</span> AI-Enhanced Text</div>
                          <div style={{background:"rgba(136,117,255,0.04)",padding:20,borderRadius:"var(--radius-sm)",border:"1px dashed rgba(136,117,255,0.3)",fontSize:13,lineHeight:1.9,color:"var(--text)",whiteSpace:"pre-wrap",maxHeight:400,overflowY:"auto"}}>{ocrEnhanced}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── SINGLE IMAGE RESULTS ── */}
                  {!ocrIsPdf && ocrBenchResults && (
                    <div className="panel" style={{animationDelay:"0.1s"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                        <div className="panel-title" style={{marginBottom:0}}><span>⚡</span> Engine Results</div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {["groq","tesseract","easyocr"].map(eng=>(
                            <button key={eng} onClick={()=>setOcrBenchSelected(eng)} className={ocrBenchSelected===eng?"btn-success btn-sm":"btn-ghost btn-sm"}>
                              {eng==="groq"?"🤖 Groq":eng==="tesseract"?"🔡 Tesseract":"👁 EasyOCR"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{background:"#07071a",padding:20,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",fontFamily:"var(--font-mono)",fontSize:13,whiteSpace:"pre-wrap",color:"#c4c4e0",minHeight:180,maxHeight:400,overflowY:"auto",lineHeight:1.85}}>
                        {ocrBenchResults[ocrBenchSelected]?.error ? <span style={{color:"#ff5fa0"}}>Error: {ocrBenchResults[ocrBenchSelected].error}</span> : (ocrBenchResults[ocrBenchSelected]?.text||"No text detected.")}
                      </div>
                      <div style={{marginTop:14,display:"flex",gap:10,flexWrap:"wrap"}}>
                        <button onClick={enhanceOcrText} disabled={ocrEnhLoading} className="btn-primary btn-sm">{ocrEnhLoading?"Fixing…":"🪄 Fix OCR Errors"}</button>
                      </div>
                      {ocrEnhanced && (
                        <div style={{marginTop:16,background:"rgba(136,117,255,0.04)",padding:20,borderRadius:"var(--radius-sm)",border:"1px dashed rgba(136,117,255,0.3)",fontSize:13,lineHeight:1.9,color:"var(--text)",whiteSpace:"pre-wrap"}}>
                          <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:"var(--accent)",marginBottom:10}}>AI ENHANCED TEXT</div>
                          {ocrEnhanced}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ACTION BAR (Phase 2) ── */}
                  {evalPhase==="action" && (
                    <div style={{background:"rgba(136,117,255,0.05)",border:"1px solid rgba(136,117,255,0.25)",borderRadius:"var(--radius-lg)",padding:"24px 28px",display:"flex",gap:14,flexWrap:"wrap" as const,alignItems:"center",animation:"fadeUp 0.35s ease both"}}>
                      <div style={{flex:1,minWidth:200}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>✓ Document scanned successfully</div>
                        <div style={{fontSize:11.5,color:"var(--muted)",fontWeight:300}}>What would you like to do with this document?</div>
                      </div>
                      <button onClick={sendOcrToEvaluator} style={{background:"linear-gradient(135deg,rgba(136,117,255,0.22),rgba(74,63,181,0.28))",color:"var(--accent)",border:"1px solid rgba(136,117,255,0.45)",padding:"11px 22px",borderRadius:"var(--radius-sm)",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all 0.2s"}}
                        onMouseEnter={e=>(e.currentTarget.style.transform="translateY(-2px)")} onMouseLeave={e=>(e.currentTarget.style.transform="")}>
                        ⭐ Evaluate Answer Sheet
                      </button>
                      <button onClick={enhanceOcrText} disabled={ocrEnhLoading} className="btn-ghost" style={{fontSize:12.5}}>
                        {ocrEnhLoading?"Fixing…":"🪄 Fix OCR Errors"}
                      </button>
                      <button onClick={()=>{
                        const text = ocrEnhanced||ocrMergedText||ocrBenchResults?.[ocrBenchSelected]?.text||"";
                        if(!text) return alert("No text to copy");
                        navigator.clipboard.writeText(text);
                        alert("Text copied to clipboard!");
                      }} className="btn-ghost" style={{fontSize:12.5}}>📋 Copy Text</button>
                    </div>
                  )}

                </>
              )}

              {/* ── PHASE 2: CONFIGURE & EVALUATE ── */}
              {evalPhase==="evaluate" && (
                <>
                  {evalFromOcr && (
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",background:"rgba(0,219,160,0.07)",border:"1px solid rgba(0,219,160,0.25)",borderRadius:"var(--radius-sm)",marginBottom:16}}>
                      <span style={{fontSize:18}}>✅</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--accent3)"}}>Answer sheet already scanned — text ready</div>
                        <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>The OCR text from your scan will be evaluated directly. Provide grading context below.</div>
                      </div>
                      <button onClick={()=>setEvalFromOcr("")} style={{fontSize:11,padding:"4px 12px",borderRadius:20,background:"rgba(255,95,160,0.1)",color:"var(--accent2)",border:"1px solid rgba(255,95,160,0.25)",cursor:"pointer"}}>✕ Clear</button>
                    </div>
                  )}
                  <div className="panel">
                    <div className="upload-section-header">
                      <div className="upload-section-num">1</div>
                      <div><div className="upload-section-title">Exam Details</div><div className="upload-section-sub">Basic information about this exam</div></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Student (optional)</label>
                        <select className="field-input" style={{cursor:"pointer"}} onChange={e=>setSelectedStudent(e.target.value)}>
                          <option value="">— Select student —</option>
                          {students.map(s=><option key={s.id} value={String(s.id)}>{s.name} ({s.grade})</option>)}
                        </select>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Subject *</label>
                        <input className="field-input" placeholder="e.g. Physics, History, Maths" value={subject} onChange={e=>setSubject(e.target.value)}/>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Paper / Exam Title</label>
                        <input className="field-input" placeholder="e.g. Mid-Term 2025" value={paperTitle} onChange={e=>setPaperTitle(e.target.value)}/>
                      </div>
                      <div className="field-group" style={{marginBottom:0}}>
                        <label className="field-label">Total Marks *</label>
                        <input className="field-input" placeholder="e.g. 100" type="number" value={totalMarksInput} onChange={e=>setTotalMarksInput(e.target.value)}/>
                      </div>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="upload-section-header">
                      <div className="upload-section-num">2</div>
                      <div><div className="upload-section-title">Marks Distribution (Optional)</div><div className="upload-section-sub">How marks are split across questions (AI can also infer this from uploads)</div></div>
                    </div>
                    <div className="marks-example">
                      <strong style={{color:"var(--text2)",fontFamily:"var(--font-sans)",fontSize:11,fontWeight:600}}>Example:</strong><br/>
                      Section A (MCQ): Q1–Q10 → 1 mark each = 10 marks<br/>
                      Section B (Short Answer): Q11, Q12, Q13 → 5 marks each = 15 marks
                    </div>
                    <textarea className="field-input" rows={4} placeholder="Type or paste marks distribution here…"
                      style={{resize:"vertical" as const,lineHeight:1.75,fontWeight:300}}
                      value={marksDistribution} onChange={e=>setMarksDistribution(e.target.value)}/>
                  </div>
                  <div className="panel">
                    <div className="upload-section-header">
                      <div className="upload-section-num">3</div>
                      <div><div className="upload-section-title">Grading Mode — Provide What You Have</div><div className="upload-section-sub">The AI automatically adapts based on what you provide</div></div>
                    </div>
                    {/* Mode badges */}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
                      <span style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontWeight:700,background:modelAnswersFile?"rgba(0,219,160,0.15)":"rgba(255,255,255,0.04)",color:modelAnswersFile?"var(--accent3)":"var(--muted)",border:`1px solid ${modelAnswersFile?"rgba(0,219,160,0.4)":"var(--border)"}`}}>✅ Mode 1 — Strict Rubric {modelAnswersFile?"(Active)":"(provide marking scheme)"}</span>
                      <span style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontWeight:700,background:!modelAnswersFile&&syllabusFile?"rgba(136,117,255,0.15)":"rgba(255,255,255,0.04)",color:!modelAnswersFile&&syllabusFile?"var(--accent)":"var(--muted)",border:`1px solid ${!modelAnswersFile&&syllabusFile?"rgba(136,117,255,0.4)":"var(--border)"}`}}>📚 Mode 2 — Syllabus Guided {!modelAnswersFile&&syllabusFile?"(Active)":"(provide syllabus)"}</span>
                      <span style={{fontSize:11,padding:"4px 12px",borderRadius:20,fontWeight:700,background:!modelAnswersFile&&!syllabusFile?"rgba(255,204,92,0.15)":"rgba(255,255,255,0.04)",color:!modelAnswersFile&&!syllabusFile?"var(--gold)":"var(--muted)",border:`1px solid ${!modelAnswersFile&&!syllabusFile?"rgba(255,204,92,0.4)":"var(--border)"}`}}>🤖 Mode 3 — AI General {!modelAnswersFile&&!syllabusFile?"(Active)":""}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
                      {(!evalFromOcr || proMode) && <UploadZone icon="✍️" label="Handwritten Answer Sheet" desc="Student's handwritten PDF or image — use PDF for multi-page booklets" required={true} setter={setAnswerSheetFile} file={answerSheetFile}/>}
                      <UploadZone icon="📃" label="Question Paper" desc="Upload so AI knows what was asked — greatly improves accuracy" required={false} setter={setQuestionPaperFile} file={questionPaperFile}/>
                      <UploadZone icon="✅" label="Marking Scheme / Model Answers" desc="Mode 1: AI grades strictly against your answer key" required={false} setter={setModelAnswersFile} file={modelAnswersFile}/>
                      <UploadZone icon="📚" label="Syllabus / Topic List" desc="Mode 2: AI stays within syllabus scope" required={false} setter={setSyllabusFile} file={syllabusFile}/>
                    </div>
                  </div>
                  
                  {/* --- PRO MODE TOGGLE --- */}
                  <div className="panel" style={{ background: "rgba(136, 117, 255, 0.05)", borderColor: "rgba(136, 117, 255, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span>🏆</span> Autonomous Evaluator (Pro Mode)
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4, lineHeight: 1.6 }}>
                          Applies strict university grading rules (Best-of-N module selection, max marks capping) and generates a downloadable PDF with <strong>Red Pen annotations</strong> directly on the answer sheet.
                        </div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: proMode ? "var(--accent)" : "var(--muted)" }}>{proMode ? "ENABLED" : "DISABLED"}</span>
                        <div style={{ width: 44, height: 24, borderRadius: 12, background: proMode ? "var(--accent)" : "var(--surface3)", border: `1px solid ${proMode ? "var(--accent)" : "var(--border)"}`, position: "relative", transition: "all 0.3s" }}>
                           <input type="checkbox" checked={proMode} onChange={e => setProMode(e.target.checked)} style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer" }} />
                           <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: proMode ? 22 : 2, transition: "all 0.3s" }} />
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="eval-cta-wrap" style={{marginTop:16}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Ready to evaluate?</div>
                      <div style={{fontSize:12,color:"var(--muted)",fontWeight:300}}>
                        {evalFromOcr ? "✓ Pre-scanned answer text ready · " : answerSheetFile ? "✓ Answer sheet ready · " : "Upload answer sheet to continue · "}
                        {questionPaperFile ? "✓ Question paper uploaded" : "No question paper — AI will infer from marks distribution"}
                      </div>
                    </div>
                    <button className="eval-cta-btn" onClick={evaluatePaper}
                      disabled={(!answerSheetFile && !evalFromOcr) || !totalMarksInput}>
                      Evaluate Paper →
                    </button>
                  </div>
                </>
              )}

              {/* ── PHASE 3: PROGRESS ── */}
              {evalPhase==="progress" && (es==="ocr"||es==="ai") && (
                <div className="progress-screen">
                  <div className="progress-icon">{es==="ocr"?"📄":"🧠"}</div>
                  <div style={{fontFamily:"var(--font-serif)",fontSize:22,color:"#fff",marginBottom:8}}>{es==="ocr"?"Reading Handwriting…":"Evaluating Answers…"}</div>
                  <div style={{fontSize:13,color:"var(--muted)",marginBottom:24,fontWeight:300}}>{evalProgress}</div>
                  <div className="progress-steps">
                    <div className={`progress-step-row ${es==="ocr"?"running":"complete"}`}><div className="progress-step-dot"/>{es==="ocr"?"Reading answer sheet…":"✓ Answer sheet read"}</div>
                    {questionPaperFile&&<div className={`progress-step-row ${es==="ocr"?"waiting":"complete"}`}><div className="progress-step-dot"/>{es==="ocr"?"Waiting to read question paper…":"✓ Question paper understood"}</div>}
                    <div className={`progress-step-row ${es==="ai"?"running":"waiting"}`}><div className="progress-step-dot"/>{es==="ai"?"Reasoning through each answer…":"AI marking & reasoning"}</div>
                    <div className="progress-step-row waiting"><div className="progress-step-dot"/>Results & report ready</div>
                  </div>
                </div>
              )}



              {evalPhase==="done" && evaluation && (
                <>
                  <div className="score-hero">
                    <div className="score-hero-main">
                      <div>
                        <div style={{fontSize:11,fontWeight:700,letterSpacing:2.5,textTransform:"uppercase" as const,color:"var(--muted)",marginBottom:6}}>Total Score</div>
                        <div className="score-big" style={{color:evaluation.percentage>=75?"var(--accent3)":evaluation.percentage>=50?"var(--gold)":"var(--accent2)"}}>
                          {evaluation.totalMarks}<sub>/{evaluation.maxMarks}</sub>
                        </div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,color:"var(--muted)",marginBottom:8}}>Performance</div>
                        <div className="score-bar-track">
                          <div className="score-bar-fill" style={{width:`${evaluation.percentage}%`,background:evaluation.percentage>=75?"linear-gradient(90deg,var(--accent3),#00c87e)":evaluation.percentage>=50?"linear-gradient(90deg,var(--gold),#e5a800)":"linear-gradient(90deg,var(--accent2),#e0005a)"}}/>
                        </div>
                          <div style={{fontSize:13,color:"var(--text2)"}}><strong>{evaluation.percentage}%</strong> · Grade <strong>{evaluation.grade}</strong></div>
                      </div>
                    </div>
                    <div className="score-card-sm">
                      <div className="score-card-val" style={{color:"var(--accent)"}}>{evaluation.percentage}%</div>
                      <div className="score-card-lbl">Percentage</div>
                    </div>
                    <div className="score-card-sm">
                      <div className="score-card-val" style={{color:["A+","A"].includes(evaluation.grade)?"var(--accent3)":["B","C"].includes(evaluation.grade)?"var(--gold)":"var(--accent2)"}}>{evaluation.grade}</div>
                      <div className="score-card-lbl">Grade</div>
                    </div>
                  </div>
                  {evaluation.teacherNote && (
                    <div style={{background:"rgba(124,111,255,0.04)",border:"1px solid rgba(124,111,255,0.15)",borderRadius:"var(--radius)",padding:"14px 22px",marginBottom:14,fontSize:13,color:"var(--text2)",lineHeight:1.8,display:"flex",gap:12,fontWeight:300}}>
                      <span style={{fontSize:17}}>👨‍🏫</span>
                      <div><strong style={{color:"var(--text)",fontWeight:500}}>Teacher's Note: </strong>{evaluation.teacherNote}</div>
                    </div>
                  )}
                  <div className="panel">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
                      <div className="panel-title" style={{marginBottom:0}}>
                        <span>📋</span> Question Breakdown
                        {questionPaperFile?<span className="source-badge source-paper" style={{marginLeft:8}}>📃 From Paper</span>:<span className="source-badge source-dist" style={{marginLeft:8}}>🧠 Inferred</span>}
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={downloadReportCard} className="btn-success" style={{fontSize:11.5}}>⬇ Report Card</button>
                        <button onClick={()=>{setEvalStep("idle");setEvaluation(null);}} className="btn-ghost" style={{fontSize:11.5}}>↺ New</button>
                      </div>
                    </div>
                    <table className="eval-table">
                      <thead>
                        <tr><th>Q No.</th><th>Page</th><th>Question Asked</th><th>Marks</th><th>Red Pen Annotation</th><th>Reasoning & Deductions</th></tr>
                      </thead>
                      <tbody>
                        {evaluation.questions.map((q:any,i:number)=>{
                          const cls=q.awarded===q.max?"marks-full":q.awarded===0?"marks-zero":"marks-partial";
                          return (
                            <tr key={i}>
                               <td><strong style={{color:"var(--text)",fontWeight:500}}>{q.qNo}</strong></td>
                               <td style={{fontSize:11,color:"var(--muted)"}}>{q.pageNo ? `Page ${q.pageNo}` : "—"}</td>
                               <td style={{fontSize:12,color:"var(--text2)",maxWidth:180}}>{q.questionText||"—"}</td>
                               <td className={cls}>{q.awarded}/{q.max}</td>
                               <td style={{fontSize:12,color:"var(--accent2)",fontStyle:"italic",maxWidth:200,fontWeight:500}}>
                                 {q.redPen ? `✍️ ${q.redPen}` : "—"}
                               </td>
                               <td style={{fontSize:12,lineHeight:1.7}}>{q.reasoning||"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="panel">
                    <div className="panel-title"><span>💬</span> Overall Feedback</div>
                    <div className="feedback-hero">{evaluation.overallFeedback}</div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ═══ ANNOUNCEMENTS ═══ */}
          {page==="announcements" && (
            <>
              <div className="page-header">
                <h1 className="page-title">Announcements</h1>
                <p className="page-sub">Post notices, homework, events and urgent messages</p>
              </div>
              <div className="panel">
                <div className="panel-title"><span>✍️</span> New Announcement</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Type</label>
                    <select className="field-input" value={annType} onChange={e=>setAnnType(e.target.value)} style={{cursor:"pointer"}}>
                      <option value="info">📢 General Info</option>
                      <option value="urgent">🚨 Urgent</option>
                      <option value="event">📅 Event</option>
                      <option value="homework">📚 Homework</option>
                    </select>
                  </div>
                  <div className="field-group" style={{marginBottom:0}}>
                    <label className="field-label">Target Audience</label>
                    <select className="field-input" value={annTarget} onChange={e=>setAnnTarget(e.target.value)} style={{cursor:"pointer"}}>
                      <option value="all">All Students</option>
                      {students.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Title *</label>
                  <input className="field-input" value={annTitle} placeholder="e.g. Unit Test on Monday, Holiday Notice…" onChange={e=>setAnnTitle(e.target.value)}/>
                </div>
                <div className="field-group" style={{marginBottom:0}}>
                  <label className="field-label">Message *</label>
                  <textarea className="field-input" rows={4} value={annBody} placeholder="Write your announcement here…" style={{resize:"vertical" as const,lineHeight:1.75,fontWeight:300}} onChange={e=>setAnnBody(e.target.value)}/>
                </div>
                <div className="btn-row">
                  <button onClick={postAnnouncement} className="btn-primary" disabled={loading}>
                    {loading?"Posting…":"📢 Post Announcement"}
                  </button>
                </div>
              </div>
              <div className="panel">
                <div className="panel-title"><span>📋</span> Posted Announcements ({announcements.length})</div>
                {!announcements.length ? (
                  <div className="empty-state"><div className="empty-state-icon">📭</div><p>No announcements yet. Post your first one above.</p></div>
                ) : (
                  announcements.map((ann:any)=>(
                    <div key={ann.id} className="ann-card">
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span className={`ann-badge ${ann.type==="urgent"?"ann-urgent":ann.type==="event"?"ann-event":ann.type==="homework"?"ann-homework":"ann-info"}`}>
                          {ann.type==="urgent"?"🚨 Urgent":ann.type==="event"?"📅 Event":ann.type==="homework"?"📚 Homework":"📢 Info"}
                        </span>
                        <span style={{fontSize:11,color:"var(--muted)",fontWeight:300,marginLeft:"auto"}}>{new Date(ann.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span>
                      </div>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:5}}>{ann.title}</div>
                      <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.7,fontWeight:300}}>{ann.body}</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10}}>
                        <span style={{fontSize:11,color:"var(--muted)"}}>→ {ann.target==="all"?"All Students":students.find(s=>String(s.id)===ann.target)?.name||"Student"}</span>
                        <button onClick={()=>deleteAnnouncement(ann.id)} className="btn-ghost" style={{fontSize:11,padding:"5px 12px"}}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}



        </main>
      </div>

      {/* ── AI CO-TEACHER SIDECAR ── */}
      <div className="co-teacher-fab">
        {coTeacherOpen && (
          <div className="co-teacher-card">
            <div className="co-teacher-header">
              <div className="co-teacher-dot" />
              <div className="co-teacher-label">AI Co-Teacher Live</div>
            </div>
            <div className="co-teacher-text">
              {coTeacherLoading
                ? "Analysing your classroom..."
                : coTeacherInsight || `You are on the ${page} page. ${students.length} students enrolled — checking metrics.`
              }
            </div>
          </div>
        )}
        <button
          className="co-teacher-btn"
          onClick={() => setCoTeacherOpen(o => !o)}
          title="AI Co-Teacher"
        >
          {coTeacherOpen ? "✕" : "🤖"}
        </button>
      </div>
    </>
  );
}