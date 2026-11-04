import SwiftUI
import CloudyMemoryCore

/// The Custom Reminders window: a form to add a reminder, then "Due now" and
/// "Waiting" lists. Notes are only ever shown as plain text.
///
/// This view is stateless on purpose: it receives plain values and closures, so
/// it can be previewed with sample data and has no dependency on the app model.
public struct RemindersView: View {
    public var pending: [Reminder]
    public var fired: [Reminder]
    /// Called with the amount text, unit and note. Returns an error message to
    /// show, or nil when the reminder was added.
    public var onAdd: (String, ReminderUnit, String) -> String?
    public var onCancel: (Reminder) -> Void

    @State private var amount = "30"
    @State private var unit: ReminderUnit = .minutes
    @State private var note = ""
    @State private var errorMessage: String?

    public init(
        pending: [Reminder],
        fired: [Reminder],
        initialError: String? = nil,
        onAdd: @escaping (String, ReminderUnit, String) -> String?,
        onCancel: @escaping (Reminder) -> Void
    ) {
        self.pending = pending
        self.fired = fired
        self.onAdd = onAdd
        self.onCancel = onCancel
        _errorMessage = State(initialValue: initialError)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Custom Reminders").font(.title2.bold())
                    Text("When the time comes, the orb fills with green smoke and hovering over it shows your note.")
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                form

                // Keeps "in 25 minutes" honest while the window stays open.
                TimelineView(.periodic(from: .now, by: 15)) { context in
                    lists(now: context.date)
                }
            }
            .padding(20)
        }
        .frame(minWidth: 400, minHeight: 460)
    }

    // MARK: Form

    private var form: some View {
        GroupBox("New reminder") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("Remind me in")
                    TextField("30", text: $amount)
                        .frame(width: 70)
                        .multilineTextAlignment(.trailing)
                        .onSubmit(submit)
                        .onChange(of: amount) { _ in errorMessage = nil }
                    Picker("Unit", selection: $unit) {
                        ForEach(ReminderUnit.allCases, id: \.self) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 100)
                }
                TextField("What shouldn't you forget?", text: $note)
                    .onSubmit(submit)
                    .onChange(of: note) { newValue in
                        // The core trims too; this just stops the field growing past the limit.
                        if newValue.utf16.count > Reminders.maxNoteLength {
                            note = String(newValue.prefix(Reminders.maxNoteLength))
                        }
                    }
                HStack {
                    if let message = errorMessage {
                        Text(message).foregroundStyle(.red).font(.callout)
                    }
                    Spacer()
                    Button("Set reminder", action: submit)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(6)
        }
    }

    private func submit() {
        if let message = onAdd(amount, unit, note) {
            errorMessage = message
        } else {
            errorMessage = nil
            note = ""
        }
    }

    // MARK: Lists

    @ViewBuilder
    private func lists(now: Date) -> some View {
        if !fired.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Due now").font(.headline)
                Text("Choose Clear Reminders from the menu bar icon to clear these.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                ForEach(fired, id: \.id) { reminder in
                    row(reminder, isDue: true, now: now)
                }
            }
        }

        VStack(alignment: .leading, spacing: 8) {
            if !pending.isEmpty {
                Text("Waiting").font(.headline)
            }
            ForEach(pending, id: \.id) { reminder in
                row(reminder, isDue: false, now: now)
            }
            if pending.isEmpty && fired.isEmpty {
                Text("No reminders yet. Set one above and it will show up here.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func row(_ reminder: Reminder, isDue: Bool, now: Date) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                if reminder.note.isEmpty {
                    Text("No note").italic().foregroundStyle(.secondary)
                } else {
                    Text(reminder.note).fixedSize(horizontal: false, vertical: true)
                }
                Text(whenText(reminder, isDue: isDue, now: now))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(isDue ? "Dismiss" : "Cancel") { onCancel(reminder) }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isDue ? Color.green.opacity(0.15) : Color.secondary.opacity(0.08))
        )
    }

    private func whenText(_ reminder: Reminder, isDue: Bool, now: Date) -> String {
        let due = Date(timeIntervalSince1970: Double(reminder.dueAt) / 1000)
        let absolute = Self.absolute(due, now: now)
        if isDue { return "Was due \(absolute)" }
        let remaining = Int64(due.timeIntervalSince(now) * 1000)
        return "\(ReminderText.relative(ms: remaining)), \(absolute)"
    }

    private static func absolute(_ date: Date, now: Date) -> String {
        let calendar = Calendar.current
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDate(date, inSameDayAs: now) { return "today at \(time)" }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        let day = sameYear
            ? date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
            : date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().year())
        return "\(day) at \(time)"
    }
}

// MARK: - Previews (Xcode: open this file and show the canvas, Option-Command-Return)

#if DEBUG
private enum SampleReminders {
    static func make(_ note: String, in minutes: Double, fired: Bool = false) -> Reminder {
        let due = Millis((Date().timeIntervalSince1970 + minutes * 60) * 1000)
        return Reminder(id: UUID().uuidString, note: note, createdAt: due - 1_800_000, dueAt: due, fired: fired)
    }
}

#Preview("Empty") {
    RemindersView(pending: [], fired: [], onAdd: { _, _, _ in nil }, onCancel: { _ in })
        .frame(width: 440, height: 520)
}

#Preview("Pending and due") {
    RemindersView(
        pending: [
            SampleReminders.make("Call the dentist", in: 25),
            SampleReminders.make("Water the plants", in: 60 * 5 + 5),
            SampleReminders.make("", in: 60 * 24 * 3),
        ],
        fired: [
            SampleReminders.make("Take the bread out of the oven", in: -4, fired: true),
        ],
        onAdd: { _, _, _ in nil },
        onCancel: { _ in }
    )
    .frame(width: 440, height: 560)
}

#Preview("Validation error") {
    RemindersView(
        pending: [],
        fired: [],
        initialError: DelayParser.amountError,
        onAdd: { _, _, _ in DelayParser.amountError },
        onCancel: { _ in }
    )
    .frame(width: 440, height: 520)
}

#Preview("Dark, long note") {
    RemindersView(
        pending: [SampleReminders.make(String(repeating: "A very long note that wraps over several lines. ", count: 4), in: 90)],
        fired: [],
        onAdd: { _, _, _ in nil },
        onCancel: { _ in }
    )
    .frame(width: 440, height: 520)
    .preferredColorScheme(.dark)
}
#endif
