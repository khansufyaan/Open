import type { Metadata } from "next";

import { AppProviders } from "@/components/app-providers";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Wallet",
  description: "Secure wallet infrastructure for verified identities",
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
            {/* Global background effects */}
            <div className="fixed inset-0 bg-grid dark:bg-grid-dark opacity-30 pointer-events-none" />
            <div className="fixed inset-0 gradient-mesh pointer-events-none" />

            <Navbar />
            <div className="relative flex-1">{children}</div>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
