import XCTest
@testable import CloudyMemoryCore

final class RemindersFixtureTests: XCTestCase {
    func testReminderScenarios() throws {
        let fixture = try Fixtures.load("reminders")
        let start = try XCTUnwrap(fixture.millis("startMs"))
        for scenario in fixture.dicts("scenarios") {
            run(scenario, start: start)
        }
    }

    private func dictionary(_ r: Reminder) -> [String: Any] {
        ["id": r.id, "note": r.note, "createdAt": r.createdAt, "dueAt": r.dueAt, "fired": r.fired]
    }

    private func run(_ sc: [String: Any], start: Millis) {
        let name = sc.string("name") ?? "?"
        var clock = start
        var counter = 0
        let storage = MemoryStorage(sc["stored"])
        func makeReminders() -> Reminders {
            Reminders(storage: storage, now: { clock }, makeId: {
                counter += 1
                return "id\(counter)"
            })
        }
        var reminders = makeReminders()
        var refs: [String: String] = [:]
        func notes(_ list: [Reminder]) -> [String] { list.map { $0.note } }

        for step in sc.dicts("steps") {
            let e = step["expect"] as? [String: Any]
            let op = step.string("op") ?? ""
            switch op {
            case "add":
                var added: Reminder?
                if let delay = delayValue(step["delayMs"]) {
                    // A note of the wrong type (number, null) is ignored, like in the JS build.
                    added = reminders.add(delayMs: delay, note: noteValue(step["note"]))
                }
                if let ref = step.string("as"), let added = added { refs[ref] = added.id }
                if let e = e {
                    if let isNull = e.bool("isNull") { expectEqual(added == nil, isNull, name, "isNull") }
                    if e.has("note") { expectEqual(added?.note, e.string("note"), name, "note") }
                    if e.has("noteLength") { expectEqual(added.map { $0.note.utf16.count }, e.int("noteLength"), name, "noteLength") }
                    if e.has("dueInMs") { expectEqual(added.map { $0.dueAt - clock }, e.millis("dueInMs"), name, "dueInMs") }
                    if e.has("fired") { expectEqual(added?.fired, e.bool("fired"), name, "fired") }
                }
            case "advance":
                clock += step.millis("ms") ?? 0
            case "check":
                let fired = reminders.check()
                if let e = e, e.has("notes") { expectEqual(notes(fired), e.strings("notes") ?? [], name, "check notes") }
            case "cancel":
                let id = step.string("ref").flatMap { refs[$0] } ?? step.string("id") ?? ""
                let result = reminders.cancel(id)
                if let e = e, e.has("result") { expectEqual(result, e.bool("result"), name, "cancel result") }
            case "dismissFired":
                let result = reminders.dismissFired()
                if let e = e, e.has("result") { expectEqual(result, e.int("result"), name, "dismissFired result") }
            case "restart":
                reminders = makeReminders()
            case "load":
                let result = reminders.load()
                if let e = e, e.has("becameDueNotes") {
                    expectEqual(notes(result.becameDueWhileAway), e.strings("becameDueNotes") ?? [], name, "becameDueNotes")
                }
            case "expect", "state":
                break
            default:
                XCTFail("[\(name)] unknown op \(op)")
            }

            guard op == "expect" || op == "state", let checks = e else { continue }
            if checks.has("msUntilNext") { expectEqual(reminders.msUntilNext(), checks.millis("msUntilNext"), name, "msUntilNext") }
            if checks.has("pendingNotes") { expectEqual(notes(reminders.pending()), checks.strings("pendingNotes") ?? [], name, "pendingNotes") }
            if checks.has("firedNotes") { expectEqual(notes(reminders.fired()), checks.strings("firedNotes") ?? [], name, "firedNotes") }
            if checks.has("allNotes") { expectEqual(notes(reminders.all()), checks.strings("allNotes") ?? [], name, "allNotes") }
            if checks.has("allIds") { expectEqual(reminders.all().map { $0.id }, checks.strings("allIds") ?? [], name, "allIds") }
            if checks.has("all") {
                let actual = reminders.all().map(dictionary)
                expectTrue(jsonEqual(actual, checks["all"]), name, "all \(actual) vs \(String(describing: checks["all"]))")
            }
            if checks.has("pendingCount") { expectEqual(reminders.pending().count, checks.int("pendingCount"), name, "pendingCount") }
            if checks.has("firedCount") { expectEqual(reminders.fired().count, checks.int("firedCount"), name, "firedCount") }
            if checks.has("savedVersion") {
                let saved = storage.value as? [String: Any]
                expectEqual(saved?.int("version"), checks.int("savedVersion"), name, "savedVersion")
            }
        }
    }
}
