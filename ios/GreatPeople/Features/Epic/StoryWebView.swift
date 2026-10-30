import SwiftUI
import WebKit

/// A message the embedded web app posts through `window.webkit.messageHandlers.gp`.
struct BridgeMessage: Decodable {
    let type: String
    let slug: String?
    let unlockKey: String?
    let id: String?
}

/// Hosts the web app's full-screen play routes (`/play/story/…`,
/// `/play/challenge/…`) and relays its bridge messages back to SwiftUI.
struct StoryWebView: UIViewRepresentable {
    let url: URL
    let onMessage: (BridgeMessage) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onMessage: onMessage) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "gp")
        config.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.scrollView.bounces = false
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.953, green: 0.925, blue: 0.863, alpha: 1)   // paper
        #if DEBUG
        if #available(iOS 16.4, *) { view.isInspectable = true }
        #endif
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
        if view.url?.absoluteString.split(separator: "#").first != url.absoluteString.split(separator: "#").first {
            view.load(URLRequest(url: url))
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "gp")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onMessage: (BridgeMessage) -> Void
        init(onMessage: @escaping (BridgeMessage) -> Void) { self.onMessage = onMessage }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "gp",
                  let json = message.body as? String,
                  let data = json.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode(BridgeMessage.self, from: data)
            else { return }
            DispatchQueue.main.async { self.onMessage(decoded) }
        }
    }
}

/// Full-screen wrapper with a close button in case the page never reports `close`.
struct PlayScreen: View {
    let url: URL
    let onMessage: (BridgeMessage) -> Void
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            StoryWebView(url: url, onMessage: onMessage)
                .ignoresSafeArea(edges: .bottom)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.caption.bold())
                    .padding(8)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(.trailing, 12)
            .padding(.top, 8)
            .accessibilityLabel("Close")
        }
    }
}
