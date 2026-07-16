import { ArdoFeatureCard, ArdoFeatures, ArdoHero } from 'ardo/ui'

import appleLogo from '../assets/logos/apple.svg'
import geminiLogo from '../assets/logos/gemini.svg'
import nvidiaLogo from '../assets/logos/nvidia.svg'
import openaiLogo from '../assets/logos/openai.svg'
import logoSvg from '../assets/logo.svg'

export default function Home() {
  return (
    <div className="cuttledoc-home">
      <ArdoHero
        image={logoSvg}
        name="cuttledoc"
        text="Fast, offline speech-to-text transcription for Node.js."
        tagline="Multiple backends. Optional LLM enhancement."
        actions={[
          { text: 'Get Started', link: '/docs', theme: 'brand' },
          {
            text: 'View on GitHub',
            link: 'https://github.com/sebastian-software/cuttledoc',
            theme: 'alt'
          }
        ]}
      />

      <ArdoFeatures>
        <ArdoFeatureCard title="Fast & Offline" icon="⚡">
          Runs entirely locally. No internet required. Native performance with GPU acceleration.
        </ArdoFeatureCard>
        <ArdoFeatureCard title="Multiple Backends" icon="◫">
          Parakeet, Whisper, or OpenAI. Choose the best backend for your language and quality needs.
        </ArdoFeatureCard>
        <ArdoFeatureCard title="LLM Enhancement" icon="✦">
          Optional AI enhancement for punctuation, formatting, and intelligent corrections.
        </ArdoFeatureCard>
      </ArdoFeatures>

      <section className="cuttledoc-home-section" aria-labelledby="examples-heading">
        <h2 id="examples-heading">Use cuttledoc from Node.js</h2>
        <div className="cuttledoc-code-grid">
          <div>
            <pre>
              <code>{`import { transcribe } from "cuttledoc"\n\nconst result = await transcribe("audio.mp3")\nconsole.log(result.text)`}</code>
            </pre>
            <p>Speech-to-text in 3 lines</p>
          </div>
          <div>
            <pre>
              <code>{`import { enhanceTranscript } from "@cuttledoc/llm"\n\nconst enhanced = await enhanceTranscript(text)\nconsole.log(enhanced.markdown)`}</code>
            </pre>
            <p>AI-powered formatting & corrections</p>
          </div>
        </div>
      </section>

      <section className="cuttledoc-home-section" aria-labelledby="backends-heading">
        <h2 id="backends-heading">Powered by industry leaders</h2>
        <ul className="cuttledoc-backends">
          <li>
            <img src={nvidiaLogo} alt="" />
            NVIDIA Parakeet
          </li>
          <li>
            <img src={openaiLogo} alt="" />
            OpenAI Whisper
          </li>
          <li>
            <img src={geminiLogo} alt="" />
            Google Gemma
          </li>
          <li>
            <img src={appleLogo} alt="" />
            Apple CoreML
          </li>
        </ul>
      </section>

      <p className="cuttledoc-install">
        Ready to transcribe? Get started in under a minute. <code>pnpm add cuttledoc</code>
      </p>
    </div>
  )
}
