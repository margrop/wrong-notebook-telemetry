import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { t } from "@/lib/translations";

export default function LoginPage() {
  return <main className="login"><section className="panel"><h1>{t.login.title}</h1><p className="muted">{t.login.intro}</p><LoginForm /><Link href="/privacy">{t.nav.privacy}</Link></section></main>;
}
