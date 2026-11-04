import Foundation

enum AppPaths {
    /// ~/Library/Application Support/Cloudy Memory
    static let supportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Cloudy Memory", isDirectory: true)
    }()

    /// True when running from a real .app bundle (not Xcode's bare executable or `swift run`).
    static var isBundled: Bool {
        Bundle.main.bundlePath.hasSuffix(".app")
    }
}
