import Foundation

/// A tiny JSON store. `load()` returns whatever JSON is saved (or nil); callers
/// validate it themselves. Implementations must never throw from `load()`.
public protocol JSONStorage: AnyObject {
    func load() -> Any?
    func save(_ object: Any) throws
}

public enum StorageError: Error {
    case notSerializable
}

/// JSON in a file. Writes are atomic (temp file, then rename), so a crash
/// mid-write cannot leave a half-written file.
public final class FileStorage: JSONStorage {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func load() -> Any? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }

    public func save(_ object: Any) throws {
        guard JSONSerialization.isValidJSONObject(object) else { throw StorageError.notSerializable }
        let data = try JSONSerialization.data(withJSONObject: object)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: url, options: .atomic)
    }
}

/// In-memory storage for tests and previews. Saving round-trips through JSON,
/// so what comes back has the same types a real file would give.
public final class MemoryStorage: JSONStorage {
    public private(set) var value: Any?

    public init(_ initial: Any? = nil) {
        value = initial
    }

    public func load() -> Any? { value }

    public func save(_ object: Any) throws {
        guard JSONSerialization.isValidJSONObject(object) else { throw StorageError.notSerializable }
        let data = try JSONSerialization.data(withJSONObject: object)
        value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
}
