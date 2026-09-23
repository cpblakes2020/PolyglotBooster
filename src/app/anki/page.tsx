import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { AnkiDesk } from "@/components/anki/AnkiDesk";

export default async function AnkiPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="PolyglotBooster home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PolyglotBooster</span>
        </Link>
        <div className="topbar-note">
          <span>{session.user.email}</span>
          <Link href="/">Study desk</Link>
          <Link href="/settings">Settings</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <AnkiDesk />
    </main>
  );
}
