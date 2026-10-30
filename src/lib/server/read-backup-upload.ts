import "server-only";

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads an uploaded backup file from a multipart form. Returns parsed JSON or an error message. */
export async function readBackupUpload(req: Request): Promise<{ data?: unknown; error?: string }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return { error: "File is too large." };
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return { error: "Choose a backup file." };
  if (file.size > MAX_BYTES) return { error: "File is too large." };
  try {
    return { data: JSON.parse(await file.text()) };
  } catch {
    return { error: "The file is not valid JSON." };
  }
}
