import SwiftUI

struct CollectionView: View {
    @StateObject private var viewModel = CollectionViewModel()
    let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                if viewModel.loading {
                    ProgressView().tint(.gpAmber)
                } else if viewModel.cards.isEmpty {
                    VStack(spacing: 12) {
                        Text("♛").font(.system(size: 48)).foregroundColor(.gpAmber.opacity(0.4))
                        Text("No cards yet").foregroundColor(.white).font(.headline)
                        Text("Win battles to earn cards").foregroundColor(.gpSlate400).font(.subheadline)
                    }
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(viewModel.cards) { card in
                                NavigationLink(value: card) {
                                    CardCell(card: card)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                    .navigationDestination(for: Card.self) { card in
                        CardDetailView(card: card)
                    }
                }
            }
            .navigationTitle("My Collection")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task { await viewModel.load() }
        }
    }
}

struct CardCell: View {
    let card: Card
    private var tierColor: Color { .tierColor(for: card.tier.rawValue) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // Portrait
            ZStack(alignment: .topTrailing) {
                Group {
                    if let url = card.portraitURL {
                        AsyncImage(url: url) { img in
                            img.resizable().scaledToFill()
                        } placeholder: {
                            tierColor.opacity(0.15)
                        }
                    } else {
                        tierColor.opacity(0.15)
                            .overlay(Text("♟").font(.system(size: 36)).foregroundColor(tierColor.opacity(0.3)))
                    }
                }
                .frame(height: 140)
                .clipped()

                // Tier badge
                Text(card.tier.rawValue.capitalized)
                    .font(.system(size: 9).weight(.bold))
                    .tracking(1)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(tierColor.opacity(0.85))
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .padding(6)
            }

            // Info
            VStack(alignment: .leading, spacing: 6) {
                Text(card.figureName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("\(card.era) · \(card.domain.rawValue)")
                    .font(.system(size: 10))
                    .foregroundColor(.gpSlate400)
                    .lineLimit(1)

                // Stats
                HStack(spacing: 4) {
                    ForEach([("INF", card.influence), ("INN", card.innovation), ("LEG", card.legacy)], id: \.0) { label, val in
                        VStack(spacing: 1) {
                            Text("\(val)").font(.system(size: 12).weight(.bold)).foregroundColor(.gpAmber)
                            Text(label).font(.system(size: 8)).foregroundColor(.gpSlate600)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            .padding(10)
        }
        .background(Color.white.opacity(0.03))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(tierColor.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

@MainActor
final class CollectionViewModel: ObservableObject {
    @Published var cards: [Card] = []
    @Published var loading = false

    func load() async {
        loading = true
        cards = (try? await APIClient.shared.fetchCards()) ?? []
        loading = false
    }
}
