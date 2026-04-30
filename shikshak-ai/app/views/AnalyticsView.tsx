
'use client';
import { motion } from "framer-motion";
import React from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { GlassPanel } from "../components/DashboardBase";
import { Sparkline } from "../components/Sparkline";
import { getAvgClass, getLetterGrade } from "@/lib/utils";

interface AnalyticsViewProps {
  chartData: any[];
  gradeDistribution: any[];
  attendanceChartData: any[];
  students: any[];
  attendanceSummary: any;
}

const COLORS = ['#7c6fff', '#00dba0', '#ffcc5c', '#ff5fa0', '#5ab4ff', '#ff8c42'];

export const AnalyticsView = React.memo(({
  chartData,
  gradeDistribution,
  attendanceChartData,
  students,
  attendanceSummary
}: AnalyticsViewProps) => {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-sub">Deep insights into class and student performance</p>
      </div>

      <div className="stat-grid">
        <GlassPanel className="stat-card" style={{padding:24}}>
          <div className="stat-label">Performance Peak</div>
          <div className="stat-value stat-accent">{students.length ? Math.max(...students.map(s=>Number(s.avg))) : 0}%</div>
          <div className="stat-sub">Highest individual average</div>
        </GlassPanel>
        <GlassPanel className="stat-card" style={{padding:24}} delay={0.1}>
          <div className="stat-label">Subject Mastery</div>
          <div className="stat-value stat-accent3">{students.filter(s=>Number(s.avg)>=80).length}</div>
          <div className="stat-sub">Students above 80%</div>
        </GlassPanel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <GlassPanel title={<span>📈</span> + " Performance Trend"}>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: "var(--surface3)", border: "1px solid var(--border)", borderRadius: 12 }}
                  itemStyle={{ color: "var(--accent)" }}
                />
                <Area type="monotone" dataKey="avg" stroke="var(--accent)" fillOpacity={1} fill="url(#colorAvg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel title={<span>📊</span> + " Grade Distribution"}>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={gradeDistribution} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="Students">
                  {gradeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ background: "var(--surface3)", border: "1px solid var(--border)", borderRadius: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel title={<span>📋</span> + " Comprehensive Student Report"}>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Grade</th><th>Avg %</th><th>Trend</th><th>Letter</th><th>Att. Rate</th><th>Status</th></tr>
            </thead>
            <tbody>
              {students.map(s => {
                const rec = attendanceSummary[String(s.id)] || { present: 0, absent: 0 };
                const total = rec.present + rec.absent;
                const rate = total > 0 ? Math.round((rec.present / total) * 100) : 0;
                return (
                  <tr key={s.id}>
                    <td style={{ color: "var(--text)", fontWeight: 500 }}>{s.name}</td>
                    <td>{s.grade}</td>
                    <td><span className={`avg-badge ${getAvgClass(Number(s.avg))}`}>{s.avg}%</span></td>
                    <td>
                      <Sparkline 
                        data={[{ val: 40 }, { val: 60 }, { val: 45 }, { val: 70 }, { val: Number(s.avg) }]} 
                        color={Number(s.avg) >= 75 ? "var(--accent3)" : Number(s.avg) >= 50 ? "var(--gold)" : "var(--accent2)"}
                      />
                    </td>
                    <td style={{ color: "var(--accent)", fontWeight: 600 }}>{getLetterGrade(Number(s.avg))}</td>
                    <td>
                       <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:1,height:4,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden",maxWidth:60}}>
                            <div style={{width:`${rate}%`,height:"100%",background:rate>=75?"var(--accent3)":rate>=50?"var(--gold)":"var(--accent2)",borderRadius:4}}/>
                          </div>
                          <span style={{fontSize:11,fontWeight:500}}>{rate}%</span>
                        </div>
                    </td>
                    <td>
                       <span style={{fontSize:11,color:Number(s.avg)>=75&&rate>=75?"var(--accent3)":Number(s.avg)<50||rate<50?"var(--accent2)":"var(--gold)"}}>
                        {Number(s.avg)>=75&&rate>=75?"✓ On track":Number(s.avg)<50||rate<50?"⚠ At risk":"△ Monitor"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </>
  );
});
