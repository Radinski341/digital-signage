import { PageHeader } from "@/components/admin/PageHeader";
import PasswordForm from "@/components/admin/PasswordForm";
export default function PasswordPage() {
  return (
    <>
      <PageHeader
        title="My password"
        description="Choose a unique password. Changing it signs out your existing sessions."
      />
      <PasswordForm />
    </>
  );
}
