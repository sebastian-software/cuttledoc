use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const MLX_REVISION: &str = "7a1d4f5c12ac82f4b4d0a6e71538d89ca0605247";

fn main() {
    println!("cargo:rustc-check-cfg=cfg(cuttledoc_gemma_mlx_native)");
    println!("cargo:rerun-if-env-changed=CUTTLEDOC_MLX_DIR");
    println!("cargo:rerun-if-env-changed=CMAKE");
    println!("cargo:rerun-if-changed=include/cuttledoc_gemma_mlx_adapter.h");
    println!("cargo:rerun-if-changed=native/CMakeLists.txt");
    println!("cargo:rerun-if-changed=src/native/CuttledocGemmaMlxAdapter.cpp");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos")
        || env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("aarch64")
    {
        return;
    }
    let Some(source_directory) = env::var_os("CUTTLEDOC_MLX_DIR").map(PathBuf::from) else {
        return;
    };
    verify_source(&source_directory);

    let manifest_directory = required_path("CARGO_MANIFEST_DIR");
    let output_directory = required_path("OUT_DIR");
    let build_directory = output_directory.join("gemma-mlx-build");
    let cmake = env::var_os("CMAKE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("cmake"));

    let configure = Command::new(&cmake)
        .arg("-S")
        .arg(manifest_directory.join("native"))
        .arg("-B")
        .arg(&build_directory)
        .arg(format!("-DMLX_SOURCE_DIR={}", source_directory.display()))
        .args([
            "-DCMAKE_BUILD_TYPE=Release",
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0",
        ])
        .output()
        .expect("could not configure the Gemma MLX adapter");
    require_success(&cmake, &configure);

    let build = Command::new(&cmake)
        .args(["--build"])
        .arg(&build_directory)
        .args([
            "--config",
            "Release",
            "--target",
            "cuttledoc_gemma_mlx_adapter",
            "--parallel",
            "2",
        ])
        .output()
        .expect("could not build the Gemma MLX adapter");
    require_success(&cmake, &build);

    let adapter = build_directory.join("libcuttledoc_gemma_mlx_adapter.dylib");
    let metallib = build_directory.join("mlx.metallib");
    assert!(
        adapter.is_file(),
        "Gemma MLX build omitted {}",
        adapter.display()
    );
    assert!(
        metallib.is_file(),
        "Gemma MLX build omitted {}",
        metallib.display()
    );
    println!("cargo:rustc-cfg=cuttledoc_gemma_mlx_native");
    println!(
        "cargo:rustc-link-search=native={}",
        build_directory.display()
    );
    println!("cargo:rustc-link-lib=dylib=cuttledoc_gemma_mlx_adapter");
    println!(
        "cargo:rustc-link-arg=-Wl,-rpath,{}",
        build_directory.display()
    );
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    println!(
        "cargo:rustc-env=CUTTLEDOC_GEMMA_BUILD_METALLIB={}",
        metallib.display()
    );
}

fn verify_source(source_directory: &Path) {
    for path in [
        source_directory.join("CMakeLists.txt"),
        source_directory.join("mlx/mlx.h"),
        source_directory.join("mlx/io.h"),
    ] {
        assert!(
            path.is_file(),
            "CUTTLEDOC_MLX_DIR is missing {}",
            path.display()
        );
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(source_directory)
        .args(["rev-parse", "HEAD"])
        .output()
        .expect("could not verify the MLX revision");
    require_success(Path::new("git"), &output);
    let revision = String::from_utf8(output.stdout).expect("MLX returned a non-UTF-8 revision");
    assert_eq!(
        revision.trim(),
        MLX_REVISION,
        "CUTTLEDOC_MLX_DIR must point to the ADR-0014 revision"
    );
}

fn required_path(name: &str) -> PathBuf {
    env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("missing Cargo build variable {name}"))
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
