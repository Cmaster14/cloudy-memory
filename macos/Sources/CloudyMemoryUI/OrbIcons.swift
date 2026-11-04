import AppKit
import CloudyMemoryCore

/// Loads the menu bar orb frames (assets/frames/orb-[set-]L<level>-<18|36>.png).
public enum OrbIcons {
    /// Menu bar icons are about 18 pt; the PNGs are 18 px (@1x) and 36 px (@2x).
    public static let iconPoints = NSSize(width: 18, height: 18)
    public static let pixelSizes = [18, 36]

    /// The app bundle's `frames` folder, or the repository's `assets/frames`
    /// when running from a source checkout (Xcode, `swift run`, previews).
    public static var defaultDirectory: URL {
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("frames", isDirectory: true),
           FileManager.default.fileExists(atPath: bundled.path) {
            return bundled
        }
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // CloudyMemoryUI
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // macos
            .deletingLastPathComponent() // repository root
            .appendingPathComponent("assets")
            .appendingPathComponent("frames")
    }

    public static func filePrefix(for set: SmokeSet) -> String {
        switch set {
        case .purple: return ""
        case .green: return "green-"
        case .mixed: return "mixed-"
        }
    }

    /// One NSImage per smoke level with an @1x and an @2x bitmap. These are
    /// full-colour images, deliberately not "template" images: template images
    /// are tinted monochrome, which would erase the purple and green smoke.
    public static func frames(
        for set: SmokeSet,
        levels: Int,
        directory: URL = OrbIcons.defaultDirectory
    ) -> [NSImage] {
        let prefix = filePrefix(for: set)
        return (0..<levels).map { (level: Int) -> NSImage in
            let image = NSImage(size: iconPoints)
            for px in pixelSizes {
                let url = directory.appendingPathComponent("orb-\(prefix)L\(level)-\(px).png")
                guard let data = try? Data(contentsOf: url), let rep = NSBitmapImageRep(data: data) else { continue }
                rep.size = iconPoints // 36 px at 18 pt is the @2x representation
                image.addRepresentation(rep)
            }
            image.isTemplate = false
            if image.representations.isEmpty {
                return placeholder(set: set, level: level, levels: levels)
            }
            return image
        }
    }

    /// Only used if the PNGs are missing, so the menu bar item is never invisible.
    static func placeholder(set: SmokeSet, level: Int, levels: Int) -> NSImage {
        let amount = CGFloat(level) / CGFloat(max(1, levels - 1))
        return NSImage(size: iconPoints, flipped: false) { rect in
            let orb = NSBezierPath(ovalIn: rect.insetBy(dx: 1.5, dy: 1.5))
            NSColor(calibratedRed: 0.81, green: 0.91, blue: 1.0, alpha: 0.6).setFill()
            orb.fill()
            let smoke: NSColor
            switch set {
            case .purple: smoke = NSColor(calibratedRed: 0.35, green: 0.29, blue: 0.53, alpha: amount)
            case .green: smoke = NSColor(calibratedRed: 0.18, green: 0.49, blue: 0.29, alpha: amount)
            case .mixed: smoke = NSColor(calibratedRed: 0.27, green: 0.39, blue: 0.41, alpha: amount)
            }
            smoke.setFill()
            orb.fill()
            NSColor.labelColor.setStroke()
            orb.lineWidth = 1.2
            orb.stroke()
            return true
        }
    }
}
