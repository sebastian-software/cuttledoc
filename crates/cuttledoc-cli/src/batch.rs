use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use cuttledoc::TranscriptionResult;
use serde_json::json;

use crate::cli_error::{CliError, CliResult};
use crate::output::{OutputFormat, OutputOptions, emit_result, validate_output, write_atomic_file};

const REPORT_SCHEMA_VERSION: &str = "1.0.0";
const MEDIA_EXTENSIONS: &[&str] = &[
    "aac", "flac", "m4a", "mkv", "mov", "mp3", "mp4", "oga", "ogg", "opus", "wav", "webm",
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchOptions {
    pub root: PathBuf,
    pub recursive: bool,
    pub format: OutputFormat,
    pub overwrite: bool,
    pub report_path: PathBuf,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchItem {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchPlan {
    pub root: PathBuf,
    pub pending: Vec<BatchItem>,
    pub skipped: Vec<BatchItem>,
    pub overwrite: bool,
    pub format: OutputFormat,
    pub report_path: PathBuf,
}

impl BatchPlan {
    pub fn discovered(&self) -> usize {
        self.pending.len() + self.skipped.len()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchFailure {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchCompletion {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub language: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchSummary {
    pub discovered: usize,
    pub completions: Vec<BatchCompletion>,
    pub skipped: Vec<BatchItem>,
    pub failures: Vec<BatchFailure>,
    pub elapsed: Duration,
    pub report_path: PathBuf,
}

impl BatchSummary {
    pub fn completed(&self) -> usize {
        self.completions.len()
    }

    pub fn skipped(&self) -> usize {
        self.skipped.len()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BatchEvent {
    Starting {
        index: usize,
        total: usize,
        item: BatchItem,
    },
    Completed {
        index: usize,
        total: usize,
        item: BatchItem,
        language: Option<String>,
    },
    Failed {
        index: usize,
        total: usize,
        failure: BatchFailure,
    },
}

pub fn plan_batch(options: BatchOptions) -> CliResult<BatchPlan> {
    if !options.root.is_dir() {
        return Err(CliError::new(
            "INPUT_DIRECTORY_INVALID",
            format!(
                "batch input is not a readable directory: {}",
                options.root.display()
            ),
            1,
        ));
    }
    validate_output(&OutputOptions {
        format: OutputFormat::Json,
        path: Some(options.report_path.clone()),
        overwrite: true,
    })?;
    let inputs = discover_media_files(&options.root, options.recursive)?;
    let mut outputs = HashMap::<PathBuf, PathBuf>::new();
    let mut pending = Vec::new();
    let mut skipped = Vec::new();
    for input_path in inputs {
        let output_path = sidecar_path(&input_path, options.format)?;
        if let Some(previous) = outputs.insert(output_path.clone(), input_path.clone()) {
            return Err(CliError::new(
                "BATCH_OUTPUT_COLLISION",
                format!(
                    "{} and {} resolve to the same sidecar {}",
                    previous.display(),
                    input_path.display(),
                    output_path.display()
                ),
                1,
            )
            .with_remediation("remove or rename one input before running the batch"));
        }
        let item = BatchItem {
            input_path,
            output_path,
        };
        if item.output_path.exists() && !options.overwrite {
            skipped.push(item);
        } else {
            pending.push(item);
        }
    }
    Ok(BatchPlan {
        root: options.root,
        pending,
        skipped,
        overwrite: options.overwrite,
        format: options.format,
        report_path: options.report_path,
    })
}

pub fn execute_batch(
    plan: BatchPlan,
    started_at: Instant,
    mut process: impl FnMut(&Path) -> CliResult<TranscriptionResult>,
    mut on_event: impl FnMut(BatchEvent),
) -> CliResult<BatchSummary> {
    let total = plan.pending.len();
    let mut completions = Vec::new();
    let mut failures = Vec::new();

    for (position, item) in plan.pending.iter().enumerate() {
        let index = position + 1;
        on_event(BatchEvent::Starting {
            index,
            total,
            item: item.clone(),
        });
        let outcome = process(&item.input_path).and_then(|result| {
            emit_result(
                &result,
                &OutputOptions {
                    format: plan.format,
                    path: Some(item.output_path.clone()),
                    overwrite: plan.overwrite,
                },
            )?;
            Ok(result.language)
        });
        match outcome {
            Ok(language) => {
                completions.push(BatchCompletion {
                    input_path: item.input_path.clone(),
                    output_path: item.output_path.clone(),
                    language: language.clone(),
                });
                on_event(BatchEvent::Completed {
                    index,
                    total,
                    item: item.clone(),
                    language,
                });
            }
            Err(error) => {
                let failure = BatchFailure {
                    input_path: item.input_path.clone(),
                    output_path: item.output_path.clone(),
                    code: error.code.to_owned(),
                    message: error.message,
                };
                on_event(BatchEvent::Failed {
                    index,
                    total,
                    failure: failure.clone(),
                });
                failures.push(failure);
            }
        }
    }

    let summary = BatchSummary {
        discovered: plan.discovered(),
        completions,
        skipped: plan.skipped,
        failures,
        elapsed: started_at.elapsed(),
        report_path: plan.report_path,
    };
    write_report(&summary)?;
    Ok(summary)
}

fn discover_media_files(root: &Path, recursive: bool) -> CliResult<Vec<PathBuf>> {
    let mut directories = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(directory) = directories.pop() {
        let entries = fs::read_dir(&directory).map_err(|error| {
            CliError::new(
                "BATCH_DISCOVERY_FAILED",
                format!("could not read {}: {error}", directory.display()),
                1,
            )
        })?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                CliError::new(
                    "BATCH_DISCOVERY_FAILED",
                    format!(
                        "could not read an entry in {}: {error}",
                        directory.display()
                    ),
                    1,
                )
            })?;
            let file_type = entry.file_type().map_err(|error| {
                CliError::new(
                    "BATCH_DISCOVERY_FAILED",
                    format!("could not inspect {}: {error}", entry.path().display()),
                    1,
                )
            })?;
            if file_type.is_dir() {
                if recursive {
                    directories.push(entry.path());
                }
            } else if file_type.is_file() && is_media_path(&entry.path()) {
                files.push(entry.path());
            }
        }
    }
    files.sort();
    Ok(files)
}

fn is_media_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            let extension = extension.to_ascii_lowercase();
            MEDIA_EXTENSIONS.contains(&extension.as_str())
        })
}

fn sidecar_path(input: &Path, format: OutputFormat) -> CliResult<PathBuf> {
    if input.file_stem().is_none() {
        return Err(CliError::new(
            "OUTPUT_PATH_INVALID",
            format!("input has no usable file name: {}", input.display()),
            1,
        ));
    }
    Ok(match format {
        OutputFormat::Text => input.with_extension("txt"),
        OutputFormat::Markdown => input.with_extension("transcript.md"),
        OutputFormat::Json => input.with_extension("transcript.json"),
    })
}

fn write_report(summary: &BatchSummary) -> CliResult<()> {
    let completions = summary
        .completions
        .iter()
        .map(|completion| {
            json!({
                "input": completion.input_path.to_string_lossy(),
                "output": completion.output_path.to_string_lossy(),
                "language": completion.language,
            })
        })
        .collect::<Vec<_>>();
    let skipped = summary
        .skipped
        .iter()
        .map(|item| {
            json!({
                "input": item.input_path.to_string_lossy(),
                "output": item.output_path.to_string_lossy(),
            })
        })
        .collect::<Vec<_>>();
    let failures = summary
        .failures
        .iter()
        .map(|failure| {
            json!({
                "input": failure.input_path.to_string_lossy(),
                "output": failure.output_path.to_string_lossy(),
                "code": failure.code,
                "message": failure.message,
            })
        })
        .collect::<Vec<_>>();
    let report = json!({
        "schema_version": REPORT_SCHEMA_VERSION,
        "kind": "transcription_batch_report",
        "generated_at_unix_ms": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        "discovered": summary.discovered,
        "completed": summary.completed(),
        "skipped": summary.skipped(),
        "failed": summary.failures.len(),
        "elapsed_ms": summary.elapsed.as_secs_f64() * 1_000.0,
        "results": completions,
        "skipped_results": skipped,
        "failures": failures,
    });
    let mut encoded = serde_json::to_vec_pretty(&report).map_err(|error| {
        CliError::new(
            "OUTPUT_ENCODING_FAILED",
            format!("could not encode the batch report: {error}"),
            1,
        )
    })?;
    encoded.push(b'\n');
    write_atomic_file(&summary.report_path, &encoded, true)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use cuttledoc::{BackendId, TranscriptionResult};

    use super::*;

    fn temporary_directory(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "cuttledoc-batch-{name}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("temporary directory");
        directory
    }

    fn transcription(text: &str, language: &str) -> TranscriptionResult {
        TranscriptionResult {
            raw_text: text.to_owned(),
            text: text.to_owned(),
            language: Some(language.to_owned()),
            backend: BackendId::whisper(),
            model: None,
            media_duration: Duration::from_secs(1),
            processing_duration: Duration::from_millis(10),
            segments: Vec::new(),
            enhancement: None,
        }
    }

    #[test]
    fn recursive_planning_discovers_supported_media_in_stable_order() {
        let root = temporary_directory("discover");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).expect("nested directory");
        fs::write(root.join("b.MP4"), b"media").expect("media");
        fs::write(root.join("ignore.txt"), b"text").expect("text");
        fs::write(nested.join("a.mp3"), b"media").expect("media");

        let shallow = plan_batch(BatchOptions {
            root: root.clone(),
            recursive: false,
            format: OutputFormat::Text,
            overwrite: false,
            report_path: root.join(".report.json"),
        })
        .expect("shallow plan");
        assert_eq!(shallow.discovered(), 1);

        let recursive = plan_batch(BatchOptions {
            root: root.clone(),
            recursive: true,
            format: OutputFormat::Text,
            overwrite: false,
            report_path: root.join(".report.json"),
        })
        .expect("recursive plan");
        assert_eq!(
            recursive
                .pending
                .iter()
                .map(|item| item.input_path.clone())
                .collect::<Vec<_>>(),
            vec![root.join("b.MP4"), nested.join("a.mp3")]
        );
        assert_eq!(recursive.pending[0].output_path, root.join("b.txt"));
        assert_eq!(recursive.pending[1].output_path, nested.join("a.txt"));
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn existing_sidecars_are_resumable_unless_force_is_selected() {
        let root = temporary_directory("resume");
        fs::write(root.join("lesson.mp4"), b"media").expect("media");
        fs::write(root.join("lesson.txt"), b"existing").expect("sidecar");
        let options = BatchOptions {
            root: root.clone(),
            recursive: true,
            format: OutputFormat::Text,
            overwrite: false,
            report_path: root.join(".report.json"),
        };

        let skipped = plan_batch(options.clone()).expect("skipped plan");
        assert_eq!(skipped.skipped.len(), 1);
        assert!(skipped.pending.is_empty());
        let summary = execute_batch(
            skipped,
            Instant::now(),
            |_| panic!("a skipped item must not be transcribed"),
            |_| {},
        )
        .expect("resume summary");
        assert_eq!(summary.skipped(), 1);
        let report: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join(".report.json")).expect("resume report"))
                .expect("valid resume report");
        assert_eq!(report["skipped"], 1);
        assert_eq!(
            report["skipped_results"][0]["output"],
            root.join("lesson.txt").to_string_lossy().as_ref()
        );

        let forced = plan_batch(BatchOptions {
            overwrite: true,
            ..options
        })
        .expect("forced plan");
        assert_eq!(forced.pending.len(), 1);
        assert!(forced.skipped.is_empty());
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn output_collisions_fail_before_any_transcription() {
        let root = temporary_directory("collision");
        fs::write(root.join("lesson.mp4"), b"media").expect("media");
        fs::write(root.join("lesson.wav"), b"media").expect("media");
        let error = plan_batch(BatchOptions {
            root: root.clone(),
            recursive: true,
            format: OutputFormat::Text,
            overwrite: false,
            report_path: root.join(".report.json"),
        })
        .expect_err("collision");
        assert_eq!(error.code, "BATCH_OUTPUT_COLLISION");
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn execution_continues_after_failure_and_writes_an_atomic_report() {
        let root = temporary_directory("execute");
        fs::write(root.join("bad.mp4"), b"media").expect("media");
        fs::write(root.join("good.mp4"), b"media").expect("media");
        let report_path = root.join(".cuttledoc-batch-report.json");
        let plan = plan_batch(BatchOptions {
            root: root.clone(),
            recursive: true,
            format: OutputFormat::Text,
            overwrite: false,
            report_path: report_path.clone(),
        })
        .expect("plan");
        let mut events = Vec::new();

        let summary = execute_batch(
            plan,
            Instant::now(),
            |path| {
                if path.ends_with("bad.mp4") {
                    Err(CliError::new("TRANSCRIPTION_FAILED", "broken", 1))
                } else {
                    Ok(transcription("hello", "en"))
                }
            },
            |event| events.push(event),
        )
        .expect("batch summary");

        assert_eq!(summary.completed(), 1);
        assert_eq!(summary.completions[0].language.as_deref(), Some("en"));
        assert_eq!(summary.skipped(), 0);
        assert_eq!(summary.failures.len(), 1);
        assert_eq!(
            fs::read_to_string(root.join("good.txt")).expect("sidecar"),
            "hello\n"
        );
        let report = fs::read_to_string(report_path).expect("report");
        assert!(report.contains("\"failed\": 1"));
        assert!(report.contains("TRANSCRIPTION_FAILED"));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, BatchEvent::Starting { .. }))
                .count(),
            2
        );
        fs::remove_dir_all(root).expect("remove temporary directory");
    }
}
