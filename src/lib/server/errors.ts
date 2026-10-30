/** Errors whose messages are safe to show the user (no financial data, no internals). */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class ConcurrencyError extends UserFacingError {
  constructor(what = "record") {
    super(`This ${what} was changed elsewhere. Reload and try again.`);
    this.name = "ConcurrencyError";
  }
}

export class NotFoundError extends UserFacingError {
  constructor(what = "record") {
    super(`${what[0]!.toUpperCase()}${what.slice(1)} not found.`);
    this.name = "NotFoundError";
  }
}

/** Translate database constraint errors raised by our triggers/checks into a user-facing message. */
export function toUserMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  const pg = err as { code?: string; message?: string };
  if (pg?.code === "23514" && pg.message) {
    // Messages from our own triggers are written for users; generic check names are not.
    return /violates check constraint/.test(pg.message) ? "The values entered are not valid." : pg.message;
  }
  if (pg?.code === "23505") return "That already exists.";
  if (pg?.code === "23503") return "A referenced record does not exist or is not yours.";
  if (pg?.code === "42501") return "Not allowed.";
  return "Something went wrong. Nothing was saved.";
}
