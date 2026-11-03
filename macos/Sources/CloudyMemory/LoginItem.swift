import ServiceManagement

/// "Launch at Login" through the modern login-item API (macOS 13+). It only
/// works for an app installed as a real bundle, so the menu item is disabled
/// when running unbundled, like the Windows build disables it unpackaged.
enum LoginItem {
    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    static func setEnabled(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("[login item] could not change: %@", String(describing: error))
        }
    }
}
