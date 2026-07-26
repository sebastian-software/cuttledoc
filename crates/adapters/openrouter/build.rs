use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn main() {
    println!("cargo:rustc-check-cfg=cfg(cuttledoc_openrouter_native)");
    println!("cargo:rerun-if-changed=include/cuttledoc_openrouter_adapter.h");
    println!("cargo:rerun-if-changed=src/native/CuttledocOpenRouterAdapter.swift");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos")
        || env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("aarch64")
    {
        return;
    }

    let manifest_directory = required_path("CARGO_MANIFEST_DIR");
    let output_directory = required_path("OUT_DIR");
    let source = manifest_directory.join("src/native/CuttledocOpenRouterAdapter.swift");
    let library = output_directory.join("libcuttledoc_openrouter_adapter.a");
    let module_cache = output_directory.join("swift-module-cache");

    std::fs::create_dir_all(&module_cache).expect("could not create Swift module cache");
    let swiftc = find_swift_compiler();
    let sdk = find_macos_sdk();
    let output = Command::new(&swiftc)
        .args([
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-O",
            "-warnings-as-errors",
            "-module-name",
            "CuttledocOpenRouterAdapter",
            "-target",
            "arm64-apple-macosx14.0",
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

    println!("cargo:rustc-cfg=cuttledoc_openrouter_native");
    println!(
        "cargo:rustc-link-search=native={}",
        output_directory.display()
    );
    println!("cargo:rustc-link-lib=static=cuttledoc_openrouter_adapter");
    println!("cargo:rustc-link-lib=framework=Foundation");
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
