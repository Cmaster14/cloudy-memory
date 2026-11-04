import SwiftUI

/// What the menu items do. The app wires these to its model; previews use `.none`.
public struct MenuActions {
    public var clear: () -> Void
    public var showReminders: () -> Void
    public var debugCloudNow: () -> Void
    public var debugCloudIn10s: () -> Void
    public var debugReminderIn10s: () -> Void
    public var quit: () -> Void

    public init(
        clear: @escaping () -> Void,
        showReminders: @escaping () -> Void,
        debugCloudNow: @escaping () -> Void = {},
        debugCloudIn10s: @escaping () -> Void = {},
        debugReminderIn10s: @escaping () -> Void = {},
        quit: @escaping () -> Void
    ) {
        self.clear = clear
        self.showReminders = showReminders
        self.debugCloudNow = debugCloudNow
        self.debugCloudIn10s = debugCloudIn10s
        self.debugReminderIn10s = debugReminderIn10s
        self.quit = quit
    }

    public static let none = MenuActions(clear: {}, showReminders: {}, quit: {})
}

/// The menu shown when the menu bar icon is clicked (left or right click). It is
/// used with `.menuBarExtraStyle(.menu)`, so it renders as a native macOS menu.
public struct MenuContent: View {
    public var hasActiveSmoke: Bool
    @Binding public var launchAtLogin: Bool
    public var launchAtLoginAvailable: Bool
    public var showDebug: Bool
    public var actions: MenuActions

    public init(
        hasActiveSmoke: Bool,
        launchAtLogin: Binding<Bool>,
        launchAtLoginAvailable: Bool,
        showDebug: Bool,
        actions: MenuActions
    ) {
        self.hasActiveSmoke = hasActiveSmoke
        self._launchAtLogin = launchAtLogin
        self.launchAtLoginAvailable = launchAtLoginAvailable
        self.showDebug = showDebug
        self.actions = actions
    }

    public var body: some View {
        // Clears the orb and every due reminder; only useful while something is showing.
        Button("Clear Reminders", action: actions.clear)
            .disabled(!hasActiveSmoke)

        Button("Custom Reminders…", action: actions.showReminders)

        Divider()

        // Launch at Login needs a real installed app, not a `swift run` binary.
        Toggle("Launch at Login", isOn: $launchAtLogin)
            .disabled(!launchAtLoginAvailable)

        if showDebug {
            Divider()
            Button("Debug: cloud over now", action: actions.debugCloudNow)
            Button("Debug: cloud over in 10 s", action: actions.debugCloudIn10s)
            Button("Debug: custom reminder in 10 s", action: actions.debugReminderIn10s)
        }

        Divider()

        Button("Quit Cloudy Memory", action: actions.quit)
            .keyboardShortcut("q")
    }
}

// MARK: - Previews
// A real status menu is drawn by the system; the canvas shows the same items as a plain list.

#if DEBUG
#Preview("Idle") {
    VStack(alignment: .leading, spacing: 6) {
        MenuContent(
            hasActiveSmoke: false,
            launchAtLogin: .constant(false),
            launchAtLoginAvailable: true,
            showDebug: false,
            actions: .none
        )
    }
    .padding()
    .frame(width: 260)
}

#Preview("Smoke showing, launch at login on") {
    VStack(alignment: .leading, spacing: 6) {
        MenuContent(
            hasActiveSmoke: true,
            launchAtLogin: .constant(true),
            launchAtLoginAvailable: true,
            showDebug: false,
            actions: .none
        )
    }
    .padding()
    .frame(width: 260)
}

#Preview("Debug build, unbundled") {
    VStack(alignment: .leading, spacing: 6) {
        MenuContent(
            hasActiveSmoke: true,
            launchAtLogin: .constant(false),
            launchAtLoginAvailable: false,
            showDebug: true,
            actions: .none
        )
    }
    .padding()
    .frame(width: 260)
}
#endif
