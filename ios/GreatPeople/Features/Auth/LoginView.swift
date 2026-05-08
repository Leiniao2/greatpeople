import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authStore: AuthStore

    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var displayName = ""
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        VStack(spacing: 20) {
            // Title
            VStack(spacing: 4) {
                Text("♛").font(.system(size: 44))
                Text("Great People")
                    .font(.system(.title, design: .serif).weight(.bold))
                Text("Collect · Battle · Conquer")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 8)

            // Tab switcher
            HStack(spacing: 0) {
                ForEach(["Sign In", "Register"], id: \.self) { label in
                    let active = (label == "Register") == isRegistering
                    Button(label) { withAnimation { isRegistering = label == "Register"; error = nil } }
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(active ? Color.accentColor : Color.clear)
                        .foregroundStyle(active ? .white : .secondary)
                }
            }
            .background(Color(.systemFill))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Fields
            VStack(spacing: 12) {
                if isRegistering {
                    TextField("Display Name", text: $displayName)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                }
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                if isRegistering {
                    SecureField("Confirm Password", text: $confirmPassword)
                        .textFieldStyle(.roundedBorder)
                }
            }

            // Error
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            // Submit
            Button {
                Task { await submit() }
            } label: {
                HStack {
                    if loading { ProgressView().tint(.white).padding(.trailing, 4) }
                    Text(isRegistering ? "Create Account" : "Sign In")
                        .font(.subheadline.weight(.bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .disabled(loading)
        }
        .padding(32)
    }

    private func submit() async {
        error = nil
        guard !email.isEmpty, !password.isEmpty else { error = "Please fill in all fields."; return }
        if isRegistering {
            guard !displayName.isEmpty else { error = "Display name is required."; return }
            guard password == confirmPassword else { error = "Passwords do not match."; return }
        }
        loading = true
        defer { loading = false }
        do {
            if isRegistering {
                try await authStore.register(email: email, password: password, displayName: displayName)
            } else {
                try await authStore.login(email: email, password: password)
            }
        } catch {
            self.error = isRegistering ? "Registration failed. Please try again." : "Invalid email or password."
        }
    }
}
