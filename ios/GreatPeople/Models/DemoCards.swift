import Foundation

private struct DemoCardDTO: Decodable {
    let id: String
    let figureName: String
    let era: String
    let domain: String
    let influence: Int
    let innovation: Int
    let legacy: Int
    let tier: String
    let portraitKey: String
    let lore: String
    let years: String
    let identities: [String]
    let characteristics: String
    let achievement: String

    var asCard: Card {
        Card(
            id: id,
            figureName: figureName,
            era: era,
            domain: Domain(rawValue: domain) ?? .other,
            influence: influence,
            innovation: innovation,
            legacy: legacy,
            tier: CardTier(rawValue: tier) ?? .common,
            lore: lore,
            portraitUrl: "asset:portrait_\(portraitKey)",
            years: years,
            identities: identities,
            characteristics: characteristics,
            achievement: achievement
        )
    }
}

func loadDemoCards() -> [Card] {
    guard let url = Bundle.main.url(forResource: "demo_cards", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let dtos = try? JSONDecoder().decode([DemoCardDTO].self, from: data)
    else { return [] }
    return dtos.map(\.asCard)
}
