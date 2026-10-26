import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup-message">
      <h1>Page not found</h1>
      <p>This page may have moved or is no longer published.</p>
      <Link href="/">Return home</Link>
    </main>
  );
}
