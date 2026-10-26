import { redirect } from "next/navigation";
export default async function PreviewRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id } = await params;
  const locale = (await searchParams).locale;
  redirect(
    `/preview/${encodeURIComponent(id)}${locale ? "?locale=" + encodeURIComponent(locale) : ""}`,
  );
}
