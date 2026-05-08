import Foundation

final class WebSocketClient: NSObject, ObservableObject {
    @Published var lastMessage: BattleMessage?
    @Published var isConnected = false

    private var task: URLSessionWebSocketTask?

    func connect(matchId: String, token: String) {
        var req = URLRequest(url: URL(string: "wss://YOUR_SERVICE_URL/ws/battle/\(matchId)")!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        task = URLSession.shared.webSocketTask(with: req)
        task?.resume()
        isConnected = true
        receive()
    }

    func send(_ message: BattleMove) {
        guard let data = try? JSONEncoder().encode(message),
              let text = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(text)) { _ in }
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        isConnected = false
    }

    private func receive() {
        task?.receive { [weak self] result in
            switch result {
            case .success(.string(let text)):
                if let data = text.data(using: .utf8),
                   let msg = try? JSONDecoder().decode(BattleMessage.self, from: data) {
                    DispatchQueue.main.async { self?.lastMessage = msg }
                }
                self?.receive()
            default:
                break
            }
        }
    }
}

struct BattleMove: Encodable { let cardId: String }
struct BattleMessage: Decodable { let event: String; let payload: [String: String] }
