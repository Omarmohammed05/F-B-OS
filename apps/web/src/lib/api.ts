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

export type Branch = {
  id: number;
  name_ar: string;
  name_en: string;
  address: string;
  phone: string;
  is_active: boolean;
};

export type BranchesData = { branches: Branch[]; active_id: number };

export type BranchInput = {
  name_ar: string;
  name_en: string;
  address?: string;
  phone?: string;
};

export type DashboardData = {
  branches: Branch[];
  active_id: number;
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

export type NotificationItem = {
  key: string;
  href: string;
  count: number;
  title_ar: string;
  title_en: string;
};

export type NotificationsData = {
  count: number;
  items: NotificationItem[];
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
  /** Absent for a cashier or kitchen: the API trims money by role. */
  cost?: number;
  margin?: number;
  margin_pct?: number;
  recipe_lines: number;
};

export type MenuData = {
  categories: MenuCategory[];
  products: MenuProduct[];
  summary: {
    product_count: number;
    category_count: number;
    without_recipe: number;
    avg_margin_pct?: number;
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
  /** Absent for a cashier or kitchen: the API trims money by role. */
  unit_cost?: number;
  stock_qty: number;
  par_level: number;
  is_low: boolean;
  recipes_using: number;
  has_movements: boolean;
};

export type StockMovement = {
  id: number;
  ingredient_id: number;
  name_ar: string;
  name_en: string;
  unit: string;
  delta: number;
  reason: 'sale' | 'purchase' | 'waste' | 'adjustment';
  order_id: number;
  note: string;
  created_at: string | null;
};

export type IngredientsData = {
  ingredients: Ingredient[];
  movements: StockMovement[];
};

export type IngredientInput = {
  name_ar: string;
  name_en: string;
  unit: IngredientUnit;
  unit_cost: number;
  stock_qty: number;
  par_level: number;
};

export type StockMoveInput = {
  qty: number;
  reason: 'purchase' | 'waste';
  note?: string;
};

export type RecipeLineInput = { ingredient_id: number; qty: number };

export type RecipeIngredient = {
  ingredient_id: number;
  name_ar: string;
  name_en: string;
  unit: IngredientUnit;
  /** Absent for a cashier or kitchen: the API trims money by role. */
  unit_cost?: number;
  qty: number;
  line_cost?: number;
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
  /** `price` only, for a role that may not see cost. */
  totals: {
    cost?: number;
    price: number;
    margin?: number;
    food_cost_pct?: number;
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
  customer_id: number;
  customer_name: string;
  delivery_address: string;
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
  customer_id?: number;
  customer_name?: string;
  delivery_address?: string;
  payment_method: PaymentMethod | null;
  note?: string;
  items: { product_id: number; qty: number }[];
};

export type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string | null;
  visits: number;
  spend: number;
  last_visit: string | null;
};

export type CustomersData = {
  customers: Customer[];
  summary: { total: number; repeat: number; lifetime_spend: number };
};

export type CustomerInput = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export type CustomerDetail = { customer: Customer; orders: Order[] };

export type ReportPoint = {
  day: string;
  orders: number;
  revenue: number;
  /** Absent for a cashier or kitchen: the API trims money by role. */
  food_cost?: number;
};

export type ReportData = {
  days: number;
  start: string;
  series: ReportPoint[];
  totals: {
    orders: number;
    items: number;
    revenue: number;
    tax: number;
    total: number;
    /** The four cost figures are absent for a cashier or kitchen. */
    food_cost?: number;
    gross_margin?: number;
    gross_margin_pct?: number;
    food_cost_pct?: number;
    avg_ticket: number;
    cancelled_orders: number;
    cancelled_value: number;
  };
  top_products: {
    product_id: number;
    name_ar: string;
    name_en: string;
    emoji: string;
    qty: number;
    revenue: number;
  }[];
  channels: { channel: OrderChannel; orders: number; revenue: number }[];
  payments: { payment_method: PaymentMethod; orders: number; revenue: number }[];
};

export type StaffRole = 'admin' | 'owner' | 'manager' | 'cashier' | 'kitchen';

export type Restaurant = {
  id: number;
  name_ar: string;
  name_en: string;
};

export type RestaurantAdmin = {
  id: number;
  name: string;
  username: string;
};

/** One restaurant as the platform owner sees it: trade on one side, billing on the other. */
export type PlatformRestaurant = {
  id: number;
  name_ar: string;
  name_en: string;
  currency: string;
  software_price: number;
  is_blocked: boolean;
  is_deleted: boolean;
  admin: RestaurantAdmin | null;
  staff_count: number;
  sales_month: number;
  income_month: number;
  income_total: number;
};

export type RestaurantsData = {
  restaurants: PlatformRestaurant[];
  summary: {
    total: number;
    active: number;
    blocked: number;
    archived: number;
    monthly_price: number;
    income_month: number;
    income_total: number;
  };
  currency: string;
  month: string;
  owner_tenant_id: number;
};

export type RestaurantCreateInput = {
  name_ar: string;
  name_en: string;
  software_price: number;
  admin_name?: string;
  admin_username?: string;
  admin_password?: string;
};

export type RestaurantPatchInput = {
  name_ar?: string;
  name_en?: string;
  software_price?: number;
};

export type IncomeEntry = {
  id: number;
  restaurant_id: number;
  name_ar: string;
  name_en: string;
  amount: number;
  paid_on: string;
  note: string;
};

export type IncomeMonth = {
  month: string;
  total: number;
  count: number;
  entries: IncomeEntry[];
};

export type IncomeData = {
  months: IncomeMonth[];
  currency: string;
  summary: { this_month: number; total: number; monthly_price: number };
};

export type PaymentInput = {
  amount: number;
  paid_on?: string;
  note?: string;
};

export type StaffMember = {
  id: number;
  name: string;
  phone: string;
  role: StaffRole;
  username: string;
  has_login: boolean;
  onboarded: boolean;
  is_active: boolean;
  restaurant_id: number;
  /** The location the person works in; 0 is store-wide (admin, owner). */
  branch_id: number;
  branch_ar: string;
  branch_en: string;
  created_at: string | null;
};

export type TeamData = {
  staff: StaffMember[];
  restaurant: Restaurant;
  /** Only an admin receives the picker list. */
  restaurants?: Restaurant[];
  summary: {
    total: number;
    active: number;
    roles: Record<StaffRole, number>;
  };
};

export type StaffInput = {
  name: string;
  phone?: string;
  role: StaffRole;
  is_active?: boolean;
  username?: string;
  password?: string;
  /** The restaurant the account belongs to; admins only. */
  restaurant_id?: number;
  /** The location the person works in; empty means the active branch. */
  branch_id?: number;
};

export type RestaurantInput = { name_ar: string; name_en: string };

/** A role a checklist item can be scoped to; '' is everybody's list. */
export type ChecklistRole = '' | Exclude<StaffRole, 'owner'>;

export type ChecklistTask = {
  id: number;
  title_ar: string;
  title_en: string;
  role: ChecklistRole;
  sort: number;
  is_active: boolean;
  /** Ticked at least once, so it stays as history instead of being deleted. */
  has_checks: boolean;
};

export type ChecklistMember = {
  id: number;
  name: string;
  role: StaffRole;
  done: number;
  total: number;
  items: { task_id: number; done: boolean }[];
};

export type ChecklistDay = {
  date: string;
  tasks: ChecklistTask[];
  members: ChecklistMember[];
  summary: { done: number; total: number; members: number; complete: number };
};

export type ChecklistPeriod = 'day' | 'week' | 'month';

export type ChecklistReportMember = {
  id: number;
  name: string;
  role: StaffRole;
  is_active: boolean;
  done: number;
  expected: number;
  percent: number;
  days: { date: string; done: number; expected: number }[];
};

export type ChecklistReport = {
  period: ChecklistPeriod;
  start: string;
  end: string;
  counted_days: number;
  tasks_total: number;
  days: string[];
  members: ChecklistReportMember[];
  summary: { done: number; expected: number; percent: number };
};

export type ChecklistTaskInput = {
  title_ar: string;
  title_en: string;
  role: ChecklistRole;
  sort?: number;
  is_active?: boolean;
};

/** 'in' = a shift is still open, 'out' = clocked out, 'none' = no arrival. */
export type AttendanceStatus = 'in' | 'out' | 'none';

export type AttendanceMember = {
  id: number;
  name: string;
  role: StaffRole;
  is_active: boolean;
  status: AttendanceStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  open_since: string | null;
  minutes: number;
  shifts: number;
  /** Their own shift time; empty / null means the store's rule applies. */
  shift_start: string;
  grace_minutes: number | null;
  /** A supervisor's lateness is never deducted. */
  exempt: boolean;
  late_minutes: number;
  deduction: number;
};

/** The store's lateness rule, as the attendance board reads it. */
export type AttendanceRules = {
  shift_start: string;
  grace_minutes: number;
  deduction_per_minute: number;
  currency: string;
};

export type AttendanceDay = {
  date: string;
  is_today: boolean;
  rules: AttendanceRules;
  me: AttendanceMember | null;
  members: AttendanceMember[];
  summary: {
    on_shift: number;
    checked_in: number;
    minutes: number;
    members: number;
    late_count: number;
    late_minutes: number;
    deduction: number;
  };
};

/** One person's month, as the monthly table reads it. */
export type AttendanceMonthMember = {
  id: number;
  name: string;
  role: StaffRole;
  is_active: boolean;
  shift_start: string;
  grace_minutes: number | null;
  exempt: boolean;
  days: number;
  shifts: number;
  minutes: number;
  late_days: number;
  late_minutes: number;
  deduction: number;
};

export type AttendanceMonth = {
  month: string;
  start: string;
  end: string;
  rules: AttendanceRules;
  members: AttendanceMonthMember[];
  summary: {
    members: number;
    days: number;
    minutes: number;
    late_days: number;
    late_minutes: number;
    deduction: number;
  };
};

/** A person's own shift window; empty / null hands them back to the store's. */
export type AttendanceRuleInput = {
  shift_start: string;
  grace_minutes: number | null;
  month?: string;
};

export type AuthUser = {
  id: number;
  name: string;
  username: string;
  phone: string;
  role: StaffRole;
  is_active: boolean;
  needs_onboarding: boolean;
};

export type SettingsData = {
  store: {
    name_ar: string;
    name_en: string;
    accent_color: string;
    currency: string;
    tax_rate: number;
    plan: string;
  };
  service: { table_count: number; open_tables: number };
  attendance: {
    shift_start: string;
    grace_minutes: number;
    deduction_per_minute: number;
  };
};

export type SettingsInput = {
  name_ar: string;
  name_en: string;
  accent_color: string;
  currency: string;
  tax_rate: number;
  table_count: number;
  shift_start: string;
  grace_minutes: number;
  deduction_per_minute: number;
};

export type LoyaltyTier = 'bronze' | 'silver' | 'gold';

export type LoyaltyProgram = {
  is_active: boolean;
  stamps_target: number;
  points_per_currency: number;
  reward_ar: string;
  reward_en: string;
};

export type LoyaltyCard = {
  id: number;
  customer_id: number;
  name: string;
  phone: string;
  stamps: number;
  stamps_target: number;
  points: number;
  tier: LoyaltyTier;
  next_tier: { tier: LoyaltyTier; points: number } | null;
  rewards_redeemed: number;
  reward_ready: boolean;
  visits: number;
  spend: number;
  joined_at: string | null;
  last_stamp_at: string | null;
};

export type LoyaltyData = {
  program: LoyaltyProgram;
  cards: LoyaltyCard[];
  available: { id: number; name: string; phone: string }[];
  wallet: { enabled: boolean };
  summary: {
    members: number;
    stamps_in_progress: number;
    rewards_ready: number;
    rewards_redeemed: number;
    points: number;
    tiers: Record<LoyaltyTier, number>;
  };
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
  // The cookie is HttpOnly and same-origin, so every call carries the session.
  me: () => request<AuthUser>('/api/auth/me'),
  login: (username: string, password: string) =>
    request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  finishOnboarding: () =>
    request<AuthUser>('/api/auth/onboarding', { method: 'POST' }),

  dashboard: () => request<DashboardData>('/api/dashboard'),
  notifications: () => request<NotificationsData>('/api/notifications'),
  branches: () => request<BranchesData>('/api/branches'),
  createBranch: (body: BranchInput) =>
    request<BranchesData>('/api/branches', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateBranch: (id: number, body: Partial<BranchInput>) =>
    request<BranchesData>(`/api/branches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteBranch: (id: number) =>
    request<BranchesData>(`/api/branches/${id}`, { method: 'DELETE' }),
  activateBranch: (id: number) =>
    request<BranchesData>(`/api/branches/${id}/activate`, { method: 'POST' }),
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
  addStockMovement: (id: number, body: StockMoveInput) =>
    request<IngredientsData>(`/api/ingredients/${id}/movements`, {
      method: 'POST',
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

  customers: () => request<CustomersData>('/api/customers'),
  customer: (id: number) =>
    request<CustomerDetail>(`/api/customers/${id}`),
  createCustomer: (body: CustomerInput) =>
    request<CustomersData>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCustomer: (id: number, body: Partial<CustomerInput>) =>
    request<CustomersData>(`/api/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCustomer: (id: number) =>
    request<CustomersData>(`/api/customers/${id}`, { method: 'DELETE' }),

  report: (days: number) => request<ReportData>(`/api/reports?days=${days}`),
  reportCsvUrl: (days: number) => `/api/reports/export.csv?days=${days}`,

  team: (restaurantId?: number, branchId?: number) => {
    const query = [
      restaurantId ? `restaurant_id=${restaurantId}` : '',
      branchId ? `branch_id=${branchId}` : '',
    ]
      .filter(Boolean)
      .join('&');
    return request<TeamData>(query ? `/api/team?${query}` : '/api/team');
  },
  restaurants: () => request<RestaurantsData>('/api/restaurants'),
  createRestaurant: (body: RestaurantCreateInput) =>
    request<RestaurantsData>('/api/restaurants', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateRestaurant: (id: number, body: RestaurantPatchInput) =>
    request<RestaurantsData>(`/api/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  blockRestaurant: (id: number, blocked: boolean) =>
    request<RestaurantsData>(`/api/restaurants/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ blocked }),
    }),
  deleteRestaurant: (id: number, keepData: boolean) =>
    request<RestaurantsData>(
      `/api/restaurants/${id}?keep_data=${keepData}`,
      { method: 'DELETE' },
    ),
  income: (months = 6) => request<IncomeData>(`/api/income?months=${months}`),
  recordPayment: (id: number, body: PaymentInput) =>
    request<IncomeData>(`/api/restaurants/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletePayment: (id: number, paymentId: number) =>
    request<IncomeData>(`/api/restaurants/${id}/payments/${paymentId}`, {
      method: 'DELETE',
    }),
  createStaff: (body: StaffInput) =>
    request<TeamData>('/api/team', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateStaff: (id: number, body: Partial<StaffInput>) =>
    request<TeamData>(`/api/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteStaff: (id: number) =>
    request<TeamData>(`/api/team/${id}`, { method: 'DELETE' }),

  checklist: (date?: string) =>
    request<ChecklistDay>(`/api/checklists${date ? `?date=${date}` : ''}`),
  checklistReport: (period: ChecklistPeriod, anchor?: string) =>
    request<ChecklistReport>(
      `/api/checklists/report?period=${period}${anchor ? `&anchor=${anchor}` : ''}`,
    ),
  toggleChecklistItem: (body: {
    task_id: number;
    staff_id: number;
    date: string;
    done: boolean;
  }) =>
    request<ChecklistDay>('/api/checklists/checks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createChecklistTask: (body: ChecklistTaskInput) =>
    request<{ tasks: ChecklistTask[] }>('/api/checklists/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateChecklistTask: (id: number, body: Partial<ChecklistTaskInput>) =>
    request<{ tasks: ChecklistTask[] }>(`/api/checklists/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteChecklistTask: (id: number) =>
    request<{ tasks: ChecklistTask[] }>(`/api/checklists/tasks/${id}`, {
      method: 'DELETE',
    }),

  attendance: (date?: string) =>
    request<AttendanceDay>(`/api/attendance${date ? `?date=${date}` : ''}`),
  checkIn: (body: { staff_id?: number; date?: string } = {}) =>
    request<AttendanceDay>('/api/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  checkOut: (body: { staff_id?: number; date?: string } = {}) =>
    request<AttendanceDay>('/api/attendance/check-out', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  attendanceMonth: (month?: string) =>
    request<AttendanceMonth>(
      `/api/attendance/month${month ? `?month=${month}` : ''}`,
    ),
  updateAttendanceRule: (staffId: number, body: AttendanceRuleInput) =>
    request<AttendanceMonth>(`/api/attendance/rules/${staffId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  settings: () => request<SettingsData>('/api/settings'),
  updateSettings: (body: SettingsInput) =>
    request<SettingsData>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  loyalty: () => request<LoyaltyData>('/api/loyalty'),
  enrollLoyaltyCard: (customerId: number) =>
    request<LoyaltyData>('/api/loyalty/cards', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    }),
  removeLoyaltyCard: (id: number) =>
    request<LoyaltyData>(`/api/loyalty/cards/${id}`, { method: 'DELETE' }),
  stampLoyaltyCard: (id: number) =>
    request<LoyaltyData>(`/api/loyalty/cards/${id}/stamp`, { method: 'POST' }),
  redeemLoyaltyCard: (id: number) =>
    request<LoyaltyData>(`/api/loyalty/cards/${id}/redeem`, { method: 'POST' }),
  loyaltyWalletLink: (id: number) =>
    request<{ save_url: string }>(`/api/loyalty/cards/${id}/wallet-link`),
  updateLoyaltyProgram: (body: Partial<LoyaltyProgram>) =>
    request<LoyaltyData>('/api/loyalty/program', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
