import SwiftUI

@main
struct GreatPeopleApp: App {
    @StateObject private var authStore = AuthStore()

    var body: some Scene {
        WindowGroup {
            if authStore.isLoggedIn {
                ContentView()
                    .environmentObject(authStore)
            } else {
                LoginView()
                    .environmentObject(authStore)
            }
        }
    }
}
