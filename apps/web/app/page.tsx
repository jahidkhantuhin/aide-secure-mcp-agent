import { ApiStatus } from './status';
import { DemoButton } from './demo-button';
import { Button } from '@/components/ui/button';

const sections = [
  'Assistant',
  'Approvals',
  'Activity',
  'Trust',
  'Security Lab',
  'Settings',
];

export default function Home() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-[1440px] lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-[#32403a] bg-[#171f1c] px-6 py-7 lg:border-r lg:border-b-0">
        <a href="/" className="text-2xl font-semibold tracking-tight">
          Aide<span className="text-[#a7edbb]">.</span>
        </a>
        <nav
          aria-label="Workspace"
          className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:mt-10 lg:grid-cols-1"
        >
          {sections.map((section, index) =>
            index === 0 ? (
              <a
                key={section}
                href="/"
                aria-current="page"
                className="rounded-md bg-[#26392f] px-3 py-2 text-sm font-medium text-[#b6ecc5]"
              >
                {section}
              </a>
            ) : section === 'Trust' ||
              section === 'Approvals' ||
              section === 'Activity' ? (
              <a
                key={section}
                href={'/' + section.toLowerCase()}
                className="px-3 py-2 text-sm text-[#b6ecc5]"
              >
                {section}
              </a>
            ) : (
              <span
                key={section}
                aria-disabled="true"
                className="px-3 py-2 text-sm text-[#a3b2aa]"
              >
                {section}
              </span>
            ),
          )}
        </nav>
      </aside>
      <main className="px-6 py-7 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between gap-3 border-b border-[#32403a] pb-6">
          <p className="text-sm text-[#adbcb4]">Assistant</p>
          <ApiStatus />
        </header>
        <section className="max-w-4xl py-20 sm:py-28">
          <h1 className="max-w-3xl text-5xl leading-[1.04] font-semibold tracking-tight sm:text-7xl">
            Agents that ask{' '}
            <span className="text-[#a7edbb]">before they act.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#adbcb4]">
            A personal AI assistant for untrusted inboxes, with action previews
            and human approval.
          </p>
          <div className="mt-8 flex flex-wrap items-start gap-4">
            <DemoButton />
            <Button href="/login" variant="secondary">
              Owner sign in
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
