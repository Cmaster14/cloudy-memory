import AppKit
import SwiftUI
import CloudyMemoryUI

/// The Custom Reminders view bound to the app model.
struct RemindersScreen: View {
    @ObservedObject var model: AppModel

    var body: some View {
        RemindersView(
            pending: model.pending,
            fired: model.fired,
            onAdd: { amount, unit, note in model.addReminder(amount: amount, unit: unit, note: note) },
            onCancel: { reminder in model.cancelReminder(reminder) }
        )
    }
}

/// Opens the Custom Reminders window (one at a time; reopening focuses it).
///
/// The window's content is SwiftUI. It is hosted in a plain NSWindow, rather than
/// a SwiftUI `Window` scene, because a `Window` scene opens by itself at launch
/// on macOS 13 and 14 (the `.defaultLaunchBehavior(.suppressed)` that prevents
/// that needs macOS 15), and a menu bar app must start with no window.
final class RemindersWindow {
    static let shared = RemindersWindow()
    private var window: NSWindow?

    func show(model: AppModel) {
        if window == nil {
            let host = NSHostingController(rootView: RemindersScreen(model: model))
            let newWindow = NSWindow(contentViewController: host)
            newWindow.title = "Custom Reminders"
            newWindow.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            newWindow.isReleasedWhenClosed = false
            newWindow.setContentSize(NSSize(width: 440, height: 520))
            newWindow.center()
            window = newWindow
        }
        NSApp.activate(ignoringOtherApps: true) // a menu bar app is not frontmost by default
        window?.makeKeyAndOrderFront(nil)
    }
}
