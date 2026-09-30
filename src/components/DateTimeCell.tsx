import React from "react";
import { formatEgyptDateTime } from "@/lib/datetime";

interface DateTimeCellProps {
  value: string | Date | null | undefined;
  className?: string;
  timeClassName?: string;
  withSeconds?: boolean;
}

export function DateTimeCell({ value, className = "", timeClassName = "text-xs text-gray-400", withSeconds = false }: DateTimeCellProps) {
  const { dateStr, timeStr } = formatEgyptDateTime(value);
  if (dateStr === "—") {
    return <span className={`whitespace-nowrap ${className}`}>—</span>;
  }
  return (
    <span className={`inline-flex flex-col gap-0.5 whitespace-nowrap leading-tight ${className}`}>
      <span className="font-medium" dir="ltr" suppressHydrationWarning>{dateStr}</span>
      <span className={timeClassName} dir="ltr" suppressHydrationWarning>{withSeconds ? `${timeStr}:${new Date(value!).getSeconds().toString().padStart(2, "0")}` : timeStr}</span>
    </span>
  );
}
