import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Zap, Layers, Sparkles, Mic, Bot } from 'lucide-react'
import { Link } from 'react-router'

import type { Route } from './+types/home'

import { baseOptions } from '@/lib/layout.shared'

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'cuttledoc - Fast Offline Speech-to-Text for Node.js' },
    {
      name: 'description',
      content:
        'Fast, offline speech-to-text transcription library for Node.js with multiple backends and LLM enhancement.'
    }
  ]
}

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      {/* Animated background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-orange-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-amber-500/15 via-transparent to-transparent rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-orange-400/10 to-red-500/10 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
      </div>

      <div className="relative flex flex-col items-center justify-center text-center flex-1 px-4 py-20">
        {/* Hero Section */}
        <div className="relative">
          {/* Glow effect behind logo */}
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-amber-500/30 blur-3xl scale-150 animate-pulse" />
          <img
            src="/logo.svg"
            alt="cuttledoc"
            className="relative w-[180px] h-[180px] mb-8 drop-shadow-2xl hover:scale-105 transition-transform duration-300"
          />
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent drop-shadow-sm">
          cuttledoc
        </h1>

        <p className="text-fd-muted-foreground text-xl mb-10 max-w-2xl leading-relaxed">
          Fast, offline speech-to-text transcription for{' '}
          <span className="text-fd-foreground font-semibold">Node.js</span>.
          <br />
          <span className="text-orange-500 dark:text-orange-400">Multiple backends</span>. Optional{' '}
          <span className="text-amber-500 dark:text-amber-400">LLM enhancement</span>.
        </p>

        {/* CTA Buttons */}
        <div className="flex gap-4 flex-wrap justify-center mb-20">
          <Link
            className="group relative bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full font-semibold px-8 py-4 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 transition-all duration-300"
            to="/docs"
          >
            <span className="relative z-10">Get Started</span>
            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-amber-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <a
            href="https://github.com/sebastian-software/cuttledoc"
            className="group border-2 border-fd-border text-fd-foreground rounded-full font-semibold px-8 py-4 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all duration-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </a>
        </div>

        {/* Feature Cards */}
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl w-full mb-20">
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-fd-card to-fd-card/50 border border-fd-border hover:border-orange-500/30 shadow-lg hover:shadow-orange-500/10 transition-all duration-300 hover:-translate-y-1">
            <div className="mb-4 p-3 w-fit rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 group-hover:scale-110 transition-transform">
              <Zap className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="font-bold text-lg mb-3 text-fd-foreground">Fast & Offline</h3>
            <p className="text-fd-muted-foreground">
              Runs entirely locally. No internet required. Native performance with GPU acceleration.
            </p>
          </div>
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-fd-card to-fd-card/50 border border-fd-border hover:border-amber-500/30 shadow-lg hover:shadow-amber-500/10 transition-all duration-300 hover:-translate-y-1">
            <div className="mb-4 p-3 w-fit rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 group-hover:scale-110 transition-transform">
              <Layers className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-bold text-lg mb-3 text-fd-foreground">Multiple Backends</h3>
            <p className="text-fd-muted-foreground">
              Apple Speech, Parakeet, Whisper. Choose the best backend for your language and quality needs.
            </p>
          </div>
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-fd-card to-fd-card/50 border border-fd-border hover:border-orange-500/30 shadow-lg hover:shadow-orange-500/10 transition-all duration-300 hover:-translate-y-1">
            <div className="mb-4 p-3 w-fit rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 group-hover:scale-110 transition-transform">
              <Sparkles className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="font-bold text-lg mb-3 text-fd-foreground">LLM Enhancement</h3>
            <p className="text-fd-muted-foreground">
              Optional AI enhancement for punctuation, formatting, and intelligent corrections.
            </p>
          </div>
        </div>

        {/* Code Examples */}
        <div className="grid gap-8 md:grid-cols-2 max-w-5xl w-full mb-20">
          {/* Transcribe Example */}
          <div className="group">
            <div className="rounded-2xl border border-fd-border overflow-hidden shadow-2xl shadow-black/20 group-hover:shadow-orange-500/10 transition-shadow duration-300">
              <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-zinc-800 to-zinc-900 border-b border-zinc-700">
                <span className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                <span className="w-3 h-3 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50" />
                <span className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                <span className="ml-3 text-xs text-zinc-400 font-mono">transcribe.ts</span>
              </div>
              <pre className="p-6 text-left text-sm overflow-x-auto bg-gradient-to-br from-zinc-900 to-zinc-950">
                <code className="text-zinc-100 font-mono leading-relaxed">
                  <span className="text-pink-400">import</span>
                  {' { transcribe } '}
                  <span className="text-pink-400">from</span> <span className="text-emerald-400">"cuttledoc"</span>
                  {`;\n\n`}
                  <span className="text-pink-400">const</span>
                  {' result = '}
                  <span className="text-pink-400">await</span> <span className="text-sky-400">transcribe</span>
                  {'('}
                  <span className="text-emerald-400">"audio.mp3"</span>
                  {`);\n`}
                  <span className="text-zinc-500">console</span>
                  {'.'}
                  <span className="text-sky-400">log</span>
                  {'(result.text);'}
                </code>
              </pre>
            </div>
            <p className="mt-4 text-sm text-fd-muted-foreground text-center font-medium flex items-center justify-center gap-2">
              <Mic className="w-4 h-4 text-orange-500" />
              Speech-to-text in 3 lines
            </p>
          </div>

          {/* Enhance Example */}
          <div className="group">
            <div className="rounded-2xl border border-fd-border overflow-hidden shadow-2xl shadow-black/20 group-hover:shadow-amber-500/10 transition-shadow duration-300">
              <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-zinc-800 to-zinc-900 border-b border-zinc-700">
                <span className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                <span className="w-3 h-3 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50" />
                <span className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                <span className="ml-3 text-xs text-zinc-400 font-mono">enhance.ts</span>
              </div>
              <pre className="p-6 text-left text-sm overflow-x-auto bg-gradient-to-br from-zinc-900 to-zinc-950">
                <code className="text-zinc-100 font-mono leading-relaxed">
                  <span className="text-pink-400">import</span>
                  {' { enhanceTranscript } '}
                  <span className="text-pink-400">from</span> <span className="text-emerald-400">"cuttledoc/llm"</span>
                  {`;\n\n`}
                  <span className="text-pink-400">const</span>
                  {' enhanced = '}
                  <span className="text-pink-400">await</span> <span className="text-sky-400">enhanceTranscript</span>
                  {'(text);'}
                  {`\n`}
                  <span className="text-zinc-500">console</span>
                  {'.'}
                  <span className="text-sky-400">log</span>
                  {'(enhanced.markdown);'}
                </code>
              </pre>
            </div>
            <p className="mt-4 text-sm text-fd-muted-foreground text-center font-medium flex items-center justify-center gap-2">
              <Bot className="w-4 h-4 text-amber-500" />
              AI-powered formatting & corrections
            </p>
          </div>
        </div>

        {/* Powered By Section */}
        <div className="w-full max-w-4xl">
          <div className="relative p-8 rounded-3xl bg-gradient-to-br from-fd-card/80 via-fd-card/50 to-fd-card/80 border border-fd-border backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-transparent to-amber-500/5 rounded-3xl" />
            <p className="relative text-xs text-fd-muted-foreground uppercase tracking-widest mb-8 font-semibold">
              Powered by industry leaders
            </p>
            <div className="relative flex flex-wrap justify-center items-center gap-12">
              {/* NVIDIA Parakeet */}
              <div
                className="flex items-center gap-3 hover:scale-110 transition-transform cursor-default"
                title="NVIDIA Parakeet"
              >
                <img
                  src="/logos/nvidia.svg"
                  alt="NVIDIA"
                  className="h-7 w-7 dark:invert opacity-80 hover:opacity-100 transition-opacity"
                />
                <span className="text-sm font-semibold text-fd-muted-foreground hover:text-fd-foreground transition-colors">
                  Parakeet
                </span>
              </div>

              {/* OpenAI Whisper */}
              <div
                className="flex items-center gap-3 hover:scale-110 transition-transform cursor-default"
                title="OpenAI Whisper"
              >
                <img
                  src="/logos/openai.svg"
                  alt="OpenAI"
                  className="h-6 w-6 dark:invert opacity-80 hover:opacity-100 transition-opacity"
                />
                <span className="text-sm font-semibold text-fd-muted-foreground hover:text-fd-foreground transition-colors">
                  Whisper
                </span>
              </div>

              {/* Google Gemini/Gemma */}
              <div
                className="flex items-center gap-3 hover:scale-110 transition-transform cursor-default"
                title="Google Gemma"
              >
                <img
                  src="/logos/gemini.svg"
                  alt="Gemini"
                  className="h-6 w-6 opacity-80 hover:opacity-100 transition-opacity"
                />
                <span className="text-sm font-semibold text-fd-muted-foreground hover:text-fd-foreground transition-colors">
                  Gemma
                </span>
              </div>

              {/* Apple Speech */}
              <div
                className="flex items-center gap-3 hover:scale-110 transition-transform cursor-default"
                title="Apple Speech"
              >
                <img
                  src="/logos/apple.svg"
                  alt="Apple"
                  className="h-6 w-6 dark:invert opacity-80 hover:opacity-100 transition-opacity"
                />
                <span className="text-sm font-semibold text-fd-muted-foreground hover:text-fd-foreground transition-colors">
                  Speech
                </span>
              </div>

              {/* ONNX Runtime */}
              <div
                className="flex items-center gap-3 hover:scale-110 transition-transform cursor-default"
                title="ONNX Runtime"
              >
                <img
                  src="/logos/onnx.svg"
                  alt="ONNX"
                  className="h-6 w-6 opacity-80 hover:opacity-100 transition-opacity"
                />
                <span className="text-sm font-semibold text-fd-muted-foreground hover:text-fd-foreground transition-colors">
                  Runtime
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 text-center">
          <p className="text-fd-muted-foreground mb-6">Ready to transcribe? Get started in under a minute.</p>
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fd-muted font-mono text-sm">
            <span className="text-orange-500">$</span>
            <span>pnpm add cuttledoc</span>
          </div>
        </div>
      </div>
    </HomeLayout>
  )
}
