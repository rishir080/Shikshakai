
'use client';
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import React from "react";

interface SparklineProps {
  data: { val: number }[];
  color: string;
}

export const Sparkline = React.memo(({ data, color }: SparklineProps) => {
  return (
    <div style={{ width: 80, height: 26 }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <Area 
            type="monotone" 
            dataKey="val" 
            stroke={color} 
            fill={color} 
            fillOpacity={0.15} 
            strokeWidth={1.5} 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
