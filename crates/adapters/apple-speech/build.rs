use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn main() {
    println!("cargo:rerun-if-changed=src/native/CuttledocSpeechAdapter.swift");
    println!("cargo:rerun-if-changed=include/cuttledoc_speech_adapter.h");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos")
        || env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("aarch64")
    {
        return;
    }

    let manifest_dir = required_path("CARGO_MANIFEST_DIR");
    let output_dir = required_path("OUT_DIR");
    let source = manifest_dir.join("src/native/CuttledocSpeechAdapter.swift");
    let library = output_dir.join("libcuttledoc_speech_adapter.a");
    let module_cache = output_dir.join("swift-module-cache");

    std::fs::create_dir_all(&module_cache).expect("could not create Swift module cache");
    let swiftc = find_swift_compiler();
    let sdk = find_macos_sdk();
    let output = Command::new(&swiftc)
        .args([
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-O",
            "-module-name",
            "CuttledocSpeechAdapter",
            "-target",
            "arm64-apple-macosx26.0",
            "-sdk",
        ])
        .arg(&sdk)
        .args(["-module-cache-path"])
        .arg(&module_cache)
        .arg(&source)
        .arg("-o")
        .arg(&library)
        .output()
        .expect("could not run the Swift compiler");
    require_success(&swiftc, &output);

    println!("cargo:rustc-link-search=native={}", output_dir.display());
    println!("cargo:rustc-link-lib=static=cuttledoc_speech_adapter");
    for framework in ["Speech", "AVFoundation", "CoreMedia", "Foundation"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

fn required_path(name: &str) -> PathBuf {
    env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("missing Cargo build variable {name}"))
}

fn find_swift_compiler() -> PathBuf {
    let output = Command::new("xcrun")
        .args(["--find", "swiftc"])
        .output()
        .expect("could not run xcrun to locate swiftc");
    require_success(Path::new("xcrun"), &output);
    let path = String::from_utf8(output.stdout).expect("xcrun returned a non-UTF-8 swiftc path");
    PathBuf::from(path.trim())
}

fn find_macos_sdk() -> PathBuf {
    let output = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("could not run xcrun to locate the macOS SDK");
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
