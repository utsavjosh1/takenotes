import { useState } from "react";
import { blogPosts, readingMinutes, type BlogPost } from "../blog-content";
import { postHref } from "../navigation";
import { site } from "../site-content";
import { Icon } from "./Icon";

function PostArt({ post }: { post: BlogPost }) {
  return <div className={`post-art post-art-${post.category.toLowerCase()}`} aria-hidden="true">
    <span className="post-art-orbit" />
    <div className="post-art-paper"><Icon name={post.icon} size={32} /><span className="post-art-rule" /><span className="post-art-rule short" /><strong>{post.illustration}</strong><span className="post-art-signature">takenotes.</span></div>
    <span className="post-art-spark">✳</span>
  </div>;
}

function PostMeta({ post }: { post: BlogPost }) {
  return <div className="post-meta"><span>{post.category}</span><span aria-hidden="true">·</span><span>{readingMinutes(post)} min read</span></div>;
}

function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  return <article className={`post-card${featured ? " post-featured" : ""}`}>
    <a className="post-card-link" href={postHref(post.slug)}>
      <PostArt post={post} />
      <div className="post-card-copy">
        {featured && <span className="eyebrow">A GOOD PLACE TO START</span>}
        <PostMeta post={post} />
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
        <span className="post-read-link">Read the story <Icon name="arrow" size={18} /></span>
      </div>
    </a>
  </article>;
}

export function Blog() {
  const [category, setCategory] = useState("All notes");
  const categories = ["All notes", "Philosophy", "Design", "Development"];
  const visible = blogPosts.filter((post) => category === "All notes" || post.category === category);
  const [featured, ...rest] = visible;

  return <div className="blog-page container">
    <header className="blog-heading">
      <span className="eyebrow">THE TAKENOTES JOURNAL</span>
      <h1>A few words<br />from the <em>margins.</em></h1>
      <p>On thoughtful tools, files that stay yours,<br className="desktop-break" /> and making a little more room to think.</p>
      <span className="blog-heading-doodle" aria-hidden="true">✳</span>
    </header>
    <div className="blog-index-bar">
      <div className="blog-filters" role="group" aria-label="Filter articles by category">
        {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <span className="blog-count" role="status">{visible.length} {visible.length === 1 ? "story" : "stories"}</span>
    </div>
    {featured && <PostCard post={featured} featured />}
    {rest.length > 0 && <div className="blog-grid">{rest.map((post) => <PostCard key={post.slug} post={post} />)}</div>}
    <aside className="journal-note"><Icon name="file" size={24} /><div><h2>Built in the open. Written along the way.</h2><p>These are project notes, not release announcements. For build availability and the latest changes, follow the repository.</p></div><a className="text-link" href={site.repository}>Follow along <Icon name="arrowUp" size={17} /></a></aside>
  </div>;
}

export function BlogArticle({ post }: { post: BlogPost }) {
  const nextPost = blogPosts[(blogPosts.indexOf(post) + 1) % blogPosts.length];
  return <div className="article-page container">
    <a className="text-link article-back" href="#/blog"><span aria-hidden="true">←</span> All stories</a>
    <article>
      <header className="article-heading"><PostMeta post={post} /><h1>{post.title}</h1><p>{post.excerpt}</p><div className="article-byline"><img src="/takenotes-symbol-violet.svg" alt="" width="32" height="32" /><span>From the takenotes project<span>Ideas, design notes, and work in progress.</span></span></div></header>
      <div className="article-layout">
        <aside className="article-toc"><nav aria-label="In this article"><span className="eyebrow">ON THIS PAGE</span>{post.sections.map((section, index) => <a key={section.heading} href={`${postHref(post.slug)}?section=${index + 1}`}>{section.heading}</a>)}</nav></aside>
        <div className="article-body">{post.sections.map((section, index) => <section key={section.heading} aria-labelledby={`article-heading-${index + 1}`}>
          <h2 id={`article-section-${index + 1}`} tabIndex={-1}><span id={`article-heading-${index + 1}`}>{section.heading}</span></h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.takeaway && <blockquote><p>{section.takeaway}</p></blockquote>}
        </section>)}<div className="article-end"><span aria-hidden="true">✳</span><p>A little less noise. A little more room for your own ideas.</p><a className="text-link" href="#download">Explore takenotes <Icon name="arrow" size={17} /></a></div></div>
      </div>
    </article>
    {nextPost && <aside className="article-next"><span className="eyebrow">ANOTHER THOUGHT TO TAKE WITH YOU</span><a href={postHref(nextPost.slug)}><h2>{nextPost.title}</h2><Icon name="arrow" size={28} /></a></aside>}
  </div>;
}

export function BlogNotFound() {
  return <section className="blog-not-found container"><span className="eyebrow">A PAGE OUT OF PLACE</span><h1>This story isn’t<br />in the <em>notebook.</em></h1><p>The link may be incomplete, or the story may have moved.</p><a className="button button-dark" href="#/blog">Back to the journal <Icon name="arrow" size={17} /></a></section>;
}
