/**
 * Query-string and body values arrive as plain `string`, but Prisma's generated
 * filters want the specific generated enum. Casting with `as` would let a typo
 * (`?status=PAIDY`) reach the database and silently match nothing, so the value
 * is checked against the real member list instead.
 *
 * Returns `undefined` for anything unrecognised, which is what the optional
 * Prisma filter fields expect for "no filter given".
 */
export function enumFilter<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[]
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
