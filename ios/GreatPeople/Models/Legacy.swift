import Foundation

/// A card's legacy in the Fight game, read from the bundled cards.json: what it
/// does and the card's own achievement that earns it.  Kept apart from Card so
/// the card model and its callers stay unchanged.
struct LegacyInfo {
    let name: String
    let effect: String
    let howToEarn: String
    let flavour: String
}

private struct LegacyEffectDTO: Decodable {
    let kind: String
    let stat: String?
    let amount: Int?
    let context: String?
    let years: Int?
    let count: Int?
    let card: String?
    let every: Int?
}
private struct LegacyDTO: Decodable {
    let name: String
    let effect: LegacyEffectDTO
    let flavour: String?
}
private struct LegacyCardDTO: Decodable {
    let id: String
    let achievement: String
    let legacy: LegacyDTO?
}

private let legacyTable: [String: LegacyInfo] = {
    guard let url = Bundle.main.url(forResource: "cards", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let cards = try? JSONDecoder().decode([LegacyCardDTO].self, from: data)
    else { return [:] }
    var table: [String: LegacyInfo] = [:]
    for c in cards {
        guard let l = c.legacy else { continue }
        let how = c.achievement.components(separatedBy: " — ").dropFirst().joined(separator: " — ")
        table[c.id] = LegacyInfo(name: l.name, effect: describeLegacyEffect(l.effect),
                                 howToEarn: how.isEmpty ? c.achievement : how, flavour: l.flavour ?? "")
    }
    return table
}()

func loadLegacy(cardId: String) -> LegacyInfo? { legacyTable[cardId] }

private let statLabels = [
    "politics": "Politics", "strength": "Strength", "culture": "Culture", "wealth": "Wealth",
    "intelligence": "Intelligence", "technique": "Technique", "belief": "Belief", "reputation": "Reputation",
]
private let contextWords = [
    "attack": "when you attack", "defend": "when you defend",
    "survival": "in survival checks (survivals and hazards)",
    "competition": "in global competitions", "any": "in every contest",
]

/// Plain-language rule text for a legacy effect; mirrors describeLegacyEffect in web/src/battle/engine.ts.
private func describeLegacyEffect(_ e: LegacyEffectDTO) -> String {
    let stat = e.stat ?? "any"
    let label = statLabels[stat] ?? stat
    let n = e.count ?? 1
    switch e.kind {
    case "contest": return "+\(e.amount ?? 0) \(stat == "any" ? "to your total" : label) \(contextWords[e.context ?? "any"] ?? "")."
    case "follower": return "Each of your \(stat == "any" ? "" : label + " ")Followers that counts in a contest adds +\(e.amount ?? 0) more."
    case "hazard_shield": return "Your cards ignore natural hazards."
    case "longevity": return "Your Great People live \(e.years ?? 0) years longer."
    case "prodigy": return "Your Great People start their careers \(e.years ?? 0) years earlier."
    case "successors": return "+\(n) choice whenever you pick a successor."
    case "slots": return "+\(n) Great Person slot: hold \(n == 1 ? "one more Great Person" : "\(n) more Great People") at once."
    case "locations": return "+\(n) \(n == 1 ? "city" : "cities") on the board for every player while this legacy is in effect."
    case "income": return "Every \(e.every ?? 0) years you gain \(e.card == "event" ? "an Event card" : "a Follower")."
    default: return ""
    }
}
