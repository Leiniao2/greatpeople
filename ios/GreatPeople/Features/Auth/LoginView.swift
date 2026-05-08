import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authStore: AuthStore
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Great People").font(.largeTitle.bold())
            TextField("Email", text: $email).textFieldStyle(.roundedBorder).keyboardType(.emailAddress).autocapitalization(.none)
            SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
            if let error { Text(error).foregroundStyle(.red).font(.caption) }
            Button("Sign In") {
                Task {
                    do { try await authStore.login(email: email, password: password) }
                    catch { self.error = error.localizedDescription }
                }
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
        }
        .padding(32)
    }
}
