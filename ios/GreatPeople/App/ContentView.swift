import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authStore: AuthStore

    var body: some View {
        TabView {
            EpicView()
                .tabItem { Label("Epic", systemImage: "bolt.fill") }

            CollectionView()
                .tabItem { Label("Collection", systemImage: "rectangle.stack.fill") }

            BattleView()
                .tabItem { Label("Battle", systemImage: "bolt.shield.fill") }

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.fill") }
        }
        .tint(.gpAmber)
        .background(Color.gpBackground)
    }
}
