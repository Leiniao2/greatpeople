import Foundation

enum CardTier: String, Codable { case common, rare, epic, legendary }
enum Domain: String, Codable { case science, arts, politics, philosophy, sports, other }

struct Card: Identifiable, Codable, Equatable {
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

    var portraitURL: URL? { URL(string: portraitUrl) }
    var totalStats: Int { influence + innovation + legacy }
}
