import XCTest
@testable import CloudyMemoryCore

/// Expected strings come from running the original JS helper in src/ui/reminders.js.
final class ReminderTextTests: XCTestCase {
    func testRelativeWording() {
        let cases: [(Int64, String)] = [
            (0, "due now"),
            (30_000, "due now"),
            (30_001, "in 1 minute"),
            (60_000, "in 1 minute"),
            (89_999, "in 1 minute"),
            (1_500_000, "in 25 minutes"),
            (3_571_000, "in 1 hour"),
            (3_600_000, "in 1 hour"),
            (5_400_000, "in 1 hour 30 minutes"),
            (7_500_000, "in 2 hours 5 minutes"),
            (86_400_000, "in 1 day"),
            (90_000_000, "in 1 day 1 hour"),
            (176_460_000, "in 2 days 1 hour"),
            (259_200_000, "in 3 days"),
        ]
        for (ms, expected) in cases {
            XCTAssertEqual(ReminderText.relative(ms: ms), expected, "\(ms) ms")
        }
    }
}
