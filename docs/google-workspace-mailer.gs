const TO_EMAIL = "info@arides.ee";
const FROM_NAME = "ARIDES Cargo";
const DATABASE_NAME = "ARIDES Cargo Orders";
const CARGO_PHOTO_FOLDER_NAME = "ARIDES Cargo Photos";
const OPERATOR_TOKEN = "";

const ORDER_HEADERS = [
  "id",
  "created_at",
  "updated_at",
  "status",
  "client_name",
  "client_phone",
  "client_email",
  "service_type",
  "job_date",
  "job_time",
  "pickup_address",
  "extra_stops",
  "delivery_address",
  "cargo_details",
  "comment",
  "source",
  "final_price",
  "payment_status",
  "invoice_number",
  "invoice_due_date",
  "trip_stage",
  "deleted_at"
];

const BUSY_HEADERS = [
  "id",
  "created_at",
  "date",
  "start",
  "end",
  "label",
  "source"
];

const EXPENSE_HEADERS = [
  "id",
  "created_at",
  "updated_at",
  "date",
  "category",
  "vendor",
  "description",
  "amount",
  "payment_method",
  "receipt_number",
  "source",
  "deleted_at"
];

const PHOTO_HEADERS = [
  "id",
  "created_at",
  "order_id",
  "order_title",
  "file_name",
  "mime_type",
  "drive_file_id",
  "drive_url",
  "thumb_url",
  "note",
  "source"
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  try {
    if (params.action === "orders") {
      return jsonResponse({ ok: true, orders: listOrders() });
    }

    if (params.action === "busy") {
      return jsonResponse(listBusySlots());
    }

    if (params.action === "expenses") {
      return jsonResponse({ ok: true, expenses: listExpenses() });
    }

    if (params.action === "photos") {
      return jsonResponse({ ok: true, photos: listCargoPhotos(params.order_id) });
    }

    return ContentService
      .createTextOutput("ARIDES Cargo mailer is running")
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function doPost(e) {
  try {
    const data = e && e.parameter ? e.parameter : {};

    if (data.company_website) {
      return jsonResponse({ ok: true, skipped: true });
    }

    if (data.action === "saveOrder") {
      requireOperator(data);
      const order = saveOrder(data);
      return jsonResponse({ ok: true, order: order });
    }

    if (data.action === "busySlot") {
      requireOperator(data);
      const slot = saveBusySlot(data);
      return jsonResponse({ ok: true, slot: slot });
    }

    if (data.action === "saveExpense") {
      requireOperator(data);
      const expense = saveExpense(data);
      return jsonResponse({ ok: true, expense: expense });
    }

    if (data.action === "cargoPhoto") {
      requireOperator(data);
      const photo = saveCargoPhoto(data);
      return jsonResponse({ ok: true, photo: photo });
    }

    if (!data.name || !data.phone || !data.move_date || !data.move_time || !data.from_address || !data.to_address) {
      return jsonResponse({ ok: false, error: "Missing required fields" });
    }

    const order = createOrderFromWebsite(data);
    sendOrderEmail(data);

    return jsonResponse({ ok: true, order_id: order.id });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function createOrderFromWebsite(data) {
  const now = new Date().toISOString();
  const order = {
    id: data.id || newId("ord"),
    created_at: now,
    updated_at: now,
    status: "new",
    trip_stage: "to_pickup",
    client_name: data.name || "",
    client_phone: data.phone || "",
    client_email: data.customer_email || data.email || "",
    service_type: data.service_label || data.service_type || "",
    job_date: data.move_date || "",
    job_time: data.move_time || "",
    pickup_address: data.from_address || "",
    extra_stops: data.extra_stops || "",
    delivery_address: data.to_address || "",
    cargo_details: data.cargo_details || "",
    comment: data.comment || "",
    source: "website",
    final_price: "",
    payment_status: "unpaid",
    invoice_number: "",
    invoice_due_date: "",
    deleted_at: data.deleted_at || ""
  };

  upsertRow("Orders", ORDER_HEADERS, order);
  return order;
}

function saveOrder(data) {
  const now = new Date().toISOString();
  const order = {
    id: data.id || newId("ord"),
    created_at: data.created_at || now,
    updated_at: now,
    status: data.status || "new",
    trip_stage: data.trip_stage || "to_pickup",
    client_name: data.client_name || "",
    client_phone: data.client_phone || "",
    client_email: data.client_email || "",
    service_type: data.service_type || "",
    job_date: data.job_date || "",
    job_time: data.job_time || "",
    pickup_address: data.pickup_address || "",
    extra_stops: data.extra_stops || "",
    delivery_address: data.delivery_address || "",
    cargo_details: data.cargo_details || "",
    comment: data.comment || "",
    source: data.source || "operator",
    final_price: data.final_price || "",
    payment_status: data.payment_status || "unpaid",
    invoice_number: data.invoice_number || "",
    invoice_due_date: data.invoice_due_date || "",
    deleted_at: data.deleted_at || ""
  };

  upsertRow("Orders", ORDER_HEADERS, order);
  return order;
}

function saveBusySlot(data) {
  if (!data.date || !data.start || !data.end) {
    throw new Error("Busy slot needs date, start and end.");
  }

  const slot = {
    id: data.id || newId("busy"),
    created_at: data.created_at || new Date().toISOString(),
    date: data.date,
    start: data.start,
    end: data.end,
    label: data.label || "Busy",
    source: data.source || "operator"
  };

  upsertRow("BusySlots", BUSY_HEADERS, slot);
  return slot;
}

function saveExpense(data) {
  if (!data.date || data.amount === "") {
    throw new Error("Expense needs date and amount.");
  }

  const now = new Date().toISOString();
  const expense = {
    id: data.id || newId("exp"),
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    date: data.date,
    category: data.category || "other",
    vendor: data.vendor || "",
    description: data.description || "",
    amount: data.amount || "0",
    payment_method: data.payment_method || "card",
    receipt_number: data.receipt_number || "",
    source: data.source || "operator",
    deleted_at: data.deleted_at || ""
  };

  upsertRow("Expenses", EXPENSE_HEADERS, expense);
  return expense;
}

function listOrders() {
  const orders = readObjects("Orders", ORDER_HEADERS)
    .filter(function(order) {
      return order.id && !order.deleted_at;
    })
    .sort(function(a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  return attachPhotoSummaries(orders);
}

function listBusySlots() {
  return readObjects("BusySlots", BUSY_HEADERS)
    .filter(function(slot) {
      return slot.date && slot.start && slot.end;
    })
    .map(function(slot) {
      return {
        id: slot.id,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        label: slot.label || ""
      };
    });
}

function listExpenses() {
  return readObjects("Expenses", EXPENSE_HEADERS)
    .filter(function(expense) {
      return expense.id;
    })
    .sort(function(a, b) {
      return String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
    });
}

function saveCargoPhoto(data) {
  if (!data.order_id || !data.image_data) {
    throw new Error("Cargo photo needs order_id and image_data.");
  }

  const existing = findObjectById("CargoPhotos", PHOTO_HEADERS, data.photo_id || data.id);
  if (existing && existing.drive_file_id) {
    return existing;
  }

  const id = data.photo_id || data.id || newId("photo");
  const mimeType = data.mime_type || "image/jpeg";
  const safeFileName = cleanFileName(data.file_name || id + ".jpg");
  const bytes = Utilities.base64Decode(String(data.image_data).replace(/^data:[^,]+,/, ""));
  const blob = Utilities.newBlob(bytes, mimeType, safeFileName);
  const folder = getCargoPhotoFolder();
  const file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    // If domain policy blocks public links, the file still remains in ARIDES Cargo Drive.
  }

  const photo = {
    id: id,
    created_at: data.created_at || new Date().toISOString(),
    order_id: data.order_id,
    order_title: data.order_title || "",
    file_name: safeFileName,
    mime_type: mimeType,
    drive_file_id: file.getId(),
    drive_url: file.getUrl(),
    thumb_url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000",
    note: data.note || "",
    source: data.source || "operator"
  };

  upsertRow("CargoPhotos", PHOTO_HEADERS, photo);
  return photo;
}

function listCargoPhotos(orderId) {
  return readObjects("CargoPhotos", PHOTO_HEADERS)
    .filter(function(photo) {
      return photo.order_id && (!orderId || photo.order_id === orderId);
    })
    .sort(function(a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
}

function attachPhotoSummaries(orders) {
  const photos = listCargoPhotos("");
  const byOrder = {};
  photos.forEach(function(photo) {
    if (!byOrder[photo.order_id]) byOrder[photo.order_id] = [];
    byOrder[photo.order_id].push(photo);
  });

  return orders.map(function(order) {
    const orderPhotos = byOrder[order.id] || [];
    order.cargo_photo_count = String(orderPhotos.length);
    order.cargo_photos_json = JSON.stringify(orderPhotos.slice(0, 20));
    return order;
  });
}

function sendOrderEmail(data) {
  const replyTo = cleanEmail(data.reply_to || data.customer_email || data.email || TO_EMAIL);
  const subject = "ARIDES Cargo veoteenus";
  const body = data.message || buildBody(data);

  MailApp.sendEmail({
    to: TO_EMAIL,
    subject: subject,
    body: body,
    htmlBody: buildHtml(body),
    name: FROM_NAME,
    replyTo: replyTo
  });
}

function buildBody(data) {
  const rows = [
    ["Service", data.service_label || data.service_type],
    ["Name", data.name || data.client_name],
    ["Phone", data.phone || data.client_phone],
    ["Email", data.customer_email || data.client_email],
    ["Date", data.move_date || data.job_date],
    ["Time", data.move_time || data.job_time],
    ["Pickup", data.from_address || data.pickup_address],
    ["Extra stops", data.extra_stops],
    ["Destination", data.to_address || data.delivery_address],
    ["Pickup floor", data.pickup_floor],
    ["Delivery floor", data.delivery_floor],
    ["Loaders", data.loader_count],
    ["Elevator", data.has_elevator],
    ["Cargo", data.cargo_details],
    ["Comment", data.comment],
    ["Page", data.page_url],
    ["Submitted at", data.submitted_at]
  ];

  return rows.map(function(row) {
    return row[0] + ": " + (row[1] || "-");
  }).join("\n");
}

function buildHtml(body) {
  return "<pre style='font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.5'>" +
    escapeHtml(body) +
    "</pre>";
}

function upsertRow(sheetName, headers, object) {
  const sheet = getSheet(sheetName, headers);
  const values = sheet.getDataRange().getValues();
  const idIndex = headers.indexOf("id");
  let rowIndex = -1;

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][idIndex]) === String(object.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  const row = headers.map(function(header) {
    return object[header] == null ? "" : object[header];
  });

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function readObjects(sheetName, headers) {
  const sheet = getSheet(sheetName, headers);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  return rows.slice(1).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) {
      object[header] = row[index] == null ? "" : String(row[index]);
    });
    return object;
  });
}

function findObjectById(sheetName, headers, id) {
  if (!id) return null;
  return readObjects(sheetName, headers).find(function(object) {
    return String(object.id) === String(id);
  }) || null;
}

function getSheet(sheetName, headers) {
  const spreadsheet = getDatabase();
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some(function(header, index) {
    return firstRow[index] !== header;
  });

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getDatabase() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("ARIDES_DATABASE_ID");

  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (error) {
      props.deleteProperty("ARIDES_DATABASE_ID");
    }
  }

  const spreadsheet = SpreadsheetApp.create(DATABASE_NAME);
  props.setProperty("ARIDES_DATABASE_ID", spreadsheet.getId());
  getSheet("Orders", ORDER_HEADERS);
  getSheet("BusySlots", BUSY_HEADERS);
  getSheet("Expenses", EXPENSE_HEADERS);
  getSheet("CargoPhotos", PHOTO_HEADERS);
  return spreadsheet;
}

function getCargoPhotoFolder() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("ARIDES_CARGO_PHOTO_FOLDER_ID");

  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      props.deleteProperty("ARIDES_CARGO_PHOTO_FOLDER_ID");
    }
  }

  const folder = DriveApp.createFolder(CARGO_PHOTO_FOLDER_NAME);
  props.setProperty("ARIDES_CARGO_PHOTO_FOLDER_ID", folder.getId());
  return folder;
}

function requireOperator(data) {
  if (!OPERATOR_TOKEN) return;
  if (data.token !== OPERATOR_TOKEN) {
    throw new Error("Operator token is invalid.");
  }
}

function newId(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function cleanEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : TO_EMAIL;
}

function cleanFileName(value) {
  return String(value || "cargo-photo.jpg")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "cargo-photo.jpg";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
