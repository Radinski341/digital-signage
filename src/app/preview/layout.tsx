export const metadata = {
  title: "Private draft preview",
  robots: { index: false, follow: false },
};
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
