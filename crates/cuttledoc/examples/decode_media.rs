use std::env;
use std::hint::black_box;
use std::path::PathBuf;

use cuttledoc::{AudioFormat, PcmBuffer};

const USAGE: &str = "usage: decode_media <media-path> [ffmpeg-path]";

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let media_path = PathBuf::from(arguments.next().ok_or(USAGE)?);
    let ffmpeg_path = arguments.next().map(PathBuf::from);
    if arguments.next().is_some() {
        return Err(USAGE.into());
    }

    let decoded = cuttledoc_audio::decode_file(
        &media_path,
        &cuttledoc_audio::DecodeOptions { ffmpeg_path },
        || false,
    )?;
    let input = PcmBuffer::new(
        AudioFormat::new(decoded.sample_rate, decoded.channels)?,
        decoded.samples,
    )?;
    black_box(&input);

    println!("sample_rate={}", input.format.sample_rate);
    println!("channels={}", input.format.channels);
    println!("frames={}", input.frame_count());
    println!(
        "duration_seconds={:.3}",
        input.frame_count() as f64 / f64::from(input.format.sample_rate)
    );
    println!(
        "pcm_bytes={}",
        input.samples.len().saturating_mul(size_of::<f32>())
    );
    Ok(())
}
