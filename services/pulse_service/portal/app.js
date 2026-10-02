/* Pulse partner portal.
 *
 * Rules this file follows, because the product promised them:
 *  - there is no sample data. If a fetch returns nothing, the board says nothing and
 *    says why. A populated demo would hide a broken RLS policy.
 *  - the token kept here is the caller's own; the service forwards it and the
 *    database decides. This page never receives a service-role key.
 *  - buttons for status changes come from the transition graph, so an illegal move
 *    is dimmed for looks only: Postgres is still the one that refuses it.
 */
"use strict";

const SESSION_KEY = "pulse.session";
const POLL_MS = 20000;

const PAYMENT_STATUSES = [
  "unpaid",
  "pending_confirmation",
  "paid",
  "partially_paid",
  "refunded",
  "failed",
  "waived",
];

const state = {
  token: null,
  session: null,
  businesses: [],
  businessId: null,
  board: null,
  filter: "",
  draft: null,
  status: null,
  poll: null,
  openOrderId: null,
  view: "dispatch",
  orders: [],
  business: null,
};

const el = (id) => document.getElementById(id);
const show = (node, on) => node && node.classList.toggle("hidden", !on);

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function remember(next) {
  state.session = next;
  state.token = next ? next.access_token : null;
  if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else localStorage.removeItem(SESSION_KEY);
}

function banner(kind, text, ttl) {
  const box = el("banners");
  const node = document.createElement("div");
  node.className = `banner ${kind}`;
  node.textContent = text;
  box.prepend(node);
  if (ttl) setTimeout(() => node.remove(), ttl);
  return node;
}

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = (payload && payload.error) || {};
    const suffix = error.code ? ` [${error.code}]` : "";
    throw new Error(`${error.message || response.status}${suffix}`);
  }
  return payload;
}

function describe(error) {
  return error && error.message ? String(error.message) : String(error);
}

function money(order) {
  const amount = order.price_amount;
  if (amount === null || amount === undefined || amount === "") return "not priced";
  return `${order.currency || "NGN"} ${Number(amount).toLocaleString()}`;
}

function timeAgo(value) {
  if (!value) return "";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(value).toLocaleDateString();
}

/* ---------- boot and the configuration panel ---------- */

async function boot() {
  const stored = readSession();
  if (stored && stored.access_token) {
    state.token = stored.access_token;
    state.session = stored;
  }
  await loadStatus();
  if (state.token) {
    try {
      await loadBusinesses();
      enterWorkspace();
      return;
    } catch (error) {
      banner("warn", `Stored sign-in no longer works: ${describe(error)} — sign in again.`);
      remember(null);
    }
  }
  show(el("auth"), true);
  show(el("workspace"), false);
}

async function loadStatus() {
  try {
    state.status = await api("GET", "/api/status");
  } catch (error) {
    banner("bad", `The local service did not answer: ${describe(error)}`);
    return;
  }
  renderProviders();
  if (!state.status.supabase_configured) {
    banner(
      "warn",
      "No Supabase project configured, so the board stays empty on purpose. Set " +
        "SUPABASE_URL and SUPABASE_ANON_KEY in pulse/services/.env and restart. The " +
        "WhatsApp importer, the transition graph and the offline tools still work."
    );
  }
  if (!(state.status.live || []).includes("realtime")) {
    banner("warn", "Realtime publication is not enabled: the board polls every 20 s.", 7000);
  }
}

function renderProviders() {
  const box = el("providers");
  if (!box || !state.status) return;
  box.innerHTML = "";
  for (const provider of state.status.providers) {
    const chip = document.createElement("span");
    const kind = provider.configured ? "live" : provider.needs_dependency.length ? "dep" : "off";
    chip.className = `status ${kind}`;
    chip.title = provider.configured
      ? `${provider.title}: live. Unlocks ${provider.unlocks}.`
      : `${provider.title}: needs ${provider.missing_env.join(", ")}. ${provider.offline_note}`;
    chip.textContent = provider.configured
      ? `● ${provider.title}`
      : `○ ${provider.title} — needs ${provider.missing_env.join(", ")}`;
    box.append(chip);
  }
  const missing = state.status.providers.filter((p) => !p.configured);
  el("provider-note").textContent = missing.length
    ? `Offline: ${missing.map((p) => p.title).join(" · ")}. Each is optional; the board works without them.`
    : "Every integration is live.";
}

/* ---------- auth ---------- */

async function signIn() {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) {
    el("auth-note").textContent = "Email and password are both required.";
    return;
  }
  el("signin").disabled = true;
  try {
    remember(await api("POST", "/api/auth/signin", { email, password }));
    el("auth-note").textContent = "";
    await loadBusinesses();
    enterWorkspace();
  } catch (error) {
    el("auth-note").textContent = describe(error);
  } finally {
    el("signin").disabled = false;
  }
}

async function signUp() {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || password.length < 6) {
    el("auth-note").textContent = "Pick an email and a password of at least 6 characters.";
    return;
  }
  el("signup").disabled = true;
  try {
    const result = await api("POST", "/api/auth/signup", { email, password });
    if (result.needs_confirmation) {
      el("auth-note").textContent =
        result.note || "Account created; this project wants the email confirmed first.";
      return;
    }
    remember(result);
    await loadBusinesses();
    enterWorkspace();
  } catch (error) {
    el("auth-note").textContent = describe(error);
  } finally {
    el("signup").disabled = false;
  }
}

function signOut() {
  if (state.poll) clearInterval(state.poll);
  state.poll = null;
  remember(null);
  state.businesses = [];
  state.board = null;
  show(el("workspace"), false);
  show(el("auth"), true);
  el("sync").textContent = "";
  banner("good", "Signed out; the token is gone from this browser.", 4000);
}

/* ---------- workspaces ---------- */

async function loadBusinesses() {
  const result = await api("GET", "/api/businesses");
  state.businesses = result.businesses || [];
  if (result.note) banner("warn", result.note);
  const select = el("business");
  select.innerHTML = "";
  for (const business of state.businesses) {
    const option = document.createElement("option");
    option.value = business.id;
    option.textContent = `${business.name}${business.city ? ` · ${business.city}` : ""} (${
      business.my_role || "member"
    })`;
    select.append(option);
  }
  const remembered = localStorage.getItem("pulse.business");
  state.businessId =
    state.businesses.find((b) => b.id === remembered)?.id || state.businesses[0]?.id || null;
  if (state.businessId) {
    select.value = state.businessId;
    show(select, true);
  } else {
    show(select, false);
  }
}

function currentBusiness() {
  return state.businesses.find((b) => b.id === state.businessId) || null;
}

function enterWorkspace() {
  show(el("auth"), false);
  show(el("workspace"), true);
  show(el("refresh"), true);
  show(el("signout"), true);
  show(el("business"), Boolean(state.businessId));
  show(el("mainnav"), true);
  state.business = state.businesses.find((b) => b.id === state.businessId) || null;
  if (state.session && state.session.email) {
    el("whoami").textContent = state.session.email;
    show(el("whoami"), true);
  }
  // Measured only now that the nav is visible — see moveNavIndicator.
  showView(state.view || "dispatch");
  moveNavIndicator(el("mainnav").querySelector(".active"));
  if (!state.businessId) {
    el("board").innerHTML =
      '<div class="empty">You belong to no workspace yet. Use Team → Create workspace: ' +
      "create_business() is the only path that makes one, and it makes you the owner.</div>";
    offerWorkspaceCreation();
    return;
  }
  offerWorkspaceCreation();
  loadBoard();
  if (state.poll) clearInterval(state.poll);
  state.poll = setInterval(() => loadBoard(true).catch(() => {}), POLL_MS);
}

function offerWorkspaceCreation() {
  const panel = el("view-team");
  if (el("create-business-box")) return;
  const box = document.createElement("div");
  box.id = "create-business-box";
  box.innerHTML =
    '<h3>Create workspace</h3>' +
    '<p class="muted small">Owner role comes from the RPC, not from this form.</p>' +
    '<label>Name <input id="b-name" /></label>' +
    '<div class="row two"><label>City <input id="b-city" /></label>' +
    '<label>Currency <input id="b-currency" placeholder="NGN" /></label></div>' +
    '<button id="create-business" type="button">Create workspace</button>' +
    '<pre id="business-out" class="out"></pre>';
  panel.prepend(box);
  el("create-business").addEventListener("click", async () => {
    const name = el("b-name").value.trim();
    if (name.length < 2) {
      el("business-out").textContent = "A name of at least 2 characters is required.";
      return;
    }
    try {
      const created = await api("POST", "/api/rpc/create_business", {
        p_name: name,
        p_city: el("b-city").value.trim() || undefined,
        p_currency: el("b-currency").value.trim().toUpperCase() || undefined,
      });
      el("business-out").textContent = JSON.stringify(created, null, 2);
      await loadBusinesses();
      enterWorkspace();
      banner("good", `Workspace "${name}" created; you are its owner.`, 6000);
    } catch (error) {
      el("business-out").textContent = describe(error);
    }
  });
}

async function loadBoard(quiet) {
  if (!state.businessId) return;
  if (!quiet) el("sync").textContent = "loading…";
  let result;
  try {
    result = await api("GET", `/api/board?business_id=${encodeURIComponent(state.businessId)}`);
  } catch (error) {
    el("sync").textContent = "";
    el("board").innerHTML = `<div class="empty">${describe(error)}</div>`;
    banner("bad", describe(error));
    return;
  }
  state.board = result;
  el("sync").textContent = `synced ${new Date().toLocaleTimeString()} · polling`;
  renderCounts();
  renderBoard();
  if (state.openOrderId) refreshDetail(state.openOrderId, true);
}

/* ---------- the board ---------- */

function renderCounts() {
  const box = el("counts");
  const counts = (state.board && state.board.counts) || {};
  const filter = el("filter");
  const seen = filter.value;
  filter.innerHTML = '<option value="">All statuses</option>';
  for (const status of Object.keys(counts).sort()) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = `${status} (${counts[status]})`;
    filter.append(option);
  }
  filter.value = [...filter.options].some((o) => o.value === seen) ? seen : "";
  state.filter = filter.value;
  box.innerHTML = "";
  for (const [status, total] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${status} ${total}`;
    box.append(chip);
  }
  if (state.board && state.board.transition_source === "mirror") {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title =
      "order_transition_edges() was not callable for this account, so the buttons " +
      "follow the built-in mirror. Postgres still decides.";
    chip.textContent = "transitions: mirror";
    box.append(chip);
  }
  if (state.board && state.board.truncated) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title =
      `Only the ${state.board.limit} most recent orders were loaded and this ` +
      "workspace holds more, so the counts here are not workspace totals. Older " +
      "orders are still in the database.";
    chip.textContent = `truncated: ${state.board.limit} most recent`;
    box.append(chip);
  }
}

function renderBoard() {
  const board = el("board");
  const orders = (state.board && state.board.orders) || [];
  board.innerHTML = "";
  if (!orders.length) {
    board.innerHTML =
      '<div class="empty">No orders for this workspace. This is what the database ' +
      "said — no sample data is inserted to fill the gap. Create one with New order, " +
      "or accept an invitation to a workspace that already has work.</div>";
    return;
  }
  for (const order of orders) {
    if (state.filter && order.status !== state.filter) continue;
    board.append(orderCard(order));
  }
  if (!board.children.length) {
    board.innerHTML = `<div class="empty">Nothing with status ${state.filter}.</div>`;
  }
}

function orderCard(order) {
  const card = document.createElement("article");
  card.className = "order";

  const title = document.createElement("h4");
  title.textContent = `${order.reference} · ${order.status}`;
  card.append(title);

  const customer = order.customer || {};
  const meta = document.createElement("div");
  meta.className = "meta";
  const drivers = order.driver_names && order.driver_names.length
    ? order.driver_names.join(", ")
    : order.driver_stage
      ? "no current assignment"
      : "unassigned";
  meta.textContent = [
    `${customer.display_name || "customer not named"} ${customer.phone_e164 || ""}`.trim(),
    `${order.pickup_text} → ${order.destination_text}`,
    money(order),
    drivers,
    timeAgo(order.created_at),
  ]
    .filter(Boolean)
    .join("  ·  ");
  card.append(meta);

  const actions = document.createElement("div");
  actions.className = "actions";

  const open = document.createElement("button");
  open.className = "ghost";
  open.textContent = "Open";
  open.addEventListener("click", () => refreshDetail(order.id));
  actions.append(open);

  for (const next of order.allowed_next || []) {
    const button = document.createElement("button");
    button.textContent = next;
    if (order.driver_stage && !order.current_assignments.length) {
      button.disabled = true;
      button.title = "A driver must hold the current assignment for this stage.";
    }
    button.addEventListener("click", () => moveStatus(order, next, button));
    actions.append(button);
  }
  if (!(order.allowed_next || []).length) {
    const label = document.createElement("span");
    label.className = "chip";
    label.textContent = `${order.status} is terminal`;
    actions.append(label);
  }
  card.append(actions);
  return card;
}

async function moveStatus(order, to, button) {
  button.disabled = true;
  try {
    const result = await api("PATCH", `/api/orders/${order.id}`, { status: to });
    const kept = result.orders && result.orders[0];
    if (!kept) {
      banner("warn", "Postgres accepted the request but returned no row; refresh to confirm.");
    } else if (kept.status !== to) {
      banner("warn", `Requested ${to}, the database kept ${kept.status}.`);
    } else {
      banner("good", `${order.reference} → ${to}.`, 4000);
    }
    await loadBoard(true);
  } catch (error) {
    button.disabled = false;
    banner("bad", describe(error));
  }
}

/* ---------- order detail ---------- */

async function refreshDetail(orderId, quiet) {
  let detail;
  try {
    detail = await api("GET", `/api/orders/${orderId}`);
  } catch (error) {
    if (!quiet) banner("bad", describe(error));
    closeDrawer();
    state.openOrderId = null;
    return;
  }
  state.openOrderId = orderId;
  openDrawer();
  el("drawer-title").textContent = `${detail.order.reference} · ${detail.order.status}`;
  renderDetail(detail);
}

function driverName(driverId) {
  const drivers = (state.board && state.board.drivers_available) || [];
  const found = drivers.find((driver) => driver.id === driverId);
  return found ? found.full_name : driverId;
}

function renderDetail(detail) {
  const body = el("drawer-body");
  const order = detail.order;
  body.innerHTML = "";

  const facts = document.createElement("table");
  facts.innerHTML =
    `<tr><th>Pickup</th><td>${order.pickup_text}</td></tr>` +
    `<tr><th>Destination</th><td>${order.destination_text}</td></tr>` +
    `<tr><th>Description</th><td>${order.description || "—"}</td></tr>` +
    `<tr><th>Price</th><td>${money(order)} · ${order.payment_status}</td></tr>` +
    `<tr><th>Requested</th><td>${order.requested_at || "—"}</td></tr>` +
    `<tr><th>Promised</th><td>${order.promised_at || "not promised"}</td></tr>` +
    `<tr><th>Tracking</th><td><code>/track/${order.tracking_token}</code> on the web app</td></tr>`;
  body.append(facts);

  const rows = (detail.history || [])
    .map(
      (row) =>
        `<tr><td>${row.from_status || "—"}</td><td>${row.to_status}</td>` +
        `<td>${row.delivery_event || "—"}</td><td>${row.note || ""}</td>` +
        `<td>${timeAgo(row.occurred_at)}</td></tr>`
    )
    .join("");
  const history = document.createElement("div");
  history.innerHTML =
    "<h3>Status history</h3><table><tr><th>From</th><th>To</th><th>Event</th><th>Note</th>" +
    "<th>When</th></tr>" +
    (rows || '<tr><td colspan="5">No history rows returned.</td></tr>') +
    "</table>";
  body.append(history);

  const assignmentRows = (detail.assignments || [])
    .map(
      (row) =>
        `<tr><td>${driverName(row.driver_id)}</td><td>${row.status}</td>` +
        `<td>${row.is_current ? "yes" : "no"}</td><td>${timeAgo(row.assigned_at)}</td>` +
        `<td>${row.notes || ""}</td></tr>`
    )
    .join("");
  const assignments = document.createElement("div");
  assignments.innerHTML =
    "<h3>Assignments</h3><table><tr><th>Driver</th><th>Status</th><th>Current</th>" +
    "<th>Since</th><th>Note</th></tr>" +
    (assignmentRows || '<tr><td colspan="5">Nobody has been assigned yet.</td></tr>') +
    "</table>";
  body.append(assignments);

  if ((detail.allowed_next || []).includes("assigned")) {
    body.append(assignDriverForm(order));
  }
  body.append(priceForm(order));
  body.append(noteForm(order));
}

function assignDriverForm(order) {
  const box = document.createElement("div");
  const drivers = (state.board && state.board.drivers_available) || [];
  box.innerHTML = "<h3>Assign a driver</h3>";
  if (!drivers.length) {
    box.insertAdjacentHTML(
      "beforeend",
      '<p class="muted small">This workspace has no active driver row yet. Drivers come ' +
        "from <code>invite_worker()</code> with the driver role plus a <code>drivers</code> " +
        "record; the board cannot invent one.</p>"
    );
    return box;
  }
  const select = document.createElement("select");
  for (const driver of drivers) {
    const option = document.createElement("option");
    option.value = driver.id;
    option.textContent = `${driver.full_name} (${driver.status})`;
    select.append(option);
  }
  const button = document.createElement("button");
  button.textContent = "Assign now";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api("POST", "/api/rpc/assign_driver", {
        p_order_id: order.id,
        p_driver_id: select.value,
        p_assignment_type: "immediate",
      });
      banner("good", "Assigned. The driver gets a push if FCM is configured.", 5000);
      await loadBoard(true);
    } catch (error) {
      banner("bad", describe(error));
      button.disabled = false;
    }
  });
  box.append(select, button);
  return box;
}

function priceForm(order) {
  const box = document.createElement("div");
  box.innerHTML =
    "<h3>Price and payment</h3><p class='muted small'>An update on the orders row; " +
    "migration 0010 keeps the payment columns away from roles without permission.</p>";
  const price = document.createElement("input");
  price.type = "number";
  price.step = "0.01";
  price.min = "0";
  price.placeholder = order.price_amount === null ? "amount" : String(order.price_amount);
  const payment = document.createElement("select");
  for (const value of PAYMENT_STATUSES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === order.payment_status) option.selected = true;
    payment.append(option);
  }
  // If the database ever gains a payment state this build has not heard of, show it
  // instead of letting the browser fall back to the first option and rewrite the
  // stored value the next time somebody saves a price.
  if (order.payment_status && !PAYMENT_STATUSES.includes(order.payment_status)) {
    const unknown = document.createElement("option");
    unknown.value = order.payment_status;
    unknown.textContent = `${order.payment_status} (unknown to this build)`;
    unknown.selected = true;
    payment.prepend(unknown);
  }
  const button = document.createElement("button");
  button.textContent = "Save";
  button.addEventListener("click", async () => {
    const payload = {};
    if (price.value) payload.price_amount = Number(price.value);
    if (payment.value !== order.payment_status) payload.payment_status = payment.value;
    if (!Object.keys(payload).length) {
      banner("warn", "Nothing changed.");
      return;
    }
    try {
      await api("PATCH", `/api/orders/${order.id}`, payload);
      banner("good", "Saved.", 3000);
      await loadBoard(true);
    } catch (error) {
      banner("bad", describe(error));
    }
  });
  box.append(price, payment, button);
  return box;
}

function noteForm(order) {
  const box = document.createElement("div");
  box.innerHTML = "<h3>Internal note</h3><p class='muted small'>Never shown to customers.</p>";
  const note = document.createElement("textarea");
  note.rows = 2;
  note.value = order.internal_notes || "";
  const button = document.createElement("button");
  button.textContent = "Save note";
  button.addEventListener("click", async () => {
    try {
      await api("PATCH", `/api/orders/${order.id}`, { internal_notes: note.value });
      banner("good", "Note saved.", 3000);
    } catch (error) {
      banner("bad", describe(error));
    }
  });
  box.append(note, button);
  return box;
}

/* ---------- side panel: create and import ---------- */

/* The indicator is a real element measured from the active button rather than a
 * fixed-width guess, so the bar slides correctly whatever the labels end up being
 * — including at the narrow breakpoint where they no longer fit on one row. */
async function loadOrdersList(append) {
  const box = el("orders-table");
  const note = el("orders-note");
  const more = el("omore");
  if (!append) {
    state.orders = [];
    box.innerHTML = '<p class="muted">Loading…</p>';
  }
  const params = new URLSearchParams({
    business_id: state.businessId || "",
    limit: "25",
    offset: String(state.orders.length),
  });
  const search = el("oq").value.trim();
  if (search) params.set("q", search);
  const status = el("ofilter").value;
  if (status) params.set("status", status);
  try {
    const result = await api("GET", `/api/orders?${params.toString()}`);
    state.orders = append ? state.orders.concat(result.orders) : result.orders;
    renderOrdersTable();
    note.textContent = result.note || "";
    show(more, Boolean(result.has_more));
  } catch (error) {
    box.innerHTML = `<p class="muted">${describe(error)}</p>`;
    show(more, false);
  }
}

function renderOrdersTable() {
  const box = el("orders-table");
  if (!state.orders.length) {
    box.innerHTML =
      '<div class="empty">No orders match. That is a real answer, not a loading failure.</div>';
    return;
  }
  const rows = state.orders
    .map(
      (order) => `<tr data-order="${order.id}" class="rowlink">
        <td><strong>${order.reference}</strong></td>
        <td>${order.status}</td>
        <td>${order.customer ? order.customer.display_name || "—" : "—"}</td>
        <td>${money(order)}</td>
        <td>${order.payment_status || "—"}</td>
        <td>${(order.pickup_text || "").slice(0, 34)}</td>
        <td>${(order.destination_text || "").slice(0, 34)}</td>
      </tr>`
    )
    .join("");
  box.innerHTML = `<table><thead><tr>
      <th>Reference</th><th>Status</th><th>Customer</th><th>Price</th>
      <th>Payment</th><th>Pickup</th><th>Destination</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  for (const row of box.querySelectorAll("tr.rowlink")) {
    row.addEventListener("click", () => openDetail(row.dataset.order));
  }
}

async function loadDrivers() {
  const box = el("drivers-list");
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const result = await api(
      "GET",
      `/api/drivers?business_id=${encodeURIComponent(state.businessId || "")}`
    );
    if (!result.drivers.length) {
      box.innerHTML =
        '<div class="empty">No drivers yet. An invitation creates the membership; the driver row appears when they join.</div>';
      return;
    }
    box.innerHTML = `<table><thead><tr>
        <th>Driver</th><th>Status</th><th>Phone</th><th>Rating</th><th>Completed</th>
      </tr></thead><tbody>${result.drivers
        .map(
          (d) => `<tr>
            <td>${d.full_name}</td>
            <td>${d.status}</td>
            <td>${d.phone_e164 || "—"}</td>
            <td>${
              d.average_rating === null || d.average_rating === undefined
                ? '<span class="muted">not rated</span>'
                : Number(d.average_rating).toFixed(2)
            }</td>
            <td>${d.completed_order_count || 0}</td>
          </tr>`
        )
        .join("")}</tbody></table>
      <p class="note">${result.note}</p>`;
  } catch (error) {
    box.innerHTML = `<p class="muted">${describe(error)}</p>`;
  }
}

async function loadMembers() {
  const box = el("members-list");
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const result = await api(
      "GET",
      `/api/businesses/${encodeURIComponent(state.businessId || "")}/members`
    );
    const cell = (v) => v || "—";
    const rows = result.members.map((m) => {
      const p = m.profile || {};
      return `<tr><td>${cell(p.full_name || m.user_id)}</td><td>${m.role}</td>
        <td>${cell(p.phone_e164)}</td><td>${m.is_active ? "active" : "inactive"}</td>
        <td>${(m.joined_at || "").slice(0, 10)}</td></tr>`;
    });
    const pending = (result.pending_invitations || []).map(
      (i) => `<tr><td>${i.email}</td><td>${i.role}</td><td>—</td>
        <td>invited, expires ${(i.expires_at || "").slice(0, 10)}</td><td>—</td></tr>`
    );
    box.innerHTML = `<table><thead><tr><th>Person</th><th>Role</th><th>Phone</th>
      <th>State</th><th>Joined</th></tr></thead><tbody>${rows}${pending}</tbody></table>
      <p class="note">${result.note}</p>`;
  } catch (error) {
    box.innerHTML = `<p class="muted">${describe(error)}</p>`;
  }
}

async function respondOffer(offerId, accept) {
  try {
    await api("POST", "/api/rpc/respond_to_offer", {
      p_offer_id: offerId,
      p_accept: accept,
      p_reason: accept ? null : "declined from the portal",
    });
    banner(
      accept ? "good" : "warn",
      accept
        ? "Accepted. It is now a real order on your dispatch board."
        : "Declined. The vendor sees the reason you sent."
    );
    loadRequests();
    loadBoard();
  } catch (error) {
    banner("bad", describe(error));
  }
}

function fillProfile() {
  const b = state.business;
  if (!b) return;
  el("b-name").value = b.name || "";
  el("b-phone").value = b.phone_e164 || "";
  el("b-city").value = b.city || "";
  el("b-email").value = b.email || "";
  el("b-country").value = b.country_code || "";
  el("b-currency").value = b.currency || "";
  el("b-areas").value = (b.service_areas || []).join(", ");
}

async function saveProfile() {
  try {
    const result = await api(
      "PATCH",
      `/api/businesses/${encodeURIComponent(state.businessId || "")}`,
      {
        name: el("b-name").value.trim(),
        phone_e164: el("b-phone").value.trim() || null,
        city: el("b-city").value.trim() || null,
        email: el("b-email").value.trim() || null,
        country_code: el("b-country").value.trim().toUpperCase() || "NG",
        currency: el("b-currency").value.trim().toUpperCase() || "NGN",
        service_areas: el("b-areas").value.split(",").map((s) => s.trim()).filter(Boolean),
      }
    );
    el("b-out").textContent = JSON.stringify(result, null, 2);
    banner("good", "Profile saved.");
    await loadBusinesses();
    loadBoard();
  } catch (error) {
    el("b-out").textContent = describe(error);
  }
}

async function loadRequests() {
  const box = el("requests-list");
  const note = el("requests-note");
  const vendor = state.business && state.business.kind === "vendor";
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const result = await api(
      "GET",
      `/api/offers?business_id=${encodeURIComponent(state.businessId || "")}`
    );
    const mine = (result.offers || []).filter((o) =>
      vendor ? o.vendor_business_id === state.businessId : o.carrier_business_id === state.businessId
    );
    note.textContent = vendor
      ? "Offers you sent to carriers."
      : "Offers vendors sent you. Accepting turns one into a real order.";
    if (!mine.length) {
      box.innerHTML = '<div class="empty">Nothing waiting.</div>';
      return;
    }
    box.innerHTML = `<table><thead><tr><th>Pickup</th><th>Destination</th>
      <th>Offer</th><th>Status</th><th>Actions</th></tr></thead><tbody>${mine
        .map((o) => {
          const price =
            o.proposed_price === null || o.proposed_price === undefined
              ? '<span class="muted">not stated</span>'
              : `${o.currency} ${Number(o.proposed_price).toLocaleString()}`;
          const action =
            o.status !== "pending"
              ? "—"
              : vendor
                ? `<button data-withdraw="${o.id}" class="ghost" type="button">Withdraw</button>`
                : `<button data-accept="${o.id}" type="button">Accept</button>
                   <button data-decline="${o.id}" class="ghost" type="button">Decline</button>`;
          return `<tr><td>${o.pickup_text}</td><td>${o.destination_text}</td>
            <td>${price}</td><td>${o.status}</td><td>${action}</td></tr>`;
        })
        .join("")}</tbody></table>`;
    for (const b of box.querySelectorAll("[data-accept]")) {
      b.addEventListener("click", () => respondOffer(b.dataset.accept, true));
    }
    for (const b of box.querySelectorAll("[data-decline]")) {
      b.addEventListener("click", () => respondOffer(b.dataset.decline, false));
    }
    for (const b of box.querySelectorAll("[data-withdraw]")) {
      b.addEventListener("click", async () => {
        try {
          await api("POST", "/api/rpc/withdraw_offer", { p_offer_id: b.dataset.withdraw });
          loadRequests();
        } catch (error) {
          banner("bad", describe(error));
        }
      });
    }
  } catch (error) {
    box.innerHTML = `<p class="muted">${describe(error)}</p>`;
  }
}

function openDrawer() {
  show(el("drawer"), true);
  show(el("scrim"), true);
}

function closeDrawer() {
  show(el("drawer"), false);
  show(el("scrim"), false);
  state.openOrderId = null;
}

function moveNavIndicator(button) {
  const nav = el("mainnav");
  const bar = nav && nav.querySelector(".nav-indicator");
  if (!bar || !button) return;
  // The bar sits above the workspace panel, so before that panel is shown every
  // button measures 0px. Recording that would leave the indicator invisible.
  if (!button.offsetWidth) return;
  bar.style.width = `${button.offsetWidth}px`;
  bar.style.transform = `translateX(${button.offsetLeft}px)`;
}

/* Sections are display:none when hidden, so the reveal is a one-shot animation
   class restarted by forcing a reflow rather than a transition. */
function reveal(node) {
  if (!node) return;
  node.classList.remove("hidden", "panel-in");
  void node.offsetWidth;
  node.classList.add("panel-in");
}

/* One section owns the screen at a time. This is what de-clusters the app: the
   board no longer shares a page with detail, forms, tools and integrations. */
function showView(name) {
  const buttons = el("mainnav").querySelectorAll("button");
  let active = null;
  for (const button of buttons) {
    const on = button.dataset.view === name;
    button.classList.toggle("active", on);
    button.setAttribute("aria-current", on ? "page" : "false");
    if (on) active = button;
  }
  for (const view of ["dispatch", "orders", "drivers", "requests", "team", "settings"]) {
    const node = el(`view-${view}`);
    if (view === name) reveal(node);
    else show(node, false);
  }
  moveNavIndicator(active);
  state.view = name;
  closeDrawer();

  // Each section loads its own data the first time it is opened, so the board is
  // not waiting on drivers and members it does not need.
  if (name === "orders") loadOrdersList(false);
  if (name === "drivers") loadDrivers();
  if (name === "team") loadMembers();
  if (name === "requests") loadRequests();
  if (name === "settings") fillProfile();
}

async function createOrder() {
  const business = currentBusiness();
  if (!business) {
    el("create-note").textContent = "Pick a workspace first — every order belongs to one.";
    return;
  }
  const payload = {
    p_business_id: business.id,
    p_customer_name: el("o-name").value.trim(),
    p_customer_phone: el("o-phone").value.trim(),
    p_pickup_text: el("o-pickup").value.trim(),
    p_destination_text: el("o-dest").value.trim(),
  };
  const description = el("o-desc").value.trim();
  const price = el("o-price").value.trim();
  if (description) payload.p_description = description;
  if (price) payload.p_price_amount = price;
  for (const [key, value] of Object.entries(payload)) {
    if (!value) {
      el("create-note").textContent = `${key.replace("p_", "")} is required.`;
      return;
    }
  }
  el("create").disabled = true;
  try {
    const created = await api("POST", "/api/rpc/create_delivery_order", payload);
    const reference = created && created.reference ? created.reference : "created";
    el("create-note").textContent = `Order ${reference} is in the database as "requested".`;
    const paymentMethod = el("o-payment").value;
    if (paymentMethod && created && created.id) {
      await api("PATCH", `/api/orders/${created.id}`, { payment_method: paymentMethod });
    }
    for (const id of ["o-name", "o-phone", "o-pickup", "o-dest", "o-desc", "o-price"]) {
      el(id).value = "";
    }
    await loadBoard(true);
  } catch (error) {
    el("create-note").textContent = describe(error);
  } finally {
    el("create").disabled = false;
  }
}

async function parseWhatsApp() {
  const text = el("wa-text").value;
  if (!text.trim()) return;
  try {
    const result = await api("POST", "/api/imports/whatsapp", { text });
    state.draft = result.draft;
    el("parse-out").textContent = JSON.stringify(result, null, 2);
    show(el("use-draft"), true);
    if ((result.questions || []).length) {
      banner(
        "warn",
        `${result.questions.length} thing(s) still need a human: ${result.questions[0]}`
      );
    }
  } catch (error) {
    el("parse-out").textContent = describe(error);
  }
}

function useDraft() {
  const draft = state.draft || {};
  if (draft.customer_phone) el("o-phone").value = draft.customer_phone;
  if (draft.pickup_text) el("o-pickup").value = draft.pickup_text;
  if (draft.destination_text) el("o-dest").value = draft.destination_text;
  if (draft.parcel_details) el("o-desc").value = draft.parcel_details;
  if (draft.quoted_price && draft.quoted_price.amount) {
    el("o-price").value = draft.quoted_price.amount;
  }
  showView("settings");
  // The parser has no name, and the RPC needs one: focus the only field it cannot guess.
  el("o-name").focus();
  banner(
    "good",
    "Draft copied in. A name is the one thing the parser never guesses — nothing is saved yet.",
    6000
  );
}

/* ---------- team ---------- */

async function invite() {
  const business = currentBusiness();
  if (!business) {
    el("invite-out").textContent = "Create or join a workspace first.";
    return;
  }
  const email = el("i-email").value.trim().toLowerCase();
  if (!email) {
    el("invite-out").textContent = "An email is required.";
    return;
  }
  const role = el("i-role").value;
  const name = el("i-name").value.trim() || null;
  try {
    let invitation;
    try {
      invitation = await api("POST", "/api/rpc/invite_worker", {
        p_business_id: business.id,
        p_email: email,
        p_role: role,
        p_display_name: name || undefined,
      });
    } catch (error) {
      if (error.status !== 404) throw error;
      el("invite-out").textContent =
        "invite_worker() is not in this database, so the migration that defines it " +
        "(0007 onward) has not been applied. Nothing was created. The invitations table " +
        "cannot be filled in by hand here because code_hash has no default and the real " +
        "code must never be stored. Apply the migrations, then try again.";
      return;
    }
    el("invite-out").textContent = JSON.stringify(invitation, null, 2);
    const code = invitation && invitation.code;
    if (!code) {
      el("invite-out").textContent +=
        "\n\nNo code came back, so nothing was emailed. Read the row back with " +
        "GET /invitations and check whether an earlier pending invitation exists.";
      return;
    }
    if (el("i-send").checked) {
      const mailed = await api("POST", "/api/mail/invitation", {
        email,
        code,
        role,
        business_name: business.name,
      });
      el("invite-out").textContent +=
        "\n\n" +
        (mailed.manual_handoff
          ? `Not emailed (${mailed.reason}). Hand the worker this code: ${code}`
          : `Emailed to ${email}.`);
    } else {
      el("invite-out").textContent += `\n\nHand the worker this code: ${code}`;
    }
  } catch (error) {
    el("invite-out").textContent = describe(error);
  }
}

/* ---------- tools ---------- */

async function geocode() {
  try {
    el("tool-out").textContent = JSON.stringify(
      await api("POST", "/api/geo/geocode", { text: el("g-text").value }),
      null,
      2
    );
  } catch (error) {
    el("tool-out").textContent = describe(error);
  }
}

async function routeEta() {
  try {
    el("tool-out").textContent = JSON.stringify(
      await api("POST", "/api/geo/route", {
        origin: el("r-from").value,
        destination: el("r-to").value,
      }),
      null,
      2
    );
  } catch (error) {
    el("tool-out").textContent = describe(error);
  }
}

async function verifyPayment() {
  try {
    el("tool-out").textContent = JSON.stringify(
      await api("POST", "/api/payments/verify", { reference: el("p-ref").value }),
      null,
      2
    );
  } catch (error) {
    el("tool-out").textContent = describe(error);
  }
}

/* ---------- wiring ---------- */

el("signin").addEventListener("click", signIn);
el("signup").addEventListener("click", signUp);
el("signout").addEventListener("click", signOut);
el("password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") signIn();
});
el("refresh").addEventListener("click", () => loadBoard());
el("create").addEventListener("click", createOrder);
el("parse").addEventListener("click", parseWhatsApp);
el("use-draft").addEventListener("click", useDraft);
el("invite").addEventListener("click", invite);
el("geocode").addEventListener("click", geocode);
el("route").addEventListener("click", routeEta);
el("verify").addEventListener("click", verifyPayment);

const navButtons = [...el("mainnav").querySelectorAll("button")];
for (const button of navButtons) {
  button.addEventListener("click", () => showView(button.dataset.view));
}
// Left/Right move between sections and Home/End jump to the ends.
el("mainnav").addEventListener("keydown", (event) => {
  const index = navButtons.indexOf(document.activeElement);
  if (index === -1) return;
  const step = { ArrowRight: 1, ArrowLeft: -1 };
  let next = null;
  if (event.key in step) next = (index + step[event.key] + navButtons.length) % navButtons.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = navButtons.length - 1;
  if (next === null) return;
  event.preventDefault();
  navButtons[next].focus();
  showView(navButtons[next].dataset.view);
});
el("drawer-close").addEventListener("click", closeDrawer);
el("scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});
el("osearch").addEventListener("click", () => loadOrdersList(false));
el("omore").addEventListener("click", () => loadOrdersList(true));
el("create2").addEventListener("click", createOrder);
el("b-save").addEventListener("click", saveProfile);

// The indicator is measured from layout, so it is placed once the workspace is
// visible and re-measured whenever the column width changes.
window.addEventListener("resize", () => {
  moveNavIndicator(el("mainnav").querySelector(".active"));
});

el("business").addEventListener("change", (event) => {
  state.businessId = event.target.value;
  localStorage.setItem("pulse.business", state.businessId);
  state.openOrderId = null;
  closeDrawer();
  loadBoard();
});

el("filter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderBoard();
});

boot();

