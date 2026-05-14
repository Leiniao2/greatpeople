import SwiftUI

private func displayName(from email: String) -> String {
    let local = email.split(separator: "@").first.map(String.init) ?? email
    return local.replacingOccurrences(of: "[._]", with: " ", options: .regularExpression)
        .split(separator: " ")
        .map { $0.prefix(1).uppercased() + $0.dropFirst() }
        .joined(separator: " ")
}

private func initials(from name: String) -> String {
    String(name.split(separator: " ").compactMap(\.first).prefix(2).map { String($0).uppercased() }.joined())
}

struct ProfileView: View {
    @EnvironmentObject var authStore: AuthStore

    var body: some View {
        NavigationStack {
            ZStack {
                Color.gpBackground.ignoresSafeArea()

                if authStore.isGuest {
                    GuestProfileView()
                } else {
                    LoggedInProfileView()
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .environmentObject(authStore)
    }
}

// MARK: - Guest state

private struct GuestProfileView: View {
    @EnvironmentObject var authStore: AuthStore

    var body: some View {
        VStack(spacing: 20) {
            Text("◉")
                .font(.system(size: 56))
                .padding(20)
                .background(Color.gpAmber.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 20))

            VStack(spacing: 8) {
                Text("Browsing as Guest")
                    .font(.system(.title3, design: .serif).weight(.bold))
                    .tracking(2)
                    .foregroundColor(.white)

                Text("Sign in to track your wins, build a collection, and compete on the leaderboard.")
                    .font(.subheadline)
                    .foregroundColor(.gpSlate400)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
            }

            Button("Sign In") {
                authStore.exitGuestMode()
            }
            .gpPrimaryButton()
            .padding(.top, 8)
        }
        .padding(32)
    }
}

// MARK: - Logged-in state

private struct LoggedInProfileView: View {
    @EnvironmentObject var authStore: AuthStore
    @State private var cardsCount: Int? = nil
    @State private var loadingCards = false

    private var name: String {
        authStore.email.map(displayName) ?? "Player"
    }

    var body: some View {
        VStack(spacing: 24) {
            // Avatar with initials
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.gpAmber.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                    .frame(width: 96, height: 96)
                Text(initials(from: name))
                    .font(.system(size: 32, weight: .bold))
                    .tracking(2)
                    .foregroundColor(.gpAmber)
            }

            // Name + email
            VStack(spacing: 4) {
                Text(name)
                    .font(.system(.title2, design: .serif).weight(.bold))
                    .tracking(2)
                    .foregroundColor(.white)
                if let email = authStore.email {
                    Text(email)
                        .font(.caption)
                        .foregroundColor(.gpSlate400)
                }
            }

            // Cards stat
            VStack(spacing: 4) {
                if loadingCards {
                    ProgressView().tint(.gpAmber).scaleEffect(0.8)
                } else {
                    Text(cardsCount.map(String.init) ?? "—")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(.gpAmber)
                }
                Text("Cards Collected")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1)
                    .foregroundColor(.gpSlate400)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.gpOutline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14))

            // Sign out
            Button("Sign Out") {
                Task { await authStore.logout() }
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.05))
            .foregroundColor(.gpSlate400)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.gpOutline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.top, 8)
        }
        .padding(32)
        .task {
            loadingCards = true
            if let cards = try? await APIClient.shared.fetchCards() {
                cardsCount = cards.count
            }
            loadingCards = false
        }
    }
}
