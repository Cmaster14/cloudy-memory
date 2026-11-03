// swift-tools-version:5.9
import PackageDescription

// CloudyMemoryCore is pure logic (no AppKit) and is shared by the macOS app
// and, later, an iOS app. CloudyMemory is the macOS menu bar shell.
let package = Package(
    name: "CloudyMemory",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "CloudyMemoryCore", targets: ["CloudyMemoryCore"]),
        .executable(name: "CloudyMemory", targets: ["CloudyMemory"]),
    ],
    targets: [
        .target(name: "CloudyMemoryCore"),
        .executableTarget(name: "CloudyMemory", dependencies: ["CloudyMemoryCore"]),
        .testTarget(name: "CloudyMemoryCoreTests", dependencies: ["CloudyMemoryCore"]),
    ]
)
