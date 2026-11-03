import AppKit
import CloudyMemoryCore

/// Draws the orb in the menu bar. The status item's menu opens on any click
/// (left or right), which is what NSStatusItem does when `menu` is set.
final class StatusItemPresenter: NSObject, TrayPresenter {
    /// Menu bar icons are about 18 pt; the PNGs are 18 px (@1x) and 36 px (@2x).
    private static let iconPoints = NSSize(width: 18, height: 18)
    private static let pixelSizes = [18, 36]

    private let statusItem: NSStatusItem
    private let notifier = Notifier()
    private var frames: [SmokeSet: [NSImage]] = [:]

    init(menu: NSMenu, levels: Int) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        for set in SmokeSet.allCases {
            frames[set] = StatusItemPresenter.loadFrames(set: set, levels: levels)
        }
        statusItem.menu = menu
        statusItem.button?.imagePosition = .imageOnly
    }

    func requestNotificationPermission() {
        notifier.requestPermission()
    }

    // MARK: TrayPresenter

    func show(set: SmokeSet, frame: Int) {
        guard let images = frames[set], images.indices.contains(frame) else { return }
        statusItem.button?.image = images[frame]
    }

    func setTooltip(_ text: String) {
        statusItem.button?.toolTip = text
    }

    func notify(title: String, body: String) {
        notifier.post(title: title, body: body)
    }

    // MARK: Icon loading

    private static func prefix(for set: SmokeSet) -> String {
        switch set {
        case .purple: return ""
        case .green: return "green-"
        case .mixed: return "mixed-"
        }
    }

    /// One NSImage per smoke level with an @1x and an @2x bitmap. These are
    /// full-colour images, deliberately not "template" images: template images
    /// are tinted monochrome, which would erase the purple and green smoke.
    private static func loadFrames(set: SmokeSet, levels: Int) -> [NSImage] {
        let directory = AppPaths.framesDirectory
        let filePrefix = prefix(for: set)
        return (0..<levels).map { (level: Int) -> NSImage in
            let image = NSImage(size: iconPoints)
            for px in pixelSizes {
                let url = directory.appendingPathComponent("orb-\(filePrefix)L\(level)-\(px).png")
                guard let data = try? Data(contentsOf: url), let rep = NSBitmapImageRep(data: data) else { continue }
                rep.size = iconPoints // 36 px at 18 pt is the @2x representation
                image.addRepresentation(rep)
            }
            image.isTemplate = false
            if image.representations.isEmpty {
                NSLog("[icons] missing frames in %@, drawing a placeholder", directory.path)
                return placeholder(set: set, level: level, levels: levels)
            }
            return image
        }
    }

    /// Only used if the PNGs are missing, so the app is never invisible.
    private static func placeholder(set: SmokeSet, level: Int, levels: Int) -> NSImage {
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
