import XCTest
@testable import GreatPeople

final class GreatPeopleTests: XCTestCase {
    func testCardTotalStats() {
        let card = Card(
            id: "1", figureName: "Test", era: "Modern", domain: .science,
            influence: 10, innovation: 20, legacy: 30,
            tier: .common, lore: "", portraitURL: URL(string: "https://example.com")!
        )
        XCTAssertEqual(card.totalStats, 60)
    }
}
