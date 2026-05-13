import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authStore: AuthStore

    private let modes: [(icon: String, name: String, subtitle: String)] = [
        ("⚡", "EPIC",       "Unlock stories, earn cards"),
        ("♛", "COLLECTION", "Your card gallery"),
        ("⚔", "FIGHT",      "Compete with others"),
        ("🎮", "ARCADE",     "120 mini challenges, play freely"),
        ("◉", "PROFILE",    "Your account & stats"),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                // Ambient glow
                Circle()
                    .fill(Color.gpAmber.opacity(0.06))
                    .frame(width: 500, height: 500)
                    .blur(radius: 120)
                    .offset(x: 60, y: -100)

                Circle()
                    .fill(Color.gpIndigo.opacity(0.05))
                    .frame(width: 400, height: 400)
                    .blur(radius: 100)
                    .offset(x: -80, y: 160)

                VStack(spacing: 0) {
                    // Guest banner
                    if authStore.isGuest {
                        HStack {
                            Text("Exploring as guest — sign in to save progress")
                                .font(.caption)
                                .foregroundColor(.gpAmber.opacity(0.8))
                            Spacer()
                            Button("Sign In") {
                                authStore.exitGuestMode()
                            }
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.gpAmber)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.gpAmber.opacity(0.08))
                        .overlay(
                            Rectangle()
                                .frame(height: 1)
                                .foregroundColor(Color.gpAmber.opacity(0.2)),
                            alignment: .bottom
                        )
                    }

                    Spacer()

                    // Logo area
                    VStack(spacing: 8) {
                        Text("⚡")
                            .font(.system(size: 32))
                            .frame(width: 64, height: 64)
                            .background(Color.gpAmber.opacity(0.12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color.gpAmber.opacity(0.25), lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16))

                        Text("GREAT PEOPLE")
                            .font(.system(.title2, design: .serif).weight(.bold))
                            .tracking(6)
                            .foregroundColor(.white)

                        Text("Collectible Card Game")
                            .font(.caption)
                            .tracking(3)
                            .foregroundColor(.gpSlate400)
                            .textCase(.uppercase)
                    }
                    .padding(.bottom, 40)

                    // Mode buttons
                    VStack(spacing: 12) {
                        NavigationLink(destination: EpicView()) {
                            ModeRow(icon: "bolt.fill", name: "EPIC", subtitle: "Unlock stories, earn cards")
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: CollectionView()) {
                            ModeRow(icon: "rectangle.stack.fill", name: "COLLECTION", subtitle: "Your card gallery")
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: BattleView()) {
                            ModeRow(icon: "shield.fill", name: "FIGHT", subtitle: "Deploy Great People, claim victory")
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: ArcadeView()) {
                            ModeRow(icon: "gamecontroller.fill", name: "ARCADE", subtitle: "120 mini challenges, play freely")
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: ProfileView()) {
                            ModeRow(icon: "person.crop.circle.fill", name: "PROFILE", subtitle: "Your account & stats")
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: 400)
                    .padding(.horizontal, 24)

                    Spacer()
                }
            }
            .navigationBarHidden(true)
        }
    }
}

private struct ModeRow: View {
    let icon: String
    let name: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            // Icon box
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.gpAmber)
                .frame(width: 44, height: 44)
                .background(Color.gpAmber.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.gpAmber.opacity(0.2), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))

            // Labels
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.subheadline.weight(.bold))
                    .tracking(1)
                    .foregroundColor(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.gpSlate400)
            }

            Spacer()

            Text("→")
                .font(.title3)
                .foregroundColor(.gpAmber.opacity(0.6))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.03))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.gpAmber.opacity(0.25), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .contentShape(Rectangle())
    }
}
