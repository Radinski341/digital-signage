"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark" aria-hidden="true">
          ◈
        </div>
        <h1 className="mt-6">Welcome to your workspace</h1>
        <p>Sign in to manage your restaurant website and displays.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await signIn("credentials", {
                redirect: false,
                email,
                password,
              });
              if (response?.ok) {
                router.push("/admin");
                router.refresh();
              } else
                setError(
                  "Unable to sign in. Check your credentials or try again later.",
                );
            } catch {
              setError("Sign-in is temporarily unavailable. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="email">
            Email address
            <input
              id="email"
              className="admin-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              className="admin-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div role="alert" className="admin-error">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
