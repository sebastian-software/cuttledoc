export function GettingStarted() {
  return (
    <>
      <h1>Getting Started</h1>
      <p>
        cuttledoc is a fast, offline speech-to-text transcription library for Node.js.
        It supports multiple backends and optional LLM enhancement for formatting transcripts.
      </p>

      <h2>Installation</h2>
      <pre>
        <code>pnpm add cuttledoc</code>
      </pre>

      <h3>Requirements</h3>
      <ul>
        <li>Node.js 24+</li>
        <li>macOS 14+ (for Apple Speech backend)</li>
        <li>~2GB disk space for models</li>
      </ul>

      <h2>CLI Usage</h2>
      <pre>
        <code>{`# Basic transcription
cuttledoc video.mp4

# With LLM enhancement
cuttledoc podcast.mp3 --enhance -o transcript.md

# Use specific backend
cuttledoc meeting.m4a -b apple -l de

# Show stats
cuttledoc audio.wav --stats`}</code>
      </pre>

      <h2>API Usage</h2>
      <pre>
        <code>{`import { transcribe } from "cuttledoc";

const result = await transcribe("audio.mp3", {
  language: "en",
  backend: "auto",
});

console.log(result.text);
console.log(\`Duration: \${result.durationSeconds}s\`);`}</code>
      </pre>

      <h2>With LLM Enhancement</h2>
      <pre>
        <code>{`import { transcribe } from "cuttledoc";
import { enhanceTranscript } from "cuttledoc/llm";

const result = await transcribe("podcast.mp3");

const enhanced = await enhanceTranscript(result.text, {
  model: "gemma3n:e4b",
  mode: "enhance",
});

console.log(enhanced.markdown);`}</code>
      </pre>

      <h2>Available Backends</h2>
      <table>
        <thead>
          <tr>
            <th>Backend</th>
            <th>Platform</th>
            <th>Speed</th>
            <th>Languages</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Apple Speech</td>
            <td>macOS 14+</td>
            <td>⚡⚡⚡</td>
            <td>60+</td>
          </tr>
          <tr>
            <td>Whisper</td>
            <td>All</td>
            <td>⚡⚡</td>
            <td>99</td>
          </tr>
          <tr>
            <td>Parakeet</td>
            <td>All</td>
            <td>⚡⚡⚡</td>
            <td>EN</td>
          </tr>
        </tbody>
      </table>

      <h2>Model Management</h2>
      <pre>
        <code>{`# List available models
cuttledoc models list

# Download speech model
cuttledoc models download parakeet-tdt-0.6b-v3

# Download LLM model
cuttledoc models download gemma3n:e4b`}</code>
      </pre>
    </>
  );
}

