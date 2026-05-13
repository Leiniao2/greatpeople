import SwiftUI

struct BattleView: View {
    @EnvironmentObject var authStore: AuthStore
    @StateObject private var ws = WebSocketClient()
    @State private var matchId: String?
    @State private var finding = false
    @State private var showGuestPrompt = false

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
            .sheet(isPresented: $showGuestPrompt) {
                GuestPromptView(onSignIn: {
                    showGuestPrompt = false
                    authStore.exitGuestMode()
                })
                .presentationDetents([.medium])
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
