import SignageWorkbench from "@/components/admin/SignageWorkbench";
import { requireAccess } from "@/server/access";
import { adminContext } from "@/server/admin-context";
export default async function Page() {
  const access = await requireAccess();
  return (
    <SignageWorkbench kind="slides" context={await adminContext(access)} />
  );
}
