import Foundation

/// Everything the Windows app keeps in src/config.js, with the same values.
public struct CloudyConfig {
    public struct Timer {
        /// The wait before the orb clouds over is picked uniformly between these.
        /// `maxMs` is clamped to 48 hours by `Orb` whatever is written here.
        public var minMs: Millis = 30 * 60 * 1000
        public var maxMs: Millis = 48 * 60 * 60 * 1000
        public init() {}
    }

    public struct Animation {
        /// Time per frame. With 9 frames, 8 steps * 220 ms is about 1.8 s.
        public var frameMs: Int64 = 220
        /// Frame 0 is fully clear, the last frame is fully clouded.
        public var frameCount: Int = 9
        public init() {}
    }

    public struct Text {
        public var clearTooltip = "Cloudy Memory"
        public var cloudyTooltip = "You have forgotten something..."
        /// Shown for a custom reminder that was created without a note.
        public var reminderFallback = "Reminder"
        public init() {}
    }

    public struct Notification {
        public var enabled = true
        public var title = "Cloudy Memory"
        public var customTitle = "Cloudy Memory - Custom Reminder"
        public var customFallbackBody = "A custom reminder is due."
        public var body = "You have seemingly forgotten something. Click the orb in the tray to clear it."
        public init() {}
    }

    public var timer = Timer()
    public var animation = Animation()
    public var text = Text()
    public var notification = Notification()

    public init() {}

    public static let standard = CloudyConfig()
}
