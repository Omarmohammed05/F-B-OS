export type SetupTask = {
  key: string;
  title_ar: string;
  title_en: string;
  summary_ar: string;
  summary_en: string;
  is_done: boolean;
};

export type SetupState = {
  completed: number;
  total: number;
  tasks: SetupTask[];
};

export type DashboardData = {
  tenant: {
    name_ar: string;
    name_en: string;
    accent_color: string;
    plan: string;
    currency: string;
    default_language: string;
  };
  metrics: {
    pending_orders: number;
    in_progress_orders: number;
    total_orders: number;
    available_tables: number;
    total_tables: number;
    sales_today: number;
    sales_change: number;
  };
  revenue: { day: string; amount: number }[];
  popular: {
    name_ar: string;
    name_en: string;
    emoji: string;
    orders: number;
    revenue: number;
  }[];
  activity: {
    number: string;
    item_ar: string;
    item_en: string;
    unit_price: number;
    table_name: string;
    qty: number;
    status: 'preparing' | 'served' | 'cancelled' | 'new';
    placed_at: string | null;
  }[];
  payments: { method_ar: string; method_en: string; amount: number }[];
  setup: SetupState;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  dashboard: () => request<DashboardData>('/api/dashboard'),
  setup: () => request<SetupState>('/api/setup'),
  updateSetup: (key: string, isDone: boolean) =>
    request<SetupState>(`/api/setup/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_done: isDone }),
    }),
};
