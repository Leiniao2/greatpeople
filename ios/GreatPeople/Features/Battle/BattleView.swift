import SwiftUI

struct BattleView: View {
    @EnvironmentObject var authStore: AuthStore
    @StateObject private var ws = WebSocketClient()
    @State private var matchId: String?
    @State private var finding = false
    @State private var showGuestPrompt = false
    @State private var showRules = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()
                Circle().fill(Color.gpIndigo.opacity(0.08)).frame(width: 500, height: 500)
                    .blur(radius: 120).offset(x: -80, y: -100)

                if ws.isConnected, let matchId {
                    activeMatchView(matchId: matchId)
                } else {
                    modeSelectionView
                }
            }
            .navigationTitle("Fight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showRules = true } label: {
                        Image(systemName: "book.closed")
                            .font(.system(size: 16))
                            .foregroundColor(.gpAmber)
                    }
                }
            }
            .sheet(isPresented: $showGuestPrompt) {
                GuestPromptView(onSignIn: {
                    showGuestPrompt = false
                    authStore.exitGuestMode()
                })
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showRules) {
                BattleRulesView()
                    .presentationDetents([.large])
            }
        }
    }

    // ── Mode selection ────────────────────────────────────────────────────────

    private var modeSelectionView: some View {
        VStack(spacing: 24) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color.gpIndigo.opacity(0.12))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpIndigo.opacity(0.25), lineWidth: 1))
                        .frame(width: 72, height: 72)
                    Text("⚔").font(.system(size: 36))
                }
                Text("FIGHT ARENA")
                    .font(.system(.title2, design: .serif).weight(.bold))
                    .tracking(4).foregroundColor(.white)
                Text("Deploy Great People across history")
                    .font(.subheadline).foregroundColor(.gpSlate400)
            }

            VStack(spacing: 12) {
                ModeCard(icon: "🤝", title: "Casual",      subtitle: "vs Human · Friendly",    accent: Color(hex: "#34d399"), locked: authStore.isGuest) { tapMode() }
                ModeCard(icon: "🏆", title: "Ranked",      subtitle: "vs Human · Competitive", accent: Color.gpAmber,         locked: authStore.isGuest) { tapMode() }
                ModeCard(icon: "🤖", title: "vs Computer", subtitle: "Fight AI opponents",      accent: Color.gpIndigo,        locked: false)             { findMatch() }
            }

            if authStore.isGuest {
                Text("Sign in to unlock Casual & Ranked matches")
                    .font(.caption).foregroundColor(.gpSlate400)
            }
        }
        .padding(24)
    }

    private func tapMode() {
        if authStore.isGuest {
            showGuestPrompt = true
        } else {
            finding = true
        }
    }

    private func findMatch() {
        finding = true
    }

    // ── Active match ──────────────────────────────────────────────────────────

    private func activeMatchView(matchId: String) -> some View {
        VStack(spacing: 24) {
            Text("Match Active")
                .font(.system(.title3, design: .serif).weight(.bold))
                .tracking(3).foregroundColor(.white)

            HStack(spacing: 0) {
                VStack(spacing: 4) {
                    Text("YOU").font(.system(size: 10).weight(.semibold)).tracking(2).foregroundColor(.gpSlate400)
                    Text("0").font(.system(size: 52).weight(.bold)).foregroundColor(.gpAmber)
                }.frame(maxWidth: .infinity)
                Text("VS").font(.subheadline).foregroundColor(.gpSlate600).frame(maxWidth: .infinity)
                VStack(spacing: 4) {
                    Text("OPP").font(.system(size: 10).weight(.semibold)).tracking(2).foregroundColor(.gpSlate400)
                    Text("0").font(.system(size: 52).weight(.bold)).foregroundColor(.gpIndigo)
                }.frame(maxWidth: .infinity)
            }
            .padding(24)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpOutline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 20))

            if let msg = ws.lastMessage {
                Text(msg.event).font(.caption).foregroundColor(.gpSlate400)
            }

            Button("Forfeit Match", role: .destructive) { ws.disconnect() }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(Color.red.opacity(0.1))
                .foregroundColor(Color(red: 0.98, green: 0.5, blue: 0.45))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.red.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .padding(24)
    }
}

// ── Rules sheet ───────────────────────────────────────────────────────────────

private struct BattleRulesView: View {
    @Environment(\.dismiss) private var dismiss

    private struct RuleSection {
        let title: String
        let items: [(head: String, body: String)]
    }

    private let sections: [RuleSection] = [
        .init(title: "Objective", items: [
            ("", "First player to earn 5 Victory Points wins the game."),
        ]),
        .init(title: "On Your Turn", items: [
            ("Deploy", "Play one Great Person from your hand to any location."),
            ("Add Follower", "Place a follower at a location where you have a Great Person."),
            ("Move", "Relocate one of your cards to a different location."),
            ("Trigger Event", "Activate the event at a location where you have a Great Person."),
            ("Attack", "During a Local Event, challenge a rival's card."),
            ("Retrieve", "Return one of your cards from the board to your hand."),
        ]),
        .init(title: "Events", items: [
            ("⚔ Local Event", "Compare your total stat vs. rivals. Winner may attack the loser's card."),
            ("☠ Local Survival", "Cards at this location with that stat below 10 are discarded."),
            ("🏆 Global Competition", "Player with the highest total stat across all public cards earns a prize."),
            ("🌊 Natural Hazard", "Cards with total stats below 100 are discarded."),
        ]),
        .init(title: "Victory Points", items: [
            ("", "Win events and complete card achievements to earn points. Each card's achievement is shown in its detail view."),
        ]),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        ForEach(sections, id: \.title) { section in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(section.title.uppercased())
                                    .font(.system(size: 10, weight: .bold))
                                    .tracking(1.5)
                                    .foregroundColor(.gpAmber)

                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(section.items, id: \.head) { item in
                                        HStack(alignment: .top, spacing: 8) {
                                            if !item.head.isEmpty {
                                                Text(item.head)
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundColor(.white)
                                                    .frame(width: 110, alignment: .leading)
                                            }
                                            Text(item.body)
                                                .font(.subheadline)
                                                .foregroundColor(.gpSlate400)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                                .padding(14)
                                .background(Color.white.opacity(0.03))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.07), lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("How to Play")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.gpAmber)
                }
            }
        }
    }
}

// ── Mode card ─────────────────────────────────────────────────────────────────

private struct ModeCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let accent: Color
    let locked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Text(icon).font(.system(size: 28))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(locked ? .gpSlate400 : accent)
                    Text(subtitle)
                        .font(.caption).foregroundColor(.gpSlate400)
                }
                Spacer()
                Text(locked ? "🔒" : "›")
                    .font(locked ? .body : .title3)
                    .foregroundColor(.gpSlate600)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(locked ? Color.gpOutline.opacity(0.4) : accent.opacity(0.3), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .opacity(locked ? 0.55 : 1)
        }
    }
}

// ── Guest prompt ──────────────────────────────────────────────────────────────

private struct GuestPromptView: View {
    let onSignIn: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("🔒").font(.system(size: 48))
                .padding(.top, 32)

            Text("Sign In Required")
                .font(.system(.title2, design: .serif).weight(.bold))
                .foregroundColor(.white)

            Text("Create a free account to challenge other players, earn cards, and climb the ranked ladder.")
                .font(.subheadline).foregroundColor(.gpSlate400)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Button(action: onSignIn) {
                Text("Sign In / Register")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
            }
            .gpPrimaryButton(loading: false)
            .padding(.horizontal, 24)

            Spacer()
        }
        .background(Color.gpBackground.ignoresSafeArea())
    }
}
