use std::time::Duration;

use cuttledoc_openrouter::{
    Credential, EngineOptions, FinishReason, GenerationRequest, Message, OpenRouterEngine,
    OutputFormat, Role,
};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let engine = OpenRouterEngine::create(EngineOptions {
        credential: Credential::from_environment()?,
        timeout: Duration::from_secs(120),
    })?;
    let result = engine.generate(
        &GenerationRequest {
            messages: vec![Message {
                role: Role::User,
                content: concat!(
                    "Correct only punctuation and capitalization. ",
                    "Return the result as JSON with one string field named corrected:\n\n",
                    "das ist ein reproduzierbarer openrouter test"
                )
                .to_owned(),
            }],
            output_format: OutputFormat::JsonSchema {
                name: "bounded_correction_smoke".to_owned(),
                schema: concat!(
                    r#"{"type":"object","properties":{"corrected":{"type":"string"}},"#,
                    r#""required":["corrected"],"additionalProperties":false}"#
                )
                .to_owned(),
                strict: true,
            },
            maximum_tokens: 128,
            temperature: None,
            seed: Some(0),
        },
        || false,
    )?;
    let finish_reason = match result.finish_reason {
        FinishReason::Stop => "stop",
        FinishReason::Length => "length",
        FinishReason::Other => "other",
    };
    println!("finish_reason={finish_reason}");
    println!(
        "prompt_tokens={}",
        result
            .prompt_tokens
            .map_or_else(|| "unknown".to_owned(), |tokens| tokens.to_string())
    );
    println!(
        "generated_tokens={}",
        result
            .generated_tokens
            .map_or_else(|| "unknown".to_owned(), |tokens| tokens.to_string())
    );
    println!("text_begin");
    println!("{}", result.text);
    println!("text_end");
    Ok(())
}
