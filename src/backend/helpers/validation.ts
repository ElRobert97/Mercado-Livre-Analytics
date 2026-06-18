/**
 * Normalizes SKU by padding with exactly one '0' if it's a numeric code below 10000
 */
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

/**
 * Extracts the actual custom SKU (SELLER_SKU) from Mercado Livre item details/attributes
 */
export function extractMlSku(itRow: any, idx: number): string {
  if (!itRow || !itRow.item) return `SKU_${idx}`;

  // 1. Try seller_custom_field (standard field in ML Orders)
  if (itRow.item.seller_custom_field) {
    return normalizeSku(String(itRow.item.seller_custom_field)).toUpperCase();
  }

  // 2. Try seller_sku under the item object
  if (itRow.item.seller_sku) {
    return normalizeSku(String(itRow.item.seller_sku)).toUpperCase();
  }

  // 3. Search variation_attributes array
  const varAttrs = itRow.item.variation_attributes || [];
  const varSkuAttr = varAttrs.find((attr: any) => attr?.id === "SELLER_SKU" || attr?.id === "SKU" || attr?.name?.toUpperCase() === "SKU");
  if (varSkuAttr && varSkuAttr.value_name) {
    return normalizeSku(String(varSkuAttr.value_name)).toUpperCase();
  }

  // 4. Search item-level attributes array
  const attrs = itRow.item.attributes || [];
  const skuAttr = attrs.find((attr: any) => attr?.id === "SELLER_SKU" || attr?.id === "SKU" || attr?.name?.toUpperCase() === "SKU");
  if (skuAttr && skuAttr.value_name) {
    return normalizeSku(String(skuAttr.value_name)).toUpperCase();
  }

  // 5. Try root level seller_sku on order item
  if (itRow.seller_sku) {
    return normalizeSku(String(itRow.seller_sku)).toUpperCase();
  }

  // If no custom Merchant SKU is found anywhere, fallback to item.id (the MLB ID)
  return String(itRow.item.id || `SKU_${idx}`).trim().toUpperCase();
}

/**
 * Normalizes Brazilian State code or state name to its standard standard abbreviation (e.g. "São Paulo" -> "SP")
 */
export function normalizeStateCode(stateName: string | null | undefined): string {
  if (!stateName) return "";
  const name = stateName.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents like São Paulo -> sao paulo
  
  if (name === "sp" || name.includes("sao paulo")) return "SP";
  if (name === "rj" || name.includes("rio de janeiro")) return "RJ";
  if (name === "mg" || name.includes("minas gerais")) return "MG";
  if (name === "es" || name.includes("espirito santo")) return "ES";
  if (name === "pr" || name.includes("parana")) return "PR";
  if (name === "sc" || name.includes("santa catarina")) return "SC";
  if (name === "rs" || name.includes("rio grande do sul")) return "RS";
  if (name === "ms" || name.includes("mato grosso do sul")) return "MS";
  if (name === "mt" || name.includes("mato grosso")) return "MT";
  if (name === "go" || name.includes("goias")) return "GO";
  if (name === "df" || name.includes("distrito federal")) return "DF";
  if (name === "ba" || name.includes("bahia")) return "BA";
  if (name === "se" || name.includes("sergipe")) return "SE";
  if (name === "al" || name.includes("alagoas")) return "AL";
  if (name === "pe" || name.includes("pernambuco")) return "PE";
  if (name === "pb" || name.includes("paraiba")) return "PB";
  if (name === "rn" || name.includes("rio grande do norte")) return "RN";
  if (name === "ce" || name.includes("ceara")) return "CE";
  if (name === "pi" || name.includes("piaui")) return "PI";
  if (name === "ma" || name.includes("maranhao")) return "MA";
  if (name === "to" || name.includes("tocantins")) return "TO";
  if (name === "pa" || name.includes("para")) return "PA";
  if (name === "ap" || name.includes("amapa")) return "AP";
  if (name === "rr" || name.includes("roraima")) return "RR";
  if (name === "am" || name.includes("amazonas")) return "AM";
  if (name === "ac" || name.includes("acre")) return "AC";
  if (name === "ro" || name.includes("rondonia")) return "RO";

  // Handle upper-casing abbreviation if it was passed direct (e.g. "ba" -> "BA")
  if (name.length === 2) {
    return name.toUpperCase();
  }
  return stateName.trim();
}
