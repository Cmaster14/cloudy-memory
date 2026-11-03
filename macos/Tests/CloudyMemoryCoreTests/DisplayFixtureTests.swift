import XCTest
@testable import CloudyMemoryCore

final class DisplayFixtureTests: XCTestCase {
    func testDisplayCases() throws {
        let fixture = try Fixtures.load("display")
        let textSpec = fixture["text"] as? [String: Any] ?? [:]
        var text = CloudyConfig.Text()
        text.clearTooltip = textSpec.string("clearTooltip") ?? text.clearTooltip
        text.cloudyTooltip = textSpec.string("cloudyTooltip") ?? text.cloudyTooltip

        for c in fixture.dicts("cases") {
            let name = c.string("name") ?? "?"
            let phase: OrbPhase = (c.string("orbPhase") == "cloudy") ? .cloudy : .clear
            let reminders = c.array("notes").map { spec in
                Reminder(id: "x", note: noteValue(spec) ?? "", createdAt: 0, dueAt: 0, fired: true)
            }
            let result = Display.compute(orbPhase: phase, firedReminders: reminders, text: text)
            guard let e = c["expect"] as? [String: Any] else { continue }

            expectEqual(result.set?.rawValue, e["set"] as? String, name, "set")
            if e.has("tooltip") { expectEqual(result.tooltip, e.string("tooltip") ?? "", name, "tooltip") }
            if e.has("tooltipLength") { expectEqual(result.tooltip.utf16.count, e.int("tooltipLength"), name, "tooltipLength") }
            if let prefix = e.string("tooltipStartsWith") {
                expectTrue(result.tooltip.hasPrefix(prefix), name, "starts with \(prefix)")
            }
            if let suffix = e.string("tooltipEndsWith") {
                expectTrue(result.tooltip.hasSuffix(suffix), name, "ends with \(suffix)")
            }
            for needle in e.strings("tooltipContains") ?? [] {
                expectTrue(result.tooltip.contains(needle), name, "contains \(needle)")
            }
            for needle in e.strings("tooltipNotContains") ?? [] {
                expectTrue(!result.tooltip.contains(needle), name, "does not contain \(needle)")
            }
        }
    }

    func testToastBodies() throws {
        let fixture = try Fixtures.load("display")
        var notification = CloudyConfig.Notification()
        notification.customFallbackBody =
            (fixture["toastNotification"] as? [String: Any])?.string("customFallbackBody") ?? notification.customFallbackBody

        for c in fixture.dicts("toastCases") {
            let name = c.string("name") ?? "?"
            let reminders = c.array("notes").map { spec in
                Reminder(id: "x", note: noteValue(spec) ?? "", createdAt: 0, dueAt: 0, fired: true)
            }
            let body = Display.toastBody(newlyFired: reminders, notification: notification)
            expectEqual(body, c.string("expect") ?? "", name, "toast body")
        }
    }

    func testTooltipNeverExceedsTheLimitWithMultibyteNotes() {
        // Emoji are two UTF-16 units each; the cap and the ellipsis must still hold,
        // and a surrogate pair must never be cut in half.
        let long = String(repeating: "😀", count: 100)
        let reminders = [
            Reminder(id: "a", note: long, createdAt: 0, dueAt: 0, fired: true),
            Reminder(id: "b", note: long, createdAt: 0, dueAt: 0, fired: true),
        ]
        for phase in [OrbPhase.clear, OrbPhase.cloudy] {
            let result = Display.compute(orbPhase: phase, firedReminders: reminders, text: CloudyConfig.Text())
            XCTAssertLessThanOrEqual(result.tooltip.utf16.count, Display.tooltipMax)
            XCTAssertTrue(result.tooltip.contains("(+1 more)"))
            XCTAssertFalse(result.tooltip.contains("\u{FFFD}"), "no broken surrogate pair")
        }
    }
}
