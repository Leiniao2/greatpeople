import SwiftUI

// MARK: - Design tokens

extension Color {
    static let gpBackground  = Color(red: 0.031, green: 0.031, blue: 0.071)  // #080812
    static let gpSurface     = Color(red: 0.059, green: 0.059, blue: 0.118)  // #0F0F1E
    static let gpSurfaceHigh = Color(red: 0.086, green: 0.086, blue: 0.165)  // #16162A
    static let gpAmber       = Color(red: 0.961, green: 0.620, blue: 0.043)  // #F59E0B
    static let gpAmberDim    = Color(red: 0.851, green: 0.467, blue: 0.027)  // #D97706
    static let gpIndigo      = Color(red: 0.388, green: 0.400, blue: 0.945)  // #6366F1
    static let gpSlate400    = Color(red: 0.580, green: 0.639, blue: 0.722)  // #94A3B8
    static let gpSlate600    = Color(red: 0.278, green: 0.333, blue: 0.412)  // #475569
    static let gpOutline     = Color.white.opacity(0.08)
    static let gpOutlineHigh = Color.white.opacity(0.12)
}

// MARK: - Tier colors

extension Color {
    static func tierColor(for tier: String) -> Color {
        switch tier.lowercased() {
        case "legendary": return Color(red: 0.851, green: 0.467, blue: 0.027)
        case "epic":      return Color(red: 0.486, green: 0.231, blue: 0.929)
        case "rare":      return Color(red: 0.145, green: 0.388, blue: 0.922)
        default:          return Color(red: 0.278, green: 0.333, blue: 0.412)
        }
    }
}

// MARK: - View modifiers

struct GPCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.gpOutline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct GPTextInputStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.white.opacity(0.05))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gpOutline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .foregroundColor(.white)
            .tint(.gpAmber)
    }
}

struct GPPrimaryButton: ViewModifier {
    var loading = false
    func body(content: Content) -> some View {
        content
            .font(.subheadline.weight(.bold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(loading ? Color.gpAmber.opacity(0.5) : Color.gpAmber)
            .foregroundColor(Color.gpBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

extension View {
    func gpCard()                 -> some View { modifier(GPCardStyle()) }
    func gpTextInput()            -> some View { modifier(GPTextInputStyle()) }
    func gpPrimaryButton(loading: Bool = false) -> some View { modifier(GPPrimaryButton(loading: loading)) }
}
