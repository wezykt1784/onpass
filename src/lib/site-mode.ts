/**
 * The sales side (landing page, pricing, early list) is off unless NEXT_PUBLIC_ONPASS_LANDING=on at build time.
 * Off: "/" goes straight to the app, the early list refuses sign-ups, and search engines are asked
 * not to index anything. Right for a private, single-user deploy.
 */
export const PUBLIC_LANDING = process.env.NEXT_PUBLIC_ONPASS_LANDING === "on";
