import Foundation

/// What the controller needs from the platform shell. The macOS app implements
/// this with an NSStatusItem and UserNotifications; tests record the calls.
public protocol TrayPresenter: AnyObject {
    /// Draw the given frame (0 is clear, the last frame fully clouded) of an icon set.
    func show(set: SmokeSet, frame: Int)
    func setTooltip(_ text: String)
    func notify(title: String, body: String)
}

public struct ReminderList {
    public var now: Millis
    public var pending: [Reminder]
    public var fired: [Reminder]
}

/// Wires the orb and the custom reminders to the tray: a port of the flow in
/// src/app.js with every platform detail (icons, notifications, timers, clock,
/// storage, randomness) injected, so cloud over / clear / restart / sleep can
/// be tested without a display.
public final class CloudyController {
    /// The wake-up timer never sleeps longer than this, so a Mac that was asleep
    /// mid-wait notices within a minute even if no wake event is delivered.
    public static let tickMaxMs: Int64 = 60 * 1000

    public let orb: Orb
    public let reminders: Reminders

    /// Called whenever the set of reminders changes (added, cancelled, came due,
    /// dismissed), so an open Reminders window can refresh.
    public var onRemindersChanged: () -> Void = {}

    private let config: CloudyConfig
    private let presenter: TrayPresenter
    private let scheduler: Scheduler
    private let now: () -> Millis
    private let lastFrame: Int

    private var animator: FrameAnimator?
    private var wakeTimer: ScheduledTask?
    /// Which colour's frames the animator is currently drawing.
    private var renderSet: SmokeSet = .purple

    public init(
        config: CloudyConfig = .standard,
        storage: JSONStorage,
        remindersStorage: JSONStorage,
        presenter: TrayPresenter,
        scheduler: Scheduler,
        now: @escaping () -> Millis = SystemTime.nowMs,
        random: @escaping () -> Double = { Double.random(in: 0..<1) },
        makeId: @escaping () -> String = { UUID().uuidString }
    ) {
        self.config = config
        self.presenter = presenter
        self.scheduler = scheduler
        self.now = now
        self.lastFrame = config.animation.frameCount - 1
        self.orb = Orb(
            storage: storage,
            now: now,
            random: random,
            minMs: config.timer.minMs,
            maxMs: config.timer.maxMs
        )
        self.reminders = Reminders(storage: remindersStorage, now: now, makeId: makeId)
    }

    // MARK: State for the shell

    /// True while the orb is cloudy or any custom reminder is waiting to be cleared.
    public var hasActiveSmoke: Bool {
        orb.phase == .cloudy || !reminders.fired().isEmpty
    }

    public func listReminders() -> ReminderList {
        ReminderList(now: now(), pending: reminders.pending(), fired: reminders.fired())
    }

    // MARK: Lifecycle

    public func start() {
        orb.load()
        reminders.load()
        // Anything already showing at launch (a deadline passed while we were
        // closed): show it straight away, without the animation or a toast.
        let initial = display()
        let startFrame = initial.set != nil ? lastFrame : 0
        if let set = initial.set { renderSet = set }

        presenter.show(set: renderSet, frame: startFrame)
        animator = FrameAnimator(
            frameCount: config.animation.frameCount,
            frameMs: config.animation.frameMs,
            initial: startFrame,
            scheduler: scheduler,
            render: { [weak self] frame in
                guard let self = self else { return }
                self.presenter.show(set: self.renderSet, frame: frame)
            }
        )
        presenter.setTooltip(initial.tooltip)
        schedule()
    }

    public func stop() {
        wakeTimer?.cancel()
        wakeTimer = nil
        animator?.stop()
    }

    /// Call when the Mac wakes or the screen unlocks: timers can drift or stall
    /// while the Mac sleeps, so look again right away.
    public func handleWake() {
        tick()
    }

    // MARK: Actions

    /// Clears everything that is showing: the orb and all due reminders. This is
    /// what the "Clear Reminders" menu item does. When nothing is showing the
    /// orb just flickers. Returns true if anything was cleared.
    @discardableResult
    public func click() -> Bool {
        let orbCleared = orb.clear()
        let dismissed = reminders.dismissFired()
        if orbCleared || dismissed > 0 {
            applyDisplay()
            schedule()
            if dismissed > 0 { onRemindersChanged() }
            return true
        }
        animator?.nudge()
        return false
    }

    @discardableResult
    public func addReminder(delayMs: Double, note: String?) -> Reminder? {
        guard let added = reminders.add(delayMs: delayMs, note: note) else { return nil }
        schedule()
        onRemindersChanged()
        return added
    }

    @discardableResult
    public func cancelReminder(_ id: String) -> Bool {
        let removed = reminders.cancel(id)
        if removed {
            applyDisplay() // cancelling a due reminder may drain or recolour the smoke
            schedule()
            onRemindersChanged()
        }
        return removed
    }

    // MARK: Debug actions (shown only in debug builds)

    public func debugCloudNow() {
        if orb.forceCloudy() {
            applyDisplay()
            notify(customNote: nil)
            schedule()
        }
    }

    public func debugCloudIn10s() {
        orb.setNextIn(10 * 1000)
        applyDisplay()
        schedule()
    }

    public func debugReminderIn10s() {
        _ = addReminder(delayMs: 10 * 1000, note: "Debug reminder")
    }

    // MARK: Internals

    private func display() -> DisplayState {
        Display.compute(orbPhase: orb.phase, firedReminders: reminders.fired(), text: config.text)
    }

    private func notify(customNote: String?) {
        guard config.notification.enabled else { return }
        if let note = customNote {
            presenter.notify(title: config.notification.customTitle, body: note)
        } else {
            presenter.notify(title: config.notification.title, body: config.notification.body)
        }
    }

    private func schedule() {
        wakeTimer?.cancel()
        wakeTimer = nil
        let candidates = [orb.msUntilCloudy(), reminders.msUntilNext()].compactMap { $0 }
        guard let ms = candidates.min() else { return } // nothing left to wait for
        wakeTimer = scheduler.once(afterMs: min(ms, CloudyController.tickMaxMs)) { [weak self] in
            self?.tick()
        }
    }

    /// Brings the tray in line with the orb and reminder state: tooltip first,
    /// then the animation.
    ///
    ///  - Nothing to show: the smoke drains away.
    ///  - The colour on screen already matches: the smoke fills.
    ///  - A different colour is on screen (purple while a reminder arrives, say):
    ///    that cloud is cleared first, then the new one fills in. At frame 0 the
    ///    orb is empty, so switching colour there is invisible.
    ///
    /// Every call re-decides from the current frame, so a change that lands
    /// mid-animation simply redirects it.
    private func applyDisplay() {
        guard let animator = animator else { return }
        let want = display()
        presenter.setTooltip(want.tooltip)

        guard let set = want.set else {
            animator.to(0)
            return
        }
        if renderSet == set || animator.currentFrame == 0 {
            renderSet = set
            animator.to(lastFrame)
        } else {
            animator.to(0) { [weak self] in
                guard let self = self else { return }
                self.renderSet = set
                self.animator?.to(self.lastFrame)
            }
        }
    }

    func tick() {
        let orbBecameCloudy = orb.check()
        let newlyDue = reminders.check()
        if orbBecameCloudy || !newlyDue.isEmpty {
            applyDisplay()
            if orbBecameCloudy { notify(customNote: nil) }
            if !newlyDue.isEmpty {
                notify(customNote: Display.toastBody(newlyFired: newlyDue, notification: config.notification))
                onRemindersChanged()
            }
        }
        schedule()
    }
}
