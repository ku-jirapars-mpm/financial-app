import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "MyFinance", template: "%s · MyFinance" },
  description: "Private personal finance tracker",
  applicationName: "MyFinance",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "MyFinance", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Next.js only emits the generic tag; older iOS needs Apple's own to open full-screen from the home screen.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#171a21" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
