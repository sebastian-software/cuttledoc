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

// Main
let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: transcribe <audio_file> [language] [output_file]\n", stderr)
    exit(1)
}

let audioPath = args[1]
let language = args.count > 2 ? args[2] : "en-US"
outputFile = args.count > 3 ? args[3] : nil

transcribe(audioPath: audioPath, language: language)

