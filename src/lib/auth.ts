import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile?.sub) token.userId = profile.sub;
      return token;
    },
    session({ session, token }) {
      if (token.userId && session.user) session.user.id = token.userId as string;
      return session;
    },
  },
});
