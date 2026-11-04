import AppKit

/// SwiftUI has no hook for the activation policy, so the app keeps this tiny
/// delegate. It is the only reason AppKit's app lifecycle appears here.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        // Menu bar only, no Dock icon. The packaged app also sets LSUIElement in
        // Info.plist; this covers running from Xcode or `swift run`.
        NSApp.setActivationPolicy(.accessory)
    }
}
