import SwiftUI

struct CardDetailView: View {
    let card: Card

    private var tierColor: Color { .tierColor(for: card.tier.rawValue) }

    var body: some View {
        ZStack {
            Color.gpBackground.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {

                    // ── Image slot (9:16 portrait) ──────────────────────
                    GeometryReader { geo in
                        ZStack(alignment: .bottom) {
                            // Portrait image
                            Group {
                                if let url = card.portraitURL {
                                    AsyncImage(url: url) { phase in
                                        switch phase {
                                        case .success(let img): img.resizable().scaledToFill()
                                        default:
                                            tierColor.opacity(0.12)
                                                .overlay(Text("♟").font(.system(size: 80))
                                                    .foregroundColor(tierColor.opacity(0.2)))
                                        }
                                    }
                                } else {
                                    tierColor.opacity(0.12)
                                        .overlay(Text("♟").font(.system(size: 80))
                                            .foregroundColor(tierColor.opacity(0.2)))
                                }
                            }
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()

                            // Bottom gradient
                            LinearGradient(
                                colors: [.clear, Color.gpBackground.opacity(0.85), Color.gpBackground],
                                startPoint: .top, endPoint: .bottom
                            )
                            .frame(height: geo.size.height * 0.45)

                            // Name + years overlay
                            VStack(alignment: .leading, spacing: 4) {
                                Text(card.figureName)
                                    .font(.system(.title, design: .serif).weight(.bold))
                                    .foregroundColor(.white)
                                if !card.years.isEmpty {
                                    Text(card.years)
                                        .font(.subheadline)
                                        .foregroundColor(.white.opacity(0.55))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 20)
                        }
                    }
                    // Force 9:16 aspect ratio
                    .aspectRatio(9/16, contentMode: .fit)

                    // ── Info panel ──────────────────────────────────────
                    VStack(alignment: .leading, spacing: 20) {

                        // Tier badge + identities
                        HStack(spacing: 8) {
                            Text(card.tier.rawValue.capitalized)
                                .font(.system(size: 10).weight(.bold))
                                .tracking(1.5)
                                .padding(.horizontal, 10).padding(.vertical, 4)
                                .background(tierColor.opacity(0.85))
                                .foregroundColor(.white)
                                .clipShape(Capsule())

                            ForEach(Array(card.identities.prefix(2)), id: \.self) { identity in
                                Text(identity)
                                    .font(.system(size: 11).weight(.semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 4)
                                    .background(tierColor.opacity(0.12))
                                    .foregroundColor(tierColor)
                                    .overlay(Capsule().stroke(tierColor.opacity(0.35), lineWidth: 1))
                                    .clipShape(Capsule())
                            }
                        }

                        // Characteristics
                        if !card.characteristics.isEmpty {
                            InfoSection(label: "Characteristics", text: card.characteristics, color: tierColor)
                        }

                        // Achievement
                        if !card.achievement.isEmpty {
                            InfoSection(label: "Achievement", text: card.achievement, color: tierColor)
                        }

                        // Stats
                        HStack(spacing: 12) {
                            ForEach([("INF", card.influence), ("INN", card.innovation), ("LEG", card.legacy)], id: \.0) { label, val in
                                VStack(spacing: 3) {
                                    Text("\(val)")
                                        .font(.system(size: 22).weight(.bold))
                                        .foregroundColor(tierColor)
                                    Text(label)
                                        .font(.system(size: 9).weight(.medium))
                                        .tracking(2)
                                        .foregroundColor(.gpSlate600)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(tierColor.opacity(0.07))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(tierColor.opacity(0.2), lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }

                        // Era / Domain
                        HStack(spacing: 6) {
                            Text(card.era.uppercased())
                            Text("·")
                            Text(card.domain.rawValue.capitalized)
                        }
                        .font(.system(size: 11))
                        .foregroundColor(.gpSlate600)

                        // Lore
                        if !card.lore.isEmpty {
                            InfoSection(label: "Lore", text: card.lore, color: tierColor, italic: true)
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

private struct InfoSection: View {
    let label: String
    let text: String
    let color: Color
    var italic: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 10).weight(.bold))
                .tracking(2)
                .foregroundColor(color)
            Text(text)
                .font(italic ? .system(.subheadline).italic() : .subheadline)
                .foregroundColor(italic ? .gpSlate400 : .white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
