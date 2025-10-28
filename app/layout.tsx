import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";

import { AppProviders } from "@/components/app-providers";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Wallet",
  description: "Secure wallet infrastructure powered by Turnkey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NextTopLoader color="#0ea5e9" height={3} showSpinner={false} />
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
