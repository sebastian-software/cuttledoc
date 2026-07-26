#!/usr/bin/env python3

import argparse
from pathlib import Path

from mlx_lm import load, stream_generate
from mlx_lm.sample_utils import make_sampler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Emit the pinned Python reference tokens for native parity checks."
    )
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--prompt", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, default=32)
    args = parser.parse_args()
    if args.max_tokens <= 0:
        parser.error("--max-tokens must be greater than zero")
    return args


def main() -> None:
    args = parse_args()
    model, tokenizer = load(str(args.model_dir), lazy=False)
    prompt = args.prompt.read_text(encoding="utf-8")
    templated = tokenizer.apply_chat_template(
        [{"role": "user", "content": prompt}],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )

    token_ids: list[int] = []
    text_segments: list[str] = []
    final_response = None
    for response in stream_generate(
        model,
        tokenizer,
        templated,
        max_tokens=args.max_tokens,
        sampler=make_sampler(temp=0.0),
    ):
        token_ids.append(int(response.token))
        text_segments.append(response.text)
        final_response = response
    if final_response is None:
        raise RuntimeError("MLX-LM returned no generation updates")

    print(f"prompt_tokens={final_response.prompt_tokens}")
    print(f"generated_tokens={final_response.generation_tokens}")
    print(f"finish_reason={final_response.finish_reason}")
    print(f"token_ids={','.join(str(token) for token in token_ids)}")
    print("text_begin")
    print("".join(text_segments))
    print("text_end")


if __name__ == "__main__":
    main()
