import Link from "next/link";

// The study desk's two tabs: the desk itself, and Utilities (saving the
// clipboard for Anki later, the saved-for-later list, saved sessions).
export function StudyTabs({ active }: { active: "desk" | "utilities" }) {
  return (
    <nav className="mode-tabs study-tabs" aria-label="Study desk sections">
      <Link className={`mode-tab${active === "desk" ? " active" : ""}`} href="/" aria-current={active === "desk" ? "page" : undefined}>Study desk</Link>
      <Link className={`mode-tab${active === "utilities" ? " active" : ""}`} href="/utilities" aria-current={active === "utilities" ? "page" : undefined}>Utilities</Link>
    </nav>
  );
}
