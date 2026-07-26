use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const WHISPER_CPP_REVISION: &str = "4979e04f5dcaccb36057e059bbaed8a2f5288315";

fn main() {
    println!("cargo:rerun-if-env-changed=CUTTLEDOC_WHISPER_CPP_DIR");
    println!("cargo:rerun-if-env-changed=CMAKE");
    println!("cargo:rerun-if-changed=include/cuttledoc_whisper_adapter.h");
    println!("cargo:rerun-if-changed=src/native/CuttledocWhisperAdapter.cpp");
    println!("cargo:rustc-check-cfg=cfg(cuttledoc_whisper_native)");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos")
        || env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("aarch64")
    {
        return;
    }

    let Some(source_dir) = env::var_os("CUTTLEDOC_WHISPER_CPP_DIR").map(PathBuf::from) else {
        return;
    };
    verify_source(&source_dir);

    let manifest_dir = required_path("CARGO_MANIFEST_DIR");
    let output_dir = required_path("OUT_DIR");
    let build_dir = output_dir.join("whisper-cpp-build");
    let cmake = env::var_os("CMAKE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("cmake"));

    let configure = Command::new(&cmake)
        .arg("-S")
        .arg(&source_dir)
        .arg("-B")
        .arg(&build_dir)
        .args([
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=26.0",
            "-DBUILD_SHARED_LIBS=OFF",
            "-DWHISPER_BUILD_EXAMPLES=OFF",
            "-DWHISPER_BUILD_TESTS=OFF",
            "-DWHISPER_COREML=ON",
            "-DWHISPER_COREML_ALLOW_FALLBACK=OFF",
            "-DGGML_METAL=ON",
            "-DGGML_METAL_EMBED_LIBRARY=ON",
        ])
        .output()
        .expect("could not configure whisper.cpp");
    require_success(&cmake, &configure);

    let parallelism = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .to_string();
    let build = Command::new(&cmake)
        .args(["--build"])
        .arg(&build_dir)
        .args(["--config", "Release", "--target", "whisper", "--parallel"])
        .arg(parallelism)
        .output()
        .expect("could not build whisper.cpp");
    require_success(&cmake, &build);

    let compiler = find_xcrun_tool("clang++");
    let sdk = find_macos_sdk();
    let adapter_source = manifest_dir.join("src/native/CuttledocWhisperAdapter.cpp");
    let adapter_object = output_dir.join("CuttledocWhisperAdapter.o");
    let compile = Command::new(&compiler)
        .args([
            "-std=c++17",
            "-O3",
            "-fvisibility=hidden",
            "-mmacosx-version-min=26.0",
            "-isysroot",
        ])
        .arg(&sdk)
        .args(["-I"])
        .arg(source_dir.join("include"))
        .args(["-I"])
        .arg(source_dir.join("ggml/include"))
        .args(["-I"])
        .arg(manifest_dir.join("include"))
        .args(["-c"])
        .arg(&adapter_source)
        .arg("-o")
        .arg(&adapter_object)
        .output()
        .expect("could not compile the Cuttledoc Whisper adapter");
    require_success(&compiler, &compile);

    let libtool = find_xcrun_tool("libtool");
    let adapter_library = output_dir.join("libcuttledoc_whisper_adapter.a");
    let archive = Command::new(&libtool)
        .args(["-static", "-o"])
        .arg(&adapter_library)
        .arg(&adapter_object)
        .output()
        .expect("could not archive the Cuttledoc Whisper adapter");
    require_success(&libtool, &archive);

    println!("cargo:rustc-cfg=cuttledoc_whisper_native");
    for directory in [
        output_dir.as_path(),
        &build_dir.join("src"),
        &build_dir.join("ggml/src"),
        &build_dir.join("ggml/src/ggml-metal"),
        &build_dir.join("ggml/src/ggml-blas"),
    ] {
        println!("cargo:rustc-link-search=native={}", directory.display());
    }
    for library in [
        "cuttledoc_whisper_adapter",
        "whisper",
        "whisper.coreml",
        "ggml",
        "ggml-base",
        "ggml-cpu",
        "ggml-metal",
        "ggml-blas",
    ] {
        println!("cargo:rustc-link-lib=static={library}");
    }
    println!("cargo:rustc-link-lib=dylib=c++");
    for framework in ["Accelerate", "CoreML", "Foundation", "Metal", "MetalKit"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}

fn verify_source(source_dir: &Path) {
    for path in [
        source_dir.join("CMakeLists.txt"),
        source_dir.join("include/whisper.h"),
        source_dir.join("ggml/include/ggml.h"),
    ] {
        assert!(
            path.is_file(),
            "CUTTLEDOC_WHISPER_CPP_DIR is missing {}",
            path.display()
        );
    }

    let output = Command::new("git")
        .args(["-C"])
        .arg(source_dir)
        .args(["rev-parse", "HEAD"])
        .output()
        .expect("could not verify the whisper.cpp revision");
    require_success(Path::new("git"), &output);
    let revision =
        String::from_utf8(output.stdout).expect("whisper.cpp returned a non-UTF-8 revision");
    assert_eq!(
        revision.trim(),
        WHISPER_CPP_REVISION,
        "CUTTLEDOC_WHISPER_CPP_DIR must point to the ADR-0017 revision"
    );
}

fn required_path(name: &str) -> PathBuf {
    env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("missing Cargo build variable {name}"))
}

fn find_xcrun_tool(name: &str) -> PathBuf {
    let output = Command::new("xcrun")
        .args(["--find", name])
        .output()
        .unwrap_or_else(|error| panic!("could not locate {name} through xcrun: {error}"));
    require_success(Path::new("xcrun"), &output);
    let path = String::from_utf8(output.stdout)
        .unwrap_or_else(|_| panic!("xcrun returned a non-UTF-8 {name} path"));
    PathBuf::from(path.trim())
}

fn find_macos_sdk() -> PathBuf {
    let output = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("could not locate the macOS SDK");
    require_success(Path::new("xcrun"), &output);
    let path = String::from_utf8(output.stdout).expect("xcrun returned a non-UTF-8 SDK path");
    PathBuf::from(path.trim())
}

fn require_success(program: &Path, output: &Output) {
    if output.status.success() {
        return;
    }
    panic!(
        "{} failed with {}\nstdout:\n{}\nstderr:\n{}",
        program.display(),
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
