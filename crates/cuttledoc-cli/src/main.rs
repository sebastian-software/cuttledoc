use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use cuttledoc::{
    AudioFormat, Availability, BackendId, BackendSelection, CancellationToken, EnhancementOutcome,
    MediaDecodeOptions, PcmBuffer, TranscribeOptions, TranscriptEnhancementContext,
    TranscriptEnhancementMode, TranscriptionResult, apply_transcript_enhancement,
    recognition_asset_inventory, recognition_capabilities, text_generation_capabilities,
    transcribe_file, transcribe_pcm,
};

mod output;

use output::{OutputFormat, OutputOptions, emit_result};

const HELP: &str = "\
Cuttledoc speech and text processing

Usage:
  cuttledoc --help
  cuttledoc --version
  cuttledoc backends list
  cuttledoc transcribe <path> --language <tag|auto> [--backend <id|auto>] [--model-path <path>] [--ffmpeg-path <path>] [--enhance <off|local|gemini>] [--enhancement-model-path <path>] [--format <text|markdown|json>] [--output <path>] [--force]
  cuttledoc transcribe-pcm <path> --language <tag|auto> [--backend <id|auto>] [--model-path <path>] [--sample-rate <hz>] [--enhance <off|local|gemini>] [--enhancement-model-path <path>] [--format <text|markdown|json>] [--output <path>] [--force]

transcribe accepts media supported by the configured or system FFmpeg and
decodes it conservatively to mono 16000 Hz PCM. transcribe-pcm bypasses media
decoding and accepts mono little-endian f32 PCM. Enhancement defaults to off
until the ADR-0014 32 GB host gate is complete. Gemini reads OPENROUTER_API_KEY
only after transcription has released its recognition runtime.
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
    model_path: Option<PathBuf>,
    output_format: Option<OutputFormat>,
    output_path: Option<PathBuf>,
    overwrite: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Command {
    Help,
    Version,
    ListBackends,
    Transcribe {
        path: PathBuf,
        language: String,
        backend: BackendSelection,
        model_path: Option<PathBuf>,
        ffmpeg_path: Option<PathBuf>,
        enhancement: EnhancementSelection,
        enhancement_model_path: Option<PathBuf>,
        output: OutputOptions,
    },
    TranscribePcm {
        path: PathBuf,
        language: String,
        backend: BackendSelection,
        model_path: Option<PathBuf>,
        sample_rate: u32,
        enhancement: EnhancementSelection,
        enhancement_model_path: Option<PathBuf>,
        output: OutputOptions,
    },
}

fn main() -> ExitCode {
    match parse(env::args().skip(1)) {
        Ok(command) => match run(command) {
            Ok(()) => ExitCode::SUCCESS,
            Err(message) => {
                eprintln!("{message}");
                ExitCode::FAILURE
            }
        },
        Err(message) => {
            eprintln!("{message}\n\n{HELP}");
            ExitCode::from(2)
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
        [command, rest @ ..] if command == "transcribe" => parse_transcribe(rest),
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
    let (enhancement, enhancement_model_path, output) =
        finish_shared_transcription_arguments(shared_arguments)?;
    Ok(Command::Transcribe {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe requires --language <tag>")?,
        backend: backend.unwrap_or_default(),
        model_path,
        ffmpeg_path,
        enhancement,
        enhancement_model_path,
        output,
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
    let (enhancement, enhancement_model_path, output) =
        finish_shared_transcription_arguments(shared_arguments)?;
    Ok(Command::TranscribePcm {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe-pcm requires --language <tag>")?,
        backend: backend.unwrap_or_default(),
        model_path,
        sample_rate: sample_rate.unwrap_or(16_000),
        enhancement,
        enhancement_model_path,
        output,
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
            if parsed.model_path.replace(PathBuf::from(value)).is_some() {
                return Err("--enhancement-model-path may only be specified once".to_owned());
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
        _ => Ok(None),
    }
}

fn finish_shared_transcription_arguments(
    parsed: SharedTranscriptionArguments,
) -> Result<(EnhancementSelection, Option<PathBuf>, OutputOptions), String> {
    let selection = parsed.selection.unwrap_or_default();
    if parsed.model_path.is_some() && selection != EnhancementSelection::Local {
        return Err("--enhancement-model-path requires --enhance local".to_owned());
    }
    if parsed.overwrite && parsed.output_path.is_none() {
        return Err("--force requires --output".to_owned());
    }
    Ok((
        selection,
        parsed.model_path,
        OutputOptions {
            format: parsed.output_format.unwrap_or_default(),
            path: parsed.output_path,
            overwrite: parsed.overwrite,
        },
    ))
}

fn run(command: Command) -> Result<(), String> {
    match command {
        Command::Help => print!("{HELP}"),
        Command::Version => println!("cuttledoc {}", cuttledoc::VERSION),
        Command::ListBackends => {
            for capability in recognition_capabilities() {
                match capability.availability {
                    Availability::Available => {
                        match recognition_asset_inventory(&capability.backend) {
                            Ok(inventory) => println!(
                                "{}\tavailable\tlanguages={}\tlocales={}\tinstalled={}\treserved={}\treservation_limit={}",
                                capability.backend,
                                capability.languages.len(),
                                inventory.supported_locales.len(),
                                inventory.installed_locales.len(),
                                inventory.reserved_locales.len(),
                                inventory.maximum_reserved_locales
                            ),
                            Err(error) => println!(
                                "{}\tavailable\tinventory_error={}",
                                capability.backend, error
                            ),
                        }
                    }
                    Availability::Unavailable { reason, detail, .. } => {
                        println!(
                            "{}\tunavailable\t{}\t{}",
                            capability.backend,
                            reason.as_str(),
                            detail
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
        Command::Transcribe {
            path,
            language,
            backend,
            model_path,
            ffmpeg_path,
            enhancement,
            enhancement_model_path,
            output,
        } => {
            let result = transcribe_file(
                &path,
                &TranscribeOptions {
                    backend,
                    language: Some(language.clone()),
                    model_path,
                    ..TranscribeOptions::default()
                },
                &MediaDecodeOptions { ffmpeg_path },
            )
            .map_err(|error| error.to_string())?;
            let result = enhance_result(result, &language, enhancement, enhancement_model_path)?;
            emit_result(&result, &output)?;
        }
        Command::TranscribePcm {
            path,
            language,
            backend,
            model_path,
            sample_rate,
            enhancement,
            enhancement_model_path,
            output,
        } => {
            let bytes = fs::read(&path)
                .map_err(|error| format!("could not read {}: {error}", path.display()))?;
            let format = AudioFormat::new(sample_rate, 1).map_err(|error| error.to_string())?;
            let input =
                PcmBuffer::from_f32le_bytes(format, &bytes).map_err(|error| error.to_string())?;
            let result = transcribe_pcm(
                &input,
                &TranscribeOptions {
                    backend,
                    language: Some(language.clone()),
                    model_path,
                    ..TranscribeOptions::default()
                },
            )
            .map_err(|error| error.to_string())?;
            let result = enhance_result(result, &language, enhancement, enhancement_model_path)?;
            emit_result(&result, &output)?;
        }
    }
    Ok(())
}

fn enhance_result(
    result: TranscriptionResult,
    requested_language: &str,
    selection: EnhancementSelection,
    model_directory: Option<PathBuf>,
) -> Result<TranscriptionResult, String> {
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
    let result = apply_transcript_enhancement(
        result,
        mode,
        &TranscriptEnhancementContext::new(language, &locale),
        &CancellationToken::new(),
    )
    .map_err(|error| error.to_string())?;
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
                model_path: Some(PathBuf::from("/models/whisper.bin")),
                ffmpeg_path: Some(PathBuf::from("/opt/ffmpeg")),
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
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
                model_path: None,
                sample_rate: 16_000,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
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
                model_path: None,
                sample_rate: 48_000,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions::default(),
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
                model_path: None,
                ffmpeg_path: None,
                enhancement: EnhancementSelection::Local,
                enhancement_model_path: Some(PathBuf::from("/models/gemma")),
                output: OutputOptions {
                    format: OutputFormat::Json,
                    path: None,
                    overwrite: false,
                },
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
                model_path: None,
                ffmpeg_path: None,
                enhancement: EnhancementSelection::Off,
                enhancement_model_path: None,
                output: OutputOptions {
                    format: OutputFormat::Markdown,
                    path: Some(PathBuf::from("transcript.md")),
                    overwrite: true,
                },
            })
        );
    }

    #[test]
    fn parser_rejects_invalid_commands() {
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
        assert!(parse(arguments(&["transcribe-pcm", "speech.f32le"])).is_err());
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
}
