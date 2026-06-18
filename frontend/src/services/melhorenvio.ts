// Melhor Envio Integration & Production Simulation Service

export interface MelhorEnvioLabel {
  id: string;
  protocol: string;
  service_id: number;
  contract: string | null;
  service_code: string | null;
  quote: number;
  price: number;
  coupon: string | null;
  discount: number;
  delivery_min: number;
  delivery_max: number;
  status: "released" | "posted" | "delivered" | "undelivered" | "suspended" | string;
  reminder: string | null;
  insurance_value: number;
  weight: number | null;
  width: number | null;
  height: number | null;
  length: number | null;
  diameter: number | null;
  format: string;
  billed_weight: number;
  receipt: boolean;
  own_hand: boolean;
  collect: boolean;
  collect_scheduled_at: string | null;
  reverse: boolean;
  non_commercial: boolean;
  authorization_code: string;
  tracking: string;
  self_tracking: string;
  delivery_receipt: string | null;
  additional_info: string | null;
  cte_key: string | null;
  paid_at: string;
  generated_at: string;
  posted_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  suspended_at: string | null;
  expired_at: string | null;
  created_at: string; // Used to aggregate spend chart
  updated_at: string;
  details: {
    balance: number;
    gateway: string;
    discount: string;
    subtotal: string;
    total: string;
  };
  receipt_code: string | null;
  from: {
    name: string;
    phone: string;
    email: string;
    document: string;
    company_document: string;
    state_register: string;
    postal_code: string;
    address: string;
    location_number: string;
    complement: string;
    district: string;
    city: string;
    state_abbr: string;
    country_id: string;
    latitude: number | null;
    longitude: number | null;
    note: string;
  };
  to: {
    name: string;
    phone: string;
    email: string;
    document: string;
    company_document: string;
    state_register: string;
    postal_code: string;
    address: string;
    location_number: string;
    complement: string;
    district: string;
    city: string;
    state_abbr: string;
    country_id: string;
    latitude: number | null;
    longitude: number | null;
    note: string;
  };
  service: {
    id: number;
    name: string;
    type: string;
    range: string;
    company: {
      id: number;
      name: string;
      picture: string;
    };
  };
  agency: {
    id: number;
    name: string;
    initials: string;
    code: string;
    company_name: string;
    address: string | null;
    phone: string | null;
    contact: string | null;
  };
  invoice: {
    model: string;
    number: string;
    serie: string;
    key: string;
    value: number | null;
    cfop: string | null;
    issued_at: string;
    uploaded_at: string | null;
    to_document: string | null;
  };
  tags: any[];
  products: Array<{
    name: string;
    quantity: number;
    unitary_value: number;
    weight: number | null;
  }>;
  generated_key: string | null;
  conciliation: string | null;
  volumes: Array<{
    id: number;
    height: string;
    width: string;
    length: string;
    diameter: string;
    weight: string;
    format: string;
    created_at: string;
    updated_at: string;
  }>;
}

export interface QuoteRequest {
  fromPostalCode: string;
  toPostalCode: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insuranceValue?: number;
}

export interface QuoteResponse {
  id: number;
  name: string;
  price: number;
  custom_price: number;
  discount: number;
  delivery_time: number;
  error?: string;
  company: {
    id: number;
    name: string;
    picture: string;
  };
}

const MELHOR_ENVIO_TOKEN_KEY = "meli_analytics_me_token";
const MELHOR_ENVIO_CONNECTED_KEY = "meli_analytics_me_connected";
const MELHOR_ENVIO_SIMULATOR_LABELS_KEY = "meli_analytics_me_labels";

// Get user connection token / configuration
export function getMEToken(): string | null {
  return localStorage.getItem(MELHOR_ENVIO_TOKEN_KEY);
}

export function isMEConnected(): boolean {
  return localStorage.getItem(MELHOR_ENVIO_CONNECTED_KEY) === "true";
}

export function connectME(token: string) {
  localStorage.setItem(MELHOR_ENVIO_TOKEN_KEY, token);
  localStorage.setItem(MELHOR_ENVIO_CONNECTED_KEY, "true");
}

export function disconnectME() {
  localStorage.removeItem(MELHOR_ENVIO_TOKEN_KEY);
  localStorage.removeItem(MELHOR_ENVIO_CONNECTED_KEY);
}

// Exactly 5 labels matching the different requested statuses: released, posted, delivered, undelivered, suspended.
// Following the exact 200 response json shape provided by the user.
export const DEFAULT_MOCK_LABELS: MelhorEnvioLabel[] = [
  {
    id: "04c13ada-68e6-41df-a2c6-ff5f3e7560f8",
    protocol: "ORD-20260395512",
    service_id: 3,
    contract: null,
    service_code: null,
    quote: 25.35,
    price: 25.35,
    coupon: null,
    discount: 5.71,
    delivery_min: 5,
    delivery_max: 6,
    status: "released",
    reminder: null,
    insurance_value: 50,
    weight: null,
    width: null,
    height: null,
    length: null,
    diameter: null,
    format: "box",
    billed_weight: 3.5,
    receipt: false,
    own_hand: false,
    collect: false,
    collect_scheduled_at: null,
    reverse: false,
    non_commercial: false,
    authorization_code: "2022032921",
    tracking: "ME220021P41BR",
    self_tracking: "ME220021P41BR",
    delivery_receipt: null,
    additional_info: null,
    cte_key: null,
    paid_at: "2026-06-11 21:17:26",
    generated_at: "2026-06-11 21:38:30",
    posted_at: null,
    delivered_at: null,
    canceled_at: null,
    suspended_at: null,
    expired_at: null,
    created_at: "2026-06-11 20:24:17", // Matches timeline
    updated_at: "2026-06-11 21:38:30",
    details: {
      balance: 0,
      gateway: "25.35",
      discount: "0.00",
      subtotal: "25.35",
      total: "25.35"
    },
    receipt_code: null,
    from: {
      name: "Teste ME",
      phone: "5598105050",
      email: "melhorenvio@teste.com",
      document: "16571478358",
      company_document: "04517623000197",
      state_register: "563025255115",
      postal_code: "7110000",
      address: "Rua Teste",
      location_number: "100",
      complement: "CASA",
      district: "Bairro Teste",
      city: "Guarulhos",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: "observação"
    },
    to: {
      name: "Melhor Envio Teste",
      phone: "1999999999",
      email: "melhorenvio@teste.com",
      document: "73646548010",
      company_document: "89794131000100",
      state_register: "123456",
      postal_code: "26210000",
      address: "Avenida Marechal Floriano Peixoto",
      location_number: "123",
      complement: "Ap 2",
      district: "Centro",
      city: "Nova Iguacu",
      state_abbr: "RJ",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: "observação"
    },
    service: {
      id: 3,
      name: ".Package",
      type: "normal",
      range: "interstate",
      company: {
        id: 2,
        name: "Jadlog",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Jadlog"
      }
    },
    agency: {
      id: 24,
      name: "CO SANTO ANDRE 01",
      initials: "CO-QSE-01",
      code: "1008367",
      company_name: "ABC SPEEDY WAY TURISMO E TRANSPORTES LTDA",
      address: null,
      phone: null,
      contact: null
    },
    invoice: {
      model: "55",
      number: "9248",
      serie: "1",
      key: "31190307586261000184550010000092481404848162",
      value: null,
      cfop: null,
      issued_at: "2019-03-01 00:00:00",
      uploaded_at: null,
      to_document: null
    },
    tags: [],
    products: [
      {
        name: "Papel adesivo para etiquetas 1",
        quantity: 3,
        unitary_value: 100,
        weight: null
      }
    ],
    generated_key: null,
    conciliation: null,
    volumes: [
      {
        id: 99763,
        height: "10.00",
        width: "15.00",
        length: "20.00",
        diameter: "0.00",
        weight: "3.50",
        format: "box",
        created_at: "2022-03-29 20:24:17",
        updated_at: "2022-03-29 20:24:17"
      }
    ]
  },
  {
    id: "25b90f4e-289e-4ba9-9dc2-7cbf57e934fb",
    protocol: "ORD-20261159302",
    service_id: 1,
    contract: null,
    service_code: null,
    quote: 18.90,
    price: 18.90,
    coupon: null,
    discount: 2.00,
    delivery_min: 2,
    delivery_max: 4,
    status: "posted",
    reminder: null,
    insurance_value: 100,
    weight: null,
    width: null,
    height: null,
    length: null,
    diameter: null,
    format: "box",
    billed_weight: 1.2,
    receipt: true,
    own_hand: false,
    collect: false,
    collect_scheduled_at: null,
    reverse: false,
    non_commercial: true,
    authorization_code: "2026040112",
    tracking: "ME260012A34BR",
    self_tracking: "ME260012A34BR",
    delivery_receipt: null,
    additional_info: null,
    cte_key: null,
    paid_at: "2026-06-12 10:15:00",
    generated_at: "2026-06-12 11:00:00",
    posted_at: "2026-06-12 14:30:00",
    delivered_at: null,
    canceled_at: null,
    suspended_at: null,
    expired_at: null,
    created_at: "2026-06-12 09:12:45",
    updated_at: "2026-06-12 14:30:00",
    details: {
      balance: 0,
      gateway: "18.90",
      discount: "0.00",
      subtotal: "18.90",
      total: "18.90"
    },
    receipt_code: null,
    from: {
      name: "Teste ME",
      phone: "5598105050",
      email: "melhorenvio@teste.com",
      document: "16571478358",
      company_document: "04517623000197",
      state_register: "563025255115",
      postal_code: "7110000",
      address: "Rua Teste",
      location_number: "100",
      complement: "CASA",
      district: "Bairro Teste",
      city: "Guarulhos",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    to: {
      name: "Destinatario Posted",
      phone: "11988887777",
      email: "posted@teste.com",
      document: "12345678909",
      company_document: "",
      state_register: "",
      postal_code: "01311000",
      address: "Avenida Paulista",
      location_number: "1000",
      complement: "",
      district: "Bela Vista",
      city: "São Paulo",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    service: {
      id: 1,
      name: "SEDEX",
      type: "express",
      range: "state",
      company: {
        id: 1,
        name: "Correios",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Correios"
      }
    },
    agency: {
      id: 1,
      name: "AGF PAULISTA",
      initials: "AGF-P",
      code: "123456",
      company_name: "CORREIOS BRASIL S/A",
      address: null,
      phone: null,
      contact: null
    },
    invoice: {
      model: "55",
      number: "1122",
      serie: "1",
      key: "35230612345678000199550010000011221404848162",
      value: null,
      cfop: null,
      issued_at: "",
      uploaded_at: null,
      to_document: null
    },
    tags: [],
    products: [],
    generated_key: null,
    conciliation: null,
    volumes: []
  },
  {
    id: "a39fb10d-27bf-4e9b-8bc3-3b1029da12f8",
    protocol: "ORD-20261159303",
    service_id: 2,
    contract: null,
    service_code: null,
    quote: 14.50,
    price: 14.50,
    coupon: null,
    discount: 1.50,
    delivery_min: 4,
    delivery_max: 8,
    status: "delivered",
    reminder: null,
    insurance_value: 80,
    weight: null,
    width: null,
    height: null,
    length: null,
    diameter: null,
    format: "box",
    billed_weight: 0.8,
    receipt: false,
    own_hand: false,
    collect: false,
    collect_scheduled_at: null,
    reverse: false,
    non_commercial: true,
    authorization_code: "2026040113",
    tracking: "ME260012A35BR",
    self_tracking: "ME260012A35BR",
    delivery_receipt: null,
    additional_info: null,
    cte_key: null,
    paid_at: "2026-06-13 08:00:00",
    generated_at: "2026-06-13 08:30:00",
    posted_at: "2026-06-13 11:30:00",
    delivered_at: "2026-06-16 15:20:00",
    canceled_at: null,
    suspended_at: null,
    expired_at: null,
    created_at: "2026-06-13 07:44:11",
    updated_at: "2026-06-16 15:20:00",
    details: {
      balance: 0,
      gateway: "14.50",
      discount: "0.00",
      subtotal: "14.50",
      total: "14.50"
    },
    receipt_code: null,
    from: {
      name: "Teste ME",
      phone: "5598105050",
      email: "melhorenvio@teste.com",
      document: "16571478358",
      company_document: "04517623000197",
      state_register: "563025255115",
      postal_code: "7110000",
      address: "Rua Teste",
      location_number: "100",
      complement: "CASA",
      district: "Bairro Teste",
      city: "Guarulhos",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    to: {
      name: "Destinatario Delivered",
      phone: "31977776666",
      email: "delivered@teste.com",
      document: "98765432109",
      company_document: "",
      state_register: "",
      postal_code: "30140010",
      address: "Avenida João Pinheiro",
      location_number: "50",
      complement: "Apto 302",
      district: "Centro",
      city: "Belo Horizonte",
      state_abbr: "MG",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    service: {
      id: 2,
      name: "PAC",
      type: "normal",
      range: "interstate",
      company: {
        id: 1,
        name: "Correios",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Correios"
      }
    },
    agency: {
      id: 1,
      name: "AGF PAULISTA",
      initials: "AGF-P",
      code: "123456",
      company_name: "CORREIOS BRASIL S/A",
      address: null,
      phone: null,
      contact: null
    },
    invoice: {
      model: "55",
      number: "1123",
      serie: "1",
      key: "35230612345678000199550010000011231404848162",
      value: null,
      cfop: null,
      issued_at: "",
      uploaded_at: null,
      to_document: null
    },
    tags: [],
    products: [],
    generated_key: null,
    conciliation: null,
    volumes: []
  },
  {
    id: "f82b7c6a-49bf-481e-9df2-51cba3e12019",
    protocol: "ORD-20261159304",
    service_id: 3,
    contract: null,
    service_code: null,
    quote: 31.25,
    price: 31.25,
    coupon: null,
    discount: 3.50,
    delivery_min: 5,
    delivery_max: 7,
    status: "undelivered",
    reminder: null,
    insurance_value: 200,
    weight: null,
    width: null,
    height: null,
    length: null,
    diameter: null,
    format: "box",
    billed_weight: 4.2,
    receipt: false,
    own_hand: false,
    collect: false,
    collect_scheduled_at: null,
    reverse: false,
    non_commercial: false,
    authorization_code: "2026040114",
    tracking: "ME260012A36BR",
    self_tracking: "ME260012A36BR",
    delivery_receipt: null,
    additional_info: null,
    cte_key: null,
    paid_at: "2026-06-14 09:00:00",
    generated_at: "2026-06-14 09:30:00",
    posted_at: "2026-06-14 13:30:00",
    delivered_at: null,
    canceled_at: null,
    suspended_at: null,
    expired_at: null,
    created_at: "2026-06-14 08:31:00",
    updated_at: "2026-06-15 16:30:00",
    details: {
      balance: 0,
      gateway: "31.25",
      discount: "0.00",
      subtotal: "31.25",
      total: "31.25"
    },
    receipt_code: null,
    from: {
      name: "Teste ME",
      phone: "5598105050",
      email: "melhorenvio@teste.com",
      document: "16571478358",
      company_document: "04517623000197",
      state_register: "563025255115",
      postal_code: "7110000",
      address: "Rua Teste",
      location_number: "100",
      complement: "CASA",
      district: "Bairro Teste",
      city: "Guarulhos",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    to: {
      name: "Destinatario Undelivered",
      phone: "51988884444",
      email: "undelivered@teste.com",
      document: "11122233344",
      company_document: "",
      state_register: "",
      postal_code: "90010001",
      address: "Rua dos Andradas",
      location_number: "200",
      complement: "Apto 502",
      district: "Centro Histórico",
      city: "Porto Alegre",
      state_abbr: "RS",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    service: {
      id: 3,
      name: ".Package",
      type: "normal",
      range: "interstate",
      company: {
        id: 2,
        name: "Jadlog",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Jadlog"
      }
    },
    agency: {
      id: 24,
      name: "CO PORTO ALEGRE",
      initials: "CO-POA",
      code: "100855",
      company_name: "SUL TRANSPORTES S/A",
      address: null,
      phone: null,
      contact: null
    },
    invoice: {
      model: "55",
      number: "1124",
      serie: "1",
      key: "35230612345678000199550010000011241404848162",
      value: null,
      cfop: null,
      issued_at: "",
      uploaded_at: null,
      to_document: null
    },
    tags: [],
    products: [],
    generated_key: null,
    conciliation: null,
    volumes: []
  },
  {
    id: "3c91af23-4b92-498c-ad2b-102bc3daef56",
    protocol: "ORD-20261159305",
    service_id: 4,
    contract: null,
    service_code: null,
    quote: 42.50,
    price: 42.50,
    coupon: null,
    discount: 5.00,
    delivery_min: 1,
    delivery_max: 3,
    status: "suspended",
    reminder: null,
    insurance_value: 300,
    weight: null,
    width: null,
    height: null,
    length: null,
    diameter: null,
    format: "box",
    billed_weight: 5.5,
    receipt: true,
    own_hand: true,
    collect: false,
    collect_scheduled_at: null,
    reverse: false,
    non_commercial: false,
    authorization_code: "2026040115",
    tracking: "ME260012A37BR",
    self_tracking: "ME260012A37BR",
    delivery_receipt: null,
    additional_info: null,
    cte_key: null,
    paid_at: "2026-06-15 08:30:00",
    generated_at: "2026-06-15 09:00:00",
    posted_at: null,
    delivered_at: null,
    canceled_at: null,
    suspended_at: "2026-06-15 15:00:00",
    expired_at: null,
    created_at: "2026-06-15 08:00:00",
    updated_at: "2026-06-15 15:00:00",
    details: {
      balance: 0,
      gateway: "42.50",
      discount: "0.00",
      subtotal: "42.50",
      total: "42.50"
    },
    receipt_code: null,
    from: {
      name: "Teste ME",
      phone: "5598105050",
      email: "melhorenvio@teste.com",
      document: "16571478358",
      company_document: "04517623000197",
      state_register: "563025255115",
      postal_code: "7110000",
      address: "Rua Teste",
      location_number: "100",
      complement: "CASA",
      district: "Bairro Teste",
      city: "Guarulhos",
      state_abbr: "SP",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    to: {
      name: "Destinatario Suspended",
      phone: "41999992222",
      email: "suspended@teste.com",
      document: "22233344455",
      company_document: "",
      state_register: "",
      postal_code: "80010010",
      address: "Rua XV de Novembro",
      location_number: "500",
      complement: "",
      district: "Centro",
      city: "Curitiba",
      state_abbr: "PR",
      country_id: "BR",
      latitude: null,
      longitude: null,
      note: ""
    },
    service: {
      id: 4,
      name: "Azul Cargo Express",
      type: "express",
      range: "interstate",
      company: {
        id: 3,
        name: "Azul Cargo",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Azul"
      }
    },
    agency: {
      id: 3,
      name: "CO CURITIBA AIRPORT",
      initials: "CO-CWB",
      code: "100899",
      company_name: "AZUL LINHAS AEREAS S/A",
      address: null,
      phone: null,
      contact: null
    },
    invoice: {
      model: "55",
      number: "1125",
      serie: "1",
      key: "35230612345678000199550010000011251404848162",
      value: null,
      cfop: null,
      issued_at: "",
      uploaded_at: null,
      to_document: null
    },
    tags: [],
    products: [],
    generated_key: null,
    conciliation: null,
    volumes: []
  }
];

export function getMELabels(): MelhorEnvioLabel[] {
  const stored = localStorage.getItem(MELHOR_ENVIO_SIMULATOR_LABELS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(MELHOR_ENVIO_SIMULATOR_LABELS_KEY, JSON.stringify(DEFAULT_MOCK_LABELS));
  return DEFAULT_MOCK_LABELS;
}

export function saveMELabels(labels: MelhorEnvioLabel[]) {
  localStorage.setItem(MELHOR_ENVIO_SIMULATOR_LABELS_KEY, JSON.stringify(labels));
}

// Quote calculation simulation
export async function calculateMEQuote(req: QuoteRequest): Promise<QuoteResponse[]> {
  // Always active on connected states
  // We mock a realistic API call response matching the real providers active in Melhor Envio:
  // Correios SEDEX, Correios PAC, Jadlog .Package, Jadlog .Com, Azul Cargo Express
  
  const fromStateStr = req.fromPostalCode.substring(0, 2);
  const toStateStr = req.toPostalCode.substring(0, 2);
  const isInterstate = fromStateStr !== toStateStr;

  const baseFactor = req.weight * 3.5 + (req.width * req.height * req.length) / 6000;
  const interstateMarkup = isInterstate ? 15.0 : 5.0;

  return [
    {
      id: 1,
      name: "Correios SEDEX",
      price: Number((18.50 + baseFactor * 1.5 + interstateMarkup).toFixed(2)),
      custom_price: Number((15.90 + baseFactor * 1.5 + interstateMarkup).toFixed(2)),
      discount: 2.60,
      delivery_time: isInterstate ? 3 : 1,
      company: {
        id: 1,
        name: "Correios",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Correios"
      }
    },
    {
      id: 2,
      name: "Correios PAC",
      price: Number((12.00 + baseFactor * 1.1 + interstateMarkup * 0.7).toFixed(2)),
      custom_price: Number((10.50 + baseFactor * 1.1 + interstateMarkup * 0.7).toFixed(2)),
      discount: 1.50,
      delivery_time: isInterstate ? 7 : 4,
      company: {
        id: 1,
        name: "Correios",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Correios"
      }
    },
    {
      id: 3,
      name: "Jadlog .Package",
      price: Number((15.00 + baseFactor * 1.2 + interstateMarkup * 0.8).toFixed(2)),
      custom_price: Number((12.50 + baseFactor * 1.2 + interstateMarkup * 0.8).toFixed(2)),
      discount: 2.50,
      delivery_time: isInterstate ? 5 : 3,
      company: {
        id: 2,
        name: "Jadlog",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Jadlog"
      }
    },
    {
      id: 4,
      name: "Azul Cargo Express",
      price: Number((25.00 + baseFactor * 2.0 + interstateMarkup * 1.2).toFixed(2)),
      custom_price: Number((20.00 + baseFactor * 2.0 + interstateMarkup * 1.2).toFixed(2)),
      discount: 5.00,
      delivery_time: isInterstate ? 2 : 1,
      company: {
        id: 3,
        name: "Azul Cargo",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=Azul"
      }
    }
  ];
}
