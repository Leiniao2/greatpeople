import Foundation

private struct DemoCardDTO: Decodable {
    let id: String
    let figureName: String
    let era: String
    let gender: String
    let identities: [String]
    let countries: [String]?
    let portraitKey: String
    let lore: String
    let years: String
    let trait: String
    let achievement: String
    let politics: Int
    let strength: Int
    let culture: Int
    let wealth: Int
    let intelligence: Int
    let technique: Int
    let belief: Int
    let reputation: Int

    var asCard: Card {
        Card(
            id: id,
            figureName: figureName,
            era: era,
            gender: gender,
            identities: identities,
            countries: countries ?? [],
            lore: lore,
            portraitUrl: "asset:portrait_\(portraitKey)",
            years: years,
            trait: trait,
            achievement: achievement,
            politics: politics,
            strength: strength,
            culture: culture,
            wealth: wealth,
            intelligence: intelligence,
            technique: technique,
            belief: belief,
            reputation: reputation
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
