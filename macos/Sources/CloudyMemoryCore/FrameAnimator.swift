import Foundation

/// Steps the menu bar icon through frame indices on a fixed beat (a port of
/// src/animator.js). `render(i)` draws frame i.
public final class FrameAnimator {
    private let frameCount: Int
    private let frameMs: Int64
    private let scheduler: Scheduler
    private let render: (Int) -> Void
    private var current: Int
    private var handle: ScheduledTask?

    public init(
        frameCount: Int,
        frameMs: Int64,
        initial: Int = 0,
        scheduler: Scheduler,
        render: @escaping (Int) -> Void
    ) {
        self.frameCount = frameCount
        self.frameMs = frameMs
        self.current = initial
        self.scheduler = scheduler
        self.render = render
    }

    public var currentFrame: Int { current }

    public func stop() {
        handle?.cancel()
        handle = nil
    }

    /// `onDone` runs once the sequence has played out (immediately if there is
    /// nothing to play). Starting another sequence or calling `stop()` cancels it.
    public func play(_ sequence: [Int], onDone: (() -> Void)? = nil) {
        stop()
        var queue = sequence
        if queue.isEmpty {
            onDone?()
            return
        }
        handle = scheduler.repeating(everyMs: frameMs) { [weak self] in
            guard let self = self, !queue.isEmpty else { return }
            let next = queue.removeFirst()
            self.current = next
            self.render(next)
            if queue.isEmpty {
                self.stop()
                onDone?()
            }
        }
    }

    /// Walks one frame per beat from wherever we are now to `target`.
    public func to(_ target: Int, onDone: (() -> Void)? = nil) {
        let goal = min(max(target, 0), frameCount - 1)
        let step = goal >= current ? 1 : -1
        var sequence: [Int] = []
        var i = current
        while i != goal {
            sequence.append(i + step)
            i += step
        }
        play(sequence, onDone: onDone)
    }

    /// A small flicker for a click on an orb that is already clear and idle.
    public func nudge() {
        guard current == 0, handle == nil else { return }
        let peak = min(2, frameCount - 1)
        var sequence: [Int] = []
        if peak >= 1 { for i in 1...peak { sequence.append(i) } }
        if peak >= 1 { for i in stride(from: peak - 1, through: 0, by: -1) { sequence.append(i) } }
        play(sequence)
    }
}
