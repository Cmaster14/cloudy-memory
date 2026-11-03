import Foundation
import XCTest
@testable import CloudyMemoryCore

// MARK: - Shared fixtures (shared/fixtures/*.json, also run by test/fixtures.test.js)

enum Fixtures {
    /// <repo>/shared/fixtures, found relative to this file.
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // CloudyMemoryCoreTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // macos
        .deletingLastPathComponent() // repository root
        .appendingPathComponent("shared")
        .appendingPathComponent("fixtures")

    static func load(_ name: String) throws -> [String: Any] {
        let data = try Data(contentsOf: directory.appendingPathComponent("\(name).json"))
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "Fixtures", code: 1, userInfo: [NSLocalizedDescriptionKey: "\(name).json is not an object"])
        }
        return object
    }
}

extension Dictionary where Key == String, Value == Any {
    func string(_ key: String) -> String? { self[key] as? String }
    func bool(_ key: String) -> Bool? { self[key] as? Bool }
    func millis(_ key: String) -> Millis? { (self[key] as? NSNumber)?.int64Value }
    func double(_ key: String) -> Double? { (self[key] as? NSNumber)?.doubleValue }
    func int(_ key: String) -> Int? { (self[key] as? NSNumber)?.intValue }
    func dicts(_ key: String) -> [[String: Any]] { (self[key] as? [[String: Any]]) ?? [] }
    func array(_ key: String) -> [Any] { (self[key] as? [Any]) ?? [] }
    func strings(_ key: String) -> [String]? { self[key] as? [String] }
    /// True when the key is present, even if its value is JSON null.
    func has(_ key: String) -> Bool { self[key] != nil }
}

func expectEqual<T: Equatable>(
    _ actual: T, _ expected: T, _ context: String, _ what: String,
    file: StaticString = #filePath, line: UInt = #line
) {
    XCTAssertEqual(actual, expected, "[\(context)] \(what)", file: file, line: line)
}

func expectTrue(
    _ condition: Bool, _ context: String, _ what: String,
    file: StaticString = #filePath, line: UInt = #line
) {
    XCTAssertTrue(condition, "[\(context)] \(what)", file: file, line: line)
}

/// Structural equality for loosely-typed JSON values.
func jsonEqual(_ a: Any?, _ b: Any?) -> Bool {
    guard let a = a, let b = b else { return a == nil && b == nil }
    return (a as AnyObject).isEqual(b)
}

/// A fixture note: a string, {"repeat","count"}, {"concat":[...]}; numbers and
/// null are "wrong type" and give nil.
func noteValue(_ spec: Any?) -> String? {
    if let s = spec as? String { return s }
    if let d = spec as? [String: Any] {
        if let unit = d["repeat"] as? String, let count = (d["count"] as? NSNumber)?.intValue {
            return String(repeating: unit, count: count)
        }
        if let parts = d["concat"] as? [Any] {
            return parts.map { noteValue($0) ?? "" }.joined()
        }
    }
    return nil
}

/// A fixture delay: a number, or the strings NaN / Infinity / -Infinity. Any
/// other type (string, null) is "wrong type" and gives nil.
func delayValue(_ spec: Any?) -> Double? {
    if let s = spec as? String {
        switch s {
        case "NaN": return Double.nan
        case "Infinity": return Double.infinity
        case "-Infinity": return -Double.infinity
        default: return nil
        }
    }
    if let n = spec as? NSNumber { return n.doubleValue }
    return nil
}

// MARK: - A hand-cranked clock and scheduler

/// advance() runs due timers in order; jump() moves time without running anything
/// (what a sleeping Mac does to timers).
final class FakeScheduler: Scheduler {
    final class Job: ScheduledTask {
        let id: Int
        var at: Int64
        let interval: Int64
        let repeats: Bool
        let block: () -> Void
        weak var owner: FakeScheduler?

        init(id: Int, at: Int64, interval: Int64, repeats: Bool, block: @escaping () -> Void) {
            self.id = id
            self.at = at
            self.interval = interval
            self.repeats = repeats
            self.block = block
        }

        func cancel() { owner?.remove(id) }
    }

    private(set) var t: Int64
    private var jobs: [Job] = []
    private var nextId = 0

    init(start: Int64) { t = start }

    var now: Int64 { t }

    private func add(_ ms: Int64, repeats: Bool, _ block: @escaping () -> Void) -> Job {
        nextId += 1
        let job = Job(id: nextId, at: t + ms, interval: ms, repeats: repeats, block: block)
        job.owner = self
        jobs.append(job)
        return job
    }

    fileprivate func remove(_ id: Int) {
        jobs.removeAll { $0.id == id }
    }

    func once(afterMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask {
        add(afterMs, repeats: false, block)
    }

    func repeating(everyMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask {
        add(everyMs, repeats: true, block)
    }

    func advance(_ ms: Int64) {
        let end = t + ms
        while true {
            var next: Job?
            for job in jobs where job.at <= end {
                if let current = next {
                    if job.at < current.at { next = job }
                } else {
                    next = job
                }
            }
            guard let job = next else { break }
            t = max(t, job.at)
            if job.repeats { job.at += job.interval } else { remove(job.id) }
            job.block()
        }
        t = end
    }

    func jump(_ ms: Int64) { t += ms }
}

// MARK: - Presenter that records what the tray would show

final class RecordingPresenter: TrayPresenter {
    var shown: [String] = []
    var tooltips: [String] = []
    var toasts: [[String: String]] = []

    func show(set: SmokeSet, frame: Int) { shown.append("\(set.rawValue):\(frame)") }
    func setTooltip(_ text: String) { tooltips.append(text) }
    func notify(title: String, body: String) { toasts.append(["title": title, "body": body]) }
}

// MARK: - Storage that always fails

final class FailingStorage: JSONStorage {
    func load() -> Any? { nil }
    func save(_ object: Any) throws { throw StorageError.notSerializable }
}
