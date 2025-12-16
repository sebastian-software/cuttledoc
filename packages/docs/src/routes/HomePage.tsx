import { ArrowRight, Cpu, FileText, Mic, Zap } from "lucide-react";
import { Link } from "react-router";

const features = [
  {
    icon: Mic,
    title: "Multiple Backends",
    description: "Apple Speech (macOS), Whisper, Parakeet - choose what works best for you.",
  },
  {
    icon: Zap,
    title: "Native Performance",
    description: "No Python, no subprocess overhead. Pure Node.js with native bindings.",
  },
  {
    icon: Cpu,
    title: "100% Offline",
    description: "All processing happens locally. Your data never leaves your machine.",
  },
  {
    icon: FileText,
    title: "LLM Enhancement",
    description: "Auto-format transcripts with summaries and corrections using Gemma 3n.",
  },
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container max-w-screen-xl mx-auto flex h-14 items-center px-4">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl">🦑</span>
            <span className="font-bold text-lg">cuttledoc</span>
          </Link>
          <div className="flex-1" />
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link to="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
            <a
              href="https://github.com/yourusername/cuttledoc"
              className="text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="container max-w-screen-xl mx-auto px-4 py-24 md:py-32">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Fast, offline speech-to-text for Node.js
            </h1>
            <p className="mt-6 text-xl text-muted-foreground leading-8">
              Transcribe audio and video files locally with multiple backend support.
              Enhance transcripts with LLM-powered formatting and corrections.
            </p>
            <div className="mt-10 flex items-center gap-4">
              <Link
                to="/docs/getting-started"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/yourusername/cuttledoc"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Code example */}
      <section className="border-y border-border bg-muted/30">
        <div className="container max-w-screen-xl mx-auto px-4 py-16">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-bold">Quick Start</h2>
              <p className="mt-2 text-muted-foreground">
                Install and start transcribing in seconds.
              </p>
            </div>
            <div className="rounded-lg bg-card border border-border overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/50 text-xs text-muted-foreground">
                Terminal
              </div>
              <pre className="p-4 text-sm font-mono overflow-x-auto">
                <code>
                  <span className="text-muted-foreground"># Install</span>
                  {"\n"}
                  <span className="text-primary">pnpm</span> add cuttledoc
                  {"\n\n"}
                  <span className="text-muted-foreground"># Transcribe</span>
                  {"\n"}
                  <span className="text-primary">npx</span> cuttledoc video.mp4
                  {"\n\n"}
                  <span className="text-muted-foreground"># With LLM enhancement</span>
                  {"\n"}
                  <span className="text-primary">npx</span> cuttledoc audio.mp3 --enhance -o transcript.md
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="container max-w-screen-xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center">Why cuttledoc?</h2>
          <p className="mt-4 text-center text-muted-foreground max-w-2xl mx-auto">
            Built for developers who need reliable, private, and fast transcription.
          </p>
          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border p-6 hover:border-primary/50 transition-colors"
              >
                <feature.icon className="h-10 w-10 text-primary" />
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container max-w-screen-xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>MIT License © Sebastian Werner, Sebastian Software GmbH</p>
        </div>
      </footer>
    </div>
  );
}

