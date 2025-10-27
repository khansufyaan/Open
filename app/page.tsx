import { Navbar } from "@/components/navbar";
import { SenderExperience } from "@/components/sender-experience";

export default function Home() {
  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-slate-950 flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-start justify-center px-6 py-8 gap-6">
        <main className="w-full max-w-lg flex-shrink-0">
          <SenderExperience />
        </main>
      </div>
    </div>
  );
}
