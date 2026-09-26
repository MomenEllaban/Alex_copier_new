"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import RolesPermissionsPage from "@/components/roles/RolesPermissionsPage";
import PrinterLoader from "@/components/PrinterLoader";

/**
 * The roles screen is about the system itself rather than a business page, so
 * it is gated on the role key instead of a page permission.
 *
 * The API routes under /api/roles repeat this check on every request — this is
 * only so a non-admin does not see an empty screen before the first fetch 403s.
 */
export default function RolesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const isAdmin = role === "GENERAL_MANAGER";

  useEffect(() => {
    if (status === "authenticated" && !isAdmin) router.replace("/unauthorized");
  }, [status, isAdmin, router]);

  if (status === "loading") return <PrinterLoader fullScreen label="" />;
  if (!isAdmin) return null;

  return <RolesPermissionsPage />;
}
