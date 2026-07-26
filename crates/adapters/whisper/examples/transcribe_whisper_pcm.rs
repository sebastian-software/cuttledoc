use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use cuttledoc_whisper::{EngineOptions, WhisperEngine};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    const USAGE: &str = "usage: transcribe_whisper_pcm <model.bin> <f32le-pcm> [language|auto] [--cancel] [--repeat <count>]";
    let mut arguments = env::args().skip(1);
    let model_path = arguments.next().map(PathBuf::from).ok_or(USAGE)?;
    let pcm_path = arguments.next().map(PathBuf::from).ok_or(USAGE)?;
    let language = arguments
        .next()
        .filter(|value| value != "auto" && !value.is_empty());
    let mut cancel_after_ms = None;
    let mut repetitions = 1_u32;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--cancel" if cancel_after_ms.is_none() => cancel_after_ms = Some(10),
            "--repeat" if repetitions == 1 => {
                repetitions = arguments.next().ok_or(USAGE)?.parse().map_err(|_| USAGE)?;
                if repetitions == 0 {
                    return Err(USAGE.into());
                }
            }
            _ => return Err(USAGE.into()),
        }
    }

    let bytes = fs::read(pcm_path)?;
    if bytes.is_empty() || bytes.len() % size_of::<f32>() != 0 {
        return Err("PCM input must contain complete little-endian f32 samples".into());
    }
    let samples = bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
        .collect::<Vec<_>>();
    let mut baseline = None;
    for iteration in 1..=repetitions {
        let cancelled = Arc::new(AtomicBool::new(false));
        if let Some(delay) = cancel_after_ms {
            let cancelled = Arc::clone(&cancelled);
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(delay));
                cancelled.store(true, Ordering::Release);
            });
        }
        let result = {
            let mut engine = WhisperEngine::create(&EngineOptions {
                model_path: model_path.clone(),
                language: language.clone(),
                threads: 4,
            })?;
            engine.transcribe(&samples, || cancelled.load(Ordering::Acquire))?
        };
        if let Some(expected) = &baseline
            && expected != &result
        {
            return Err(format!("iteration {iteration} produced a different result").into());
        }
        if baseline.is_none() {
            baseline = Some(result.clone());
        }
        if repetitions > 1 {
            println!("iteration={iteration}");
        }
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
    }
    Ok(())
}
