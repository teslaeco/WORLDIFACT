interface LoadingFallbackProps {
  message?: string
}

export default function LoadingFallback({ message = 'Loading WORLDIFACT…' }: LoadingFallbackProps) {
  return (
    <div className="loading-fallback" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}
