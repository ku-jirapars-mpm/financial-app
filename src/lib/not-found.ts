import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "./server/errors";
import { uuid } from "./validation";

export function uuidOr404(value: string): string {
  const r = uuid.safeParse(value);
  if (!r.success) notFound();
  return r.data;
}

/** Maps NotFoundError (including rows hidden by RLS) to a 404 page. */
export async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
