import SwiftUI

// MARK: - Category model

private struct ArcadeCategory {
    let key: String
    let label: String
    let icon: String
    let color: Color
}

private let arcadeCategories: [ArcadeCategory] = [
    .init(key: "All",      label: "All",      icon: "◈", color: .gpSlate400),
    .init(key: "Trivia",   label: "Trivia",   icon: "?", color: .gpAmber),
    .init(key: "Puzzle",   label: "Puzzle",   icon: "◻", color: Color(red: 0.02, green: 0.71, blue: 0.83)),
    .init(key: "Creative", label: "Creative", icon: "✿", color: Color(red: 0.06, green: 0.71, blue: 0.51)),
    .init(key: "Story",    label: "Story",    icon: "✦", color: Color(red: 0.55, green: 0.36, blue: 0.97)),
    .init(key: "Explore",  label: "Explore",  icon: "◎", color: Color(red: 0.94, green: 0.27, blue: 0.27)),
]

private let gameCategory: [String: String] = [
    "quiz": "Trivia", "truefalse": "Trivia",
    "mirror": "Puzzle", "sudoku": "Puzzle", "circuit": "Puzzle",
    "geometry": "Puzzle", "chemistry": "Puzzle", "classify": "Puzzle",
    "crossword": "Puzzle", "matchthree": "Puzzle",
    "painting": "Creative", "cooking": "Creative", "music": "Creative",
    "fiction": "Story", "voting": "Story", "sort": "Story", "tactics": "Story",
    "maze": "Explore",
]

private let gameLabel: [String: String] = [
    "quiz": "Quiz", "truefalse": "True / False", "sort": "Sort",
    "maze": "Maze", "mirror": "Mirror",
    "circuit": "Circuit", "crossword": "Crossword", "geometry": "Geometry",
    "painting": "Painting", "music": "Music", "tactics": "Tactics",
    "classify": "Classify", "cooking": "Cooking", "fiction": "Fiction",
    "sudoku": "Sudoku", "voting": "Voting", "chemistry": "Chemistry",
    "matchthree": "Match Three",
]

// MARK: - Flat challenge

private struct FlatChallenge: Identifiable {
    let id: String
    let game: String
    let storyName: String
    let era: String
    let instruction: String
    let dto: ChallengeDTO
}

private func gameKey(_ dto: ChallengeDTO) -> String {
    dto.game ?? dto.type.rawValue
}

private func instructionFor(_ dto: ChallengeDTO) -> String {
    dto.instruction ?? dto.question ?? dto.statement ?? "Explore this challenge"
}

// MARK: - ArcadeView

struct ArcadeView: View {
    @Environment(\.dismiss) private var dismiss

    private let allChallenges: [FlatChallenge] = {
        StoryChallengesLoader.all.enumerated().flatMap { (si, entry) in
            entry.challenges.enumerated().map { (ci, dto) in
                FlatChallenge(
                    id: "\(si)-\(ci)",
                    game: gameKey(dto),
                    storyName: entry.story,
                    era: entry.era,
                    instruction: instructionFor(dto),
                    dto: dto
                )
            }
        }
    }()

    @State private var activeCategory = "All"
    @State private var playing: FlatChallenge?

    private var filtered: [FlatChallenge] {
        guard activeCategory != "All" else { return allChallenges }
        return allChallenges.filter { gameCategory[$0.game] == activeCategory }
    }

    private var counts: [String: Int] {
        var m: [String: Int] = ["All": allChallenges.count]
        for ch in allChallenges {
            guard let cat = gameCategory[ch.game] else { continue }
            m[cat, default: 0] += 1
        }
        return m
    }

    var body: some View {
        ZStack {
            Color.gpBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ARCADE")
                            .font(.headline.weight(.bold))
                            .tracking(2)
                            .foregroundColor(.white)
                        Text("\(allChallenges.count) mini challenges · play any, anytime")
                            .font(.caption2)
                            .foregroundColor(.gpSlate400)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)

                Divider().background(Color.white.opacity(0.06))

                // Category chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(arcadeCategories, id: \.key) { cat in
                            let active = activeCategory == cat.key
                            let count = counts[cat.key] ?? 0
                            Button(action: { activeCategory = cat.key }) {
                                HStack(spacing: 4) {
                                    Text(cat.icon)
                                        .font(.system(size: 11))
                                    Text(cat.label)
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("\(count)")
                                        .font(.system(size: 10))
                                        .opacity(0.6)
                                }
                                .foregroundColor(active ? cat.color : .gpSlate400)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(active ? cat.color.opacity(0.15) : Color.white.opacity(0.04))
                                .overlay(
                                    Capsule()
                                        .stroke(active ? cat.color.opacity(0.6) : Color.white.opacity(0.1), lineWidth: 1)
                                )
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }

                Divider().background(Color.white.opacity(0.06))

                // Challenge list
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filtered) { ch in
                            ArcadeChallengeCard(ch: ch) { playing = ch }
                        }
                    }
                    .padding(12)
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(item: $playing) { ch in
            ArcadeChallengeSheet(ch: ch)
        }
    }
}

// MARK: - Challenge card

private struct ArcadeChallengeCard: View {
    let ch: FlatChallenge
    let onTap: () -> Void

    private var cat: ArcadeCategory {
        let key = gameCategory[ch.game] ?? "All"
        return arcadeCategories.first { $0.key == key } ?? arcadeCategories[0]
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Category icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(cat.color.opacity(0.15))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(cat.color.opacity(0.3), lineWidth: 1)
                        )
                    Text(cat.icon)
                        .font(.system(size: 16))
                        .foregroundColor(cat.color)
                }
                .frame(width: 36, height: 36)

                // Labels
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(gameLabel[ch.game] ?? ch.game)
                            .font(.system(size: 9, weight: .bold))
                            .tracking(1)
                            .foregroundColor(cat.color)
                        Text("·")
                            .font(.system(size: 9))
                            .foregroundColor(.gpSlate400.opacity(0.5))
                        Text(ch.era)
                            .font(.system(size: 9))
                            .foregroundColor(.gpSlate400.opacity(0.5))
                    }
                    Text(ch.instruction)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.85))
                        .lineLimit(2)
                    Text(ch.storyName)
                        .font(.system(size: 10))
                        .foregroundColor(.gpSlate400.opacity(0.6))
                }

                Spacer()

                Text("→")
                    .font(.title3)
                    .foregroundColor(.gpAmber.opacity(0.6))
            }
            .padding(14)
            .background(Color.white.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Challenge sheet

private struct ArcadeChallengeSheet: View {
    let ch: FlatChallenge
    @Environment(\.dismiss) private var dismiss

    @State private var answered = false
    @State private var lastCorrect = false

    private var cat: ArcadeCategory {
        let key = gameCategory[ch.game] ?? "All"
        return arcadeCategories.first { $0.key == key } ?? arcadeCategories[0]
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Game type badge + story
                        HStack(spacing: 8) {
                            Text(gameLabel[ch.game] ?? ch.game)
                                .font(.system(size: 10, weight: .bold))
                                .tracking(1)
                                .foregroundColor(cat.color)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(cat.color.opacity(0.15))
                                .overlay(Capsule().stroke(cat.color.opacity(0.4), lineWidth: 1))
                                .clipShape(Capsule())

                            Text(ch.storyName)
                                .font(.caption)
                                .foregroundColor(.gpSlate400)
                        }

                        // Challenge body
                        switch ch.dto.type {
                        case .quiz:
                            ArcadeQuizView(ch: ch.dto, answered: $answered, lastCorrect: $lastCorrect)
                        case .truefalse:
                            ArcadeTrueFalseView(ch: ch.dto, answered: $answered, lastCorrect: $lastCorrect)
                        case .sort:
                            SortChallengeView(challenge: ch.dto, answered: $answered, lastCorrect: $lastCorrect)
                        case .minigame:
                            ArcadeMinigameCard(ch: ch.dto, cat: cat)
                        }

                        // Fact banner
                        if answered && ch.dto.type != .minigame {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(lastCorrect ? "✓ Correct!" : "✗ Not quite.")
                                    .font(.caption.weight(.bold))
                                    .foregroundColor(lastCorrect ? .green : .red)
                                Text(ch.dto.fact ?? "")
                                    .font(.caption)
                                    .foregroundColor(.gpSlate400)
                            }
                            .padding(12)
                            .background((lastCorrect ? Color.green : Color.red).opacity(0.08))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke((lastCorrect ? Color.green : Color.red).opacity(0.25), lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // Win button
                        if answered {
                            Button(action: { dismiss() }) {
                                Text(lastCorrect ? "✓ Back to Arcade" : "Back to Arcade")
                                    .font(.subheadline.weight(.bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 13)
                                    .background(lastCorrect ? Color.green.opacity(0.15) : Color.white.opacity(0.06))
                                    .foregroundColor(lastCorrect ? .green : .white)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(20)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundColor(.gpAmber)
                }
            }
        }
    }
}

// MARK: - Quiz renderer

private struct ArcadeQuizView: View {
    let ch: ChallengeDTO
    @Binding var answered: Bool
    @Binding var lastCorrect: Bool
    @State private var selected: Int? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ch.question ?? "")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)

            ForEach(Array((ch.options ?? []).enumerated()), id: \.offset) { i, opt in
                QuizOptionRow(
                    text: opt,
                    isCorrect: i == ch.answer,
                    isSelected: i == selected,
                    answered: answered
                ) {
                    guard !answered else { return }
                    selected = i
                    lastCorrect = (i == ch.answer)
                    answered = true
                }
            }
        }
    }
}

// MARK: - True/False renderer

private struct ArcadeTrueFalseView: View {
    let ch: ChallengeDTO
    @Binding var answered: Bool
    @Binding var lastCorrect: Bool
    @State private var choice: Bool? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ch.statement ?? "")
                .font(.subheadline.weight(.semibold))
                .italic()
                .foregroundColor(.white)

            HStack(spacing: 12) {
                ForEach([true, false], id: \.self) { v in
                    TrueFalseOptionRow(
                        label: v ? "True" : "False",
                        isCorrect: v == ch.correct,
                        isSelected: v == choice,
                        answered: answered
                    ) {
                        guard !answered else { return }
                        choice = v
                        lastCorrect = (v == ch.correct)
                        answered = true
                    }
                }
            }
        }
    }
}

// MARK: - Minigame card

private struct ArcadeMinigameCard: View {
    let ch: ChallengeDTO
    let cat: ArcadeCategory

    var body: some View {
        let label = gameLabel[ch.game ?? ""] ?? "Challenge"
        VStack(alignment: .leading, spacing: 12) {
            Text("✦ \(label)")
                .font(.caption.weight(.bold))
                .tracking(1)
                .foregroundColor(.gpAmber)
            Text(ch.instruction ?? ch.question ?? "Play this challenge in the Epic story mode.")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
            Text("Open the story in Epic mode to play this interactive challenge.")
                .font(.caption)
                .foregroundColor(.gpSlate400)
            if let fact = ch.fact, !fact.isEmpty {
                Text(fact)
                    .font(.caption)
                    .foregroundColor(.gpSlate400.opacity(0.7))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.gpAmber.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.gpAmber.opacity(0.2), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
