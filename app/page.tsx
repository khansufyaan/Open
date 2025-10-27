import { Navbar } from "@/components/navbar";
import { SenderExperience } from "@/components/sender-experience";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <Navbar />
      <main className="flex-1 px-6 pb-12">
        <SenderExperience />
      </main>
    </div>
  );
}
