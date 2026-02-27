/**
 * Shared API route helpers: body parsing + Zod validation.
 * Use so routes don't repeat the same try/safeParse/400 pattern.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

/**
 * Parse JSON body and validate with Zod. Returns either typed data or a 400 NextResponse.
 * Use in POST/PUT handlers to centralize parse and validation errors.
 *
 * @example
 * const parsed = await parseJsonBody(request, BodySchema);
 * if (parsed instanceof NextResponse) return parsed;
 * const { name } = parsed.data;
 */
export async function parseJsonBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T
): Promise<{ data: z.infer<T> } | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'Validation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return { data: result.data };
}
