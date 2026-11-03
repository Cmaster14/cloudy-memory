import XCTest
@testable import CloudyMemoryCore

/// Behaviour the shared fixtures cannot express (they are plain JSON).
final class RobustnessTests: XCTestCase {
    func testOrbSurvivesStorageThatThrows() {
        let orb = Orb(storage: FailingStorage(), now: { 1_000_000_000 }, random: { 0 })
        XCTAssertEqual(orb.load().snapshot.phase, .clear)
        XCTAssertTrue(orb.forceCloudy())
    }

    func testRemindersSurviveStorageThatThrows() {
        let reminders = Reminders(storage: FailingStorage(), now: { 1000 })
        _ = reminders.load()
        XCTAssertNotNil(reminders.add(delayMs: 60_000, note: "still works"))
    }

    func testReturnedRemindersAreCopies() {
        let reminders = Reminders(storage: MemoryStorage(nil), now: { 1000 })
        reminders.add(delayMs: 60_000, note: "a")
        var list = reminders.pending()
        list[0].note = "tampered"
        XCTAssertEqual(reminders.pending()[0].note, "a")
    }

    func testOrbStateFileUsesTheSameSchemaAsTheWindowsBuild() throws {
        let storage = MemoryStorage(nil)
        let orb = Orb(storage: storage, now: { 1_000_000_000 }, random: { 0.5 })
        orb.load()
        let saved = try XCTUnwrap(storage.value as? [String: Any])
        XCTAssertEqual(Set(saved.keys), ["version", "phase", "cloudyAt"])
        XCTAssertEqual(saved["version"] as? Int, 1)
    }

    func testBooleanTimestampsInAHandEditedFileAreRejected() {
        let storage = MemoryStorage([
            "version": 1,
            "reminders": [["id": "a", "note": "x", "createdAt": 1, "dueAt": true, "fired": false]],
        ] as [String: Any])
        let reminders = Reminders(storage: storage, now: { 1000 })
        reminders.load()
        XCTAssertTrue(reminders.all().isEmpty)
    }

    func testFileStorageRoundTripsAndToleratesMissingOrCorruptFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cloudy-memory-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("nested").appendingPathComponent("state.json")
        let storage = FileStorage(url: file)

        XCTAssertNil(storage.load(), "missing file")
        try storage.save(["version": 1, "phase": "clear", "cloudyAt": 123] as [String: Any])
        let first = try XCTUnwrap(storage.load() as? [String: Any])
        XCTAssertEqual(first["phase"] as? String, "clear")
        XCTAssertEqual((first["cloudyAt"] as? NSNumber)?.int64Value, 123)

        try storage.save(["version": 1, "phase": "cloudy", "cloudyAt": NSNull()] as [String: Any])
        XCTAssertEqual((storage.load() as? [String: Any])?["phase"] as? String, "cloudy")

        try Data("{ not json".utf8).write(to: file)
        XCTAssertNil(storage.load(), "corrupt file")
    }

    func testOrbAndRemindersRoundTripThroughRealFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cloudy-memory-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        var clock: Millis = 1_000_000_000

        let stateFile = FileStorage(url: dir.appendingPathComponent("state.json"))
        let remindersFile = FileStorage(url: dir.appendingPathComponent("reminders.json"))

        let orb1 = Orb(storage: stateFile, now: { clock }, random: { 0 })
        orb1.load()
        let reminders1 = Reminders(storage: remindersFile, now: { clock }, makeId: { "r1" })
        reminders1.add(delayMs: 600_000, note: "persisted")

        clock += 3_600_000 // the app was closed for an hour
        let orb2 = Orb(storage: stateFile, now: { clock }, random: { 0 })
        let reminders2 = Reminders(storage: remindersFile, now: { clock })
        XCTAssertTrue(orb2.load().becameCloudyWhileAway, "the 30 minute deadline passed while the app was closed")
        XCTAssertEqual(reminders2.load().becameDueWhileAway.map { $0.note }, ["persisted"])
    }
}
