import Foundation
import CloudyMemoryCore

/// Bridges the controller to the SwiftUI Reminders window.
final class RemindersModel: ObservableObject {
    @Published private(set) var pending: [Reminder] = []
    @Published private(set) var fired: [Reminder] = []
    private let controller: CloudyController

    init(controller: CloudyController) {
        self.controller = controller
        refresh()
    }

    func refresh() {
        let list = controller.listReminders()
        pending = list.pending
        fired = list.fired
    }

    /// Returns an error message to show, or nil when the reminder was added.
    func add(amount: String, unit: ReminderUnit, note: String) -> String? {
        switch DelayParser.parse(amount: amount, unit: unit.rawValue) {
        case .error(let message):
            return message
        case .delay(let ms):
            if ms <= 0 { return DelayParser.amountError }
            guard controller.addReminder(delayMs: ms, note: note) != nil else {
                return "That time is too far away to schedule."
            }
            refresh()
            return nil
        }
    }

    func cancel(_ reminder: Reminder) {
        controller.cancelReminder(reminder.id)
        refresh()
    }
}
