import { AuthFlow } from "@/components/auth-flow";

export default function RecipientPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10 lg:px-12">
      <main className="space-y-16">
        <AuthFlow />
      </main>
    </div>
  );
}
