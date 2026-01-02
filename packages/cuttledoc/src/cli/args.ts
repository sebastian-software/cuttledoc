/**
 * CLI argument parsing
 */

export interface CLIArgs {
  // Flags
  help: boolean
  version: boolean
  quiet: boolean
  stats: boolean
  enhance: boolean
  correctOnly: boolean

  // Options
  backend: string | undefined
  model: string | undefined
  language: string | undefined
  output: string | undefined
  llmModel: string | undefined
  apiKey: string | undefined

  // Subcommand
  command: string | undefined

  // Positional arguments
  positional: string[]
}

/**
 * Parse CLI arguments
 */
export function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    help: false,
    version: false,
    quiet: false,
    stats: false,
    enhance: true, // LLM correction enabled by default
    correctOnly: true, // Default: only correct errors (no formatting/TLDR)
    backend: undefined,
    model: undefined,
    language: undefined,
    output: undefined,
    llmModel: undefined,
    apiKey: undefined,
    command: undefined,
    positional: []
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === undefined) {
      i++
      continue
    }

    // Flags
    if (arg === "-h" || arg === "--help") {
      args.help = true
    } else if (arg === "-v" || arg === "--version") {
      args.version = true
    } else if (arg === "-q" || arg === "--quiet") {
      args.quiet = true
    } else if (arg === "-s" || arg === "--stats") {
      args.stats = true
    } else if (arg === "-e" || arg === "--enhance") {
      args.enhance = true
      args.correctOnly = false // Full enhancement with formatting/TLDR
    } else if (arg === "--no-enhance") {
      args.enhance = false // Disable LLM correction entirely
    } else if (arg === "--correct-only") {
      args.correctOnly = true
      args.enhance = true
    }
    // Options with values
    else if (arg === "-b" || arg === "--backend") {
      args.backend = argv[++i]
    } else if (arg === "-m" || arg === "--model") {
      args.model = argv[++i]
    } else if (arg === "-l" || arg === "--language") {
      args.language = argv[++i]
    } else if (arg === "-o" || arg === "--output") {
      args.output = argv[++i]
    } else if (arg === "--llm-model") {
      args.llmModel = argv[++i]
    } else if (arg === "--api-key") {
      args.apiKey = argv[++i]
    }
    // Subcommands
    else if (arg === "models") {
      args.command = "models"
      args.positional = argv.slice(i + 1)
      break
    } else if (arg === "benchmark") {
      args.command = "benchmark"
      args.positional = argv.slice(i + 1)
      break
    }
    // Positional arguments
    else if (!arg.startsWith("-")) {
      args.positional.push(arg)
    }
    // Unknown option
    else {
      console.warn(`Unknown option: ${arg}`)
    }

    i++
  }

  return args
}
