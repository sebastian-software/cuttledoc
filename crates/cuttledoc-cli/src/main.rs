use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use cuttledoc::{
    AudioFormat, Availability, PcmBuffer, TranscribeOptions, recognition_asset_inventory,
    recognition_capabilities, transcribe_pcm,
};

const HELP: &str = "\
Cuttledoc speech and text processing

Usage:
  cuttledoc --help
  cuttledoc --version
  cuttledoc backends list
  cuttledoc transcribe-pcm <path> --language <tag> [--sample-rate <hz>]

transcribe-pcm accepts mono little-endian f32 PCM. The sample rate defaults to
16000 Hz. General audio and video decoding arrives in a later phase.
";

#[derive(Clone, Debug, Eq, PartialEq)]
enum Command {
    Help,
    Version,
    ListBackends,
    TranscribePcm {
        path: PathBuf,
        language: String,
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
        [command, rest @ ..] if command == "transcribe-pcm" => parse_transcribe_pcm(rest),
        _ => Err(format!("unsupported arguments: {}", arguments.join(" "))),
    }
}

fn parse_transcribe_pcm(arguments: &[String]) -> Result<Command, String> {
    let Some(path) = arguments.first().filter(|value| !value.starts_with('-')) else {
        return Err("transcribe-pcm requires an input path".to_owned());
    };
    let mut language = None;
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
            option => return Err(format!("unsupported transcribe-pcm option: {option}")),
        }
    }
    Ok(Command::TranscribePcm {
        path: PathBuf::from(path),
        language: language.ok_or("transcribe-pcm requires --language <tag>")?,
        sample_rate: sample_rate.unwrap_or(16_000),
    })
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
        Command::TranscribePcm {
            path,
            language,
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
                    language: Some(language),
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
    fn parser_accepts_the_scaffold_commands() {
        assert_eq!(parse(arguments(&[])), Ok(Command::Help));
        assert_eq!(
            parse(arguments(&["backends", "list"])),
            Ok(Command::ListBackends)
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
                sample_rate: 48_000,
            })
        );
    }

    #[test]
    fn parser_rejects_unimplemented_commands() {
        assert!(parse(arguments(&["transcribe", "audio.wav"])).is_err());
        assert!(parse(arguments(&["transcribe-pcm", "speech.f32le"])).is_err());
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
