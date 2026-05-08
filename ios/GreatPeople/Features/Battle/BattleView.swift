import SwiftUI

struct BattleView: View {
    @StateObject private var ws = WebSocketClient()
    @State private var matchId: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if ws.isConnected {
                    Text("Connected to match \(matchId ?? "")")
                    if let msg = ws.lastMessage {
                        Text("Event: \(msg.event)").font(.caption).foregroundStyle(.secondary)
                    }
                    Button("Forfeit", role: .destructive) { ws.disconnect() }
                } else {
                    Button("Find Match") { findMatch() }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }
            }
            .navigationTitle("Battle")
        }
    }

    private func findMatch() {
        // POST /battle/match, then connect WebSocket on success
    }
}
