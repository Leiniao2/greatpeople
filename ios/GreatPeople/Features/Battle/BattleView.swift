import SwiftUI

struct BattleView: View {
    @EnvironmentObject var authStore: AuthStore
    @StateObject private var ws = WebSocketClient()
    @State private var matchId: String?
    @State private var finding = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                Circle().fill(Color.gpIndigo.opacity(0.08)).frame(width: 500, height: 500)
                    .blur(radius: 120).offset(x: -80, y: -100)

                if authStore.isGuest {
                    GuestPromptView(onSignIn: { authStore.exitGuestMode() })
                } else {
                    VStack(spacing: 32) {
                        if ws.isConnected, let matchId {
                            // Active match
                            VStack(spacing: 24) {
                                Text("Match Active")
                                    .font(.system(.title3, design: .serif).weight(.bold))
                                    .tracking(3)
                                    .foregroundColor(.white)

                                HStack(spacing: 0) {
                                    VStack(spacing: 4) {
                                        Text("YOU").font(.system(size: 10).weight(.semibold)).tracking(2).foregroundColor(.gpSlate400)
                                        Text("0").font(.system(size: 52).weight(.bold)).foregroundColor(.gpAmber)
                                    }
                                    .frame(maxWidth: .infinity)
                                    Text("VS").font(.subheadline).foregroundColor(.gpSlate600)
                                        .frame(maxWidth: .infinity)
                                    VStack(spacing: 4) {
                                        Text("OPP").font(.system(size: 10).weight(.semibold)).tracking(2).foregroundColor(.gpSlate400)
                                        Text("0").font(.system(size: 52).weight(.bold)).foregroundColor(.gpIndigo)
                                    }
                                    .frame(maxWidth: .infinity)
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
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color.red.opacity(0.1))
                                    .foregroundColor(Color(red: 0.98, green: 0.5, blue: 0.45))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.red.opacity(0.25), lineWidth: 1))
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        } else {
                            // Find match
                            VStack(spacing: 16) {
                                Image(systemName: "shield.fill")
                                    .font(.system(size: 48, weight: .semibold))
                                    .foregroundColor(.gpIndigo)
                                    .padding(20)
                                    .background(Color.gpIndigo.opacity(0.12))
                                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpIndigo.opacity(0.25), lineWidth: 1))
                                    .clipShape(RoundedRectangle(cornerRadius: 20))

                                Text("FIGHT ARENA")
                                    .font(.system(.title2, design: .serif).weight(.bold))
                                    .tracking(4)
                                    .foregroundColor(.white)
                                Text("First to 5 round wins takes the match")
                                    .font(.subheadline)
                                    .foregroundColor(.gpSlate400)
                                    .multilineTextAlignment(.center)

                                Button { findMatch() } label: {
                                    HStack(spacing: 8) {
                                        if finding {
                                            ProgressView().tint(Color.gpBackground).scaleEffect(0.8)
                                        }
                                        Text(finding ? "Finding Match…" : "Find Match")
                                    }
                                }
                                .gpPrimaryButton(loading: finding)
                                .disabled(finding)
                                .padding(.top, 8)
                            }
                        }
                    }
                    .padding(24)
                }
            }
            .navigationTitle("Fight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private func findMatch() {
        finding = true
    }
}

private struct GuestPromptView: View {
    let onSignIn: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "shield.fill")
                .font(.system(size: 48, weight: .semibold))
                .foregroundColor(.gpAmber)
                .padding(20)
                .background(Color.gpAmber.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 20))

            Text("Sign In to Fight")
                .font(.system(.title2, design: .serif).weight(.bold))
                .foregroundColor(.white)

            Text("Create a free account to challenge other players, earn cards, and build your collection.")
                .font(.subheadline)
                .foregroundColor(.gpSlate400)
                .multilineTextAlignment(.center)

            Button(action: onSignIn) {
                Text("Sign In / Register")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .gpPrimaryButton(loading: false)
            .padding(.top, 8)
        }
        .padding(32)
    }
}
