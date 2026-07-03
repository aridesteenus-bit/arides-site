(() => {
  const STORAGE_KEY = "arides_operator_orders_v1";
  const BUSY_STORAGE_KEY = "arides_operator_busy_slots_v1";
  const EXPENSE_STORAGE_KEY = "arides_operator_expenses_v1";
  const TAB_STORAGE_KEY = "arides_operator_active_tab_v1";
  const REMOTE_SEEN_STORAGE_KEY = "arides_operator_seen_remote_orders_v1";
  const LAST_SYNC_STORAGE_KEY = "arides_operator_last_sync_v1";
  const ADMIN_TOKEN_STORAGE_KEY = "arides_operator_admin_token_v1";
  const API_BASE_STORAGE_KEY = "arides_operator_api_base_v1";
  const NOTIFICATION_CHANNEL_ID = "arides_orders";
  const legacyApiEndpoint = "https://script.google.com/macros/s/AKfycbzlj9qPjWNFi82e87OYYmYQGMZ8AIv8NkuiduoGK3_NhL0aLTezDZGDrFdEuFEHPxkw/exec";
  const desktopConfig = window.ARIDES_DESKTOP_CONFIG || {};
  const queryConfig = new URLSearchParams(window.location.search);
  const queryToken = queryConfig.get("adminToken") || "";
  const queryApiBase = queryConfig.get("apiBase") || "";
  const queryTab = queryConfig.get("tab") || "";
  if (queryToken) localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, queryToken);
  if (queryApiBase) localStorage.setItem(API_BASE_STORAGE_KEY, queryApiBase);
  if (queryTab) localStorage.setItem(TAB_STORAGE_KEY, queryTab);
  if (queryToken || queryApiBase || queryTab) {
    window.history.replaceState({}, document.title, window.location.pathname || "/operator.html");
  }
  const API_BASE = String(queryApiBase || desktopConfig.apiBase || localStorage.getItem(API_BASE_STORAGE_KEY) || "https://arides.ee").replace(/\/$/, "");
  const API_ENDPOINT = API_BASE ? `${API_BASE}/api/admin/orders` : legacyApiEndpoint;
  const OPERATOR_TOKEN = queryToken || desktopConfig.adminToken || localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  const USE_PLATFORM_API = API_BASE.includes("arides.ee") || API_BASE.startsWith("http://127.0.0.1") || API_BASE.startsWith("http://localhost");
  const INVOICE_PREFIX = "ARV";
  const PHOTO_MAX_SIDE = 1280;
  const PHOTO_JPEG_QUALITY = 0.72;
  const MAX_LOCAL_CARGO_PHOTOS = 12;
  const BRAND_NAME = "ARIDES Cargo";
  const COMPANY = {
    name: "Arides OÜ",
    registryCode: "12717973",
    address: "Harju maakond, Harku vald, Tutermaa küla, Meistri tee 2-28, 76617",
    phone: "+372 5684 5377",
    email: "info@arides.ee",
    website: "https://arides.ee/"
  };

  const statusLabels = {
    new: "Uus",
    confirmed: "Kinnitatud",
    active: "Töös",
    done: "Lõpetatud",
    cancelled: "Tühistatud"
  };

  const paymentLabels = {
    unpaid: "Tasumata",
    paid: "Tasutu",
    pending: "Ootel"
  };

  const expenseLabels = {
    fuel: "Kütus",
    parking: "Parkimine",
    maintenance: "Hooldus/remont",
    tools: "Töövahendid",
    office: "Kontor/admin",
    other: "Muu"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    orders: loadOrders(),
    busySlots: loadBusySlots(),
    expenses: loadExpenses(),
    seenRemoteIds: loadSeenRemoteIds(),
    selectedId: null,
    activeTab: localStorage.getItem(TAB_STORAGE_KEY) || "orders",
    syncing: false,
    lastSyncAt: localStorage.getItem(LAST_SYNC_STORAGE_KEY) || ""
  };

  function loadOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveOrders() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
  }

  function loadBusySlots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUSY_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveBusySlots() {
    localStorage.setItem(BUSY_STORAGE_KEY, JSON.stringify(state.busySlots));
  }

  function loadExpenses() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveExpenses() {
    localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(state.expenses));
  }

  function loadSeenRemoteIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REMOTE_SEEN_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function saveSeenRemoteIds() {
    localStorage.setItem(REMOTE_SEEN_STORAGE_KEY, JSON.stringify(Array.from(state.seenRemoteIds)));
  }

  function isOnline() {
    return navigator.onLine !== false;
  }

  function rememberSyncNow() {
    state.lastSyncAt = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, state.lastSyncAt);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function monthISO() {
    return todayISO().slice(0, 7);
  }

  function isActiveOrder(order) {
    return !isHiddenOrder(order) && ["confirmed", "active"].includes(order.status);
  }

  function isWorkOrder(order) {
    return !isHiddenOrder(order);
  }

  function isHiddenOrder(order) {
    return Boolean(order?.deletedAt) || order?.status === "cancelled";
  }

  function orderTotal(order) {
    return calculateOrder(order).finalPrice;
  }

  function depositAmount(order) {
    const total = orderTotal(order);
    const manualAmount = Number(order.depositAmount);
    if (manualAmount > 0) return manualAmount;

    const percent = Number(order.depositPercent);
    if (percent > 0 && total > 0) {
      return Math.max(0, Math.round((total * percent) / 100));
    }

    return 0;
  }

  function paymentBadge(order) {
    const deposit = depositAmount(order);
    const invoiceState = paymentLabels[order.paymentStatus] || "Tasumata";
    if (deposit > 0 && order.paymentStatus === "pending") {
      return `Ettemaks ${money(deposit)}`;
    }
    if (deposit > 0 && order.paymentStatus !== "paid") {
      return `Ettemaks ${money(deposit)}`;
    }
    return invoiceState;
  }

  function summaryChips(order) {
    const chips = [];
    if (order.clientPhone) chips.push(`📞 ${order.clientPhone}`);
    if (order.jobDate || order.jobTime) chips.push(`🗓 ${formatOrderTime(order)}`);
    if (order.paymentStatus) chips.push(`💳 ${paymentBadge(order)}`);
    if (order.invoiceNumber) chips.push(`№ ${order.invoiceNumber}`);
    if (order.source === "website") chips.push("Veebist");
    if (normalizeCargoPhotos(order.cargoPhotos).length) chips.push(`${normalizeCargoPhotos(order.cargoPhotos).length} foto`);
    return chips;
  }

  function uid() {
    return `ord_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function photoId() {
    return `photo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function expenseId() {
    return `exp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function busyId() {
    return `busy_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function money(value) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("et-EE", {
      style: "currency",
      currency: "EUR"
    }).format(amount);
  }

  function number(value, digits = 2) {
    return new Intl.NumberFormat("et-EE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(Number(value) || 0);
  }

  function invoiceDateCode(dateValue = todayISO()) {
    const date = new Date(`${dateValue}T12:00:00`);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}${month}${year}`;
  }

  function addDaysISO(dateValue, days = 7) {
    const date = new Date(`${dateValue || todayISO()}T12:00:00`);
    date.setDate(date.getDate() + (Number(days) || 0));
    return date.toISOString().slice(0, 10);
  }

  function nextInvoiceNumber(dateValue = todayISO(), currentOrderId = "") {
    const code = invoiceDateCode(dateValue);
    const usedToday = state.orders
      .filter((order) => order.id !== currentOrderId)
      .map((order) => order.invoiceNumber || "")
      .filter((value) => value.startsWith(`${INVOICE_PREFIX}-${code}`));

    return `${INVOICE_PREFIX}-${code}-${usedToday.length + 1}`;
  }

  function normalizeCargoPhotos(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(Boolean)
      .map((photo) => ({
        id: photo.id || photo.photo_id || photoId(),
        orderId: photo.orderId || photo.order_id || "",
        createdAt: photo.createdAt || photo.created_at || new Date().toISOString(),
        fileName: photo.fileName || photo.file_name || "cargo-photo.jpg",
        mimeType: photo.mimeType || photo.mime_type || "image/jpeg",
        dataUrl: photo.dataUrl || photo.data_url || "",
        url: photo.url || photo.drive_url || "",
        thumbUrl: photo.thumbUrl || photo.thumb_url || photo.url || photo.drive_url || "",
        uploadStatus: photo.uploadStatus || photo.upload_status || (photo.drive_url || photo.url ? "uploaded" : "pending"),
        note: photo.note || ""
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function mergeCargoPhotos(localPhotos, remotePhotos) {
    const byKey = new Map();
    normalizeCargoPhotos(remotePhotos).forEach((photo) => {
      byKey.set(photo.id || photo.url, photo);
    });
    normalizeCargoPhotos(localPhotos).forEach((photo) => {
      const key = photo.id || photo.url;
      const remote = byKey.get(key);
      byKey.set(key, {
        ...(remote || {}),
        ...photo,
        url: remote?.url || photo.url,
        thumbUrl: remote?.thumbUrl || photo.thumbUrl,
        uploadStatus: remote?.url ? "uploaded" : photo.uploadStatus
      });
    });
    return Array.from(byKey.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function parseRemoteCargoPhotos(remote) {
    if (!remote) return [];
    if (remote.cargo_photos_json) {
      try {
        return normalizeCargoPhotos(JSON.parse(remote.cargo_photos_json));
      } catch {
        return [];
      }
    }

    return String(remote.cargo_photo_urls || "")
      .split(/\n|\|/)
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({
        id: url,
        url,
        thumbUrl: url,
        uploadStatus: "uploaded"
      }));
  }

  function cargoPhotoStatusLabel(status) {
    const labels = {
      uploaded: "Serveris",
      sent: "Saadetud",
      uploading: "Saadan...",
      pending: "Ootab internetti",
      failed: "Saatmine ebaõnnestus"
    };
    return labels[status] || "Salvestatud";
  }

  function readForm() {
    const form = $("#orderForm");
    const data = new FormData(form);
    const id = data.get("id") || uid();
    const existing = state.orders.find((order) => order.id === id);

    return {
      ...(existing || {}),
      id,
      status: data.get("status") || "new",
      tripStage: data.get("tripStage") || existing?.tripStage || "to_pickup",
      clientName: String(data.get("clientName") || "").trim(),
      clientPhone: String(data.get("clientPhone") || "").trim(),
      clientEmail: String(data.get("clientEmail") || "").trim(),
      clientType: data.get("clientType") || "private",
      serviceType: data.get("serviceType") || "Kaubavedu",
      jobDate: data.get("jobDate") || todayISO(),
      jobTime: data.get("jobTime") || "",
      hours: Number(data.get("hours")) || 0,
      pickupAddress: String(data.get("pickupAddress") || "").trim(),
      deliveryAddress: String(data.get("deliveryAddress") || "").trim(),
      extraStops: String(data.get("extraStops") || "").trim(),
      kilometers: Number(data.get("kilometers")) || 0,
      hourRate: Number(data.get("hourRate")) || 30,
      kmRate: Number(data.get("kmRate")) || 0.9,
      helperHours: Number(data.get("helperHours")) || 0,
      helperRate: Number(data.get("helperRate")) || 12,
      floorFee: Number(existing?.floorFee) || 0,
      extraFee: Number(data.get("extraFee")) || 0,
      finalPrice: data.get("finalPrice") === "" ? "" : Number(data.get("finalPrice")) || 0,
      depositPercent: Number(data.get("depositPercent")) || 0,
      depositAmount: data.get("depositAmount") === "" ? "" : Number(data.get("depositAmount")) || 0,
      depositNote: String(data.get("depositNote") || "").trim(),
      paymentStatus: data.get("paymentStatus") || "unpaid",
      invoiceDueDays: Number(data.get("invoiceDueDays")) || 7,
      invoiceDueDate: existing?.invoiceDueDate || "",
      cargoDetails: String(data.get("cargoDetails") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      cargoPhotos: normalizeCargoPhotos(existing?.cargoPhotos),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function fillForm(order) {
    const form = $("#orderForm");
    const safeOrder = order || createBlankOrder();
    Object.entries(safeOrder).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (!field) return;
      field.value = value ?? "";
    });

    $("#detailTitle").textContent = safeOrder.clientName || "Uus tellimus";
    state.selectedId = safeOrder.id;
    updateTotalPreview();
    updateTripButtons(safeOrder);
    updateRouteSummary(safeOrder);
    renderOrderSummary(safeOrder);
    renderWebsiteEstimate(safeOrder);
    renderCargoPhotos(safeOrder);
    renderInvoice(safeOrder, false);
  }

  function createBlankOrder() {
    return {
      id: uid(),
      status: "new",
      tripStage: "to_pickup",
      clientType: "private",
      serviceType: "Kaubavedu",
      jobDate: todayISO(),
      jobTime: "",
      hours: 1,
      kilometers: 0,
      hourRate: 30,
      kmRate: 0.9,
      helperHours: 0,
      helperRate: 12,
      floorFee: 0,
      extraFee: 0,
      finalPrice: "",
      depositPercent: 0,
      depositAmount: "",
      depositNote: "",
      paymentStatus: "unpaid",
      invoiceDueDays: 7,
      invoiceDueDate: "",
      cargoPhotos: [],
      createdAt: new Date().toISOString()
    };
  }

  function calculateOrder(order) {
    const base = (Number(order.hours) || 0) * (Number(order.hourRate) || 0);
    const km = (Number(order.kilometers) || 0) * (Number(order.kmRate) || 0);
    const helper = (Number(order.helperHours) || 0) * (Number(order.helperRate) || 0);
    const extra = (Number(order.extraFee) || 0) + (Number(order.floorFee) || 0);
    const calculated = Math.max(0, base + km + helper + extra);
    const finalPrice = order.finalPrice === "" || order.finalPrice === undefined
      ? calculated
      : Number(order.finalPrice) || 0;

    return {
      base,
      km,
      helper,
      extra,
      calculated,
      finalPrice
    };
  }

  function normalizeExpense(expense) {
    return {
      id: expense.id || expenseId(),
      date: expense.date || todayISO(),
      category: expense.category || "other",
      vendor: String(expense.vendor || "").trim(),
      description: String(expense.description || "").trim(),
      amount: Number(expense.amount) || 0,
      paymentMethod: expense.paymentMethod || "card",
      receiptNumber: String(expense.receiptNumber || "").trim(),
      deletedAt: expense.deletedAt || expense.deleted_at || "",
      syncStatus: expense.syncStatus || expense.sync_status || "synced",
      createdAt: expense.createdAt || new Date().toISOString(),
      updatedAt: expense.updatedAt || new Date().toISOString()
    };
  }

  function readExpenseForm() {
    const form = $("#expenseForm");
    const data = new FormData(form);
    const id = data.get("id") || expenseId();
    const existing = state.expenses.find((expense) => expense.id === id);
    return normalizeExpense({
      ...(existing || {}),
      id,
      date: data.get("date") || todayISO(),
      category: data.get("category") || "other",
      vendor: data.get("vendor") || "",
      description: data.get("description") || "",
      amount: data.get("amount"),
      paymentMethod: data.get("paymentMethod") || "card",
      receiptNumber: data.get("receiptNumber") || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  function clearExpenseForm() {
    const form = $("#expenseForm");
    if (!form) return;
    form.reset();
    form.elements.namedItem("id").value = "";
    form.elements.namedItem("date").value = todayISO();
  }

  function upsertExpense(expense, options = {}) {
    const shouldSync = options.sync !== false;
    const normalized = {
      ...normalizeExpense(expense),
      syncStatus: shouldSync ? (isOnline() ? "pending" : "offline") : (expense.syncStatus || "synced")
    };
    const index = state.expenses.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      state.expenses[index] = normalized;
    } else {
      state.expenses.unshift(normalized);
    }
    saveExpenses();
    render();
    if (shouldSync) saveRemoteExpense(normalized);
    return normalized;
  }

  function deleteExpense(expenseIdValue) {
    const index = state.expenses.findIndex((expense) => expense.id === expenseIdValue);
    if (index < 0) return;
    state.expenses[index] = {
      ...normalizeExpense(state.expenses[index]),
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: isOnline() ? "pending" : "offline"
    };
    saveExpenses();
    render();
    saveRemoteExpense(state.expenses[index]);
  }

  function selectedReportMonth() {
    return $("#reportMonth")?.value || $("#expenseMonth")?.value || monthISO();
  }

  function ordersForMonth(month) {
    return state.orders.filter((order) => (
      isWorkOrder(order) && String(order.jobDate || "").startsWith(month)
    ));
  }

  function expensesForMonth(month) {
    return state.expenses
      .map(normalizeExpense)
      .filter((expense) => !expense.deletedAt)
      .filter((expense) => String(expense.date || "").startsWith(month))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function accountingSummary(month = monthISO()) {
    const orders = ordersForMonth(month);
    const expenses = expensesForMonth(month);
    const revenue = orders.reduce((sum, order) => sum + orderTotal(order), 0);
    const paidRevenue = orders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + orderTotal(order), 0);
    const unpaidRevenue = orders
      .filter((order) => order.paymentStatus !== "paid")
      .reduce((sum, order) => sum + orderTotal(order), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const invoiceCount = orders.filter((order) => order.invoiceNumber).length;
    const completedCount = orders.filter((order) => order.status === "done").length;

    return {
      month,
      orders,
      expenses,
      revenue,
      paidRevenue,
      unpaidRevenue,
      expenseTotal,
      result: revenue - expenseTotal,
      invoiceCount,
      completedCount
    };
  }

  function upsertOrder(order, options = {}) {
    const shouldSync = options.sync !== false;
    const nextOrder = {
      ...order,
      syncStatus: shouldSync ? (isOnline() ? "pending" : "offline") : (order.syncStatus || "synced")
    };
    const index = state.orders.findIndex((item) => item.id === order.id);
    if (index >= 0) {
      state.orders[index] = nextOrder;
    } else {
      state.orders.unshift(nextOrder);
    }
    state.selectedId = nextOrder.id;
    saveOrders();
    render();
    if (shouldSync) saveRemoteOrder(nextOrder);
  }

  function remoteNumber(remote, ...keys) {
    for (const key of keys) {
      if (remote[key] !== undefined && remote[key] !== null && remote[key] !== "") {
        return Number(remote[key]) || 0;
      }
    }
    return 0;
  }

  function selectedToken() {
    return OPERATOR_TOKEN || localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  }

  function apiUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function authHeaders(headers = {}) {
    const token = selectedToken();
    return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
  }

  function isRemoteOrderId(id) {
    return /^\d+$/.test(String(id || ""));
  }

  function remoteToOrder(remote) {
    const sitePrice = remoteNumber(remote, "final_total", "website_estimate_total", "estimated_total");
    return {
      id: String(remote.id || uid()),
      status: remote.status || "new",
      tripStage: remote.trip_stage || "to_pickup",
      clientName: remote.client_name || "",
      clientPhone: remote.client_phone || "",
      clientEmail: remote.client_email || "",
      clientType: remote.client_type || "private",
      serviceType: remote.service_type || "Kaubavedu",
      jobDate: remote.job_date || todayISO(),
      jobTime: remote.job_time || "",
      hours: remoteNumber(remote, "hours") || 1,
      pickupAddress: remote.pickup_address || "",
      deliveryAddress: remote.delivery_address || "",
      extraStops: remote.extra_stops || "",
      kilometers: remoteNumber(remote, "kilometers"),
      hourRate: remoteNumber(remote, "hour_rate") || 30,
      kmRate: remoteNumber(remote, "km_rate") || 0.9,
      helperHours: remoteNumber(remote, "helper_hours"),
      helperRate: remoteNumber(remote, "helper_rate") || 12,
      floorFee: remoteNumber(remote, "floor_fee"),
      extraFee: remoteNumber(remote, "extra_fee"),
      finalPrice: sitePrice || "",
      depositPercent: remoteNumber(remote, "deposit_percent"),
      depositAmount: remote.deposit_amount === null || remote.deposit_amount === undefined ? "" : Number(remote.deposit_amount) || 0,
      depositNote: remote.deposit_note || "",
      websiteEstimateTotal: remote.website_estimate_total === null || remote.website_estimate_total === undefined ? "" : Number(remote.website_estimate_total) || 0,
      websiteEstimateValue: remote.website_estimate_value || "",
      websiteEstimateText: remote.website_estimate_text || "",
      websiteEstimateMeta: remote.website_estimate_meta || "",
      websiteEstimateMapUrl: remote.website_estimate_map_url || "",
      estimatedTotal: remoteNumber(remote, "estimated_total"),
      paymentStatus: remote.payment_status || "unpaid",
      invoiceNumber: remote.invoice_number || "",
      invoiceDueDays: 7,
      invoiceDueDate: remote.invoice_due_date || "",
      invoiceCreatedAt: remote.invoice_created_at || "",
      cargoDetails: remote.cargo_details || "",
      notes: remote.notes || remote.comment || "",
      cargoPhotos: parseRemoteCargoPhotos(remote),
      syncStatus: "synced",
      source: remote.source || "website",
      createdAt: remote.created_at || new Date().toISOString(),
      updatedAt: remote.updated_at || new Date().toISOString()
    };
  }

  function orderToRemote(order) {
    return {
      status: order.status || "new",
      client_name: order.clientName || "",
      client_phone: order.clientPhone || "",
      client_email: order.clientEmail || "",
      client_type: order.clientType || "private",
      service_type: order.serviceType || "",
      job_date: order.jobDate || "",
      job_time: order.jobTime || "",
      pickup_address: order.pickupAddress || "",
      delivery_address: order.deliveryAddress || "",
      extra_stops: order.extraStops || "",
      cargo_details: order.cargoDetails || "",
      notes: order.notes || "",
      kilometers: Number(order.kilometers) || 0,
      estimated_minutes: Math.max(60, Math.round((Number(order.hours) || 1) * 60)),
      hours: Number(order.hours) || 1,
      helper_hours: Number(order.helperHours) || 0,
      floor_fee: Number(order.floorFee) || 0,
      extra_fee: Number(order.extraFee) || 0,
      hour_rate: Number(order.hourRate) || 30,
      km_rate: Number(order.kmRate) || 0.9,
      helper_rate: Number(order.helperRate) || 12,
      final_total: order.finalPrice === "" || order.finalPrice === undefined ? null : Number(order.finalPrice) || 0,
      payment_status: order.paymentStatus || "unpaid",
      deposit_percent: Number(order.depositPercent) || 0,
      deposit_amount: order.depositAmount === "" || order.depositAmount === undefined ? null : Number(order.depositAmount) || 0,
      deposit_note: order.depositNote || "",
      deleted_at: order.deletedAt || ""
    };
  }

  function remoteToExpense(remote) {
    return normalizeExpense({
      id: remote.id || expenseId(),
      date: remote.date || todayISO(),
      category: remote.category || "other",
      vendor: remote.vendor || "",
      description: remote.description || "",
      amount: remote.amount || 0,
      paymentMethod: remote.payment_method || "card",
      receiptNumber: remote.receipt_number || "",
      deletedAt: remote.deleted_at || "",
      syncStatus: "synced",
      createdAt: remote.created_at || new Date().toISOString(),
      updatedAt: remote.updated_at || new Date().toISOString()
    });
  }

  function expenseToRemote(expense) {
    const normalized = normalizeExpense(expense);
    return {
      action: "saveExpense",
      token: OPERATOR_TOKEN,
      id: normalized.id,
      created_at: normalized.createdAt,
      updated_at: normalized.updatedAt,
      date: normalized.date,
      category: normalized.category,
      vendor: normalized.vendor,
      description: normalized.description,
      amount: String(normalized.amount),
      payment_method: normalized.paymentMethod,
      receipt_number: normalized.receiptNumber,
      deleted_at: normalized.deletedAt,
      source: "operator"
    };
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadRemoteOrders() {
    try {
      if (USE_PLATFORM_API && !selectedToken()) {
        renderSyncStatus();
        notify("Sisesta admin token, et veebitellimused laadida.");
        return;
      }
      const hadSeenRemoteList = localStorage.getItem(REMOTE_SEEN_STORAGE_KEY) !== null;
      const data = USE_PLATFORM_API
        ? await fetchJson(apiUrl("/api/admin/orders?status=all"), { headers: authHeaders() })
        : await fetchJson(`${API_ENDPOINT}?action=orders`);
      const rows = Array.isArray(data) ? data : (Array.isArray(data.orders) ? data.orders : []);
      const remoteOrders = rows.map(remoteToOrder);
      const newRemoteOrders = remoteOrders.filter((order) => order.source === "website" && !state.seenRemoteIds.has(order.id));
      const byId = new Map(state.orders.map((order) => [order.id, order]));

      remoteOrders.forEach((order) => {
        state.seenRemoteIds.add(order.id);
        const existing = byId.get(order.id) || {};
        if (existing.deletedAt || existing.status === "cancelled") {
          byId.set(order.id, existing);
          return;
        }
        const localPending = ["pending", "offline", "failed"].includes(existing.syncStatus);
        const localNewer = String(existing.updatedAt || "") > String(order.updatedAt || "");
        const base = localPending && localNewer ? existing : { ...existing, ...order };
        byId.set(order.id, {
          ...base,
          cargoPhotos: mergeCargoPhotos(existing.cargoPhotos, order.cargoPhotos),
          syncStatus: localPending && localNewer ? existing.syncStatus : "synced"
        });
      });
      saveSeenRemoteIds();

      state.orders = Array.from(byId.values())
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      saveOrders();
      render();
      const firstVisibleOrder = state.orders.find((order) => !isHiddenOrder(order));
      if ((!state.selectedId || !state.orders.some((order) => order.id === state.selectedId)) && firstVisibleOrder) {
        fillForm(firstVisibleOrder);
      }

      if (hadSeenRemoteList && newRemoteOrders.length) {
        const first = newRemoteOrders[0];
        const text = newRemoteOrders.length === 1
          ? `Uus tellimus: ${first.clientName || first.serviceType || "klient"}`
          : `${newRemoteOrders.length} uut tellimust veebist`;
        notify(text);
      }
    } catch (error) {
      console.warn("Orders sync failed:", error);
    }
  }

  function patchOrderSyncStatus(orderId, syncStatus) {
    const index = state.orders.findIndex((order) => order.id === orderId);
    if (index < 0) return;
    state.orders[index] = {
      ...state.orders[index],
      syncStatus,
      lastSyncAttemptAt: new Date().toISOString()
    };
    saveOrders();
    renderSyncStatus();
  }

  async function saveRemoteOrder(order) {
    if (!API_ENDPOINT) return;
    if (USE_PLATFORM_API && !selectedToken()) {
      patchOrderSyncStatus(order.id, "offline");
      notify("Admin token puudub. Tellimus jäi ainult sellesse seadmesse.");
      return;
    }
    if (!isOnline()) {
      patchOrderSyncStatus(order.id, "offline");
      return;
    }

    try {
      patchOrderSyncStatus(order.id, "sending");
      if (USE_PLATFORM_API) {
        const remoteId = isRemoteOrderId(order.id);
        const saved = await fetchJson(
          apiUrl(remoteId ? `/api/admin/orders/${order.id}` : "/api/admin/orders"),
          {
            method: remoteId ? "PATCH" : "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(orderToRemote(order))
          }
        );
        const syncedOrder = {
          ...order,
          ...remoteToOrder(saved),
          cargoPhotos: normalizeCargoPhotos(order.cargoPhotos),
          syncStatus: "synced"
        };
        const index = state.orders.findIndex((item) => item.id === order.id);
        if (index >= 0) state.orders[index] = syncedOrder;
        if (state.selectedId === order.id) {
          state.selectedId = syncedOrder.id;
          fillForm(syncedOrder);
        }
        saveOrders();
        render();
      } else {
        const body = new URLSearchParams();
        Object.entries(orderToRemote(order)).forEach(([key, value]) => body.set(key, value ?? ""));
        await fetch(API_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        patchOrderSyncStatus(order.id, "sent");
      }
    } catch (error) {
      patchOrderSyncStatus(order.id, "failed");
      console.warn("Order save failed:", error);
    }
  }

  function syncPendingOrders() {
    if (!isOnline()) return Promise.resolve([]);
    return Promise.allSettled(state.orders
      .filter((order) => ["pending", "offline", "failed", "sent"].includes(order.syncStatus))
      .map((order) => saveRemoteOrder(order)));
  }

  async function loadRemoteExpenses() {
    if (USE_PLATFORM_API) {
      renderExpenses();
      renderReports();
      return;
    }
    try {
      const data = await fetchJson(`${API_ENDPOINT}?action=expenses`);
      const remoteExpenses = Array.isArray(data.expenses) ? data.expenses.map(remoteToExpense) : [];
      const byId = new Map(state.expenses.map((expense) => [expense.id, normalizeExpense(expense)]));

      remoteExpenses.forEach((expense) => {
        const existing = byId.get(expense.id);
        const localPending = existing && ["pending", "offline", "failed"].includes(existing.syncStatus);
        const localNewer = existing && String(existing.updatedAt || "") > String(expense.updatedAt || "");
        byId.set(expense.id, localPending && localNewer ? existing : { ...expense, syncStatus: "synced" });
      });

      state.expenses = Array.from(byId.values())
        .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
      saveExpenses();
      render();
    } catch (error) {
      console.warn("Expenses sync failed:", error);
    }
  }

  function patchExpenseSyncStatus(expenseIdValue, syncStatus) {
    const index = state.expenses.findIndex((expense) => expense.id === expenseIdValue);
    if (index < 0) return;
    state.expenses[index] = {
      ...normalizeExpense(state.expenses[index]),
      syncStatus,
      lastSyncAttemptAt: new Date().toISOString()
    };
    saveExpenses();
    renderSyncStatus();
  }

  async function saveRemoteExpense(expense) {
    if (USE_PLATFORM_API) {
      patchExpenseSyncStatus(expense.id, "synced");
      return;
    }
    if (!API_ENDPOINT) return;
    if (!isOnline()) {
      patchExpenseSyncStatus(expense.id, "offline");
      return;
    }

    const body = new URLSearchParams();
    Object.entries(expenseToRemote(expense)).forEach(([key, value]) => body.set(key, value ?? ""));

    try {
      patchExpenseSyncStatus(expense.id, "sending");
      await fetch(API_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      patchExpenseSyncStatus(expense.id, "sent");
    } catch (error) {
      patchExpenseSyncStatus(expense.id, "failed");
      console.warn("Expense save failed:", error);
    }
  }

  function syncPendingExpenses() {
    if (!isOnline()) return Promise.resolve([]);
    return Promise.allSettled(state.expenses
      .map(normalizeExpense)
      .filter((expense) => ["pending", "offline", "failed", "sent"].includes(expense.syncStatus))
      .map((expense) => saveRemoteExpense(expense)));
  }

  async function loadRemoteBusySlots() {
    if (USE_PLATFORM_API) {
      renderBusySlots();
      renderCalendarDayList();
      return;
    }
    try {
      const slots = await fetchJson(`${API_ENDPOINT}?action=busy`);
      state.busySlots = Array.isArray(slots) ? slots : [];
      saveBusySlots();
      renderBusySlots();
      renderCalendarDayList();
    } catch (error) {
      console.warn("Busy slots sync failed:", error);
      renderBusySlots();
      renderCalendarDayList();
    }
  }

  async function saveRemoteBusySlot(slot) {
    if (USE_PLATFORM_API) return;
    const body = new URLSearchParams({
      action: "busySlot",
      token: OPERATOR_TOKEN,
      id: slot.id,
      date: slot.date,
      start: slot.start,
      end: slot.end,
      label: slot.label || "",
      source: "operator"
    });

    try {
      await fetch(API_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
    } catch (error) {
      console.warn("Busy slot save failed:", error);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Cannot read photo"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Cannot decode photo"));
      image.src = dataUrl;
    });
  }

  async function compressCargoPhoto(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(originalDataUrl);
    const width = image.naturalWidth || image.width || PHOTO_MAX_SIDE;
    const height = image.naturalHeight || image.height || PHOTO_MAX_SIDE;
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY),
      width: targetWidth,
      height: targetHeight,
      fileName: String(file.name || `cargo-${Date.now()}.jpg`).replace(/\.[^.]+$/, ".jpg"),
      mimeType: "image/jpeg"
    };
  }

  function patchCargoPhoto(orderId, photoIdValue, patch) {
    const index = state.orders.findIndex((order) => order.id === orderId);
    if (index < 0) return;
    const order = {
      ...state.orders[index],
      cargoPhotos: normalizeCargoPhotos(state.orders[index].cargoPhotos).map((photo) => (
        photo.id === photoIdValue ? { ...photo, ...patch } : photo
      )),
      updatedAt: new Date().toISOString()
    };
    state.orders[index] = order;
    saveOrders();
    render();
    if (state.selectedId === orderId) renderCargoPhotos(order);
  }

  async function loadRemotePhotosForOrder(orderId) {
    if (USE_PLATFORM_API) return;
    if (!API_ENDPOINT || !orderId) return;
    try {
      const data = await fetchJson(`${API_ENDPOINT}?action=photos&order_id=${encodeURIComponent(orderId)}`);
      const remotePhotos = normalizeCargoPhotos(Array.isArray(data.photos) ? data.photos : []);
      if (!remotePhotos.length) return;
      const index = state.orders.findIndex((order) => order.id === orderId);
      if (index < 0) return;
      const order = {
        ...state.orders[index],
        cargoPhotos: mergeCargoPhotos(state.orders[index].cargoPhotos, remotePhotos)
      };
      state.orders[index] = order;
      saveOrders();
      render();
      if (state.selectedId === orderId) renderCargoPhotos(order);
    } catch (error) {
      console.warn("Cargo photo sync failed:", error);
    }
  }

  async function uploadCargoPhoto(order, photo) {
    if (USE_PLATFORM_API) {
      patchCargoPhoto(order.id, photo.id, { uploadStatus: "uploaded" });
      return;
    }
    if (!API_ENDPOINT) return;
    patchCargoPhoto(order.id, photo.id, { uploadStatus: "uploading" });
    const imageData = String(photo.dataUrl || "").split(",").pop();
    const body = new URLSearchParams({
      action: "cargoPhoto",
      token: OPERATOR_TOKEN,
      order_id: order.id,
      photo_id: photo.id,
      created_at: photo.createdAt,
      order_title: `${order.clientName || "Klient"} ${order.jobDate || ""} ${order.jobTime || ""}`.trim(),
      file_name: photo.fileName,
      mime_type: photo.mimeType,
      image_data: imageData,
      source: "operator"
    });

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Photo upload failed");
      const remote = data.photo || {};
      patchCargoPhoto(order.id, photo.id, {
        url: remote.drive_url || remote.url || "",
        thumbUrl: remote.thumb_url || remote.drive_url || "",
        uploadStatus: "uploaded"
      });
      notify("Koorma foto on serveris.");
    } catch (error) {
      try {
        await fetch(API_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        patchCargoPhoto(order.id, photo.id, { uploadStatus: "sent" });
        setTimeout(() => loadRemotePhotosForOrder(order.id), 4500);
      } catch (fallbackError) {
        console.warn("Cargo photo upload failed:", fallbackError || error);
        patchCargoPhoto(order.id, photo.id, { uploadStatus: "failed" });
        notify("Foto jäi telefoni. Interneti või serveri korral proovi hiljem uuesti.");
      }
    }
  }

  async function handleCargoPhotoFile(file) {
    if (!file) return;
    const current = readForm();
    const compressed = await compressCargoPhoto(file);
    const status = current.status === "new" ? "confirmed" : current.status;
    const photo = {
      id: photoId(),
      orderId: current.id,
      createdAt: new Date().toISOString(),
      fileName: compressed.fileName,
      mimeType: compressed.mimeType,
      dataUrl: compressed.dataUrl,
      uploadStatus: "pending"
    };
    const order = {
      ...current,
      status,
      cargoPhotos: [photo, ...normalizeCargoPhotos(current.cargoPhotos)].slice(0, MAX_LOCAL_CARGO_PHOTOS),
      updatedAt: new Date().toISOString()
    };
    upsertOrder(order);
    fillForm(order);
    notify("Foto salvestatud tellimuse juurde. Saadan serverisse...");
    uploadCargoPhoto(order, photo);
  }

  function syncPendingCargoPhotos() {
    const uploads = [];
    state.orders.forEach((order) => {
      normalizeCargoPhotos(order.cargoPhotos).forEach((photo) => {
        if (["pending", "failed", "sent"].includes(photo.uploadStatus) && photo.dataUrl) {
          uploads.push(uploadCargoPhoto(order, photo));
        } else if (photo.uploadStatus === "sent") {
          uploads.push(loadRemotePhotosForOrder(order.id));
        }
      });
    });
    return Promise.allSettled(uploads);
  }

  async function syncAll() {
    if (!isOnline()) {
      renderSyncStatus();
      return;
    }

    state.syncing = true;
    renderSyncStatus();
    await Promise.allSettled([
      syncPendingOrders(),
      syncPendingExpenses(),
      syncPendingCargoPhotos()
    ]);

    await Promise.allSettled([
      loadRemoteOrders(),
      loadRemoteBusySlots(),
      loadRemoteExpenses()
    ]);

    await Promise.allSettled([
      syncPendingOrders(),
      syncPendingExpenses(),
      syncPendingCargoPhotos()
    ]);
    rememberSyncNow();
    state.syncing = false;
    render();
  }

  function renderBusySlots() {
    const list = $("#busyList");
    if (!list) return;

    const upcoming = state.busySlots
      .filter((slot) => slot.date >= todayISO())
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 10);

    list.replaceChildren();
    if (!upcoming.length) {
      const empty = document.createElement("span");
      empty.className = "busySlot";
      empty.textContent = "Kinni pandud aegu pole";
      list.append(empty);
      return;
    }

    upcoming.forEach((slot) => {
      const chip = document.createElement("span");
      chip.className = "busySlot";
      chip.textContent = `${slot.date} ${slot.start}-${slot.end}${slot.label ? ` · ${slot.label}` : ""}`;
      list.append(chip);
    });
  }

  function addBusySlotFromForm() {
    const date = $("#busyDate").value || todayISO();
    const start = $("#busyStart").value || "09:00";
    const end = $("#busyEnd").value || "11:00";
    const label = $("#busyLabel").value.trim() || "Objekt";

    if (end <= start) {
      alert("Lõppaeg peab olema hilisem kui algusaeg.");
      return;
    }

    const slot = {
      id: busyId(),
      date,
      start,
      end,
      label
    };

    state.busySlots.push(slot);
    saveBusySlots();
    renderBusySlots();
    renderCalendarDayList();
    saveRemoteBusySlot(slot);
    $("#busyLabel").value = "";
  }

  function switchTab(tabName) {
    const nextTab = $(`[data-tab="${tabName}"]`) ? tabName : "today";
    state.activeTab = nextTab;
    localStorage.setItem(TAB_STORAGE_KEY, nextTab);

    $$("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === nextTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });

    $$("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === nextTab;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    if (nextTab === "orders") {
      $("#searchInput")?.focus({ preventScroll: true });
    }
  }

  function formatOrderTime(order) {
    return [order.jobDate, order.jobTime].filter(Boolean).join(" ") || "Aeg puudub";
  }

  function sortedWorkOrders() {
    return state.orders
      .filter(isWorkOrder)
      .sort((a, b) => `${a.jobDate || "9999-12-31"} ${a.jobTime || "23:59"}`.localeCompare(`${b.jobDate || "9999-12-31"} ${b.jobTime || "23:59"}`));
  }

  function getDashboardTotals() {
    const today = todayISO();
    const month = monthISO();
    const workOrders = state.orders.filter(isWorkOrder);
    const todayOrders = workOrders.filter((order) => order.jobDate === today);
    const monthOrders = workOrders.filter((order) => String(order.jobDate || "").startsWith(month));
    const invoiceOrders = state.orders.filter((order) => !isHiddenOrder(order) && order.invoiceNumber);
    const unpaidInvoices = invoiceOrders.filter((order) => order.paymentStatus !== "paid");
    const paidInvoices = invoiceOrders.filter((order) => order.paymentStatus === "paid");
    const monthExpenses = expensesForMonth(month);
    const monthExpenseTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthRevenue = monthOrders.reduce((sum, order) => sum + orderTotal(order), 0);
    const visibleOrders = state.orders.filter((order) => !isHiddenOrder(order));

    return {
      todayOrders,
      todayRevenue: todayOrders.reduce((sum, order) => sum + orderTotal(order), 0),
      monthRevenue,
      monthExpenseTotal,
      monthResult: monthRevenue - monthExpenseTotal,
      unpaidInvoices,
      unpaidRevenue: unpaidInvoices.reduce((sum, order) => sum + orderTotal(order), 0),
      paidRevenue: paidInvoices.reduce((sum, order) => sum + orderTotal(order), 0),
      activeCount: visibleOrders.filter(isActiveOrder).length,
      newCount: visibleOrders.filter((order) => order.status === "new").length,
      doneCount: visibleOrders.filter((order) => order.status === "done").length,
      invoiceCount: invoiceOrders.length
    };
  }

  function createCompactOrderCard(order) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compactItem";
    button.innerHTML = `
      <strong>
        <span>${escapeHtml(order.clientName || "Nimetu klient")}</span>
        <b>${money(orderTotal(order))}</b>
      </strong>
      <span>${escapeHtml(formatOrderTime(order))} · ${escapeHtml(order.serviceType || "Kaubavedu")}</span>
      <small>${escapeHtml(order.pickupAddress || "Algus puudub")} → ${escapeHtml(order.deliveryAddress || "Siht puudub")}</small>
      <i class="statusPill" data-status="${order.status || "new"}">${statusLabels[order.status] || "Uus"}</i>
    `;
    button.addEventListener("click", () => selectOrder(order));
    return button;
  }

  function renderDashboard() {
    const totals = getDashboardTotals();
    const nextCard = $("#nextTripCard");
    const todayList = $("#todayTripList");

    const nextOrder = sortedWorkOrders().find((order) => {
      const orderKey = `${order.jobDate || "9999-12-31"} ${order.jobTime || "23:59"}`;
      return orderKey >= `${todayISO()} 00:00` && ["new", "confirmed", "active"].includes(order.status);
    });

    if (nextCard) {
      if (nextOrder) {
        nextCard.innerHTML = `
          <p class="eyebrow">Järgmine sõit</p>
          <h1>${escapeHtml(nextOrder.jobTime || nextOrder.jobDate || "Aeg puudub")}</h1>
          <p><strong>${escapeHtml(nextOrder.clientName || "Klient")}</strong><br>${escapeHtml(nextOrder.pickupAddress || "Algus puudub")} → ${escapeHtml(nextOrder.deliveryAddress || "Siht puudub")}</p>
          <button class="primaryBtn" type="button" data-next-order="${escapeHtml(nextOrder.id)}">Ava reis</button>
        `;
        nextCard.querySelector("[data-next-order]")?.addEventListener("click", () => selectOrder(nextOrder));
      } else {
        nextCard.innerHTML = `
          <p class="eyebrow">Järgmine sõit</p>
          <h1>Vaba aeg</h1>
          <p>Täna ei ole aktiivset reisi järjekorras. Vajadusel lisa tellimus või pane kalender kinni.</p>
        `;
      }
    }

    if (todayList) {
      todayList.replaceChildren();
      const todayOrders = totals.todayOrders
        .sort((a, b) => `${a.jobTime || "23:59"}`.localeCompare(`${b.jobTime || "23:59"}`));
      if (!todayOrders.length) {
        todayList.innerHTML = '<div class="emptyState"><strong>Tänaseid reise pole</strong><span>Kui objekt tekib, lisa reis või broneeri aeg kalendris.</span></div>';
      } else {
        todayOrders.forEach((order) => todayList.append(createCompactOrderCard(order)));
      }
    }

    renderMoneyFlow($("#moneyFlowList"));
    renderMoneyFlow($("#invoiceMoneyFlow"));
  }

  function renderMoneyFlow(container) {
    if (!container) return;
    const totals = getDashboardTotals();
    const rows = [
      ["Tasumata arved", totals.unpaidRevenue, `${totals.unpaidInvoices.length} tk`],
      ["Tasutud arved", totals.paidRevenue, "laekunud"],
      ["Tänane plaan", totals.todayRevenue, `${totals.todayOrders.length} reisi`],
      ["Kuu töömaht", totals.monthRevenue, monthISO()],
      ["Kuu kulud", totals.monthExpenseTotal, "kulu"],
      ["Kuu tulem", totals.monthResult, "enne makse"]
    ];

    container.replaceChildren();
    rows.forEach(([label, value, meta]) => {
      const item = document.createElement("div");
      item.className = "moneyItem";
      item.innerHTML = `
        <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(meta)}</small></span>
        <b>${money(value)}</b>
      `;
      container.append(item);
    });
  }

  function renderExpenses() {
    const monthInput = $("#expenseMonth");
    if (monthInput && !monthInput.value) monthInput.value = monthISO();
    const month = monthInput?.value || monthISO();
    const summary = accountingSummary(month);
    const summaryContainer = $("#expenseSummary");
    const list = $("#expenseList");

    if (summaryContainer) {
      summaryContainer.replaceChildren();
      [
        ["Kuu tulud", summary.revenue, `${summary.orders.length} reisi`],
        ["Kuu kulud", summary.expenseTotal, `${summary.expenses.length} kirjet`],
        ["Tulem", summary.result, "enne makse"],
        ["Tasumata", summary.unpaidRevenue, "arved"]
      ].forEach(([label, value, meta]) => {
        const item = document.createElement("div");
        item.className = "moneyItem";
        item.innerHTML = `
          <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(meta)}</small></span>
          <b>${money(value)}</b>
        `;
        summaryContainer.append(item);
      });
    }

    if (!list) return;
    list.replaceChildren();
    if (!summary.expenses.length) {
      list.innerHTML = '<div class="emptyState"><strong>Kulusid pole</strong><span>Lisa kütus, remont, parkimine või muu tööga seotud kulu.</span></div>';
      return;
    }

    summary.expenses.forEach((expense) => {
      const item = document.createElement("div");
      item.className = "expenseItem";
      item.innerHTML = `
        <div>
          <strong><span>${escapeHtml(expenseLabels[expense.category] || "Kulu")}</span><b>${money(expense.amount)}</b></strong>
          <span>${escapeHtml(expense.date)} · ${escapeHtml(expense.vendor || "Partner puudub")}</span>
          <small>${escapeHtml(expense.description || expense.receiptNumber || "Kirjeldus puudub")}${expense.syncStatus !== "synced" ? ` · ${escapeHtml(expense.syncStatus)}` : ""}</small>
        </div>
        <button class="dangerBtn" type="button">Kustuta</button>
      `;
      item.querySelector("button")?.addEventListener("click", () => {
        if (confirm("Kas kustutada see kulu?")) deleteExpense(expense.id);
      });
      list.append(item);
    });
  }

  function renderReports() {
    const reportMonth = $("#reportMonth");
    const expenseMonth = $("#expenseMonth");
    if (reportMonth && !reportMonth.value) reportMonth.value = monthISO();
    if (expenseMonth && !expenseMonth.value) expenseMonth.value = monthISO();
    const month = selectedReportMonth();
    if (reportMonth && reportMonth.value !== month) reportMonth.value = month;
    const summary = accountingSummary(month);
    const metrics = $("#reportMetrics");
    const rows = $("#reportRows");

    if (metrics) {
      metrics.replaceChildren();
      [
        ["Tulu kokku", summary.revenue, `${summary.orders.length} reisi`, ""],
        ["Laekunud", summary.paidRevenue, "tasutud", "good"],
        ["Tasumata", summary.unpaidRevenue, "ootab", "warn"],
        ["Kulud", summary.expenseTotal, `${summary.expenses.length} kirjet`, "bad"],
        ["Tulem", summary.result, "enne makse", summary.result >= 0 ? "good" : "bad"],
        ["Arveid", summary.invoiceCount, "loodud", ""],
        ["Lõpetatud", summary.completedCount, "reisi", ""],
        ["Kuu", month, "aruande periood", ""]
      ].forEach(([label, value, meta, tone]) => {
        const card = document.createElement("article");
        card.className = "reportMetric";
        if (tone) card.dataset.tone = tone;
        card.innerHTML = `
          <span>${escapeHtml(label)}</span>
          <strong>${typeof value === "number" ? money(value) : escapeHtml(value)}</strong>
          <small>${escapeHtml(meta)}</small>
        `;
        metrics.append(card);
      });
    }

    if (!rows) return;
    rows.replaceChildren();
    const reportRows = [
      ...summary.orders.map((order) => ({
        type: "Tulu",
        date: order.jobDate || "",
        title: order.invoiceNumber || order.clientName || "Tellimus",
        amount: orderTotal(order),
        meta: `${paymentLabels[order.paymentStatus] || "Tasumata"} · ${order.pickupAddress || "-"} → ${order.deliveryAddress || "-"}`
      })),
      ...summary.expenses.map((expense) => ({
        type: "Kulu",
        date: expense.date,
        title: expense.vendor || expenseLabels[expense.category] || "Kulu",
        amount: -expense.amount,
        meta: `${expenseLabels[expense.category] || "Muu"} · ${expense.description || expense.receiptNumber || ""}`
      }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (!reportRows.length) {
      rows.innerHTML = '<div class="emptyState"><strong>Aruande ridu pole</strong><span>Valitud kuus ei ole veel reise ega kulusid.</span></div>';
      return;
    }

    reportRows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "reportRow";
      item.innerHTML = `
        <div>
          <strong><span>${escapeHtml(row.type)} · ${escapeHtml(row.title)}</span><b>${money(row.amount)}</b></strong>
          <span>${escapeHtml(row.date || "Kuupäev puudub")}</span>
          <small>${escapeHtml(row.meta)}</small>
        </div>
      `;
      rows.append(item);
    });
  }

  function pendingSyncCount() {
    const pendingOrders = state.orders.filter((order) => ["pending", "offline", "failed", "sending", "sent"].includes(order.syncStatus)).length;
    const pendingExpenses = state.expenses.map(normalizeExpense).filter((expense) => ["pending", "offline", "failed", "sending", "sent"].includes(expense.syncStatus)).length;
    const pendingPhotos = state.orders.reduce((sum, order) => (
      sum + normalizeCargoPhotos(order.cargoPhotos).filter((photo) => ["pending", "offline", "failed", "sent", "uploading"].includes(photo.uploadStatus)).length
    ), 0);
    return pendingOrders + pendingExpenses + pendingPhotos;
  }

  function formatSyncTime(value) {
    if (!value) return "Sünkrooni pole veel tehtud";
    try {
      return new Intl.DateTimeFormat("et-EE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function renderSyncStatus() {
    const banner = $("#syncBanner");
    const title = $("#syncTitle");
    const detail = $("#syncDetail");
    if (!banner || !title || !detail) return;

    const pending = pendingSyncCount();
    const online = isOnline();
    if (USE_PLATFORM_API && !selectedToken()) {
      banner.dataset.status = "offline";
      title.textContent = "Ühendus vajab admin tokenit";
      detail.textContent = "Tellimusi ei saa laadida enne, kui operaatori ligipääs on seadistatud.";
      return;
    }
    const status = state.syncing ? "syncing" : (online ? "online" : "offline");
    banner.dataset.status = status;
    title.textContent = state.syncing
      ? "Sünkroonin andmeid"
      : online
        ? "Online"
        : "Offline";
    const pendingText = pending ? `${pending} muudatust ootab saatmist` : "Kõik kohalikud muudatused on saadetud";
    const sourceText = USE_PLATFORM_API ? "Elav arides.ee tellimuste baas" : "Google Workspace server";
    detail.textContent = `${sourceText}. ${pendingText}. Viimane sünkroon: ${formatSyncTime(state.lastSyncAt)}.`;
  }

  function filteredOrders() {
    const filter = $("#statusFilter").value;
    const search = $("#searchInput").value.trim().toLowerCase();

    return state.orders
      .filter((order) => !isHiddenOrder(order))
      .filter((order) => filter === "all" || order.status === filter)
      .filter((order) => {
        if (!search) return true;
        return [
          order.clientName,
          order.clientPhone,
          order.pickupAddress,
          order.deliveryAddress,
          order.serviceType
        ].join(" ").toLowerCase().includes(search);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function renderStats() {
    const totals = getDashboardTotals();
    $("#statTodayRevenue").textContent = money(totals.todayRevenue);
    $("#statTodayCount").textContent = `${totals.todayOrders.length} reisi`;
    $("#statUnpaidRevenue").textContent = money(totals.unpaidRevenue);
    $("#statInvoiceCount").textContent = `${totals.invoiceCount} arvet`;
    $("#statMonthRevenue").textContent = money(totals.monthRevenue);
    $("#statDoneCount").textContent = `Tulem ${money(totals.monthResult)}`;
    $("#statActive").textContent = totals.activeCount;
    $("#statNewCount").textContent = `${totals.newCount} uut`;
  }

  function websiteEstimateAmount(order) {
    if (order.websiteEstimateTotal !== "" && order.websiteEstimateTotal !== undefined && order.websiteEstimateTotal !== null) {
      return Number(order.websiteEstimateTotal) || 0;
    }
    return Number(order.estimatedTotal) || 0;
  }

  function renderWebsiteEstimate(order = readForm()) {
    const card = $("#websiteEstimateCard");
    if (!card) return;
    const amount = websiteEstimateAmount(order);
    const value = order.websiteEstimateValue || (amount ? money(amount) : "");
    const meta = order.websiteEstimateMeta || order.websiteEstimateText || "";
    const map = $("#websiteEstimateMap");
    if (!amount && !value && !meta) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $("#websiteEstimateTotal").textContent = value || money(amount);
    $("#websiteEstimateMeta").textContent = meta || "Klient nägi seda hinda veebilehel broneerimise ajal.";
    if (map) {
      if (order.websiteEstimateMapUrl) {
        map.hidden = false;
        map.href = order.websiteEstimateMapUrl;
      } else {
        map.hidden = true;
        map.removeAttribute("href");
      }
    }
  }

  function renderOrderSummary(order = readForm()) {
    const card = $("#orderSummaryCard");
    const title = $("#orderSummaryTitle");
    const meta = $("#orderSummaryMeta");
    const chips = $("#orderSummaryChips");
    if (!card || !title || !meta || !chips) return;

    const client = order.clientName || "Uus tellimus";
    const route = [order.pickupAddress, order.deliveryAddress].filter(Boolean).join(" → ") || "Marsruut puudu";
    const deposit = depositAmount(order);

    title.textContent = client;
    meta.textContent = `${order.serviceType || "Kaubavedu"} · ${route}`;

    chips.replaceChildren();
    summaryChips(order).forEach((text) => {
      const chip = document.createElement("span");
      chip.className = "summaryChip";
      chip.textContent = text;
      chips.append(chip);
    });

    const depositChip = document.createElement("span");
    depositChip.className = `summaryChip${deposit > 0 ? " summaryChip--accent" : ""}`;
    depositChip.textContent = deposit > 0
      ? `Ettemaks ${money(deposit)}`
      : order.paymentStatus === "pending"
        ? "Ettemaks ootel"
        : "Ettemaks pole vaja";
    chips.append(depositChip);
  }

  function renderOrders() {
    const list = $("#orderList");
    const orders = filteredOrders();
    list.replaceChildren();

    if (!orders.length) {
      list.append($("#emptyOrdersTemplate").content.cloneNode(true));
      return;
    }

    orders.forEach((order) => {
      const total = calculateOrder(order).finalPrice;
      const photoCount = normalizeCargoPhotos(order.cargoPhotos).length;
      const siteAmount = websiteEstimateAmount(order);
      const siteText = siteAmount ? ` · sait ${money(siteAmount)}` : "";
      const paymentText = paymentBadge(order);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `orderItem${order.id === state.selectedId ? " is-active" : ""}`;
      button.innerHTML = `
        <strong>
          <span>${escapeHtml(order.clientName || "Nimetu klient")}</span>
          <b>${money(total)}</b>
        </strong>
        <span>${escapeHtml(order.serviceType || "Kaubavedu")} · ${escapeHtml(order.jobDate || "")} ${escapeHtml(order.jobTime || "")}</span>
        <small>${escapeHtml(order.pickupAddress || "Algus puudub")} → ${escapeHtml(order.deliveryAddress || "Siht puudub")}${escapeHtml(siteText)}${photoCount ? ` · ${photoCount} fotot` : ""}</small>
        <small>${escapeHtml(paymentText)}${order.invoiceDueDate ? ` · tähtaeg ${escapeHtml(order.invoiceDueDate)}` : ""}${order.depositNote ? ` · ${escapeHtml(order.depositNote)}` : ""}</small>
        <i class="statusPill" data-status="${order.status || "new"}">${statusLabels[order.status] || "Uus"}</i>
      `;
      button.addEventListener("click", () => selectOrder(order, { stayOnTab: true }));
      list.append(button);
    });
  }

  function renderCargoPhotos(order = readForm()) {
    const grid = $("#cargoPhotoGrid");
    const hint = $("#cargoPhotoHint");
    const button = $("#cargoPhotoBtn");
    if (!grid || !hint || !button) return;

    const photos = normalizeCargoPhotos(order.cargoPhotos);
    const activeEnough = Boolean(order.id) && order.status !== "cancelled";
    button.disabled = !activeEnough;
    button.textContent = photos.length ? `Lisa foto (${photos.length})` : "Pildista koorem";

    const uploaded = photos.filter((photo) => photo.uploadStatus === "uploaded").length;
    const pending = photos.filter((photo) => ["pending", "uploading", "sent", "failed"].includes(photo.uploadStatus)).length;
    if (!photos.length) {
      hint.textContent = "Pildista koorem enne sõitu, et vaidluse korral oleks tõend olemas.";
    } else if (pending) {
      hint.textContent = `${photos.length} fotot salvestatud, ${pending} ootab kinnitust serverist.`;
    } else {
      hint.textContent = `${uploaded || photos.length} fotot on selle tellimuse juures serveris olemas.`;
    }

    grid.replaceChildren();
    photos.forEach((photo) => {
      const card = document.createElement(photo.url ? "a" : "div");
      card.className = "cargoPhotoCard";
      card.dataset.status = photo.uploadStatus || "pending";
      if (photo.url) {
        card.href = photo.url;
        card.target = "_blank";
        card.rel = "noopener";
      }
      const imageSrc = photo.dataUrl || photo.thumbUrl || photo.url || "";
      card.innerHTML = `
        ${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="Koorma foto" loading="lazy" />` : ""}
        <strong>${escapeHtml(photo.fileName || "Koorma foto")}</strong>
        <small>${escapeHtml(cargoPhotoStatusLabel(photo.uploadStatus))}</small>
      `;
      grid.append(card);
    });
  }

  function renderInvoiceList() {
    const list = $("#invoiceList");
    if (!list) return;

    const invoiceOrders = state.orders
      .filter((order) => !isHiddenOrder(order))
      .filter((order) => order.invoiceNumber || order.status === "done" || orderTotal(order) > 0)
      .sort((a, b) => String(b.invoiceCreatedAt || b.updatedAt || b.createdAt).localeCompare(String(a.invoiceCreatedAt || a.updatedAt || a.createdAt)));

    list.replaceChildren();
    if (!invoiceOrders.length) {
      list.innerHTML = '<div class="emptyState"><strong>Arveid veel pole</strong><span>Loo arve reisi kaardilt, kui hind on kokku lepitud.</span></div>';
      return;
    }

    invoiceOrders.forEach((order) => {
      const item = document.createElement("div");
      item.className = "invoiceItem";
      const paymentStatus = paymentBadge(order);
      const invoiceNumber = order.invoiceNumber || "Arve puudub";
      item.innerHTML = `
        <div>
          <strong>
            <span>${escapeHtml(invoiceNumber)}</span>
            <b>${money(orderTotal(order))}</b>
          </strong>
          <span>${escapeHtml(order.clientName || "Klient")} · ${escapeHtml(formatOrderTime(order))}</span>
          <small>${escapeHtml(paymentStatus)}${order.invoiceDueDate ? ` · tähtaeg ${escapeHtml(order.invoiceDueDate)}` : ""}</small>
        </div>
        <button class="ghostBtn" type="button">Ava</button>
      `;
      item.querySelector("button")?.addEventListener("click", () => {
        selectOrder(order);
        renderInvoice(order, true);
      });
      list.append(item);
    });
  }

  function renderCalendarDayList() {
    const list = $("#calendarDayList");
    if (!list) return;

    const orderItems = sortedWorkOrders()
      .filter((order) => order.jobDate >= todayISO())
      .slice(0, 8)
      .map((order) => ({
        type: "order",
        key: `${order.jobDate} ${order.jobTime || "23:59"}`,
        order
      }));

    const busyItems = state.busySlots
      .filter((slot) => slot.date >= todayISO())
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 8)
      .map((slot) => ({
        type: "busy",
        key: `${slot.date} ${slot.start}`,
        slot
      }));

    const items = [...orderItems, ...busyItems]
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, 12);

    list.replaceChildren();
    if (!items.length) {
      list.innerHTML = '<div class="emptyState"><strong>Lähemaid aegu pole</strong><span>Lisa reis või broneeri paus/objekt.</span></div>';
      return;
    }

    items.forEach((item) => {
      if (item.type === "order") {
        list.append(createCompactOrderCard(item.order));
        return;
      }

      const chip = document.createElement("div");
      chip.className = "compactItem";
      chip.innerHTML = `
        <strong><span>${escapeHtml(item.slot.label || "Kinni")}</span><b>${escapeHtml(item.slot.start)}-${escapeHtml(item.slot.end)}</b></strong>
        <span>${escapeHtml(item.slot.date)}</span>
        <small>Kalendris kinni pandud aeg</small>
      `;
      list.append(chip);
    });
  }

  function selectOrder(order, options = {}) {
    fillForm(order);
    if (!options.stayOnTab) switchTab("orders");
    $("#invoicePanel").hidden = true;
    loadRemotePhotosForOrder(order.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    renderStats();
    renderDashboard();
    renderOrders();
    renderInvoiceList();
    renderExpenses();
    renderReports();
    renderBusySlots();
    renderCalendarDayList();
    renderSyncStatus();
    const selected = state.orders.find((order) => order.id === state.selectedId);
    if (selected) {
      renderOrderSummary(selected);
      renderInvoice(selected, $("#invoicePanel").hidden === false);
    }
  }

  function updateTotalPreview() {
    const order = readForm();
    const total = calculateOrder(order);
    $("#orderTotal").textContent = money(total.finalPrice);
    $("#orderTotalHint").textContent = order.finalPrice === ""
      ? `Arvutatud: tunnid ${money(total.base)}, km ${money(total.km)}, abi ${money(total.helper)}, lisad ${money(total.extra)}.`
      : `Käsitsi kinnitatud lõpphind. Arvutus enne korrigeerimist: ${money(total.calculated)}.`;
    updateRouteSummary(order);
    renderWebsiteEstimate(order);
  }

  function invoiceRows(order) {
    const total = calculateOrder(order);
    const rows = [];
    if (Number(order.hours) > 0) {
      rows.push({
        name: `Veoteenus - ${order.serviceType || "Kaubavedu"}`,
        qty: number(order.hours),
        unit: "h",
        price: Number(order.hourRate) || 0,
        total: total.base
      });
    }
    if (Number(order.kilometers) > 0) {
      rows.push({
        name: "Kilomeetrid / sõidukulu",
        qty: number(order.kilometers, 1),
        unit: "km",
        price: Number(order.kmRate) || 0,
        total: total.km
      });
    }
    if (Number(order.helperHours) > 0) {
      rows.push({
        name: "Laadimis- ja kandeabi",
        qty: number(order.helperHours),
        unit: "h",
        price: Number(order.helperRate) || 0,
        total: total.helper
      });
    }
    if (Number(order.extraFee) > 0) {
      rows.push({
        name: "Lisatasud / eritingimused",
        qty: "1,00",
        unit: "tk",
        price: Number(order.extraFee) || 0,
        total: total.extra
      });
    }
    if (!rows.length) {
      rows.push({
        name: `Veoteenus - ${order.serviceType || "Kaubavedu"}`,
        qty: "1,00",
        unit: "tk",
        price: total.finalPrice,
        total: total.finalPrice
      });
    }
    if (order.finalPrice !== "" && Math.abs(total.finalPrice - total.calculated) > 0.009) {
      rows.push({
        name: "Lõpphinna korrigeerimine kokkuleppel",
        qty: "1,00",
        unit: "tk",
        price: total.finalPrice - total.calculated,
        total: total.finalPrice - total.calculated
      });
    }
    return rows;
  }

  function renderInvoice(order, show = true) {
    const panel = $("#invoicePanel");
    const sheet = $("#invoiceSheet");
    if (!show) {
      panel.hidden = true;
      return;
    }

    const invoiceNumber = order.invoiceNumber || nextInvoiceNumber(order.jobDate || todayISO(), order.id);
    const invoiceDate = todayISO();
    const dueDate = order.invoiceDueDate || addDaysISO(invoiceDate, order.invoiceDueDays || 7);
    const rows = invoiceRows(order);
    const total = calculateOrder(order).finalPrice;
    const deposit = depositAmount(order);
    const invoiceTitle = deposit > 0 || order.paymentStatus === "pending" ? "ETTEMAKSU ARVE" : "ARVE";

    sheet.innerHTML = `
      <div class="invoiceTop">
        <div class="invoiceLogo">
          <img src="./img/ui/logo-veoteenus.png" alt="" />
          <div>
            <strong>${BRAND_NAME}</strong>
            <span>Kaubavedu ja kolimine</span>
          </div>
        </div>
        <div class="invoiceMeta">
          <h2>${escapeHtml(invoiceTitle)} ${escapeHtml(invoiceNumber)}</h2>
          <p>Kuupäev: ${escapeHtml(invoiceDate)}</p>
          <p>Maksetähtaeg: ${escapeHtml(dueDate)}</p>
          <p>Makseviis: kokkuleppel</p>
          ${deposit > 0 ? `<p>Ettemaks: ${money(deposit)}${order.depositNote ? ` · ${escapeHtml(order.depositNote)}` : ""}</p>` : ""}
        </div>
      </div>

      <div class="invoiceGrid">
        <div class="invoiceBox">
          <h3>Müüja</h3>
          <strong>${COMPANY.name}</strong><br />
          Registrikood: ${COMPANY.registryCode}<br />
          KMKR: puudub, käibemaksu ei lisandu<br />
          ${COMPANY.address}<br />
          Tel: ${COMPANY.phone}<br />
          E-post: ${COMPANY.email}<br />
          ${COMPANY.website}
        </div>
        <div class="invoiceBox">
          <h3>Klient</h3>
          <strong>${escapeHtml(order.clientName || "Klient")}</strong><br />
          ${escapeHtml(order.clientPhone || "")}<br />
          ${escapeHtml(order.clientEmail || "")}<br />
          ${escapeHtml(order.clientType === "company" ? "Ettevõte" : "Eraisik")}
        </div>
      </div>

      <div class="invoiceBox">
        <h3>Tellimuse info</h3>
        Teenus: ${escapeHtml(order.serviceType || "Kaubavedu")}<br />
        Kuupäev ja aeg: ${escapeHtml(order.jobDate || "")} ${escapeHtml(order.jobTime || "")}<br />
        Marsruut: ${escapeHtml(order.pickupAddress || "-")} → ${escapeHtml(order.deliveryAddress || "-")}<br />
        ${order.extraStops ? `Lisapeatused: ${escapeHtml(order.extraStops)}<br />` : ""}
        ${order.kilometers ? `Kilometraaž: ${number(order.kilometers, 1)} km<br />` : ""}
        ${order.cargoDetails ? `Koorem: ${escapeHtml(order.cargoDetails)}<br />` : ""}
      </div>

      <table class="invoiceTable">
        <thead>
          <tr>
            <th>Kirjeldus</th>
            <th>Kogus</th>
            <th>Ühik</th>
            <th>Hind</th>
            <th>Summa</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.name)}</td>
              <td>${escapeHtml(row.qty)}</td>
              <td>${escapeHtml(row.unit)}</td>
              <td>${money(row.price)}</td>
              <td>${money(row.total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="invoiceSummary">
        <p><span>Vahesumma</span><strong>${money(total)}</strong></p>
        <p><span>Käibemaks</span><strong>Ei lisandu</strong></p>
        <p><span>Kokku tasuda</span><strong>${money(total)}</strong></p>
      </div>

      ${deposit > 0 ? `
        <div class="invoiceDepositBox">
          <strong>Ettemaksu arvestus</strong>
          <p>Soovitud ettemaks: ${money(deposit)}${Number(order.depositPercent) > 0 ? ` (${Number(order.depositPercent)}%)` : ""}.</p>
          <p>Ülejäänud summa: ${money(Math.max(0, total - deposit))}.</p>
        </div>
      ` : ""}

      <p>Ettevõte ei ole käibemaksukohustuslane, käibemaksu ei lisandu.</p>
      <p>Pangaandmed / makseviis: kokkuleppel.</p>

      <div class="invoiceTotal">
        <div>
          <span>Tasumisele kuulub</span>
          <strong>${money(total)}</strong>
        </div>
      </div>
    `;

    panel.hidden = false;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function saveInvoiceToOrder(show = true) {
    const order = readForm();
    order.invoiceNumber = order.invoiceNumber || nextInvoiceNumber(order.jobDate || todayISO(), order.id);
    order.invoiceCreatedAt = order.invoiceCreatedAt || new Date().toISOString();
    order.invoiceDueDate = order.invoiceDueDate || addDaysISO(todayISO(), order.invoiceDueDays || 7);
    upsertOrder(order);
    fillForm(order);
    renderInvoice(order, show);
    return order;
  }

  function isInvoiceModalOpen() {
    const modal = $("#invoiceModal");
    return Boolean(modal && !modal.hidden);
  }

  function syncInvoiceModalToPanel() {
    if (!isInvoiceModalOpen()) return;
    const modalSheet = $("#invoiceModalSheet");
    const sheet = $("#invoiceSheet");
    if (modalSheet && sheet) sheet.innerHTML = modalSheet.innerHTML;
  }

  function openInvoiceModal() {
    const order = saveInvoiceToOrder(true);
    const modal = $("#invoiceModal");
    const modalSheet = $("#invoiceModalSheet");
    const sheet = $("#invoiceSheet");
    const recipient = $("#invoiceRecipientEmail");
    if (!modal || !modalSheet || !sheet) return;

    modalSheet.innerHTML = sheet.innerHTML;
    if (recipient) recipient.value = order.clientEmail || "";
    modal.hidden = false;
    document.body.classList.add("invoice-modal-open");
    setTimeout(() => modalSheet.focus(), 0);
  }

  function closeInvoiceModal() {
    syncInvoiceModalToPanel();
    const modal = $("#invoiceModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("invoice-modal-open");
  }

  function currentInvoiceText() {
    if (isInvoiceModalOpen()) {
      return ($("#invoiceModalSheet")?.innerText || "").trim();
    }
    return ($("#invoiceSheet")?.innerText || "").trim();
  }

  function invoiceEmailBody(order, invoiceText) {
    const total = calculateOrder(order).finalPrice;
    const deposit = depositAmount(order);
    return [
      "Tere!",
      "",
      `Saadan ${BRAND_NAME} ${deposit > 0 ? "ettemaksu arve" : "arve"} ${order.invoiceNumber || ""}.`.trim(),
      order.invoiceDueDate ? `Maksetähtaeg: ${order.invoiceDueDate}` : "",
      `Summa kokku: ${money(total)}`,
      deposit > 0 ? `Ettemaks: ${money(deposit)}` : "",
      "",
      invoiceText,
      "",
      "Lugupidamisega",
      COMPANY.name,
      COMPANY.email,
      COMPANY.phone
    ].filter(Boolean).join("\n");
  }

  function sendInvoiceViaGmail() {
    const order = isInvoiceModalOpen()
      ? (state.orders.find((item) => item.id === state.selectedId) || readForm())
      : saveInvoiceToOrder(true);
    syncInvoiceModalToPanel();

    const recipientInput = $("#invoiceRecipientEmail");
    const recipient = isInvoiceModalOpen()
      ? (recipientInput?.value || "").trim()
      : (order.clientEmail || "").trim();
    const subject = encodeURIComponent(`${BRAND_NAME} arve ${order.invoiceNumber || ""}`.trim());
    const body = encodeURIComponent(invoiceEmailBody(order, currentInvoiceText()));
    const to = recipient ? encodeURIComponent(recipient) : "";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function printInvoice() {
    if (isInvoiceModalOpen()) {
      syncInvoiceModalToPanel();
      closeInvoiceModal();
      setTimeout(() => window.print(), 120);
      return;
    }

    saveInvoiceToOrder(true);
    window.print();
  }

  function downloadInvoice() {
    if (isInvoiceModalOpen()) {
      syncInvoiceModalToPanel();
    } else {
      saveInvoiceToOrder(true);
    }
    const order = state.orders.find((item) => item.id === state.selectedId) || readForm();
    const fileName = order.invoiceNumber || "arve";
    const html = `<!doctype html><html lang="et"><head><meta charset="UTF-8"><title>${fileName}</title><link rel="stylesheet" href="./operator.css"></head><body><main class="invoiceSheet">${$("#invoiceSheet").innerHTML}</main></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getNativeNotifications() {
    return window.Capacitor?.Plugins?.LocalNotifications || null;
  }

  function notificationId() {
    return Math.floor(Date.now() % 2147483000);
  }

  async function setupNotificationChannel() {
    const localNotifications = getNativeNotifications();
    if (!localNotifications?.createChannel) return;

    try {
      await localNotifications.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: `${BRAND_NAME} tellimused`,
        description: "Uued tellimused ja töö oleku teated",
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: "#1f73e0"
      });
    } catch (error) {
      console.warn("Notification channel setup failed:", error);
    }
  }

  async function getNotificationPermission() {
    const localNotifications = getNativeNotifications();
    if (localNotifications?.checkPermissions) {
      const status = await localNotifications.checkPermissions();
      return status.display || "denied";
    }

    if ("Notification" in window) return Notification.permission;
    return "denied";
  }

  function updateNotificationButton(status) {
    const button = $("#notifyBtn");
    if (!button) return;

    if (status === "granted") {
      button.textContent = "Teavitused sees";
      button.classList.add("is-enabled");
      return;
    }

    button.textContent = status === "denied" ? "Luba seadetes" : "Teavitused";
    button.classList.remove("is-enabled");
  }

  async function requestNotificationPermission() {
    const localNotifications = getNativeNotifications();

    if (localNotifications?.checkPermissions && localNotifications?.requestPermissions) {
      let status = await localNotifications.checkPermissions();
      if (status.display !== "granted") {
        status = await localNotifications.requestPermissions();
      }
      if (status.display === "granted") await setupNotificationChannel();
      updateNotificationButton(status.display);
      return status.display;
    }

    if (!("Notification" in window)) {
      updateNotificationButton("denied");
      return "denied";
    }

    const permission = await Notification.requestPermission();
    updateNotificationButton(permission);
    return permission;
  }

  async function initNotificationState() {
    try {
      const permission = await getNotificationPermission();
      updateNotificationButton(permission);
      if (permission === "granted") await setupNotificationChannel();
    } catch (error) {
      console.warn("Notification init failed:", error);
    }
  }

  async function notify(text, title = BRAND_NAME) {
    const localNotifications = getNativeNotifications();

    try {
      if (localNotifications?.schedule) {
        const permission = await getNotificationPermission();
        if (permission !== "granted") {
          updateNotificationButton(permission);
          return;
        }

        await setupNotificationChannel();
        await localNotifications.schedule({
          notifications: [{
            id: notificationId(),
            title,
            body: text,
            largeBody: text,
            summaryText: BRAND_NAME,
            channelId: NOTIFICATION_CHANNEL_ID,
            autoCancel: true
          }]
        });
        return;
      }

      if (!("Notification" in window) || Notification.permission !== "granted") return;
      new Notification(title, {
        body: text,
        icon: "./android-chrome-192x192.png"
      });
    } catch (error) {
      console.warn("Notification failed:", error);
    }
  }

  function openRoute(order) {
    if (!order.pickupAddress && !order.deliveryAddress) return;
    const params = new URLSearchParams({
      api: "1",
      travelmode: "driving"
    });
    if (order.pickupAddress) params.set("origin", order.pickupAddress);
    if (order.deliveryAddress) params.set("destination", order.deliveryAddress);
    if (order.extraStops) params.set("waypoints", order.extraStops);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener");
  }

  function getWazeTarget(order) {
    if (order.tripStage === "pickup_arrived") {
      return {
        address: order.deliveryAddress || "",
        buttonLabel: "Waze sihtkohta"
      };
    }

    return {
      address: order.pickupAddress || "",
      buttonLabel: "Waze laadima"
    };
  }

  function openWazeAddress(address) {
    if (!address) return;
    const params = new URLSearchParams({
      q: address,
      navigate: "yes"
    });
    window.open(`https://waze.com/ul?${params.toString()}`, "_blank", "noopener");
  }

  function updateRouteSummary(order = readForm()) {
    const title = $("#routeStageTitle");
    const targetLabel = $("#routeTargetLabel");
    const meta = $("#routeStageMeta");
    const line = $("#detailRouteLine");
    if (!title || !targetLabel || !meta || !line) return;

    const target = getWazeTarget(order);
    const isAfterPickup = order.tripStage === "pickup_arrived";
    title.textContent = isAfterPickup ? "Järgmine sihtkoht" : "Järgmine sõit";
    targetLabel.textContent = target.address || "Aadress puudub";
    meta.textContent = target.address
      ? `${target.buttonLabel} avab navigeerimise.`
      : "Lisa aadress, et Waze oleks aktiivne.";
    line.textContent = `${order.pickupAddress || "Laadimisaadress puudub"} → ${order.deliveryAddress || "Sihtaadress puudub"}`;
  }

  function updateTripButtons(order = readForm()) {
    const wazeBtn = $("#wazeBtn");
    const arrivedPickupBtn = $("#arrivedPickupBtn");
    if (!wazeBtn || !arrivedPickupBtn) return;

    const target = getWazeTarget(order);
    wazeBtn.textContent = target.buttonLabel;
    wazeBtn.disabled = !target.address;

    const hasPickup = Boolean(order.pickupAddress);
    const isAfterPickup = order.tripStage === "pickup_arrived";
    arrivedPickupBtn.disabled = !hasPickup || isAfterPickup;
    arrivedPickupBtn.textContent = isAfterPickup ? "Laadimine kinnitatud" : "Saabusin laadimisele";
    updateRouteSummary(order);
  }

  function saveCurrentOrderPatch(patch) {
    const order = {
      ...readForm(),
      ...patch,
      updatedAt: new Date().toISOString()
    };
    upsertOrder(order);
    fillForm(order);
    return order;
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function toCsv(rows) {
    return rows.map((row) => row.map(csvCell).join(";")).join("\n");
  }

  function downloadTextFile(fileName, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAccountingCsv() {
    const summary = accountingSummary(selectedReportMonth());
    const rows = [
      ["type", "date", "number", "partner", "description", "income_eur", "deposit_eur", "expense_eur", "vat_percent", "status"],
      ...summary.orders.map((order) => [
        "income",
        order.jobDate || "",
        order.invoiceNumber || "",
        order.clientName || "",
        `${order.serviceType || "Veoteenus"}; ${order.pickupAddress || "-"} -> ${order.deliveryAddress || "-"}`,
        orderTotal(order).toFixed(2),
        depositAmount(order).toFixed(2),
        "",
        "0",
        paymentLabels[order.paymentStatus] || "Tasumata"
      ]),
      ...summary.expenses.map((expense) => [
        "expense",
        expense.date,
        expense.receiptNumber || "",
        expense.vendor || "",
        `${expenseLabels[expense.category] || "Muu"}; ${expense.description || ""}`,
        "",
        expense.amount.toFixed(2),
        "",
        expense.paymentMethod || ""
      ]),
      [],
      ["summary_month", summary.month],
      ["revenue_eur", summary.revenue.toFixed(2)],
      ["paid_eur", summary.paidRevenue.toFixed(2)],
      ["unpaid_eur", summary.unpaidRevenue.toFixed(2)],
      ["expenses_eur", summary.expenseTotal.toFixed(2)],
      ["result_before_tax_eur", summary.result.toFixed(2)],
      ["vat_note", "KMKR puudub, käibemaksu ei lisandu"]
    ];
    downloadTextFile(`arides-raamatupidamine-${summary.month}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  }

  function exportOrdersCsv() {
    const rows = [
      ["id", "date", "time", "status", "client", "phone", "email", "service", "pickup", "destination", "price_eur", "invoice", "payment", "deposit_percent", "deposit_amount", "deposit_note", "cargo_photos"],
      ...state.orders.map((order) => [
        order.id,
        order.jobDate || "",
        order.jobTime || "",
        statusLabels[order.status] || order.status || "",
        order.clientName || "",
        order.clientPhone || "",
        order.clientEmail || "",
        order.serviceType || "",
        order.pickupAddress || "",
        order.deliveryAddress || "",
        orderTotal(order).toFixed(2),
        order.invoiceNumber || "",
        paymentLabels[order.paymentStatus] || "",
        Number(order.depositPercent) || 0,
        depositAmount(order).toFixed(2),
        order.depositNote || "",
        normalizeCargoPhotos(order.cargoPhotos).map((photo) => photo.url || photo.fileName).filter(Boolean).join(" | ")
      ])
    ];
    downloadTextFile(`arides-tellimused-${todayISO()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  }

  function bindEvents() {
    $$("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    $("#syncOrdersBtn").addEventListener("click", syncAll);

    const beginNewOrder = () => {
      fillForm(createBlankOrder());
      $("#invoicePanel").hidden = true;
      switchTab("orders");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    $("#newOrderBtn").addEventListener("click", beginNewOrder);
    $("#quickNewOrderBtn")?.addEventListener("click", beginNewOrder);
    $("#companySyncBtn")?.addEventListener("click", () => {
      syncAll();
      switchTab("today");
    });

    $("#addBusyBtn").addEventListener("click", addBusySlotFromForm);
    $("#expenseForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const expense = upsertExpense(readExpenseForm());
      clearExpenseForm();
      notify(`Kulu salvestatud: ${expenseLabels[expense.category] || "Kulu"} ${money(expense.amount)}`);
    });
    $("#clearExpenseBtn")?.addEventListener("click", clearExpenseForm);
    $("#expenseMonth")?.addEventListener("change", () => {
      const value = $("#expenseMonth").value;
      if ($("#reportMonth")) $("#reportMonth").value = value;
      renderExpenses();
      renderReports();
    });
    $("#reportMonth")?.addEventListener("change", () => {
      const value = $("#reportMonth").value;
      if ($("#expenseMonth")) $("#expenseMonth").value = value;
      renderExpenses();
      renderReports();
    });
    $("#exportAccountingBtn")?.addEventListener("click", exportAccountingCsv);
    $("#exportOrdersBtn")?.addEventListener("click", exportOrdersCsv);
    $("#cargoPhotoBtn")?.addEventListener("click", () => {
      $("#cargoPhotoInput")?.click();
    });
    $("#cargoPhotoInput")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      try {
        await handleCargoPhotoFile(file);
      } catch (error) {
        console.warn("Cargo photo capture failed:", error);
        notify("Foto lisamine ebaõnnestus. Proovi uuesti.");
      }
    });

    $("#notifyBtn").addEventListener("click", async () => {
      const permission = await requestNotificationPermission();
      if (permission === "granted") {
        notify("Teavitused on lubatud. Uued tellimused ja töö teated tulevad siia.");
      } else {
        alert(`Android ei lubanud teavitusi. Ava telefoni seadetes ${BRAND_NAME} ja luba Notifications.`);
      }
    });

    $("#orderForm").addEventListener("input", () => {
      updateTotalPreview();
      updateTripButtons();
    });
    $("#orderForm").addEventListener("change", () => {
      updateTotalPreview();
      updateTripButtons();
    });
    $("#orderForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const order = readForm();
      upsertOrder(order);
      fillForm(order);
      notify(`Tellimus salvestatud: ${order.clientName || order.serviceType}`);
    });

    $("#statusFilter").addEventListener("change", renderOrders);
    $("#searchInput").addEventListener("input", renderOrders);

    $("#confirmOrderBtn").addEventListener("click", () => saveCurrentOrderPatch({ status: "confirmed" }));
    $("#startOrderBtn").addEventListener("click", () => saveCurrentOrderPatch({ status: "active" }));
    $("#finishOrderBtn").addEventListener("click", () => saveCurrentOrderPatch({ status: "done" }));
    $("#depositInvoiceBtn").addEventListener("click", () => {
      const current = readForm();
      saveCurrentOrderPatch({
        paymentStatus: "pending",
        invoiceNumber: current.invoiceNumber || nextInvoiceNumber(current.jobDate || todayISO(), current.id),
        invoiceCreatedAt: current.invoiceCreatedAt || new Date().toISOString(),
        invoiceDueDate: current.invoiceDueDate || todayISO()
      });
      renderInvoice(readForm(), true);
      openInvoiceModal();
    });
    $("#markPaidBtn").addEventListener("click", () => {
      const current = readForm();
      saveCurrentOrderPatch({
        paymentStatus: "paid",
        invoiceNumber: current.invoiceNumber || nextInvoiceNumber(current.jobDate || todayISO(), current.id),
        invoiceCreatedAt: current.invoiceCreatedAt || new Date().toISOString(),
        invoiceDueDate: current.invoiceDueDate || addDaysISO(todayISO(), current.invoiceDueDays || 7)
      });
    });

    $("#callClientBtn").addEventListener("click", () => {
      const order = readForm();
      if (order.clientPhone) window.location.href = `tel:${order.clientPhone.replace(/\s+/g, "")}`;
    });

    $("#emailClientBtn").addEventListener("click", () => {
      const order = readForm();
      if (!order.clientEmail) return;
      const subject = encodeURIComponent(`${BRAND_NAME} veoteenus`);
      const body = encodeURIComponent("Tere!\n\n");
      window.location.href = `mailto:${order.clientEmail}?subject=${subject}&body=${body}`;
    });

    $("#whatsAppClientBtn").addEventListener("click", () => {
      const order = readForm();
      if (order.clientPhone) {
        const phone = order.clientPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
        window.open(`https://wa.me/${phone}`, "_blank", "noopener");
      }
    });

    $("#mapsBtn").addEventListener("click", () => openRoute(readForm()));
    $("#wazeBtn").addEventListener("click", () => {
      const order = readForm();
      openWazeAddress(getWazeTarget(order).address);
    });
    $("#arrivedPickupBtn").addEventListener("click", () => {
      const order = readForm();
      order.tripStage = "pickup_arrived";
      if (["new", "confirmed"].includes(order.status)) {
        order.status = "active";
      }
      upsertOrder(order);
      fillForm(order);
      openWazeAddress(order.deliveryAddress || "");
    });
    $("#invoiceBtn").addEventListener("click", openInvoiceModal);
    $("#invoiceFullscreenBtn")?.addEventListener("click", openInvoiceModal);
    $("#invoicePanelGmailBtn")?.addEventListener("click", openInvoiceModal);
    $("#invoiceModalCloseBtn")?.addEventListener("click", closeInvoiceModal);
    $("#invoiceModalGmailBtn")?.addEventListener("click", sendInvoiceViaGmail);
    $("#invoiceModalPrintBtn")?.addEventListener("click", printInvoice);
    $("#invoiceModalDownloadBtn")?.addEventListener("click", downloadInvoice);
    $("#invoiceModal")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeInvoiceModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isInvoiceModalOpen()) closeInvoiceModal();
    });
    window.addEventListener("online", syncAll);
    window.addEventListener("offline", renderSyncStatus);
    $("#printInvoiceBtn").addEventListener("click", printInvoice);
    $("#downloadInvoiceBtn").addEventListener("click", downloadInvoice);
    $("#deleteBtn").addEventListener("click", () => {
      const order = readForm();
      if (!order.id || !confirm("Kas peita see tellimus? See ei tule pärast uuendust tagasi.")) return;
      upsertOrder({
        ...order,
        status: "cancelled",
        deletedAt: order.deletedAt || new Date().toISOString()
      });
      fillForm(createBlankOrder());
      render();
    });
  }

  bindEvents();
  $("#busyDate").value = todayISO();
  $("#expenseMonth").value = monthISO();
  $("#reportMonth").value = monthISO();
  clearExpenseForm();
  const firstVisibleOrder = state.orders.find((order) => !isHiddenOrder(order));
  if (firstVisibleOrder) {
    fillForm(firstVisibleOrder);
  } else {
    fillForm(createBlankOrder());
  }
  render();
  switchTab(state.activeTab);
  initNotificationState();
  syncAll();
})();
