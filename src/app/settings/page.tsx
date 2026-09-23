import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getAccountKeyStatus } from "@/lib/storage/account";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { ImportLegacyReviews } from "@/components/settings/ImportLegacyReviews";
import { VoiceSettings } from "@/components/settings/VoiceSettings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const keyStatus = await getAccountKeyStatus(session.user.id);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="PolyglotBooster home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PolyglotBooster</span>
        </Link>
        <div className="topbar-note">
          <span>{session.user.email}</span>
          <Link href="/">Back to study desk</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <SettingsForm initialKeyStatus={keyStatus} />
      <VoiceSettings />
      <ImportLegacyReviews />
    </main>
  );
}
