import Link from "next/link";
import { t } from "@/lib/translations";

export default function PrivacyPage() {
  return <main className="prose"><Link href="/">{t.nav.home}</Link><section className="panel">
    <h1>{t.privacy.title}</h1><p>{t.privacy.intro}</p>
    {t.privacy.sections.map(section => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
  </section></main>;
}
