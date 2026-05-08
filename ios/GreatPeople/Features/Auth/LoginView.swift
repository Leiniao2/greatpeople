import SwiftUI
import GoogleSignIn

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
        ZStack {
            Color.gpBackground.ignoresSafeArea()

            // Ambient glow
            GeometryReader { geo in
                Circle().fill(Color.gpAmber.opacity(0.07)).frame(width: 400, height: 400)
                    .blur(radius: 100).offset(x: geo.size.width * 0.1, y: -50)
                Circle().fill(Color.gpIndigo.opacity(0.07)).frame(width: 400, height: 400)
                    .blur(radius: 100).offset(x: geo.size.width * 0.4, y: geo.size.height * 0.5)
            }.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {

                    // Header
                    VStack(spacing: 6) {
                        Text("♛")
                            .font(.system(size: 48))
                            .foregroundColor(.gpAmber)
                            .padding(16)
                            .background(Color.gpAmber.opacity(0.12))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.gpAmber.opacity(0.25), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        Text("GREAT PEOPLE")
                            .font(.system(.title2, design: .serif).weight(.bold))
                            .tracking(6)
                            .foregroundColor(.white)
                        Text("COLLECT · BATTLE · CONQUER")
                            .font(.system(size: 10).weight(.medium))
                            .tracking(4)
                            .foregroundColor(.gpSlate400)
                    }
                    .padding(.top, 32)

                    // Glass panel
                    VStack(spacing: 20) {

                        // Google SSO
                        Button {
                            Task {
                                loading = true
                                defer { loading = false }
                                do { try await authStore.googleLogin() }
                                catch { self.error = "Google sign-in failed. Please try again." }
                            }
                        } label: {
                            HStack(spacing: 0) {
                                Image("google-logo")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 20, height: 20)
                                    .padding(.leading, 16)
                                Text("Continue with Google")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.white)
                            .foregroundColor(Color(red: 0.1, green: 0.1, blue: 0.15))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(white: 0.85), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .shadow(color: .black.opacity(0.12), radius: 4, x: 0, y: 2)
                        }
                        .disabled(loading)

                        // Divider
                        HStack(spacing: 12) {
                            Rectangle().fill(Color.gpOutline).frame(height: 1)
                            Text("or").font(.caption).foregroundColor(.gpSlate600)
                            Rectangle().fill(Color.gpOutline).frame(height: 1)
                        }

                        // Tab switcher
                        HStack(spacing: 4) {
                            ForEach(["Sign In", "Register"], id: \.self) { label in
                                let active = (label == "Register") == isRegistering
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        isRegistering = label == "Register"
                                        error = nil
                                    }
                                } label: {
                                    Text(label)
                                        .font(.subheadline.weight(.semibold))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(active ? Color.gpAmber : Color.clear)
                                        .foregroundColor(active ? Color.gpBackground : Color.gpSlate400)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                        .padding(4)
                        .background(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.gpOutline, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 14))

                        // Fields
                        VStack(spacing: 12) {
                            if isRegistering {
                                TextField("Display Name", text: $displayName)
                                    .autocorrectionDisabled()
                                    .gpTextInput()
                            }
                            TextField("Email", text: $email)
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                                .gpTextInput()
                            SecureField("Password", text: $password)
                                .gpTextInput()
                            if isRegistering {
                                SecureField("Confirm Password", text: $confirmPassword)
                                    .gpTextInput()
                            }
                        }

                        // Error
                        if let error {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                Text(error)
                            }
                            .font(.caption)
                            .foregroundColor(Color(red: 0.98, green: 0.5, blue: 0.45))
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.1))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.2), lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // Submit
                        Button { Task { await submit() } } label: {
                            HStack(spacing: 8) {
                                if loading {
                                    ProgressView().tint(Color.gpBackground).scaleEffect(0.8)
                                }
                                Text(isRegistering ? "Create Account  →" : "Sign In  →")
                            }
                        }
                        .gpPrimaryButton(loading: loading)
                        .disabled(loading)

                    }
                    .padding(24)

                // Guest explore button
                Button {
                    authStore.enterGuestMode()
                } label: {
                    Text("Explore as Guest →")
                        .font(.subheadline)
                        .foregroundColor(.gpSlate400)
                }
                .padding(.top, 4)
                    .background(Color.white.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.gpOutline, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
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
