import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// A test-only sign-in, so the app can be tried on this computer without
// signing in with Google each time the dev server restarts. It exists only
// on the development server (`npm run dev`) — never on Vercel, which runs in
// production mode — and only when .env.local sets DEV_LOGIN_TOKEN (a random
// secret: other devices on the network can reach the dev server) and the
// account to sign in as (DEV_USER_ID = the Google account's ID, so the same
// keys and saved data appear).
const devLoginEnabled = process.env.NODE_ENV === "development" && Boolean(process.env.DEV_LOGIN_TOKEN) && Boolean(process.env.DEV_USER_ID);

// Compares without stopping at the first difference. (This file also runs
// in the middleware, where node:crypto isn't available.)
function sameSecret(given: unknown, expected: string) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

const devLogin = devLoginEnabled ? [Credentials({
  id: "dev-login",
  name: "Test sign-in (this computer only)",
  credentials: { token: { label: "Test token", type: "password" } },
  authorize(credentials) {
    if (!sameSecret(credentials?.token, process.env.DEV_LOGIN_TOKEN!)) return null;
    return { id: process.env.DEV_USER_ID!, email: process.env.DEV_USER_EMAIL || null, name: "Test sign-in" };
  },
})] : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Google always asks which account to use, so you can switch accounts
  // (each has its own API keys and saved data) instead of being signed
  // straight back in as the last one.
  providers: [Google({ authorization: { params: { prompt: "select_account" } } }), ...devLogin],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile, user, account }) {
      if (profile?.sub) token.userId = profile.sub;
      else if (account?.provider === "dev-login" && user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId && session.user) session.user.id = token.userId as string;
      return session;
    },
  },
});
