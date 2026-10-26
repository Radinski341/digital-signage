"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: "10vh 8vw" }}>
        <h1>Temporarily unavailable</h1>
        <p>Please try again in a moment.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
