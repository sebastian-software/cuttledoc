# Direct Gemma 4 adapter over official MLX

**Status:** The first issue
[#25](https://github.com/sebastian-software/cuttledoc-rs/issues/25) local-runtime
gate is complete. The repository-owned adapter loads the pinned Gemma 4
26B-A4B 4-bit snapshot, generates incrementally through official MLX C++, and
matches the pinned Python MLX-LM oracle exactly for the fixed greedy smoke
fixture.

**Runnable artifact:**
[`crates/adapters/gemma-mlx`](../../crates/adapters/gemma-mlx/).

## Boundary

Rust owns model validation, the supported chat-template subset, tokenization,
stream assembly, cancellation, memory policy, errors, and the public generation
contract. A narrow repository-owned C ABI owns the model session and calls the
official MLX C++ tensor operations. No Python runtime, MLX-LM package, C++ type,
or generic MLX binding crosses the product boundary.

The adapter pins:

- official MLX `0.32.0` at
  `7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247`;
- `mlx-community/gemma-4-26b-a4b-it-4bit` at
  `0d77464eeb233a2da68ebf9d7dc4edaac7db956d`; and
- a 15,373,586,252-byte verified model snapshot.

## Greedy parity result

The fixed prompt asks both paths to correct only punctuation and capitalization:

```text
das ist ein reproduzierbarer mlx test
```

On an Apple M1 Ultra with 64 GiB unified memory, both the Python oracle and the
native adapter produced:

| Observation | Python MLX-LM | Native Rust/C++ adapter |
| --- | ---: | ---: |
| Prompt tokens | 35 | 35 |
| Generated tokens | 12 | 12 |
| Finish reason | `stop` | `stop` |
| Token IDs | exact 12-token sequence | exact same sequence |
| Decoded text | `Das ist ein reproduzierbarer MLX-Test.` | exact same text |

The complete machine-readable record is
[`phase0.gemma-4-official-mlx-parity-1/result.json`](../../benchmarks/raw/phase0.gemma-4-official-mlx-parity-1/result.json).
This proves the selected deterministic task path, including incremental
decoding and the stop token. It does not claim floating-point/logit identity,
benchmark-wide correction quality, or suitability for every 32 GiB workload.

## Memory gate

The product gate requires at least 32 GiB total unified memory and the verified
model snapshot plus 8 GiB of currently reclaimable system headroom. A macOS CLI
cannot use `os_proc_available_memory` for this decision because that API
reports zero for a process that is not an app. The adapter therefore reads the
stable Mach `HOST_VM_INFO` counters and counts free, inactive, and purgeable
pages. Speculative pages are already included in the free count and are not
double-counted.

The 64 GiB development host passed this gate. ADR-0014 still requires a direct
end-to-end smoke test on 32 GiB Apple Silicon before the local path is called
generally available.

## Reproduction

Prepare the pinned official MLX source and verified model snapshot, then run:

```sh
spikes/text-generation-mlx-reference/.venv/bin/python \
  spikes/text-generation-mlx-reference/run_greedy_parity.py \
  --model-dir <model-directory> \
  --prompt <prompt-file> \
  --max-tokens 32

CUTTLEDOC_MLX_DIR=<official-mlx-source> \
  cargo run -p cuttledoc-gemma-mlx --example generate_gemma -- \
  <model-directory> <prompt-file> 32
```

Metal execution must run in a normal macOS host process with GPU access.
