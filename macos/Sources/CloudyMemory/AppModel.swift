import AppKit
import SwiftUI
import CloudyMemoryCore
import CloudyMemoryUI

/// Owns the controller and republishes its state for SwiftUI. It is also the
/// controller's TrayPresenter: instead of drawing into an NSStatusItem it
/// publishes the current icon, so the MenuBarExtra label redraws itself.
final class AppModel: ObservableObject, TrayPresenter {
    // What the menu bar item shows.
    @Published private(set) var icon: NSImage
    @Published private(set) var tooltip: String

    // What the menu and the Reminders window show.
    @Published private(set) var hasActiveSmoke = false
    @Published private(set) var pending: [Reminder] = []
    @Published private(set) var fired: [Reminder] = []
    @Published private(set) var launchAtLogin = LoginItem.isEnabled

    let launchAtLoginAvailable = AppPaths.isBundled
    let debugMenu: Bool = {
        ProcessInfo.processInfo.arguments.contains("--debug")
            || ProcessInfo.processInfo.environment["CLOUDY_DEBUG"] == "1"
    }()

    private let frames: [SmokeSet: [NSImage]]
    private let notifier = Notifier()
    private var controller: CloudyController!

    init() {
        let config = CloudyConfig.standard
        var loaded: [SmokeSet: [NSImage]] = [:]
        for set in SmokeSet.allCases {
            loaded[set] = OrbIcons.frames(for: set, levels: config.animation.frameCount)
        }
        frames = loaded
        icon = loaded[.purple]?.first ?? NSImage()
        tooltip = config.text.clearTooltip

        let support = AppPaths.supportDirectory
        controller = CloudyController(
            config: config,
            storage: FileStorage(url: support.appendingPathComponent("state.json")),
            remindersStorage: FileStorage(url: support.appendingPathComponent("reminders.json")),
            presenter: self,
            scheduler: RunLoopScheduler()
        )

        // A second copy would just fight the first one over the same state files.
        if AppPaths.isBundled, let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 {
            DispatchQueue.main.async { NSApp.terminate(nil) }
            return
        }

        controller.onRemindersChanged = { [weak self] in self?.refreshState() }
        notifier.requestPermission()
        controller.start()
        refreshState()

        // Timers can drift or stall while the Mac sleeps; look again on wake and unlock.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.controller.handleWake() }
        DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main
        ) { [weak self] _ in self?.controller.handleWake() }
    }

    // MARK: TrayPresenter (called by the controller)

    func show(set: SmokeSet, frame: Int) {
        guard let images = frames[set], images.indices.contains(frame) else { return }
        icon = images[frame]
    }

    func setTooltip(_ text: String) {
        tooltip = text
        StatusItemTooltip.apply(text)
        // The controller calls this whenever the orb or a due reminder changes.
        refreshState()
    }

    func notify(title: String, body: String) {
        notifier.post(title: title, body: body)
    }

    // MARK: Actions (called by the views)

    /// "Clear Reminders": clears the orb and every due reminder.
    func clearReminders() {
        controller.click()
        refreshState()
    }

    /// Returns an error message to show, or nil when the reminder was added.
    func addReminder(amount: String, unit: ReminderUnit, note: String) -> String? {
        switch DelayParser.parse(amount: amount, unit: unit.rawValue) {
        case .error(let message):
            return message
        case .delay(let ms):
            if ms <= 0 { return DelayParser.amountError }
            guard controller.addReminder(delayMs: ms, note: note) != nil else {
                return "That time is too far away to schedule."
            }
            refreshState()
            return nil
        }
    }

    func cancelReminder(_ reminder: Reminder) {
        controller.cancelReminder(reminder.id)
        refreshState()
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        LoginItem.setEnabled(enabled)
        launchAtLogin = LoginItem.isEnabled
    }

    func showRemindersWindow() {
        RemindersWindow.shared.show(model: self)
    }

    func debugCloudNow() { controller.debugCloudNow(); refreshState() }
    func debugCloudIn10s() { controller.debugCloudIn10s(); refreshState() }
    func debugReminderIn10s() { controller.debugReminderIn10s(); refreshState() }

    func quit() {
        controller.stop()
        NSApp.terminate(nil)
    }

    // MARK: Internals

    private func refreshState() {
        let list = controller.listReminders()
        pending = list.pending
        fired = list.fired
        hasActiveSmoke = controller.hasActiveSmoke
    }
}
