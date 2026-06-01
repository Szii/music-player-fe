/**
 * App-wide feature flags.
 *
 * Flip these to toggle features without touching feature code.
 */

/**
 * Controls the email-based account flows:
 * - "Forgot password?" link on the login screen.
 * - The /forgot-password, /reset-password and /verify-email routes.
 * - The "Change email" form on the profile page.
 * - The resend-verification / change-unverified-email actions shown after login.
 *
 * When `false`, the related UI is grayed out / not clickable and the routes
 * redirect to /login.
 */
export const SHOW_EMAIL_INPUTS = false;

/**
 * Selects the board audio backend.
 *
 * When `false` (default), boards play through the existing backend stream
 * endpoints via {@link BoardPlayerComponent} — the MSE/blob/native streaming
 * engine with the Web Audio crossfade graph.
 *
 * When `true`, boards play YouTube directly client-side via
 * `BoardPlayerYtComponent` (YouTube IFrame Player API), removing the dependency
 * on the backend stream endpoints. This is an experimental migration path; keep
 * it `false` to fall back to the proven solution if anything regresses.
 */
export const USE_YT_IFRAME_PLAYER = true;
