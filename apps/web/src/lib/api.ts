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

export type MenuCategory = {
  id: number;
  name_ar: string;
  name_en: string;
  emoji: string;
  is_active: boolean;
  product_count: number;
};

export type MenuProduct = {
  id: number;
  category_id: number;
  name_ar: string;
  name_en: string;
  emoji: string;
  price: number;
  is_available: boolean;
  sort: number;
  cost: number;
  margin: number;
  margin_pct: number;
  recipe_lines: number;
};

export type MenuData = {
  categories: MenuCategory[];
  products: MenuProduct[];
  summary: {
    product_count: number;
    category_count: number;
    without_recipe: number;
    avg_margin_pct: number;
  };
};

export type CategoryInput = {
  name_ar: string;
  name_en: string;
  emoji: string;
  is_active?: boolean;
};

export type ProductInput = {
  category_id: number;
  name_ar: string;
  name_en: string;
  emoji: string;
  price: number;
  is_available: boolean;
};

export type IngredientUnit = 'g' | 'ml' | 'pc';

export type Ingredient = {
  id: number;
  name_ar: string;
  name_en: string;
  unit: IngredientUnit;
  unit_cost: number;
  stock_qty: number;
  recipes_using: number;
};

export type IngredientsData = { ingredients: Ingredient[] };

export type IngredientInput = {
  name_ar: string;
  name_en: string;
  unit: IngredientUnit;
  unit_cost: number;
  stock_qty: number;
};

export type RecipeLineInput = { ingredient_id: number; qty: number };

export type RecipeIngredient = {
  ingredient_id: number;
  name_ar: string;
  name_en: string;
  unit: IngredientUnit;
  unit_cost: number;
  qty: number;
  line_cost: number;
};

export type RecipeData = {
  product: {
    id: number;
    category_id: number;
    name_ar: string;
    name_en: string;
    emoji: string;
    price: number;
    is_available: boolean;
  };
  lines: RecipeIngredient[];
  totals: {
    cost: number;
    price: number;
    margin: number;
    food_cost_pct: number;
  };
};

export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'new' | 'preparing' | 'served' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'wallet';

export type PosCatalog = {
  categories: MenuCategory[];
  products: MenuProduct[];
  tax_rate: number;
  table_count: number;
};

export type OrderItem = {
  id: number;
  product_id: number;
  name_ar: string;
  name_en: string;
  emoji: string;
  unit_price: number;
  qty: number;
  line_total: number;
};

export type Order = {
  id: number;
  number: string;
  channel: OrderChannel;
  table_no: number | null;
  customer_name: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  subtotal: number;
  tax: number;
  total: number;
  note: string;
  placed_at: string | null;
  item_count: number;
  items: OrderItem[];
};

export type OrdersData = { orders: Order[] };

export type OrderInput = {
  channel: OrderChannel;
  table_no?: number | null;
  customer_name?: string;
  payment_method: PaymentMethod | null;
  note?: string;
  items: { product_id: number; qty: number }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body?.detail) message = `${response.status}: ${String(body.detail)}`;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new Error(message);
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

  menu: () => request<MenuData>('/api/menu'),
  createCategory: (body: CategoryInput) =>
    request<MenuData>('/api/menu/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (id: number, body: Partial<CategoryInput>) =>
    request<MenuData>(`/api/menu/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCategory: (id: number) =>
    request<MenuData>(`/api/menu/categories/${id}`, { method: 'DELETE' }),
  createProduct: (body: ProductInput) =>
    request<MenuData>('/api/menu/products', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProduct: (id: number, body: Partial<ProductInput>) =>
    request<MenuData>(`/api/menu/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProduct: (id: number) =>
    request<MenuData>(`/api/menu/products/${id}`, { method: 'DELETE' }),

  recipe: (productId: number) =>
    request<RecipeData>(`/api/menu/products/${productId}/recipe`),
  saveRecipe: (productId: number, lines: RecipeLineInput[]) =>
    request<RecipeData>(`/api/menu/products/${productId}/recipe`, {
      method: 'PUT',
      body: JSON.stringify({ lines }),
    }),

  ingredients: () => request<IngredientsData>('/api/ingredients'),
  createIngredient: (body: IngredientInput) =>
    request<IngredientsData>('/api/ingredients', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateIngredient: (id: number, body: Partial<IngredientInput>) =>
    request<IngredientsData>(`/api/ingredients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteIngredient: (id: number) =>
    request<IngredientsData>(`/api/ingredients/${id}`, { method: 'DELETE' }),

  pos: () => request<PosCatalog>('/api/pos'),
  orders: () => request<OrdersData>('/api/orders'),
  createOrder: (body: OrderInput) =>
    request<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateOrder: (id: number, status: OrderStatus) =>
    request<Order>(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};
