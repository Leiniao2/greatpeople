import XCTest
@testable import GreatPeople

final class GreatPeopleTests: XCTestCase {

    // MARK: - Card.totalStats

    func testCardTotalStatsSum() {
        let card = makeCard(politics: 10, strength: 20, culture: 30,
                            wealth: 40, intelligence: 50, technique: 60,
                            belief: 70, reputation: 80)
        XCTAssertEqual(card.totalStats, 360)
    }

    func testCardTotalStatsAllZero() {
        let card = makeCard(politics: 0, strength: 0, culture: 0,
                            wealth: 0, intelligence: 0, technique: 0,
                            belief: 0, reputation: 0)
        XCTAssertEqual(card.totalStats, 0)
    }

    func testCardTotalStatsMaxValues() {
        let card = makeCard(politics: 100, strength: 100, culture: 100,
                            wealth: 100, intelligence: 100, technique: 100,
                            belief: 100, reputation: 100)
        XCTAssertEqual(card.totalStats, 800)
    }

    // MARK: - Card stats stored correctly

    func testCardStoresAllEightStats() {
        let card = makeCard(politics: 92, strength: 35, culture: 78,
                            wealth: 25, intelligence: 82, technique: 40,
                            belief: 90, reputation: 95)
        XCTAssertEqual(card.politics, 92)
        XCTAssertEqual(card.strength, 35)
        XCTAssertEqual(card.culture, 78)
        XCTAssertEqual(card.wealth, 25)
        XCTAssertEqual(card.intelligence, 82)
        XCTAssertEqual(card.technique, 40)
        XCTAssertEqual(card.belief, 90)
        XCTAssertEqual(card.reputation, 95)
    }

    // MARK: - Card.gender

    func testCardStoresMaleGender() {
        let card = makeCard(gender: "male")
        XCTAssertEqual(card.gender, "male")
    }

    func testCardStoresFemaleGender() {
        let card = makeCard(gender: "female")
        XCTAssertEqual(card.gender, "female")
    }

    // MARK: - Card.era (7 defined values)

    func testCardStoresEra() {
        let eras = ["Ancient", "Classical", "Medieval", "Renaissance",
                    "Steam", "Electricity", "Information"]
        for era in eras {
            let card = makeCard(era: era)
            XCTAssertEqual(card.era, era)
        }
    }

    // MARK: - Card.portraitURL (remote URL)

    func testPortraitURLParsesHttpURL() {
        let card = makeCard(portraitUrl: "https://example.com/img.jpg")
        XCTAssertNotNil(card.portraitURL)
        XCTAssertEqual(card.portraitURL?.scheme, "https")
    }

    func testPortraitURLReturnsNilForAssetScheme() {
        let card = makeCard(portraitUrl: "asset:portrait_gandhi")
        XCTAssertNil(card.portraitURL)
    }

    func testPortraitURLReturnsNilForEmptyString() {
        let card = makeCard(portraitUrl: "")
        XCTAssertNil(card.portraitURL)
    }

    // MARK: - Card.localAssetName

    func testLocalAssetNameExtractsNameFromAssetScheme() {
        let card = makeCard(portraitUrl: "asset:portrait_gandhi")
        XCTAssertEqual(card.localAssetName, "portrait_gandhi")
    }

    func testLocalAssetNameIsNilForHttpURL() {
        let card = makeCard(portraitUrl: "https://example.com/img.jpg")
        XCTAssertNil(card.localAssetName)
    }

    func testLocalAssetNameIsNilForEmptyString() {
        let card = makeCard(portraitUrl: "")
        XCTAssertNil(card.localAssetName)
    }

    // MARK: - Card.Hashable / Equatable

    func testCardsWithSameIdAreEqual() {
        let a = makeCard(id: "abc")
        let b = makeCard(id: "abc", figureName: "Different Name")
        XCTAssertEqual(a, b)
    }

    func testCardsWithDifferentIdsAreNotEqual() {
        let a = makeCard(id: "a")
        let b = makeCard(id: "b")
        XCTAssertNotEqual(a, b)
    }

    func testCardsCanBeUsedInSet() {
        let a = makeCard(id: "x")
        let b = makeCard(id: "x")
        let set: Set<Card> = [a, b]
        XCTAssertEqual(set.count, 1)
    }

    // MARK: - CardTier

    func testCardTierRawValues() {
        XCTAssertEqual(CardTier.common.rawValue, "common")
        XCTAssertEqual(CardTier.rare.rawValue, "rare")
        XCTAssertEqual(CardTier.epic.rawValue, "epic")
        XCTAssertEqual(CardTier.legendary.rawValue, "legendary")
    }

    func testCardTierDecodable() {
        XCTAssertEqual(CardTier(rawValue: "legendary"), .legendary)
        XCTAssertNil(CardTier(rawValue: "unknown"))
    }

    // MARK: - AuthStore guest mode

    @MainActor func testEnterGuestModeSetsFlagTrue() {
        let store = AuthStore()
        store.enterGuestMode()
        XCTAssertTrue(store.isGuest)
    }

    @MainActor func testExitGuestModeClearsFlag() {
        let store = AuthStore()
        store.enterGuestMode()
        store.exitGuestMode()
        XCTAssertFalse(store.isGuest)
    }

    @MainActor func testGuestModeDoesNotAffectLoggedIn() {
        let store = AuthStore()
        let wasLoggedIn = store.isLoggedIn
        store.enterGuestMode()
        XCTAssertEqual(store.isLoggedIn, wasLoggedIn)
    }
}

// MARK: - Helpers

private func makeCard(
    id: String = "test-id",
    figureName: String = "Test Figure",
    era: String = "Steam",
    gender: String = "male",
    identities: [String] = [],
    tier: CardTier = .common,
    lore: String = "",
    portraitUrl: String = "",
    years: String = "2000–2024",
    characteristics: String = "",
    achievement: String = "",
    politics: Int = 50,
    strength: Int = 50,
    culture: Int = 50,
    wealth: Int = 50,
    intelligence: Int = 50,
    technique: Int = 50,
    belief: Int = 50,
    reputation: Int = 50
) -> Card {
    Card(
        id: id, figureName: figureName, era: era, gender: gender,
        identities: identities, tier: tier, lore: lore,
        portraitUrl: portraitUrl, years: years,
        characteristics: characteristics, achievement: achievement,
        politics: politics, strength: strength, culture: culture,
        wealth: wealth, intelligence: intelligence, technique: technique,
        belief: belief, reputation: reputation
    )
}
