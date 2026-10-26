"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
export default function PasswordForm() {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-section max-w-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const data = new FormData(e.currentTarget);
        try {
          const response = await fetch("/api/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(data)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          toast.success(result.message);
          await signOut({ callbackUrl: "/admin/login" });
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Current password
        <input
          name="currentPassword"
          className="admin-input"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          name="newPassword"
          className="admin-input"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>
      <Button disabled={busy}>
        {busy ? "Changing…" : "Change password & sign out"}
      </Button>
    </form>
  );
}
