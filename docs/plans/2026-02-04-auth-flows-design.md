# Auth Flows Redesign + Password Recovery (Design)

> **Date:** 2026-02-04

## Goals
- Align Sign In, Sign Up, Forgot Password, and Reset Password UI with the existing dashboard/settings visual language.
- Provide a complete password recovery flow (email request + reset form).
- Keep all user-facing copy fully localized (TR/EN parity).

## Non-Goals
- OAuth/social login.
- Email change flow.
- Multi-factor auth.

## UX Summary
- **Sign In:** Existing fields, updated styling to match settings; include a visible “Forgot password” link.
- **Sign Up:** Existing fields, updated styling to match settings; consistent helper/error text.
- **Forgot Password:** Email input only; clear success state after sending link; 120s resend cooldown.
- **Reset Password:** New password + confirm; success message and CTA to Sign In.
- **Profile Settings:** Email is read-only and explicitly marked as non-editable; add a “Password” section with a “Change Password” button that sends the reset link for the current user.

## Route Strategy
- Reset link redirects to `/{locale}/reset-password`.
- Locale-aware routing uses `as-needed` prefix (TR default, EN prefixed).

## Architecture & Data Flow
- Add a shared server action `requestPasswordReset(email, locale)`.
- The action calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
- `redirectTo` is an absolute URL pointing to `/{locale}/reset-password`.
- Both “Forgot Password” and “Profile > Change Password” use the same action.
- Reset page uses the Supabase client to detect recovery sessions and update the password via `supabase.auth.updateUser({ password })`.

## UI Components
- **Auth Form Card:** Light, settings-style card with consistent input/button styling.
- **Status Banner:** Simple inline success/error feedback.
- **Cooldown CTA:** Disabled button + countdown label for 120s after a reset email send.

## Error Handling
- Network/auth failures show a generic, localized error message.
- Invalid/expired reset link shows a dedicated state with a “Send new link” CTA.
- Password mismatch and minimum length validation are client-side before calling Supabase.

## Security Considerations
- Email is always read-only in Profile.
- Reset link is handled by Supabase recovery flow (token validation handled server-side by Supabase).

## i18n
- All new copy added to `messages/en.json` and `messages/tr.json`.
- Ensure key parity (no missing keys between locales).

## Testing Plan (High-Level)
- UI smoke: auth pages render with i18n keys.
- Reset email: action sends with correct redirect URL.
- Reset password: detects recovery session and updates password.
- Profile: email is read-only; “Change Password” triggers link send and cooldown state.

## Open Decisions
- Confirm base URL strategy for `redirectTo` (env var vs request headers fallback).
