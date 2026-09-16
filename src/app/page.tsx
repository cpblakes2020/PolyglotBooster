import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { IntakeWorkspace } from "@/components/intake/IntakeWorkspace";

export default async function Home() {
  const session = await auth();

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="PolyglotBooster home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PolyglotBooster</span>
        </Link>
        <div className="topbar-note">
          <span>{session?.user?.email}</span>
          <Link href="/settings">Settings</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <IntakeWorkspace />

      <footer className="page-footer"><span>Polyglot Language Learner</span><span>Analyzed language first, always editable.</span></footer>
    </main>
  );
}
