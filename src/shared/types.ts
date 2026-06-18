export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface MercadoLivreAccount {
  id: string;
  user_id: string;
  nickname: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string; // ISO date string
  ml_user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  ml_account_id: string;
  ml_order_id: string;
  status: string; // e.g. "confirmed", "paid", "cancelled", etc.
  order_date: string; // ISO date string
  total_amount: number;
  shipping_amount: number;
  discount_amount: number;
  marketplace_fee_amount: number;
  net_amount: number;
  pack_id?: string; // Optional field mapping to bundle package grouping
  shipping_city?: string;
  shipping_municipality?: string;
  shipping_state?: string;
  shipping_cost_detail?: number;
  ml_shipment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  cost_unitary_snapshot?: number;
  cost_total_snapshot?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductCost {
  id: string;
  user_id: string;
  sku: string;
  product_name: string;
  cost_unitary: number;
  currency: string;
  source_file_name: string;
  imported_at: string;
  created_at: string;
  updated_at: string;
}

export interface CostImportBatch {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  created_at: string;
}

export interface OrderFinancialSummary {
  id: string;
  order_id: string;
  revenue_gross: number;
  revenue_net: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number;
  updated_at: string;
  tax_factor?: number;
  tax_cost?: number;
  difal_factor?: number;
  difal_cost?: number;
}

export interface StateTaxFactor {
  id: string;
  state_code: string;
  tax_factor: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Full view response models representing calculated order results
export interface CalculatedOrder {
  id: string;
  ml_order_id: string;
  status: string;
  order_date: string;
  total_amount: number;
  shipping_amount: number;
  discount_amount: number;
  marketplace_fee_amount: number;
  net_amount: number;
  nickname: string; // From integration account
  items: Array<{
    sku: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    cost_unitary?: number;
    cost_total?: number;
  }>;
  financial_summary?: OrderFinancialSummary;
  cost_pending: boolean;
  pack_id?: string;
  shipping_city?: string;
  shipping_municipality?: string;
  shipping_state?: string;
  shipping_cost_detail?: number;
  ml_shipment_id?: string;
  created_at?: string;
}

export type TaxProfileSourceType = "report" | "median" | "manual_override";
export type TaxCalculationMode = "report_state_factor" | "fallback_median" | "manual_override";

export interface StateTaxProfile {
  state_code: string;
  icms_factor: number;
  difal_factor: number;
  total_factor: number;
  source_type: TaxProfileSourceType;
  active: boolean;
  valid_from?: string;
  valid_to?: string;
  notes?: string;
}

export interface OrderTaxSummary {
  order_id: string;
  shipping_state: string;
  tax_factor_applied: number;
  icms_estimated: number;
  difal_estimated: number;
  tax_cost_total: number;
  calculation_mode: TaxCalculationMode;
  rule_version: string;
  calculated_at: string;
}
