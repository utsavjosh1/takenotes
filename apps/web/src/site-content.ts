import { version } from "../../../package.json";

export const site = {
  version,
  repository: "https://github.com/utsavjosh1/takenotes",
  releases: "https://github.com/utsavjosh1/takenotes/releases",
  issues: "https://github.com/utsavjosh1/takenotes/issues",
};

export const navigation = [
  { label: "The little details", href: "#features" },
  { label: "How it works", href: "#workflow" },
  { label: "What's next", href: "#roadmap" },
  { label: "FAQs", href: "#faq" },
  { label: "Journal", href: "#/blog" },
];

export const questions = [
  { question: "What makes takenotes different?", answer: "Your notebook is a folder, not a proprietary database. takenotes puts a focused writing interface around ordinary Markdown files, with Windows and WSL workflows in mind. You can still open, back up, or edit your notes with other tools." },
  { question: "Where do my notes live?", answer: "In the workspace folder you choose on your computer, or in a Linux folder reached through WSL. The desktop notebook is local-first. This website's interactive preview uses sample notes held only in memory; it doesn't access your filesystem or save what you type." },
  { question: "Is it ready for everyday use?", answer: "Not yet. takenotes is in foundation / pre-release development. Early builds are unsigned, and the Windows-to-WSL runtime still needs real Windows 11 + WSL2 validation. Back up your notes and use a test workspace when exploring early builds." },
  { question: "Which platforms are supported?", answer: "The target is Windows 11 x64 with WSL2 and Ubuntu 22.04 or 24.04 x64. macOS, native Linux desktop, ARM, WSL1, and other distributions are not currently claimed as supported. A browser host is part of the longer-term direction." },
  { question: "Does it include tasks, calendars, or cloud sync?", answer: "You can write Markdown checkboxes today. Rich task views, Daily Notes, Today, event calendars, and Collections are part of the planned productivity layer, not shipping promises. There is no managed cloud-sync service. You control your files and your backup strategy." },
  { question: "Can I contribute?", answer: "Absolutely. The project is open source under the MIT license. Explore the code, report a reproducible issue, or help validate early builds on Windows 11 and WSL2. The repository's contribution guide is the best place to start." },
];

export type DemoNote = { id: string; title: string; folder: string; body: string };

// Illustrative content only. Nothing in this demo is a user's real workspace.
export const sampleNotes: readonly DemoNote[] = [
  { id: "welcome", title: "A place to begin", folder: "Notebook", body: "# A little space for big ideas.\n\nSome thoughts need a place to land. Not a new system to learn. Not another tab to keep open. Just a quiet page, and a little room to think.\n\n## Make yourself at home\n\n- Collect the ideas you don't want to lose\n- Turn a messy thought into something clear\n- Keep your notes somewhere you can always find them\n\n> Your words. Your files. Your own little corner of the internet.\n\n## A small reminder\n\nYou don't have to organize everything today. Start with one note." },
  { id: "project", title: "The next small thing", folder: "Projects", body: "# The next small thing\n\nGood projects start with a question, not a perfect plan.\n\n## What are we making?\n\nA calmer place to collect ideas. Something small, useful, and a pleasure to return to.\n\n## This week's focus\n\n- Listen to the people who will use it\n- Sketch the simplest possible version\n- Write down what we learn\n\n> Make a little progress. Leave a good note for tomorrow." },
  { id: "reading", title: "Notes from the margins", folder: "Reading", body: "# Notes from the margins\n\nA few things worth keeping from a slow Sunday with a good book.\n\n## An idea to sit with\n\nPay attention to what makes you curious. A notebook isn't a filing cabinet for perfect thoughts; it's a workshop for unfinished ones.\n\n- Write in your own words\n- Connect an idea to something you already know\n- Leave a question for your future self\n\n> A useful note is a conversation with tomorrow." },
];
