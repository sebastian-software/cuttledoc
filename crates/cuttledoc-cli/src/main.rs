use std::env;
use std::process::ExitCode;

use cuttledoc::{Availability, recognition_asset_inventory, recognition_capabilities};

const HELP: &str = "\
Cuttledoc speech and text processing

Usage:
  cuttledoc --help
  cuttledoc --version
  cuttledoc backends list

Transcription commands arrive with the first local ASR vertical slice.
";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Command {
    Help,
    Version,
    ListBackends,
}

fn main() -> ExitCode {
    match parse(env::args().skip(1)) {
        Ok(command) => {
            run(command);
            ExitCode::SUCCESS
        }
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
        _ => Err(format!("unsupported arguments: {}", arguments.join(" "))),
    }
}

fn run(command: Command) {
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
    }
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
    }

    #[test]
    fn parser_rejects_unimplemented_commands() {
        let error = parse(arguments(&["transcribe", "audio.wav"]))
            .expect_err("unimplemented command must fail");
        assert!(error.contains("transcribe audio.wav"));
    }
}
