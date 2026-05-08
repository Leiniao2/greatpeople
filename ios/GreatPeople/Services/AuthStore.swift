import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published var isLoggedIn = false
    private let tokenKey = "access_token"

    init() {
        isLoggedIn = UserDefaults.standard.string(forKey: tokenKey) != nil
    }

    func login(email: String, password: String) async throws {
        let resp = try await APIClient.shared.login(LoginRequest(email: email, password: password))
        store(token: resp.accessToken)
    }

    func register(email: String, password: String, displayName: String) async throws {
        let resp = try await APIClient.shared.register(RegisterRequest(email: email, password: password, displayName: displayName))
        store(token: resp.accessToken)
    }

    func logout() async {
        try? await APIClient.shared.logout()
        UserDefaults.standard.removeObject(forKey: tokenKey)
        APIClient.shared.clearToken()
        isLoggedIn = false
    }

    private func store(token: String) {
        UserDefaults.standard.set(token, forKey: tokenKey)
        APIClient.shared.setToken(token)
        isLoggedIn = true
    }
}
