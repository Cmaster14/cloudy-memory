import Foundation
import UserNotifications

/// Local notifications. They need a real app bundle, so everything here is a
/// no-op when running unbundled with `swift run`.
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    private var center: UNUserNotificationCenter? {
        AppPaths.isBundled ? UNUserNotificationCenter.current() : nil
    }

    func requestPermission() {
        guard let center = center else { return }
        center.delegate = self
        center.requestAuthorization(options: [.alert]) { _, error in
            if let error = error { NSLog("[notifications] permission error: %@", String(describing: error)) }
        }
    }

    func post(title: String, body: String) {
        guard let center = center else {
            NSLog("[notifications] %@: %@", title, body)
            return
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = nil // silent, like the Windows toast
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        center.add(request) { error in
            if let error = error { NSLog("[notifications] could not post: %@", String(describing: error)) }
        }
    }

    // Show banners even though this app is technically "in the foreground".
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }
}
