export function localize<T extends { locale: string }>(
  values: T[],
  locale: string,
  fallback: string,
): T | undefined {
  return (
    values.find((t) => t.locale === locale) ??
    values.find((t) => t.locale === fallback)
  );
}
// Reuse formatter instances across catalog cards and scroll/search rerenders; prices are never cached.
const priceFormatters = new Map<string, Intl.NumberFormat>();
export function formatPrice(
  value: string | { toString(): string },
  currency: string,
  locale: string,
) {
  const key = `${locale}:${currency}`;
  let formatter = priceFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    if (priceFormatters.size >= 128)
      priceFormatters.delete(priceFormatters.keys().next().value!);
    priceFormatters.set(key, formatter);
  }
  return formatter.format(value.toString() as unknown as number);
}
