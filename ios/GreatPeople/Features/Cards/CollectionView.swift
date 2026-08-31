import SwiftUI
import UIKit

private let allCards: [Card] = loadCards()

struct CollectionView: View {
    @EnvironmentObject var authStore: AuthStore
    @StateObject private var viewModel = CollectionViewModel()
    let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    private func isOwned(_ card: Card) -> Bool {
        guard !authStore.isGuest else { return false }
        return viewModel.ownedIds.contains(card.id)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Guest banner
                    if authStore.isGuest {
                        HStack {
                            Text("Complete stories in Epic mode to unlock cards")
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

                    if viewModel.loading {
                        Spacer()
                        ProgressView().tint(.gpAmber)
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 12) {
                                ForEach(allCards) { card in
                                    NavigationLink(value: card) {
                                        CardCell(card: card, owned: isOwned(card))
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
            .navigationTitle("Collection")
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
    let owned: Bool
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
                .opacity(owned ? 1.0 : 0.35)

                if !owned {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(6)
                        .background(Color.black.opacity(0.5))
                        .clipShape(Circle())
                        .padding(8)
                }
            }

            // Info
            VStack(alignment: .leading, spacing: 6) {
                Text(card.figureName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(owned ? .white : .gpSlate400)
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
                                .foregroundColor(.gpAmber.opacity(owned ? 0.7 : 0.35))
                                .overlay(Capsule().stroke(Color.gpAmber.opacity(0.25), lineWidth: 0.5))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(10)
        }
        .background(Color.white.opacity(owned ? 0.03 : 0.015))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(tierColor.opacity(owned ? 0.25 : 0.1), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

@MainActor
final class CollectionViewModel: ObservableObject {
    @Published var ownedIds: Set<String> = []
    @Published var loading = false

    func load() async {
        loading = true
        let fetched = (try? await APIClient.shared.fetchCards()) ?? []
        ownedIds = Set(fetched.map(\.id))
        loading = false
    }
}
