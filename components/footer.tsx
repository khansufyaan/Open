import { cn } from "@/lib/utils";

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t px-6 py-8", className)}>
      <div className="container mx-auto">
        <p className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Blue Wallet. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
