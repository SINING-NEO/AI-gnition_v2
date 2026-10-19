/**
 * Feasibility spike for the replenishment wedge.
 *
 * Question: from order history a business already holds, can we find customers
 * with a stable repurchase interval, name the product they actually buy, and
 * draft one message that uses only those facts?
 *
 * This does not measure retention lift. It checks whether the data gate and
 * the grounding gate can pass before anyone sends a message.
 *
 * Two synthetic books, same rules:
 *   consumables — 70% loyal buyers on a noisy 28-day gap, 30% irregular
 *   irregular   — gaps and products jump around (fashion-like)
 *
 * Two filters, on purpose:
 *   weak   — interval CV < 0.5 with at least 3 gaps
 *   strong — weak, plus one SKU is >= 60% of orders, and the median gap
 *            sits in a consumable band of 14–45 days
 * Replenishment is a fit only when the strong share is >= 30% of repeat
 * buyers and drafted messages add no SKU or offer that was not in the row.
 * The irregular book should fail the strong bar. The weak bar is reported
 * because it looks strict and still lets the wrong catalogue through.
 */

const AS_OF = Date.parse("2026-10-19T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const N = 4000;
const SEED = 19;

const CONSUMABLE_SKUS = ["House blend 250g", "Decaf 250g", "Oat milk 1L", "Filter papers"];
const IRREGULAR_SKUS = ["Linen shirt", "Wool coat", "Canvas tote", "Leather belt", "Silk scarf"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand, mean, sd) {
  const u = Math.max(rand(), 1e-9);
  const v = Math.max(rand(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values) {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function stdev(values) {
  const m = mean(values);
  const variance = mean(values.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

function formatDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function buildCustomer(rand, profile) {
  const loyal = profile === "consumables" ? rand() < 0.7 : false;
  const skus = loyal ? CONSUMABLE_SKUS : IRREGULAR_SKUS;
  const primary = pick(rand, loyal ? CONSUMABLE_SKUS : skus);
  const consented = rand() < 0.85;
  const orders = [];
  let t = AS_OF - Math.round((320 + rand() * 80) * DAY);

  while (t < AS_OF && orders.length < 14) {
    const sku = loyal ? (rand() < 0.75 ? primary : pick(rand, CONSUMABLE_SKUS)) : pick(rand, skus);
    orders.push({ at: t, sku, qty: 1 });
    const gap = loyal
      ? Math.max(7, Math.round(normal(rand, 28, 9)))
      : Math.round(10 + rand() * 170);
    t += gap * DAY;
  }

  return { profile, loyal, primary, consented, orders: orders.filter((o) => o.at <= AS_OF) };
}

function analyse(customer) {
  const orders = [...customer.orders].sort((a, b) => a.at - b.at);
  if (orders.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < orders.length; i++) {
    gaps.push(Math.round((orders[i].at - orders[i - 1].at) / DAY));
  }
  const counts = new Map();
  for (const order of orders) counts.set(order.sku, (counts.get(order.sku) || 0) + 1);
  let dominantSku = orders[0].sku;
  let dominantCount = 0;
  for (const [sku, count] of counts) {
    if (count > dominantCount) {
      dominantSku = sku;
      dominantCount = count;
    }
  }
  const med = median(gaps);
  const cv = gaps.length >= 3 ? stdev(gaps) / mean(gaps) : null;
  const intervalOnly = cv !== null && cv < 0.5;
  const replenishment =
    intervalOnly && dominantCount / orders.length >= 0.6 && med >= 14 && med <= 45;
  const last = orders[orders.length - 1];
  const predicted = last.at + med * DAY;
  const daysFromDue = Math.round((AS_OF - predicted) / DAY);
  const due = daysFromDue >= -2 && daysFromDue <= 5;
  return {
    gaps,
    medianDays: med,
    cv,
    intervalOnly,
    replenishment,
    dominantSku,
    dominantShare: dominantCount / orders.length,
    lastOrder: last.at,
    due,
    consented: customer.consented,
    history: [...counts.keys()],
  };
}

function message(row) {
  const weeks = Math.max(1, Math.round(row.medianDays / 7));
  return `Your ${row.dominantSku} from ${formatDay(row.lastOrder)} usually lasts about ${weeks} weeks. Same again?`;
}

function groundingViolations(row, text) {
  const violations = [];
  if (!row.history.includes(row.dominantSku) || !text.includes(row.dominantSku)) {
    violations.push("sku");
  }
  for (const sku of [...CONSUMABLE_SKUS, ...IRREGULAR_SKUS]) {
    if (sku !== row.dominantSku && text.includes(sku)) violations.push("foreign-sku");
  }
  if (/\b(\d+%|discount|off|sale|free)\b/i.test(text)) violations.push("invented-offer");
  if (!text.includes(formatDay(row.lastOrder))) violations.push("date");
  return violations;
}

function run(profile) {
  const rand = mulberry32(SEED + (profile === "consumables" ? 1 : 2));
  const rows = [];
  for (let i = 0; i < N; i++) {
    const analysed = analyse(buildCustomer(rand, profile));
    if (analysed) rows.push(analysed);
  }
  const intervalOnly = rows.filter((r) => r.intervalOnly);
  const replenishment = rows.filter((r) => r.replenishment);
  const eligible = replenishment.filter((r) => r.due && r.consented);
  let violations = 0;
  let holdout = 0;
  const samples = [];
  for (let i = 0; i < eligible.length; i++) {
    const text = message(eligible[i]);
    violations += groundingViolations(eligible[i], text).length;
    if (i % 5 === 0) holdout += 1;
    if (samples.length < 2) samples.push(text);
  }
  const intervalShare = intervalOnly.length / rows.length;
  const replenishmentShare = replenishment.length / rows.length;
  const pass = replenishmentShare >= 0.3 && violations === 0 && eligible.length > 0;
  return {
    profile,
    customers: N,
    repeatBuyers: rows.length,
    intervalOnly: intervalOnly.length,
    intervalOnlyShare: Number((intervalShare * 100).toFixed(1)),
    replenishmentFit: replenishment.length,
    replenishmentShare: Number((replenishmentShare * 100).toFixed(1)),
    eligibleThisWeek: eligible.length,
    holdout,
    treatment: eligible.length - holdout,
    groundingViolations: violations,
    pass,
    samples,
  };
}

const consumables = run("consumables");
const irregular = run("irregular");
const summary = {
  asOf: "2026-10-19",
  seed: SEED,
  customersPerBook: N,
  weakRule: "CV < 0.5 on at least 3 gaps",
  strongRule:
    "weak rule, plus dominant SKU >= 60% and median gap of 14–45 days; pass if that share >= 30%",
  consumables,
  irregular,
  weakSeparates: consumables.intervalOnlyShare >= 30 && irregular.intervalOnlyShare < 30,
  strongSeparates: consumables.pass && !irregular.pass,
};

console.log(JSON.stringify(summary, null, 2));
