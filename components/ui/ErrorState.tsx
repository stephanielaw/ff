interface ErrorStateProps {
  message?: string;
  fullScreen?: boolean;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  fullScreen = false,
  onRetry,
}: ErrorStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-14 h-14 rounded-xl bg-danger-surface flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-danger"
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
      <p className="text-text-secondary text-sm leading-relaxed max-w-xs">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-medium min-h-[44px]"
        >
          Try again
        </button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}

export function OfflineState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-xl bg-warning-surface flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M6.343 17.657a9 9 0 010-12.728M9.172 14.828a5 5 0 010-7.072"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Unable to connect
        </h2>
        <p className="text-text-secondary text-sm">
          Please check your internet connection and refresh.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full py-3 bg-primary text-white rounded-xl font-medium min-h-[44px]"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
