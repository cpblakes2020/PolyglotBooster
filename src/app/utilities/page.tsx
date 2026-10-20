import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { LaterListPanel } from "@/components/anki/later";
import { StudyTabs } from "@/components/StudyTabs";
import { ClipboardSaver } from "@/components/utilities/ClipboardSaver";
import { SavedSessions } from "@/components/utilities/SavedSessions";

// The study desk's Utilities tab: save the clipboard for Anki later (from
// any app, on any device), the saved-for-later list, and every saved
// session, organized.
export default async function UtilitiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=%2Futilities");

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="PolyglotBooster home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PolyglotBooster</span>
        </Link>
        <div className="topbar-note">
          <span>{session.user.email}</span>
          <Link href="/anki">Anki</Link>
          <Link href="/settings">Settings</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <StudyTabs active="utilities" />
      <div className="utilities-desk">
        <ClipboardSaver />
        <LaterListPanel />
        <SavedSessions />
      </div>
      <footer className="page-footer"><span>Polyglot Language Learner</span><span>Analyzed language first, always editable.</span></footer>
    </main>
  );
}
