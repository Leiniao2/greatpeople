import SwiftUI

// MARK: - StorySheetView

struct StorySheetView: View {
    let eraName: String
    let storyTitle: String
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var idx = 0
    @State private var answered = false
    @State private var lastCorrect = false
    @State private var score = 0
    @State private var finished = false

    private var challenges: [ChallengeDTO] { StoryChallengesLoader.challenges(era: eraName, story: storyTitle) }
    private var total: Int { challenges.count }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()
                if challenges.isEmpty {
                    emptyView
                } else if finished {
                    resultsView
                } else {
                    challengeView
                }
            }
            .navigationTitle(storyTitle)
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

    // MARK: - Challenge view

    private var challengeView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {

                // Header + progress
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(eraName) · Challenge \(idx + 1) of \(total)")
                        .font(.caption)
                        .foregroundColor(.gpSlate400)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.06)).frame(height: 4)
                            RoundedRectangle(cornerRadius: 3).fill(Color.gpAmber)
                                .frame(width: geo.size.width * CGFloat(idx) / CGFloat(total), height: 4)
                                .animation(.easeInOut, value: idx)
                        }
                    }
                    .frame(height: 4)
                }

                // Challenge body
                let ch = challenges[idx]
                Group {
                    switch ch.type {
                    case .quiz:
                        quizView(ch)
                    case .truefalse:
                        trueFalseView(ch)
                    case .sort:
                        SortChallengeView(challenge: ch, answered: $answered, lastCorrect: $lastCorrect)
                    }
                }

                // Fact
                if answered {
                    factBanner
                    nextButton
                }

                Spacer(minLength: 40)
            }
            .padding(20)
        }
    }

    // MARK: - Quiz

    @State private var selectedOption: Int? = nil

    private func quizView(_ ch: ChallengeDTO) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ch.question ?? "")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)

            ForEach(Array((ch.options ?? []).enumerated()), id: \.offset) { i, opt in
                let isCorrect = i == ch.answer
                let isSelected = i == selectedOption
                Button {
                    guard !answered else { return }
                    selectedOption = i
                    lastCorrect = (i == ch.answer)
                    answered = true
                    if lastCorrect { score += 1 }
                } label: {
                    Text(opt)
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            answered
                                ? (isCorrect ? Color.green.opacity(0.18) : (isSelected ? Color.red.opacity(0.18) : Color.white.opacity(0.03)))
                                : Color.white.opacity(0.05)
                        )
                        .foregroundColor(
                            answered
                                ? (isCorrect ? .green : (isSelected ? .red : Color.white.opacity(0.3)))
                                : .white.opacity(0.85)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(
                                    answered
                                        ? (isCorrect ? Color.green.opacity(0.5) : (isSelected ? Color.red.opacity(0.4) : Color.white.opacity(0.06)))
                                        : Color.white.opacity(0.1),
                                    lineWidth: 1
                                )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(answered)
                .animation(.easeInOut(duration: 0.2), value: answered)
            }
        }
    }

    // MARK: - True / False

    @State private var tfChoice: Bool? = nil

    private func trueFalseView(_ ch: ChallengeDTO) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ch.statement ?? "")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)

            HStack(spacing: 12) {
                ForEach([true, false], id: \.self) { choice in
                    let isCorrect = choice == ch.correct
                    let isSelected = choice == tfChoice
                    Button(choice ? "True" : "False") {
                        guard !answered else { return }
                        tfChoice = choice
                        lastCorrect = (choice == ch.correct)
                        answered = true
                        if lastCorrect { score += 1 }
                    }
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        answered
                            ? (isCorrect ? Color.green.opacity(0.18) : (isSelected ? Color.red.opacity(0.18) : Color.white.opacity(0.03)))
                            : Color.white.opacity(0.05)
                    )
                    .foregroundColor(
                        answered
                            ? (isCorrect ? .green : (isSelected ? .red : Color.white.opacity(0.3)))
                            : .white
                    )
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(
                        answered
                            ? (isCorrect ? Color.green.opacity(0.5) : (isSelected ? Color.red.opacity(0.4) : Color.white.opacity(0.06)))
                            : Color.white.opacity(0.1),
                        lineWidth: 1
                    ))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(answered)
                }
            }
        }
    }

    // MARK: - Shared

    private var factBanner: some View {
        let ch = challenges[idx]
        return VStack(alignment: .leading, spacing: 4) {
            Text(lastCorrect ? "✓ Correct!" : "✗ Not quite.")
                .font(.caption.weight(.bold))
                .foregroundColor(lastCorrect ? .green : .red)
            Text(ch.fact)
                .font(.caption)
                .foregroundColor(.gpSlate400)
        }
        .padding(12)
        .background((lastCorrect ? Color.green : Color.red).opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke((lastCorrect ? Color.green : Color.red).opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var nextButton: some View {
        Button(idx + 1 < total ? "Next Challenge →" : "See Results →") {
            if idx + 1 >= total {
                finished = true
            } else {
                idx += 1
                answered = false
                lastCorrect = false
                selectedOption = nil
                tfChoice = nil
            }
        }
        .font(.subheadline.weight(.bold))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 13)
        .background(Color.gpAmber)
        .foregroundColor(Color.gpBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Results

    private var resultsView: some View {
        VStack(spacing: 20) {
            Text(score == total ? "🏆" : score >= total / 2 ? "⭐" : "📖")
                .font(.system(size: 56))
            Text(storyTitle)
                .font(.title3.weight(.bold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
            Text("\(score) / \(total) correct")
                .font(.title2.weight(.semibold))
                .foregroundColor(.gpAmber)
            Text(score == total ? "Perfect score! Story complete." : "Story complete! Keep exploring.")
                .font(.subheadline)
                .foregroundColor(.gpSlate400)
                .multilineTextAlignment(.center)

            Button("Complete Story →") {
                onComplete()
                dismiss()
            }
            .font(.subheadline.weight(.bold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.gpAmber)
            .foregroundColor(Color.gpBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.top, 8)
        }
        .padding(32)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Text("No challenges yet")
                .font(.subheadline)
                .foregroundColor(.gpSlate400)
            Button("Close") { dismiss() }
                .foregroundColor(.gpAmber)
        }
    }
}

// MARK: - Sort Challenge View

private struct SortChallengeView: View {
    let challenge: ChallengeDTO
    @Binding var answered: Bool
    @Binding var lastCorrect: Bool

    @State private var selected: [String] = []
    @State private var submitted = false

    private var shuffled: [String] { challenge.items?.shuffled() ?? [] }
    private var remaining: [String] { (challenge.items ?? []).filter { !selected.contains($0) } }
    private var allPicked: Bool { selected.count == (challenge.items?.count ?? 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(challenge.question ?? "Arrange in correct order:")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)

            // Answer area
            VStack(alignment: .leading, spacing: 8) {
                Text("Your order:")
                    .font(.caption)
                    .foregroundColor(.gpSlate400)

                if selected.isEmpty {
                    Text("Tap items below in the correct order…")
                        .font(.caption)
                        .foregroundColor(Color.white.opacity(0.25))
                        .padding(.vertical, 6)
                } else {
                    FlowLayout(items: selected) { item in
                        let i = selected.firstIndex(of: item) ?? 0
                        let correct = submitted && item == (challenge.items ?? [])[safe: i]
                        let wrong = submitted && item != (challenge.items ?? [])[safe: i]
                        Button {
                            if !submitted { selected.removeAll { $0 == item } }
                        } label: {
                            Text("\(i + 1). \(item)")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(correct ? Color.green.opacity(0.18) : wrong ? Color.red.opacity(0.18) : Color.gpAmber.opacity(0.15))
                                .foregroundColor(correct ? .green : wrong ? .red : .gpAmber)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(correct ? Color.green.opacity(0.4) : wrong ? Color.red.opacity(0.35) : Color.gpAmber.opacity(0.3), lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .disabled(submitted)
                    }
                }
            }
            .padding(12)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.08), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Remaining items
            FlowLayout(items: remaining) { item in
                Button(item) {
                    if !submitted { selected.append(item) }
                }
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white.opacity(0.05))
                .foregroundColor(Color.white.opacity(0.8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.1), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            // Submit
            if allPicked && !submitted {
                Button("Check Order") {
                    submitted = true
                    let correct = selected == (challenge.items ?? [])
                    lastCorrect = correct
                    answered = true
                }
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.gpAmber)
                .foregroundColor(Color.gpBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}

// MARK: - Flow Layout Helper

private struct FlowLayout<Item: Hashable, Content: View>: View {
    let items: [Item]
    let content: (Item) -> Content

    init(items: [Item], @ViewBuilder content: @escaping (Item) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        // Simple wrapping implementation using LazyVGrid with adaptive columns
        VStack(alignment: .leading, spacing: 8) {
            var row: [Item] = []
            let groups = groupIntoRows()
            ForEach(groups, id: \.self) { group in
                HStack(spacing: 8) {
                    ForEach(group, id: \.self) { item in
                        content(item)
                    }
                }
            }
        }
    }

    private func groupIntoRows() -> [[Item]] {
        // Simple: 2 items per row for this use case
        stride(from: 0, to: items.count, by: 2).map {
            Array(items[$0..<min($0 + 2, items.count)])
        }
    }
}

// MARK: - Safe subscript

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
