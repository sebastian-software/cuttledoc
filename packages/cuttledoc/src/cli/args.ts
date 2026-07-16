/**
 * CLI argument parsing
 */

export interface CLIArgs {
  // Flags
  help: boolean
  version: boolean
  quiet: boolean
  stats: boolean
  correct: boolean // LLM correction (default: true)
  format: boolean // Full formatting with paragraphs/headings (default: false)

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

function readOptionValue(argv: string[], optionIndex: number): string {
  const value = argv[optionIndex + 1]
  if (value === undefined || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Option ${argv[optionIndex] ?? ""} requires a value`)
  }
  return value
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
    correct: true, // LLM correction enabled by default
    format: false, // Formatting disabled by default
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

    // End of options: everything after -- is positional, including dash-prefixed paths.
    if (arg === "--") {
      args.positional.push(...argv.slice(i + 1))
      break
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
    } else if (arg === "-f" || arg === "--format") {
      args.format = true // Enable formatting (implies correction)
      args.correct = true
    } else if (arg === "--no-correct") {
      args.correct = false // Disable LLM correction entirely
      args.format = false
    }
    // Options with values
    else if (arg === "-b" || arg === "--backend") {
      args.backend = readOptionValue(argv, i)
      i++
    } else if (arg === "-m" || arg === "--model") {
      args.model = readOptionValue(argv, i)
      i++
    } else if (arg === "-l" || arg === "--language") {
      args.language = readOptionValue(argv, i)
      i++
    } else if (arg === "-o" || arg === "--output") {
      args.output = readOptionValue(argv, i)
      i++
    } else if (arg === "--llm-model") {
      args.llmModel = readOptionValue(argv, i)
      i++
    } else if (arg === "--api-key") {
      args.apiKey = readOptionValue(argv, i)
      i++
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
      throw new Error(`Unknown option: ${arg}`)
    }

    i++
  }

  return args
}
