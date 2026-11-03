import Foundation

enum AppPaths {
    /// ~/Library/Application Support/Cloudy Memory
    static let supportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Cloudy Memory", isDirectory: true)
    }()

    /// True when running from a real .app bundle (not `swift run`).
    static var isBundled: Bool {
        Bundle.main.bundlePath.hasSuffix(".app")
    }

    /// Where the 18/36 px icon frames live: the app bundle, or the repository's
    /// assets/frames folder when running from a source checkout with `swift run`.
    static var framesDirectory: URL {
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("frames", isDirectory: true),
           FileManager.default.fileExists(atPath: bundled.path) {
            return bundled
        }
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // CloudyMemory
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // macos
            .deletingLastPathComponent() // repository root
            .appendingPathComponent("assets")
            .appendingPathComponent("frames")
    }
}
