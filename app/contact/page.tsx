export default function ContactPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="mx-auto max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Contact Us</h1>
          <p className="text-muted-foreground">
            Have questions or need help? Get in touch with our team.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-8 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Email</h3>
            <a
              href="mailto:team@bluewallets.io"
              className="text-xl font-medium text-sky-500 hover:underline"
            >
              team@bluewallets.io
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            We typically respond within 24-48 hours
          </p>
        </div>
      </div>
    </main>
  );
}
