use std::env;
use std::fs;

use cuttledoc::{AudioFormat, PcmBuffer, TranscribeOptions, transcribe_pcm};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let path = arguments
        .next()
        .ok_or("usage: transcribe_apple_pcm /path/to/mono-f32le-pcm <language>")?;
    let language = arguments
        .next()
        .ok_or("usage: transcribe_apple_pcm /path/to/mono-f32le-pcm <language>")?;
    if arguments.next().is_some() {
        return Err("usage: transcribe_apple_pcm /path/to/mono-f32le-pcm <language>".into());
    }

    let bytes = fs::read(path)?;
    if bytes.is_empty() || bytes.len() % size_of::<f32>() != 0 {
        return Err("PCM input must contain complete little-endian f32 samples".into());
    }
    let samples = bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
        .collect::<Vec<_>>();
    let input = PcmBuffer::new(AudioFormat::new(16_000, 1)?, samples)?;
    let result = transcribe_pcm(
        &input,
        &TranscribeOptions {
            language: Some(language),
            ..TranscribeOptions::default()
        },
    )?;

    println!("backend={}", result.backend);
    println!(
        "language={}",
        result.language.as_deref().unwrap_or("unknown")
    );
    println!("media_duration_ms={}", result.media_duration.as_millis());
    println!(
        "processing_duration_ms={}",
        result.processing_duration.as_millis()
    );
    println!("segments={}", result.segments.len());
    println!("text={}", result.text);
    for segment in result.segments {
        for word in segment.words {
            println!(
                "word={}..{}\tconfidence={}\t{}",
                word.range.start.as_millis(),
                word.range.end.as_millis(),
                word.confidence
                    .map_or_else(|| "unknown".to_owned(), |value| format!("{value:.3}")),
                word.text
            );
        }
    }
    Ok(())
}
