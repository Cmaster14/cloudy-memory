// swift-tools-version:5.9
import PackageDescription

// CloudyMemoryCore  pure logic, no UI (shared with a future iOS app)
// CloudyMemoryUI    SwiftUI views and icon loading; a library target so Xcode previews work
// CloudyMemory      the macOS menu bar app (SwiftUI App + MenuBarExtra)
let package = Package(
    name: "CloudyMemory",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "CloudyMemoryCore", targets: ["CloudyMemoryCore"]),
        .library(name: "CloudyMemoryUI", targets: ["CloudyMemoryUI"]),
        .executable(name: "CloudyMemory", targets: ["CloudyMemory"]),
    ],
    targets: [
        .target(name: "CloudyMemoryCore"),
        .target(name: "CloudyMemoryUI", dependencies: ["CloudyMemoryCore"]),
        .executableTarget(name: "CloudyMemory", dependencies: ["CloudyMemoryCore", "CloudyMemoryUI"]),
        .testTarget(name: "CloudyMemoryCoreTests", dependencies: ["CloudyMemoryCore"]),
        .testTarget(name: "CloudyMemoryUITests", dependencies: ["CloudyMemoryUI", "CloudyMemoryCore"]),
    ]
)
