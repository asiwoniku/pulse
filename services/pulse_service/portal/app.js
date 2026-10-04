/* Pulse partner portal.
 *
 * Rules this file follows, because the product promised them:
 *  - live operational views never invent data. The opt-in workflow preview uses
 *    fictional records in separate browser storage and never fills live views.
 *  - the token kept here is the caller's own; the service forwards it and the
 *    database decides. This page never receives a service-role key.
 *  - buttons for status changes come from the transition graph, so an illegal move
 *    is dimmed for looks only: Postgres is still the one that refuses it.
 */
"use strict";

const SESSION_KEY = "pulse.session";
const POLL_MS = 20000;
const DEMO_KEY = "pulse.partner-demo";
const DEMO_SCREENS = [
  "demo-application",
  "demo-pending",
  "demo-onboarding",
  "demo-orders",
];
const DEMO_SAMPLE_ORDERS = [
  {
    id: "demo-order-1",
    reference: "DEMO-26001",
    customer: "Northstar Market (sample)",
    route: "Victoria Island → Ikeja",
    status: "in_transit",
    detail: "Office supplies · Sample record only",
    events: ["Order created · sample", "Pickup confirmed · sample", "In transit · sample"],
  },
  {
    id: "demo-order-2",
    reference: "DEMO-26002",
    customer: "Green Basket Foods (sample)",
    route: "Yaba → Lekki Phase 1",
    status: "assigned",
    detail: "Temperature-safe parcel · Sample record only",
    events: ["Order created · sample", "Driver assigned · sample"],
  },
  {
    id: "demo-order-3",
    reference: "DEMO-25988",
    customer: "Studio Eleven (sample)",
    route: "Surulere → Onikan",
    status: "delivered",
    detail: "Documents · Sample record only",
    events: ["Order created · sample", "Pickup confirmed · sample", "Delivered · sample"],
  },
];

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
  openShipmentId: null,
  view: "dispatch",
  orders: [],
  shipments: [],
  customers: [],
  customersHasMore: false,
  vehicles: [],
  business: null,
  authMode: "signin",
  demoScreen: null,
  demoOrderId: null,
  demoOrderFilter: "all",
  demoPartnerView: "overview",
  demoLoaderTimeout: null,
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

function readDemoState() {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    return saved
      ? JSON.parse(saved)
      : {
          application: null,
          onboardingStep: 0,
          onboardingComplete: false,
          services: ["Local delivery"],
          serviceAreas: "Lagos",
          inviteEmail: "",
          orders: DEMO_SAMPLE_ORDERS.map((order) => ({ ...order, events: [...order.events] })),
          drivers: [],
          vehicles: [],
          requests: [],
          teamMembers: [],
          settings: { orderNotifications: true, teamNotifications: true },
        };
  } catch (_) {
    return {
      application: null,
      onboardingStep: 0,
      onboardingComplete: false,
      services: ["Local delivery"],
      serviceAreas: "Lagos",
      inviteEmail: "",
      orders: DEMO_SAMPLE_ORDERS.map((order) => ({ ...order, events: [...order.events] })),
      drivers: [],
      vehicles: [],
      requests: [],
      teamMembers: [],
      settings: { orderNotifications: true, teamNotifications: true },
    };
  }
}

function saveDemoState(data) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    const note = el("demo-application-note") || el("onboarding-note");
    if (note) note.textContent = `This browser could not save the demo progress: ${describe(error)}`;
    return false;
  }
}

function demoApplicationTemplate() {
  return {
    id: "demo-application-1",
    company: "Harbourline Logistics (Demo)",
    kind: "carrier",
    representative: "Ada Okafor (Demo)",
    email: "ada@harbourline.example",
    phone: "+234 800 000 0101",
    city: "Lagos",
    status: "pending_review",
    reviewerNote: "",
    submittedAt: new Date().toISOString(),
    documents: [
      { name: "Business registration", reference: "Sample reference · no real certificate", status: "sample" },
      { name: "Representative identity", reference: "Sample reference · no ID image stored", status: "sample" },
      { name: "Business address evidence", reference: "Sample reference · not independently checked", status: "sample" },
    ],
  };
}

function demoEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showDemoScreen(screen) {
  if (screen === "demo-onboarding" || screen === "demo-orders") {
    const demo = readDemoState();
    if (!demo.application || demo.application.status !== "approved") {
      showDemoScreen("demo-pending");
      return;
    }
    if (screen === "demo-orders" && !demo.onboardingComplete) {
      showDemoScreen("demo-onboarding");
      return;
    }
  }
  state.demoScreen = screen || null;
  if (state.demoLoaderTimeout) {
    window.clearTimeout(state.demoLoaderTimeout);
    state.demoLoaderTimeout = null;
  }
  show(el("demo-page-loading"), screen === "demo-orders");
  if (screen === "demo-orders") {
    state.demoLoaderTimeout = window.setTimeout(() => {
      show(el("demo-page-loading"), false);
      state.demoLoaderTimeout = null;
    }, 700);
  }
  show(el("landing"), !screen);
  show(el("auth"), false);
  show(el("partner-onboarding"), false);
  show(el("workspace"), false);
  show(el("mainnav"), false);
  show(el("signout"), false);
  show(el("business"), false);
  show(el("whoami"), false);
  for (const id of DEMO_SCREENS) show(el(id), id === screen);
  if (screen === "demo-application") {
    fillDemoApplicationForm();
  } else if (screen === "demo-pending") {
    renderDemoPending();
  } else if (screen === "demo-onboarding") {
    renderDemoOnboarding();
  } else if (screen === "demo-orders") {
    renderDemoOrders();
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function openApprovedDemoAccount() {
  const demo = ensureDemoApplication();
  const application = demo.application;
  application.status = "approved";
  application.reviewerNote = "Approved in the demo preview. No real identity or company verification was performed.";
  application.reviewedAt = new Date().toISOString();
  demo.onboardingStep = 3;
  demo.onboardingComplete = true;
  demo.services = demo.services && demo.services.length ? demo.services : ["Local delivery", "Intercity delivery"];
  demo.serviceAreas = demo.serviceAreas || `${application.city}, Ogun`;
  demo.profile = demo.profile || { email: application.email, phone: application.phone };
  if (!demo.teamMembers || !demo.teamMembers.length) {
    demo.teamMembers = [
      { name: application.representative, email: application.email, role: "Owner" },
      { name: "Chidi Nwosu (Demo)", email: "chidi@harbourline.example", role: "Dispatcher" },
    ];
  }
  if (!demo.drivers || !demo.drivers.length) demo.drivers = [
    { id: "demo-driver-1", name: "Chidi Nwosu (Demo)", phone: "+234 800 000 0611", status: "available", completed: 42, rating: "4.9" },
    { id: "demo-driver-2", name: "Zainab Yusuf (Demo)", phone: "+234 800 000 0722", status: "on_delivery", completed: 37, rating: "4.8" },
    { id: "demo-driver-3", name: "Emeka Okoro (Demo)", phone: "+234 800 000 0833", status: "available", completed: 29, rating: "4.7" },
  ];
  if (!demo.vehicles || !demo.vehicles.length) demo.vehicles = [
    { id: "demo-vehicle-1", label: "Van 01 (Demo)", registration: "SAMPLE-LAG-01", type: "van", capacity: "Light parcels · sample only" },
    { id: "demo-vehicle-2", label: "Motorbike 02 (Demo)", registration: "SAMPLE-LAG-02", type: "motorbike", capacity: "Documents and small parcels · sample only" },
  ];
  if (!demo.requests || !demo.requests.length) demo.requests = [
    { id: "demo-request-1", requester: "Green Basket Foods (Demo)", route: "Lekki Phase 1 → Victoria Island", load: "6 insulated food crates", fee: "NGN 18,500", status: "open", time: "Today · 10:24" },
    { id: "demo-request-2", requester: "Northstar Market (Demo)", route: "Ikeja → Yaba", load: "Office supplies · 4 cartons", fee: "NGN 12,000", status: "accepted", time: "Today · 09:50" },
    { id: "demo-request-3", requester: "Studio Eleven (Demo)", route: "Surulere → Onikan", load: "Documents · secure envelope", fee: "NGN 8,000", status: "open", time: "Yesterday · 16:10" },
  ];
  demo.settings = demo.settings || { orderNotifications: true, teamNotifications: true };
  demo.orders = DEMO_SAMPLE_ORDERS.map((order) => ({ ...order, events: [...order.events] }));
  if (!saveDemoState(demo)) return;
  state.demoPartnerView = "overview";
  showDemoScreen("demo-orders");
}

function startDemoApplication() {
  const demo = readDemoState();
  demo.application = demoApplicationTemplate();
  demo.onboardingStep = 0;
  demo.onboardingComplete = false;
  demo.services = ["Local delivery"];
  demo.serviceAreas = "Lagos";
  demo.inviteEmail = "";
  demo.orders = DEMO_SAMPLE_ORDERS.map((order) => ({ ...order, events: [...order.events] }));
  demo.drivers = [];
  demo.vehicles = [];
  demo.requests = [];
  demo.teamMembers = [];
  if (!saveDemoState(demo)) return;
  showDemoScreen("demo-application");
}

function fillDemoApplicationForm() {
  const application = readDemoState().application || demoApplicationTemplate();
  el("demo-company").value = application.company;
  el("demo-kind").value = application.kind;
  el("demo-representative").value = application.representative;
  el("demo-email").value = application.email;
  el("demo-phone").value = application.phone;
  el("demo-city").value = application.city;
  el("demo-confirm").checked = false;
  el("demo-application-note").textContent = "";
}

function submitDemoApplication(event) {
  event.preventDefault();
  const demo = readDemoState();
  const application = demo.application || demoApplicationTemplate();
  application.company = el("demo-company").value.trim();
  application.kind = el("demo-kind").value;
  application.representative = el("demo-representative").value.trim();
  application.email = el("demo-email").value.trim();
  application.phone = el("demo-phone").value.trim();
  application.city = el("demo-city").value.trim();
  application.status = "pending_review";
  application.reviewerNote = "";
  application.submittedAt = new Date().toISOString();
  demo.application = application;
  if (!saveDemoState(demo)) return;
  showDemoScreen("demo-pending");
}

function ensureDemoApplication() {
  const demo = readDemoState();
  if (!demo.application) {
    demo.application = demoApplicationTemplate();
    saveDemoState(demo);
  }
  return demo;
}

function renderDemoPending() {
  const demo = ensureDemoApplication();
  const application = demo.application;
  const messages = {
    pending_review: ["Your application is in review.", "A Pulse administrator would review the submitted business details and evidence before a partner workspace is activated. No verification has taken place in this demo."],
    more_information: ["More information requested.", application.reviewerNote || "The reviewer left a sample note. No live application has been submitted."],
    approved: ["Sample application approved.", "The demo administrator approved this sample application. This decision does not verify a real company or identity."],
    declined: ["Application not approved in this demo.", application.reviewerNote || "A real decision would include a reason and a way to contact support."],
  };
  const copy = messages[application.status] || messages.pending_review;
  el("demo-pending-title").textContent = copy[0];
  el("demo-pending-copy").textContent = copy[1];
  const current = application.status === "approved" ? 2 : 1;
  el("demo-pending-decision").innerHTML = application.status === "pending_review"
    ? '<span class="decision-indicator pending"></span><div><b>Under administrator review</b><small>Only an authorised reviewer should make real partner approval decisions.</small></div>'
    : `<span class="decision-indicator ${application.status === "approved" ? "approved" : "needs-info"}"></span><div><b>${application.status === "approved" ? "Demo review decision" : application.status === "declined" ? "Demo review outcome" : "Reviewer requested information"}</b><small>${demoEscape(application.reviewerNote || (application.status === "approved" ? "Approved in demo only." : "No additional note."))}</small></div>`;
  const stages = [...el("demo-pending").querySelectorAll(".review-progress span")];
  stages.forEach((stage, index) => {
    stage.classList.toggle("done", index === 0 || current > index);
    stage.classList.toggle("active", index === current);
    const icon = stage.querySelector("i");
    if (index === 0 || current > index) icon.textContent = "✓";
    else icon.textContent = `0${index + 1}`;
  });
  const actions = el("demo-pending").querySelector(".status-actions");
  actions.innerHTML = "";
  const editApplication = document.createElement("button");
  editApplication.className = "ghost";
  editApplication.type = "button";
  editApplication.textContent = application.status === "more_information" ? "Edit and resubmit sample application" : "Start a fresh sample application";
  editApplication.addEventListener("click", startDemoApplication);
  actions.append(editApplication);
  if (application.status === "approved") {
    const setup = document.createElement("button");
    setup.type = "button";
    setup.textContent = "Continue to partner onboarding";
    setup.addEventListener("click", () => showDemoScreen(
      demo.onboardingComplete ? "demo-orders" : "demo-onboarding"
    ));
    actions.append(setup);
  } else if (application.status === "more_information") {
    const resubmit = document.createElement("button");
    resubmit.className = "ghost";
    resubmit.type = "button";
    resubmit.textContent = "Submit sample follow-up";
    resubmit.addEventListener("click", () => {
      const latest = readDemoState();
      latest.application.status = "pending_review";
      latest.application.reviewerNote = "Sample follow-up submitted; awaiting review.";
      latest.application.submittedAt = new Date().toISOString();
      saveDemoState(latest);
      renderDemoPending();
    });
    actions.append(resubmit);
  }
}

function renderDemoOnboarding() {
  const demo = readDemoState();
  const application = demo.application || demoApplicationTemplate();
  if (demo.onboardingComplete) {
    el("setup-step-label").textContent = "DEMO WORKSPACE READY";
    el("setup-step-title").textContent = "Your workspace is ready.";
    el("setup-step-description").textContent = "The sample application was approved and all sample setup steps are complete.";
    show(el("setup-back"), false);
    el("setup-next").textContent = "Open partner workspace";
    el("setup-step-content").innerHTML = `<div class="profile-review-card"><span class="profile-review-mark">${demoEscape(application.company.slice(0, 1))}</span><div><b>${demoEscape(application.company)}</b><small>${demoEscape(application.kind)} · ${demoEscape(application.city)}</small></div><span class="demo-status approved">Ready · demo only</span></div><div class="verified-banner"><span>✓</span><div><b>Demo journey complete</b><small>This sample account is not a real verified partner.</small></div></div>`;
    el("setup-checklist-items").innerHTML = [
      "Business application",
      "Administrator decision",
      "Business profile",
      "Services & coverage",
      "Team workspace",
    ].map((title) => `<div class="checklist-line complete"><i>✓</i><span><b>${title}</b><small>Complete · demo</small></span></div>`).join("");
    el("demo-onboarding").querySelectorAll(".onboarding-progress span").forEach((item) => {
      item.classList.remove("active");
      item.classList.add("done");
    });
    return;
  }
  const step = Math.max(0, Math.min(2, Number(demo.onboardingStep) || 0));
  const labels = ["Confirm your business profile", "Choose services and coverage", "Set up your team"];
  const descriptions = [
    "Review the sample details that would become your partner workspace profile.",
    "Select the service types your business offers and where you operate.",
    "Add a teammate email for the demo, then finish your partner setup.",
  ];
  el("setup-step-label").textContent = `STEP ${step + 1} OF 3`;
  el("setup-step-title").textContent = labels[step];
  el("setup-step-description").textContent = descriptions[step];
  show(el("setup-back"), step > 0);
  el("setup-next").textContent = step === 2 ? "Finish onboarding" : "Continue";
  const content = el("setup-step-content");
  content.replaceChildren();
  if (step === 0) {
    content.innerHTML = `<div class="profile-review-card"><span class="profile-review-mark">${demoEscape(application.company.slice(0, 1))}</span><div><b>${demoEscape(application.company)}</b><small>${demoEscape(application.kind)} · ${demoEscape(application.city)}</small></div><span class="demo-status approved">Application approved · demo</span></div><div class="onboarding-fields"><label>Business contact email<input id="setup-business-email" type="email" value="${demoEscape(application.email)}" /></label><label>Business phone<input id="setup-business-phone" type="tel" value="${demoEscape(application.phone)}" /></label></div><p class="demo-inline-note">The sample profile is fictional. A real account would allow an authorised owner to review and maintain these details.</p>`;
  } else if (step === 1) {
    const services = ["Local delivery", "Intercity delivery", "Moving services"];
    content.innerHTML = `<fieldset class="service-choice-group"><legend>What services do you provide?</legend>${services.map((service) => `<label class="service-choice"><input type="checkbox" name="demo-service" value="${demoEscape(service)}" ${demo.services.includes(service) ? "checked" : ""}/><span><b>${demoEscape(service)}</b><small>${service === "Local delivery" ? "Within your operating city" : service === "Intercity delivery" ? "Between cities and regions" : "Household and office moves"}</small></span><i></i></label>`).join("")}</fieldset><label>Service coverage<textarea id="setup-service-areas" rows="3" placeholder="Lagos, Ogun">${demoEscape(demo.serviceAreas)}</textarea></label><p class="demo-inline-note">Service listings are descriptive demo preferences only; they do not create rates, licences or marketplace availability.</p>`;
  } else {
    content.innerHTML = `<div class="team-setup-card"><span class="team-setup-icon">＋</span><div><b>Invite a teammate (optional)</b><small>Use a sample email address. Invitations are not sent in this demo.</small></div></div><label>Teammate business email<input id="setup-invite-email" type="email" placeholder="colleague@company.example" value="${demoEscape(demo.inviteEmail)}" /></label><label class="demo-consent ready-consent"><input id="setup-ready-check" type="checkbox"/><span>I’ve reviewed the sample workspace profile and selected services.</span></label><p class="demo-inline-note">In a live workspace, roles and invitations are controlled by your organisation’s permissions.</p>`;
  }
  const checklist = el("setup-checklist-items");
  checklist.innerHTML = [
    ["Business application", "Complete", true],
    ["Administrator decision", "Approved in demo", true],
    ["Business profile", step > 0 ? "Confirmed" : "To confirm", step > 0],
    ["Services & coverage", step > 1 ? "Selected" : "To set up", step > 1],
    ["Team workspace", demo.onboardingComplete ? "Ready" : "To finish", demo.onboardingComplete],
  ].map(([title, status, done]) => `<div class="checklist-line ${done ? "complete" : ""}"><i>${done ? "✓" : "·"}</i><span><b>${title}</b><small>${status}</small></span></div>`).join("");
  el("demo-onboarding").querySelectorAll(".onboarding-progress span").forEach((item, index) => {
    item.classList.toggle("active", index === step);
    item.classList.toggle("done", index < step);
  });
}

function advanceDemoOnboarding(direction) {
  const demo = readDemoState();
  if (demo.onboardingComplete) {
    showDemoScreen("demo-orders");
    return;
  }
  const step = Math.max(0, Math.min(2, Number(demo.onboardingStep) || 0));
  if (direction < 0) {
    demo.onboardingStep = Math.max(0, step - 1);
    if (saveDemoState(demo)) renderDemoOnboarding();
    return;
  }
  if (step === 0) {
    const email = el("setup-business-email").value.trim();
    const phone = el("setup-business-phone").value.trim();
    if (!email || !phone) {
      banner("warn", "Add the sample business contact email and phone to continue.");
      return;
    }
    demo.profile = { email, phone };
  } else if (step === 1) {
    demo.services = [...document.querySelectorAll('input[name="demo-service"]:checked')].map((input) => input.value);
    demo.serviceAreas = el("setup-service-areas").value.trim();
    if (!demo.services.length || !demo.serviceAreas) {
      banner("warn", "Choose at least one service and add a service coverage area.");
      return;
    }
  } else {
    const email = el("setup-invite-email").value.trim();
    if (email && !el("setup-invite-email").checkValidity()) {
      banner("warn", "Enter a valid sample email, or leave the teammate field blank.");
      return;
    }
    if (!el("setup-ready-check").checked) {
      banner("warn", "Confirm the sample workspace setup before finishing.");
      return;
    }
    demo.inviteEmail = email;
    demo.onboardingComplete = true;
    if (!demo.orders || !demo.orders.length) {
      demo.orders = DEMO_SAMPLE_ORDERS.map((order) => ({ ...order, events: [...order.events] }));
    }
    if (!saveDemoState(demo)) return;
    showDemoScreen("demo-orders");
    return;
  }
  demo.onboardingStep = step + 1;
  if (saveDemoState(demo)) renderDemoOnboarding();
}

function renderDemoOrders() {
  const demo = readDemoState();
  const application = demo.application || demoApplicationTemplate();
  el("demo-workspace-name").textContent = application.company;
  el("demo-greeting-name").textContent = (application.representative.split(/\s+/)[0] || "Partner").replace("(Demo)", "");
  const orders = demo.orders || [];
  el("demo-active-orders").textContent = orders.filter((order) => order.status !== "delivered").length;
  el("demo-in-transit").textContent = orders.filter((order) => order.status === "in_transit").length;
  el("demo-delivered").textContent = orders.filter((order) => order.status === "delivered").length;
  const visible = orders.filter((order) =>
    state.demoOrderFilter === "all" ||
    (state.demoOrderFilter === "active" && order.status !== "delivered") ||
    (state.demoOrderFilter === "delivered" && order.status === "delivered")
  );
  const list = el("demo-orders-list");
  list.replaceChildren();
  if (!visible.length) {
    list.innerHTML = '<div class="empty">No sample orders in this filter.</div>';
  } else {
    for (const order of visible) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "demo-order-row";
      row.innerHTML = `<span class="demo-order-ref">${demoEscape(order.reference)}</span><span class="demo-order-customer"><b>${demoEscape(order.customer)}</b><small>${demoEscape(order.route)}</small></span><span class="demo-order-description">${demoEscape(order.detail)}</span><span class="demo-order-status ${demoEscape(order.status)}">${demoEscape(order.status.replaceAll("_", " "))}</span><span class="demo-order-chevron">›</span>`;
      row.addEventListener("click", () => {
        state.demoOrderId = order.id;
        renderDemoOrderDetail(order);
      });
      list.append(row);
    }
  }
  for (const panel of el("demo-orders").querySelectorAll(".demo-partner-panel")) {
    panel.classList.toggle("hidden", panel.id !== `demo-${state.demoPartnerView}-panel`);
  }
  el("demo-orders").querySelectorAll("[data-partner-view]").forEach((button) =>
    button.classList.toggle("active", button.dataset.partnerView === state.demoPartnerView)
  );
  const profile = demo.profile || { email: application.email, phone: application.phone, areas: demo.serviceAreas };
  el("demo-profile-name").value = application.company;
  el("demo-profile-email").value = profile.email || application.email;
  el("demo-profile-phone").value = profile.phone || application.phone;
  el("demo-profile-city").value = application.city;
  el("demo-profile-areas").value = profile.areas || demo.serviceAreas || application.city;
  const settings = demo.settings || { orderNotifications: true, teamNotifications: true };
  el("demo-setting-order-notifications").checked = settings.orderNotifications !== false;
  el("demo-setting-team-notifications").checked = settings.teamNotifications !== false;
  renderDemoPartnerActivity(orders);
  renderDemoTeam(demo, application);
  renderDemoDrivers(demo);
  renderDemoCustomers(demo);
  renderDemoFleet(demo);
  renderDemoRequests(demo);
}

function renderDemoPartnerActivity(orders) {
  const events = orders.flatMap((order) => order.events.map((event, index) => ({
    order,
    event,
    index,
  }))).slice().reverse().slice(0, 5);
  const markup = events.length
    ? events.map(({ order, event, index }) => `<article class="activity-row"><span class="activity-pin ${order.status === "delivered" ? "complete" : ""}"></span><div><b>${demoEscape(event)}</b><small>${demoEscape(order.reference)} · ${demoEscape(order.route)}</small></div><time>${index === order.events.length - 1 ? "Latest" : "Sample"}</time></article>`).join("")
    : '<p class="queue-empty">No sample shipment updates yet.</p>';
  el("demo-activity-feed").innerHTML = markup;
  el("demo-shipments-list").innerHTML = markup;
}

function renderDemoTeam(demo, application) {
  const members = demo.teamMembers || [{ name: application.representative, email: application.email, role: "Owner" }];
  el("demo-team-list").innerHTML = members.map((member) => `<div class="demo-team-row"><span class="queue-avatar">${demoEscape(member.name.slice(0, 1))}</span><span><b>${demoEscape(member.name)}</b><small>${demoEscape(member.email)}</small></span><span class="demo-team-role">${demoEscape(member.role)}</span></div>`).join("");
}

function renderDemoDrivers(demo) {
  const drivers = demo.drivers || [];
  el("demo-drivers-list").innerHTML = drivers.length
    ? drivers.map((driver) => `<article class="demo-driver-card"><div class="demo-driver-card-head"><span class="queue-avatar">${demoEscape(driver.name.slice(0, 1))}</span><span class="demo-driver-state ${driver.status === "available" ? "available" : "busy"}"><i></i>${demoEscape(driver.status.replaceAll("_", " "))}</span></div><h3>${demoEscape(driver.name)}</h3><p>${demoEscape(driver.phone)}</p><div class="demo-driver-stats"><span><b>${demoEscape(driver.rating)}</b><small>rating</small></span><span><b>${demoEscape(driver.completed)}</b><small>completed</small></span></div><button type="button" data-driver-toggle="${demoEscape(driver.id)}">${driver.status === "available" ? "Set on break" : driver.status === "on_delivery" ? "Mark delivery complete" : "Set available"}</button></article>`).join("")
    : '<div class="demo-empty-state"><b>No sample drivers yet</b><p>Add drivers to preview fleet availability and assignment workflows.</p></div>';
  el("demo-drivers-list").querySelectorAll("[data-driver-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const latest = readDemoState();
      const driver = latest.drivers.find((item) => item.id === button.dataset.driverToggle);
      if (!driver) return;
      driver.status = driver.status === "available" ? "on_break" : "available";
      if (!saveDemoState(latest)) return;
      renderDemoDrivers(latest);
    });
  });
}

function renderDemoCustomers(demo) {
  const customers = new Map();
  for (const order of demo.orders || []) {
    const key = order.customer;
    if (!customers.has(key)) {
      customers.set(key, {
        name: key,
        phone: order.customerPhone || "Not recorded in this sample",
        orders: 0,
      });
    }
    customers.get(key).orders += 1;
  }
  const list = [...customers.values()];
  el("demo-customers-list").innerHTML = list.length
    ? list.map((customer) => `<article class="demo-request-card"><div><h3>${demoEscape(customer.name)}</h3><p>${demoEscape(customer.phone)}</p></div><span>${customer.orders} sample order${customer.orders === 1 ? "" : "s"}</span></article>`).join("")
    : '<div class="demo-empty-state"><b>No sample customers yet</b><p>Create a sample order to see its contact here.</p></div>';
}

function renderDemoFleet(demo) {
  const vehicles = demo.vehicles || [];
  el("demo-fleet-list").innerHTML = vehicles.length
    ? vehicles.map((vehicle) => `<article class="demo-request-card"><div><h3>${demoEscape(vehicle.label)}</h3><p>${demoEscape(vehicle.registration || "Registration not provided")}</p></div><span>${demoEscape(vehicle.type)} · ${demoEscape(vehicle.capacity || "Capacity not recorded")}</span></article>`).join("")
    : '<div class="demo-empty-state"><b>No sample vehicles yet</b><p>Add a clearly marked demo vehicle to preview the fleet list.</p></div>';
}

function addDemoVehicle(event) {
  event.preventDefault();
  const label = el("demo-vehicle-label").value.trim();
  if (label.length < 2) {
    el("demo-vehicle-note").textContent = "Enter a vehicle label with at least two characters.";
    return;
  }
  const demo = readDemoState();
  demo.vehicles = demo.vehicles || [];
  demo.vehicles.push({
    id: `demo-vehicle-${Date.now()}`,
    label: `${label} (Demo)`,
    registration: el("demo-vehicle-registration").value.trim(),
    type: el("demo-vehicle-type").value,
    capacity: el("demo-vehicle-capacity").value.trim(),
  });
  if (!saveDemoState(demo)) return;
  el("demo-vehicle-form").reset();
  el("demo-vehicle-note").textContent = "Sample vehicle saved locally. No real fleet data was changed.";
  renderDemoFleet(demo);
}

function renderDemoRequests(demo) {
  const requests = demo.requests || [];
  const filter = state.demoRequestFilter || "all";
  const visible = requests.filter((request) => filter === "all" || request.status === filter);
  el("demo-requests-list").innerHTML = visible.length
    ? visible.map((request) => `<article class="demo-request-card"><div class="demo-request-main"><span class="demo-request-icon">↗</span><div><span class="demo-request-meta">${demoEscape(request.requester)} · ${demoEscape(request.time)}</span><h3>${demoEscape(request.route)}</h3><p>${demoEscape(request.load)}</p></div></div><div class="demo-request-side"><b>${demoEscape(request.fee)}</b><span class="application-state ${request.status === "accepted" ? "approved" : "pending_review"}">${demoEscape(request.status)}</span>${request.status === "open" ? `<div><button type="button" data-request-action="accept" data-request-id="${demoEscape(request.id)}">Accept request</button><button type="button" class="ghost" data-request-action="decline" data-request-id="${demoEscape(request.id)}">Decline</button></div>` : `<small>Accepted in demo · no live order created</small>`}</div></article>`).join("")
    : '<div class="demo-empty-state"><b>No requests match this filter</b><p>Try another filter to see sample delivery requests.</p></div>';
  el("demo-requests-list").querySelectorAll("[data-request-action]").forEach((button) => {
    button.addEventListener("click", () => respondDemoRequest(button.dataset.requestId, button.dataset.requestAction));
  });
  el("demo-requests-panel").querySelectorAll("[data-request-filter]").forEach((button) =>
    button.classList.toggle("active", button.dataset.requestFilter === filter)
  );
}

function respondDemoRequest(requestId, action) {
  const demo = readDemoState();
  const request = demo.requests.find((item) => item.id === requestId);
  if (!request || request.status !== "open") return;
  request.status = action === "accept" ? "accepted" : "declined";
  request.response = action === "accept" ? "Accepted in demo only." : "Declined in demo only.";
  if (!saveDemoState(demo)) return;
  renderDemoRequests(demo);
}

function addDemoDriver() {
  const demo = readDemoState();
  const count = (demo.drivers || []).length + 1;
  demo.drivers = demo.drivers || [];
  demo.drivers.push({
    id: `demo-driver-${Date.now()}`,
    name: `Sample driver ${count}`,
    phone: `+234 800 000 0${String(900 + count).slice(-3)}`,
    status: "available",
    completed: 0,
    rating: "New",
  });
  if (saveDemoState(demo)) renderDemoDrivers(demo);
}

function setDemoPartnerView(view) {
  state.demoPartnerView = view;
  state.demoOrderId = null;
  el("demo-order-detail").classList.add("hidden");
  renderDemoOrders();
  const panel = el(`demo-${view}-panel`);
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDemoOrderDetail(order) {
  const detail = el("demo-order-detail");
  detail.classList.remove("hidden");
  const nextStatus = { requested: "accepted", accepted: "assigned", assigned: "picked_up", picked_up: "in_transit", in_transit: "delivered" }[order.status];
  const actionLabel = { requested: "Accept sample order", accepted: "Assign sample driver", assigned: "Confirm sample pickup", picked_up: "Advance sample to in transit", in_transit: "Mark sample delivered" }[order.status];
  detail.innerHTML = `<div class="demo-detail-heading"><div><p class="eyebrow">SAMPLE ORDER ${demoEscape(order.reference)}</p><h2>${demoEscape(order.customer)}</h2><p>${demoEscape(order.route)} · ${demoEscape(order.detail)}</p></div><button class="ghost" type="button" id="demo-detail-close">Close</button></div><span class="demo-order-status ${demoEscape(order.status)}">${demoEscape(order.status.replaceAll("_", " "))}</span><ol class="demo-event-timeline">${order.events.map((event) => `<li>${demoEscape(event)}</li>`).join("")}</ol><div class="demo-order-actions"><button id="demo-advance-order" type="button" ${!nextStatus ? "disabled" : ""}>${actionLabel || "Order complete"}</button><label class="demo-upload-zone" for="demo-proof-file"><span class="upload-icon">↑</span><b>Add proof of delivery</b><small>Choose a sample image or PDF · up to 10 MB</small><input id="demo-proof-file" type="file" accept="image/*,.pdf,application/pdf" /></label></div><div id="demo-upload-progress" class="demo-upload-progress hidden" role="status" aria-live="polite"><span class="upload-spinner"></span><span><b>Preparing local preview…</b><small>File stays on this device. Nothing is sent.</small><i><em></em></i></span></div><p id="demo-upload-note" class="demo-inline-note">Sample controls only. Updates and attachments are not sent to a live partner, customer or carrier.</p>`;
  el("demo-detail-close").addEventListener("click", () => detail.classList.add("hidden"));
  el("demo-advance-order").addEventListener("click", () => advanceDemoOrder(order.id));
  el("demo-proof-file").addEventListener("change", (event) => simulateDemoProofUpload(event.target.files[0]));
}

function simulateDemoProofUpload(file) {
  if (!file) return;
  const progress = el("demo-upload-progress");
  if (file.size > 10 * 1024 * 1024) {
    el("demo-upload-note").textContent = "That sample file is over the 10 MB preview limit. Choose a smaller file.";
    return;
  }
  progress.classList.remove("hidden");
  progress.querySelector("b").textContent = `Preparing ${file.name}`;
  const bar = progress.querySelector("em");
  bar.style.width = "0%";
  let value = 0;
  const timer = window.setInterval(() => {
    value = Math.min(100, value + 14 + Math.floor(Math.random() * 17));
    bar.style.width = `${value}%`;
    if (value === 100) {
      window.clearInterval(timer);
      progress.classList.add("hidden");
      el("demo-upload-note").textContent = `${file.name} preview complete. The file was not uploaded or stored; no bytes left this browser.`;
      el("demo-upload-note").classList.add("upload-complete");
    }
  }, 110);
}

function saveDemoPartnerProfile() {
  const demo = readDemoState();
  const application = demo.application;
  const company = el("demo-profile-name").value.trim();
  const email = el("demo-profile-email").value.trim();
  const phone = el("demo-profile-phone").value.trim();
  const city = el("demo-profile-city").value.trim();
  if (!company || !email || !el("demo-profile-email").checkValidity() || !phone || !city) {
    el("demo-profile-note").textContent = "Enter a business name, valid email, phone and city.";
    return;
  }
  application.company = company;
  application.email = email;
  application.phone = phone;
  application.city = city;
  const areas = el("demo-profile-areas").value.trim();
  demo.profile = { email, phone, areas };
  demo.serviceAreas = areas;
  if (!saveDemoState(demo)) return;
  el("demo-profile-note").textContent = "Demo profile saved in this browser only.";
  renderDemoOrders();
}

function addDemoTeamMember(event) {
  event.preventDefault();
  const input = el("demo-invite-email");
  if (!input.checkValidity()) return;
  const demo = readDemoState();
  const email = input.value.trim();
  demo.teamMembers = demo.teamMembers || [];
  if (demo.teamMembers.some((member) => member.email.toLowerCase() === email.toLowerCase())) {
    el("demo-invite-note").textContent = "That sample teammate is already in the workspace.";
    return;
  }
  demo.teamMembers.push({ name: email.split("@")[0], email, role: "Dispatcher · demo" });
  if (!saveDemoState(demo)) return;
  input.value = "";
  el("demo-invite-note").textContent = "Demo teammate added locally. No invitation was sent.";
  renderDemoTeam(demo, demo.application);
}

function advanceDemoOrder(orderId) {
  const demo = readDemoState();
  const order = (demo.orders || []).find((item) => item.id === orderId);
  const nextStatus = { requested: "accepted", accepted: "assigned", assigned: "picked_up", picked_up: "in_transit", in_transit: "delivered" };
  const nextEvent = { requested: "Order accepted · sample", accepted: "Driver assigned · sample", assigned: "Pickup confirmed · sample", picked_up: "In transit · sample", in_transit: "Delivered · sample" };
  if (!order || !nextStatus[order.status]) return;
  const event = nextEvent[order.status];
  order.status = nextStatus[order.status];
  order.events.push(event);
  if (!saveDemoState(demo)) return;
  renderDemoOrders();
  const updated = demo.orders.find((item) => item.id === orderId);
  renderDemoOrderDetail(updated);
}

function toggleDemoOrderForm() {
  const form = el("demo-new-order-form");
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) el("demo-new-customer").focus();
}

function submitDemoOrder(event) {
  event.preventDefault();
  const demo = readDemoState();
  const sequence = (demo.orders || []).length + 26001;
  const customer = el("demo-new-customer").value.trim();
  const phone = el("demo-new-phone").value.trim();
  const pickup = el("demo-new-pickup").value.trim();
  const destination = el("demo-new-destination").value.trim();
  const description = el("demo-new-description").value.trim();
  if (!customer || !pickup || !destination || !description) return;
  const order = {
    id: `demo-order-${Date.now()}`,
    reference: `DEMO-${sequence}`,
    customer: `${customer}${phone ? ` · ${phone}` : ""} (sample)`,
    customerPhone: phone,
    route: `${pickup} → ${destination}`,
    status: "requested",
    detail: `${description} · Sample record only`,
    events: ["Order created · sample"],
  };
  demo.orders = [order, ...(demo.orders || [])];
  if (!saveDemoState(demo)) return;
  el("demo-new-order-form").reset();
  el("demo-new-order-form").classList.add("hidden");
  state.demoOrderFilter = "all";
  document.querySelectorAll("[data-order-filter]").forEach((button) =>
    button.classList.toggle("active", button.dataset.orderFilter === "all")
  );
  renderDemoOrders();
}

/* ---------- boot and the configuration panel ---------- */

async function boot() {
  await loadStatus();
  const oauthSession = consumeOAuthCallback();
  const stored = readSession();
  if (oauthSession) {
    if (oauthSession === "session") await continueAfterAuthentication();
    return;
  }
  if (stored && stored.access_token) {
    state.token = stored.access_token;
    state.session = stored;
  }
  if (state.token) {
    try {
      await continueAfterAuthentication();
      return;
    } catch (error) {
      banner("warn", `Stored sign-in no longer works: ${describe(error)} — sign in again.`);
      remember(null);
    }
  }
  show(el("landing"), true);
  show(el("auth"), false);
  show(el("partner-onboarding"), false);
  show(el("workspace"), false);
  show(el("mainnav"), false);
  show(el("signout"), false);
}

function consumeOAuthCallback() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  const accessToken = params.get("access_token");
  const error =
    params.get("error_description") ||
    params.get("error") ||
    queryParams.get("error_description") ||
    queryParams.get("error");
  if (error) {
    history.replaceState(null, "", location.pathname);
    showAuth("signin");
    el("auth-note").textContent = `Social sign-in was not completed: ${error}`;
    return "error";
  }
  if (!accessToken) return false;
  const claims = decodeJwtClaims(accessToken);
  remember({
    access_token: accessToken,
    refresh_token: params.get("refresh_token"),
    expires_in: Number(params.get("expires_in")) || null,
    user_id: claims.sub || null,
    email: claims.email || null,
  });
  history.replaceState(null, "", location.pathname);
  return "session";
}

function decodeJwtClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
  } catch (_) {
    return {};
  }
}

function showAuth(mode = "signin") {
  state.authMode = mode;
  show(el("landing"), false);
  show(el("auth"), true);
  show(el("partner-onboarding"), false);
  show(el("workspace"), false);
  show(el("mainnav"), false);
  show(el("signout"), false);
  const signingUp = mode === "signup";
  show(el("signin"), !signingUp);
  show(el("signup"), signingUp);
  el("password").autocomplete = signingUp ? "new-password" : "current-password";
  el("password").value = "";
  show(el("auth-switch"), !signingUp);
  show(el("auth-switch-signup"), signingUp);
  el("auth-title").textContent = signingUp ? "Create your partner account" : "Sign in to Pulse";
  el("auth-description").textContent = signingUp
    ? "Start with your work, company or business email. We’ll collect your organisation details next."
    : "Use your work, company or business email address.";
  el("auth-story-title").textContent = signingUp
    ? "Your next delivery starts here."
    : "Good to have you back.";
  el("auth-story-copy").textContent = signingUp
    ? "Create an account for your logistics business, then set up a carrier or vendor workspace."
    : "Sign in to coordinate your workspace, follow shipments and keep your team moving.";
  el("auth-note").textContent = "";
}

async function continueAfterAuthentication() {
  await loadBusinesses();
  if (!state.businesses.length) {
    show(el("landing"), false);
    show(el("auth"), false);
    show(el("workspace"), false);
    show(el("mainnav"), false);
    show(el("signout"), true);
    show(el("partner-onboarding"), true);
    if (state.session && state.session.email && !el("partner-email").value) {
      el("partner-email").value = state.session.email;
    }
    return;
  }
  show(el("partner-onboarding"), false);
  enterWorkspace();
}

async function createPartnerWorkspace(event) {
  event.preventDefault();
  const name = el("partner-name").value.trim();
  const kind = el("partner-kind").value;
  const phone = el("partner-phone").value.trim();
  const country = el("partner-country").value.trim().toUpperCase();
  const currency = el("partner-currency").value.trim().toUpperCase();
  if (kind === "vendor" && !phone) {
    el("onboarding-note").textContent = "A vendor workspace needs a contact phone number.";
    el("partner-phone").focus();
    return;
  }
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z]{3}$/.test(currency)) {
    el("onboarding-note").textContent = "Enter a two-letter country code and a three-letter currency code.";
    return;
  }
  const submit = el("onboarding-submit");
  submit.disabled = true;
  el("onboarding-note").textContent = "";
  try {
    const created = await api("POST", "/api/rpc/create_business", {
      p_name: name,
      p_city: el("partner-city").value.trim() || null,
      p_country_code: country,
      p_timezone: country === "NG" ? "Africa/Lagos" : "UTC",
      p_currency: currency,
      p_kind: kind,
      p_phone_e164: phone || null,
    });
    const businessId = created && created.id;
    const contactEmail = el("partner-email").value.trim();
    if (businessId && contactEmail) {
      try {
        await api("PATCH", `/api/businesses/${encodeURIComponent(businessId)}`, {
          email: contactEmail,
        });
      } catch (error) {
        banner("warn", `Workspace created, but the business contact email was not saved: ${describe(error)}`);
      }
    }
    await loadBusinesses();
    enterWorkspace();
  } catch (error) {
    el("onboarding-note").textContent = describe(error);
  } finally {
    submit.disabled = false;
  }
}

async function startOAuth(provider) {
  const button = provider === "google" ? el("oauth-google") : el("oauth-microsoft");
  button.disabled = true;
  el("auth-note").textContent = "";
  try {
    const result = await api("POST", `/api/auth/oauth/${provider}`, {});
    if (!result.authorization_url) throw new Error("The identity provider returned no sign-in URL.");
    window.location.assign(result.authorization_url);
  } catch (error) {
    el("auth-note").textContent = describe(error);
    button.disabled = false;
  }
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
    await continueAfterAuthentication();
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
    await continueAfterAuthentication();
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
  state.businessId = null;
  state.business = null;
  state.board = null;
  state.view = "dispatch";
  show(el("workspace"), false);
  show(el("partner-onboarding"), false);
  show(el("mainnav"), false);
  show(el("signout"), false);
  show(el("business"), false);
  show(el("whoami"), false);
  show(el("landing"), true);
  show(el("auth"), false);
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
  show(el("landing"), false);
  show(el("auth"), false);
  show(el("partner-onboarding"), false);
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
  applyNavPermissions();
  showView(state.view || "dispatch");
  moveNavIndicator(el("mainnav").querySelector(".active:not(.hidden)"));
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

async function loadCustomers(append = false) {
  const box = el("customers-list");
  const note = el("customers-note");
  const more = el("customers-more");
  if (!append) {
    state.customers = [];
    box.innerHTML = '<p class="muted">Loading…</p>';
    note.textContent = "";
  }
  more.disabled = true;
  const params = new URLSearchParams({
    business_id: state.businessId || "",
    limit: "100",
    offset: String(append ? state.customers.length : 0),
  });
  const search = el("customer-search").value.trim();
  if (search) params.set("q", search);
  try {
    const result = await api("GET", `/api/customers?${params.toString()}`);
    state.customers = append
      ? state.customers.concat(result.customers || [])
      : result.customers || [];
    state.customersHasMore = Boolean(result.has_more);
    more.classList.toggle("hidden", !state.customersHasMore);
    note.textContent = result.note || "";
    renderCustomers();
  } catch (error) {
    box.innerHTML = `<p class="muted">${demoEscape(describe(error))}</p>`;
  } finally {
    more.disabled = false;
  }
}

function renderCustomers() {
  const box = el("customers-list");
  if (!state.customers.length) {
    box.innerHTML = '<div class="empty">No customer records match. Customer records appear through real workspace activity.</div>';
    return;
  }
  const rows = state.customers.map((customer) => `<tr>
    <td>${demoEscape(customer.display_name || "Name not recorded")}</td>
    <td>${demoEscape(customer.phone_e164 || "—")}</td>
    <td>${demoEscape(customer.email || "—")}</td>
    <td>${demoEscape(customer.city || "—")}</td>
    <td>${demoEscape(customer.source || "—")}</td>
  </tr>`).join("");
  box.innerHTML = `<div class="table-scroll"><table><thead><tr>
    <th>Customer</th><th>Phone</th><th>Email</th><th>City</th><th>Record source</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function loadFleet() {
  const box = el("vehicles-list");
  const form = el("vehicle-form");
  const note = el("vehicle-note");
  const canOperate = ["owner", "admin", "dispatcher", "ops"].includes(state.business?.my_role);
  form.classList.toggle("hidden", !canOperate);
  if (!canOperate) note.textContent = "Your workspace role can view fleet records but cannot register vehicles.";
  else note.textContent = "Vehicle writes are checked by the database using your signed-in role.";
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const result = await api(
      "GET",
      `/api/vehicles?business_id=${encodeURIComponent(state.businessId || "")}`
    );
    state.vehicles = result.vehicles || [];
    renderFleet(result.note);
  } catch (error) {
    box.innerHTML = `<p class="muted">${demoEscape(describe(error))}</p>`;
  }
}

function renderFleet(note) {
  const box = el("vehicles-list");
  if (!state.vehicles.length) {
    box.innerHTML = '<div class="empty">No vehicles are registered to this workspace.</div>';
    return;
  }
  const rows = state.vehicles.map((vehicle) => `<tr>
    <td>${demoEscape(vehicle.label)}</td>
    <td>${demoEscape(vehicle.registration || "—")}</td>
    <td>${demoEscape(vehicle.type || "other")}</td>
    <td>${demoEscape(vehicle.capacity_note || "—")}</td>
    <td>${vehicle.is_active ? "active" : "inactive"}</td>
  </tr>`).join("");
  box.innerHTML = `<div class="table-scroll"><table><thead><tr>
    <th>Vehicle</th><th>Registration</th><th>Type</th><th>Capacity / handling</th><th>State</th>
  </tr></thead><tbody>${rows}</tbody></table></div><p class="note">${demoEscape(note || "")}</p>`;
}

async function createVehicle(event) {
  event.preventDefault();
  const form = el("vehicle-form");
  const values = new FormData(form);
  const note = el("vehicle-note");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  note.textContent = "Saving vehicle…";
  try {
    const result = await api("POST", "/api/vehicles", {
      business_id: state.businessId,
      label: String(values.get("label") || "").trim(),
      registration: String(values.get("registration") || "").trim(),
      type: String(values.get("type") || "other"),
      capacity_note: String(values.get("capacity_note") || "").trim(),
    });
    form.reset();
    await loadFleet();
    note.textContent = `Saved ${demoEscape(result.vehicle.label)}. ${result.note || ""}`.trim();
  } catch (error) {
    note.textContent = describe(error);
  } finally {
    submit.disabled = false;
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

const SHIPMENT_EVENT_TYPES = [
  "BOOKED", "PICKED_UP", "RECEIVED_AT_FACILITY", "INSPECTED", "DEPARTED_ORIGIN",
  "IN_TRANSIT", "ARRIVED_DESTINATION_COUNTRY", "CUSTOMS_PROCESSING",
  "CUSTOMS_DOCUMENT_REQUIRED", "CUSTOMS_CLEARED", "RECEIVED_AT_DESTINATION_FACILITY",
  "OUT_FOR_DELIVERY", "DELIVERY_ATTEMPTED", "DELIVERED", "EXCEPTION", "CANCELLED", "RETURNED",
];

function shipmentText(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text || "";
  return node;
}

async function loadShipments(append) {
  const box = el("shipments-list");
  const more = el("shipments-more");
  const note = el("shipments-note");
  if (!append) {
    state.shipments = [];
    box.replaceChildren(shipmentText("p", "muted", "Loading shipments…"));
  }
  const params = new URLSearchParams({
    business_id: state.businessId || "",
    limit: "25",
    offset: String(state.shipments.length),
  });
  const query = el("shipment-search").value.trim();
  const status = el("shipment-status").value;
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  try {
    const result = await api("GET", `/api/shipments?${params.toString()}`);
    state.shipments = append
      ? state.shipments.concat(result.shipments || [])
      : result.shipments || [];
    renderShipments();
    note.textContent = result.note || "";
    show(more, Boolean(result.has_more));
  } catch (error) {
    if (!append) box.replaceChildren(shipmentText("p", "muted", describe(error)));
    note.textContent = "Shipment data could not be loaded.";
    show(more, false);
  }
}

function renderShipments() {
  const box = el("shipments-list");
  box.replaceChildren();
  if (!state.shipments.length) {
    box.append(shipmentText(
      "div",
      "empty",
      "No shipments are visible for this workspace yet. Visibility follows database participant policies."
    ));
    return;
  }
  for (const shipment of state.shipments) {
    const card = document.createElement("article");
    card.className = "shipment-card";
    const order = shipment.order || {};
    card.append(
      shipmentText("h3", "", shipment.pulse_shipment_id),
      shipmentText("span", "chip", shipment.current_status || "status unavailable"),
      shipmentText(
        "p",
        "muted small",
        [order.reference, order.pickup_text, order.destination_text].filter(Boolean).join(" · ") ||
          "Order details are not visible to this account."
      ),
      shipmentText(
        "p",
        "small",
        shipment.last_verified_event_at
          ? `Last verified update · ${new Date(shipment.last_verified_event_at).toLocaleString()}`
          : "No verified update recorded"
      )
    );
    const open = document.createElement("button");
    open.type = "button";
    open.className = "ghost";
    open.textContent = "Open passport";
    open.addEventListener("click", () => openShipment(shipment.id));
    card.append(open);
    box.append(card);
  }
}

async function openShipment(shipmentId) {
  try {
    const detail = await api("GET", `/api/shipments/${encodeURIComponent(shipmentId)}`);
    state.openShipmentId = shipmentId;
    state.openOrderId = null;
    openDrawer();
    el("drawer-title").textContent = detail.shipment.pulse_shipment_id || "Shipment passport";
    renderShipmentDetail(detail);
  } catch (error) {
    banner("bad", `Could not open shipment passport: ${describe(error)}`);
    closeDrawer();
  }
}

function renderShipmentDetail(detail) {
  const body = el("drawer-body");
  body.replaceChildren();
  const { shipment, order, events } = detail;
  const summary = document.createElement("section");
  summary.className = "passport-summary";
  summary.append(
    shipmentText("h3", "", shipment.current_status || "Status unavailable"),
    shipmentText(
      "p",
      "muted small",
      order
        ? `${order.reference} · ${order.pickup_text || "Pickup not recorded"} → ${
            order.destination_text || "Destination not recorded"
          }`
        : "Order details are unavailable to this account."
    ),
    shipmentText(
      "p",
      "small",
      shipment.last_verified_event_at
        ? `Last verified · ${new Date(shipment.last_verified_event_at).toLocaleString()}${
            shipment.last_verified_location ? ` · ${shipment.last_verified_location}` : ""
          }`
        : "Location and verified status have not been recorded."
    )
  );
  body.append(summary);

  const timeline = document.createElement("section");
  timeline.className = "passport-timeline";
  timeline.append(shipmentText("h3", "", `Event timeline (${(events || []).length})`));
  if (!events || !events.length) {
    timeline.append(shipmentText("p", "empty", "No shipment events have been recorded."));
  } else {
    const list = document.createElement("ol");
    list.className = "event-list";
    for (const event of events) {
      const item = document.createElement("li");
      item.className = "event-item";
      const eventTime = event.occurred_at
        ? new Date(event.occurred_at).toLocaleString()
        : "Time not supplied";
      item.append(
        shipmentText("strong", "", String(event.event_type || "Event").replaceAll("_", " ")),
        shipmentText("span", "event-verification", event.verification_status || "verification unavailable"),
        shipmentText(
          "p",
          "muted small",
          `${eventTime} · ${event.source_type || "source unavailable"}${
            event.location ? ` · ${event.location}` : ""
          }`
        )
      );
      if (event.metadata && event.metadata.note) {
        item.append(shipmentText("p", "small", String(event.metadata.note)));
      }
      list.append(item);
    }
    timeline.append(list);
    if (detail.events_truncated) {
      timeline.append(shipmentText(
        "p",
        "muted small",
        "Showing the latest 500 events. Contact an administrator for older history."
      ));
    }
  }
  body.append(timeline);

  const form = document.createElement("form");
  form.className = "event-form";
  form.append(
    shipmentText("h3", "", "Record an operational update"),
    shipmentText(
      "p",
      "muted small",
      "Manual entries are pending review. Trusted provider or facility integrations are not enabled here."
    )
  );
  const eventSelect = document.createElement("select");
  eventSelect.setAttribute("aria-label", "Event type");
  for (const value of SHIPMENT_EVENT_TYPES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.replaceAll("_", " ");
    eventSelect.append(option);
  }
  const sourceSelect = document.createElement("select");
  sourceSelect.setAttribute("aria-label", "Event source");
  const manual = document.createElement("option");
  manual.value = "manual";
  manual.textContent = "manual";
  sourceSelect.append(manual);
  const occurred = document.createElement("input");
  occurred.type = "datetime-local";
  occurred.setAttribute("aria-label", "Event time");
  occurred.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const location = document.createElement("input");
  location.maxLength = 240;
  location.placeholder = "Location (optional)";
  location.setAttribute("aria-label", "Event location");
  const note = document.createElement("textarea");
  note.rows = 2;
  note.maxLength = 1000;
  note.placeholder = "Note (optional)";
  note.setAttribute("aria-label", "Event note");
  const feedback = shipmentText("p", "note", "");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Record event";
  let idempotencyKey = null;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!idempotencyKey) {
      idempotencyKey = globalThis.crypto && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    submit.disabled = true;
    feedback.textContent = "";
    try {
      await api("POST", "/api/rpc/record_shipment_event", {
        p_pulse_shipment_id: shipment.pulse_shipment_id,
        p_event_type: eventSelect.value,
        p_source_type: sourceSelect.value,
        p_idempotency_key: idempotencyKey,
        p_occurred_at: new Date(occurred.value).toISOString(),
        p_location: location.value.trim() || null,
        p_metadata: note.value.trim() ? { note: note.value.trim() } : {},
      });
      idempotencyKey = null;
      banner("good", "Shipment event recorded.", 4000);
      if (state.view === "shipments" && state.openShipmentId === shipment.id) {
        await openShipment(shipment.id);
      }
      if (state.view === "shipments") await loadShipments(false);
    } catch (error) {
      feedback.textContent = describe(error);
    } finally {
      submit.disabled = false;
    }
  });
  form.append(eventSelect, sourceSelect, occurred, location, note, submit, feedback);
  body.append(form);
}

async function loadCarrierDirectory() {
  const panel = el("carrier-marketplace");
  const box = el("carriers-list");
  const isVendor = state.business && state.business.kind === "vendor";
  show(panel, Boolean(isVendor));
  if (!isVendor) return;
  box.replaceChildren(shipmentText("p", "muted", "Loading carrier directory…"));
  const params = new URLSearchParams();
  const search = el("carrier-search").value.trim();
  const city = el("carrier-city").value.trim();
  if (search) params.set("p_search", search);
  if (city) params.set("p_city", city);
  try {
    const result = await api("GET", `/api/carriers?${params.toString()}`);
    renderCarrierDirectory(result.carriers || []);
  } catch (error) {
    box.replaceChildren(shipmentText("p", "muted", `Carrier directory unavailable: ${describe(error)}`));
  }
}

function renderCarrierDirectory(carriers) {
  const box = el("carriers-list");
  box.replaceChildren();
  if (!carriers.length) {
    box.append(shipmentText("div", "empty", "No carriers match. Try a different name or city."));
    return;
  }
  for (const carrier of carriers) {
    const card = document.createElement("article");
    card.className = "carrier-card";
    card.append(
      shipmentText("h3", "", carrier.name || "Carrier"),
      shipmentText(
        "p",
        "muted small",
        [carrier.city, carrier.country_code].filter(Boolean).join(", ") || "Location not listed"
      ),
      shipmentText(
        "p",
        "small",
        `${carrier.service_areas && carrier.service_areas.length
          ? carrier.service_areas.join(", ")
          : "Service area not listed"} · ${
          carrier.avg_rating === null || carrier.avg_rating === undefined
            ? "No rating history"
            : `${carrier.avg_rating} average rating`
        } · ${carrier.completed_orders || 0} completed orders`
      )
    );
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Send delivery request";
    button.addEventListener("click", () => showOfferForm(card, carrier));
    card.append(button);
    box.append(card);
  }
}

function showOfferForm(card, carrier) {
  const existing = card.querySelector(".carrier-offer-form");
  if (existing) {
    existing.remove();
    return;
  }
  const form = document.createElement("form");
  form.className = "carrier-offer-form";
  const pickup = document.createElement("input");
  pickup.required = true;
  pickup.minLength = 3;
  pickup.maxLength = 500;
  pickup.placeholder = "Pickup address";
  const destination = document.createElement("input");
  destination.required = true;
  destination.minLength = 3;
  destination.maxLength = 500;
  destination.placeholder = "Destination address";
  const description = document.createElement("textarea");
  description.maxLength = 2000;
  description.placeholder = "Parcel or delivery details (optional)";
  const price = document.createElement("input");
  price.type = "number";
  price.min = "0";
  price.step = "0.01";
  price.placeholder = "Proposed price (optional)";
  const feedback = shipmentText("p", "note", "");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Send request";
  form.append(
    shipmentText("h4", "", `Request a quote from ${carrier.name || "this carrier"}`),
    pickup,
    destination,
    description,
    price,
    submit,
    feedback
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const payload = {
      p_carrier_business_id: carrier.id,
      p_pickup_text: pickup.value.trim(),
      p_destination_text: destination.value.trim(),
      p_service_type: "delivery",
    };
    if (description.value.trim()) payload.p_description = description.value.trim();
    if (price.value) payload.p_proposed_price = price.value;
    try {
      await api("POST", "/api/rpc/create_delivery_offer", payload);
      banner("good", `Delivery request sent to ${carrier.name || "the carrier"}.`, 5000);
      form.remove();
      await loadRequests();
    } catch (error) {
      feedback.textContent = describe(error);
    } finally {
      submit.disabled = false;
    }
  });
  card.append(form);
  pickup.focus();
}

async function loadRequests() {
  const box = el("requests-list");
  const note = el("requests-note");
  const vendor = state.business && state.business.kind === "vendor";
  await loadCarrierDirectory();
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

/* Sections the caller's role or workspace kind cannot use are removed from the bar
 * rather than left to fail on click. The server refuses them either way -- this is
 * about not offering an action that cannot work.
 *
 * A driver acts through assignments and never on the workspace, so a driver gets
 * only Dispatch. A vendor originates jobs, so it has no drivers of its own and no
 * dispatch board; its board is Requests plus the orders it forwarded. */
function applyNavPermissions() {
  const role = (state.business && state.business.my_role) || "";
  const kind = (state.business && state.business.kind) || "carrier";
  const nav = el("mainnav");
  const hidden = new Set();
  if (role === "driver") {
    for (const view of ["orders", "shipments", "drivers", "customers", "fleet", "requests", "team", "settings"]) {
      hidden.add(view);
    }
  }
  if (kind === "vendor") {
    hidden.add("drivers");
    hidden.add("customers");
    hidden.add("fleet");
    hidden.add("dispatch");
  }
  for (const button of nav.querySelectorAll("button")) {
    const hide = hidden.has(button.dataset.view);
    button.classList.toggle("hidden", hide);
    if (hide && button.classList.contains("active")) {
      button.classList.remove("active");
    }
  }
  // Never leave the user on a section that is no longer offered.
  const active = nav.querySelector(".active:not(.hidden)");
  if (state.view && hidden.has(state.view)) {
    const first = nav.querySelector("button:not(.hidden)");
    if (first) showView(first.dataset.view);
  } else if (active) {
    moveNavIndicator(active);
  } else {
    const first = nav.querySelector("button:not(.hidden)");
    if (first) showView(first.dataset.view);
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
  state.openShipmentId = null;
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
  for (const view of ["dispatch", "orders", "shipments", "drivers", "customers", "fleet", "requests", "team", "settings"]) {
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
  if (name === "shipments") loadShipments(false);
  if (name === "drivers") loadDrivers();
  if (name === "customers") loadCustomers();
  if (name === "fleet") loadFleet();
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
document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.demo;
    if (destination === "application") startDemoApplication();
    else if (destination === "approved-account") openApprovedDemoAccount();
    else if (destination === "landing") showDemoScreen(null);
    else if (["pending", "onboarding", "orders"].includes(destination)) showDemoScreen(`demo-${destination}`);
  });
});
el("demo-application-form").addEventListener("submit", submitDemoApplication);
el("setup-back").addEventListener("click", () => advanceDemoOnboarding(-1));
el("setup-next").addEventListener("click", () => advanceDemoOnboarding(1));
el("demo-new-order").addEventListener("click", toggleDemoOrderForm);
el("demo-new-order-form").addEventListener("submit", submitDemoOrder);
el("demo-cancel-new-order").addEventListener("click", () => el("demo-new-order-form").classList.add("hidden"));
document.querySelectorAll("[data-partner-view]").forEach((button) => {
  button.addEventListener("click", () => setDemoPartnerView(button.dataset.partnerView));
});
el("demo-add-driver").addEventListener("click", addDemoDriver);
el("demo-vehicle-form").addEventListener("submit", addDemoVehicle);
el("demo-team-invite").addEventListener("submit", addDemoTeamMember);
el("demo-profile-save").addEventListener("click", saveDemoPartnerProfile);
document.querySelectorAll("#demo-settings-panel input[type=checkbox]").forEach((input) => {
  input.addEventListener("change", () => {
    const demo = readDemoState();
    demo.settings = {
      orderNotifications: el("demo-setting-order-notifications").checked,
      teamNotifications: el("demo-setting-team-notifications").checked,
    };
    saveDemoState(demo);
  });
});
document.querySelectorAll("[data-request-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.demoRequestFilter = button.dataset.requestFilter;
    const demo = readDemoState();
    renderDemoRequests(demo);
  });
});
document.querySelectorAll("[data-order-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.demoOrderFilter = button.dataset.orderFilter;
    document.querySelectorAll("[data-order-filter]").forEach((filterButton) =>
      filterButton.classList.toggle("active", filterButton === button)
    );
    renderDemoOrders();
  });
});
document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => showAuth(button.dataset.openAuth));
});
el("auth-back").addEventListener("click", () => {
  show(el("auth"), false);
  show(el("landing"), true);
});
el("oauth-google").addEventListener("click", () => startOAuth("google"));
el("oauth-microsoft").addEventListener("click", () => startOAuth("microsoft"));
el("onboarding-form").addEventListener("submit", createPartnerWorkspace);
el("partner-kind").addEventListener("change", (event) => {
  el("partner-phone").required = event.target.value === "vendor";
});
el("password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") state.authMode === "signup" ? signUp() : signIn();
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
el("shipment-search-button").addEventListener("click", () => loadShipments(false));
el("shipment-refresh").addEventListener("click", () => loadShipments(false));
el("shipments-more").addEventListener("click", () => loadShipments(true));
el("shipment-status").addEventListener("change", () => loadShipments(false));
el("shipment-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadShipments(false);
});
el("carrier-search-button").addEventListener("click", loadCarrierDirectory);
el("carrier-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCarrierDirectory();
});
el("carrier-city").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCarrierDirectory();
});
el("customer-search-button").addEventListener("click", loadCustomers);
el("customer-refresh").addEventListener("click", loadCustomers);
el("customers-more").addEventListener("click", () => loadCustomers(true));
el("customer-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCustomers();
});
el("fleet-refresh").addEventListener("click", loadFleet);
el("vehicle-form").addEventListener("submit", createVehicle);
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
  state.business = currentBusiness();
  const previousView = state.view;
  applyNavPermissions();
  loadBoard();
  if (state.view === previousView && state.view === "shipments") loadShipments(false);
  if (state.view === previousView && state.view === "requests") loadRequests();
});

el("filter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderBoard();
});

boot();
