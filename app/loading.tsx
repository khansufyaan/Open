import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center bg-slate-950/70 text-slate-100">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/90 px-6 py-5 shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm font-medium tracking-wide">Loading…</p>
        </div>
      </div>
    </div>
  );
}
