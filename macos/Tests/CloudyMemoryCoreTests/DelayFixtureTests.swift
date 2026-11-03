import XCTest
@testable import CloudyMemoryCore

final class DelayFixtureTests: XCTestCase {
    func testDelayParsing() throws {
        let fixture = try Fixtures.load("delay")
        for c in fixture.dicts("cases") {
            let name = c.string("name") ?? "?"
            let result = DelayParser.parse(amount: c["amount"], unit: c["unit"])
            guard let e = c["expect"] as? [String: Any] else { continue }
            if let delay = e.double("delayMs") {
                expectEqual(result, DelayParseResult.delay(delay), name, "delay")
            } else if let message = e.string("error") {
                expectEqual(result, DelayParseResult.error(message), name, "error")
            } else {
                XCTFail("[\(name)] fixture has neither delayMs nor error")
            }
        }
    }

    func testEveryUnitInTheMenuIsAccepted() {
        for unit in ReminderUnit.allCases {
            if case .error = DelayParser.parse(amount: "1", unit: unit.rawValue) {
                XCTFail("\(unit) should parse")
            }
        }
    }
}
