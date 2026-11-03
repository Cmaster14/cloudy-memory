import Foundation

public enum ReminderUnit: String, CaseIterable {
    case minutes
    case hours
    case days

    public var milliseconds: Double {
        switch self {
        case .minutes: return 60 * 1000
        case .hours: return 60 * 60 * 1000
        case .days: return 24 * 60 * 60 * 1000
        }
    }
}

public enum DelayParseResult: Equatable {
    case delay(Double)
    case error(String)
}

/// Turns the reminder form's amount and unit into a delay in milliseconds
/// (the equivalent of parseDelay in src/ipc.js). `amount` may be a number or
/// text; anything else is rejected.
public enum DelayParser {
    public static let amountError = "Enter an amount greater than zero."
    public static let unitError = "Choose minutes, hours or days."

    public static func parse(amount: Any?, unit: Any?) -> DelayParseResult {
        let n: Double
        if let text = amount as? String {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let parsed = Double(trimmed) else { return .error(amountError) }
            n = parsed
        } else if let number = JSONValue.number(amount) {
            n = number
        } else {
            return .error(amountError)
        }
        guard n.isFinite, n > 0 else { return .error(amountError) }

        guard let name = unit as? String, let parsedUnit = ReminderUnit(rawValue: name) else {
            return .error(unitError)
        }
        return .delay((n * parsedUnit.milliseconds).rounded(.toNearestOrAwayFromZero))
    }
}
