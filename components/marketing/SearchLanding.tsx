import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { MarketingStructuredData } from './MarketingStructuredData';
import { SearchCta } from './SearchCta';
import './search-landing.css';

export type SearchLandingContent = {
  slug: string;
  title: string;
  intro: string;
  audience: string;
  steps: { title: string; body: string }[];
  checklist: string[];
  questions: { question: string; answer: string }[];
  related: { href: string; label: string };
};

export function SearchLanding({ content }: { content: SearchLandingContent }) {
  return (
    <div className="rd1-search">
      <MarketingStructuredData />
      <a className="rd1-search-skip" href="#main">Skip to content</a>
      <header className="rd1-search-wrap rd1-search-nav">
        <Link href="/" aria-label="RedlineD1 home"><RedlineD1Logo height={32} background="light" /></Link>
        <nav aria-label="Product"><Link href="/#pricing">Pricing</Link><Link href="/shop-owner-demo">Watch the demo</Link><Link href="/login">Sign in</Link></nav>
      </header>
      <main id="main">
        <section className="rd1-search-hero">
          <div className="rd1-search-wrap">
            <p className="rd1-search-eyebrow">{content.audience}</p>
            <h1>{content.title}</h1>
            <p className="rd1-search-intro">{content.intro}</p>
            <div className="rd1-search-actions"><SearchCta slug={content.slug} /><Link className="rd1-search-secondary" href="/shop-audit">Book a shop workflow audit</Link></div>
            <p>Seven days of full access. No credit card required. Then keep the Free plan or upgrade.</p>
          </div>
        </section>
        <section className="rd1-search-wrap rd1-search-section" aria-labelledby="workflow-title">
          <p className="rd1-search-eyebrow">From the first check to the final invoice</p>
          <h2 id="workflow-title">How the workflow fits together</h2>
          <div className="rd1-search-grid">{content.steps.map((step, index) => <article key={step.title}><span className="rd1-search-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div>
        </section>
        <section className="rd1-search-checklist">
          <div className="rd1-search-wrap rd1-search-section">
            <h2>What to check during your trial</h2>
            <p>Use one realistic job to evaluate the full process. Start with sample details rather than importing your entire customer list.</p>
            <ul>{content.checklist.map(item => <li key={item}>{item}</li>)}</ul>
            <p><Link href="/#pricing">Compare current plans and limits</Link> before choosing a plan for your workload.</p>
          </div>
        </section>
        <section className="rd1-search-wrap rd1-search-section" aria-labelledby="questions-title">
          <h2 id="questions-title">Common questions</h2>
          {content.questions.map(item => <article className="rd1-search-question" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}
          <p>Explore <Link href={content.related.href}>{content.related.label}</Link> or <Link href="/shop-owner-demo">see the repair shop vehicle board</Link>.</p>
        </section>
        <section className="rd1-search-close"><div className="rd1-search-wrap"><h2>Try it on your next workflow.</h2><p>Set up your account and see how the process fits the way you work.</p><SearchCta slug={content.slug} /></div></section>
      </main>
      <footer className="rd1-search-wrap rd1-search-nav"><p>RedlineD1 · Built inside a real repair shop.</p><nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact-sales">Contact</Link></nav></footer>
    </div>
  );
}
