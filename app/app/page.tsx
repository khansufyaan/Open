import { Portal } from "@/components/portal";

export default function AppPortalPage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      {/* Soft ambient light from the top — subtle depth, not a loud gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.42_0.05_256/0.20),transparent_72%)]" />
      <div className="relative mx-auto max-w-md px-5 pb-20 pt-2">
        <Portal />
      </div>
    </main>
  );
}
