import Foundation

/// Where the app finds the backend and the web app whose play routes it embeds.
///
/// Both default to the production App Engine host. Override with the
/// `GPWebBaseURL` / `GPAPIBaseURL` Info.plist keys, or in Debug builds with
/// the `GP_WEB_BASE_URL` / `GP_API_BASE_URL` scheme environment variables
/// (e.g. `http://localhost:3001` for the Vite dev server).
enum AppConfig {
    private static let production = URL(string: "https://great-people-495704.uc.r.appspot.com")!

    static let webBaseURL: URL = resolve(env: "GP_WEB_BASE_URL", plist: "GPWebBaseURL")
    static let apiBaseURL: URL = resolve(env: "GP_API_BASE_URL", plist: "GPAPIBaseURL")

    private static func resolve(env: String, plist: String) -> URL {
        #if DEBUG
        if let s = ProcessInfo.processInfo.environment[env], let u = URL(string: s) { return u }
        #endif
        if let s = Bundle.main.object(forInfoDictionaryKey: plist) as? String, let u = URL(string: s) { return u }
        return production
    }

    /// Full-screen story route for the WebView. The session token travels in the
    /// URL fragment so it is never sent to the server in the request line.
    static func playStoryURL(slug: String, token: String?) -> URL {
        embedURL(path: "/play/story/\(slug)", token: token)
    }

    static func playChallengeURL(id: String, token: String?) -> URL {
        embedURL(path: "/play/challenge/\(id)", token: token)
    }

    private static func embedURL(path: String, token: String?) -> URL {
        var components = URLComponents(url: webBaseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        components.queryItems = [URLQueryItem(name: "embed", value: "1")]
        if let token, let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            components.fragment = "token=\(encoded)"
        }
        return components.url!
    }
}
