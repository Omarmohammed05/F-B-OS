import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const en = {
  brand: 'F&B OS',
  'nav.dashboard': 'Dashboard',
  'nav.pos': 'POS',
  'nav.orders': 'Orders',
  'nav.menu': 'Menu',
  'nav.inventory': 'Inventory',
  'nav.customers': 'Customers',
  'nav.loyalty': 'Loyalty',
  'nav.reports': 'Reports',
  'nav.team': 'Team',
  'nav.settings': 'Settings',
  'nav.help': 'Help',
  'nav.group.main': 'Main',
  'nav.group.operations': 'Operations',
  'nav.group.growth': 'Growth',
  'nav.group.settings': 'Settings',
  'nav.integrations': 'Integrations',
  'store.owner': 'Store owner',
  'store.switch': 'Switch store',
  'store.addBranch': 'Add branch',
  'top.search': 'Search orders, items…',
  'top.openPos': 'Open POS',
  'top.notifications': 'Notifications',
  'top.language': 'Language',
  'top.theme': 'Appearance',
  'dash.welcome': 'Welcome to {store}!',
  'dash.subtitle': 'A quiet overview of how your store is doing today.',
  'dash.dateRange': 'Last 7 days',
  'dash.export': 'Export CSV',
  'kpi.pending': 'Pending orders',
  'kpi.inProgress': 'In progress',
  'kpi.totalOrders': 'Total orders',
  'kpi.availableTables': 'Available tables',
  'kpi.vsLast': 'vs last period',
  'kpi.stable': 'steady',
  'revenue.title': 'Revenue',
  'revenue.vsLast': 'vs last period',
  'popular.title': 'Popular items',
  'popular.item': 'Item',
  'popular.orders': 'Orders',
  'popular.revenue': 'Revenue',
  'activity.title': 'Recent activity',
  'activity.order': 'Order',
  'activity.item': 'Item',
  'activity.unitPrice': 'Unit price',
  'activity.table': 'Table',
  'activity.qty': 'Qty',
  'activity.status': 'Status',
  'payment.title': 'Total collected',
  'payment.orders': '{count} orders',
  'payment.method': 'Method',
  'status.preparing': 'Preparing',
  'status.served': 'Served',
  'status.cancelled': 'Cancelled',
  'status.new': 'New',
  'setup.cardTitle': 'Setup store',
  'setup.progress': '{done}/{total} steps complete',
  'setup.cta': 'Setup',
  'setup.heading': 'Set up your store',
  'setup.lede':
    'Finish these steps to get the most out of F&B OS. You can come back at any time.',
  'setup.back': 'Back to dashboard',
  'setup.toggle': 'Toggle step',
  'setup.completeTitle': 'Setup complete',
  'setup.completeBody': 'Every step is done. Your store is ready for service.',
  'setup.doneOn': 'Done',
  'module.comingSoon': 'Coming soon',
  'module.phase': 'Phase {phase}',
  'module.planned': 'Planned in this phase',
  'module.back': 'Back to dashboard',
  'module.pos.title': 'Point of sale',
  'module.pos.blurb':
    'Tablet-first ordering with dine-in, takeaway and delivery, shifts and blind close.',
  'module.pos.scope':
    'Category tiles, product grid, order panel, payments and receipts.',
  'module.orders.title': 'Orders',
  'module.orders.blurb':
    'Live tickets and order history with kitchen and bar routing.',
  'module.orders.scope': 'Status board, order details, void and refund review.',
  'module.menu.title': 'Menu',
  'module.menu.blurb':
    'Categories, products and modifiers in Arabic and English with photos and prices.',
  'module.menu.scope': 'Menu builder, modifier groups, CSV import.',
  'module.inventory.title': 'Inventory',
  'module.inventory.blurb':
    'Raw materials, recipes and a stock ledger so every sale deducts ingredients.',
  'module.inventory.scope':
    'Stock levels, recipe builder, purchases, waste and stock counts.',
  'module.customers.title': 'Customers',
  'module.customers.blurb':
    'Customer profiles, addresses and visit history across orders.',
  'module.customers.scope': 'Customer list, addresses, order history.',
  'module.loyalty.title': 'Loyalty',
  'module.loyalty.blurb':
    'Wallet cards with stamps, points and tiers, fully branded for your store.',
  'module.loyalty.scope':
    'Loyalty studio, card preview, campaigns and redemption analytics.',
  'module.reports.title': 'Reports',
  'module.reports.blurb':
    'Sales, food cost and shift reports you can export and share.',
  'module.reports.scope': 'Sales by day, food cost, cash variance, CSV export.',
  'module.team.title': 'Team',
  'module.team.blurb':
    'Staff, roles and manager PINs for sensitive actions.',
  'module.team.scope': 'Staff list, role assignment, audit log.',
  'module.settings.title': 'Settings',
  'module.settings.blurb':
    'Branches, tables, taxes, payment methods, language and branding.',
  'module.settings.scope': 'Store profile, branches, taxes, printers, WhatsApp.',
  'notFound.title': 'Page not found',
  'notFound.body': 'This page does not exist in F&B OS yet.',
  'notFound.back': 'Back to dashboard',
  'common.loading': 'Loading…',
  'common.error': 'We could not load this data.',
  'common.retry': 'Try again',
} as const;

export type TranslationKey = keyof typeof en;

const ar: Record<TranslationKey, string> = {
  brand: 'F&B OS',
  'nav.dashboard': 'لوحة التحكم',
  'nav.pos': 'نقطة البيع',
  'nav.orders': 'الطلبات',
  'nav.menu': 'المنيو',
  'nav.inventory': 'المخزون',
  'nav.customers': 'العملاء',
  'nav.loyalty': 'الولاء',
  'nav.reports': 'التقارير',
  'nav.team': 'الفريق',
  'nav.settings': 'الإعدادات',
  'nav.help': 'المساعدة',
  'nav.group.main': 'الرئيسية',
  'nav.group.operations': 'التشغيل',
  'nav.group.growth': 'النمو',
  'nav.group.settings': 'الإعدادات',
  'nav.integrations': 'التكاملات',
  'store.owner': 'صاحب المتجر',
  'store.switch': 'تغيير المتجر',
  'store.addBranch': 'إضافة فرع',
  'top.search': 'ابحث عن طلب أو منتج…',
  'top.openPos': 'فتح نقطة البيع',
  'top.notifications': 'الإشعارات',
  'top.language': 'اللغة',
  'top.theme': 'المظهر',
  'dash.welcome': 'أهلًا بك في {store}!',
  'dash.subtitle': 'ملخص هادئ لأداء متجرك اليوم.',
  'dash.dateRange': 'آخر ٧ أيام',
  'dash.export': 'تصدير CSV',
  'kpi.pending': 'طلبات قيد الانتظار',
  'kpi.inProgress': 'قيد التحضير',
  'kpi.totalOrders': 'إجمالي الطلبات',
  'kpi.availableTables': 'طاولات متاحة',
  'kpi.vsLast': 'مقارنة بالفترة السابقة',
  'kpi.stable': 'مستقر',
  'revenue.title': 'الإيرادات',
  'revenue.vsLast': 'مقارنة بالفترة السابقة',
  'popular.title': 'الأكثر طلبًا',
  'popular.item': 'المنتج',
  'popular.orders': 'الطلبات',
  'popular.revenue': 'الإيراد',
  'activity.title': 'أحدث الطلبات',
  'activity.order': 'الطلب',
  'activity.item': 'المنتج',
  'activity.unitPrice': 'سعر الوحدة',
  'activity.table': 'الطاولة',
  'activity.qty': 'الكمية',
  'activity.status': 'الحالة',
  'payment.title': 'إجمالي التحصيل',
  'payment.orders': '{count} طلب',
  'payment.method': 'طريقة الدفع',
  'status.preparing': 'قيد التحضير',
  'status.served': 'تم التقديم',
  'status.cancelled': 'ملغي',
  'status.new': 'جديد',
  'setup.cardTitle': 'إعداد المتجر',
  'setup.progress': '{done}/{total} خطوات مكتملة',
  'setup.cta': 'إعداد',
  'setup.heading': 'أكمل إعداد متجرك',
  'setup.lede':
    'أكمل هذه الخطوات للاستفادة الكاملة من F&B OS. يمكنك العودة في أي وقت.',
  'setup.back': 'العودة إلى لوحة التحكم',
  'setup.toggle': 'تغيير حالة الخطوة',
  'setup.completeTitle': 'اكتمل الإعداد',
  'setup.completeBody': 'كل الخطوات مكتملة. متجرك جاهز للعمل.',
  'setup.doneOn': 'مكتملة',
  'module.comingSoon': 'قريبًا',
  'module.phase': 'المرحلة {phase}',
  'module.planned': 'المخطط لهذه المرحلة',
  'module.back': 'العودة إلى لوحة التحكم',
  'module.pos.title': 'نقطة البيع',
  'module.pos.blurb':
    'بيع سريع على التابلت مع محلي وتيك أواي وتوصيل، وورديات وإغلاق أعمى.',
  'module.pos.scope': 'أقسام المنتجات، شبكة المنتجات، لوحة الطلب، الدفع والإيصالات.',
  'module.orders.title': 'الطلبات',
  'module.orders.blurb': 'تذاكر مباشرة وسجل طلبات مع توجيه للمطبخ والبار.',
  'module.orders.scope': 'لوحة الحالات، تفاصيل الطلب، مراجعة الإلغاء والاسترجاع.',
  'module.menu.title': 'المنيو',
  'module.menu.blurb':
    'الأقسام والمنتجات والإضافات بالعربية والإنجليزية مع الصور والأسعار.',
  'module.menu.scope': 'بناء المنيو، مجموعات الإضافات، استيراد CSV.',
  'module.inventory.title': 'المخزون',
  'module.inventory.blurb':
    'مواد خام ووصفات وسجل حركة يخصم المكونات مع كل عملية بيع.',
  'module.inventory.scope':
    'أرصدة المخزون، بناء الوصفات، المشتريات، الهالك، الجرد.',
  'module.customers.title': 'العملاء',
  'module.customers.blurb': 'ملفات العملاء والعناوين وسجل الزيارات.',
  'module.customers.scope': 'قائمة العملاء، العناوين، سجل الطلبات.',
  'module.loyalty.title': 'الولاء',
  'module.loyalty.blurb':
    'بطاقات محفظة بالأختام والنقاط والمستويات بهوية متجرك.',
  'module.loyalty.scope':
    'استوديو الولاء، معاينة البطاقة، الحملات، تحليلات الاستبدال.',
  'module.reports.title': 'التقارير',
  'module.reports.blurb': 'تقارير المبيعات وتكلفة الطعام والورديات قابلة للتصدير.',
  'module.reports.scope': 'مبيعات يومية، تكلفة الطعام، فروق النقدية، تصدير CSV.',
  'module.team.title': 'الفريق',
  'module.team.blurb': 'الموظفون والأدوار وأرقام مدير للعمليات الحساسة.',
  'module.team.scope': 'قائمة الموظفين، توزيع الأدوار، سجل التغييرات.',
  'module.settings.title': 'الإعدادات',
  'module.settings.blurb':
    'الفروع والطاولات والضرائب وطرق الدفع واللغة وهوية المتجر.',
  'module.settings.scope':
    'بيانات المتجر، الفروع، الضرائب، الطابعات، واتساب.',
  'notFound.title': 'الصفحة غير موجودة',
  'notFound.body': 'هذه الصفحة غير متاحة في F&B OS بعد.',
  'notFound.back': 'العودة إلى لوحة التحكم',
  'common.loading': 'جارٍ التحميل…',
  'common.error': 'تعذر تحميل البيانات.',
  'common.retry': 'إعادة المحاولة',
};

export type Lang = 'ar' | 'en';

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { ar, en };
const LANG_KEY = 'fbos.lang';

type LangContextValue = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

function readStoredLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return stored === 'en' ? 'en' : 'ar';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(LANG_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<LangContextValue>(() => {
    const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text: string = dictionaries[lang][key] ?? en[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          text = text.replace(`{${name}}`, String(replacement));
        }
      }
      return text;
    };
    return {
      lang,
      dir,
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      t,
    };
  }, [lang, dir, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang must be used inside LangProvider');
  return context;
}
