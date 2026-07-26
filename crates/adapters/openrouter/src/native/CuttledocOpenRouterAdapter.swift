import Darwin
import Foundation

public typealias CuttledocOpenRouterCancelCallback = @convention(c) (
    UnsafeMutableRawPointer?
) -> Int32

private let statusOK: Int32 = 0
private let statusInvalidInput: Int32 = 1
private let statusTransportFailed: Int32 = 2
private let statusCancelled: Int32 = 3
private let endpoint = URL(
    string: "https://openrouter.ai/api/v1/chat/completions"
)!
private let maximumResponseBytes = 4 * 1_024 * 1_024

private final class ResponseBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value: (Data?, URLResponse?, (any Error)?)?

    func store(
        data: Data?,
        response: URLResponse?,
        error: (any Error)?
    ) {
        lock.lock()
        value = (data, response, error)
        lock.unlock()
    }

    func take() -> (Data?, URLResponse?, (any Error)?)? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

private func copyCString(_ value: String) -> UnsafeMutablePointer<CChar>? {
    strdup(value)
}

private func fail(
    _ status: Int32,
    _ message: String,
    _ errorOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    errorOutput?.pointee = copyCString(message)
    return status
}

@_cdecl("cuttledoc_openrouter_send")
public func cuttledocOpenRouterSend(
    apiKey: UnsafePointer<CChar>?,
    requestJSON: UnsafePointer<CChar>?,
    timeoutMilliseconds: UInt64,
    cancelCallback: CuttledocOpenRouterCancelCallback?,
    callbackContext: UnsafeMutableRawPointer?,
    httpStatusOutput: UnsafeMutablePointer<Int32>?,
    responseOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?,
    errorOutput: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int32 {
    responseOutput?.pointee = nil
    errorOutput?.pointee = nil
    httpStatusOutput?.pointee = 0
    guard
        let apiKey,
        let requestJSON,
        let httpStatusOutput,
        let responseOutput,
        timeoutMilliseconds > 0
    else {
        return fail(
            statusInvalidInput,
            "invalid OpenRouter request arguments",
            errorOutput
        )
    }

    let credential = String(cString: apiKey)
    let body = Data(String(cString: requestJSON).utf8)
    guard !credential.isEmpty, !body.isEmpty else {
        return fail(
            statusInvalidInput,
            "OpenRouter credential and request body are required",
            errorOutput
        )
    }

    let timeout = TimeInterval(timeoutMilliseconds) / 1_000.0
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = timeout
    configuration.timeoutIntervalForResource = timeout
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false

    var request = URLRequest(
        url: endpoint,
        cachePolicy: .reloadIgnoringLocalCacheData,
        timeoutInterval: timeout
    )
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(
        "Bearer \(credential)",
        forHTTPHeaderField: "Authorization"
    )

    let semaphore = DispatchSemaphore(value: 0)
    let box = ResponseBox()
    let session = URLSession(configuration: configuration)
    let task = session.dataTask(with: request) { data, response, error in
        box.store(data: data, response: response, error: error)
        semaphore.signal()
    }
    task.resume()

    while semaphore.wait(timeout: .now() + .milliseconds(50)) == .timedOut {
        if cancelCallback?(callbackContext) != 0 {
            task.cancel()
            session.invalidateAndCancel()
            return fail(
                statusCancelled,
                "OpenRouter generation was cancelled",
                errorOutput
            )
        }
    }
    session.finishTasksAndInvalidate()

    guard let (data, response, error) = box.take() else {
        return fail(
            statusTransportFailed,
            "OpenRouter request produced no result",
            errorOutput
        )
    }
    if error != nil {
        return fail(
            statusTransportFailed,
            "OpenRouter request failed",
            errorOutput
        )
    }
    guard
        let response = response as? HTTPURLResponse,
        let data,
        data.count <= maximumResponseBytes,
        let responseBody = String(data: data, encoding: .utf8)
    else {
        return fail(
            statusTransportFailed,
            "OpenRouter returned an invalid or oversized response",
            errorOutput
        )
    }

    httpStatusOutput.pointee = Int32(response.statusCode)
    responseOutput.pointee = copyCString(responseBody)
    guard responseOutput.pointee != nil else {
        return fail(
            statusTransportFailed,
            "OpenRouter response allocation failed",
            errorOutput
        )
    }
    return statusOK
}

@_cdecl("cuttledoc_openrouter_free_string")
public func cuttledocOpenRouterFreeString(
    value: UnsafeMutablePointer<CChar>?
) {
    free(value)
}
