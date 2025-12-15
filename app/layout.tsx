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
            <Navbar />
            <div className="relative flex-1">{children}</div>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
