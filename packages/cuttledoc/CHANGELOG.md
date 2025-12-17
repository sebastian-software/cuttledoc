# Changelog

## 1.0.0 (2025-12-17)

### ⚠ BREAKING CHANGES

- **docs:** Documentation now uses Fumadocs instead of custom implementation

### Features

- add release-it for manual releases ([9e0e1f5](https://github.com/sebastian-software/cuttledoc/commit/9e0e1f571a86bde191a1543d1320349ff8995f52))
- **apple:** implement native Apple Speech Framework bridge ([fbeea5a](https://github.com/sebastian-software/cuttledoc/commit/fbeea5add7fddd816312560a1ec9b6d74e25a662))
- **audio:** add native ffmpeg audio preprocessing with streaming ([6d2064d](https://github.com/sebastian-software/cuttledoc/commit/6d2064da28bfe9f0eac98d2bc5dbbf96de7f60f9))
- **cli:** add command-line interface ([19b9876](https://github.com/sebastian-software/cuttledoc/commit/19b9876c7472bd6ee5e608046c6da5ec2cfd23b8))
- **docs:** add custom octopus logo with ink drops ([d1e6e57](https://github.com/sebastian-software/cuttledoc/commit/d1e6e575b578037910ad28897554ead841568e06))
- **docs:** add technology logos for Powered By section ([f7e9f54](https://github.com/sebastian-software/cuttledoc/commit/f7e9f544b83f4e112e1051dc9c5ee2d19f141658))
- **docs:** migrate to Fumadocs with React Router ([b415eef](https://github.com/sebastian-software/cuttledoc/commit/b415eef7f8b79ca949f3cb62afd2d25bfa3e0475))
- initial TypeScript project setup for local-transcribe ([8e723f5](https://github.com/sebastian-software/cuttledoc/commit/8e723f565ec8c953372c8908c9c0a352091955ae))
- **llm:** add Gemma 3n models, set E4B as default ([f5eabce](https://github.com/sebastian-software/cuttledoc/commit/f5eabceac607a57581f49351e2732ea05cc6eb8d))
- **llm:** add native LLM processor for transcript enhancement ([de13872](https://github.com/sebastian-software/cuttledoc/commit/de13872b9e326afcf92b2b0174fb4bec4a37c777))
- **llm:** improve prompts with TLDR, headings, and mode selection ([fdb68c4](https://github.com/sebastian-software/cuttledoc/commit/fdb68c464ee86a61cf2770ea864324e9dcc9031f))
- new logo ([06f0f46](https://github.com/sebastian-software/cuttledoc/commit/06f0f46bf4e11d8bffbd6cff81ff79c0bfd9f433))
- **sherpa:** add multi-format audio support via ffmpeg preprocessing ([e02b27e](https://github.com/sebastian-software/cuttledoc/commit/e02b27e4413c0e53103c93e34ccae20599fb24e5))
- **sherpa:** implement sherpa-onnx backend for Parakeet and Whisper ([7e67027](https://github.com/sebastian-software/cuttledoc/commit/7e67027f0b005fae559580282a4feb420511a9e4))
- **stats:** add comprehensive transcription job statistics ([f3a4b8f](https://github.com/sebastian-software/cuttledoc/commit/f3a4b8f56be812f3144d13f026630cb130bd44e9))

### Bug Fixes

- apply prettier ([ee26e05](https://github.com/sebastian-software/cuttledoc/commit/ee26e05086b1462b070ac9a3743cc12d2d5894ca))
- **ci:** correct docs build output path ([9b1b749](https://github.com/sebastian-software/cuttledoc/commit/9b1b749787419fbe6e1f7ffdaf44b120b08e1268))
- cleanup ([a68cd81](https://github.com/sebastian-software/cuttledoc/commit/a68cd8105ad35e8e0c8d7804ac9ec358e0e97487))
- disable prerendering to fix Windows CI build error ([4d96029](https://github.com/sebastian-software/cuttledoc/commit/4d960292c404d1206c36aaf8e62105c179c237d6))
- disable ssr ([8e5820a](https://github.com/sebastian-software/cuttledoc/commit/8e5820aac33d4f71dc5b1b0180c5b9d9db88f1a2))
- **docs:** add base path support for GitHub Pages ([cdafed0](https://github.com/sebastian-software/cuttledoc/commit/cdafed0d577bf8ed164f5b091d87729daeec2399))
- **docs:** disable SSR and fix path alias resolution for Windows ([1ffe1ac](https://github.com/sebastian-software/cuttledoc/commit/1ffe1ace0e733bdccc7c701b2edd178e9d6db54e))
- **docs:** explicitly specify tsconfig path for vite-tsconfig-paths ([7f16b9d](https://github.com/sebastian-software/cuttledoc/commit/7f16b9dc26c3d671565e5188aa40b64f6af6d58e))
- **docs:** resolve ESLint errors ([c44904b](https://github.com/sebastian-software/cuttledoc/commit/c44904b2387fadad6183b08667484ce2aea656b1))
- **docs:** set React Router basename for GitHub Pages ([1a36bac](https://github.com/sebastian-software/cuttledoc/commit/1a36baca102ceea8f8ef92087fa9c682ac6a6df0))
- **docs:** updated ([48d54ea](https://github.com/sebastian-software/cuttledoc/commit/48d54ea4736675053e553d4e5f77ae9484dd5870))
- **docs:** use asset helper for correct base path on images ([4928417](https://github.com/sebastian-software/cuttledoc/commit/4928417abfdd8e6bf3c957cd63404c12a1e8ca43))
- husky issues ([29be8d0](https://github.com/sebastian-software/cuttledoc/commit/29be8d0773e22f86f113c18bf4cc6345a07a701b))
- linter auto ([81fa0c9](https://github.com/sebastian-software/cuttledoc/commit/81fa0c93b7571a11bf820e18d0437847de9aa6db))
- paths issues ([f71e0b7](https://github.com/sebastian-software/cuttledoc/commit/f71e0b7eb3fc543a1990ac5d919b5b486a7ff735))
- re-enable prerendering with Windows path normalization ([a02acb8](https://github.com/sebastian-software/cuttledoc/commit/a02acb847e015a4fe3db85991f7b47c1b8a43e02))
- release workflow ([d1628d1](https://github.com/sebastian-software/cuttledoc/commit/d1628d1c5b98f6607fbd185b37518f5602493767))
- resolve build issues and update documentation ([8384e74](https://github.com/sebastian-software/cuttledoc/commit/8384e7427a359e149ff56601171f249ed18a83a0))
- **test:** don't assume ffmpeg native bindings are built ([64550c9](https://github.com/sebastian-software/cuttledoc/commit/64550c984de1cca376d5b1a67f102c02bc507611))

### Refactoring

- **docs:** co-locate assets with components ([3a0ea9b](https://github.com/sebastian-software/cuttledoc/commit/3a0ea9bf0e96703549d669334e7115057b629cd7))
- **docs:** use ES module imports for images ([40b0b64](https://github.com/sebastian-software/cuttledoc/commit/40b0b6442c1c23a936452270418b88188b037290))
- merge CLI into main cuttledoc package ([2ca92a0](https://github.com/sebastian-software/cuttledoc/commit/2ca92a0f97cdef2e394e1bdfd0826859c359ef06))
- remove unnecessary ReactNode return types and custom ESLint rules ([e15bfbf](https://github.com/sebastian-software/cuttledoc/commit/e15bfbfdc5b2a7a8626ab6a21e102675774c3b95))

### Documentation

- add ADR-007 for native ffmpeg audio preprocessing ([bd40c2e](https://github.com/sebastian-software/cuttledoc/commit/bd40c2e81bebd8ccc1ebb5bb2a8442c58f24d2c6))
- add architecture decision records ([7371130](https://github.com/sebastian-software/cuttledoc/commit/7371130493e465249abbdc6cc234d9e44d2cf8dc))
- add comprehensive open source project documentation ([b35c93c](https://github.com/sebastian-software/cuttledoc/commit/b35c93cc4b065a6512940ef857a5d025edf2c3c6))
- add README and GitHub Actions workflows ([f6d9342](https://github.com/sebastian-software/cuttledoc/commit/f6d934222fcb2037d5b894ecaab403f71b48457c))
- update dates in DECISIONS.md to current date ([4c90a30](https://github.com/sebastian-software/cuttledoc/commit/4c90a30e1c34f51b1cb121f11dcf05a19a8fb1b7))
- update DECISIONS.md to reflect current project state ([bf73e66](https://github.com/sebastian-software/cuttledoc/commit/bf73e6671a1b2ccd36423b0acf1eb976341b932f))
- update README with logo and Parakeet v3 info ([c710375](https://github.com/sebastian-software/cuttledoc/commit/c7103751c947638501712b3660514b6fb233fe3b))
