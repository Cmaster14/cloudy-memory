import XCTest
import AppKit
@testable import CloudyMemoryUI
import CloudyMemoryCore

/// Guards the macOS icon pipeline: every colour and level must exist at 18 px and 36 px.
final class OrbIconsTests: XCTestCase {
    func testEveryFrameExistsAtBothMenuBarSizes() throws {
        let levels = CloudyConfig.standard.animation.frameCount
        let directory = OrbIcons.defaultDirectory
        for set in SmokeSet.allCases {
            for level in 0..<levels {
                for px in OrbIcons.pixelSizes {
                    let name = "orb-\(OrbIcons.filePrefix(for: set))L\(level)-\(px).png"
                    let data = try Data(contentsOf: directory.appendingPathComponent(name))
                    let rep = try XCTUnwrap(NSBitmapImageRep(data: data), name)
                    XCTAssertEqual(rep.pixelsWide, px, "\(name) width")
                    XCTAssertEqual(rep.pixelsHigh, px, "\(name) height")
                }
            }
        }
    }

    func testFramesAreFullColourTwoRepresentationImages() {
        let levels = CloudyConfig.standard.animation.frameCount
        for set in SmokeSet.allCases {
            let frames = OrbIcons.frames(for: set, levels: levels)
            XCTAssertEqual(frames.count, levels)
            for (level, image) in frames.enumerated() {
                XCTAssertFalse(image.isTemplate, "\(set) \(level) must not be a template image")
                XCTAssertEqual(image.representations.count, 2, "\(set) \(level) needs @1x and @2x")
                XCTAssertEqual(image.size.width, 18)
            }
        }
    }
}
