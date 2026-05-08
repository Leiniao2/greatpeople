import SwiftUI

private let demoCards: [Card] = [
    Card(id: "demo-1", figureName: "Leonardo da Vinci", era: "Renaissance", domain: .arts,
         influence: 95, innovation: 98, legacy: 100, tier: .legendary, lore: "The ultimate Renaissance man.",
         portraitUrl: "", years: "1452–1519", identities: ["Polymath", "Inventor"],
         characteristics: "Insatiably curious, visionary, and obsessively detail-oriented.",
         achievement: "Painted the Mona Lisa; designed flying machines centuries before they were built."),
    Card(id: "demo-2", figureName: "Marie Curie", era: "Modern", domain: .science,
         influence: 88, innovation: 95, legacy: 92, tier: .epic, lore: "She broke every barrier twice.",
         portraitUrl: "", years: "1867–1934", identities: ["Scientist", "Pioneer"],
         characteristics: "Rigorous, determined, and fearless in the face of adversity.",
         achievement: "First person to win Nobel Prizes in two sciences — Physics and Chemistry."),
    Card(id: "demo-3", figureName: "Nikola Tesla", era: "Industrial", domain: .science,
         influence: 82, innovation: 97, legacy: 85, tier: .epic, lore: "Visionary engineer ahead of his time.",
         portraitUrl: "", years: "1856–1943", identities: ["Inventor", "Engineer"],
         characteristics: "Eccentric, brilliant, and relentlessly inventive.",
         achievement: "Developed alternating current (AC) systems powering the modern world."),
    Card(id: "demo-4", figureName: "Julius Caesar", era: "Ancient", domain: .politics,
         influence: 90, innovation: 72, legacy: 88, tier: .rare, lore: "His name became a title for millennia.",
         portraitUrl: "", years: "100–44 BC", identities: ["General", "Statesman"],
         characteristics: "Decisive, charismatic, calculating, and supremely confident.",
         achievement: "Conquered Gaul and reformed the Roman calendar still in use today."),
]

struct CollectionView: View {
    @EnvironmentObject var authStore: AuthStore
    @StateObject private var viewModel = CollectionViewModel()
    let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    private var displayCards: [Card] {
        authStore.isGuest ? demoCards : viewModel.cards
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Guest banner
                    if authStore.isGuest {
                        HStack {
                            Text("Exploring as guest — demo cards only")
                                .font(.caption)
                                .foregroundColor(.gpAmber.opacity(0.8))
                            Spacer()
                            Button("Sign In") {
                                authStore.exitGuestMode()
                            }
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gpAmber)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.gpAmber.opacity(0.08))
                        .overlay(Rectangle().frame(height: 1).foregroundColor(Color.gpAmber.opacity(0.2)), alignment: .bottom)
                    }

                    if viewModel.loading && !authStore.isGuest {
                        Spacer()
                        ProgressView().tint(.gpAmber)
                        Spacer()
                    } else if displayCards.isEmpty {
                        Spacer()
                        VStack(spacing: 12) {
                            Text("♛").font(.system(size: 48)).foregroundColor(.gpAmber.opacity(0.4))
                            Text("No cards yet").foregroundColor(.white).font(.headline)
                            Text("Win battles to earn cards").foregroundColor(.gpSlate400).font(.subheadline)
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 12) {
                                ForEach(displayCards) { card in
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
            }
            .navigationTitle(authStore.isGuest ? "Demo Collection" : "My Collection")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task {
                if !authStore.isGuest { await viewModel.load() }
            }
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
