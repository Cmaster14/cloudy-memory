import Foundation

/// Wording for the Reminders window, a port of the helpers in src/ui/reminders.js.
public enum ReminderText {
    public static func plural(_ n: Int, _ word: String) -> String {
        "\(n) \(word)\(n == 1 ? "" : "s")"
    }

    /// "in 25 minutes", "in 2 hours 5 minutes", "in 3 days", "due now".
    public static func relative(ms: Int64) -> String {
        if ms <= 30 * 1000 { return "due now" }
        let totalMin = max(1, Int((Double(ms) / 60_000).rounded(.toNearestOrAwayFromZero)))
        if totalMin < 60 { return "in \(plural(totalMin, "minute"))" }
        let hours = totalMin / 60
        let mins = totalMin % 60
        if hours < 24 {
            return mins > 0 ? "in \(plural(hours, "hour")) \(plural(mins, "minute"))" : "in \(plural(hours, "hour"))"
        }
        let days = hours / 24
        let remHours = hours % 24
        return remHours > 0 ? "in \(plural(days, "day")) \(plural(remHours, "hour"))" : "in \(plural(days, "day"))"
    }
}
