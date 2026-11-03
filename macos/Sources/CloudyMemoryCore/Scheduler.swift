import Foundation

/// Something scheduled that can be cancelled.
public protocol ScheduledTask: AnyObject {
    func cancel()
}

/// Injectable timers, so the whole tray flow can be driven by a fake clock in
/// tests. The macOS app supplies a run-loop implementation.
public protocol Scheduler: AnyObject {
    /// Runs `block` once, `afterMs` milliseconds from now.
    func once(afterMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask
    /// Runs `block` every `everyMs` milliseconds until cancelled.
    func repeating(everyMs: Int64, _ block: @escaping () -> Void) -> ScheduledTask
}
