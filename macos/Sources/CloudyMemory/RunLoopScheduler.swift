import AppKit
import CloudyMemoryCore

private final class TimerTask: ScheduledTask {
    private var timer: Timer?

    init(_ timer: Timer) {
        self.timer = timer
    }

    func cancel() {
        timer?.invalidate()
        timer = nil
    }
}

/// Timers on the main run loop. They are added in the .common modes so the icon
/// animation and wake-ups keep running while the status menu is open (the run
/// loop is in event-tracking mode then, and default-mode timers would pause).
final class RunLoopScheduler: Scheduler {
    func once(afterMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask {
        make(afterMs, repeats: false, block)
    }

    func repeating(everyMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask {
        make(everyMs, repeats: true, block)
    }

    private func make(_ ms: Int64, repeats: Bool, _ block: @escaping () -> Void) -> ScheduledTask {
        let timer = Timer(timeInterval: Double(ms) / 1000.0, repeats: repeats) { _ in block() }
        RunLoop.main.add(timer, forMode: .common)
        return TimerTask(timer)
    }
}
