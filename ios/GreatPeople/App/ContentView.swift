import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            CollectionView()
                .tabItem { Label("Collection", systemImage: "rectangle.stack.fill") }
            BattleView()
                .tabItem { Label("Battle", systemImage: "bolt.shield.fill") }
        }
        .background(Color.gpBackground)
    }
}
