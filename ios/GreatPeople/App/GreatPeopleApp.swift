import SwiftUI
import GoogleSignIn

@main
struct GreatPeopleApp: App {
    @StateObject private var authStore = AuthStore()

    init() {
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: "109767033732-34dgnffifdmpmaojpf7kvkvhh2g4etld.apps.googleusercontent.com"
        )
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authStore.isLoggedIn || authStore.isGuest {
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
