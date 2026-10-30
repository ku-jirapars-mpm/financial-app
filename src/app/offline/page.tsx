export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">You’re offline</h1>
      <p className="text-sm text-muted-foreground">
        MyFinance does not store your financial data on this device. Reconnect to see your accounts.
      </p>
    </main>
  );
}
