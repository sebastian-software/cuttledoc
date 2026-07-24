use std::env;
use std::fs;
use std::thread;
use std::time::Duration;

use cuttledoc_apple_speech::{PushOutcome, SpeechSession};

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
        .ok_or("usage: transcribe_pcm /path/to/f32le-pcm [locale] [--cancel]")?;
    let remaining = arguments.collect::<Vec<_>>();
    let (locale, cancel) = match remaining.as_slice() {
        [] => ("en-US".to_owned(), false),
        [flag] if flag == "--cancel" => ("en-US".to_owned(), true),
        [locale] => (locale.clone(), false),
        [locale, flag] if flag == "--cancel" => (locale.clone(), true),
        _ => return Err("usage: transcribe_pcm /path/to/f32le-pcm [locale] [--cancel]".into()),
    };

    let bytes = fs::read(&path)?;
    if bytes.is_empty() || bytes.len() % size_of::<f32>() != 0 {
        return Err("PCM input must contain complete little-endian f32 samples".into());
    }
    let samples = bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
        .collect::<Vec<_>>();

    let mut session = SpeechSession::create(&locale, 16_000)?;
    println!(
        "resolved_locale={}",
        session.resolved_locale().unwrap_or("unavailable")
    );
    let mut updates = Vec::new();
    for chunk in samples.chunks(3_200) {
        loop {
            match session.push(chunk)? {
                PushOutcome::Accepted => break,
                PushOutcome::WouldBlock => thread::sleep(Duration::from_millis(2)),
            }
        }
        updates.extend(session.take_updates()?);
        if cancel {
            session.cancel();
            session.close();
            println!("cancelled=true");
            return Ok(());
        }
    }
    updates.extend(session.finish()?);
    session.close();

    if updates.is_empty() {
        return Err("SpeechTranscriber emitted no updates".into());
    }
    if !updates.iter().any(|update| {
        matches!(
            update.kind,
            cuttledoc_apple_speech::NativeUpdateKind::Replace {
                stability: cuttledoc_apple_speech::NativeStability::Final,
                ..
            }
        )
    }) {
        return Err("SpeechTranscriber emitted no final update".into());
    }
    for update in updates {
        println!("{update:?}");
    }
    Ok(())
}
