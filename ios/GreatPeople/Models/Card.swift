import Foundation

enum CardTier: String, Codable { case common, rare, epic, legendary }
enum Domain: String, Codable { case science, arts, politics, philosophy, sports, other }

struct Card: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let figureName: String
    let era: String
    let domain: Domain
    let influence: Int
    let innovation: Int
    let legacy: Int
    let tier: CardTier
    let lore: String
    let portraitUrl: String
    let years: String
    let identities: [String]
    let characteristics: String
    let achievement: String

    var portraitURL: URL? {
        portraitUrl.hasPrefix("asset:") ? nil : URL(string: portraitUrl)
    }
    var localAssetName: String? {
        portraitUrl.hasPrefix("asset:") ? String(portraitUrl.dropFirst(6)) : nil
    }
    var totalStats: Int { influence + innovation + legacy }
}
