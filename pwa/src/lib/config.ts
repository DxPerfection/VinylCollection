// Settings that come from the build (Cloudflare Pages variables) or stay the same everywhere
export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? "";
export const supabasePublishableKey: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

// Only this GitHub account gets in (DxPerfection). The database checks the same account on every request
// (migrations/003_owner_only.sql), so this check only decides which screen to show.
export const ownerGithubId = "26037275";

// The Streamlit app stays live while the new app grows; screens that are not built yet link to it
export const oldAppUrl = "https://vinylcollection-beta.streamlit.app";

export function oldAppLink(section: string): string {
  return `${oldAppUrl}/?section=${encodeURIComponent(section)}`;
}
