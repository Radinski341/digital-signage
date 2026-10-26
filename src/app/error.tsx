"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup-message">
      <h1>Something went wrong</h1>
      <p>Please try again in a moment.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
