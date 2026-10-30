import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

export function generateStaticParams() {
  return [...SIZES].map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return appIcon(size);
}
