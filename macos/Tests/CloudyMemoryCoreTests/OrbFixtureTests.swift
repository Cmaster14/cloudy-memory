import XCTest
@testable import CloudyMemoryCore

final class OrbFixtureTests: XCTestCase {
    func testOrbScenarios() throws {
        let fixture = try Fixtures.load("orb")
        let start = try XCTUnwrap(fixture.millis("startMs"))
        for scenario in fixture.dicts("scenarios") {
            run(scenario, start: start)
        }
    }

    private func run(_ sc: [String: Any], start: Millis) {
        let name = sc.string("name") ?? "?"
        var clock = start
        var random = sc.double("random") ?? 0.5
        var storage = MemoryStorage(sc["stored"])
        let config = sc["config"] as? [String: Any] ?? [:]
        let minMs = config.millis("minMs") ?? 1_800_000
        let maxMs = config.millis("maxMs") ?? 172_800_000

        func makeOrb() -> Orb {
            Orb(storage: storage, now: { clock }, random: { random }, minMs: minMs, maxMs: maxMs)
        }
        var orb = makeOrb()
        var lastLoad: OrbLoadResult?

        for step in sc.dicts("steps") {
            var result: Bool?
            switch step.string("op") ?? "" {
            case "load": lastLoad = orb.load()
            case "check": result = orb.check()
            case "clear": result = orb.clear()
            case "forceCloudy": result = orb.forceCloudy()
            case "setNextIn": orb.setNextIn(step.millis("ms") ?? 0)
            case "advance": clock += step.millis("ms") ?? 0
            case "setRandom": random = step.double("value") ?? 0
            case "restart": orb = makeOrb()
            case "reset":
                storage = MemoryStorage(nil)
                orb = makeOrb()
            case "expect": break
            default: XCTFail("[\(name)] unknown op \(step["op"] ?? "nil")")
            }

            guard let e = step["expect"] as? [String: Any] else { continue }
            if e.has("result") { expectEqual(result, e.bool("result"), name, "result") }
            if e.has("phase") { expectEqual(orb.phase.rawValue, e.string("phase") ?? "", name, "phase") }
            if e.has("becameCloudyWhileAway") {
                expectEqual(lastLoad?.becameCloudyWhileAway, e.bool("becameCloudyWhileAway"), name, "becameCloudyWhileAway")
            }
            if e.has("waitMs") {
                expectEqual(orb.cloudyAt.map { $0 - clock }, e.millis("waitMs"), name, "waitMs")
            }
            if let limit = e.millis("waitMsAtMost") {
                expectTrue((orb.cloudyAt ?? Int64.max) - clock <= limit, name, "waitMsAtMost \(limit)")
            }
            if e.has("msUntilCloudy") {
                expectEqual(orb.msUntilCloudy(), e.millis("msUntilCloudy"), name, "msUntilCloudy")
            }
            if let limit = e.millis("msUntilCloudyAtMost") {
                expectTrue((orb.msUntilCloudy() ?? Int64.max) <= limit, name, "msUntilCloudyAtMost \(limit)")
            }
            if e.has("saved") {
                expectTrue(
                    jsonEqual(storage.value, e["saved"]),
                    name,
                    "saved \(String(describing: storage.value)) vs \(String(describing: e["saved"]))"
                )
            }
        }
    }
}
