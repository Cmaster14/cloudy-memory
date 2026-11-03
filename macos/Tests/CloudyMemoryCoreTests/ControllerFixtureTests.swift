import XCTest
@testable import CloudyMemoryCore

final class ControllerFixtureTests: XCTestCase {
    func testControllerScenarios() throws {
        let fixture = try Fixtures.load("controller")
        let start = try XCTUnwrap(fixture.millis("startMs"))
        for scenario in fixture.dicts("scenarios") {
            run(scenario, start: start)
        }
    }

    /// "purple:1-8" -> purple:1 ... purple:8; "purple:7-0" counts down; "purple:3" is one frame.
    private func expandFrames(_ specs: [String]) -> [String] {
        var out: [String] = []
        for spec in specs {
            let parts = spec.split(separator: ":")
            guard parts.count == 2 else {
                XCTFail("bad frame spec \(spec)")
                continue
            }
            let set = String(parts[0])
            let range = parts[1].split(separator: "-").compactMap { Int($0) }
            guard let from = range.first else {
                XCTFail("bad frame spec \(spec)")
                continue
            }
            let to = range.count > 1 ? range[1] : from
            let step = from <= to ? 1 : -1
            var i = from
            while true {
                out.append("\(set):\(i)")
                if i == to { break }
                i += step
            }
        }
        return out
    }

    private func run(_ sc: [String: Any], start: Millis) {
        let name = sc.string("name") ?? "?"
        let scheduler = FakeScheduler(start: start)
        let presenter = RecordingPresenter()
        let random = sc.double("random") ?? 0
        var changed = 0
        var changedMark = 0

        let controller = CloudyController(
            storage: MemoryStorage(sc["stored"]),
            remindersStorage: MemoryStorage(sc["remindersStored"]),
            presenter: presenter,
            scheduler: scheduler,
            now: { scheduler.now },
            random: { random }
        )
        controller.onRemindersChanged = { changed += 1 }
        controller.start()

        var refs: [String: String] = [:]
        let animateMs = CloudyConfig.standard.animation.frameMs * Int64(CloudyConfig.standard.animation.frameCount - 1)

        for step in sc.dicts("steps") {
            let op = step.string("op") ?? ""
            switch op {
            case "advance": scheduler.advance(step.millis("ms") ?? 0)
            case "jump": scheduler.jump(step.millis("ms") ?? 0)
            case "resume": controller.handleWake()
            case "click": controller.click()
            case "animate": scheduler.advance(animateMs)
            case "resetShown": presenter.shown.removeAll()
            case "markChanged": changedMark = changed
            case "add":
                var added: Reminder?
                if let delay = delayValue(step["delayMs"]) {
                    added = controller.addReminder(delayMs: delay, note: noteValue(step["note"]))
                }
                if let ref = step.string("as"), let added = added { refs[ref] = added.id }
                if let e = step["expect"] as? [String: Any], let isNull = e.bool("isNull") {
                    expectEqual(added == nil, isNull, name, "isNull")
                }
            case "cancel":
                let id = step.string("ref").flatMap { refs[$0] } ?? step.string("id") ?? ""
                let result = controller.cancelReminder(id)
                if let e = step["expect"] as? [String: Any] {
                    expectEqual(result, e.bool("result"), name, "cancel result")
                }
            case "debug":
                switch step.string("name") ?? "" {
                case "cloudNow": controller.debugCloudNow()
                case "cloudIn10s": controller.debugCloudIn10s()
                case "reminderIn10s": controller.debugReminderIn10s()
                default: XCTFail("[\(name)] unknown debug action")
                }
            case "expect":
                guard let e = step["expect"] as? [String: Any] else { break }
                if e.has("shown") {
                    expectEqual(presenter.shown, expandFrames(e.strings("shown") ?? []), name, "shown")
                }
                if e.has("lastShown") { expectEqual(presenter.shown.last, e.string("lastShown"), name, "lastShown") }
                if e.has("tooltip") { expectEqual(presenter.tooltips.last, e.string("tooltip"), name, "tooltip") }
                if e.has("toastCount") { expectEqual(presenter.toasts.count, e.int("toastCount"), name, "toastCount") }
                if e.has("toasts") {
                    var expected: [[String: String]] = []
                    for toast in e.dicts("toasts") {
                        expected.append(["title": toast.string("title") ?? "", "body": toast.string("body") ?? ""])
                    }
                    expectEqual(presenter.toasts, expected, name, "toasts")
                }
                if e.has("orbPhase") { expectEqual(controller.orb.phase.rawValue, e.string("orbPhase") ?? "", name, "orbPhase") }
                if e.has("firedCount") { expectEqual(controller.listReminders().fired.count, e.int("firedCount"), name, "firedCount") }
                if e.has("pendingNotes") {
                    expectEqual(controller.listReminders().pending.map { $0.note }, e.strings("pendingNotes") ?? [], name, "pendingNotes")
                }
                if e.has("changedSinceMark") { expectEqual(changed - changedMark, e.int("changedSinceMark"), name, "changedSinceMark") }
            default:
                XCTFail("[\(name)] unknown op \(op)")
            }
        }
    }

    // Behaviour specific to the macOS menu: "Clear Reminders" is enabled only while something is showing.

    func testHasActiveSmokeTracksTheClearReminderMenuState() {
        let scheduler = FakeScheduler(start: 1_000_000_000)
        let controller = CloudyController(
            storage: MemoryStorage(nil),
            remindersStorage: MemoryStorage(nil),
            presenter: RecordingPresenter(),
            scheduler: scheduler,
            now: { scheduler.now },
            random: { 0 }
        )
        controller.start()
        XCTAssertFalse(controller.hasActiveSmoke)

        controller.addReminder(delayMs: 60_000, note: "x")
        XCTAssertFalse(controller.hasActiveSmoke, "a pending reminder is not showing yet")

        scheduler.advance(60_000)
        XCTAssertTrue(controller.hasActiveSmoke)

        XCTAssertTrue(controller.click())
        XCTAssertFalse(controller.hasActiveSmoke)
        XCTAssertFalse(controller.click(), "nothing left to clear")
    }
}
