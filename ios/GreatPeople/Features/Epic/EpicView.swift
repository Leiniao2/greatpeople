import SwiftUI

struct EpicView: View {
    private let games = [
        ("Speed Quiz", "bolt.fill"),
        ("Memory Match", "square.grid.2x2.fill"),
        ("Trivia Duel", "questionmark.bubble.fill"),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                // Ambient glow
                Circle().fill(Color.gpAmber.opacity(0.06)).frame(width: 500, height: 500)
                    .blur(radius: 120).offset(x: 80, y: -80)

                VStack(spacing: 24) {
                    // Icon
                    Text("⚡")
                        .font(.system(size: 56))
                        .padding(20)
                        .background(Color.gpAmber.opacity(0.12))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 20))

                    VStack(spacing: 8) {
                        Text("MINI GAMES")
                            .font(.system(.title2, design: .serif).weight(.bold))
                            .tracking(4)
                            .foregroundColor(.white)

                        Text("Earn cards by completing challenges")
                            .font(.subheadline)
                            .foregroundColor(.gpSlate400)
                            .multilineTextAlignment(.center)
                    }

                    // Game cards grid
                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible())],
                        spacing: 12
                    ) {
                        ForEach(games, id: \.0) { game in
                            GameCard(title: game.0)
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(24)
            }
            .navigationTitle("Epic")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}

private struct GameCard: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)

            Text("Coming Soon")
                .font(.caption)
                .foregroundColor(.gpSlate400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.white.opacity(0.03))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.gpAmber.opacity(0.2), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
