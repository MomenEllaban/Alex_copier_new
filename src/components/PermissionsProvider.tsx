"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ActionKey } from "@/lib/rbac-catalog";
import type { Page } from "@/lib/permissions";

interface PermissionState {
  roleKey: string;
  isSystem: boolean;
  pages: Set<string>;
  actions: Set<string>;
}

interface PermissionsContextValue extends PermissionState {
  ready: boolean;
  can: (page: Page) => boolean;
  canAct: (page: Page, action: ActionKey) => boolean;
  refresh: () => Promise<void>;
}

const EMPTY: PermissionState = { roleKey: "", isSystem: false, pages: new Set(), actions: new Set() };

const PermissionsContext = createContext<PermissionsContextValue>({
  ...EMPTY,
  ready: false,
  can: () => false,
  canAct: () => false,
  refresh: async () => {},
});

/** How often to ask whether the matrix moved. Cheap: one small JSON response. */
const POLL_MS = 20_000;

interface FetchResult {
  state: PermissionState;
  stamp: string | null;
}

/**
 * Reads the caller's permissions. Returns the data rather than setting state,
 * so the callers decide when to apply it.
 */
async function fetchPermissions(): Promise<FetchResult | null> {
  const res = await fetch("/api/permissions/me", { cache: "no-store" });
  // A 403 here means the session is valid but the account has lost its access.
  if (res.status === 401 || res.status === 403) return { state: EMPTY, stamp: null };
  if (!res.ok) return null;

  const data = (await res.json()) as {
    role: { key: string; isSystem: boolean };
    pages: string[];
    actions: string[];
  };

  return {
    stamp: res.headers.get("X-Permissions-Stamp"),
    state: {
      roleKey: data.role.key,
      isSystem: data.role.isSystem,
      pages: new Set(data.pages),
      actions: new Set(data.actions),
    },
  };
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [fetched, setFetched] = useState<PermissionState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const stampRef = useRef<string | null>(null);

  const apply = useCallback((result: FetchResult | null) => {
    if (result === null) {
      setLoaded(true);
      return;
    }
    stampRef.current = result.stamp;
    setFetched(result.state);
    setLoaded(true);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchPermissions());
    } catch {
      // Network blip: keep whatever we already had rather than blanking the UI.
      apply(null);
    }
  }, [apply]);

  // Signing out is derived from the session rather than stored, so no effect
  // has to reset state when it happens.
  const signedOut = status === "unauthenticated";
  const state = signedOut ? EMPTY : fetched;
  const ready = status !== "loading" && (signedOut || loaded);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    // The setState calls live in the continuation, not the effect body.
    fetchPermissions()
      .then((result) => {
        if (!cancelled) apply(result);
      })
      .catch(() => {
        if (!cancelled) apply(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, apply]);

  // Live updates: when the stamp moves, refetch. This is what makes a
  // permission change apply to a user who is already signed in.
  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = setInterval(() => {
      fetch("/api/permissions/stamp", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then(async (body: { stamp: string } | null) => {
          if (!body?.stamp || body.stamp === stampRef.current) return;
          await load();
          // A page the user can no longer open must not stay on screen.
          router.refresh();
        })
        .catch(() => {
          /* offline or server restarting — try again next tick */
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, load, router]);

  const value = useMemo<PermissionsContextValue>(() => {
    const isGeneralManager = state.roleKey === "GENERAL_MANAGER";
    return {
      ...state,
      ready,
      can: (page) => isGeneralManager || state.pages.has(page),
      canAct: (page, action) => {
        if (isGeneralManager) return true;
        // A control inside a hidden page is unreachable anyway.
        if (!state.pages.has(page)) return false;
        return state.actions.has(`${page}:${action}`);
      },
      refresh: load,
    };
  }, [state, ready, load]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
