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
