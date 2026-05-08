import SwiftUI
import UIKit

private let demoCards: [Card] = [
    Card(id: "demo-1", figureName: "Gandhi", era: "Modern", domain: .politics,
         influence: 97, innovation: 85, legacy: 98, tier: .legendary,
         lore: "The soul force that moved an empire.",
         portraitUrl: "asset:portrait_gandhi", years: "1869–1948",
         identities: ["Leader", "Activist"],
         characteristics: "Resolute, compassionate, and unwavering in pursuit of justice through nonviolence.",
         achievement: "Led India's independence movement through peaceful civil disobedience, inspiring liberation movements worldwide."),
    Card(id: "demo-2", figureName: "Coco Chanel", era: "Modern", domain: .arts,
         influence: 88, innovation: 93, legacy: 90, tier: .epic,
         lore: "She dressed the world in modernity.",
         portraitUrl: "asset:portrait_coco_chanel", years: "1883–1971",
         identities: ["Designer", "Pioneer"],
         characteristics: "Audacious, elegant, and fiercely independent in defiance of convention.",
         achievement: "Liberated women's fashion from corsets and built a global luxury empire around her name."),
    Card(id: "demo-3", figureName: "Mao Zedong", era: "Modern", domain: .politics,
         influence: 92, innovation: 78, legacy: 88, tier: .epic,
         lore: "A revolution forged from peasant to chairman.",
         portraitUrl: "asset:portrait_mao_zedong", years: "1893–1976",
         identities: ["Revolutionary", "Statesman"],
         characteristics: "Strategic, ideological, and ruthlessly determined in reshaping society.",
         achievement: "Founded the People's Republic of China and united it under Communist rule in 1949."),
    Card(id: "demo-4", figureName: "Belisarius", era: "Byzantine", domain: .politics,
         influence: 75, innovation: 82, legacy: 72, tier: .rare,
         lore: "The last great general of Rome.",
         portraitUrl: "asset:portrait_belisarius", years: "505–565 AD",
         identities: ["General", "Commander"],
         characteristics: "Brilliant tactician, loyal to a fault, and capable of the impossible.",
         achievement: "Reconquered North Africa and Italy for the Byzantine Empire with a fraction of the expected resources."),
    Card(id: "demo-5", figureName: "Imhotep", era: "Ancient", domain: .arts,
         influence: 85, innovation: 96, legacy: 88, tier: .legendary,
         lore: "Deified by two civilizations for mastery of stone and medicine.",
         portraitUrl: "asset:portrait_imhotep", years: "c. 2650–2600 BC",
         identities: ["Architect", "Physician"],
         characteristics: "Visionary, meticulous, and revered as a god in his own time.",
         achievement: "Designed the Step Pyramid of Djoser — the world's first monumental stone structure."),
    Card(id: "demo-6", figureName: "Lu Yu", era: "Tang Dynasty", domain: .arts,
         influence: 65, innovation: 80, legacy: 70, tier: .rare,
         lore: "He turned leaves and water into philosophy.",
         portraitUrl: "asset:portrait_lu_yu", years: "733–804 AD",
         identities: ["Scholar", "Tea Master"],
         characteristics: "Reflective, disciplined, and devoted to the art of simplicity.",
         achievement: "Authored The Classic of Tea, establishing the philosophy and ritual of Chinese tea culture."),
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
                    if let assetName = card.localAssetName, let uiImage = UIImage(named: assetName) {
                        Image(uiImage: uiImage).resizable().scaledToFill()
                    } else if let url = card.portraitURL {
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
