import Foundation

/// Which icon set the menu bar shows.
public enum SmokeSet: String, Equatable, CaseIterable {
    /// Only the random orb is cloudy.
    case purple
    /// Only custom reminders are showing.
    case green
    /// Both.
    case mixed
}

public struct DisplayState: Equatable {
    /// nil means nothing is cloudy.
    public var set: SmokeSet?
    public var tooltip: String
}

/// Decides what the menu bar shows, a port of src/display.js. Pure, so every
/// combination can be tested.
public enum Display {
    /// The Windows tooltip limit. macOS has no such limit, but the same cap keeps
    /// both builds identical (and is harmless here).
    public static let tooltipMax = 127
    static let noteMinBudget = 20

    private static func ellipsize(_ text: String, max limit: Int) -> String {
        if TextUtil.utf16Count(text) <= limit { return text }
        let cut = TextUtil.prefixUTF16(text, Swift.max(0, limit - 1))
        return TextUtil.trimTrailingWhitespace(cut) + "…"
    }

    /// `firedReminders` are the reminders that have come due, oldest first.
    public static func compute(
        orbPhase: OrbPhase,
        firedReminders: [Reminder],
        text: CloudyConfig.Text
    ) -> DisplayState {
        let orbCloudy = orbPhase == .cloudy
        let hasReminders = !firedReminders.isEmpty

        if !orbCloudy && !hasReminders { return DisplayState(set: nil, tooltip: text.clearTooltip) }
        if orbCloudy && !hasReminders { return DisplayState(set: .purple, tooltip: text.cloudyTooltip) }

        let fallback = text.reminderFallback.isEmpty ? "Reminder" : text.reminderFallback
        let notes = firedReminders.map { $0.note.isEmpty ? fallback : $0.note }
        let more = notes.count > 1 ? " (+\(notes.count - 1) more)" : ""
        // Keep the orb's own phrase intact; the note gets whatever room is left.
        let reserved = orbCloudy ? TextUtil.utf16Count(text.cloudyTooltip) + 1 : 0
        let budget = Swift.max(noteMinBudget, tooltipMax - reserved - TextUtil.utf16Count(more))
        let noteLine = ellipsize(notes[0], max: budget) + more

        if orbCloudy {
            return DisplayState(set: .mixed, tooltip: noteLine + "\n" + text.cloudyTooltip)
        }
        return DisplayState(set: .green, tooltip: ellipsize(noteLine, max: tooltipMax))
    }

    /// Notification body for custom reminders that have just come due.
    public static func toastBody(newlyFired: [Reminder], notification: CloudyConfig.Notification) -> String {
        if newlyFired.count == 1 {
            let note = newlyFired[0].note
            return note.isEmpty ? notification.customFallbackBody : note
        }
        return "\(newlyFired.count) custom reminders are due."
    }
}
