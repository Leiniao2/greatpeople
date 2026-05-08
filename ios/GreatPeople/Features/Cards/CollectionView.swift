import SwiftUI

struct CollectionView: View {
    @StateObject private var viewModel = CollectionViewModel()

    let columns = [GridItem(.adaptive(minimum: 150))]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(viewModel.cards) { card in
                        CardCell(card: card)
                    }
                }
                .padding()
            }
            .navigationTitle("My Collection")
            .task { await viewModel.load() }
        }
    }
}

struct CardCell: View {
    let card: Card
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: card.portraitURL) { img in img.resizable().scaledToFill() } placeholder: { Color.gray }
                .frame(height: 120).clipped().cornerRadius(8)
            Text(card.figureName).font(.headline).lineLimit(1)
            Text(card.tier.rawValue.capitalized).font(.caption).foregroundStyle(.secondary)
        }
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

@MainActor
final class CollectionViewModel: ObservableObject {
    @Published var cards: [Card] = []
    func load() async {
        cards = (try? await APIClient.shared.fetchCards()) ?? []
    }
}
