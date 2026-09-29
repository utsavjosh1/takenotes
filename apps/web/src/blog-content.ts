import type { IconName } from "./components/Icon";

export type BlogPost = {
  slug: string;
  category: "Philosophy" | "Design" | "Development";
  title: string;
  excerpt: string;
  icon: IconName;
  illustration: string;
  sections: readonly {
    heading: string;
    paragraphs: readonly string[];
    takeaway?: string;
  }[];
};

// Editorial project notes, not dated release announcements or shipping promises.
// Add articles here; listing cards and reading pages use the same source.
export const blogPosts: readonly BlogPost[] = [
  {
    slug: "your-notes-are-files",
    category: "Philosophy",
    title: "Your notes deserve a life outside an app.",
    excerpt: "Why takenotes starts with ordinary Markdown files—and why a good notebook should be easy to leave.",
    icon: "file",
    illustration: "words, not walls.",
    sections: [
      {
        heading: "A folder is a good beginning",
        paragraphs: [
          "A useful note might outlive the tool you wrote it in. A project ends, a computer changes, or a different editor fits your life better. The words should still be there, readable without an account, an export ritual, or a particular application.",
          "That is the starting point for takenotes: a workspace is a folder, and a note is an ordinary Markdown file. The interface helps you work with those files. It does not turn them into something only takenotes understands.",
        ],
      },
      {
        heading: "Plain text leaves doors open",
        paragraphs: [
          "Markdown gives a little structure to plain text. Headings, lists, links, and checkboxes remain understandable even when you open the file in a basic editor. You can keep a workspace in Git, search it with other tools, or move it to another folder.",
          "This does not mean every application interprets every Markdown extension identically. It means the important part—your writing—is accessible without reconstructing a proprietary format. Portability starts with keeping the source simple.",
        ],
        takeaway: "The application is a way into your notes. It should never be the only way out.",
      },
      {
        heading: "Ownership comes with practical choices",
        paragraphs: [
          "Local files are not automatically backed up. A folder on one drive can still be lost, and an external tool can still change a note while you are editing it. Keeping ownership means making those boundaries clear, not hiding them behind a comforting badge.",
          "Use a backup strategy you trust. With early takenotes builds, keep an additional copy and explore with a test workspace. Conflict-aware saving and draft recovery are parts of the foundation, but they are not a substitute for independent backups or real-device validation.",
        ],
      },
      {
        heading: "Less ceremony, more writing",
        paragraphs: [
          "You do not need a perfect folder hierarchy before writing your first note. Start with a thought worth keeping. Give it a useful name. Organize when a pattern becomes clear, rather than inventing a system before you know what it needs to hold.",
          "The goal is a tool that makes those small decisions easier, then gets out of the way. Your words should feel like yours from the first sentence to the day you choose a different tool.",
        ],
      },
    ],
  },
  {
    slug: "designing-a-quieter-notebook",
    category: "Design",
    title: "What makes a notebook feel quiet?",
    excerpt: "Warm paper, clear hierarchy, and a few deliberate constraints. Less noise is a design decision, not just a color palette.",
    icon: "heart",
    illustration: "a little breathing room.",
    sections: [
      {
        heading: "Give the words the best seat",
        paragraphs: [
          "A writing application has a simple responsibility: make it comfortable to return to the page. It is easy to lose that focus as features accumulate. Another panel, another badge, another permanent toolbar—each useful in isolation, but together they compete with the writing.",
          "Our design direction puts one uninterrupted editing surface at the center. Files and search stay close. Less frequent actions sit one step away in a menu or command palette. The interface should help you understand where you are without asking for attention every few seconds.",
        ],
      },
      {
        heading: "Warmth without decoration everywhere",
        paragraphs: [
          "The takenotes website starts with warm paper, dark ink, and a restrained violet accent. That palette is an invitation: this is somewhere for unfinished ideas, not just polished documents. Soft edges and generous spacing support the same feeling.",
          "A working notebook needs a more compact version of that identity. Large display headings and paper illustrations belong on a landing page, not beside every paragraph you type. Desktop rows need precision; mobile controls need room for a thumb. Consistency means shared character, not identical layouts.",
        ],
        takeaway: "Quiet does not mean invisible. The important things should be the easiest things to find.",
      },
      {
        heading: "Clarity is part of calm",
        paragraphs: [
          "Pale text and hidden buttons can make a screenshot look minimal while making the application harder to use. A clean interface still needs readable contrast, visible keyboard focus, and controls that work without hover. A saved note and an unsaved draft must look meaningfully different.",
          "The same applies to motion. A short theme transition can explain a change, but animation should never delay an action or be required to understand it. Reduced-motion preferences are a real part of the experience, not an exception to it.",
        ],
      },
      {
        heading: "A direction, not a finished promise",
        paragraphs: [
          "The interactive notebook on this website is a design concept. Its sample edits live in memory and disappear on refresh. The desktop application has its own implementation, and mobile remains a separate development effort.",
          "We are documenting the intended experience before pretending every surface is complete. The test is not whether they all produce matching screenshots. It is whether each helps someone find a note, understand its state, and keep writing with confidence.",
        ],
      },
    ],
  },
  {
    slug: "building-for-windows-and-wsl",
    category: "Development",
    title: "One writing space. Two sides of your computer.",
    excerpt: "A look at the Windows and WSL direction, the importance of workspace identity, and the evidence still needed.",
    icon: "terminal",
    illustration: "close to your files.",
    sections: [
      {
        heading: "Follow the files",
        paragraphs: [
          "For many Windows users, some work lives in Windows folders and some lives inside a Linux distribution through WSL. A note might sit beside a project in /home/you/projects, while another belongs with documents on the Windows side. A notebook should acknowledge those locations instead of pretending they are interchangeable.",
          "takenotes is Windows-first with WSL workflows in mind. The goal is a familiar writing space with explicit knowledge of the host that owns each workspace. The Windows desktop shell and the Linux-side file operations have different responsibilities.",
        ],
      },
      {
        heading: "Identity is not a cosmetic badge",
        paragraphs: [
          "A distribution name, Linux user, and workspace root matter to correctness. Two users may see the same path text but have different permissions and different files. Switching workspaces must not send a stale request or a pending save to the wrong host.",
          "That is why clear location details belong in the interface. A concise host label is useful while writing; full identity details should be available when connecting or diagnosing an error. A green dot alone cannot explain which filesystem an action will change.",
        ],
        takeaway: "Knowing where a note lives is part of knowing whether a save succeeded.",
      },
      {
        heading: "Keep the runtime close to the work",
        paragraphs: [
          "The architecture direction is to place host responsibilities near the files and keep the client focused on interaction. A first-class WSL runtime can make room for host-owned indexing and other long-lived work without making every feature a special case in the renderer.",
          "That direction also introduces real concerns: authenticated transport, runtime lifecycle, reconnection, and Windows-to-WSL networking. None of these disappear because a prototype can read a file. The boundaries need tests and the interface needs honest failure states.",
        ],
      },
      {
        heading: "What still needs proof",
        paragraphs: [
          "Real Windows 11 and WSL2 validation remains necessary. Logic tests on Linux do not prove Windows launch behavior, user switching, runtime installation, permissions, or recovery after a distribution stops.",
          "Early builds are pre-release and unsigned. If you explore them, back up your notes and use a test workspace. Reproducible reports—with OS, distribution, selected user, and steps without credentials—are more valuable than broad claims that a platform works.",
        ],
      },
    ],
  },
];

export function findPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function readingMinutes(post: BlogPost): number {
  const text = post.sections.flatMap((section) => [section.heading, ...section.paragraphs, section.takeaway ?? ""]).join(" ");
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
}
