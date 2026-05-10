import Foundation

// MARK: - Challenge Models

enum ChallengeType: String, Decodable {
    case quiz, truefalse, sort, minigame
}

struct QuizChallenge: Decodable {
    let question: String
    let options: [String]
    let answer: Int
    let fact: String
}

struct TrueFalseChallenge: Decodable {
    let statement: String
    let correct: Bool
    let fact: String
}

struct SortChallenge: Decodable {
    let question: String
    let items: [String]
    let fact: String
}

struct ChallengeDTO: Decodable {
    let type: ChallengeType
    // quiz
    let question: String?
    let options: [String]?
    let answer: Int?
    // truefalse
    let statement: String?
    let correct: Bool?
    // sort
    let items: [String]?
    // shared
    let fact: String
}

struct StoryChallengeEntry: Decodable {
    let era: String
    let story: String
    let challenges: [ChallengeDTO]
}

// MARK: - Loader

enum StoryChallengesLoader {
    static var all: [StoryChallengeEntry] = {
        guard let url = Bundle.main.url(forResource: "story_challenges", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([StoryChallengeEntry].self, from: data)
        else { return [] }
        return entries.map { entry in
            StoryChallengeEntry(
                era: entry.era,
                story: entry.story,
                challenges: entry.challenges.filter { $0.type != .minigame }
            )
        }
    }()

    static func challenges(era: String, story: String) -> [ChallengeDTO] {
        all.first { $0.era == era && $0.story == story }?.challenges ?? []
    }
}
