import Foundation

public enum OrbPhase: String, Equatable {
    /// Waiting for `cloudyAt`, an absolute timestamp.
    case clear
    /// Stays cloudy until `clear()` is called.
    case cloudy
}

public struct OrbSnapshot: Equatable {
    public var phase: OrbPhase
    public var cloudyAt: Millis?
}

public struct OrbLoadResult: Equatable {
    public var snapshot: OrbSnapshot
    public var becameCloudyWhileAway: Bool
}

/// The orb's brain, a port of src/state.js: no timers, no UI. Because the
/// deadline is an absolute timestamp that gets saved, it survives restarts and
/// sleep: if it passes while nothing is running, the orb is simply cloudy the
/// next time `check()` or `load()` looks.
public final class Orb {
    public static let hourMs: Millis = 3_600_000
    /// Absolute ceiling for any wait before the orb clouds over. Applied when a
    /// delay is picked, when saved state loads, and on every check.
    public static let hardCapMs: Millis = 48 * 3_600_000
    public static let stateVersion = 1

    private let storage: JSONStorage
    private let now: () -> Millis
    private let random: () -> Double
    private let lo: Millis
    private let hi: Millis

    public private(set) var phase: OrbPhase = .clear
    public private(set) var cloudyAt: Millis?

    public init(
        storage: JSONStorage,
        now: @escaping () -> Millis = SystemTime.nowMs,
        random: @escaping () -> Double = { Double.random(in: 0..<1) },
        minMs: Millis = 30 * 60 * 1000,
        maxMs: Millis = 48 * 3_600_000
    ) {
        self.storage = storage
        self.now = now
        self.random = random
        let high = max(1, min(maxMs, Orb.hardCapMs))
        self.hi = high
        self.lo = max(0, min(minMs, high))
    }

    public var snapshot: OrbSnapshot { OrbSnapshot(phase: phase, cloudyAt: cloudyAt) }

    private func pickDelay() -> Millis {
        let value = Double(lo) + random() * Double(hi - lo)
        return Millis(value.rounded(.toNearestOrAwayFromZero))
    }

    private func persist() {
        let object: [String: Any] = [
            "version": Orb.stateVersion,
            "phase": phase.rawValue,
            "cloudyAt": cloudyAt.map { $0 as Any } ?? NSNull(),
        ]
        do {
            try storage.save(object)
        } catch {
            // Best effort: a failed save must never take the menu bar icon down.
            NSLog("[orb] could not save state: %@", String(describing: error))
        }
    }

    private func startFreshTimer() {
        phase = .clear
        cloudyAt = now() + pickDelay()
    }

    /// Turns a clear orb cloudy once its deadline has passed, and pulls in a
    /// deadline that is somehow more than 48 h away (clock moved backwards,
    /// edited file). Returns true only on the call that makes it cloudy.
    @discardableResult
    public func check() -> Bool {
        guard phase == .clear, var deadline = cloudyAt else { return false }
        let t = now()
        if deadline - t > Orb.hardCapMs {
            deadline = t + Orb.hardCapMs
            cloudyAt = deadline
            persist()
        }
        if deadline <= t {
            phase = .cloudy
            cloudyAt = nil
            persist()
            return true
        }
        return false
    }

    /// Restores saved state (or starts fresh).
    @discardableResult
    public func load() -> OrbLoadResult {
        let saved = storage.load() as? [String: Any]
        let savedPhase = saved?["phase"] as? String
        if savedPhase == OrbPhase.cloudy.rawValue {
            phase = .cloudy
            cloudyAt = nil
        } else if savedPhase == OrbPhase.clear.rawValue, let number = JSONValue.number(saved?["cloudyAt"]) {
            phase = .clear
            cloudyAt = JSONValue.clampedMillis(number)
        } else {
            startFreshTimer()
        }
        let became = check()
        persist()
        return OrbLoadResult(snapshot: snapshot, becameCloudyWhileAway: became)
    }

    /// Clears a cloudy orb and starts a new random wait. Returns false (and
    /// changes nothing) when the orb was not cloudy.
    @discardableResult
    public func clear() -> Bool {
        guard phase == .cloudy else { return false }
        startFreshTimer()
        persist()
        return true
    }

    /// Milliseconds until the orb clouds over, or nil when it is already cloudy.
    public func msUntilCloudy() -> Millis? {
        guard phase == .clear, let at = cloudyAt else { return nil }
        return max(0, at - now())
    }

    // Debug helpers, used by the debug menu items.

    @discardableResult
    public func forceCloudy() -> Bool {
        guard phase == .clear else { return false }
        phase = .cloudy
        cloudyAt = nil
        persist()
        return true
    }

    public func setNextIn(_ ms: Millis) {
        phase = .clear
        cloudyAt = now() + min(max(0, ms), Orb.hardCapMs)
        persist()
    }
}
