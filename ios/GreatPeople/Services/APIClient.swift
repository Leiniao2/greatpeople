import Foundation

final class APIClient {
    static let shared = APIClient()

    private let baseURL = URL(string: "http://localhost:8080")!
    private let session = URLSession.shared
    private var accessToken: String?

    private init() {}

    func setToken(_ token: String) { accessToken = token }
    func clearToken() { accessToken = nil }

    func request<T: Decodable>(_ endpoint: String, method: String = "GET", body: Encodable? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(endpoint))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func login(_ body: LoginRequest) async throws -> AuthResponse {
        try await request("auth/login", method: "POST", body: body)
    }

    func register(_ body: RegisterRequest) async throws -> AuthResponse {
        try await request("auth/register", method: "POST", body: body)
    }

    func logout() async throws {
        let _: EmptyResponse = try await request("auth/logout", method: "POST")
    }

    func googleSSO(idToken: String) async throws -> AuthResponse {
        try await request("auth/google", method: "POST", body: GoogleSSORequest(idToken: idToken))
    }

    func fetchCards() async throws -> [Card] {
        let r: CardSyncResponse = try await request("profile/cards")
        return r.cards
    }

    func syncCards(_ cards: [Card]) async throws -> [Card] {
        let r: CardSyncResponse = try await request("profile/cards/sync", method: "POST", body: CardSyncRequest(cards: cards))
        return r.cards
    }
}

private struct EmptyResponse: Decodable {}
private struct GoogleSSORequest: Encodable { let idToken: String }
private struct CardSyncRequest: Encodable { let cards: [Card] }
private struct CardSyncResponse: Decodable { let cards: [Card] }
