(() => {
  const STORAGE_KEY = "arides_operator_orders_v1";
  const INVOICE_PREFIX = "ARV";
  const COMPANY = {
    name: "Arides OÜ",
    registryCode: "12717973",
    address: "Harju maakond, Harku vald, Tutermaa küla, Meistri tee 2-28, 76617",
    phone: "+372 5684 5377",
    email: "aridesteenus@gmail.com",
    website: "https://arides.ee/"
  };

  const statusLabels = {
    new: "Uus",
    confirmed: "Kinnitatud",
    active: "Töös",
    done: "Lõpetatud",
    cancelled: "Tühistatud"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    orders: loadOrders(),
    selectedId: null
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

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function uid() {
    return `ord_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

  function nextInvoiceNumber(dateValue = todayISO(), currentOrderId = "") {
    const code = invoiceDateCode(dateValue);
    const usedToday = state.orders
      .filter((order) => order.id !== currentOrderId)
      .map((order) => order.invoiceNumber || "")
      .filter((value) => value.startsWith(`${INVOICE_PREFIX}-${code}`));

    return `${INVOICE_PREFIX}-${code}-${usedToday.length + 1}`;
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
      extraFee: Number(data.get("extraFee")) || 0,
      finalPrice: data.get("finalPrice") === "" ? "" : Number(data.get("finalPrice")) || 0,
      paymentStatus: data.get("paymentStatus") || "unpaid",
      cargoDetails: String(data.get("cargoDetails") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
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
    renderInvoice(safeOrder, false);
  }

  function createBlankOrder() {
    return {
      id: uid(),
      status: "new",
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
      extraFee: 0,
      finalPrice: "",
      paymentStatus: "unpaid",
      createdAt: new Date().toISOString()
    };
  }

  function calculateOrder(order) {
    const base = (Number(order.hours) || 0) * (Number(order.hourRate) || 0);
    const km = (Number(order.kilometers) || 0) * (Number(order.kmRate) || 0);
    const helper = (Number(order.helperHours) || 0) * (Number(order.helperRate) || 0);
    const extra = Number(order.extraFee) || 0;
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

  function upsertOrder(order) {
    const index = state.orders.findIndex((item) => item.id === order.id);
    if (index >= 0) {
      state.orders[index] = order;
    } else {
      state.orders.unshift(order);
    }
    state.selectedId = order.id;
    saveOrders();
    render();
  }

  function filteredOrders() {
    const filter = $("#statusFilter").value;
    const search = $("#searchInput").value.trim().toLowerCase();

    return state.orders
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
    $("#statNew").textContent = state.orders.filter((order) => order.status === "new").length;
    $("#statActive").textContent = state.orders.filter((order) => ["confirmed", "active"].includes(order.status)).length;
    $("#statDone").textContent = state.orders.filter((order) => order.status === "done").length;
    $("#statInvoices").textContent = state.orders.filter((order) => order.invoiceNumber).length;
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
      const button = document.createElement("button");
      button.type = "button";
      button.className = `orderItem${order.id === state.selectedId ? " is-active" : ""}`;
      button.innerHTML = `
        <strong>
          <span>${escapeHtml(order.clientName || "Nimetu klient")}</span>
          <b>${money(total)}</b>
        </strong>
        <span>${escapeHtml(order.serviceType || "Kaubavedu")} · ${escapeHtml(order.jobDate || "")} ${escapeHtml(order.jobTime || "")}</span>
        <small>${escapeHtml(order.pickupAddress || "Algus puudub")} → ${escapeHtml(order.deliveryAddress || "Siht puudub")}</small>
        <i class="statusPill" data-status="${order.status || "new"}">${statusLabels[order.status] || "Uus"}</i>
      `;
      button.addEventListener("click", () => fillForm(order));
      list.append(button);
    });
  }

  function render() {
    renderStats();
    renderOrders();
    const selected = state.orders.find((order) => order.id === state.selectedId);
    if (selected) renderInvoice(selected, $("#invoicePanel").hidden === false);
  }

  function updateTotalPreview() {
    const order = readForm();
    const total = calculateOrder(order);
    $("#orderTotal").textContent = money(total.finalPrice);
    $("#orderTotalHint").textContent = order.finalPrice === ""
      ? `Arvutatud: tunnid ${money(total.base)}, km ${money(total.km)}, abi ${money(total.helper)}, lisad ${money(total.extra)}.`
      : `Käsitsi kinnitatud lõpphind. Arvutus enne korrigeerimist: ${money(total.calculated)}.`;
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
    const rows = invoiceRows(order);
    const total = calculateOrder(order).finalPrice;

    sheet.innerHTML = `
      <div class="invoiceTop">
        <div class="invoiceLogo">
          <img src="./img/ui/logo-veoteenus.png" alt="" />
          <div>
            <strong>ARIDES</strong>
            <span>Kaubavedu ja kolimine</span>
          </div>
        </div>
        <div class="invoiceMeta">
          <h2>ARVE ${escapeHtml(invoiceNumber)}</h2>
          <p>Kuupäev: ${escapeHtml(invoiceDate)}</p>
          <p>Makseviis: kokkuleppel</p>
        </div>
      </div>

      <div class="invoiceGrid">
        <div class="invoiceBox">
          <h3>Müüja</h3>
          <strong>${COMPANY.name}</strong><br />
          Registrikood: ${COMPANY.registryCode}<br />
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

      <p>Käibemaksu ei ole lisatud, kui ettevõttel puudub aktiivne KMKR number või eraldi kokkulepe.</p>
      <p>Pangaandmed lisatakse hiljem / makse kokkuleppel.</p>

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

  function saveInvoiceToOrder() {
    const order = readForm();
    order.invoiceNumber = order.invoiceNumber || nextInvoiceNumber(order.jobDate || todayISO(), order.id);
    order.invoiceCreatedAt = order.invoiceCreatedAt || new Date().toISOString();
    upsertOrder(order);
    fillForm(order);
    renderInvoice(order, true);
  }

  function downloadInvoice() {
    saveInvoiceToOrder();
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

  function notify(text) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification("ARIDES", {
      body: text,
      icon: "./android-chrome-192x192.png"
    });
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

  function bindEvents() {
    $("#newOrderBtn").addEventListener("click", () => {
      fillForm(createBlankOrder());
      $("#invoicePanel").hidden = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("#notifyBtn").addEventListener("click", async () => {
      if (!("Notification" in window)) {
        alert("See brauser ei toeta teavitusi.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        notify("Teavitused on lubatud. Päris klienditeavitused ühendame backendiga.");
      }
    });

    $("#orderForm").addEventListener("input", updateTotalPreview);
    $("#orderForm").addEventListener("change", updateTotalPreview);
    $("#orderForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const order = readForm();
      upsertOrder(order);
      fillForm(order);
      notify(`Tellimus salvestatud: ${order.clientName || order.serviceType}`);
    });

    $("#statusFilter").addEventListener("change", renderOrders);
    $("#searchInput").addEventListener("input", renderOrders);

    $("#callClientBtn").addEventListener("click", () => {
      const order = readForm();
      if (order.clientPhone) window.location.href = `tel:${order.clientPhone.replace(/\s+/g, "")}`;
    });

    $("#whatsAppClientBtn").addEventListener("click", () => {
      const order = readForm();
      if (order.clientPhone) {
        const phone = order.clientPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
        window.open(`https://wa.me/${phone}`, "_blank", "noopener");
      }
    });

    $("#mapsBtn").addEventListener("click", () => openRoute(readForm()));
    $("#invoiceBtn").addEventListener("click", saveInvoiceToOrder);
    $("#printInvoiceBtn").addEventListener("click", () => {
      saveInvoiceToOrder();
      window.print();
    });
    $("#downloadInvoiceBtn").addEventListener("click", downloadInvoice);
    $("#deleteBtn").addEventListener("click", () => {
      const order = readForm();
      if (!order.id || !confirm("Kas kustutada see tellimus sellest seadmest?")) return;
      state.orders = state.orders.filter((item) => item.id !== order.id);
      saveOrders();
      fillForm(createBlankOrder());
      render();
    });
  }

  bindEvents();
  if (state.orders.length) {
    fillForm(state.orders[0]);
  } else {
    fillForm(createBlankOrder());
  }
  render();
})();
