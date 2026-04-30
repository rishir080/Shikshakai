'use client';

import { Card } from "@/components/ui-card";

interface DashboardStatsProps {
    totalStudents: number;
    classAvg: number;
    date: string;
}

export function DashboardStats({ totalStudents, classAvg, date }: DashboardStatsProps) {
    return (
        <div className="grid grid-cols-3 gap-4 mb-6">
            <Card gradient className="p-6">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">
                    Class Average
                </div>
                <div className="font-serif text-5xl text-white leading-none">
                    {classAvg}<span className="text-2xl text-zinc-600">%</span>
                </div>
            </Card>

            <Card className="p-6">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">
                    Total Students
                </div>
                <div className="font-serif text-5xl text-white leading-none">
                    {totalStudents}
                </div>
            </Card>

            <Card className="p-6 flex flex-col justify-center">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-1">
                    Session Date
                </div>
                <div className="text-xl text-zinc-300 font-medium">
                    {date}
                </div>
            </Card>
        </div>
    );
}
