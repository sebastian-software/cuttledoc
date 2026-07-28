use std::cell::RefCell;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::rc::Rc;
use std::time::{Duration, Instant};

use cuttledoc::{
    AudioFormat, Availability, BackendId, BackendSelection, CancellationToken, EnhancementOutcome,
    FileTranscriptionSession, HostedTranscriptionOptions, MediaDecodeOptions, ModelId,
    ModelManager, PcmBuffer, ProgressEvent, TranscribeOptions, TranscriptEnhancementContext,
    TranscriptEnhancementMode, TranscriptionResult, apply_transcript_enhancement,
    recognition_asset_inventory, recognition_capabilities, text_generation_capabilities,
    transcribe_file, transcribe_file_with_progress, transcribe_pcm, transcribe_pcm_with_progress,
};

mod batch;
mod cli_error;
mod model_commands;
mod output;
mod progress_output;

use batch::{BatchOptions, execute_batch, plan_batch};
use cli_error::{CliError, CliResult};
use model_commands::ModelCommand;
use output::{OutputFormat, OutputOptions, emit_result, validate_output};
use progress_output::{BatchProgressRenderer, ProgressFormat};

const HELP: &str = "\
Cuttledoc speech and text processing

Usage:
  cuttledoc --help
  cuttledoc --version
  cuttledoc backends list
  cuttledoc models list [--cache-root <path>] [--format <text|json>]
  cuttledoc models install <model|asr|all> [--cache-root <path>]
  cuttledoc models verify <model|asr|all> [--cache-root <path>]
  cuttledoc models remove <model> [--cache-root <path>]
  cuttledoc models cache-root [--cache-root <path>]
  cuttledoc transcribe <path> --language <tag|auto> [--backend <id|auto>] [--model <id>] [--model-path <path>] [--cache-root <path>] [--ffmpeg-path <path>] [--timeout-seconds <seconds>] [--enhance <off|local|gemini>] [--enhancement-model-path <path>] [--format <text|markdown|json>] [--output <path>] [--force] [--progress]
  cuttledoc transcribe-batch <directory> [--recursive] [--language <tag|auto>] [--backend <id|auto>] [--model <id>] [--model-path <path>] [--cache-root <path>] [--ffmpeg-path <path>] [--timeout-seconds <seconds>] [--enhance <off|gemini>] [--format <text|markdown|json>] [--skip-existing|--force] [--report <path>] [--progress] [--progress-format <auto|human|tsv>]
  cuttledoc transcribe-pcm <path> --language <tag|auto> [--backend <id|auto>] [--model <id>] [--model-path <path>] [--cache-root <path>] [--sample-rate <hz>] [--enhance <off|local|gemini>] [--enhancement-model-path <path>] [--format <text|markdown|json>] [--output <path>] [--force] [--progress]

transcribe accepts media supported by the configured or system FFmpeg and
decodes it conservatively to mono 16000 Hz PCM. transcribe-pcm bypasses media
decoding and accepts mono little-endian f32 PCM. transcribe-batch writes atomic
sidecars, skips existing outputs by default, and reuses one recognition runtime.
Its language defaults to auto, which uses Whisper language detection. Interactive
batch progress is human-readable; redirected progress remains stable TSV.
Enhancement defaults to off
until the ADR-0014 32 GB host gate is complete. Gemini reads OPENROUTER_API_KEY
only after transcription has released its recognition runtime. Explicit
openai-transcription file requests upload the original supported media file,
read OPENAI_API_KEY, and default to a 300-second timeout. No API-key flag is
accepted.
";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
enum EnhancementSelection {
    #[default]
    Off,
    Local,
    Gemini,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct SharedTranscriptionArguments {
    selection: Option<EnhancementSelection>,
    enhancement_model_path: Option<PathBuf>,
    recognition_model: Option<ModelId>,
    cache_root: Option<PathBuf>,
    output_format: Option<OutputFormat>,
    output_path: Option<PathBuf>,
    overwrite: bool,
    progress: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ResolvedSharedTranscriptionArguments {
    enhancement: EnhancementSelection,
    enhancement_model_path: Option<PathBuf>,
    recognition_model: Option<ModelId>,
    cache_root: Option<PathBuf>,
    output: OutputOptions,
    progress: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Command {
    Help,
    Version,
    ListBackends,
    Models(ModelCommand),
    Transcribe {
        path: PathBuf,
        language: String,
        backend: BackendSelection,
        model: Option<ModelId>,
        model_path: Option<PathBuf>,
        cache_root: Option<PathBuf>,
        ffmpeg_path: Option<PathBuf>,
        timeout_seconds: Option<u64>,
        enhancement: EnhancementSelection,
        enhancement_model_path: Option<PathBuf>,
        output: OutputOptions,
        progress: bool,
    },
    TranscribeBatch {
        root: PathBuf,
        recursive: bool,
        language: String,
        backend: BackendSelection,
        model: Option<ModelId>,
        model_path: Option<PathBuf>,
        cache_root: Option<PathBuf>,
        ffmpeg_path: Option<PathBuf>,
        timeout_seconds: Option<u64>,
        enhancement: EnhancementSelection,
        output_format: OutputFormat,
        overwrite: bool,
        report_path: PathBuf,
        progress: bool,
        progress_format: ProgressFormat,
    },
    TranscribePcm {
        path: PathBuf,
        language: String,
        backend: BackendSelection,
        model: Option<ModelId>,
        model_path: Option<PathBuf>,
        cache_root: Option<PathBuf>,
        sample_rate: u32,
        enhancement: EnhancementSelection,
        enhancement_model_path: Option<PathBuf>,
        output: OutputOptions,
        progress: bool,
    },
}

fn main() -> ExitCode {
    match parse(env::args().skip(1)) {
        Ok(command) => match run(command) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(error.exit_status)
            }
        },
        Err(message) => {
            let error = CliError::usage(message);
            eprintln!("{error}\n\n{HELP}");
            ExitCode::from(error.exit_status)
        }
    }
}

fn parse(arguments: impl IntoIterator<Item = String>) -> Result<Command, String> {
    let arguments = arguments.into_iter().collect::<Vec<_>>();
    match arguments.as_slice() {
        [] => Ok(Command::Help),
        [value] if value == "--help" || value == "-h" => Ok(Command::Help),
        [value] if value == "--version" || value == "-V" => Ok(Command::Version),
        [group, action] if group == "backends" && action == "list" => Ok(Command::ListBackends),
        [group, rest @ ..] if group == "models" => model_commands::parse(rest).map(Command::Models),
        [command, rest @ ..] if command == "transcribe" => parse_transcribe(rest),
        [command, rest @ ..] if command == "transcribe-batch" => parse_transcribe_batch(rest),
        [command, rest @ ..] if command == "transcribe-pcm" => parse_transcribe_pcm(rest),
        _ => Err(format!("unsupported arguments: {}", arguments.join(" "))),
    }
}

fn parse_transcribe(arguments: &[String]) -> Result<Command, String> {
    let Some(path) = arguments.first().filter(|value| !value.starts_with('-')) else {
        return Err("transcribe requires an input path".to_owned());
    };
    let mut language = None;
    let mut backend = None;
    let mut model_path = None;
    let mut ffmpeg_path = None;
    let mut timeout_seconds = None;
    let mut shared_arguments = SharedTranscriptionArguments::default();
    let mut index = 1;
    while index < arguments.len() {
        if let Some(next_index) =
            parse_shared_transcription_argument(arguments, index, &mut shared_arguments)?
        {
            index = next_index;
            continue;
        }
        match arguments[index].as_str() {
            "--language" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--language requires a BCP 47 language tag")?;
                if language.replace(value.clone()).is_some() {
                    return Err("--language may only be specified once".to_owned());
                }
                index += 2;
            }
            "--ffmpeg-path" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--ffmpeg-path requires an executable path")?;
                if ffmpeg_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--ffmpeg-path may only be specified once".to_owned());
                }
                index += 2;
            }
            "--timeout-seconds" => {
                let value = arguments
                    .get(index + 1)
                    .and_then(|value| value.parse::<u64>().ok())
                    .filter(|value| *value > 0)
                    .ok_or("--timeout-seconds requires a positive integer")?;
                if timeout_seconds.replace(value).is_some() {
                    return Err("--timeout-seconds may only be specified once".to_owned());
                }
                index += 2;
            }
            "--backend" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--backend requires auto or a backend identifier")?;
                if backend.replace(parse_backend(value)?).is_some() {
                    return Err("--backend may only be specified once".to_owned());
                }
                index += 2;
            }
            "--model-path" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--model-path requires a model path")?;
                if model_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--model-path may only be specified once".to_owned());
                }
                index += 2;
            }
            option => return Err(format!("unsupported transcribe option: {option}")),
        }
    }
    let shared = finish_shared_transcription_arguments(shared_arguments)?;
    let backend = backend.unwrap_or_default();
    if timeout_seconds.is_some()
        && !matches!(
            &backend,
            BackendSelection::Id(backend) if backend == &BackendId::openai_transcription()
        )
    {
        return Err("--timeout-seconds requires --backend openai-transcription".to_owned());
    }
    Ok(Command::Transcribe {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe requires --language <tag>")?,
        backend,
        model: shared.recognition_model,
        model_path,
        cache_root: shared.cache_root,
        ffmpeg_path,
        timeout_seconds,
        enhancement: shared.enhancement,
        enhancement_model_path: shared.enhancement_model_path,
        output: shared.output,
        progress: shared.progress,
    })
}

fn parse_transcribe_batch(arguments: &[String]) -> Result<Command, String> {
    let Some(root) = arguments.first().filter(|value| !value.starts_with('-')) else {
        return Err("transcribe-batch requires an input directory".to_owned());
    };
    let root = PathBuf::from(root);
    let mut language = None;
    let mut backend = None;
    let mut model = None;
    let mut model_path = None;
    let mut cache_root = None;
    let mut ffmpeg_path = None;
    let mut timeout_seconds = None;
    let mut enhancement = None;
    let mut output_format = None;
    let mut report_path = None;
    let mut recursive = false;
    let mut recursive_seen = false;
    let mut skip_existing = false;
    let mut overwrite = false;
    let mut progress = false;
    let mut progress_format = None;
    let mut index = 1;

    while index < arguments.len() {
        match arguments[index].as_str() {
            "--language" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--language requires a BCP 47 language tag or auto")?;
                if language.replace(value.clone()).is_some() {
                    return Err("--language may only be specified once".to_owned());
                }
                index += 2;
            }
            "--backend" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--backend requires auto or a backend identifier")?;
                if backend.replace(parse_backend(value)?).is_some() {
                    return Err("--backend may only be specified once".to_owned());
                }
                index += 2;
            }
            "--model" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--model requires a model identifier")?;
                let parsed = ModelId::new(value.clone()).map_err(|error| error.to_string())?;
                if model.replace(parsed).is_some() {
                    return Err("--model may only be specified once".to_owned());
                }
                index += 2;
            }
            "--model-path" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--model-path requires a model path")?;
                if model_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--model-path may only be specified once".to_owned());
                }
                index += 2;
            }
            "--cache-root" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--cache-root requires a directory path")?;
                if cache_root.replace(PathBuf::from(value)).is_some() {
                    return Err("--cache-root may only be specified once".to_owned());
                }
                index += 2;
            }
            "--ffmpeg-path" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--ffmpeg-path requires an executable path")?;
                if ffmpeg_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--ffmpeg-path may only be specified once".to_owned());
                }
                index += 2;
            }
            "--timeout-seconds" => {
                let value = arguments
                    .get(index + 1)
                    .and_then(|value| value.parse::<u64>().ok())
                    .filter(|value| *value > 0)
                    .ok_or("--timeout-seconds requires a positive integer")?;
                if timeout_seconds.replace(value).is_some() {
                    return Err("--timeout-seconds may only be specified once".to_owned());
                }
                index += 2;
            }
            "--enhance" => {
                let value = arguments
                    .get(index + 1)
                    .ok_or("--enhance requires off or gemini")?;
                let selection = parse_enhancement(value)?;
                if selection == EnhancementSelection::Local {
                    return Err(
                        "transcribe-batch does not yet support local enhancement runtime reuse; use off or gemini"
                            .to_owned(),
                    );
                }
                if enhancement.replace(selection).is_some() {
                    return Err("--enhance may only be specified once".to_owned());
                }
                index += 2;
            }
            "--format" => {
                let value = arguments
                    .get(index + 1)
                    .ok_or("--format requires text, markdown, or json")?;
                if output_format.replace(OutputFormat::parse(value)?).is_some() {
                    return Err("--format may only be specified once".to_owned());
                }
                index += 2;
            }
            "--json" => {
                if output_format.replace(OutputFormat::Json).is_some() {
                    return Err("--json conflicts with another output format".to_owned());
                }
                index += 1;
            }
            "--recursive" => {
                if recursive_seen {
                    return Err("--recursive may only be specified once".to_owned());
                }
                recursive = true;
                recursive_seen = true;
                index += 1;
            }
            "--skip-existing" => {
                if skip_existing {
                    return Err("--skip-existing may only be specified once".to_owned());
                }
                skip_existing = true;
                index += 1;
            }
            "--force" => {
                if overwrite {
                    return Err("--force may only be specified once".to_owned());
                }
                overwrite = true;
                index += 1;
            }
            "--report" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--report requires a file path")?;
                if report_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--report may only be specified once".to_owned());
                }
                index += 2;
            }
            "--progress" => {
                if progress {
                    return Err("--progress may only be specified once".to_owned());
                }
                progress = true;
                index += 1;
            }
            "--progress-format" => {
                let value = arguments
                    .get(index + 1)
                    .ok_or("--progress-format requires auto, human, or tsv")?;
                if progress_format
                    .replace(ProgressFormat::parse(value)?)
                    .is_some()
                {
                    return Err("--progress-format may only be specified once".to_owned());
                }
                index += 2;
            }
            "--enhancement-model-path" => {
                return Err(
                    "--enhancement-model-path is unavailable because transcribe-batch does not yet support local enhancement"
                        .to_owned(),
                );
            }
            option => return Err(format!("unsupported transcribe-batch option: {option}")),
        }
    }

    if overwrite && skip_existing {
        return Err("--force conflicts with --skip-existing".to_owned());
    }
    let backend = backend.unwrap_or_default();
    if timeout_seconds.is_some()
        && !matches!(
            &backend,
            BackendSelection::Id(backend) if backend == &BackendId::openai_transcription()
        )
    {
        return Err("--timeout-seconds requires --backend openai-transcription".to_owned());
    }
    let report_path = report_path.unwrap_or_else(|| root.join(".cuttledoc-batch-report.json"));
    Ok(Command::TranscribeBatch {
        root,
        recursive,
        language: language.unwrap_or_else(|| "auto".to_owned()),
        backend,
        model,
        model_path,
        cache_root,
        ffmpeg_path,
        timeout_seconds,
        enhancement: enhancement.unwrap_or_default(),
        output_format: output_format.unwrap_or_default(),
        overwrite,
        report_path,
        progress,
        progress_format: progress_format.unwrap_or_default(),
    })
}

fn parse_transcribe_pcm(arguments: &[String]) -> Result<Command, String> {
    let Some(path) = arguments.first().filter(|value| !value.starts_with('-')) else {
        return Err("transcribe-pcm requires an input path".to_owned());
    };
    let mut language = None;
    let mut backend = None;
    let mut model_path = None;
    let mut sample_rate = None;
    let mut shared_arguments = SharedTranscriptionArguments::default();
    let mut index = 1;
    while index < arguments.len() {
        if let Some(next_index) =
            parse_shared_transcription_argument(arguments, index, &mut shared_arguments)?
        {
            index = next_index;
            continue;
        }
        match arguments[index].as_str() {
            "--language" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--language requires a BCP 47 language tag")?;
                if language.replace(value.clone()).is_some() {
                    return Err("--language may only be specified once".to_owned());
                }
                index += 2;
            }
            "--sample-rate" => {
                let value = arguments
                    .get(index + 1)
                    .ok_or("--sample-rate requires a positive integer")?;
                let value = value
                    .parse::<u32>()
                    .ok()
                    .filter(|value| *value > 0)
                    .ok_or("--sample-rate requires a positive integer")?;
                if sample_rate.replace(value).is_some() {
                    return Err("--sample-rate may only be specified once".to_owned());
                }
                index += 2;
            }
            "--backend" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--backend requires auto or a backend identifier")?;
                if backend.replace(parse_backend(value)?).is_some() {
                    return Err("--backend may only be specified once".to_owned());
                }
                index += 2;
            }
            "--model-path" => {
                let value = arguments
                    .get(index + 1)
                    .filter(|value| !value.is_empty())
                    .ok_or("--model-path requires a model path")?;
                if model_path.replace(PathBuf::from(value)).is_some() {
                    return Err("--model-path may only be specified once".to_owned());
                }
                index += 2;
            }
            option => return Err(format!("unsupported transcribe-pcm option: {option}")),
        }
    }
    let shared = finish_shared_transcription_arguments(shared_arguments)?;
    Ok(Command::TranscribePcm {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe-pcm requires --language <tag>")?,
        backend: backend.unwrap_or_default(),
        model: shared.recognition_model,
        model_path,
        cache_root: shared.cache_root,
        sample_rate: sample_rate.unwrap_or(16_000),
        enhancement: shared.enhancement,
        enhancement_model_path: shared.enhancement_model_path,
        output: shared.output,
        progress: shared.progress,
    })
}

fn parse_backend(value: &str) -> Result<BackendSelection, String> {
    if value == "auto" {
        return Ok(BackendSelection::Auto);
    }
    BackendId::new(value)
        .map(BackendSelection::Id)
        .map_err(|error| error.to_string())
}

fn parse_enhancement(value: &str) -> Result<EnhancementSelection, String> {
    match value {
        "off" => Ok(EnhancementSelection::Off),
        "local" => Ok(EnhancementSelection::Local),
        "gemini" => Ok(EnhancementSelection::Gemini),
        _ => Err("--enhance requires off, local, or gemini".to_owned()),
    }
}

fn parse_shared_transcription_argument(
    arguments: &[String],
    index: usize,
    parsed: &mut SharedTranscriptionArguments,
) -> Result<Option<usize>, String> {
    match arguments[index].as_str() {
        "--enhance" => {
            let value = arguments
                .get(index + 1)
                .ok_or("--enhance requires off, local, or gemini")?;
            if parsed
                .selection
                .replace(parse_enhancement(value)?)
                .is_some()
            {
                return Err("--enhance may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--enhancement-model-path" => {
            let value = arguments
                .get(index + 1)
                .filter(|value| !value.is_empty())
                .ok_or("--enhancement-model-path requires a model directory")?;
            if parsed
                .enhancement_model_path
                .replace(PathBuf::from(value))
                .is_some()
            {
                return Err("--enhancement-model-path may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--model" => {
            let value = arguments
                .get(index + 1)
                .filter(|value| !value.is_empty())
                .ok_or("--model requires a model identifier")?;
            let model = ModelId::new(value.clone()).map_err(|error| error.to_string())?;
            if parsed.recognition_model.replace(model).is_some() {
                return Err("--model may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--cache-root" => {
            let value = arguments
                .get(index + 1)
                .filter(|value| !value.is_empty())
                .ok_or("--cache-root requires a directory path")?;
            if parsed.cache_root.replace(PathBuf::from(value)).is_some() {
                return Err("--cache-root may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--json" => {
            if parsed.output_format.replace(OutputFormat::Json).is_some() {
                return Err("--json conflicts with another output format".to_owned());
            }
            Ok(Some(index + 1))
        }
        "--format" => {
            let value = arguments
                .get(index + 1)
                .ok_or("--format requires text, markdown, or json")?;
            if parsed
                .output_format
                .replace(OutputFormat::parse(value)?)
                .is_some()
            {
                return Err("--format may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--output" => {
            let value = arguments
                .get(index + 1)
                .filter(|value| !value.is_empty())
                .ok_or("--output requires a file path")?;
            if parsed.output_path.replace(PathBuf::from(value)).is_some() {
                return Err("--output may only be specified once".to_owned());
            }
            Ok(Some(index + 2))
        }
        "--force" => {
            if parsed.overwrite {
                return Err("--force may only be specified once".to_owned());
            }
            parsed.overwrite = true;
            Ok(Some(index + 1))
        }
        "--progress" => {
            if parsed.progress {
                return Err("--progress may only be specified once".to_owned());
            }
            parsed.progress = true;
            Ok(Some(index + 1))
        }
        _ => Ok(None),
    }
}

fn finish_shared_transcription_arguments(
    parsed: SharedTranscriptionArguments,
) -> Result<ResolvedSharedTranscriptionArguments, String> {
    let selection = parsed.selection.unwrap_or_default();
    if parsed.enhancement_model_path.is_some() && selection != EnhancementSelection::Local {
        return Err("--enhancement-model-path requires --enhance local".to_owned());
    }
    if parsed.overwrite && parsed.output_path.is_none() {
        return Err("--force requires --output".to_owned());
    }
    Ok(ResolvedSharedTranscriptionArguments {
        enhancement: selection,
        enhancement_model_path: parsed.enhancement_model_path,
        recognition_model: parsed.recognition_model,
        cache_root: parsed.cache_root,
        output: OutputOptions {
            format: parsed.output_format.unwrap_or_default(),
            path: parsed.output_path,
            overwrite: parsed.overwrite,
        },
        progress: parsed.progress,
    })
}

fn run(command: Command) -> CliResult<()> {
    match command {
        Command::Help => print!("{HELP}"),
        Command::Version => println!("cuttledoc {}", cuttledoc::VERSION),
        Command::ListBackends => {
            for capability in recognition_capabilities() {
                let model = capability.model.as_ref().map_or("-", ModelId::as_str);
                match capability.availability {
                    Availability::Available => {
                        match recognition_asset_inventory(&capability.backend) {
                            Ok(inventory) => println!(
                                "{}\tavailable\ttask=transcription\tmodel={model}\tfile_input={}\tlanguages={}\tlocales={}\tinstalled={}\treserved={}\treservation_limit={}",
                                capability.backend,
                                capability.file_input,
                                capability.languages.len(),
                                inventory.supported_locales.len(),
                                inventory.installed_locales.len(),
                                inventory.reserved_locales.len(),
                                inventory.maximum_reserved_locales
                            ),
                            Err(_) => println!(
                                "{}\tavailable\ttask=transcription\tmodel={model}\tfile_input={}",
                                capability.backend, capability.file_input
                            ),
                        }
                    }
                    Availability::Unavailable { reason, detail, .. } => {
                        println!(
                            "{}\tunavailable\t{}\t{}\ttask=transcription\tmodel={model}\tfile_input={}",
                            capability.backend,
                            reason.as_str(),
                            detail,
                            capability.file_input
                        );
                    }
                }
            }
            for capability in text_generation_capabilities() {
                match capability.availability {
                    Availability::Available => println!(
                        "{}\tavailable\ttask=text-generation\tmodel={}\tlocal={}",
                        capability.backend, capability.model, capability.local
                    ),
                    Availability::Unavailable { reason, detail, .. } => println!(
                        "{}\tunavailable\t{}\t{}\ttask=text-generation\tmodel={}\tlocal={}",
                        capability.backend,
                        reason.as_str(),
                        detail,
                        capability.model,
                        capability.local
                    ),
                }
            }
        }
        Command::Models(command) => model_commands::run(command)?,
        Command::Transcribe {
            path,
            language,
            backend,
            model,
            model_path,
            cache_root,
            ffmpeg_path,
            timeout_seconds,
            enhancement,
            enhancement_model_path,
            output,
            progress,
        } => {
            validate_output(&output)?;
            let model_path = resolve_recognition_model_path(
                &backend,
                model.as_ref(),
                model_path,
                cache_root.as_ref(),
            )?;
            let enhancement_model_path = resolve_enhancement_model_path(
                enhancement,
                enhancement_model_path,
                cache_root.as_ref(),
            )?;
            let options = TranscribeOptions {
                backend,
                model,
                language: Some(language.clone()),
                model_path,
                hosted: HostedTranscriptionOptions {
                    timeout: timeout_seconds
                        .map(Duration::from_secs)
                        .unwrap_or_else(|| HostedTranscriptionOptions::default().timeout),
                    ..HostedTranscriptionOptions::default()
                },
            };
            let decode_options = MediaDecodeOptions { ffmpeg_path };
            let result = if progress {
                transcribe_file_with_progress(
                    &path,
                    &options,
                    &decode_options,
                    &CancellationToken::new(),
                    render_transcription_progress,
                )
            } else {
                transcribe_file(&path, &options, &decode_options)
            }
            .map_err(CliError::from)?;
            let result = enhance_result(
                result,
                &language,
                enhancement,
                enhancement_model_path,
                progress,
                render_transcription_progress,
            )?;
            emit_result(&result, &output)?;
        }
        Command::TranscribeBatch {
            root,
            recursive,
            language,
            backend,
            model,
            model_path,
            cache_root,
            ffmpeg_path,
            timeout_seconds,
            enhancement,
            output_format,
            overwrite,
            report_path,
            progress,
            progress_format,
        } => {
            let batch_started_at = Instant::now();
            let plan = plan_batch(BatchOptions {
                root: root.clone(),
                recursive,
                format: output_format,
                overwrite,
                report_path,
            })?;
            let renderer = Rc::new(RefCell::new(BatchProgressRenderer::stderr(
                &root,
                progress_format,
            )));
            renderer.borrow_mut().discovered(
                plan.discovered(),
                plan.pending.len(),
                plan.skipped.len(),
            );

            let summary = if plan.pending.is_empty() {
                let event_renderer = Rc::clone(&renderer);
                execute_batch(
                    plan,
                    batch_started_at,
                    |_| unreachable!("an empty batch does not invoke its processor"),
                    move |event| event_renderer.borrow_mut().batch_event(event),
                )?
            } else {
                let model =
                    if model.is_none() && backend == BackendSelection::Auto && language == "auto" {
                        Some(
                            ModelId::new("whisper-large-v3-turbo")
                                .expect("the managed Whisper model ID is valid"),
                        )
                    } else {
                        model
                    };
                let model_path = resolve_recognition_model_path(
                    &backend,
                    model.as_ref(),
                    model_path,
                    cache_root.as_ref(),
                )?;
                let enhancement_model_path =
                    resolve_enhancement_model_path(enhancement, None, cache_root.as_ref())?;
                let options = TranscribeOptions {
                    backend,
                    model,
                    language: Some(language.clone()),
                    model_path,
                    hosted: HostedTranscriptionOptions {
                        timeout: timeout_seconds
                            .map(Duration::from_secs)
                            .unwrap_or_else(|| HostedTranscriptionOptions::default().timeout),
                        ..HostedTranscriptionOptions::default()
                    },
                };
                let decode_options = MediaDecodeOptions { ffmpeg_path };
                renderer.borrow_mut().loading(false);
                let loading_renderer = Rc::clone(&renderer);
                let mut session = FileTranscriptionSession::create_with_progress(
                    &options,
                    &decode_options,
                    move |event| {
                        if progress {
                            loading_renderer.borrow_mut().transcription_progress(event);
                        }
                    },
                )
                .map_err(CliError::from)?;
                renderer.borrow_mut().loading(true);

                let process_renderer = Rc::clone(&renderer);
                let event_renderer = Rc::clone(&renderer);
                execute_batch(
                    plan,
                    batch_started_at,
                    |path| {
                        let result = if progress {
                            let file_renderer = Rc::clone(&process_renderer);
                            session.transcribe_file_with_progress(
                                path,
                                &CancellationToken::new(),
                                move |event| {
                                    file_renderer.borrow_mut().transcription_progress(event);
                                },
                            )
                        } else {
                            session.transcribe_file(path)
                        }
                        .map_err(CliError::from)?;
                        enhance_result(
                            result,
                            &language,
                            enhancement,
                            enhancement_model_path.clone(),
                            progress,
                            |event| {
                                process_renderer.borrow_mut().transcription_progress(event);
                            },
                        )
                    },
                    move |event| event_renderer.borrow_mut().batch_event(event),
                )?
            };
            renderer.borrow_mut().summary(&summary);
            if !summary.failures.is_empty() {
                return Err(CliError::new(
                    "BATCH_PARTIAL_FAILURE",
                    format!(
                        "{} of {} pending transcription(s) failed; details: {}",
                        summary.failures.len(),
                        summary.completed() + summary.failures.len(),
                        summary.report_path.display()
                    ),
                    1,
                )
                .with_remediation(
                    "fix the reported failures and rerun; completed sidecars will be skipped",
                ));
            }
        }
        Command::TranscribePcm {
            path,
            language,
            backend,
            model,
            model_path,
            cache_root,
            sample_rate,
            enhancement,
            enhancement_model_path,
            output,
            progress,
        } => {
            validate_output(&output)?;
            let model_path = resolve_recognition_model_path(
                &backend,
                model.as_ref(),
                model_path,
                cache_root.as_ref(),
            )?;
            let enhancement_model_path = resolve_enhancement_model_path(
                enhancement,
                enhancement_model_path,
                cache_root.as_ref(),
            )?;
            let bytes = fs::read(&path).map_err(|error| {
                CliError::new(
                    "INPUT_READ_FAILED",
                    format!("could not read {}: {error}", path.display()),
                    1,
                )
            })?;
            let format = AudioFormat::new(sample_rate, 1)
                .map_err(|error| CliError::new("INVALID_INPUT", error.to_string(), 1))?;
            let input = PcmBuffer::from_f32le_bytes(format, &bytes)
                .map_err(|error| CliError::new("INVALID_INPUT", error.to_string(), 1))?;
            let options = TranscribeOptions {
                backend,
                model,
                language: Some(language.clone()),
                model_path,
                ..TranscribeOptions::default()
            };
            let result = if progress {
                transcribe_pcm_with_progress(
                    &input,
                    &options,
                    &CancellationToken::new(),
                    render_transcription_progress,
                )
            } else {
                transcribe_pcm(&input, &options)
            }
            .map_err(CliError::from)?;
            let result = enhance_result(
                result,
                &language,
                enhancement,
                enhancement_model_path,
                progress,
                render_transcription_progress,
            )?;
            emit_result(&result, &output)?;
        }
    }
    Ok(())
}

fn resolve_recognition_model_path(
    backend: &BackendSelection,
    model: Option<&ModelId>,
    explicit: Option<PathBuf>,
    cache_root: Option<&PathBuf>,
) -> CliResult<Option<PathBuf>> {
    if explicit.is_some() {
        return Ok(explicit);
    }
    let uses_whisper = matches!(
        backend,
        BackendSelection::Id(backend) if backend == &BackendId::whisper()
    ) || model.is_some_and(|model| model.as_str() == "whisper-large-v3-turbo");
    if !uses_whisper {
        return Ok(None);
    }
    let manager = ModelManager::new(model_commands::resolve_cache_root(cache_root.cloned())?);
    Ok(Some(
        manager
            .model_directory("whisper-large-v3-turbo")
            .map_err(CliError::from)?
            .join("ggml-large-v3-turbo.bin"),
    ))
}

fn resolve_enhancement_model_path(
    enhancement: EnhancementSelection,
    explicit: Option<PathBuf>,
    cache_root: Option<&PathBuf>,
) -> CliResult<Option<PathBuf>> {
    if explicit.is_some() || enhancement != EnhancementSelection::Local {
        return Ok(explicit);
    }
    ModelManager::new(model_commands::resolve_cache_root(cache_root.cloned())?)
        .model_directory("gemma-4-26b-a4b-it-4bit")
        .map(Some)
        .map_err(CliError::from)
}

fn enhance_result(
    result: TranscriptionResult,
    requested_language: &str,
    selection: EnhancementSelection,
    model_directory: Option<PathBuf>,
    progress: bool,
    mut on_progress: impl FnMut(ProgressEvent),
) -> CliResult<TranscriptionResult> {
    let mode = match selection {
        EnhancementSelection::Off => TranscriptEnhancementMode::disabled(),
        EnhancementSelection::Local => TranscriptEnhancementMode::gemma_mlx(model_directory, None),
        EnhancementSelection::Gemini => {
            TranscriptEnhancementMode::gemini_openrouter_from_environment()
        }
    };
    let locale = result
        .language
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| requested_language.to_owned())
        .replace('_', "-");
    let language = locale
        .split('-')
        .next()
        .filter(|value| !value.is_empty() && *value != "auto")
        .unwrap_or("und");
    if progress && selection != EnhancementSelection::Off {
        on_progress(ProgressEvent {
            phase: cuttledoc::ProgressPhase::Enhancing,
            completed: 0,
            total: Some(1),
            message: None,
        });
    }
    let result = apply_transcript_enhancement(
        result,
        mode,
        &TranscriptEnhancementContext::new(language, &locale),
        &CancellationToken::new(),
    )
    .map_err(CliError::from)?;
    if progress && selection != EnhancementSelection::Off {
        on_progress(ProgressEvent {
            phase: cuttledoc::ProgressPhase::Enhancing,
            completed: 1,
            total: Some(1),
            message: None,
        });
    }
    if let Some(enhancement) = &result.enhancement
        && let EnhancementOutcome::RawFallback { reason, detail } = &enhancement.outcome
    {
        eprintln!(
            "transcript enhancement used raw fallback: {} ({detail})",
            reason.as_str()
        );
    }
    Ok(result)
}

fn render_transcription_progress(progress: ProgressEvent) {
    eprintln!(
        "progress\t{}\t{}\t{}\t{}",
        progress.phase.as_str(),
        progress.completed,
        progress
            .total
            .map_or_else(|| "-".to_owned(), |total| total.to_string()),
        progress.message.as_deref().unwrap_or("-")
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn parser_accepts_supported_commands() {
        assert_eq!(parse(arguments(&[])), Ok(Command::Help));
        assert_eq!(
            parse(arguments(&["backends", "list"])),
            Ok(Command::ListBackends)
        );
        assert_eq!(
            parse(arguments(&["models", "cache-root"])),
            Ok(Command::Models(ModelCommand::CacheRoot {
                cache_root: None
            }))
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe",
                "speech.ogg",
                "--language",
                "de-DE",
                "--backend",
                "whisper",
                "--model-path",
                "/models/whisper.bin",
                "--ffmpeg-path",
                "/opt/ffmpeg"
            ])),
            Ok(Command::Transcribe {
                path: PathBuf::from("speech.ogg"),
                language: "de-DE".to_owned(),
                backend: BackendSelection::Id(BackendId::whisper()),
                model: None,
                model_path: Some(PathBuf::from("/models/whisper.bin")),
                cache_root: None,
                ffmpeg_path: Some(PathBuf::from("/opt/ffmpeg")),
                timeout_seconds: None,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
                progress: false,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe-pcm",
                "speech.f32le",
                "--language",
                "de-DE"
            ])),
            Ok(Command::TranscribePcm {
                path: PathBuf::from("speech.f32le"),
                language: "de-DE".to_owned(),
                backend: BackendSelection::Auto,
                model: None,
                model_path: None,
                cache_root: None,
                sample_rate: 16_000,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
                progress: false,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe-pcm",
                "speech.f32le",
                "--sample-rate",
                "48000",
                "--language",
                "en-US"
            ])),
            Ok(Command::TranscribePcm {
                path: PathBuf::from("speech.f32le"),
                language: "en-US".to_owned(),
                backend: BackendSelection::Auto,
                model: None,
                model_path: None,
                cache_root: None,
                sample_rate: 48_000,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
                progress: false,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe",
                "speech.ogg",
                "--language",
                "de-DE",
                "--enhance",
                "local",
                "--enhancement-model-path",
                "/models/gemma",
                "--json"
            ])),
            Ok(Command::Transcribe {
                path: PathBuf::from("speech.ogg"),
                language: "de-DE".to_owned(),
                backend: BackendSelection::Auto,
                model: None,
                model_path: None,
                cache_root: None,
                ffmpeg_path: None,
                timeout_seconds: None,
                enhancement: EnhancementSelection::Local,
                enhancement_model_path: Some(PathBuf::from("/models/gemma")),
                output: OutputOptions {
                    format: OutputFormat::Json,
                    path: None,
                    overwrite: false,
                },
                progress: false,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe",
                "speech.ogg",
                "--language",
                "en-US",
                "--format",
                "markdown",
                "--output",
                "transcript.md",
                "--force"
            ])),
            Ok(Command::Transcribe {
                path: PathBuf::from("speech.ogg"),
                language: "en-US".to_owned(),
                backend: BackendSelection::Auto,
                model: None,
                model_path: None,
                cache_root: None,
                ffmpeg_path: None,
                timeout_seconds: None,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions {
                    format: OutputFormat::Markdown,
                    path: Some(PathBuf::from("transcript.md")),
                    overwrite: true,
                },
                progress: false,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe",
                "speech.ogg",
                "--language",
                "auto",
                "--model",
                "whisper-large-v3-turbo",
                "--cache-root",
                "/models",
                "--progress"
            ])),
            Ok(Command::Transcribe {
                path: PathBuf::from("speech.ogg"),
                language: "auto".to_owned(),
                backend: BackendSelection::Auto,
                model: Some(ModelId::new("whisper-large-v3-turbo").expect("model ID")),
                model_path: None,
                cache_root: Some(PathBuf::from("/models")),
                ffmpeg_path: None,
                timeout_seconds: None,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
                progress: true,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe-batch",
                "/courses",
                "--recursive",
                "--backend",
                "whisper",
                "--model",
                "whisper-large-v3-turbo",
                "--format",
                "text",
                "--skip-existing",
                "--report",
                "/courses/report.json",
                "--progress",
                "--progress-format",
                "human"
            ])),
            Ok(Command::TranscribeBatch {
                root: PathBuf::from("/courses"),
                recursive: true,
                language: "auto".to_owned(),
                backend: BackendSelection::Id(BackendId::whisper()),
                model: Some(ModelId::new("whisper-large-v3-turbo").expect("model ID")),
                model_path: None,
                cache_root: None,
                ffmpeg_path: None,
                timeout_seconds: None,
                enhancement: EnhancementSelection::Off,
                output_format: OutputFormat::Text,
                overwrite: false,
                report_path: PathBuf::from("/courses/report.json"),
                progress: true,
                progress_format: ProgressFormat::Human,
            })
        );
        assert_eq!(
            parse(arguments(&[
                "transcribe",
                "speech.webm",
                "--language",
                "en-US",
                "--backend",
                "openai-transcription",
                "--model",
                "gpt-4o-mini-transcribe",
                "--timeout-seconds",
                "45"
            ])),
            Ok(Command::Transcribe {
                path: PathBuf::from("speech.webm"),
                language: "en-US".to_owned(),
                backend: BackendSelection::Id(BackendId::openai_transcription()),
                model: Some(ModelId::new("gpt-4o-mini-transcribe").expect("model ID")),
                model_path: None,
                cache_root: None,
                ffmpeg_path: None,
                timeout_seconds: Some(45),
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
                progress: false,
            })
        );
    }

    #[test]
    fn parser_rejects_invalid_commands() {
        assert!(HELP.contains("OPENAI_API_KEY"));
        assert!(!HELP.contains("--api-key"));
        assert!(parse(arguments(&["transcribe", "audio.wav"])).is_err());
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--ffmpeg-path",
                "/one",
                "--ffmpeg-path",
                "/two"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--backend",
                "openai-transcription",
                "--api-key",
                "secret"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--timeout-seconds",
                "30"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--backend",
                "openai-transcription",
                "--timeout-seconds",
                "0"
            ]))
            .is_err()
        );
        assert!(parse(arguments(&["transcribe-pcm", "speech.f32le"])).is_err());
        assert!(parse(arguments(&["transcribe-batch"])).is_err());
        assert!(
            parse(arguments(&[
                "transcribe-batch",
                "/courses",
                "--progress-format",
                "json"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-batch",
                "/courses",
                "--progress-format",
                "human",
                "--progress-format",
                "tsv"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-batch",
                "/courses",
                "--enhance",
                "local"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-batch",
                "/courses",
                "--skip-existing",
                "--force"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-pcm",
                "speech.f32le",
                "--language",
                "en-US",
                "--backend",
                ""
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-pcm",
                "speech.f32le",
                "--language",
                "en-US",
                "--sample-rate",
                "zero"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe-pcm",
                "speech.f32le",
                "--language",
                "en-US",
                "--sample-rate",
                "16000",
                "--sample-rate",
                "48000"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--enhance",
                "gemini",
                "--enhancement-model-path",
                "/models/gemma"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--enhance",
                "automatic"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--force"
            ]))
            .is_err()
        );
        assert!(
            parse(arguments(&[
                "transcribe",
                "audio.wav",
                "--language",
                "en-US",
                "--json",
                "--format",
                "json"
            ]))
            .is_err()
        );
    }

    #[test]
    fn custom_cache_root_resolves_managed_runtime_paths() {
        let cache_root = PathBuf::from("/srv/cuttledoc");
        assert_eq!(
            resolve_recognition_model_path(
                &BackendSelection::Id(BackendId::whisper()),
                None,
                None,
                Some(&cache_root),
            )
            .expect("Whisper path"),
            Some(PathBuf::from(
                "/srv/cuttledoc/models/whisper-large-v3-turbo/ggml-large-v3-turbo.bin"
            ))
        );
        assert_eq!(
            resolve_enhancement_model_path(EnhancementSelection::Local, None, Some(&cache_root),)
                .expect("Gemma path"),
            Some(PathBuf::from(
                "/srv/cuttledoc/models/gemma-4-26b-a4b-it-4bit"
            ))
        );
        assert_eq!(
            resolve_recognition_model_path(&BackendSelection::Auto, None, None, Some(&cache_root),)
                .expect("automatic path"),
            None
        );
    }

    #[test]
    fn default_cache_root_resolves_managed_runtime_paths() {
        let whisper = resolve_recognition_model_path(
            &BackendSelection::Id(BackendId::whisper()),
            None,
            None,
            None,
        )
        .expect("default Whisper path")
        .expect("Whisper model path");
        assert!(whisper.ends_with("models/whisper-large-v3-turbo/ggml-large-v3-turbo.bin"));

        let gemma = resolve_enhancement_model_path(EnhancementSelection::Local, None, None)
            .expect("default Gemma path")
            .expect("Gemma model path");
        assert!(gemma.ends_with("models/gemma-4-26b-a4b-it-4bit"));
    }
}
