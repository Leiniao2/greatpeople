import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authStore: AuthStore

    var body: some View {
        HomeView()
    }
}
