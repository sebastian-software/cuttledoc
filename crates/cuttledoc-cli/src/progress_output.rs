use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use cuttledoc::{ProgressEvent, ProgressPhase};

use crate::batch::{BatchEvent, BatchSummary};

const HUMAN_FILE_WIDTH: usize = 52;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum ProgressFormat {
    #[default]
    Auto,
    Human,
    Tsv,
}

impl ProgressFormat {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "auto" => Ok(Self::Auto),
            "human" => Ok(Self::Human),
            "tsv" => Ok(Self::Tsv),
            _ => Err("--progress-format requires auto, human, or tsv".to_owned()),
        }
    }

    fn resolve(self, terminal: bool) -> ResolvedProgressFormat {
        match self {
            Self::Auto if terminal => ResolvedProgressFormat::Human,
            Self::Auto | Self::Tsv => ResolvedProgressFormat::Tsv,
            Self::Human => ResolvedProgressFormat::Human,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ResolvedProgressFormat {
    Human,
    Tsv,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ActiveFile {
    index: usize,
    total: usize,
    name: String,
    phase: ProgressPhase,
    language: Option<String>,
}

pub struct BatchProgressRenderer<W: Write> {
    writer: W,
    format: ResolvedProgressFormat,
    interactive: bool,
    root: PathBuf,
    active: Option<ActiveFile>,
    completed: usize,
    failed: usize,
    loading_shown: bool,
}

impl BatchProgressRenderer<io::Stderr> {
    pub fn stderr(root: &Path, format: ProgressFormat) -> Self {
        let writer = io::stderr();
        let terminal =
            writer.is_terminal() && std::env::var_os("TERM").is_none_or(|term| term != "dumb");
        Self::new(writer, root, format, terminal)
    }
}

impl<W: Write> BatchProgressRenderer<W> {
    fn new(writer: W, root: &Path, format: ProgressFormat, terminal: bool) -> Self {
        Self {
            writer,
            format: format.resolve(terminal),
            interactive: terminal,
            root: root.to_path_buf(),
            active: None,
            completed: 0,
            failed: 0,
            loading_shown: false,
        }
    }

    pub fn discovered(&mut self, discovered: usize, pending: usize, skipped: usize) {
        match self.format {
            ResolvedProgressFormat::Tsv => {
                let _ = writeln!(
                    self.writer,
                    "batch\tdiscovered\t{discovered}\tpending={pending}\tskipped={skipped}"
                );
            }
            ResolvedProgressFormat::Human => {
                let skipped = if skipped == 0 {
                    String::new()
                } else {
                    format!(" · {} already done", human_count(skipped))
                };
                let _ = writeln!(
                    self.writer,
                    "Found {} media {} · {} remaining{skipped}",
                    human_count(discovered),
                    if discovered == 1 { "file" } else { "files" },
                    human_count(pending),
                );
            }
        }
    }

    pub fn loading(&mut self, completed: bool) {
        match self.format {
            ResolvedProgressFormat::Tsv => {
                let _ = writeln!(
                    self.writer,
                    "batch\tloading\t{}\t1\trecognition-runtime",
                    usize::from(completed)
                );
            }
            ResolvedProgressFormat::Human if completed => {
                self.loading_shown = true;
                self.status_line("Speech recognition model ready.");
            }
            ResolvedProgressFormat::Human if !self.loading_shown => {
                self.loading_shown = true;
                self.status_line("Loading speech recognition model…");
            }
            ResolvedProgressFormat::Human => {}
        }
    }

    pub fn transcription_progress(&mut self, progress: ProgressEvent) {
        if self.format == ResolvedProgressFormat::Tsv {
            let _ = writeln!(
                self.writer,
                "progress\t{}\t{}\t{}\t{}",
                progress.phase.as_str(),
                progress.completed,
                progress
                    .total
                    .map_or_else(|| "-".to_owned(), |total| total.to_string()),
                progress.message.as_deref().unwrap_or("-")
            );
            return;
        }

        if progress.phase == ProgressPhase::Loading {
            self.loading(progress.completed > 0);
            return;
        }
        let Some(active) = &mut self.active else {
            return;
        };
        active.phase = progress.phase;
        if self.interactive {
            self.render_active();
        }
    }

    pub fn batch_event(&mut self, event: BatchEvent) {
        if self.format == ResolvedProgressFormat::Tsv {
            self.render_tsv_batch_event(event);
            return;
        }

        match event {
            BatchEvent::Starting { index, total, item } => {
                self.active = Some(ActiveFile {
                    index,
                    total,
                    name: human_file_name(&self.root, &item.input_path),
                    phase: ProgressPhase::Preparing,
                    language: None,
                });
                self.render_active();
            }
            BatchEvent::Completed {
                index,
                total,
                item,
                language,
            } => {
                self.completed += 1;
                self.active = Some(ActiveFile {
                    index,
                    total,
                    name: human_file_name(&self.root, &item.output_path),
                    phase: ProgressPhase::Finalizing,
                    language,
                });
                if self.interactive {
                    self.render_active();
                } else {
                    self.write_completed_line();
                }
            }
            BatchEvent::Failed {
                index,
                total,
                failure,
            } => {
                self.failed += 1;
                self.clear_status_line();
                let message = compact_text(&failure.message, 100);
                let _ = writeln!(
                    self.writer,
                    "Failed {}/{} · {} · {}",
                    human_count(index),
                    human_count(total),
                    human_file_name(&self.root, &failure.input_path),
                    message
                );
                self.active = None;
            }
        }
    }

    pub fn summary(&mut self, summary: &BatchSummary) {
        if self.format == ResolvedProgressFormat::Tsv {
            let _ = writeln!(
                self.writer,
                "batch\tsummary\tcompleted={}\tskipped={}\tfailed={}\telapsed_ms={:.3}\treport={}",
                summary.completed(),
                summary.skipped(),
                summary.failures.len(),
                summary.elapsed.as_secs_f64() * 1_000.0,
                summary.report_path.display()
            );
            return;
        }

        self.clear_status_line();
        let _ = writeln!(
            self.writer,
            "Finished: {} transcribed · {} skipped · {} failed · {}",
            human_count(summary.completed()),
            human_count(summary.skipped()),
            human_count(summary.failures.len()),
            human_duration(summary.elapsed)
        );
        let _ = writeln!(self.writer, "Report: {}", summary.report_path.display());
        self.active = None;
    }

    fn render_tsv_batch_event(&mut self, event: BatchEvent) {
        match event {
            BatchEvent::Starting { index, total, item } => {
                let _ = writeln!(
                    self.writer,
                    "batch\ttranscribing\t{index}\t{total}\t{}",
                    item.input_path.display()
                );
            }
            BatchEvent::Completed {
                index,
                total,
                item,
                language,
            } => {
                let _ = writeln!(
                    self.writer,
                    "batch\tcompleted\t{index}\t{total}\t{}\tlanguage={}",
                    item.output_path.display(),
                    language.as_deref().unwrap_or("und")
                );
            }
            BatchEvent::Failed {
                index,
                total,
                failure,
            } => {
                let _ = writeln!(
                    self.writer,
                    "batch\tfailed\t{index}\t{total}\t{}\tcode={}\t{}",
                    failure.input_path.display(),
                    failure.code,
                    failure.message.replace(['\r', '\n', '\t'], " ")
                );
            }
        }
    }

    fn render_active(&mut self) {
        let Some(active) = &self.active else {
            return;
        };
        let percent = if active.total == 0 {
            100.0
        } else {
            (active.index as f64 / active.total as f64) * 100.0
        };
        let language = active
            .language
            .as_deref()
            .map_or_else(String::new, |language| format!(" · {language}"));
        let line = format!(
            "[{}/{} · {percent:.1}%] {} · {} · {} done · {} failed{language}",
            human_count(active.index),
            human_count(active.total),
            human_phase(active.phase),
            active.name,
            human_count(self.completed),
            human_count(self.failed),
        );
        if self.interactive {
            let _ = write!(self.writer, "\r\u{1b}[2K{line}");
            let _ = self.writer.flush();
        } else {
            let _ = writeln!(self.writer, "{line}");
        }
    }

    fn write_completed_line(&mut self) {
        let Some(active) = &self.active else {
            return;
        };
        let language = active.language.as_deref().unwrap_or("und");
        let _ = writeln!(
            self.writer,
            "Completed {}/{} · {} · {language}",
            human_count(active.index),
            human_count(active.total),
            active.name
        );
    }

    fn status_line(&mut self, message: &str) {
        if self.interactive {
            let _ = write!(self.writer, "\r\u{1b}[2K{message}");
            let _ = self.writer.flush();
        } else {
            let _ = writeln!(self.writer, "{message}");
        }
    }

    fn clear_status_line(&mut self) {
        if self.interactive {
            let _ = write!(self.writer, "\r\u{1b}[2K");
            let _ = self.writer.flush();
        }
    }

    #[cfg(test)]
    fn into_writer(self) -> W {
        self.writer
    }
}

fn human_phase(phase: ProgressPhase) -> &'static str {
    match phase {
        ProgressPhase::Preparing => "Preparing",
        ProgressPhase::Downloading => "Downloading",
        ProgressPhase::Decoding => "Decoding",
        ProgressPhase::Loading => "Loading",
        ProgressPhase::Transcribing => "Transcribing",
        ProgressPhase::Enhancing => "Improving transcript",
        ProgressPhase::Finalizing => "Finalizing",
    }
}

fn human_count(value: usize) -> String {
    let digits = value.to_string();
    let mut result = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, character) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            result.push(',');
        }
        result.push(character);
    }
    result
}

fn human_duration(duration: Duration) -> String {
    let seconds = duration.as_secs();
    if seconds >= 3_600 {
        format!(
            "{}h {}m {}s",
            seconds / 3_600,
            (seconds % 3_600) / 60,
            seconds % 60
        )
    } else if seconds >= 60 {
        format!("{}m {}s", seconds / 60, seconds % 60)
    } else if seconds > 0 {
        format!("{seconds}s")
    } else {
        format!("{:.0}ms", duration.as_secs_f64() * 1_000.0)
    }
}

fn human_file_name(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let name = relative
        .file_name()
        .unwrap_or(relative.as_os_str())
        .to_string_lossy();
    compact_text(&name, HUMAN_FILE_WIDTH)
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let sanitized = value.replace(['\r', '\n', '\t'], " ");
    let count = sanitized.chars().count();
    if count <= max_chars {
        return sanitized;
    }
    let tail_width = max_chars.saturating_sub(1);
    let tail = sanitized
        .chars()
        .skip(count.saturating_sub(tail_width))
        .collect::<String>();
    format!("…{tail}")
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use cuttledoc::{BackendId, TranscriptionResult};

    use super::*;
    use crate::batch::{BatchItem, BatchOptions, execute_batch, plan_batch};
    use crate::output::OutputFormat;

    fn temporary_directory(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("cuttledoc-progress-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).expect("temporary directory");
        directory
    }

    #[test]
    fn progress_format_is_explicit_and_bounded() {
        assert_eq!(ProgressFormat::parse("auto"), Ok(ProgressFormat::Auto));
        assert_eq!(ProgressFormat::parse("human"), Ok(ProgressFormat::Human));
        assert_eq!(ProgressFormat::parse("tsv"), Ok(ProgressFormat::Tsv));
        assert!(ProgressFormat::parse("json").is_err());
    }

    #[test]
    fn tsv_output_preserves_the_process_contract() {
        let root = PathBuf::from("/courses");
        let mut renderer =
            BatchProgressRenderer::new(Vec::<u8>::new(), &root, ProgressFormat::Tsv, true);
        renderer.discovered(1, 1, 0);
        renderer.loading(false);
        renderer.batch_event(BatchEvent::Starting {
            index: 1,
            total: 1,
            item: BatchItem {
                input_path: root.join("lesson.mp4"),
                output_path: root.join("lesson.txt"),
            },
        });
        renderer.transcription_progress(ProgressEvent {
            phase: ProgressPhase::Transcribing,
            completed: 16_000,
            total: Some(16_000),
            message: None,
        });
        let output = String::from_utf8(renderer.into_writer()).expect("UTF-8");
        assert!(output.contains("batch\tdiscovered\t1\tpending=1\tskipped=0\n"));
        assert!(output.contains("batch\tloading\t0\t1\trecognition-runtime\n"));
        assert!(output.contains("batch\ttranscribing\t1\t1\t/courses/lesson.mp4\n"));
        assert!(output.contains("progress\ttranscribing\t16000\t16000\t-\n"));
        assert!(!output.contains("\u{1b}[2K"));
    }

    #[test]
    fn interactive_human_output_is_compact_and_omits_sample_counts() {
        let root = temporary_directory("human");
        std::fs::write(root.join("lesson.mp4"), b"media").expect("media");
        let report_path = root.join(".report.json");
        let plan = plan_batch(BatchOptions {
            root: root.clone(),
            recursive: true,
            format: OutputFormat::Text,
            overwrite: false,
            report_path,
        })
        .expect("batch plan");
        let mut renderer =
            BatchProgressRenderer::new(Vec::<u8>::new(), &root, ProgressFormat::Human, true);
        renderer.discovered(plan.discovered(), plan.pending.len(), plan.skipped.len());
        renderer.loading(false);
        renderer.batch_event(BatchEvent::Starting {
            index: 1,
            total: 1,
            item: plan.pending[0].clone(),
        });
        renderer.transcription_progress(ProgressEvent {
            phase: ProgressPhase::Transcribing,
            completed: 2_528_597,
            total: Some(2_528_597),
            message: None,
        });
        renderer.batch_event(BatchEvent::Completed {
            index: 1,
            total: 1,
            item: plan.pending[0].clone(),
            language: Some("de".to_owned()),
        });
        let summary = execute_batch(
            plan,
            Instant::now(),
            |_| {
                Ok(TranscriptionResult {
                    raw_text: "Hallo".to_owned(),
                    text: "Hallo".to_owned(),
                    language: Some("de".to_owned()),
                    backend: BackendId::whisper(),
                    model: None,
                    media_duration: Duration::from_secs(1),
                    processing_duration: Duration::from_millis(5),
                    segments: Vec::new(),
                    enhancement: None,
                })
            },
            |_| {},
        )
        .expect("batch summary");
        renderer.summary(&summary);
        let output = String::from_utf8(renderer.into_writer()).expect("UTF-8");
        assert!(output.contains("Found 1 media file · 1 remaining"));
        assert!(output.contains("[1/1 · 100.0%] Transcribing"));
        assert!(output.contains("lesson.mp4"));
        assert!(output.contains("Finished: 1 transcribed · 0 skipped · 0 failed"));
        assert!(output.contains("\u{1b}[2K"));
        assert!(!output.contains("2528597"));
        assert!(!output.contains("/courses/"));
        std::fs::remove_dir_all(root).expect("remove temporary directory");
    }
}
