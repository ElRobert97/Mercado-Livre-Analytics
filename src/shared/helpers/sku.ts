export function normalizeSku(sku: string): string {
  const trimmed = sku.trim();
  if (/^\d+$/.test(trimmed)) {
    const skuNum = parseInt(trimmed, 10);
    if (skuNum < 10000) {
      return "0" + skuNum.toString();
    }
  }
  return trimmed;
}
