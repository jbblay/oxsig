import Link from 'next/link';
import { ArrowRight, Network, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authPathWithReturnTo } from '@/lib/auth-return';
import styles from './public-site.module.css';

const navItems = [
  { label: 'Dashboard', href: '/home' },
  { label: 'Missions', href: '/operations' },
] as const;

const footerGroups = [
  {
    title: 'Browse',
    links: [
      ['Dashboard', '/home'],
      ['Mission catalog', '/operations'],
    ],
  },
  {
    title: 'Missions',
    links: [
      ['Active Directory', '/operations?operation=black-domain'],
      ['Linux', '/operations?operation=ghost-shell'],
      ['Network Pivoting', '/operations?operation=pivot-point'],
      ['Web Pentest', '/operations?operation=red-web'],
      ['Digital Forensics', '/operations?operation=dead-disk'],
      ['Cloud', '/operations?operation=cloudfall'],
    ],
  },
  {
    title: 'Account',
    links: [
      ['Create account', '/sign-up'],
    ],
  },
] as const;

export function PublicSiteHeader({ authReturnTo = '/home' }: { authReturnTo?: string }) {
  const signInHref = authPathWithReturnTo('/sign-in', authReturnTo);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="OXSIG home">
          <span className={styles.brandMark}><Network className="h-4 w-4" aria-hidden="true" /></span>
          <span>OXSIG</span>
        </Link>

        <nav className={styles.nav} aria-label="Public navigation">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Button asChild variant="ghost" size="sm" className="text-slate-300 hover:bg-white/[0.06] hover:text-white">
            <Link href={signInHref}>Log in</Link>
          </Button>
          <Button asChild size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <Link href="/home">Open dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter({ authReturnTo = '/home' }: { authReturnTo?: string }) {
  const signInHref = authPathWithReturnTo('/sign-in', authReturnTo);

  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div className={styles.footerBrand}>
          <Link href="/" className={styles.brand} aria-label="OXSIG home">
            <span className={styles.brandMark}><Network className="h-4 w-4" aria-hidden="true" /></span>
            <span>OXSIG</span>
          </Link>
          <p>Browse the public dashboard, Operations catalogue and mission dossiers without an account.</p>
          <span className={styles.trustLine}><ShieldCheck className="h-3.5 w-3.5" /> Protected workspaces require authentication.</span>
        </div>

        {footerGroups.map((group) => (
          <div key={group.title} className={styles.footerGroup}>
            <h2>{group.title}</h2>
            {group.links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
            {group.title === 'Account' ? <Link href={signInHref}>Log in</Link> : null}
          </div>
        ))}
      </div>
      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} OXSIG</span>
        <span>Build · Operate · Prove</span>
      </div>
    </footer>
  );
}
