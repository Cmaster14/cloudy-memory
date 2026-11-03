import Foundation

/// Milliseconds since the Unix epoch. Every timestamp in the app uses this unit,
/// exactly as the Electron app does, so saved files are interchangeable.
public typealias Millis = Int64

public enum SystemTime {
    public static func nowMs() -> Millis {
        Millis((Date().timeIntervalSince1970 * 1000).rounded())
    }
}

/// Helpers for reading loosely-typed JSON (hand-edited or corrupt files must
/// never crash the app, so nothing here force-casts).
enum JSONValue {
    /// A finite JSON number as a Double. Booleans, strings and everything else give nil.
    static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber else { return nil }
        #if canImport(Darwin)
        if CFGetTypeID(n) == CFBooleanGetTypeID() { return nil }
        #endif
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }

    /// Converts to Millis, clamping absurd magnitudes instead of trapping.
    static func clampedMillis(_ d: Double) -> Millis {
        Millis(max(-9.0e15, min(9.0e15, d.rounded())))
    }
}

/// String helpers that count UTF-16 code units, the way JavaScript's
/// `string.length` does, so truncation matches the Windows build.
enum TextUtil {
    static func utf16Count(_ s: String) -> Int { s.utf16.count }

    /// The first `n` UTF-16 code units, never splitting a surrogate pair.
    static func prefixUTF16(_ s: String, _ n: Int) -> String {
        let units = Array(s.utf16)
        var end = min(max(0, n), units.count)
        if end > 0, end < units.count, UTF16.isLeadSurrogate(units[end - 1]) { end -= 1 }
        return String(decoding: units[0..<end], as: UTF16.self)
    }

    static func trimTrailingWhitespace(_ s: String) -> String {
        var scalars = Array(s.unicodeScalars)
        while let last = scalars.last, CharacterSet.whitespacesAndNewlines.contains(last) {
            scalars.removeLast()
        }
        var view = String.UnicodeScalarView()
        view.append(contentsOf: scalars)
        return String(view)
    }

    static func trimmed(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
