import SwiftUI

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

    var body: some View {
        VStack(spacing: 24) {
            // Avatar
            Text("◉")
                .font(.system(size: 56))
                .padding(20)
                .background(Color.gpAmber.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 20))

            Text("Your Profile")
                .font(.system(.title2, design: .serif).weight(.bold))
                .tracking(3)
                .foregroundColor(.white)

            // Stat row
            HStack(spacing: 12) {
                ForEach([("Wins", "—"), ("Cards", "—"), ("ELO", "—")], id: \.0) { stat in
                    StatBox(label: stat.0, value: stat.1)
                }
            }

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
    }
}

private struct StatBox: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(.title2).weight(.bold))
                .foregroundColor(.gpAmber)
            Text(label)
                .font(.system(size: 10).weight(.semibold))
                .tracking(1)
                .foregroundColor(.gpSlate400)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color.white.opacity(0.03))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.gpOutline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
