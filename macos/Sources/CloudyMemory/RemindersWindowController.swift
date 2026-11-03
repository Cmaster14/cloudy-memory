import AppKit
import SwiftUI
import CloudyMemoryCore

/// Owns the single Custom Reminders window. Reopening focuses the existing one.
final class RemindersWindowController {
    private let model: RemindersModel
    private var window: NSWindow?

    init(controller: CloudyController) {
        model = RemindersModel(controller: controller)
    }

    func show() {
        if window == nil {
            let host = NSHostingController(rootView: RemindersView(model: model))
            let newWindow = NSWindow(contentViewController: host)
            newWindow.title = "Custom Reminders"
            newWindow.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            newWindow.isReleasedWhenClosed = false
            newWindow.setContentSize(NSSize(width: 440, height: 520))
            newWindow.center()
            window = newWindow
        }
        model.refresh()
        NSApp.activate(ignoringOtherApps: true) // this is a menu bar app with no Dock icon
        window?.makeKeyAndOrderFront(nil)
    }

    /// Called whenever reminders change, so an open window stays correct.
    func refresh() {
        model.refresh()
    }
}
