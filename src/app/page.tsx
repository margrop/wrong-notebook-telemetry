import Link from "next/link";
import { t } from "@/lib/translations";

export default function HomePage() {
  return <main className="prose"><section className="panel"><p className="muted">{t.home.eyebrow}</p>
    <h1>{t.appName}</h1><p>{t.home.intro}</p>
    <p>{t.home.access}</p>
    <nav><Link href="/privacy">{t.nav.privacy}</Link></nav>
  </section></main>;
}
