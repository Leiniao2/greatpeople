import SwiftUI
import UIKit

struct CardDetailView: View {
    let card: Card

    private let tierColor: Color = .gpAmber

    var body: some View {
        ZStack {
            Color.gpBackground.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {

                    // ── Image slot — 9:16 portrait ──────────────────────
                    ZStack(alignment: .bottom) {
                        // Portrait image
                        if let assetName = card.localAssetName, let uiImage = UIImage(named: assetName) {
                            Image(uiImage: uiImage).resizable().scaledToFill()
                        } else if let url = card.portraitURL {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let img):
                                    img.resizable().scaledToFill()
                                default:
                                    tierColor.opacity(0.12)
                                        .overlay(
                                            Text("♟").font(.system(size: 80))
                                                .foregroundColor(tierColor.opacity(0.2))
                                        )
                                }
                            }
                        } else {
                            tierColor.opacity(0.12)
                                .overlay(
                                    Text("♟").font(.system(size: 80))
                                        .foregroundColor(tierColor.opacity(0.2))
                                )
                        }

                        // Bottom gradient
                        LinearGradient(
                            colors: [.clear, Color.gpBackground.opacity(0.85), Color.gpBackground],
                            startPoint: .top, endPoint: .bottom
                        )
                        .frame(maxWidth: .infinity)
                        .aspectRatio(CGFloat(16) / 5, contentMode: .fit)

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
                    .aspectRatio(CGFloat(16) / 9, contentMode: .fit)
                    .clipped()

                    // ── Info panel ──────────────────────────────────────
                    VStack(alignment: .leading, spacing: 20) {

                        // Identities
                        HStack(spacing: 8) {
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

                        // Trait
                        if !card.trait.isEmpty {
                            InfoSection(label: "Trait", text: card.trait, color: tierColor)
                        }

                        // Achievement
                        if !card.achievement.isEmpty {
                            InfoSection(label: "Achievement", text: card.achievement, color: tierColor)
                        }

                        // Stats — 4×2 grid
                        let allStats: [(String, Int)] = [
                            ("POL", card.politics), ("STR", card.strength),
                            ("CUL", card.culture),  ("WEA", card.wealth),
                            ("INT", card.intelligence), ("TEC", card.technique),
                            ("BEL", card.belief),   ("REP", card.reputation),
                        ]
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                            ForEach(allStats, id: \.0) { label, val in
                                VStack(spacing: 3) {
                                    Text("\(val)")
                                        .font(.system(size: 18).weight(.bold))
                                        .foregroundColor(tierColor)
                                    Text(label)
                                        .font(.system(size: 9).weight(.medium))
                                        .tracking(2)
                                        .foregroundColor(.gpSlate600)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(tierColor.opacity(0.07))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(tierColor.opacity(0.2), lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }

                        // Era / Gender / Identities
                        HStack(spacing: 6) {
                            Text(card.era.uppercased())
                            Text("·")
                            Text(card.gender.capitalized)
                            if !card.identities.isEmpty {
                                Text("·")
                                Text(card.identities.joined(separator: ", "))
                            }
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
