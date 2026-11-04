import AppKit

/// Sets the hover tooltip on the menu bar item.
///
/// SwiftUI's MenuBarExtra has no tooltip API of its own, and the hover text is
/// the heart of this app (it shows the reminder note). The `.help()` modifier on
/// the label may or may not reach the status bar button, so this also finds the
/// button inside the status bar window and sets `toolTip` directly.
///
/// This is the one place that relies on an AppKit implementation detail (the
/// status item's window class name contains "StatusBar"). If a future macOS
/// breaks it the app still works, only the hover text is lost. If `.help()` on
/// the label turns out to work on its own, this file can be deleted.
enum StatusItemTooltip {
    private static var latest = ""

    static func apply(_ text: String) {
        latest = text
        // The status item's window may not exist yet at launch, or may be rebuilt
        // after the icon changes, so set it now and again shortly after.
        DispatchQueue.main.async { set() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { set() }
    }

    private static func set() {
        for window in NSApp.windows where String(describing: type(of: window)).contains("StatusBar") {
            if let button = firstButton(in: window.contentView) {
                button.toolTip = latest
            }
        }
    }

    private static func firstButton(in view: NSView?) -> NSButton? {
        guard let view = view else { return nil }
        if let button = view as? NSButton { return button }
        for subview in view.subviews {
            if let button = firstButton(in: subview) { return button }
        }
        return nil
    }
}
