import AVFoundation
import CoreMedia
import Foundation
import Speech

private let cuttledocSpeechABIVersion: UInt32 = 1

@_cdecl("cuttledoc_speech_abi_version")
public func cuttledocSpeechABIVersionValue() -> UInt32 {
    cuttledocSpeechABIVersion
}
