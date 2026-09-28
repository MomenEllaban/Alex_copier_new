import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Row-level scoping for engineers.
 *
 * `requirePageAccess` / `requireAction` answer "may this person see the
 * engineers page" — they say nothing about *which* engineer. An ENGINEER holds
 * the `engineers` page, so without a row check they could read every other
 * engineer's customers, visits and settlement amounts.
 *
 * The link is `Engineer.userId`, so resolving the caller's own engineer once and
 * comparing it is the whole rule. This lives here because the lookup was open
 * coded in a dozen route handlers and each copy was a chance to forget the check.
 */

type Actor = { id?: string; role?: string } | null | undefined;

/** The `Engineer` row linked to this login, or null when there is none. */
export async function ownEngineerId(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const mine = await prisma.engineer.findUnique({ where: { userId }, select: { id: true } });
  return mine?.id ?? null;
}

/**
 * `where` fragment restricting a customer list to the caller, or `undefined`
 * when the caller is not an engineer and should see everything.
 *
 * An engineer with no linked `Engineer` row gets `"__none__"` rather than
 * `undefined`, so a half-created account shows nothing rather than everything.
 */
export async function engineerCustomerScope(
  actor: Actor,
): Promise<{ engineerId: string } | undefined> {
  if ((actor as { role?: string })?.role !== "ENGINEER") return undefined;
  const id = await ownEngineerId((actor as { id?: string })?.id);
  return { engineerId: id ?? "__none__" };
}

/** `where` fragment restricting service requests to the caller. */
export async function engineerRequestScope(
  actor: Actor,
): Promise<{ engineerId: string } | undefined> {
  if ((actor as { role?: string })?.role !== "ENGINEER") return undefined;
  const id = await ownEngineerId((actor as { id?: string })?.id);
  return { engineerId: id ?? "__none__" };
}

const FORBIDDEN = () =>
  NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

/**
 * 403 response when an ENGINEER asks for a row that is not their own. Returns
 * `null` for non-engineers (who are allowed) and for engineers reading
 * themselves. The existence check runs after this, so probing another id gets
 * the same 403 whether or not that engineer exists.
 */
export async function denyUnlessSelfEngineer(
  actor: Actor,
  engineerId: string,
): Promise<NextResponse | null> {
  if ((actor as { role?: string })?.role !== "ENGINEER") return null;
  const id = await ownEngineerId((actor as { id?: string })?.id);
  if (id !== engineerId) return FORBIDDEN();
  return null;
}
