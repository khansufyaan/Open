import { AuthFlow } from "@/components/auth-flow";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10 lg:px-12">
        <main className="space-y-16">
          <AuthFlow />
        </main>
      </div>
    </div>
  );
}
