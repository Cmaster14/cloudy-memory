import AppKit
import CloudyMemoryCore

/// The macOS menu bar shell around CloudyController.
///
/// The status item's menu opens on any click, left or right. That is the one
/// deliberate difference from the Windows build (where a left click clears the
/// orb): here, "Clear Reminders" in the menu does the clearing.
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let config = CloudyConfig.standard
    private let debugMenu: Bool = {
        ProcessInfo.processInfo.arguments.contains("--debug")
            || ProcessInfo.processInfo.environment["CLOUDY_DEBUG"] == "1"
    }()

    private var controller: CloudyController?
    private var presenter: StatusItemPresenter?
    private var remindersWindow: RemindersWindowController?
    private var clearItem: NSMenuItem?
    private var loginItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // A second copy would just fight the first one over the same state files.
        if let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 {
            NSApp.terminate(nil)
            return
        }
        NSApp.setActivationPolicy(.accessory) // menu bar only, no Dock icon

        let menu = buildMenu()
        let presenter = StatusItemPresenter(menu: menu, levels: config.animation.frameCount)
        let support = AppPaths.supportDirectory
        let controller = CloudyController(
            config: config,
            storage: FileStorage(url: support.appendingPathComponent("state.json")),
            remindersStorage: FileStorage(url: support.appendingPathComponent("reminders.json")),
            presenter: presenter,
            scheduler: RunLoopScheduler()
        )
        let window = RemindersWindowController(controller: controller)
        controller.onRemindersChanged = { [weak window] in window?.refresh() }

        self.presenter = presenter
        self.controller = controller
        self.remindersWindow = window

        presenter.requestNotificationPermission()
        controller.start()

        // Timers can drift or stall while the Mac sleeps; look again on wake and unlock.
        NSWorkspace.shared.notificationCenter.addObserver(
            self, selector: #selector(wake), name: NSWorkspace.didWakeNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(wake), name: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller?.stop()
    }

    // MARK: Menu

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false // enabled state is set in menuWillOpen
        menu.delegate = self

        let clear = NSMenuItem(title: "Clear Reminders", action: #selector(clearReminders), keyEquivalent: "")
        clear.target = self
        menu.addItem(clear)
        clearItem = clear

        let custom = NSMenuItem(title: "Custom Reminders…", action: #selector(showReminders), keyEquivalent: "")
        custom.target = self
        menu.addItem(custom)

        menu.addItem(.separator())

        let login = NSMenuItem(title: "Launch at Login", action: #selector(toggleLoginItem), keyEquivalent: "")
        login.target = self
        menu.addItem(login)
        loginItem = login

        if debugMenu {
            menu.addItem(.separator())
            for (title, action) in [
                ("Debug: cloud over now", #selector(debugCloudNow)),
                ("Debug: cloud over in 10 s", #selector(debugCloudIn10s)),
                ("Debug: custom reminder in 10 s", #selector(debugReminderIn10s)),
            ] {
                let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
                item.target = self
                menu.addItem(item)
            }
        }

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Cloudy Memory", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        return menu
    }

    func menuWillOpen(_ menu: NSMenu) {
        // "Clear Reminders" clears the orb and every due reminder, so it is only
        // useful while something is showing.
        clearItem?.isEnabled = controller?.hasActiveSmoke ?? false
        loginItem?.state = LoginItem.isEnabled ? .on : .off
        // Launch at Login needs a real installed app, not a `swift run` binary.
        loginItem?.isEnabled = AppPaths.isBundled
    }

    // MARK: Actions

    @objc private func clearReminders() { controller?.click() }
    @objc private func showReminders() { remindersWindow?.show() }
    @objc private func toggleLoginItem() { LoginItem.setEnabled(!LoginItem.isEnabled) }
    @objc private func wake() { controller?.handleWake() }
    @objc private func debugCloudNow() { controller?.debugCloudNow() }
    @objc private func debugCloudIn10s() { controller?.debugCloudIn10s() }
    @objc private func debugReminderIn10s() { controller?.debugReminderIn10s() }
}
