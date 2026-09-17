"use client";

import { ReactNode } from "react";

type Tone =
  | "amber"
  | "red"
  | "green"
  | "emerald"
  | "blue"
  | "sky"
  | "purple"
  | "violet"
  | "orange"
  | "rose"
  | "slate";

const TONES: Record<Tone, { card: string; icon: string; text: string }> = {
  amber: { card: "border-amber-200 bg-amber-50", icon: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  red: { card: "border-red-200 bg-red-50", icon: "bg-red-100 text-red-700", text: "text-red-600" },
  green: { card: "border-green-200 bg-green-50", icon: "bg-green-100 text-green-700", text: "text-green-700" },
  emerald: { card: "border-emerald-200 bg-emerald-50", icon: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
  blue: { card: "border-blue-200 bg-blue-50", icon: "bg-blue-100 text-blue-700", text: "text-blue-700" },
  sky: { card: "border-sky-200 bg-sky-50", icon: "bg-sky-100 text-sky-700", text: "text-sky-700" },
  purple: { card: "border-purple-200 bg-purple-50", icon: "bg-purple-100 text-purple-700", text: "text-purple-700" },
  violet: { card: "border-violet-200 bg-violet-50", icon: "bg-violet-100 text-violet-700", text: "text-violet-700" },
  orange: { card: "border-orange-200 bg-orange-50", icon: "bg-orange-100 text-orange-700", text: "text-orange-700" },
  rose: { card: "border-rose-200 bg-rose-50", icon: "bg-rose-100 text-rose-700", text: "text-rose-600" },
  slate: { card: "border-slate-200 bg-slate-50", icon: "bg-slate-100 text-slate-600", text: "text-slate-700" },
};

export interface StatItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
}

const GRID: Record<string, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

export default function StatsCards({ stats, columns = 4 }: { stats: StatItem[]; columns?: 2 | 3 | 4 }) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${GRID[columns]}`}>
      {stats.map((stat, index) => {
        const tone = TONES[stat.tone || "slate"];
        return (
          <div key={index} className={`flex items-center gap-3 rounded-xl border p-3 ${tone.card}`}>
            {stat.icon && (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
                {stat.icon}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-500">{stat.label}</p>
              <p className={`mt-0.5 truncate text-lg font-bold ${tone.text}`}>{stat.value}</p>
              {stat.sub && <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{stat.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}