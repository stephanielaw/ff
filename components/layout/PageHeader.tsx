import Link from "next/link";

interface PageHeaderProps {
  title: string;
  backHref?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, backHref, action }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-card-bg border-b border-[rgba(255,255,255,0.08)] text-text-primary">
      <div className="flex items-center h-14 px-4 gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center justify-center w-9 h-9 -ml-1 rounded-xl hover:bg-elevated transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <h1 className="text-lg font-medium flex-1">{title}</h1>
        {action && <div>{action}</div>}
      </div>
    </header>
  );
}
