fn main() {
    println!("cargo:rustc-check-cfg=cfg(cuttledoc_gemma_mlx_native)");
    println!("cargo:rerun-if-env-changed=CUTTLEDOC_MLX_DIR");
}
