import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That record doesn’t exist or isn’t yours.</p>
      <Link href="/" className="text-primary underline">Back to overview</Link>
    </main>
  );
}
