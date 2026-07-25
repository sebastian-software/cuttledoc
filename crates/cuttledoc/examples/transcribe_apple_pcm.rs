use std::env;
use std::fs;

use cuttledoc::{
    AudioFormat, BackendId, PcmBuffer, TranscribeOptions, recognition_asset_inventory,
    transcribe_pcm,
};

const USAGE: &str =
    "usage: transcribe_apple_pcm /path/to/mono-f32le-pcm <language> [--repeat <count>]";

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let path = arguments.next().ok_or(USAGE)?;
    let language = arguments.next().ok_or(USAGE)?;
    let repeat = match arguments.collect::<Vec<_>>().as_slice() {
        [] => 1,
        [flag, count] if flag == "--repeat" => {
            let count = count.parse::<usize>()?;
            if count == 0 {
                return Err("repeat count must be greater than zero".into());
            }
            count
        }
        _ => return Err(USAGE.into()),
    };

    let bytes = fs::read(path)?;
    let input = PcmBuffer::from_f32le_bytes(AudioFormat::new(16_000, 1)?, &bytes)?;
    let backend = BackendId::apple_speech();
    let reserved_before = recognition_asset_inventory(&backend)?.reserved_locales;
    let mut expected_text = None;

    for iteration in 1..=repeat {
        let result = transcribe_pcm(
            &input,
            &TranscribeOptions {
                language: Some(language.clone()),
                ..TranscribeOptions::default()
            },
        )?;
        if let Some(expected_text) = expected_text.as_deref() {
            if result.text != expected_text {
                return Err(
                    format!("iteration {iteration} produced a different transcript").into(),
                );
            }
        } else {
            expected_text = Some(result.text.clone());
        }

        println!("iteration={iteration}");
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
    }

    let reserved_after = recognition_asset_inventory(&backend)?.reserved_locales;
    if reserved_after != reserved_before {
        return Err(format!(
            "Apple Speech reservations changed across the lifecycle: {reserved_before:?} -> {reserved_after:?}"
        )
        .into());
    }
    println!("repeat_count={repeat}");
    println!("reservations_unchanged=true");
    Ok(())
}
