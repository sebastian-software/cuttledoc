use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use cuttledoc::{
    AudioFormat, Availability, BackendId, BackendSelection, MediaDecodeOptions, PcmBuffer,
    TranscribeOptions, recognition_asset_inventory, recognition_capabilities, transcribe_file,
    transcribe_pcm,
};

const HELP: &str = "\
Cuttledoc speech and text processing

Usage:
  cuttledoc --help
  cuttledoc --version
  cuttledoc backends list
  cuttledoc transcribe <path> --language <tag|auto> [--backend <id|auto>] [--model-path <path>] [--ffmpeg-path <path>]
  cuttledoc transcribe-pcm <path> --language <tag|auto> [--backend <id|auto>] [--model-path <path>] [--sample-rate <hz>]

transcribe accepts media supported by the configured or system FFmpeg and
decodes it conservatively to mono 16000 Hz PCM. transcribe-pcm bypasses media
decoding and accepts mono little-endian f32 PCM.
";

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
    },
    TranscribePcm {
        path: PathBuf,
        language: String,
        backend: BackendSelection,
        model_path: Option<PathBuf>,
        sample_rate: u32,
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
    let mut index = 1;
    while index < arguments.len() {
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
    Ok(Command::Transcribe {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe requires --language <tag>")?,
        backend: backend.unwrap_or_default(),
        model_path,
        ffmpeg_path,
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
    let mut index = 1;
    while index < arguments.len() {
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
    Ok(Command::TranscribePcm {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe-pcm requires --language <tag>")?,
        backend: backend.unwrap_or_default(),
        model_path,
        sample_rate: sample_rate.unwrap_or(16_000),
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
        }
        Command::Transcribe {
            path,
            language,
            backend,
            model_path,
            ffmpeg_path,
        } => {
            let result = transcribe_file(
                &path,
                &TranscribeOptions {
                    backend,
                    language: Some(language),
                    model_path,
                    ..TranscribeOptions::default()
                },
                &MediaDecodeOptions { ffmpeg_path },
            )
            .map_err(|error| error.to_string())?;
            println!("{}", result.text);
        }
        Command::TranscribePcm {
            path,
            language,
            backend,
            model_path,
            sample_rate,
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
                    language: Some(language),
                    model_path,
                    ..TranscribeOptions::default()
                },
            )
            .map_err(|error| error.to_string())?;
            println!("{}", result.text);
        }
    }
    Ok(())
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
    }
}
