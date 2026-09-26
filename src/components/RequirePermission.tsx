"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/components/PermissionsProvider";
import PrinterLoader from "@/components/PrinterLoader";
import type { Page } from "@/lib/permissions";

/**
 * Client-side page gate.
 *
 * This is a usability measure, not the security boundary: it stops a user who
 * lost access from staring at a broken page or a dead sidebar. The real control
 * is the server guard on the matching API route, which refuses the data with a
 * 403 even if this component is bypassed.
 *
 * Holding any one of `pages` is enough, mirroring requireAnyPage.
 */
export default function RequirePermission({
  pages,
  children,
  redirect = true,
}: {
  pages: Page | Page[];
  children: ReactNode;
  redirect?: boolean;
}) {
  const { can, ready } = usePermissions();
  const { status } = useSession();
  const router = useRouter();
  const list = Array.isArray(pages) ? pages : [pages];
  const allowed = list.some((page) => can(page));

  useEffect(() => {
    if (ready && status === "authenticated" && !allowed && redirect) {
      router.replace("/unauthorized");
    }
  }, [ready, status, allowed, redirect, router]);

  // Hold the page back until the answer is known, otherwise a forbidden page
  // flashes its contents for a frame before the redirect.
  if (!ready || status === "loading") {
    return <PrinterLoader fullScreen label="" />;
  }

  if (!allowed) {
    return redirect ? null : <>{children}</>;
  }

  return <>{children}</>;
}
