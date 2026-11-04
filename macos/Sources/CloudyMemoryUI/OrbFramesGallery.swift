import SwiftUI
import CloudyMemoryCore

/// Every menu bar frame of every colour, enlarged, to check the art and the
/// animation order at a glance. Used only by the preview below.
struct OrbFramesGallery: View {
    var levels: Int = CloudyConfig.standard.animation.frameCount

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(SmokeSet.allCases, id: \.self) { set in
                HStack(spacing: 6) {
                    Text(set.rawValue)
                        .font(.caption)
                        .frame(width: 52, alignment: .leading)
                    ForEach(Array(OrbIcons.frames(for: set, levels: levels).enumerated()), id: \.offset) { _, image in
                        Image(nsImage: image)
                            .resizable()
                            .interpolation(.high)
                            .frame(width: 36, height: 36)
                    }
                }
            }
        }
        .padding()
    }
}

#if DEBUG
#Preview("Orb frames, light") {
    OrbFramesGallery()
}

#Preview("Orb frames, dark") {
    OrbFramesGallery().preferredColorScheme(.dark)
}
#endif
