/**
 * Helper to compute median of a list of numbers
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Helper to normalize Brazilian logistics names from Mercado Livre
 */
export function normalizeLogisticTypeName(logisticType: string | null | undefined, shippingMode: string | null | undefined): string {
  const typeKey = (logisticType || "").toLowerCase().trim();
  const modeKey = (shippingMode || "").toLowerCase().trim();

  if (typeKey === "fulfillment") return "Mercado Envios Full";
  if (typeKey === "cross_docking") return "Mercado Envios Coleta";
  if (typeKey === "drop_off") return "Mercado Envios Agência";
  if (typeKey === "xd_drop_off") return "Mercado Envios Agência";
  if (typeKey === "self_service" || typeKey === "flex") return "Mercado Envios Flex";
  if (typeKey === "custom") return "Personalizado";
  if (modeKey === "me2") return "Mercado Envios Coletivo";
  if (modeKey === "me1") return "Mercado Envios 1";
  if (modeKey === "custom") return "Personalizado";
  return "Retirada em Mãos / A Combinar";
}
