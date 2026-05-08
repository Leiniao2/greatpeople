import Foundation

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let displayName: String
}

struct AuthResponse: Decodable {
    let accessToken: String
    let refreshToken: String
}
