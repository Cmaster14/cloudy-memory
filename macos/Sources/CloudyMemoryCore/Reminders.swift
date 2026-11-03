import Foundation

public struct Reminder: Equatable {
    public var id: String
    public var note: String
    public var createdAt: Millis
    public var dueAt: Millis
    public var fired: Bool

    public init(id: String, note: String, createdAt: Millis, dueAt: Millis, fired: Bool) {
        self.id = id
        self.note = note
        self.createdAt = createdAt
        self.dueAt = dueAt
        self.fired = fired
    }
}

public struct RemindersLoadResult {
    /// Reminders that came due while the app was closed; show them at once, no toast.
    public var becameDueWhileAway: [Reminder]
    public var pending: [Reminder]
    public var fired: [Reminder]
}

/// Custom reminders, a port of src/reminders.js. Each has an absolute `dueAt`
/// timestamp, so they survive restarts and sleep: anything that came due while
/// nothing was running is simply fired the next time `check()` looks. Any
/// number can be pending at once, and there is deliberately no cap on how far
/// ahead one may be set.
public final class Reminders {
    public static let version = 1
    public static let maxNoteLength = 200
    /// Largest timestamp a JavaScript Date can hold, the limit the Windows build uses.
    static let maxTimestamp: Double = 8.64e15

    private let storage: JSONStorage
    private let now: () -> Millis
    private let makeId: () -> String
    private var items: [Reminder] = []

    public init(
        storage: JSONStorage,
        now: @escaping () -> Millis = SystemTime.nowMs,
        makeId: @escaping () -> String = { UUID().uuidString }
    ) {
        self.storage = storage
        self.now = now
        self.makeId = makeId
    }

    // MARK: Validation

    private static func cleanNote(_ note: String?) -> String {
        guard let note = note else { return "" }
        return TextUtil.prefixUTF16(TextUtil.trimmed(note), maxNoteLength)
    }

    /// A whole, non-negative number no larger than `maxTimestamp`.
    private static func timestamp(_ value: Any?) -> Millis? {
        guard let d = JSONValue.number(value), d >= 0, d <= maxTimestamp, d == d.rounded(.towardZero) else {
            return nil
        }
        return Millis(d)
    }

    private static func ordered(_ list: [Reminder]) -> [Reminder] {
        // Sorted by due time, then creation time, then original order (stable).
        list.enumerated().sorted { a, b in
            if a.element.dueAt != b.element.dueAt { return a.element.dueAt < b.element.dueAt }
            if a.element.createdAt != b.element.createdAt { return a.element.createdAt < b.element.createdAt }
            return a.offset < b.offset
        }.map { $0.element }
    }

    /// Drops anything malformed (hand-edited or corrupt file) and keeps the rest.
    private func sanitize(_ raw: Any?) -> [Reminder] {
        guard let root = raw as? [String: Any], let list = root["reminders"] as? [Any] else { return [] }
        var seen = Set<String>()
        var out: [Reminder] = []
        for entry in list {
            guard let r = entry as? [String: Any],
                  let id = r["id"] as? String, !id.isEmpty, !seen.contains(id),
                  let dueAt = Reminders.timestamp(r["dueAt"])
            else { continue }
            seen.insert(id)
            let note = Reminders.cleanNote(r["note"] as? String)
            out.append(Reminder(
                id: id,
                note: note,
                createdAt: Reminders.timestamp(r["createdAt"]) ?? dueAt,
                dueAt: dueAt,
                fired: (r["fired"] as? Bool) == true
            ))
        }
        return Reminders.ordered(out)
    }

    private func persist() {
        let list: [[String: Any]] = items.map { r in
            [
                "id": r.id,
                "note": r.note,
                "createdAt": r.createdAt,
                "dueAt": r.dueAt,
                "fired": r.fired,
            ]
        }
        let object: [String: Any] = ["version": Reminders.version, "reminders": list]
        do {
            try storage.save(object)
        } catch {
            // Best effort: a failed save must never take the menu bar icon down.
            NSLog("[reminders] could not save: %@", String(describing: error))
        }
    }

    // MARK: API

    /// Restores saved reminders. Anything already due is marked fired and
    /// returned in `becameDueWhileAway`.
    @discardableResult
    public func load() -> RemindersLoadResult {
        items = sanitize(storage.load())
        let became = check()
        persist()
        return RemindersLoadResult(becameDueWhileAway: became, pending: pending(), fired: fired())
    }

    /// Adds a reminder due `delayMs` from now. Returns nil if the delay is not
    /// a positive finite number or lands beyond the largest representable date.
    @discardableResult
    public func add(delayMs: Double, note: String?) -> Reminder? {
        guard delayMs.isFinite, delayMs > 0 else { return nil }
        let createdAt = now()
        let due = (Double(createdAt) + delayMs).rounded(.toNearestOrAwayFromZero)
        guard due >= 0, due <= Reminders.maxTimestamp else { return nil }
        let reminder = Reminder(
            id: makeId(),
            note: Reminders.cleanNote(note),
            createdAt: createdAt,
            dueAt: Millis(due),
            fired: false
        )
        items.append(reminder)
        items = Reminders.ordered(items)
        persist()
        return reminder
    }

    /// Removes a reminder (pending or fired). Returns true if it existed.
    @discardableResult
    public func cancel(_ id: String) -> Bool {
        let before = items.count
        items.removeAll { $0.id == id }
        if items.count == before { return false }
        persist()
        return true
    }

    /// Marks everything now due as fired. Returns only the newly fired ones.
    @discardableResult
    public func check() -> [Reminder] {
        let t = now()
        var newly: [Reminder] = []
        for index in items.indices where !items[index].fired && items[index].dueAt <= t {
            items[index].fired = true
            newly.append(items[index])
        }
        if !newly.isEmpty { persist() }
        return newly
    }

    /// A click or "Clear Reminders": removes every fired reminder. Returns how many.
    @discardableResult
    public func dismissFired() -> Int {
        let before = items.count
        items.removeAll { $0.fired }
        let cleared = before - items.count
        if cleared > 0 { persist() }
        return cleared
    }

    /// Milliseconds until the earliest pending reminder, or nil when none is pending.
    public func msUntilNext() -> Millis? {
        guard let next = items.first(where: { !$0.fired }) else { return nil }
        return max(0, next.dueAt - now())
    }

    public func pending() -> [Reminder] { items.filter { !$0.fired } }
    public func fired() -> [Reminder] { items.filter { $0.fired } }
    public func all() -> [Reminder] { items }
}
