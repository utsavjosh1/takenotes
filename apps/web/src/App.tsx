import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { NotebookPreview } from "./components/NotebookPreview";
import { Blog, BlogArticle, BlogNotFound } from "./components/Blog";
import { ThemeToggle } from "./components/ThemeToggle";
import { findPost } from "./blog-content";
import { pageFromHash, useLocationHash } from "./navigation";
import { navigation, questions, site } from "./site-content";
import "./App.css";
import "./blog.css";
import "./theme.css";

function Brand() {
  return <a className="brand" href="#top" aria-label="takenotes home"><img src="/takenotes-symbol-violet.svg" alt="" width="34" height="34" /><span>takenotes<span className="brand-period">.</span></span></a>;
}

function Header({ blogActive }: { blogActive: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <header className="site-header" onKeyDown={(event) => {
    if (event.key === "Escape" && menuOpen) { setMenuOpen(false); toggle.current?.focus(); }
  }}>
    <div className="header-inner container">
      <Brand />
      <nav className="desktop-nav" aria-label="Main navigation">{navigation.map((item) => <a key={item.href} href={item.href} aria-current={item.href === "#/blog" && blogActive ? "page" : undefined}>{item.label}</a>)}</nav>
      <div className="header-actions"><ThemeToggle /><a className="github-link" href={site.repository} aria-label="takenotes on GitHub"><Icon name="github" size={19} /></a><a className="button button-small button-dark" href="#download">Get takenotes <Icon name="arrowUp" size={15} /></a><button ref={toggle} className="icon-button menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></div>
    </div>
    <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <a key={item.href} href={item.href} aria-current={item.href === "#/blog" && blogActive ? "page" : undefined} onClick={() => { setMenuOpen(false); toggle.current?.focus(); }}>{item.label}<Icon name="arrowUp" size={16} /></a>)}<a href={site.repository}>Explore the source <Icon name="github" size={16} /></a></nav>
  </header>;
}

function Hero() {
  return <section className="hero container" aria-labelledby="hero-title">
    <div className="hero-paper hero-paper-left" aria-hidden="true"><Icon name="file" size={18} /><span>an-idea.md</span><i /><i /><i /><span className="paper-highlight">what if…</span></div>
    <div className="hero-doodle" aria-hidden="true"><svg viewBox="0 0 100 110" fill="none"><path d="m49 8 3 31 27-23-17 30 31 3-32 9 25 23-31-13 1 32-11-30-24 23 13-30-29-2 31-11-22-21 28 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg><span>room for the<br />unfinished ideas</span></div>
    <a href="#roadmap" className="release-badge"><span className="status-dot" /><span>A little notebook. A fresh start.</span><span className="badge-version">v{site.version}</span><Icon name="chevron" size={13} /></a>
    <h1 id="hero-title">Less noise.<br />More room to <em>think.</em></h1>
    <p className="hero-description">A quiet home for your notes, ideas, and everything in between.<br className="desktop-break" /> Plain Markdown. Local files. Completely yours.</p>
    <div className="hero-actions"><a className="button button-dark" href="#download"><Icon name="windows" size={17} /> Explore early builds <Icon name="arrow" size={17} /></a><a className="button button-text" href="#preview">Take a look inside <Icon name="down" size={16} /></a></div>
    <p className="hero-footnote">Open source &nbsp;·&nbsp; Windows-first &nbsp;·&nbsp; Made for your own files</p>
    <div id="preview" className="preview-stage">
      <div className="preview-topline"><span><span className="status-dot" /> A small glimpse of a calmer workspace</span><span>Try a note. Make it your own. <Icon name="down" size={14} /></span></div>
      <NotebookPreview />
      <div className="preview-caption"><Icon name="lock" size={13} /><span>Interactive design preview, not the desktop app. Sample edits stay in this tab and disappear on refresh.</span></div>
    </div>
  </section>;
}

function Features() {
  return <section className="features section-space container" id="features" aria-labelledby="features-title">
    <div className="section-intro"><span className="eyebrow">THOUGHTFULLY SIMPLE</span><h2 id="features-title">Good tools get<br />out of your <em>way.</em></h2><p>Less managing your notebook.<br />More doing something with what's inside it.</p></div>
    <div className="feature-grid">
      <article className="feature-card feature-files"><div className="feature-copy"><span className="feature-icon"><Icon name="file" /></span><h3>Notes, not a walled garden.</h3><p>Just Markdown files in a folder you choose. Open them in another editor. Put them in Git. Keep them long after you leave us.</p></div><div className="file-art" aria-hidden="true"><div className="file-art-back"><Icon name="folder" size={27} /><span>My notebook</span></div><div className="file-art-paper"><div><Icon name="file" size={17} /> a-good-idea.md <span>.md</span></div><strong># Start somewhere.</strong><p>A thought worth keeping.<br />A file that's always yours.</p><span className="art-code">plain text. endless possibility.</span></div><div className="ownership-stamp"><Icon name="check" size={14} /> Yours. Always.</div></div></article>
      <article className="feature-card feature-wsl"><div className="feature-copy"><span className="feature-icon"><Icon name="terminal" /></span><h3>At home on both sides.</h3><p>A Windows notebook with Linux in mind. Work toward your WSL folders without losing your familiar writing space.</p></div><div className="terminal-art" aria-label="Illustrative Linux workspace path"><div className="terminal-top"><span><i /><i /><i /></span> ubuntu · workspace</div><div className="terminal-body"><p><span>~</span> /home/you/notes</p><p className="terminal-muted">├── ideas/</p><p className="terminal-muted">├── projects/</p><p>└── a-fresh-start.md<span className="terminal-cursor" /></p><div className="terminal-tag"><span className="status-dot" /> WSL2 runtime · in development</div></div></div></article>
      <article className="feature-card small-feature"><span className="feature-icon"><Icon name="search" /></span><h3>Find the thought.</h3><p>Search filenames and note content. Pick up a thread without digging through every folder.</p><div className="mini-search"><Icon name="search" size={15} /><span>that one good idea</span><kbd>↵</kbd></div></article>
      <article className="feature-card small-feature"><span className="feature-icon"><Icon name="keyboard" /></span><h3>Stay in your flow.</h3><p>Quick open and a command palette keep the next action close to your fingertips.</p><div className="keyboard-art" aria-label="Control Shift P opens the command palette"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>P</kbd></div></article>
      <article className="feature-card small-feature"><span className="feature-icon"><Icon name="lock" /></span><h3>A little peace of mind.</h3><p>Conflict-aware saves and draft recovery help protect the words you put time into.</p><div className="recovery-art"><span className="recovery-check"><Icon name="check" size={13} /></span> Careful with your words.</div></article>
    </div>
  </section>;
}

const steps = [
  { title: "Bring a folder.", text: "Start fresh or open an existing Markdown workspace. Your files don't need a new home.", icon: "folder" },
  { title: "Follow a thought.", text: "Write a note, sketch a plan, collect a little inspiration. Keep your attention on the page.", icon: "file" },
  { title: "Make it your own.", text: "Organize with folders and find things with search. Build a rhythm that works for you.", icon: "heart" },
] as const;

function Workflow() {
  return <section className="workflow-section" id="workflow" aria-labelledby="workflow-title"><div className="container workflow-inner"><div className="workflow-heading"><span className="eyebrow">NO BIG SETUP. NO NEW SYSTEM.</span><h2 id="workflow-title">Start with a folder.<br />See where it <em>goes.</em></h2><p>Your notebook should fit your life.<br />Not the other way around.</p><a className="text-link" href="#preview">Meet your next blank page <Icon name="arrow" size={17} /></a><div className="workflow-decoration" aria-hidden="true"><span className="decor-folder"><Icon name="folder" size={54} /></span><span className="dotted-trail" /><span className="decor-file"><Icon name="file" size={34} /></span><span className="handwritten">a small beginning</span></div></div><ol className="workflow-steps">{steps.map((step, index) => <li key={step.title}><span className="step-number">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><span className="step-icon"><Icon name={step.icon} size={22} /></span></li>)}</ol></div></section>;
}

function Roadmap() {
  return <section id="roadmap" className="roadmap container section-space" aria-labelledby="roadmap-title"><div className="roadmap-heading"><div><span className="eyebrow">A NOTE ON WHERE WE ARE</span><h2 id="roadmap-title">Small beginnings.<br /><em>Thoughtful</em> next steps.</h2></div><p>We're building the foundation first.<br />Here's what's taking shape, and what's still on the page.</p></div><div className="roadmap-grid"><article className="roadmap-card"><span className="roadmap-status"><span className="status-dot" /> THE FOUNDATION</span><h3>Words first. Files always.</h3><p>Markdown editing, workspace search, tabs, conflict checks, and draft recovery form the desktop foundation.</p><span className="roadmap-note">Early development · v{site.version}</span></article><article className="roadmap-card"><span className="roadmap-status status-purple"><span className="status-dot" /> IN PROGRESS</span><h3>Across the Windows–WSL line.</h3><p>A first-class Linux host runtime and authenticated transport. Real Windows 11 + WSL2 validation is still needed.</p><span className="roadmap-note">Being built and validated</span></article><article className="roadmap-card"><span className="roadmap-status status-neutral"><span className="status-dot" /> ON THE HORIZON</span><h3>A little more perspective.</h3><p>Daily Notes, Today, richer tasks, event calendars, and Collections. Useful structure, without giving up plain files.</p><span className="roadmap-note">Planned · not available yet</span></article></div><a className="text-link roadmap-link" href={site.repository}>Follow along on GitHub <Icon name="arrowUp" size={15} /></a></section>;
}

function FAQ() {
  return <section className="faq-section container" id="faq" aria-labelledby="faq-title"><div className="faq-intro"><span className="eyebrow">A FEW THINGS YOU MIGHT WONDER</span><h2 id="faq-title">Good<br /><em>questions.</em></h2><p>Still curious about something?</p><a className="text-link" href={site.issues}>Let's talk on GitHub <Icon name="arrowUp" size={16} /></a></div><div className="faq-list">{questions.map((item, index) => <details key={item.question}><summary><span className="faq-number">0{index + 1}</span><span>{item.question}</span><Icon name="plus" size={19} /></summary><p>{item.answer}</p></details>)}</div></section>;
}

function Download() {
  return <section id="download" className="download-section container" aria-labelledby="download-title"><div className="download-card"><div className="download-doodle" aria-hidden="true">✳</div><span className="eyebrow">YOUR NEXT IDEA DESERVES A HOME</span><h2 id="download-title">A little less noise.<br />A little more <em>you.</em></h2><p>Come help shape a notebook that feels like your own.</p><div className="download-actions"><a className="button button-dark" href={site.releases}><Icon name="windows" size={18} /> Explore Windows builds <Icon name="arrowUp" size={16} /></a><a className="button button-outline" href={site.repository}><Icon name="github" size={18} /> Explore the source</a></div><p className="download-platform">Target: Windows 11 x64 · WSL2 · Ubuntu 22.04 / 24.04</p><div className="prerelease-notice"><span className="notice-dot" /><p><strong>A work in progress, not a finished promise.</strong> Pre-release builds are unsigned. Windows + WSL validation is ongoing. Please back up your notes and explore with a test workspace.</p></div></div></section>;
}

function Home() {
  return <><Hero /><div className="principles-strip container" aria-label="Our principles"><span><Icon name="file" size={17} /> Plain Markdown</span><span><Icon name="folder" size={17} /> Files you own</span><span><Icon name="lock" size={17} /> Local-first by design</span><span><Icon name="github" size={17} /> Open source, open doors</span></div><Features /><Workflow /><Roadmap /><FAQ /><Download /></>;
}

function Footer() {
  return <footer className="site-footer container"><div className="footer-main"><div><Brand /><p>A quiet place for a busy mind.</p></div><nav aria-label="Footer navigation"><a href="#/blog">Journal</a><a href={site.repository}>GitHub <Icon name="arrowUp" size={13} /></a><a href={`${site.repository}/blob/main/CONTRIBUTING.md`}>Contribute</a><a href={site.releases}>Releases</a><a href="#faq">FAQs</a></nav></div><div className="footer-bottom"><span>Independent software. Thoughtfully built.</span><span>Open source · MIT license <span className="footer-flower" aria-hidden="true">✳</span></span><a href="#top" onClick={(event) => {
    event.preventDefault();
    document.querySelector<HTMLAnchorElement>(".brand")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }}>Back to the top <Icon name="arrowUp" size={13} /></a></div></footer>;
}

export function App() {
  const hash = useLocationHash();
  const page = pageFromHash(hash);
  const post = page.kind === "post" ? findPost(page.slug) : undefined;
  const previousHash = useRef<string | null>(null);

  useLayoutEffect(() => {
    const currentPage = pageFromHash(hash);
    const article = currentPage.kind === "post" ? findPost(currentPage.slug) : undefined;
    document.title = currentPage.kind === "home" ? "takenotes — filesystem-first Markdown notebook" : currentPage.kind === "blog" ? "Journal — takenotes" : article ? `${article.title} — takenotes journal` : "Story not found — takenotes";
    document.querySelector('meta[name="description"]')?.setAttribute("content", article?.excerpt ?? (currentPage.kind === "home" ? "takenotes is a quiet, local-first Markdown notebook. Plain files, Windows + WSL workflows, open source." : "Notes on thoughtful tools, plain Markdown files, and building takenotes in the open."));
    const initial = previousHash.current === null;
    previousHash.current = hash;
    if (initial && !hash) return;
    const id = currentPage.kind === "home" ? hash.slice(1) || "top" : currentPage.kind === "post" && currentPage.section ? `article-section-${currentPage.section}` : "main-content";
    // Run after native fragment navigation so it cannot clear our focus/scroll.
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id) ?? document.getElementById("main-content");
      if (target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: "instant", block: "start" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return <><a href="#main-content" className="skip-link" onClick={(event) => {
    event.preventDefault();
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
    main?.scrollIntoView({ behavior: "instant" });
  }}>Skip to content</a><div id="top" /><Header blogActive={page.kind !== "home"} /><main id="main-content" tabIndex={-1}>
    {page.kind === "home" ? <Home /> : page.kind === "blog" ? <Blog /> : post ? <BlogArticle key={post.slug} post={post} /> : <BlogNotFound />}
  </main><Footer /></>;
}
