import Foundation

enum CardTier: String, Codable { case common, rare, epic, legendary }

struct Card: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let figureName: String
    let era: String
    let gender: String
    let identities: [String]
    let tier: CardTier
    let lore: String
    let portraitUrl: String
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

    var portraitURL: URL? {
        portraitUrl.hasPrefix("asset:") ? nil : URL(string: portraitUrl)
    }
    var localAssetName: String? {
        portraitUrl.hasPrefix("asset:") ? String(portraitUrl.dropFirst(6)) : nil
    }
    var totalStats: Int { politics + strength + culture + wealth + intelligence + technique + belief + reputation }
}
