'use client';

import {
    LayoutDashboard,
    CheckCircle,
    BookOpen,
    Library,
    FileText,
    LogOut,
    GraduationCap
} from "lucide-react";

interface SidebarProps {
    page: string;
    setPage: (page: string) => void;
    logout: () => void;
}

export function Sidebar({ page, setPage, logout }: SidebarProps) {
    const navItems = [
        { id: "dashboard", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
        { id: "attendance", icon: <CheckCircle size={20} />, label: "Attendance" },
        { id: "lesson", icon: <BookOpen size={20} />, label: "Lesson Planner" },
        { id: "study", icon: <Library size={20} />, label: "Study Tool" },
        { id: "paper", icon: <FileText size={20} />, label: "Paper Evaluation" },
    ];

    return (
        <aside className="w-[260px] flex-shrink-0 border-r border-white/5 bg-[#0A0A0F] flex flex-col fixed top-0 bottom-0 left-0 z-50">
            <div className="p-8 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
                        <GraduationCap size={22} />
                    </div>
                    <div>
                        <h1 className="font-serif text-xl tracking-tight text-white leading-none">EduSahayak</h1>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1.5 font-semibold">Teacher AI</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = page === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setPage(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative
                ${isActive
                                    ? "bg-indigo-500/10 text-indigo-400"
                                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                                }`}
                        >
                            <span className={`transition-colors duration-200 ${isActive ? "text-indigo-400" : "text-zinc-600 group-hover:text-zinc-400"}`}>
                                {item.icon}
                            </span>
                            {item.label}
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-indigo-500 rounded-r-md shadow-[0_0_12px_rgba(99,102,241,0.5)]" />
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/5">
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-500 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
                >
                    <LogOut size={20} />
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
