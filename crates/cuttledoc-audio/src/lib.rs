use std::error::Error;
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread;
use std::time::Duration;

pub const SPEECH_SAMPLE_RATE: u32 = 16_000;
pub const SPEECH_CHANNELS: u16 = 1;

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(10);
const STDERR_TAIL_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AudioDecodeErrorKind {
    InvalidInput,
    ExecutableUnavailable,
    ProcessFailed,
    InvalidOutput,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudioDecodeError {
    pub kind: AudioDecodeErrorKind,
    pub message: String,
}

impl AudioDecodeError {
    fn new(kind: AudioDecodeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for AudioDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AudioDecodeError {}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DecodeOptions {
    pub ffmpeg_path: Option<PathBuf>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DecodedPcm {
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}

pub fn decode_file(
    input_path: &Path,
    options: &DecodeOptions,
    is_cancelled: impl Fn() -> bool,
) -> Result<DecodedPcm, AudioDecodeError> {
    validate_input_path(input_path)?;
    if is_cancelled() {
        return Err(cancelled_error());
    }

    let executable = resolve_ffmpeg_executable(options.ffmpeg_path.as_deref())?;
    let arguments = decode_arguments(input_path);
    let mut child = Command::new(&executable)
        .args(&arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| spawn_error(&executable, error))?;

    let stdout = child
        .stdout
        .take()
        .expect("piped FFmpeg stdout must be available");
    let stderr = child
        .stderr
        .take()
        .expect("piped FFmpeg stderr must be available");
    let pcm_reader = thread::spawn(move || read_f32le(stdout));
    let stderr_reader = thread::spawn(move || read_bounded_tail(stderr, STDERR_TAIL_BYTES));

    let status = wait_for_process(&mut child, &is_cancelled);
    let samples = join_pcm_reader(pcm_reader);
    let stderr_tail = join_stderr_reader(stderr_reader);

    let status = status?;
    if !status.success() {
        return Err(process_failure(status, &stderr_tail));
    }
    let samples = samples?;
    if samples.is_empty() {
        return Err(AudioDecodeError::new(
            AudioDecodeErrorKind::InvalidOutput,
            "FFmpeg produced no audio samples",
        ));
    }

    Ok(DecodedPcm {
        sample_rate: SPEECH_SAMPLE_RATE,
        channels: SPEECH_CHANNELS,
        samples,
    })
}

fn validate_input_path(input_path: &Path) -> Result<(), AudioDecodeError> {
    match fs::metadata(input_path) {
        Ok(metadata) if metadata.is_file() => Ok(()),
        Ok(_) => Err(AudioDecodeError::new(
            AudioDecodeErrorKind::InvalidInput,
            format!("media input is not a file: {}", input_path.display()),
        )),
        Err(error) => Err(AudioDecodeError::new(
            AudioDecodeErrorKind::InvalidInput,
            format!(
                "could not read media input {}: {error}",
                input_path.display()
            ),
        )),
    }
}

fn resolve_ffmpeg_executable(explicit: Option<&Path>) -> Result<PathBuf, AudioDecodeError> {
    select_ffmpeg_executable(explicit, std::env::var_os("FFMPEG_PATH"))
}

fn select_ffmpeg_executable(
    explicit: Option<&Path>,
    configured: Option<OsString>,
) -> Result<PathBuf, AudioDecodeError> {
    if let Some(explicit) = explicit {
        if explicit.as_os_str().is_empty() {
            return Err(AudioDecodeError::new(
                AudioDecodeErrorKind::InvalidInput,
                "explicit FFmpeg path must not be empty",
            ));
        }
        return Ok(explicit.to_owned());
    }

    if let Some(configured) = configured {
        if !configured.is_empty() {
            return Ok(PathBuf::from(configured));
        }
    }
    Ok(PathBuf::from("ffmpeg"))
}

fn decode_arguments(input_path: &Path) -> Vec<OsString> {
    [
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-loglevel"),
        OsString::from("error"),
        OsString::from("-i"),
        input_path.as_os_str().to_owned(),
        OsString::from("-map"),
        OsString::from("0:a:0"),
        OsString::from("-vn"),
        OsString::from("-sn"),
        OsString::from("-dn"),
        OsString::from("-ac"),
        OsString::from(SPEECH_CHANNELS.to_string()),
        OsString::from("-ar"),
        OsString::from(SPEECH_SAMPLE_RATE.to_string()),
        OsString::from("-f"),
        OsString::from("f32le"),
        OsString::from("-acodec"),
        OsString::from("pcm_f32le"),
        OsString::from("pipe:1"),
    ]
    .into_iter()
    .collect()
}

fn spawn_error(executable: &Path, error: io::Error) -> AudioDecodeError {
    let kind = if error.kind() == io::ErrorKind::NotFound {
        AudioDecodeErrorKind::ExecutableUnavailable
    } else {
        AudioDecodeErrorKind::ProcessFailed
    };
    AudioDecodeError::new(
        kind,
        format!(
            "could not start FFmpeg executable {}: {error}; configure --ffmpeg-path or FFMPEG_PATH",
            executable.display()
        ),
    )
}

fn wait_for_process(
    child: &mut Child,
    is_cancelled: &impl Fn() -> bool,
) -> Result<ExitStatus, AudioDecodeError> {
    loop {
        if is_cancelled() {
            terminate_and_reap(child);
            return Err(cancelled_error());
        }
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => thread::sleep(PROCESS_POLL_INTERVAL),
            Err(error) => {
                terminate_and_reap(child);
                return Err(AudioDecodeError::new(
                    AudioDecodeErrorKind::ProcessFailed,
                    format!("could not wait for FFmpeg: {error}"),
                ));
            }
        }
    }
}

fn terminate_and_reap(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn cancelled_error() -> AudioDecodeError {
    AudioDecodeError::new(
        AudioDecodeErrorKind::Cancelled,
        "media decoding was cancelled",
    )
}

fn process_failure(status: ExitStatus, stderr_tail: &str) -> AudioDecodeError {
    let detail = stderr_tail.trim();
    let suffix = if detail.is_empty() {
        String::new()
    } else {
        format!(": {detail}")
    };
    AudioDecodeError::new(
        AudioDecodeErrorKind::ProcessFailed,
        format!("FFmpeg exited with {status}{suffix}"),
    )
}

fn read_f32le(mut reader: impl Read) -> io::Result<Vec<f32>> {
    let mut samples = Vec::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut pending = [0_u8; size_of::<f32>()];
    let mut pending_length = 0;

    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let mut bytes = &buffer[..read];

        if pending_length > 0 {
            let needed = pending.len() - pending_length;
            let copied = needed.min(bytes.len());
            pending[pending_length..pending_length + copied].copy_from_slice(&bytes[..copied]);
            pending_length += copied;
            bytes = &bytes[copied..];
            if pending_length < pending.len() {
                continue;
            }
            samples.push(f32::from_le_bytes(pending));
        }

        let complete_length = bytes.len() - (bytes.len() % size_of::<f32>());
        samples.extend(
            bytes[..complete_length]
                .chunks_exact(size_of::<f32>())
                .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk"))),
        );
        let remainder = &bytes[complete_length..];
        pending[..remainder.len()].copy_from_slice(remainder);
        pending_length = remainder.len();
    }

    if pending_length != 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("FFmpeg returned {pending_length} trailing PCM bytes"),
        ));
    }
    Ok(samples)
}

fn read_bounded_tail(mut reader: impl Read, maximum_bytes: usize) -> io::Result<String> {
    let mut tail = Vec::new();
    let mut buffer = [0_u8; 8 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        tail.extend_from_slice(&buffer[..read]);
        if tail.len() > maximum_bytes {
            tail.drain(..tail.len() - maximum_bytes);
        }
    }
    Ok(String::from_utf8_lossy(&tail).into_owned())
}

fn join_pcm_reader(
    reader: thread::JoinHandle<io::Result<Vec<f32>>>,
) -> Result<Vec<f32>, AudioDecodeError> {
    match reader.join() {
        Ok(Ok(samples)) => Ok(samples),
        Ok(Err(error)) => Err(AudioDecodeError::new(
            AudioDecodeErrorKind::InvalidOutput,
            format!("could not read FFmpeg PCM output: {error}"),
        )),
        Err(_) => Err(AudioDecodeError::new(
            AudioDecodeErrorKind::InvalidOutput,
            "FFmpeg PCM reader panicked",
        )),
    }
}

fn join_stderr_reader(reader: thread::JoinHandle<io::Result<String>>) -> String {
    match reader.join() {
        Ok(Ok(stderr)) => stderr,
        Ok(Err(error)) => format!("could not read FFmpeg diagnostics: {error}"),
        Err(_) => "FFmpeg diagnostic reader panicked".to_owned(),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::ffi::OsStr;
    use std::io::Cursor;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Instant, SystemTime};

    use super::*;

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "cuttledoc-audio-{}-{timestamp}-{nonce}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }

        fn input(&self) -> PathBuf {
            let input = self.path("input with spaces.media");
            fs::write(&input, b"fixture").expect("write fake input");
            input
        }

        fn executable(&self, body: &str) -> PathBuf {
            let executable = self.path("fake-ffmpeg");
            fs::write(&executable, format!("#!/bin/sh\nset -eu\n{body}\n"))
                .expect("write fake FFmpeg");
            let mut permissions = fs::metadata(&executable)
                .expect("fake FFmpeg metadata")
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&executable, permissions).expect("make fake FFmpeg executable");
            executable
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn decoder_uses_exact_arguments_and_reads_pcm() {
        let directory = TestDirectory::new();
        let input = directory.input();
        let executable = directory.executable(
            "printf '%s\\n' \"$@\" > \"$0.args\"\nprintf '\\000\\000\\200\\076\\000\\000\\000\\277'",
        );
        let result = decode_file(
            &input,
            &DecodeOptions {
                ffmpeg_path: Some(executable.clone()),
            },
            || false,
        )
        .expect("decode succeeds");

        assert_eq!(result.sample_rate, 16_000);
        assert_eq!(result.channels, 1);
        assert_eq!(result.samples, vec![0.25, -0.5]);
        let arguments = fs::read_to_string(format!("{}.args", executable.display()))
            .expect("read recorded arguments");
        let arguments = arguments.lines().collect::<Vec<_>>();
        assert_eq!(
            arguments[0..5],
            ["-hide_banner", "-nostdin", "-loglevel", "error", "-i"]
        );
        assert_eq!(arguments[5], input.to_string_lossy());
        assert_eq!(
            &arguments[6..],
            [
                "-map",
                "0:a:0",
                "-vn",
                "-sn",
                "-dn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "f32le",
                "-acodec",
                "pcm_f32le",
                "pipe:1"
            ]
        );
    }

    #[test]
    fn pcm_reader_preserves_samples_across_unaligned_reads() {
        struct ChunkedReader {
            bytes: Cursor<Vec<u8>>,
            maximum_read: usize,
        }

        impl Read for ChunkedReader {
            fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
                let length = output.len().min(self.maximum_read);
                self.bytes.read(&mut output[..length])
            }
        }

        let bytes = [0.25_f32.to_le_bytes(), (-0.5_f32).to_le_bytes()].concat();
        let samples = read_f32le(ChunkedReader {
            bytes: Cursor::new(bytes),
            maximum_read: 1,
        })
        .expect("unaligned reads preserve complete samples");
        assert_eq!(samples, vec![0.25, -0.5]);
    }

    #[test]
    fn decoder_rejects_incomplete_pcm() {
        let directory = TestDirectory::new();
        let input = directory.input();
        let executable = directory.executable("printf '\\001\\002\\003'");
        let error = decode_file(
            &input,
            &DecodeOptions {
                ffmpeg_path: Some(executable),
            },
            || false,
        )
        .expect_err("incomplete PCM must fail");
        assert_eq!(error.kind, AudioDecodeErrorKind::InvalidOutput);
        assert!(error.message.contains("trailing PCM bytes"));
    }

    #[test]
    fn decoder_bounds_failure_diagnostics() {
        let directory = TestDirectory::new();
        let input = directory.input();
        let executable = directory.executable(
            "i=0\nwhile [ \"$i\" -lt 70000 ]; do printf x >&2; i=$((i + 1)); done\nprintf TAIL_MARKER >&2\nexit 7",
        );
        let error = decode_file(
            &input,
            &DecodeOptions {
                ffmpeg_path: Some(executable),
            },
            || false,
        )
        .expect_err("nonzero exit must fail");
        assert_eq!(error.kind, AudioDecodeErrorKind::ProcessFailed);
        assert!(error.message.contains("TAIL_MARKER"));
        assert!(error.message.len() <= STDERR_TAIL_BYTES + 128);
    }

    #[test]
    fn decoder_cancels_and_reaps_the_child() {
        let directory = TestDirectory::new();
        let input = directory.input();
        let executable = directory.executable("exec sleep 30");
        let started = Instant::now();
        let error = decode_file(
            &input,
            &DecodeOptions {
                ffmpeg_path: Some(executable),
            },
            || started.elapsed() >= Duration::from_millis(25),
        )
        .expect_err("cancellation must fail");
        assert_eq!(error.kind, AudioDecodeErrorKind::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn decoder_rejects_missing_inputs_before_starting_ffmpeg() {
        let directory = TestDirectory::new();
        let error = decode_file(
            &directory.path("missing.media"),
            &DecodeOptions {
                ffmpeg_path: Some(directory.path("missing-ffmpeg")),
            },
            || false,
        )
        .expect_err("missing input must fail first");
        assert_eq!(error.kind, AudioDecodeErrorKind::InvalidInput);
        assert!(error.message.contains("could not read media input"));
    }

    #[test]
    fn executable_resolution_precedence_and_output_argument_are_stable() {
        assert_eq!(
            select_ffmpeg_executable(
                Some(Path::new("/explicit/ffmpeg")),
                Some(OsString::from("/configured/ffmpeg"))
            )
            .expect("explicit path"),
            PathBuf::from("/explicit/ffmpeg")
        );
        assert_eq!(
            select_ffmpeg_executable(None, Some(OsString::from("/configured/ffmpeg")))
                .expect("configured path"),
            PathBuf::from("/configured/ffmpeg")
        );
        assert_eq!(
            select_ffmpeg_executable(None, None).expect("PATH fallback"),
            PathBuf::from("ffmpeg")
        );
        assert_eq!(
            decode_arguments(Path::new("input.mp3"))
                .last()
                .map(OsString::as_os_str),
            Some(OsStr::new("pipe:1"))
        );
    }

    #[test]
    fn decoder_reports_a_missing_executable_actionably() {
        let directory = TestDirectory::new();
        let input = directory.input();
        let missing = directory.path("missing-ffmpeg");
        let error = decode_file(
            &input,
            &DecodeOptions {
                ffmpeg_path: Some(missing.clone()),
            },
            || false,
        )
        .expect_err("missing FFmpeg must fail");
        assert_eq!(error.kind, AudioDecodeErrorKind::ExecutableUnavailable);
        assert!(error.message.contains(&missing.display().to_string()));
        assert!(error.message.contains("FFMPEG_PATH"));
    }
}
