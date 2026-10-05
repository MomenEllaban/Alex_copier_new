"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function AddParamHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      const event = new CustomEvent("erp-open-add");
      window.dispatchEvent(event);
      const path = window.location.pathname;
      router.replace(path, { scroll: false });
    }
  }, [searchParams, router]);

  return null;
}

/**
 * Runs `onOpen` when the page is opened with `?add=1`.
 *
 * This takes the action as a callback rather than returning a boolean. Returning
 * a flag forced every screen into a second effect that copied it into the
 * modal's own state, which is an extra render pass on every page load. Calling
 * back from the event listener lets the screen open its form directly.
 *
 * The callback is held in a ref so that passing an inline arrow function does
 * not tear down and re-add the listener on every render.
 */
export function useAutoAddForm(onOpen: () => void) {
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    const handler = () => onOpenRef.current();
    window.addEventListener("erp-open-add", handler);
    return () => window.removeEventListener("erp-open-add", handler);
  }, []);
}

export function AddFormBoundary() {
  return (
    <Suspense fallback={null}>
      <AddParamHandler />
    </Suspense>
  );
}
