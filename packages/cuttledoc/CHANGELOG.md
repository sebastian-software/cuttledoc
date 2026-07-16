# Changelog

## [2.0.1](https://github.com/sebastian-software/cuttledoc/compare/v2.0.0...v2.0.1) (2026-07-16)


### Documentation

* migrate site to ARDO ([#145](https://github.com/sebastian-software/cuttledoc/issues/145)) ([e0c5878](https://github.com/sebastian-software/cuttledoc/commit/e0c587883f1fdf67d521f8e0b3c216b22d91fda6))

## [2.0.0](https://github.com/sebastian-software/cuttledoc/compare/v1.0.0...v2.0.0) (2026-07-16)


### ⚠ BREAKING CHANGES

* cuttledoc is now macOS-only
* Package renamed from @cuttledoc/coreml-asr to @cuttledoc/parakeet-asr
    - CoreMLAsrEngine exported as legacy alias for backwards compatibility
    - New primary export: ParakeetAsrEngine
* **cli:** LLM correction is now enabled by default
* The 'phi4' and 'canary' backends are no longer available.
* Remove Apple Speech backend

### Features

* add benchmark script for all STT backends ([dfdd9dc](https://github.com/sebastian-software/cuttledoc/commit/dfdd9dc50289bce41740325a93b4870e2949bc22))
* add quality benchmark with LibriSpeech fixtures ([b95d051](https://github.com/sebastian-software/cuttledoc/commit/b95d0518273bfefb2ab7218f999aebf782c39521))
* **cli:** enable LLM correction by default ([2f63dff](https://github.com/sebastian-software/cuttledoc/commit/2f63dff3597a16eb3b8b3c4931a5a57bac339258))
* **coreml-asr:** add CoreML-based ASR package for Apple Silicon ([83cecc5](https://github.com/sebastian-software/cuttledoc/commit/83cecc50c852d9fa3389d726efe8b82b266543ab))
* **docs:** add complete SEO metadata ([#114](https://github.com/sebastian-software/cuttledoc/issues/114)) ([5585310](https://github.com/sebastian-software/cuttledoc/commit/5585310610186672261e1249c137b8454fc8addd))
* **ffmpeg:** add lightweight FFmpeg wrapper package ([af67ebe](https://github.com/sebastian-software/cuttledoc/commit/af67ebe102746bdc23c19e032957f3d09cc7bcc9))
* **ffmpeg:** add speech-optimized audio preprocessing ([2e8ab03](https://github.com/sebastian-software/cuttledoc/commit/2e8ab03dc0d0e3a8b7f5cb4918911171264e0653))
* **llm:** add benchmark for LLM text correction quality ([13b81a0](https://github.com/sebastian-software/cuttledoc/commit/13b81a0aeaea374ff46807c5d0a6306cbc647fca))
* **llm:** add comprehensive LLM correction benchmark ([6570b81](https://github.com/sebastian-software/cuttledoc/commit/6570b81c0995249fff5179e24fd643a5f2373344))
* **llm:** add Phi-4 Mini and Mistral Nemo models ([3801d2d](https://github.com/sebastian-software/cuttledoc/commit/3801d2dd00fd935d1841b2e7b278260ff22d44b6))
* **llm:** comprehensive LLM correction benchmark with model ranking ([d263f82](https://github.com/sebastian-software/cuttledoc/commit/d263f822c29812f924e70ba51b29ac2001934b0d))
* **llm:** extract LLM processing to @cuttledoc/llm package ([fe4488b](https://github.com/sebastian-software/cuttledoc/commit/fe4488b05b59cd663308a9519a860ea5e9b42fb5))
* **llm:** set phi4:14b as default, remove qwen3 ([becf546](https://github.com/sebastian-software/cuttledoc/commit/becf546194fad974be81cc5b1e662df159085061))
* **llm:** update model lists to current versions ([448fc8c](https://github.com/sebastian-software/cuttledoc/commit/448fc8c0fa25e1e06065c6fc0ed5de6d0d0e1552))
* refactor backends and add multi-provider support ([0b45c53](https://github.com/sebastian-software/cuttledoc/commit/0b45c53a1705e56a19ef9ef5793980f88f5324a0))
* **whisper-asr:** add CoreML/ANE support for Apple Neural Engine ([60e4fb2](https://github.com/sebastian-software/cuttledoc/commit/60e4fb290d85aed4a98a4bca79a600dcd302fc14))
* **whisper-asr:** add OpenAI Whisper ASR package with Metal GPU acceleration ([2082e79](https://github.com/sebastian-software/cuttledoc/commit/2082e797b83a51b8704fed07344e3301a54191a6))


### Bug Fixes

* activate prettier ignore rules ([#141](https://github.com/sebastian-software/cuttledoc/issues/141)) ([1d273d3](https://github.com/sebastian-software/cuttledoc/commit/1d273d33f94e7f23f4437ecb97061450173a003a))
* add audio normalization for low-volume sources ([a182160](https://github.com/sebastian-software/cuttledoc/commit/a182160c2f3b1f5e38af8a4b4aa65686b3e25a3e))
* align Whisper model identity and downloads ([#107](https://github.com/sebastian-software/cuttledoc/issues/107)) ([dc108ab](https://github.com/sebastian-software/cuttledoc/commit/dc108abd5850a0c543fb4b3b893381df7b6215cb))
* **coreml-asr:** adapt to FluidInference CoreML model format ([2840b90](https://github.com/sebastian-software/cuttledoc/commit/2840b90441e9bd815f78da55632058c9e3d54f70))
* **coreml-asr:** correct vocabulary loading for tokens with leading spaces ([b28b9db](https://github.com/sebastian-software/cuttledoc/commit/b28b9dbe505d83d1b72b0bad58584c892fc377f9))
* correct Parakeet v3 as multilingual (25 European languages) ([893f534](https://github.com/sebastian-software/cuttledoc/commit/893f5341c0aee808b2a4c49200621c373e7daccb))
* correct year to 2025 in ADR documentation ([c629431](https://github.com/sebastian-software/cuttledoc/commit/c6294314727e6d9cd611bd00e387ce4b711fd058))
* **docs:** make Pages deployment base-path safe ([#105](https://github.com/sebastian-software/cuttledoc/issues/105)) ([7f223f0](https://github.com/sebastian-software/cuttledoc/commit/7f223f068c71e0e7074ced1f55d1e0b97c7ad216))
* **llm:** add gemma3n:e4b and gemma3n:e2b to Ollama models ([61641c0](https://github.com/sebastian-software/cuttledoc/commit/61641c0e08bfe586d1b364bdba3bf87b23db8f9d))
* **llm:** correct repository URL to sebastian-software/cuttledoc ([99ce2d5](https://github.com/sebastian-software/cuttledoc/commit/99ce2d54eaa5bdd9bc8175a799e2cc1479dbeb58))
* **llm:** use correct Ollama model tags from ollama.com/library ([676ec56](https://github.com/sebastian-software/cuttledoc/commit/676ec5626e09dc4f9d78f42181b529a70e7afd45))
* **llm:** use gemma3n:e4b as default for GGUF/node-llama-cpp ([583db45](https://github.com/sebastian-software/cuttledoc/commit/583db4531e51f92885e8c4977f662ae2ec39ddd3))
* resolve ESLint strict type issues ([7a60cfa](https://github.com/sebastian-software/cuttledoc/commit/7a60cfa7d5240d2085d9ff2b9e7148d63b7f8c1e))
* resolve sherpa-onnx-node loading issues with pnpm ([80c8660](https://github.com/sebastian-software/cuttledoc/commit/80c8660887997190f3feae5555a980e634f78a45))
* resolve TypeScript strictness issues ([596a620](https://github.com/sebastian-software/cuttledoc/commit/596a620c709c7a90919fb28f1527c1cb0f137ffb))


### Refactoring

* **audio:** switch from @mmomtchev/ffmpeg to system ffmpeg ([937bcda](https://github.com/sebastian-software/cuttledoc/commit/937bcda488d584e3ac3450cd3708ee2094b82e6a))
* **cli:** rename enhance to format, remove TLDR ([31aa7cc](https://github.com/sebastian-software/cuttledoc/commit/31aa7cc0fdb86b5fdb3754f4a9cffc9aa3cfe9ed))
* consolidate language lists to single source ([acc6235](https://github.com/sebastian-software/cuttledoc/commit/acc6235ffee50978126f03dcb2a245dee6a94f3b))
* import engine types from CoreML packages ([a9cd0cf](https://github.com/sebastian-software/cuttledoc/commit/a9cd0cfe33013e0c0b7aa3cd4a4656f2f3e2e939))
* import language lists from CoreML packages ([d8da56a](https://github.com/sebastian-software/cuttledoc/commit/d8da56a4699510c950ac54a5ed1793083d7d01d3))
* **llm:** simplify Ollama model selection ([ca7ed7e](https://github.com/sebastian-software/cuttledoc/commit/ca7ed7ec5935f7e9ee8d408f4c01334c36f103a0))
* move LLM tests to @cuttledoc/llm package ([cc4b456](https://github.com/sebastian-software/cuttledoc/commit/cc4b456cfa7f4bbbc5a0018bf8687a1e39bd276c))
* remove cuttledoc/llm re-export, use @cuttledoc/llm directly ([620faed](https://github.com/sebastian-software/cuttledoc/commit/620faed2fbef0e8cccffb7637bf79f204f8e187e))
* remove explicit VAD handling ([f8673c8](https://github.com/sebastian-software/cuttledoc/commit/f8673c83e75ae296ae44de5fc4d9e6d07ef78767))
* remove Python-based ASR backends (Phi-4, Canary) ([a36da13](https://github.com/sebastian-software/cuttledoc/commit/a36da1387b4799f30aabef3de422f18be40cfce4))
* rename coreml-asr to parakeet-asr ([7d79ae5](https://github.com/sebastian-software/cuttledoc/commit/7d79ae5c273ecf87e80a8471cd6d2c1b3dd72e31))
* replace sherpa-onnx with CoreML backends ([9897571](https://github.com/sebastian-software/cuttledoc/commit/98975711595da0a91e8294691baf93ee4cab70e1))


### Documentation

* add ADR for Python ASR backends removal ([2e3a6f7](https://github.com/sebastian-software/cuttledoc/commit/2e3a6f7dd45e21fb6cafc1d8f5a3d851b720f379))
* add LLM correction benchmark results and TTS audio fixtures ([74166f9](https://github.com/sebastian-software/cuttledoc/commit/74166f971ed18e60ac9f536cf9ea2c14b8a41dcb))
* add measured WER for Canary-1B-v2 ([c54a9c2](https://github.com/sebastian-software/cuttledoc/commit/c54a9c2ca298d56139062fc9a4b13ef43b75d871))
* add measured WER for gpt-4o-mini-transcribe ([5b2a9e0](https://github.com/sebastian-software/cuttledoc/commit/5b2a9e0117894884064c1c66fa7c191eac59b14e))
* add measured WER for Phi-4 and OpenAI gpt-4o-transcribe ([ec4fdf4](https://github.com/sebastian-software/cuttledoc/commit/ec4fdf43fcccedf4b04ee84513926b5ccdfd2829))
* clarify distil-whisper is English-only ([8e7941b](https://github.com/sebastian-software/cuttledoc/commit/8e7941b74b6af58f80ad14144acee2993358837b))
* complete CLI reference ([#109](https://github.com/sebastian-software/cuttledoc/issues/109)) ([6381c79](https://github.com/sebastian-software/cuttledoc/commit/6381c79315897eb109be32940778dd9ac14a48c4))
* comprehensive LLM documentation and architecture updates ([5f50dc8](https://github.com/sebastian-software/cuttledoc/commit/5f50dc83d923141a65d5d802069fe98f1791d55d))
* evaluate next-generation ASR backends ([#115](https://github.com/sebastian-software/cuttledoc/issues/115)) ([b0b8c09](https://github.com/sebastian-software/cuttledoc/commit/b0b8c09131e6db099641d287b1ea64b8d97fd37f))
* expand guides and centralize benchmarks ([#113](https://github.com/sebastian-software/cuttledoc/issues/113)) ([877902a](https://github.com/sebastian-software/cuttledoc/commit/877902a354fd907a62d9d120ce5e30cdceaaf10d))
* fix LLM homepage import ([#106](https://github.com/sebastian-software/cuttledoc/issues/106)) ([4d611ab](https://github.com/sebastian-software/cuttledoc/commit/4d611ab1e5eaca3233cff4cdec2e3e818eac70bd))
* refresh project and benchmark guidance ([#140](https://github.com/sebastian-software/cuttledoc/issues/140)) ([60bfb91](https://github.com/sebastian-software/cuttledoc/commit/60bfb91a76a9627dc8ff3847863bfd74563d785b))
* reorder language columns (EN, ES, DE, FR, PT) ([7cb0d8d](https://github.com/sebastian-software/cuttledoc/commit/7cb0d8dcdc52f804fe68fdfa25e4f0bc032e60d4))
* repair ADR links ([#111](https://github.com/sebastian-software/cuttledoc/issues/111)) ([2cb5f41](https://github.com/sebastian-software/cuttledoc/commit/2cb5f41612030a8cc5f37007e0558a880b27ca99))
* repair API reference ([#101](https://github.com/sebastian-software/cuttledoc/issues/101)) ([1722d52](https://github.com/sebastian-software/cuttledoc/commit/1722d527ee5bf8c1079a7f314b89c5e8e09cca3c))
* sharpen README positioning and onboarding ([ead347b](https://github.com/sebastian-software/cuttledoc/commit/ead347b1d126a1c4fa03663b812aea10f7ed3d4a))
* simplify integration notes ([e49e290](https://github.com/sebastian-software/cuttledoc/commit/e49e290bab9a94782191bd02b8f1e8bdc62750e2))
* streamline ASR package READMEs ([3e87200](https://github.com/sebastian-software/cuttledoc/commit/3e87200286a85bcdf32661a679ea52907b26e5b6))
* sync contributor architecture guidance ([#110](https://github.com/sebastian-software/cuttledoc/issues/110)) ([5ede69e](https://github.com/sebastian-software/cuttledoc/commit/5ede69ed3ac5e830aea532735cb5ad68e3734960))
* sync LLM API reference ([#108](https://github.com/sebastian-software/cuttledoc/issues/108)) ([7218cda](https://github.com/sebastian-software/cuttledoc/commit/7218cda32929361ca7227b58dc165f328d5deed5))
* update benchmark with measured WER values for all models ([fd05f81](https://github.com/sebastian-software/cuttledoc/commit/fd05f8140794b8e6b6f6c6d92d2028f8f39847e4))
* update documentation for CoreML architecture ([99cefb2](https://github.com/sebastian-software/cuttledoc/commit/99cefb248404fe2f3ceb70e7e32ab6ebf1bd7fa7))
* update documentation for new backends ([457b26d](https://github.com/sebastian-software/cuttledoc/commit/457b26dcfbd41976c65266edc4c7a93ee6975dfb))
* update README for CoreML-only architecture ([0f2ec8f](https://github.com/sebastian-software/cuttledoc/commit/0f2ec8f52390e1694a284808cd63ee5025792e47))
* update README with CoreML performance metrics ([71546eb](https://github.com/sebastian-software/cuttledoc/commit/71546eb2296ca1fd015e1ca10dba8bb10fc43935))
* update security policy for 1.x ([#112](https://github.com/sebastian-software/cuttledoc/issues/112)) ([a4a8793](https://github.com/sebastian-software/cuttledoc/commit/a4a87939196d59fbeae90af9ddc6bd615de2a52c))
* update WER benchmark with FLEURS native speaker data ([65de802](https://github.com/sebastian-software/cuttledoc/commit/65de8029f5699c7951036a4be8848f76c47f732d))
* use GitHub Pages URL ([#102](https://github.com/sebastian-software/cuttledoc/issues/102)) ([ee4da3e](https://github.com/sebastian-software/cuttledoc/commit/ee4da3ea11fcd2d9e95d75a2a322a91c547005d4))
* **whisper-asr:** simplify to CoreML/ANE only ([09b7e46](https://github.com/sebastian-software/cuttledoc/commit/09b7e46a898962bb6d986db4c923ec30daa04dc5))

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
