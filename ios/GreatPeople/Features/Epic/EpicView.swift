import SwiftUI

// MARK: - Data

private struct StoryConfig: Decodable {
    let era: String
    let title: String
    let figure: String?
    let tagline: String
    let quizzes: Int
}

private struct Story {
    let title: String
    let figure: String?
    let tagline: String
    let quizzes: Int
}

private struct EraData {
    let name: String
    let stories: [Story]
}

private let ERA_ORDER = ["Ancient", "Classical", "Medieval", "Renaissance", "Steam", "Electricity", "Information"]

private func loadEras() -> [EraData] {
    guard let url = Bundle.main.url(forResource: "story_configs", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let configs = try? JSONDecoder().decode([StoryConfig].self, from: data)
    else { return [] }
    var byEra: [String: [Story]] = [:]
    for c in configs {
        let story = Story(title: c.title, figure: c.figure, tagline: c.tagline, quizzes: c.quizzes)
        byEra[c.era, default: []].append(story)
    }
    return ERA_ORDER.compactMap { era in byEra[era].map { EraData(name: era, stories: $0) } }
}

private let ERAS: [EraData] = loadEras()

private let STORIES_TO_ADVANCE = 4

// MARK: - EpicView

struct EpicView: View {
    @State private var currentEra = 0
    @State private var completedStories: Set<String> = []
    @State private var toastMsg: String? = nil
    @State private var activeStory: (eraIdx: Int, storyIdx: Int)? = nil

    private func storyKey(_ eraIdx: Int, _ storyIdx: Int) -> String { "\(eraIdx)-\(storyIdx)" }

    private func isEraSelectable(_ eraIdx: Int) -> Bool { true }

    private func isStoryUnlocked(_ eraIdx: Int, _ storyIdx: Int) -> Bool { true }

    private func completedCount(_ eraIdx: Int) -> Int {
        (0..<ERAS[eraIdx].stories.count)
            .filter { completedStories.contains(storyKey(eraIdx, $0)) }.count
    }

    private func showToast(_ msg: String) {
        toastMsg = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { toastMsg = nil }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color.gpBackground.ignoresSafeArea()

                // Ambient glow
                Circle().fill(Color.gpAmber.opacity(0.06)).frame(width: 500, height: 500)
                    .blur(radius: 120).offset(x: 80, y: -80)

                VStack(spacing: 0) {
                    // Era selector
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(0..<ERAS.count, id: \.self) { idx in
                                let selectable = isEraSelectable(idx)
                                let active = idx == currentEra
                                Button {
                                    if selectable {
                                        currentEra = idx
                                    } else {
                                        showToast("Complete 4 stories in the current era first.")
                                    }
                                } label: {
                                    Text(ERAS[idx].name)
                                        .font(.caption.weight(.semibold))
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 6)
                                        .background(
                                            active
                                                ? Color.gpAmber
                                                : selectable
                                                    ? Color.white.opacity(0.05)
                                                    : Color.white.opacity(0.03)
                                        )
                                        .foregroundColor(
                                            active
                                                ? Color.gpBackground
                                                : selectable
                                                    ? Color.white.opacity(0.8)
                                                    : Color.white.opacity(0.3)
                                        )
                                        .clipShape(Capsule())
                                        .overlay(
                                            Capsule().stroke(
                                                active ? Color.clear : selectable ? Color.white.opacity(0.1) : Color.white.opacity(0.05),
                                                lineWidth: 1
                                            )
                                        )
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }

                    // Era pager via TabView with PageTabViewStyle
                    TabView(selection: $currentEra) {
                        ForEach(0..<ERAS.count, id: \.self) { eraIdx in
                            EraPageView(
                                eraIdx: eraIdx,
                                era: ERAS[eraIdx],
                                completedStories: completedStories,
                                isEraSelectable: isEraSelectable,
                                isStoryUnlocked: isStoryUnlocked,
                                completedCount: completedCount,
                                onBegin: { storyIdx in
                                    activeStory = (eraIdx, storyIdx)
                                },
                                onNextEra: eraIdx < ERAS.count - 1 ? { currentEra = eraIdx + 1 } : nil
                            )
                            .tag(eraIdx)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }

                // Toast overlay
                if let msg = toastMsg {
                    VStack {
                        Text(msg)
                            .font(.subheadline)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .background(Color.gpAmber.opacity(0.2))
                            .foregroundColor(.gpAmber)
                            .overlay(Capsule().stroke(Color.gpAmber.opacity(0.4), lineWidth: 1))
                            .clipShape(Capsule())
                            .padding(.top, 100)
                        Spacer()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.easeInOut(duration: 0.3), value: toastMsg)
                }
            }
            .navigationTitle("Epic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .sheet(item: Binding(
                get: { activeStory.map { ActiveStory(eraIdx: $0.eraIdx, storyIdx: $0.storyIdx) } },
                set: { activeStory = $0.map { ($0.eraIdx, $0.storyIdx) } }
            )) { active in
                StorySheetView(
                    eraName: ERAS[active.eraIdx].name,
                    storyTitle: ERAS[active.eraIdx].stories[active.storyIdx].title,
                    onComplete: {
                        completedStories.insert(storyKey(active.eraIdx, active.storyIdx))
                        showToast("Story completed! Next story unlocked.")
                    }
                )
            }
        }
    }
}

private struct ActiveStory: Identifiable {
    let eraIdx: Int
    let storyIdx: Int
    var id: String { "\(eraIdx)-\(storyIdx)" }
}

// MARK: - EraPageView

private struct EraPageView: View {
    let eraIdx: Int
    let era: EraData
    let completedStories: Set<String>
    let isEraSelectable: (Int) -> Bool
    let isStoryUnlocked: (Int, Int) -> Bool
    let completedCount: (Int) -> Int
    let onBegin: (Int) -> Void
    let onNextEra: (() -> Void)?

    private func storyKey(_ storyIdx: Int) -> String { "\(eraIdx)-\(storyIdx)" }
    private let storiesNeeded = STORIES_TO_ADVANCE

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {

                // Era header + progress
                VStack(alignment: .leading, spacing: 8) {
                    Text(era.name)
                        .font(.system(.title, design: .serif).weight(.bold))
                        .foregroundColor(.white)

                    let done = completedCount(eraIdx)
                    let complete = done >= storiesNeeded

                    if complete {
                        Text("Era Complete ✓")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.gpAmber)
                    } else {
                        Text("\(done) / \(storiesNeeded) stories to unlock next era")
                            .font(.caption)
                            .foregroundColor(.gpSlate400)

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.white.opacity(0.06))
                                    .frame(height: 6)
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.gpAmber)
                                    .frame(width: geo.size.width * CGFloat(done) / CGFloat(storiesNeeded), height: 6)
                                    .animation(.easeInOut, value: done)
                            }
                        }
                        .frame(height: 6)
                    }
                }

                // Stories
                VStack(spacing: 12) {
                    ForEach(0..<era.stories.count, id: \.self) { storyIdx in
                        let story = era.stories[storyIdx]
                        let unlocked = isStoryUnlocked(eraIdx, storyIdx)
                        let isDone = completedStories.contains(storyKey(storyIdx))

                        StoryRow(
                            story: story,
                            unlocked: unlocked,
                            isDone: isDone,
                            onBegin: { onBegin(storyIdx) }
                        )
                    }
                }

                // Next Era / Complete
                let done = completedCount(eraIdx)
                let complete = done >= storiesNeeded
                if complete {
                    if let onNextEra = onNextEra {
                        Button {
                            onNextEra()
                        } label: {
                            Text("Next Era: \(ERAS[eraIdx + 1].name) →")
                                .font(.subheadline.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.gpAmber)
                                .foregroundColor(Color.gpBackground)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(.top, 8)
                    } else {
                        VStack(spacing: 6) {
                            Text("🏆")
                                .font(.largeTitle)
                            Text("All Eras Complete!")
                                .font(.subheadline.weight(.bold))
                                .foregroundColor(.gpAmber)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 40)
        }
    }
}

// MARK: - StoryRow

private struct StoryRow: View {
    let story: Story
    let unlocked: Bool
    let isDone: Bool
    let onBegin: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Status icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(
                        unlocked
                            ? (isDone ? Color.gpAmber.opacity(0.20) : Color.gpAmber.opacity(0.10))
                            : Color.white.opacity(0.04)
                    )
                    .frame(width: 36, height: 36)

                Text(unlocked ? (isDone ? "✓" : "▶") : "🔒")
                    .font(.system(size: unlocked && !isDone ? 12 : 14))
                    .foregroundColor(unlocked ? .gpAmber : .gpSlate600)
            }

            // Text
            VStack(alignment: .leading, spacing: 2) {
                Text(story.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(unlocked ? .white : .gpSlate600)
                    .lineLimit(2)

                if let figure = story.figure {
                    Text(figure)
                        .font(.caption.italic())
                        .foregroundColor(unlocked ? .gpSlate400 : .gpSlate600.opacity(0.6))
                }

                Text("\(story.quizzes) \(story.quizzes == 1 ? "quiz" : "quizzes")")
                    .font(.system(size: 10))
                    .foregroundColor(unlocked ? .gpSlate600 : .gpSlate600.opacity(0.5))
            }

            Spacer()

            // Begin button or Done label
            if unlocked && !isDone {
                Button("Begin →") { onBegin() }
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Color.gpAmber)
                    .foregroundColor(Color.gpBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else if isDone {
                Text("Done")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.gpAmber.opacity(0.6))
            }
        }
        .padding(12)
        .background(Color.white.opacity(unlocked ? 0.03 : 0.02))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(unlocked ? Color.gpAmber.opacity(0.25) : Color.white.opacity(0.06), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
