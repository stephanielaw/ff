export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-danger-surface mb-6">
          <svg
            className="w-8 h-8 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          Access Denied
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed">
          This is a private app. You are not authorised to access it.
        </p>
      </div>
    </div>
  );
}
