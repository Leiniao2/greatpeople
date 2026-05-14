import SwiftUI
import UIKit

private let demoCards: [Card] = loadCards()

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
    private let tierColor: Color = .gpAmber

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

            }

            // Info
            VStack(alignment: .leading, spacing: 6) {
                Text(card.figureName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("\(card.era) · \(card.gender)")
                    .font(.system(size: 10))
                    .foregroundColor(.gpSlate400)
                    .lineLimit(1)

                if !card.identities.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(card.identities.prefix(2), id: \.self) { identity in
                            Text(identity)
                                .font(.system(size: 8).weight(.medium))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.gpAmber.opacity(0.08))
                                .foregroundColor(.gpAmber.opacity(0.7))
                                .overlay(Capsule().stroke(Color.gpAmber.opacity(0.25), lineWidth: 0.5))
                                .clipShape(Capsule())
                        }
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
