#!/usr/bin/env swift
/**
 * Swift CLI tool for Apple Speech Recognition
 *
 * This tool handles the speech recognition separately from Node.js
 * to properly handle macOS permissions and RunLoop requirements.
 *
 * Usage: transcribe <audio_file> [language] [output_file]
 * Output: JSON with transcription result (to stdout or output_file)
 */

import Foundation
import Speech
import AVFoundation

struct TranscriptionSegment: Codable {
    let text: String
    let startSeconds: Double
    let endSeconds: Double
    let confidence: Double
}

struct TranscriptionResult: Codable {
    let success: Bool
    let text: String?
    let segments: [TranscriptionSegment]?
    let durationSeconds: Double?
    let error: String?
}

var outputFile: String?

func outputResult(_ result: TranscriptionResult) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let data = try? encoder.encode(result),
       let json = String(data: data, encoding: .utf8) {
        if let outPath = outputFile {
            try? json.write(toFile: outPath, atomically: true, encoding: .utf8)
        } else {
            print(json)
        }
    }
}

func transcribe(audioPath: String, language: String) {
    let fileURL = URL(fileURLWithPath: audioPath)

    // Check file exists
    guard FileManager.default.fileExists(atPath: audioPath) else {
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: nil,
            error: "Audio file not found: \(audioPath)"
        ))
        exit(1)
    }

    // Get audio duration
    let asset = AVAsset(url: fileURL)
    let duration = CMTimeGetSeconds(asset.duration)

    // Create locale and recognizer
    let locale = Locale(identifier: language)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: duration,
            error: "Failed to create speech recognizer for locale: \(language)"
        ))
        exit(1)
    }

    guard recognizer.isAvailable else {
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: duration,
            error: "Speech recognizer not available for locale: \(language)"
        ))
        exit(1)
    }

    // Check authorization
    let authStatus = SFSpeechRecognizer.authorizationStatus()
    if authStatus == .notDetermined {
        // Request authorization synchronously using a semaphore
        let semaphore = DispatchSemaphore(value: 0)
        var granted = false

        SFSpeechRecognizer.requestAuthorization { status in
            granted = (status == .authorized)
            semaphore.signal()
        }

        // Run the run loop while waiting
        while semaphore.wait(timeout: .now()) == .timedOut {
            RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
        }

        if !granted {
            outputResult(TranscriptionResult(
                success: false, text: nil, segments: nil, durationSeconds: duration,
                error: "Speech recognition authorization denied"
            ))
            exit(1)
        }
    } else if authStatus != .authorized {
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: duration,
            error: "Speech recognition not authorized (status: \(authStatus.rawValue))"
        ))
        exit(1)
    }

    // Create recognition request
    let request = SFSpeechURLRecognitionRequest(url: fileURL)
    request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
    request.shouldReportPartialResults = false

    if #available(macOS 13.0, *) {
        request.addsPunctuation = true
    }

    // Perform recognition
    var completed = false
    var resultText: String?
    var resultSegments: [TranscriptionSegment] = []
    var resultError: String?

    let task = recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            resultError = error.localizedDescription
            completed = true
            return
        }

        if let result = result, result.isFinal {
            resultText = result.bestTranscription.formattedString

            for segment in result.bestTranscription.segments {
                resultSegments.append(TranscriptionSegment(
                    text: segment.substring,
                    startSeconds: segment.timestamp,
                    endSeconds: segment.timestamp + segment.duration,
                    confidence: Double(segment.confidence)
                ))
            }

            completed = true
        }
    }

    // Run the run loop until completed or timeout
    let timeout = Date(timeIntervalSinceNow: 300) // 5 minutes
    while !completed && Date() < timeout {
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
    }

    if !completed {
        task.cancel()
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: duration,
            error: "Recognition timed out after 5 minutes"
        ))
        exit(1)
    }

    if let error = resultError {
        outputResult(TranscriptionResult(
            success: false, text: nil, segments: nil, durationSeconds: duration,
            error: error
        ))
        exit(1)
    }

    outputResult(TranscriptionResult(
        success: true,
        text: resultText,
        segments: resultSegments,
        durationSeconds: duration,
        error: nil
    ))
}

// MARK: - Server Mode

class TranscriptionServer {
    let socketPath: String
    var serverSocket: Int32 = -1
    var isRunning = false

    init(socketPath: String) {
        self.socketPath = socketPath
    }

    func start() {
        unlink(socketPath)

        serverSocket = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            fputs("Failed to create socket\n", stderr)
            exit(1)
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        socketPath.withCString { ptr in
            withUnsafeMutablePointer(to: &addr.sun_path) { pathPtr in
                let pathBuffer = UnsafeMutableRawPointer(pathPtr).assumingMemoryBound(to: CChar.self)
                strcpy(pathBuffer, ptr)
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                bind(serverSocket, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }

        guard bindResult >= 0 else {
            fputs("Failed to bind socket: \(String(cString: strerror(errno)))\n", stderr)
            exit(1)
        }

        guard listen(serverSocket, 5) >= 0 else {
            fputs("Failed to listen on socket\n", stderr)
            exit(1)
        }

        chmod(socketPath, 0o777)
        isRunning = true
        fputs("Server listening on \(socketPath)\n", stderr)

        while isRunning {
            let clientSocket = accept(serverSocket, nil, nil)
            guard clientSocket >= 0 else {
                if isRunning { fputs("Accept failed\n", stderr) }
                continue
            }
            handleClient(clientSocket)
            close(clientSocket)
        }

        close(serverSocket)
        unlink(socketPath)
    }

    func handleClient(_ clientSocket: Int32) {
        var buffer = [CChar](repeating: 0, count: 65536)
        let bytesRead = read(clientSocket, &buffer, buffer.count - 1)
        guard bytesRead > 0 else { return }

        buffer[bytesRead] = 0
        let requestString = String(cString: buffer)

        guard let data = requestString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = json["action"] as? String else {
            sendError(clientSocket, "Invalid request")
            return
        }

        switch action {
        case "ping":
            sendJSON(clientSocket, ["success": true, "message": "pong"])
        case "shutdown":
            sendJSON(clientSocket, ["success": true, "message": "shutting down"])
            isRunning = false
        case "transcribe":
            guard let audioPath = json["audioPath"] as? String else {
                sendError(clientSocket, "audioPath is required")
                return
            }
            let language = json["language"] as? String ?? "en-US"
            let result = performServerTranscription(audioPath: audioPath, language: language)
            sendJSON(clientSocket, result)
        default:
            sendError(clientSocket, "Unknown action: \(action)")
        }
    }

    func sendJSON(_ clientSocket: Int32, _ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              var json = String(data: data, encoding: .utf8) else { return }
        json += "\n"
        json.withCString { ptr in _ = write(clientSocket, ptr, strlen(ptr)) }
    }

    func sendError(_ clientSocket: Int32, _ message: String) {
        sendJSON(clientSocket, ["success": false, "error": message])
    }

    func performServerTranscription(audioPath: String, language: String) -> [String: Any] {
        let fileURL = URL(fileURLWithPath: audioPath)

        guard FileManager.default.fileExists(atPath: audioPath) else {
            return ["success": false, "error": "File not found: \(audioPath)"]
        }

        let asset = AVAsset(url: fileURL)
        let duration = CMTimeGetSeconds(asset.duration)

        let locale = Locale(identifier: language)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            return ["success": false, "error": "Recognizer not available", "durationSeconds": duration]
        }

        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.shouldReportPartialResults = false
        if #available(macOS 13.0, *) { request.addsPunctuation = true }

        var completed = false
        var resultText: String?
        var resultSegments: [[String: Any]] = []
        var resultError: String?

        let task = recognizer.recognitionTask(with: request) { result, error in
            if let error = error {
                resultError = error.localizedDescription
                completed = true
                return
            }
            if let result = result, result.isFinal {
                resultText = result.bestTranscription.formattedString
                for seg in result.bestTranscription.segments {
                    resultSegments.append([
                        "text": seg.substring,
                        "startSeconds": seg.timestamp,
                        "endSeconds": seg.timestamp + seg.duration,
                        "confidence": Double(seg.confidence)
                    ])
                }
                completed = true
            }
        }

        let timeout = Date(timeIntervalSinceNow: 300)
        while !completed && Date() < timeout {
            RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
        }

        if !completed {
            task.cancel()
            return ["success": false, "error": "Timeout", "durationSeconds": duration]
        }

        if let error = resultError {
            return ["success": false, "error": error, "durationSeconds": duration]
        }

        return [
            "success": true,
            "text": resultText ?? "",
            "segments": resultSegments,
            "durationSeconds": duration
        ]
    }
}

// MARK: - Main

let args = CommandLine.arguments

// Server mode
if args.contains("--server") {
    var socketPath = "/tmp/cuttledoc-speech.sock"
    if let idx = args.firstIndex(of: "--socket"), idx + 1 < args.count {
        socketPath = args[idx + 1]
    }

    signal(SIGINT) { _ in exit(0) }
    signal(SIGTERM) { _ in exit(0) }

    let server = TranscriptionServer(socketPath: socketPath)
    server.start()
    exit(0)
}

// CLI mode
guard args.count >= 2 else {
    fputs("Usage: Cuttledoc <audio_file> [language] [output_file]\n", stderr)
    fputs("       Cuttledoc --server [--socket /path/to/socket]\n", stderr)
    exit(1)
}

let audioPath = args[1]
let language = args.count > 2 ? args[2] : "en-US"
outputFile = args.count > 3 ? args[3] : nil

transcribe(audioPath: audioPath, language: language)

