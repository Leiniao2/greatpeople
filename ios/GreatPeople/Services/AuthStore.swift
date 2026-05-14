import Foundation
import GoogleSignIn

@MainActor
final class AuthStore: ObservableObject {
    @Published var isLoggedIn = false
    @Published var isGuest = false
    @Published var email: String?
    private let tokenKey = "access_token"
    private let emailKey = "user_email"

    init() {
        isLoggedIn = UserDefaults.standard.string(forKey: tokenKey) != nil
        email = UserDefaults.standard.string(forKey: emailKey)
    }

    func login(email: String, password: String) async throws {
        let resp = try await APIClient.shared.login(LoginRequest(email: email, password: password))
        store(token: resp.accessToken, email: email)
    }

    func register(email: String, password: String, displayName: String) async throws {
        let resp = try await APIClient.shared.register(RegisterRequest(email: email, password: password, displayName: displayName))
        store(token: resp.accessToken, email: email)
    }

    func googleLogin() async throws {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else {
            throw AuthError.noRootViewController
        }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: rootVC)
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.noIdToken
        }
        let resp = try await APIClient.shared.googleSSO(idToken: idToken)
        store(token: resp.accessToken, email: result.user.profile?.email)
    }

    func enterGuestMode() { isGuest = true }
    func exitGuestMode() { isGuest = false }

    func logout() async {
        GIDSignIn.sharedInstance.signOut()
        try? await APIClient.shared.logout()
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: emailKey)
        APIClient.shared.clearToken()
        isLoggedIn = false
        email = nil
    }

    private func store(token: String, email: String? = nil) {
        UserDefaults.standard.set(token, forKey: tokenKey)
        APIClient.shared.setToken(token)
        isLoggedIn = true
        if let email {
            UserDefaults.standard.set(email, forKey: emailKey)
            self.email = email
        }
    }
}

enum AuthError: LocalizedError {
    case noRootViewController
    case noIdToken

    var errorDescription: String? {
        switch self {
        case .noRootViewController: return "Cannot present sign-in screen."
        case .noIdToken:            return "Google sign-in did not return a token."
        }
    }
}
