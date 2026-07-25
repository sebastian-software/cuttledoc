import AVFoundation
import CoreMedia
import Darwin
import Foundation
import Speech

public typealias CuttledocSpeechSegmentCallback = @convention(c) (
    UnsafeMutableRawPointer?,
    UInt64,
    Int64,
    Int64,
    UnsafePointer<CChar>?,
    UInt8,
    Double
) -> Void

public typealias CuttledocSpeechUpdateCallback = @convention(c) (
    UnsafeMutableRawPointer?,
    UInt64,
    Int32,
    Int32,
    Int64,
    Int64,
    UnsafePointer<CChar>?
) -> Void

public typealias CuttledocSpeechLocaleCallback = @convention(c) (
    UnsafeMutableRawPointer?,
    Int32,
    UnsafePointer<CChar>?
) -> Void

private let cuttledocSpeechABIVersion: UInt32 = 2
private let localeSupported: Int32 = 1
private let localeInstalled: Int32 = 2
private let localeReserved: Int32 = 3
private let updateReplace: Int32 = 1
private let updateRevoke: Int32 = 2
private let stabilityNone: Int32 = 0
private let stabilityVolatile: Int32 = 1
private let stabilityFinal: Int32 = 2
private let speechErrorDomain = "CuttledocSpeechAdapter"

private final class BlockingBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value?

    func store(_ value: Value) {
        lock.lock()
        self.value = value
        lock.unlock()
    }

    func take() -> Value? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

private final class CallbackContext: @unchecked Sendable {
    let raw: UnsafeMutableRawPointer?

    init(_ raw: UnsafeMutableRawPointer?) {
        self.raw = raw
    }
}

private final class SpeechSession: @unchecked Sendable {
    private enum State {
        case active
        case finishing
        case finished
        case cancelled
        case closed
    }

    private let analyzer: SpeechAnalyzer
    private let transcriber: SpeechTranscriber
    private let format: AVAudioFormat
    private let continuation: AsyncStream<AnalyzerInput>.Continuation
    private let stream: AsyncStream<AnalyzerInput>
    private let segmentCallback: CuttledocSpeechSegmentCallback
    private let updateCallback: CuttledocSpeechUpdateCallback
    private let callbackContext: UnsafeMutableRawPointer?
    private let locale: Locale
    private let ownsReservation: Bool
    private let lock = NSLock()
    private var frameCursor: Int64 = 0
    private var state: State = .active
    private var analysisTask: Task<Void, Error>?
    private var resultTask: Task<Void, Error>?

    private init(
        analyzer: SpeechAnalyzer,
        transcriber: SpeechTranscriber,
        format: AVAudioFormat,
        continuation: AsyncStream<AnalyzerInput>.Continuation,
        stream: AsyncStream<AnalyzerInput>,
        segmentCallback: @escaping CuttledocSpeechSegmentCallback,
        updateCallback: @escaping CuttledocSpeechUpdateCallback,
        callbackContext: UnsafeMutableRawPointer?,
        locale: Locale,
        ownsReservation: Bool
    ) {
        self.analyzer = analyzer
        self.transcriber = transcriber
        self.format = format
        self.continuation = continuation
        self.stream = stream
        self.segmentCallback = segmentCallback
        self.updateCallback = updateCallback
        self.callbackContext = callbackContext
        self.locale = locale
        self.ownsReservation = ownsReservation
    }

    static func make(
        localeIdentifier: String,
        sampleRate: UInt32,
        segmentCallback: @escaping CuttledocSpeechSegmentCallback,
        updateCallback: @escaping CuttledocSpeechUpdateCallback,
        callbackContext: UnsafeMutableRawPointer?
    ) async throws -> SpeechSession {
        guard sampleRate > 0 else {
            throw speechError(10, "sample rate must be positive")
        }
        guard let locale = await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: localeIdentifier)
        ) else {
            throw speechError(11, "locale \(localeIdentifier) is not supported")
        }

        let previouslyReserved = await AssetInventory.reservedLocales.contains {
            $0.identifier == locale.identifier
        }
        let reservationSucceeded = try await AssetInventory.reserve(locale: locale)
        let ownsReservation = reservationSucceeded && !previouslyReserved

        do {
            let transcriber = SpeechTranscriber(
                locale: locale,
                transcriptionOptions: [],
                reportingOptions: [.volatileResults],
                attributeOptions: [.audioTimeRange, .transcriptionConfidence]
            )
            if let request = try await AssetInventory.assetInstallationRequest(
                supporting: [transcriber]
            ) {
                try await request.downloadAndInstall()
            }

            guard let format = AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: Double(sampleRate),
                channels: 1,
                interleaved: false
            ) else {
                throw speechError(12, "could not create mono Int16 PCM format")
            }

            var capturedContinuation: AsyncStream<AnalyzerInput>.Continuation?
            let stream = AsyncStream<AnalyzerInput>(
                bufferingPolicy: .bufferingOldest(64)
            ) { continuation in
                capturedContinuation = continuation
            }
            guard let continuation = capturedContinuation else {
                throw speechError(13, "could not create PCM input stream")
            }

            let analyzer = SpeechAnalyzer(
                modules: [transcriber],
                options: .init(
                    priority: .userInitiated,
                    modelRetention: .whileInUse
                )
            )
            try await analyzer.prepareToAnalyze(in: format)

            let session = SpeechSession(
                analyzer: analyzer,
                transcriber: transcriber,
                format: format,
                continuation: continuation,
                stream: stream,
                segmentCallback: segmentCallback,
                updateCallback: updateCallback,
                callbackContext: callbackContext,
                locale: locale,
                ownsReservation: ownsReservation
            )
            session.startTasks()
            return session
        } catch {
            if ownsReservation {
                _ = await AssetInventory.release(reservedLocale: locale)
            }
            throw error
        }
    }

    var localeIdentifier: String {
        locale.identifier
    }

    func push(_ samples: UnsafePointer<Float>, count: Int) -> Int32 {
        guard count > 0, count <= Int(UInt32.max) else {
            return 2
        }
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(count)
        ), let destination = buffer.int16ChannelData?[0] else {
            return 1
        }
        buffer.frameLength = AVAudioFrameCount(count)
        for index in 0..<count {
            let sample = max(-1, min(1, samples[index]))
            destination[index] = Int16(
                (sample * Float(Int16.max)).rounded()
            )
        }

        lock.lock()
        defer { lock.unlock() }
        guard state == .active else {
            return 3
        }

        let start = frameCursor
        let input = AnalyzerInput(
            buffer: buffer,
            bufferStartTime: CMTime(
                value: start,
                timescale: CMTimeScale(format.sampleRate)
            )
        )
        switch continuation.yield(input) {
        case .enqueued:
            frameCursor += Int64(count)
            return 0
        case .dropped:
            return 4
        case .terminated:
            return 3
        @unknown default:
            return 1
        }
    }

    func finish() async throws {
        let wasActive = lock.withLock {
            guard state == .active else {
                return false
            }
            state = .finishing
            return true
        }
        guard wasActive else {
            throw speechError(14, "session is not active")
        }
        continuation.finish()

        guard let analysisTask, let resultTask else {
            throw speechError(15, "session tasks were not started")
        }
        try await analysisTask.value
        try await resultTask.value
        lock.withLock {
            state = .finished
        }
    }

    func cancel() async {
        let shouldCancel = lock.withLock {
            guard state != .closed && state != .cancelled else {
                return false
            }
            state = .cancelled
            return true
        }
        guard shouldCancel else {
            return
        }
        continuation.finish()
        await analyzer.cancelAndFinishNow()
        analysisTask?.cancel()
        resultTask?.cancel()
        _ = try? await analysisTask?.value
        _ = try? await resultTask?.value
    }

    func close() async {
        let (needsCancellation, alreadyClosed) = lock.withLock {
            (state == .active || state == .finishing, state == .closed)
        }
        if alreadyClosed {
            return
        }
        if needsCancellation {
            await cancel()
        }
        if ownsReservation {
            _ = await AssetInventory.release(reservedLocale: locale)
        }
        lock.withLock {
            state = .closed
        }
    }

    private func startTasks() {
        let analyzer = self.analyzer
        let stream = self.stream
        analysisTask = Task {
            if let lastSample = try await analyzer.analyzeSequence(stream) {
                try await analyzer.finalizeAndFinish(through: lastSample)
            } else {
                await analyzer.cancelAndFinishNow()
            }
        }

        let transcriber = self.transcriber
        let segmentCallback = self.segmentCallback
        let updateCallback = self.updateCallback
        let context = self.callbackContext
        resultTask = Task {
            var sequence: UInt64 = 0
            for try await result in transcriber.results {
                sequence += 1
                let text = String(result.text.characters)
                let isRevoke = text.isEmpty
                if !isRevoke {
                    emitSegments(
                        result,
                        sequence: sequence,
                        context: context,
                        callback: segmentCallback
                    )
                }
                let range = milliseconds(result.range)
                text.withCString { textPointer in
                    updateCallback(
                        context,
                        sequence,
                        isRevoke ? updateRevoke : updateReplace,
                        isRevoke
                            ? stabilityNone
                            : (result.isFinal ? stabilityFinal : stabilityVolatile),
                        range.start,
                        range.end,
                        textPointer
                    )
                }
            }
        }
    }
}

@_cdecl("cuttledoc_speech_abi_version")
public func cuttledocSpeechABIVersionValue() -> UInt32 {
    cuttledocSpeechABIVersion
}

@_cdecl("cuttledoc_speech_locale_inventory")
public func cuttledocSpeechLocaleInventory(
    _ callback: CuttledocSpeechLocaleCallback,
    _ callbackContext: UnsafeMutableRawPointer?,
    _ maximumReservedLocales: UnsafeMutablePointer<UInt32>,
    _ errorOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
    maximumReservedLocales.pointee = 0
    errorOutput.pointee = nil
    let result: Result<([String], [String], [String], UInt32), Error> = blocking {
        async let supported = SpeechTranscriber.supportedLocales
        async let installed = SpeechTranscriber.installedLocales
        async let reserved = AssetInventory.reservedLocales
        guard let maximum = UInt32(exactly: AssetInventory.maximumReservedLocales) else {
            throw speechError(17, "maximum reserved locale count exceeds UInt32")
        }
        return await (
            supported.map(\.identifier).sorted(),
            installed.map(\.identifier).sorted(),
            reserved.map(\.identifier).sorted(),
            maximum
        )
    }
    switch result {
    case let .success((supported, installed, reserved, maximum)):
        maximumReservedLocales.pointee = maximum
        emitLocales(
            supported,
            kind: localeSupported,
            context: callbackContext,
            callback: callback
        )
        emitLocales(
            installed,
            kind: localeInstalled,
            context: callbackContext,
            callback: callback
        )
        emitLocales(
            reserved,
            kind: localeReserved,
            context: callbackContext,
            callback: callback
        )
        return 0
    case let .failure(error):
        errorOutput.pointee = strdup(String(describing: error))
        return 1
    }
}

@_cdecl("cuttledoc_speech_session_create")
public func cuttledocSpeechSessionCreate(
    _ locale: UnsafePointer<CChar>,
    _ sampleRate: UInt32,
    _ segmentCallback: @escaping CuttledocSpeechSegmentCallback,
    _ updateCallback: @escaping CuttledocSpeechUpdateCallback,
    _ callbackContext: UnsafeMutableRawPointer?,
    _ resolvedLocale: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
    _ errorOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> UnsafeMutableRawPointer? {
    resolvedLocale.pointee = nil
    errorOutput.pointee = nil
    guard let locale = String(validatingUTF8: locale) else {
        errorOutput.pointee = strdup("locale is not valid UTF-8")
        return nil
    }

    let sendableContext = CallbackContext(callbackContext)
    let result: Result<SpeechSession, Error> = blocking {
        try await SpeechSession.make(
            localeIdentifier: locale,
            sampleRate: sampleRate,
            segmentCallback: segmentCallback,
            updateCallback: updateCallback,
            callbackContext: sendableContext.raw
        )
    }
    switch result {
    case let .success(session):
        resolvedLocale.pointee = strdup(session.localeIdentifier)
        return Unmanaged.passRetained(session).toOpaque()
    case let .failure(error):
        errorOutput.pointee = strdup(String(describing: error))
        return nil
    }
}

@_cdecl("cuttledoc_speech_session_push_pcm_f32")
public func cuttledocSpeechSessionPushPCMFloat32(
    _ handle: UnsafeMutableRawPointer,
    _ samples: UnsafePointer<Float>,
    _ sampleCount: UInt32
) -> Int32 {
    speechSession(handle).push(samples, count: Int(sampleCount))
}

@_cdecl("cuttledoc_speech_session_finish")
public func cuttledocSpeechSessionFinish(
    _ handle: UnsafeMutableRawPointer,
    _ errorOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
    errorOutput.pointee = nil
    let session = speechSession(handle)
    let result: Result<Void, Error> = blocking {
        try await session.finish()
    }
    switch result {
    case .success:
        return 0
    case let .failure(error):
        errorOutput.pointee = strdup(String(describing: error))
        return 1
    }
}

@_cdecl("cuttledoc_speech_session_cancel")
public func cuttledocSpeechSessionCancel(_ handle: UnsafeMutableRawPointer) {
    let session = speechSession(handle)
    let _: Result<Void, Error> = blocking {
        await session.cancel()
    }
}

@_cdecl("cuttledoc_speech_session_destroy")
public func cuttledocSpeechSessionDestroy(_ handle: UnsafeMutableRawPointer) {
    let session = speechSession(handle)
    let _: Result<Void, Error> = blocking {
        await session.close()
    }
    Unmanaged<SpeechSession>.fromOpaque(handle).release()
}

@_cdecl("cuttledoc_speech_free_string")
public func cuttledocSpeechFreeString(_ value: UnsafeMutablePointer<CChar>?) {
    free(value)
}

private func blocking<Value: Sendable>(
    _ operation: @escaping @Sendable () async throws -> Value
) -> Result<Value, Error> {
    let completion = DispatchSemaphore(value: 0)
    let box = BlockingBox<Result<Value, Error>>()
    Task {
        do {
            box.store(.success(try await operation()))
        } catch {
            box.store(.failure(error))
        }
        completion.signal()
    }
    completion.wait()
    return box.take() ?? .failure(
        speechError(16, "Swift task completed without a result")
    )
}

private func speechSession(_ handle: UnsafeMutableRawPointer) -> SpeechSession {
    Unmanaged<SpeechSession>.fromOpaque(handle).takeUnretainedValue()
}

private func emitSegments(
    _ result: SpeechTranscriber.Result,
    sequence: UInt64,
    context: UnsafeMutableRawPointer?,
    callback: CuttledocSpeechSegmentCallback
) {
    for run in result.text.runs {
        let text = String(result.text[run.range].characters)
        if text.isEmpty {
            continue
        }
        let timeRange =
            run[AttributeScopes.SpeechAttributes.TimeRangeAttribute.self]
            ?? result.range
        let range = milliseconds(timeRange)
        let confidence =
            run[AttributeScopes.SpeechAttributes.ConfidenceAttribute.self]
        text.withCString { textPointer in
            callback(
                context,
                sequence,
                range.start,
                range.end,
                textPointer,
                confidence == nil ? 0 : 1,
                confidence ?? 0
            )
        }
    }
}

private func emitLocales(
    _ locales: [String],
    kind: Int32,
    context: UnsafeMutableRawPointer?,
    callback: CuttledocSpeechLocaleCallback
) {
    for locale in locales {
        locale.withCString { pointer in
            callback(context, kind, pointer)
        }
    }
}

private func milliseconds(_ range: CMTimeRange) -> (start: Int64, end: Int64) {
    let start = CMTimeGetSeconds(range.start)
    let end = CMTimeGetSeconds(CMTimeRangeGetEnd(range))
    return (
        start: finiteMilliseconds(start),
        end: finiteMilliseconds(end)
    )
}

private func finiteMilliseconds(_ seconds: Double) -> Int64 {
    guard seconds.isFinite else {
        return 0
    }
    return Int64((seconds * 1_000).rounded())
}

private func speechError(_ code: Int, _ message: String) -> NSError {
    NSError(
        domain: speechErrorDomain,
        code: code,
        userInfo: [NSLocalizedDescriptionKey: message]
    )
}
