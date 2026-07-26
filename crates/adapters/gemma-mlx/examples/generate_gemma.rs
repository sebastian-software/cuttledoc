use std::env;
use std::fs;
use std::path::PathBuf;

use cuttledoc_gemma_mlx::{ChatMessage, ChatRole, EngineOptions, GemmaEngine, NativeFinishReason};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    const USAGE: &str = "usage: generate_gemma <model-directory> <prompt-file> [maximum-tokens]";
    let mut arguments = env::args().skip(1);
    let model_directory = arguments.next().map(PathBuf::from).ok_or(USAGE)?;
    let prompt_path = arguments.next().map(PathBuf::from).ok_or(USAGE)?;
    let maximum_tokens = arguments
        .next()
        .map(|value| value.parse())
        .transpose()
        .map_err(|_| USAGE)?
        .unwrap_or(32_u32);
    if maximum_tokens == 0 || arguments.next().is_some() {
        return Err(USAGE.into());
    }

    let prompt = fs::read_to_string(prompt_path)?;
    let mut engine = GemmaEngine::create(&EngineOptions {
        model_directory,
        metallib_path: None,
        memory: None,
    })?;
    let mut streamed_text = String::new();
    let result = engine.generate(
        &[ChatMessage {
            role: ChatRole::User,
            content: prompt,
        }],
        maximum_tokens,
        || false,
        |delta| {
            streamed_text.push_str(&delta);
            Ok(())
        },
    )?;
    if streamed_text != result.text {
        return Err("streamed Gemma text did not match the final text".into());
    }

    let finish_reason = match result.finish_reason {
        NativeFinishReason::Stop => "stop",
        NativeFinishReason::Length => "length",
    };
    println!("prompt_tokens={}", result.prompt_tokens);
    println!("generated_tokens={}", result.generated_tokens);
    println!("finish_reason={finish_reason}");
    println!(
        "token_ids={}",
        result
            .token_ids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",")
    );
    println!("text_begin");
    println!("{}", result.text);
    println!("text_end");
    Ok(())
}
