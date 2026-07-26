use std::env;
use std::fs;
use std::path::PathBuf;

use cuttledoc_whisper::{EngineOptions, WhisperEngine};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let model_path = arguments
        .next()
        .map(PathBuf::from)
        .ok_or("usage: transcribe_pcm <model.bin> <f32le-pcm> [language|auto]")?;
    let pcm_path = arguments
        .next()
        .map(PathBuf::from)
        .ok_or("usage: transcribe_pcm <model.bin> <f32le-pcm> [language|auto]")?;
    let language = arguments
        .next()
        .filter(|value| value != "auto" && !value.is_empty());
    if arguments.next().is_some() {
        return Err("usage: transcribe_pcm <model.bin> <f32le-pcm> [language|auto]".into());
    }

    let bytes = fs::read(pcm_path)?;
    if bytes.is_empty() || bytes.len() % size_of::<f32>() != 0 {
        return Err("PCM input must contain complete little-endian f32 samples".into());
    }
    let samples = bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
        .collect::<Vec<_>>();
    let mut engine = WhisperEngine::create(&EngineOptions {
        model_path,
        language,
        threads: 4,
    })?;
    let result = engine.transcribe(&samples, || false)?;
    println!(
        "language={}",
        result.language.as_deref().unwrap_or("unknown")
    );
    for segment in result.segments {
        println!(
            "{}..{}\t{}",
            segment.range.start_ms, segment.range.end_ms, segment.text
        );
    }
    Ok(())
}
