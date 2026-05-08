import XCTest
@testable import GreatPeople

final class GreatPeopleTests: XCTestCase {

    // MARK: - Card.totalStats

    func testCardTotalStats() {
        let card = makeCard(influence: 10, innovation: 20, legacy: 30)
        XCTAssertEqual(card.totalStats, 60)
    }

    func testCardTotalStatsAllZero() {
        let card = makeCard(influence: 0, innovation: 0, legacy: 0)
        XCTAssertEqual(card.totalStats, 0)
    }

    func testCardTotalStatsMaxValues() {
        let card = makeCard(influence: 100, innovation: 100, legacy: 100)
        XCTAssertEqual(card.totalStats, 300)
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

    // MARK: - Domain

    func testDomainRawValues() {
        XCTAssertEqual(Domain.science.rawValue, "science")
        XCTAssertEqual(Domain.arts.rawValue, "arts")
        XCTAssertEqual(Domain.politics.rawValue, "politics")
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
    era: String = "Modern",
    domain: Domain = .science,
    influence: Int = 50,
    innovation: Int = 50,
    legacy: Int = 50,
    tier: CardTier = .common,
    lore: String = "",
    portraitUrl: String = "",
    years: String = "2000–2024",
    identities: [String] = [],
    characteristics: String = "",
    achievement: String = ""
) -> Card {
    Card(
        id: id, figureName: figureName, era: era, domain: domain,
        influence: influence, innovation: innovation, legacy: legacy,
        tier: tier, lore: lore, portraitUrl: portraitUrl,
        years: years, identities: identities,
        characteristics: characteristics, achievement: achievement
    )
}
