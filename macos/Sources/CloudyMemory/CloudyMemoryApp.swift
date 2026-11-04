import SwiftUI
import CloudyMemoryUI

@main
struct CloudyMemoryApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        // Clicking the icon (left or right) opens a native menu. "Clear Reminders"
        // in that menu replaces the Windows build's click-to-clear.
        MenuBarExtra {
            MenuContent(
                hasActiveSmoke: model.hasActiveSmoke,
                launchAtLogin: Binding(
                    get: { model.launchAtLogin },
                    set: { model.setLaunchAtLogin($0) }
                ),
                launchAtLoginAvailable: model.launchAtLoginAvailable,
                showDebug: model.debugMenu,
                actions: MenuActions(
                    clear: { model.clearReminders() },
                    showReminders: { model.showRemindersWindow() },
                    debugCloudNow: { model.debugCloudNow() },
                    debugCloudIn10s: { model.debugCloudIn10s() },
                    debugReminderIn10s: { model.debugReminderIn10s() },
                    quit: { model.quit() }
                )
            )
        } label: {
            // The icon is a full-colour image that changes every animation frame.
            Image(nsImage: model.icon)
                .renderingMode(.original) // never tint: the smoke colours matter
                .help(model.tooltip)
        }
        .menuBarExtraStyle(.menu)
    }
}
