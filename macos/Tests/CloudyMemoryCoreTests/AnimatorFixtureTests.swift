import XCTest
@testable import CloudyMemoryCore

final class AnimatorFixtureTests: XCTestCase {
    func testAnimatorScenarios() throws {
        let fixture = try Fixtures.load("animator")
        let frameCount = fixture.int("frameCount") ?? 9
        for sc in fixture.dicts("scenarios") {
            run(sc, frameCount: frameCount)
        }
    }

    private func run(_ sc: [String: Any], frameCount: Int) {
        let name = sc.string("name") ?? "?"
        let scheduler = FakeScheduler(start: 0)
        var shown: [Int] = []
        var done = 0
        let animator = FrameAnimator(
            frameCount: frameCount,
            frameMs: 220,
            initial: sc.int("initial") ?? 0,
            scheduler: scheduler,
            render: { shown.append($0) }
        )

        for step in sc.dicts("steps") {
            switch step.string("op") ?? "" {
            case "to":
                let target = step.int("target") ?? 0
                if step.bool("withDone") == true {
                    animator.to(target, onDone: { done += 1 })
                } else {
                    animator.to(target)
                }
            case "nudge": animator.nudge()
            case "stop": animator.stop()
            case "tick":
                for _ in 0..<(step.int("count") ?? 0) { scheduler.advance(220) }
            case "expectShown":
                let expected = step.array("frames").compactMap { ($0 as? NSNumber)?.intValue }
                expectEqual(shown, expected, name, "shown")
                shown.removeAll()
            case "expectDone":
                expectEqual(done, step.int("count") ?? -1, name, "done count")
                done = 0
            case "expectCurrent":
                expectEqual(animator.currentFrame, step.int("frame") ?? -1, name, "current frame")
            default:
                XCTFail("[\(name)] unknown op \(step["op"] ?? "nil")")
            }
        }
    }
}
