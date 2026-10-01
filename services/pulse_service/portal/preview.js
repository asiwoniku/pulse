/* Pulse design preview — synthetic fixtures for looking at the interface.
 *
 * WHY THIS EXISTS AND WHY IT IS OPT-IN
 * The product rule is that Pulse never shows work that is not real: an empty board
 * is an honest answer, and a filled-in demo would hide a broken RLS policy or an
 * unconfigured Supabase project. That rule is load-bearing, so preview data is not
 * the default and never replaces the real path.
 *
 * It is reached only with ?preview=1 in the URL. Without that, this module does
 * nothing at all and every request goes to the service exactly as before.
 *
 * WHAT IT IS FOR
 * Reviewing and editing the interface when there is no data to look at: how the
 * board reads at a glance, whether long addresses and names break a card, how the
 * terminal and driver-stage states read, how the empty states look. Every shape
 * below is copied from the real handlers in pulse_service/api.py, so a layout that
 * looks right here looks right against real rows too.
 *
 * NOTHING HERE IS WRITTEN. Any POST/PATCH/RPC is refused with an explanation, so
 * preview can never create an order, send a message, or invite anybody.
 */
(function () {
  "use strict";

  /* Mirrors public.order_status (migration 0001) and the legal-edge mirror that
   * api.py ships, so the buttons a designer sees are the buttons a user sees. */
  const EDGES = {
    draft: ["requested", "cancelled"],
    requested: ["under_review", "quoted", "accepted", "assigned", "cancelled", "failed"],
    under_review: ["quoted", "cancelled", "failed"],
    quoted: ["awaiting_customer_approval", "accepted", "cancelled", "failed"],
    awaiting_customer_approval: ["accepted", "cancelled", "failed"],
    accepted: ["assigned", "cancelled", "failed"],
    assigned: ["driver_accepted", "cancelled", "failed"],
    driver_accepted: ["driver_arrived", "at_pickup", "cancelled", "failed"],
    driver_arrived: ["at_pickup", "pickup_attempt_failed", "cancelled", "failed"],
    at_pickup: ["picked_up", "pickup_attempt_failed", "cancelled", "failed"],
    picked_up: ["in_transit", "cancelled", "failed"],
    in_transit: ["arrival_attempted", "delivered", "cancelled", "failed"],
    arrival_attempted: ["in_transit", "delivered", "failed", "cancelled"],
    pickup_attempt_failed: ["requested", "assigned", "cancelled", "failed"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
    failed: [],
  };
  const DRIVER_STAGES = new Set([
    "assigned", "driver_accepted", "driver_arrived", "at_pickup", "picked_up",
    "in_transit", "arrival_attempted", "delivered",
  ]);

  /* Fixtures are obviously not real: the phone numbers are not dialable and every
   * workspace name is marked as a sample. If this ever reached a real screen it
   * would be obvious, which is the point. */
  const NOW = Date.now();
  const ago = (mins) => new Date(NOW - mins * 60000).toISOString();
  const ahead = (mins) => new Date(NOW + mins * 60000).toISOString();

  const BUSINESSES = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Preview Logistics (design sample)",
      phone_e164: "+2340000000000",
      city: "Lagos",
      country_code: "NG",
      timezone: "Africa/Lagos",
      currency: "NGN",
      is_active: true,
      my_role: "owner",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Second Preview Workspace",
      phone_e164: "+2340000000000",
      city: "Abuja",
      country_code: "NG",
      timezone: "Africa/Lagos",
      currency: "NGN",
      is_active: true,
      my_role: "dispatcher",
    },
  ];

  const DRIVERS = [
    { id: "d-1", full_name: "Preview Driver One", status: "available", phone_e164: "+2340000000001" },
    { id: "d-2", full_name: "Preview Driver Two", status: "busy", phone_e164: "+2340000000002" },
    { id: "d-3", full_name: "Chukwuemeka Okafor-Vanderburgh", status: "offline", phone_e164: "+2340000000003" },
    { id: "d-4", full_name: "Preview Driver Four", status: "available", phone_e164: "+2340000000004" },
  ];
/* Each row is a case a designer should be able to look at: a long name that must
   * wrap, a missing price, a missing customer, terminal states, a driver stage with
   * nobody assigned, and every payment state — including pending_confirmation and
   * partially_paid, which the detail dropdown used to get wrong. */
  const SEEDS = [
    {
      ref: "PLS-2026-0001", status: "in_transit", price: 45000, payment: "paid",
      pickup: "12 Adeola Odeku, Victoria Island, Lagos",
      dest: "Ikoyi Link Bridge, Lekki Phase 1, Lagos",
      desc: "Two cartons of machine parts and one sofa cushion set.",
      customer: { id: "c-1", display_name: "Preview Customer One", phone_e164: "+2340000000010", city: "Lagos" },
      driver: "d-1", age: 95, service: "moving",
    },
    {
      ref: "PLS-2026-0002", status: "awaiting_customer_approval", price: 18000, payment: "pending_confirmation",
      pickup: "Shop 14, Kaduna Market, Kaduna",
      dest: "Zone 3, Wuse, Abuja",
      desc: "One carton, fragile glassware.",
      customer: { id: "c-2", display_name: "Preview Customer Two", phone_e164: "+2340000000011", city: "Abuja" },
      driver: null, age: 240, service: "parcel",
    },
    {
      ref: "PLS-2026-0003", status: "requested", price: null, payment: "unpaid",
      pickup: "A very long pickup address pasted straight from a WhatsApp forward, running on considerably longer than any real single line in a board card should reasonably be expected to hold",
      dest: "Also a long destination: Block C, Second Floor, Rear Entrance, Old Lekki Road, Lagos",
      desc: "Customer gave no item list, so a dispatcher has to ask before quoting anything at all.",
      customer: { id: "c-3", display_name: "A Customer Name That Is Extremely Long And Should Wrap Rather Than Break The Layout", phone_e164: "+2340000000012", city: "Lagos" },
      driver: null, age: 12, service: "trip",
    },
    {
      ref: "PLS-2026-0004", status: "driver_arrived", price: 12500.5, payment: "partially_paid",
      pickup: "No 7, Awolowo Road, Ikoyi",
      dest: "Terminal 2, Murtala Muhammed Airport, Lagos",
      desc: "Passenger bag, collected early.",
      customer: { id: "c-4", display_name: "Preview Customer Four", phone_e164: "+2340000000013", city: "Lagos" },
      driver: "d-2", age: 45, service: "parcel",
    },
    {
      ref: "PLS-2026-0005", status: "assigned", price: 76000, payment: "unpaid",
      pickup: "Warehouse 3, Apapa Wharf Road, Lagos",
      dest: "Yaba, Lagos",
      desc: "Full household move: 3-door wardrobe, 2 mattresses, dining set.",
      customer: { id: "c-5", display_name: "Preview Customer Five", phone_e164: "+2340000000014", city: "Lagos" },
      driver: null, age: 20, service: "moving",
    },
    {
      ref: "PLS-2026-0006", status: "assigned", price: 9000, payment: "waived",
      pickup: "Apapa Wharf Road, Lagos",
      dest: "Yaba, Lagos",
      desc: "Charity shipment agreed free of charge.",
      customer: { id: "c-6", display_name: "Preview Customer Six", phone_e164: "+2340000000015", city: "Lagos" },
      driver: null, age: 30, service: "parcel",
    },
    {
      ref: "PLS-2026-0007", status: "pickup_attempt_failed", price: 22000, payment: "refunded",
      pickup: "Oshodi Market, Lagos",
      dest: "Surulere, Lagos",
      desc: "Nobody at the pickup address; customer not reachable on the number given.",
      customer: { id: "c-7", display_name: "Preview Customer Seven", phone_e164: "+2340000000016", city: "Lagos" },
      driver: "d-4", age: 320, service: "parcel",
    },
    {
      ref: "PLS-2026-0008", status: "delivered", price: 34000, payment: "paid",
      pickup: "Ikeja GRA, Lagos",
      dest: "Ikeja City Mall, Lagos",
      desc: "Delivered to the front desk, signed for by security.",
      customer: { id: "c-8", display_name: "Preview Customer Eight", phone_e164: "+2340000000017", city: "Lagos" },
      driver: "d-2", age: 500, service: "parcel",
    },
    {
      ref: "PLS-2026-0009", status: "completed", price: 54000, payment: "paid",
      pickup: "Lekki Phase 1, Lagos",
      dest: "Ikeja GRA, Lagos",
      desc: "Terminal state: no further action is possible from the board.",
      customer: { id: "c-9", display_name: "Preview Customer Nine", phone_e164: "+2340000000018", city: "Lagos" },
      driver: "d-1", age: 2000, service: "moving",
    },
    {
      ref: "PLS-2026-0010", status: "cancelled", price: null, payment: "failed",
      pickup: "Onitsha Main Market, Anambra",
      dest: "Lagos Island",
      desc: "Terminal state: customer cancelled before anyone was assigned.",
      customer: { id: "c-10", display_name: "Preview Customer Ten", phone_e164: "+2340000000019", city: "Onitsha" },
      driver: null, age: 1500, service: "trip",
    },
    {
      ref: "PLS-2026-0011", status: "quoted", price: 15000, payment: "pending_confirmation",
      pickup: "Festac Town, Lagos",
      dest: "Agege, Lagos",
      desc: "Waiting on the customer to approve the quote. No customer row linked yet.",
      customer: null, age: 75, service: "parcel",
    },
    {
      ref: "PLS-2026-0012", status: "under_review", price: null, payment: "unpaid",
      pickup: "Bodija, Ibadan",
      dest: "Ikeja, Lagos",
      desc: "Freshly requested, no price, no customer row.",
      customer: null, age: 8, service: "parcel",
    },
  ];
  function assignmentFor(seed) {
    if (!seed.driver) return [];
    return [
      {
        id: `a-${seed.ref}`,
        order_id: `o-${seed.ref}`,
        driver_id: seed.driver,
        status: seed.status === "assigned" ? "pending" : "accepted",
        assignment_type: "immediate",
        is_current: true,
        assigned_at: ago(seed.age - 5),
        accepted_at: seed.status === "assigned" ? null : ago(seed.age - 2),
        declined_at: null,
        notes: null,
      },
    ];
  }

  const ORDERS = SEEDS.map((seed, index) => {
    const driver = seed.driver ? DRIVERS.find((d) => d.id === seed.driver) : null;
    return {
      id: `o-${seed.ref}`,
      business_id: BUSINESSES[0].id,
      reference: seed.ref,
      status: seed.status,
      source: index % 3 === 0 ? "whatsapp" : "portal",
      service_type: seed.service,
      description: seed.desc,
      parcel_details: null,
      pickup_text: seed.pickup,
      destination_text: seed.dest,
      pickup_location_id: null,
      destination_location_id: null,
      requested_at: ago(seed.age + 60),
      scheduled_at: seed.age < 60 ? ahead(30) : null,
      promised_at: ahead(120),
      price_amount: seed.price,
      currency: "NGN",
      payment_status: seed.payment,
      payment_method: index % 2 === 0 ? "cash" : "bank_transfer",
      customer_id: seed.customer ? seed.customer.id : null,
      tracking_token: `preview-token-${index}`,
      created_at: ago(seed.age),
      status_changed_at: ago(seed.age - 5),
      customer: seed.customer,
      pickup_location: null,
      destination_location: null,
      current_assignments: assignmentFor(seed),
      driver_names: driver ? [driver.full_name] : [],
      allowed_next: EDGES[seed.status] || [],
      driver_stage: DRIVER_STAGES.has(seed.status),
    };
  });

  /* History is derived from how far along an order is, so a detail panel opened on
   * an in-transit order reads like a real trail rather than a single line. */
  const PATH = [
    "requested", "under_review", "quoted", "awaiting_customer_approval",
    "accepted", "assigned", "driver_accepted", "driver_arrived", "at_pickup",
    "picked_up", "in_transit", "arrival_attempted", "delivered", "completed",
  ];
  function historyFor(order) {
    const end = PATH.indexOf(order.status);
    const steps = end === -1 ? ["requested"] : PATH.slice(0, end + 1);
    const rows = [];
    let cursor = order.created_at;
    steps.forEach((status, i) => {
      rows.push({
        from_status: i === 0 ? null : steps[i - 1],
        to_status: status,
        delivery_event: null,
        note: null,
        actor_role: i <= 1 ? "staff" : "driver",
        occurred_at: cursor,
      });
      cursor = new Date(new Date(cursor).getTime() + 12 * 60000).toISOString();
    });
    return rows;
  }
  const DELAY = 260;

  function board() {
    const counts = {};
    for (const order of ORDERS) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return {
      business_id: BUSINESSES[0].id,
      orders: ORDERS,
      counts,
      limit: 50,
      truncated: false,
      transition_source: "mirror",
      drivers_available: DRIVERS,
      note:
        "DESIGN PREVIEW: these orders are synthetic and exist only in this browser " +
        "tab. Nothing was read from or written to a database.",
    };
  }

  function detail(orderId) {
    const order = ORDERS.find((item) => item.id === orderId);
    if (!order) {
      throw {
        message: "No such order in the preview set.",
        status: 404,
        source: "preview",
      };
    }
    return {
      order,
      history: historyFor(order),
      assignments: order.current_assignments,
      allowed_next: order.allowed_next,
    };
  }

  const REFUSALS = {
    POST: "Creating or changing a record",
    PATCH: "Changing a record",
    PUT: "Changing a record",
    DELETE: "Deleting a record",
  };

  /* One request that genuinely works with no credentials, so it is left alone: the
   * WhatsApp parser runs offline and its real output is worth looking at. */
  function realApi(verb, path, body) {
    return fetch(path, {
      method: verb,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(
          (payload && payload.error && payload.error.message) || String(response.status)
        );
      }
      return payload;
    });
  }

  async function handle(method, path, body) {
    const verb = method.toUpperCase();

    // /api/status is deliberately NOT faked: it works with no credentials and
    // reports the real configuration, which is worth seeing while designing.
    if (path.startsWith("/api/status")) return realApi(verb, path, body);
    if (path.startsWith("/api/imports/whatsapp")) return realApi(verb, path, body);

    if (verb === "GET" && path.startsWith("/api/businesses")) {
      await new Promise((r) => setTimeout(r, DELAY));
      return { businesses: BUSINESSES, source: "preview" };
    }
    if (verb === "GET" && path.startsWith("/api/board")) {
      await new Promise((r) => setTimeout(r, DELAY));
      return board();
    }
    if (verb === "GET" && path.startsWith("/api/orders/")) {
      await new Promise((r) => setTimeout(r, DELAY));
      return detail(decodeURIComponent(path.slice("/api/orders/".length).split("?")[0]));
    }

    const what = REFUSALS[verb] || "This request";
    throw new Error(
      `Design preview: ${what} is disabled, so nothing can be sent to a database ` +
        "from this tab. Remove ?preview=1 from the URL to use the live portal."
    );
  }

  window.PulsePreview = { handle, ORDER_COUNT: ORDERS.length };
})();