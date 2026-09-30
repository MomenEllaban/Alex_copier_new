import React from "react";

interface DateTimeCellProps {
  value: string | Date | null | undefined;
  className?: string;
  timeClassName?: string;
  withSeconds?: boolean;
}

const dateFmt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Cairo" };
const timeFmt = (withSeconds: boolean): Intl.DateTimeFormatOptions =>
  withSeconds ? { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Cairo" } : { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" };

export function DateTimeCell({ value, className = "", timeClassName = "text-xs text-gray-400", withSeconds = false }: DateTimeCellProps) {
  if (!value) {
    return <span className={`whitespace-nowrap ${className}`}>—</span>;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className={`whitespace-nowrap ${className}`}>—</span>;
  }
  // The formatted date/time depends on the local timezone, which differs between
  // the server (UTC on Vercel) and the user's browser. suppressHydrationWarning
  // tells React this text may legitimately differ during hydration, avoiding a
  // hydration mismatch (React error #418).
  const dateStr = date.toLocaleDateString("en-GB", dateFmt);
  const timeStr = date.toLocaleTimeString("en-GB", timeFmt(withSeconds));
  return (
    <span className={`inline-flex flex-col gap-0.5 whitespace-nowrap leading-tight ${className}`}>
      <span className="font-medium" dir="ltr" suppressHydrationWarning>{dateStr}</span>
      <span className={timeClassName} dir="ltr" suppressHydrationWarning>{timeStr}</span>
    </span>
  );
}
