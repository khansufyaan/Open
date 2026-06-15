import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/app-providers";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Wallet",
  description: "Secure wallet infrastructure for verified identities",
  manifest: "/manifest.webmanifest",
  applicationName: "Blue Wallet",
  appleWebApp: {
    capable: true,
    title: "Blue Wallet",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Allow the app to extend under the iPhone notch / home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background">
        <AppProviders>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <div className="relative flex-1">{children}</div>
            <Footer />
          </div>
        </AppProviders>
        <PwaRegister />
      </body>
    </html>
  );
}
