import SwiftUI
import GoogleSignIn

@main
struct GreatPeopleApp: App {
    @StateObject private var authStore = AuthStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if authStore.isLoggedIn {
                    ContentView().environmentObject(authStore)
                } else {
                    LoginView().environmentObject(authStore)
                }
            }
            .preferredColorScheme(.dark)
            .tint(.gpAmber)
            .onOpenURL { url in
                GIDSignIn.sharedInstance.handle(url)
            }
        }
    }
}
