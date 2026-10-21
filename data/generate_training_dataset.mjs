import fs from "node:fs/promises";
import path from "node:path";

const AS_OF = new Date("2026-10-20T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_COUNT = 3000;
const SEED = 20261020;

const PRODUCTS = [
  ["COF-HOUSE-250", "House Blend Coffee 250g", "Coffee", 14.90, 28, "COF-HOUSE-1KG"],
  ["COF-HOUSE-1KG", "House Blend Coffee 1kg", "Coffee", 49.90, 45, "FIL-100"],
  ["COF-DECAF-250", "Decaf Coffee 250g", "Coffee", 16.90, 30, "COF-DECAF-1KG"],
  ["COF-DECAF-1KG", "Decaf Coffee 1kg", "Coffee", 55.90, 48, "FIL-100"],
  ["OAT-1L", "Oat Milk 1L", "Plant Milk", 5.90, 14, "OAT-6PK"],
  ["OAT-6PK", "Oat Milk 1L Six-Pack", "Plant Milk", 32.90, 35, "COF-HOUSE-250"],
  ["FIL-100", "Coffee Filter Papers 100 Pack", "Brewing Supplies", 8.90, 40, "COF-HOUSE-250"],
  ["TEA-GREEN-20", "Green Tea 20 Sachets", "Tea", 9.90, 24, "TEA-GREEN-60"],
  ["TEA-GREEN-60", "Green Tea 60 Sachets", "Tea", 24.90, 50, "HONEY-500"],
  ["GRAN-500", "Granola 500g", "Breakfast", 12.90, 21, "GRAN-1KG"],
  ["GRAN-1KG", "Granola 1kg", "Breakfast", 22.90, 35, "OAT-1L"],
  ["HONEY-500", "Wildflower Honey 500g", "Pantry", 18.90, 60, "TEA-GREEN-20"],
];

const REGIONS = ["Central", "East", "North", "North-East", "West"];
const CHANNELS = ["Web", "Mobile App", "Store", "WhatsApp"];
const FIRST_NAMES = [
  "Aisha", "Ben", "Chen", "Devi", "Ethan", "Farah", "Grace", "Harish", "Iris", "Jia Wei",
  "Kavya", "Lucas", "Mei Lin", "Noor", "Oliver", "Priya", "Qian", "Ravi", "Sarah", "Taufiq",
  "Uma", "Vincent", "Wei Ming", "Xinyi", "Yasmin", "Zachary",
];

const PRODUCT_BY_ID = new Map(PRODUCTS.map((row) => [row[0], {
  productId: row[0], productName: row[1], category: row[2], unitPrice: row[3],
  baseCycleDays: row[4], approvedRecommendationId: row[5],
}]));

function buildMerchandisingData() {
  const stockQuantities = [85, 22, 0, 14, 140, 28, 9, 0, 18, 65, 16, 42];
  const reorderLevels = [20, 12, 18, 10, 35, 16, 15, 20, 12, 18, 12, 10];
  const inventoryRows = PRODUCTS.map((product, index) => {
    const stockQuantity = stockQuantities[index];
    const reorderLevel = reorderLevels[index];
    const stockStatus = stockQuantity === 0 ? "out_of_stock" : stockQuantity <= reorderLevel ? "low_stock" : "in_stock";
    return {
      productId: product[0],
      productName: product[1],
      stockQuantity,
      reorderLevel,
      stockStatus,
      nextRestockDate: stockStatus === "out_of_stock" ? addDays(AS_OF, 5 + index) : null,
      lastUpdated: AS_OF,
    };
  });

  const offerSpecs = [
    ["OFF-OAT-6PK", "OAT-6PK", 29.90, -5, 11, "While stocks last"],
    ["OFF-HOUSE-1KG", "COF-HOUSE-1KG", 44.90, -8, 8, "One offer per customer"],
    ["OFF-GRAN-1KG", "GRAN-1KG", 19.90, -2, 14, "Online orders only"],
    ["OFF-TEA-60-OLD", "TEA-GREEN-60", 22.90, -20, -1, "Expired demonstration offer"],
    ["OFF-DECAF-1KG-NEXT", "COF-DECAF-1KG", 49.90, 5, 20, "Future demonstration offer"],
  ];
  const offerRows = offerSpecs.map(([offerId, productId, discountPrice, startOffset, endOffset, terms]) => {
    const product = PRODUCT_BY_ID.get(productId);
    const startDate = addDays(AS_OF, startOffset);
    const endDate = addDays(AS_OF, endOffset);
    return {
      offerId,
      productId,
      productName: product.productName,
      regularPrice: product.unitPrice,
      discountPrice,
      discountPct: Number((1 - discountPrice / product.unitPrice).toFixed(4)),
      startDate,
      endDate,
      isActive: startDate <= AS_OF && AS_OF <= endDate,
      terms,
      lastUpdated: AS_OF,
    };
  });
  return { inventoryRows, offerRows };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function intBetween(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function normal(random, mean, sd) {
  const u = Math.max(random(), 1e-9);
  const v = Math.max(random(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function profileFor(random) {
  const value = random();
  if (value < 0.50) return "regular_replenisher";
  if (value < 0.70) return "product_switcher";
  if (value < 0.85) return "irregular_buyer";
  if (value < 0.95) return "lapsed_repeat_buyer";
  return "new_customer";
}

function orderCountFor(random, profile) {
  if (profile === "new_customer") return intBetween(random, 1, 2);
  if (profile === "irregular_buyer") return intBetween(random, 4, 9);
  if (profile === "lapsed_repeat_buyer") return intBetween(random, 5, 10);
  return intBetween(random, 6, 14);
}

function daysSinceLastFor(random, profile) {
  if (profile === "new_customer") return intBetween(random, 0, 45);
  if (profile === "lapsed_repeat_buyer") return intBetween(random, 80, 180);
  if (profile === "irregular_buyer") return intBetween(random, 0, 120);
  return intBetween(random, 0, 55);
}

function splitFor(customerNumber) {
  const bucket = customerNumber % 20;
  if (bucket < 14) return "train";
  if (bucket < 17) return "validation";
  return "test";
}

function productSequence(random, profile, count) {
  const commonIds = PRODUCTS.map((row) => row[0]).filter((id) => !id.endsWith("1KG") && id !== "OAT-6PK" && id !== "TEA-GREEN-60");
  const primary = pick(random, commonIds);
  const complement = PRODUCT_BY_ID.get(primary).approvedRecommendationId;
  const sequence = [];
  for (let index = 0; index < count; index += 1) {
    if (profile === "regular_replenisher" || profile === "lapsed_repeat_buyer") {
      sequence.push(random() < 0.82 ? primary : complement);
    } else if (profile === "product_switcher") {
      sequence.push(index % 2 === 0 ? primary : complement);
    } else if (profile === "new_customer") {
      sequence.push(random() < 0.8 ? primary : complement);
    } else {
      sequence.push(pick(random, PRODUCTS)[0]);
    }
  }
  return { primary, sequence };
}

function gapsFor(random, profile, sequence) {
  const gaps = [];
  for (let index = 1; index < sequence.length; index += 1) {
    const current = PRODUCT_BY_ID.get(sequence[index]);
    const previous = PRODUCT_BY_ID.get(sequence[index - 1]);
    let gap;
    if (profile === "regular_replenisher" || profile === "lapsed_repeat_buyer") {
      gap = normal(random, previous.baseCycleDays, Math.max(3, previous.baseCycleDays * 0.15));
    } else if (profile === "product_switcher") {
      gap = sequence[index] === sequence[index - 1]
        ? normal(random, 21, 3)
        : normal(random, 40, 5);
    } else if (profile === "new_customer") {
      gap = normal(random, current.baseCycleDays, 5);
    } else {
      gap = intBetween(random, 10, 140);
    }
    gaps.push(Math.max(7, Math.min(180, Math.round(gap))));
  }
  return gaps;
}

function dominantProduct(orders) {
  const counts = new Map();
  for (const order of orders) counts.set(order.productId, (counts.get(order.productId) || 0) + 1);
  let winner = orders[0].productId;
  let winnerCount = 0;
  for (const [productId, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = productId;
      winnerCount = count;
    }
  }
  return { productId: winner, share: winnerCount / orders.length };
}

function generateData() {
  const random = mulberry32(SEED);
  const customers = [];
  const allOrders = [];

  for (let number = 1; number <= CUSTOMER_COUNT; number += 1) {
    const customerId = `C${String(number).padStart(5, "0")}`;
    const profile = profileFor(random);
    const orderCount = orderCountFor(random, profile);
    const region = pick(random, REGIONS);
    const acquisitionChannel = pick(random, CHANNELS);
    const contactConsent = random() < 0.82;
    const name = `${pick(random, FIRST_NAMES)} ${String(number).padStart(4, "0")}`;
    const split = splitFor(number);
    const { primary, sequence } = productSequence(random, profile, orderCount);
    const gaps = gapsFor(random, profile, sequence);
    const lastDate = addDays(AS_OF, -daysSinceLastFor(random, profile));
    const dates = [lastDate];
    for (let index = gaps.length - 1; index >= 0; index -= 1) {
      dates.push(addDays(dates[dates.length - 1], -gaps[index]));
    }
    dates.reverse();

    const customerOrders = [];
    for (let index = 0; index < sequence.length; index += 1) {
      const product = PRODUCT_BY_ID.get(sequence[index]);
      const quantity = product.productId.includes("6PK") || product.productId.includes("1KG")
        ? 1
        : intBetween(random, 1, 3);
      const discountPct = random() < 0.18 ? pick(random, [0.05, 0.10, 0.15]) : 0;
      const orderValue = Number((quantity * product.unitPrice * (1 - discountPct)).toFixed(2));
      const order = {
        orderId: `O${String(number).padStart(5, "0")}-${String(index + 1).padStart(2, "0")}`,
        customerId,
        orderDate: dates[index],
        productId: product.productId,
        productName: product.productName,
        category: product.category,
        quantity,
        unitPrice: product.unitPrice,
        discountPct,
        orderValue,
        channel: random() < 0.65 ? acquisitionChannel : pick(random, CHANNELS),
        region,
        contactConsent,
        customerProfile: profile,
        isRepeatOrder: index > 0,
      };
      customerOrders.push(order);
      allOrders.push(order);
    }

    customers.push({
      customerId,
      customerName: name,
      region,
      acquisitionChannel,
      contactConsent,
      customerProfile: profile,
      primaryProductId: primary,
      datasetSplit: split,
      firstOrderDate: customerOrders[0].orderDate,
      latestOrderDate: customerOrders[customerOrders.length - 1].orderDate,
      lifetimeOrders: customerOrders.length,
      lifetimeValue: Number(customerOrders.reduce((sum, order) => sum + order.orderValue, 0).toFixed(2)),
    });
  }

  allOrders.sort((a, b) => a.customerId.localeCompare(b.customerId) || a.orderDate - b.orderDate);
  return { customers, allOrders };
}

function buildTrainingRows(customers, allOrders) {
  const customerMap = new Map(customers.map((customer) => [customer.customerId, customer]));
  const grouped = new Map();
  for (const order of allOrders) {
    if (!grouped.has(order.customerId)) grouped.set(order.customerId, []);
    grouped.get(order.customerId).push(order);
  }

  const rows = [];
  let exampleNumber = 1;
  for (const [customerId, orders] of grouped.entries()) {
    const customer = customerMap.get(customerId);
    for (let cutoff = 2; cutoff < orders.length - 1; cutoff += 1) {
      const history = orders.slice(0, cutoff + 1);
      const dates = history.map((order) => order.orderDate);
      const gaps = [];
      for (let index = 1; index < dates.length; index += 1) {
        gaps.push(Math.round((dates[index] - dates[index - 1]) / DAY_MS));
      }
      const latest = history[history.length - 1];
      const previous = history[history.length - 2];
      const next = orders[cutoff + 1];
      const dominant = dominantProduct(history);
      rows.push({
        exampleId: `E${String(exampleNumber).padStart(7, "0")}`,
        customerId,
        datasetSplit: customer.datasetSplit,
        cutoffOrderDate: latest.orderDate,
        orderCountToDate: history.length,
        daysSincePreviousOrder: gaps[gaps.length - 1],
        meanGapDays: Number(mean(gaps).toFixed(2)),
        medianGapDays: Number(median(gaps).toFixed(2)),
        gapStdDays: Number(stdev(gaps).toFixed(2)),
        dominantProductId: dominant.productId,
        dominantProductShare: Number(dominant.share.toFixed(4)),
        latestProductId: latest.productId,
        previousProductId: previous.productId,
        sameAsPreviousProduct: latest.productId === previous.productId,
        latestQuantity: latest.quantity,
        latestOrderValue: latest.orderValue,
        latestDiscountPct: latest.discountPct,
        latestChannel: latest.channel,
        region: customer.region,
        customerProfile: customer.customerProfile,
        contactConsent: customer.contactConsent,
        targetNextGapDays: Math.round((next.orderDate - latest.orderDate) / DAY_MS),
        targetNextProductId: next.productId,
        targetRepeatSameProduct: next.productId === latest.productId,
      });
      exampleNumber += 1;
    }
  }
  return rows;
}

function buildSnapshots(customers, allOrders) {
  const grouped = new Map();
  for (const order of allOrders) {
    if (!grouped.has(order.customerId)) grouped.set(order.customerId, []);
    grouped.get(order.customerId).push(order);
  }
  return customers.map((customer) => {
    const orders = grouped.get(customer.customerId);
    const latest = orders[orders.length - 1];
    const gaps = [];
    for (let index = 1; index < orders.length; index += 1) {
      gaps.push(Math.round((orders[index].orderDate - orders[index - 1].orderDate) / DAY_MS));
    }
    const dominant = dominantProduct(orders);
    const medianGap = gaps.length ? median(gaps) : 0;
    const daysSinceLast = Math.round((AS_OF - latest.orderDate) / DAY_MS);
    let state = "stay_quiet";
    if (!customer.contactConsent) state = "no_contact_consent";
    else if (orders.length < 3) state = "insufficient_history";
    else if (daysSinceLast > medianGap * 1.4) state = "lapsed";
    else if (medianGap - daysSinceLast >= -2 && medianGap - daysSinceLast <= 5) state = "due_soon";
    const product = PRODUCT_BY_ID.get(dominant.productId);
    const recommendation = PRODUCT_BY_ID.get(product.approvedRecommendationId);
    return {
      customerId: customer.customerId,
      customerName: customer.customerName,
      asOfDate: AS_OF,
      datasetSplit: customer.datasetSplit,
      customerProfile: customer.customerProfile,
      contactConsent: customer.contactConsent,
      orderCount: orders.length,
      daysSinceLastPurchase: daysSinceLast,
      meanGapDays: gaps.length ? Number(mean(gaps).toFixed(2)) : 0,
      medianGapDays: Number(medianGap.toFixed(2)),
      gapStdDays: gaps.length ? Number(stdev(gaps).toFixed(2)) : 0,
      dominantProductId: dominant.productId,
      dominantProductName: product.productName,
      dominantProductShare: Number(dominant.share.toFixed(4)),
      latestProductId: latest.productId,
      latestProductName: latest.productName,
      candidateState: state,
      approvedRecommendationId: recommendation.productId,
      approvedRecommendationName: recommendation.productName,
      region: customer.region,
    };
  });
}

function validate({ customers, allOrders, trainingRows, snapshots, inventoryRows, offerRows }) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, status: pass ? "PASS" : "FAIL", detail });
  const unique = (rows, key) => new Set(rows.map((row) => row[key])).size === rows.length;
  const complete = (rows) => rows.every((row) => Object.values(row).every((value) => value !== null && value !== undefined && value !== ""));

  add("Unique customer_id", unique(customers, "customerId"), `${customers.length} customer records`);
  add("Unique order_id", unique(allOrders, "orderId"), `${allOrders.length} order records`);
  add("Unique example_id", unique(trainingRows, "exampleId"), `${trainingRows.length} model rows`);
  add("One snapshot per customer", unique(snapshots, "customerId") && snapshots.length === customers.length, `${snapshots.length} snapshots`);
  add("No missing customer values", complete(customers), "All customer fields populated");
  add("No missing order values", complete(allOrders), "All order fields populated");
  add("No missing training values", complete(trainingRows), "All model fields populated");
  add("No missing snapshot values", complete(snapshots), "All snapshot fields populated");
  add("Positive quantities", allOrders.every((row) => Number.isInteger(row.quantity) && row.quantity > 0), "All quantities are positive integers");
  add("Valid order values", allOrders.every((row) => row.orderValue > 0 && Math.abs(row.orderValue - Number((row.quantity * row.unitPrice * (1 - row.discountPct)).toFixed(2))) < 0.001), "Order values reconcile to quantity, price and discount");
  add("Valid dates", allOrders.every((row) => row.orderDate instanceof Date && row.orderDate <= AS_OF), "No order is after the as-of date");
  add("Positive targets", trainingRows.every((row) => Number.isInteger(row.targetNextGapDays) && row.targetNextGapDays >= 7 && row.targetNextGapDays <= 180), "Every next-gap target is between 7 and 180 days");
  add("Customer-level split", customers.every((customer) => trainingRows.filter((row) => row.customerId === customer.customerId).every((row) => row.datasetSplit === customer.datasetSplit)), "No customer appears in more than one split");
  add("Approved recommendations", snapshots.every((row) => PRODUCT_BY_ID.has(row.approvedRecommendationId)), "All recommendations exist in the product catalogue");
  add("Inventory coverage", inventoryRows.length === PRODUCTS.length && unique(inventoryRows, "productId"), "One inventory row exists for every product");
  add("Inventory status", inventoryRows.every((row) => row.stockStatus === (row.stockQuantity === 0 ? "out_of_stock" : row.stockQuantity <= row.reorderLevel ? "low_stock" : "in_stock")), "Stock status agrees with quantity and reorder level");
  add("Offer products", offerRows.every((row) => PRODUCT_BY_ID.has(row.productId)), "Every offer references a catalogue product");
  add("Offer pricing", offerRows.every((row) => row.discountPrice > 0 && row.discountPrice < row.regularPrice), "Every offer has a positive discounted price below regular price");
  add("Offer dates", offerRows.every((row) => row.isActive === (row.startDate <= AS_OF && AS_OF <= row.endDate)), "Active flags agree with the as-of date");
  return checks;
}

function rowsFor(objects, columns) {
  return [columns.map((column) => column.label), ...objects.map((object) => columns.map((column) => object[column.key]))];
}

function styleDataSheet(sheet, columns, rowCount, tableName) {
  const lastColumn = String.fromCharCode(64 + columns.length);
  const used = sheet.getRange(`A1:${lastColumn}${rowCount + 1}`);
  used.format.font = { name: "Arial", size: 10, color: "#1F2937" };
  used.format.verticalAlignment = "center";
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: "#1F4E78",
    font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastColumn}1`).format.rowHeight = 28;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  sheet.tables.add(`A1:${lastColumn}${rowCount + 1}`, true, tableName).style = "TableStyleMedium2";
  used.format.autofitColumns();
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const range = sheet.getRangeByIndexes(1, index, rowCount, 1);
    if (column.format) range.format.numberFormat = column.format;
    const fullColumn = sheet.getRangeByIndexes(0, index, rowCount + 1, 1);
    if (column.width) fullColumn.format.columnWidth = column.width;
  }
}

export async function buildDataset({ Workbook, SpreadsheetFile, outputPath }) {
  const { customers, allOrders } = generateData();
  const trainingRows = buildTrainingRows(customers, allOrders);
  const snapshots = buildSnapshots(customers, allOrders);
  const { inventoryRows, offerRows } = buildMerchandisingData();
  const checks = validate({ customers, allOrders, trainingRows, snapshots, inventoryRows, offerRows });
  if (checks.some((check) => check.status !== "PASS")) {
    throw new Error(`Dataset validation failed: ${JSON.stringify(checks.filter((check) => check.status !== "PASS"))}`);
  }

  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const training = workbook.worksheets.add("Model Training");
  const current = workbook.worksheets.add("Current Snapshot");
  const orders = workbook.worksheets.add("Raw Orders");
  const products = workbook.worksheets.add("Products");
  const inventory = workbook.worksheets.add("Inventory");
  const offers = workbook.worksheets.add("Active Offers");
  const customerSheet = workbook.worksheets.add("Customers");
  const dictionary = workbook.worksheets.add("Data Dictionary");

  const customerColumns = [
    ["customerId", "customer_id", 15], ["customerName", "customer_name", 19], ["region", "region", 13],
    ["acquisitionChannel", "acquisition_channel", 18], ["contactConsent", "contact_consent", 15],
    ["customerProfile", "customer_profile", 22], ["primaryProductId", "primary_product_id", 20],
    ["datasetSplit", "dataset_split", 14], ["firstOrderDate", "first_order_date", 15, "yyyy-mm-dd"],
    ["latestOrderDate", "latest_order_date", 16, "yyyy-mm-dd"], ["lifetimeOrders", "lifetime_orders", 15, "0"],
    ["lifetimeValue", "lifetime_value_sgd", 18, '"S$"#,##0.00'],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));

  const orderColumns = [
    ["orderId", "order_id", 17], ["customerId", "customer_id", 15], ["orderDate", "order_date", 14, "yyyy-mm-dd"],
    ["productId", "product_id", 20], ["productName", "product_name", 28], ["category", "category", 18],
    ["quantity", "quantity", 10, "0"], ["unitPrice", "unit_price_sgd", 15, '"S$"#,##0.00'],
    ["discountPct", "discount_pct", 14, "0.0%"], ["orderValue", "order_value_sgd", 17, '"S$"#,##0.00'],
    ["channel", "channel", 14], ["region", "region", 13], ["contactConsent", "contact_consent", 15],
    ["customerProfile", "customer_profile", 22], ["isRepeatOrder", "is_repeat_order", 15],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));

  const trainingColumns = [
    ["exampleId", "example_id", 16], ["customerId", "customer_id", 15], ["datasetSplit", "dataset_split", 14],
    ["cutoffOrderDate", "cutoff_order_date", 17, "yyyy-mm-dd"], ["orderCountToDate", "order_count_to_date", 19, "0"],
    ["daysSincePreviousOrder", "days_since_previous_order", 23, "0"], ["meanGapDays", "mean_gap_days", 15, "0.00"],
    ["medianGapDays", "median_gap_days", 17, "0.00"], ["gapStdDays", "gap_std_days", 14, "0.00"],
    ["dominantProductId", "dominant_product_id", 21], ["dominantProductShare", "dominant_product_share", 23, "0.0%"],
    ["latestProductId", "latest_product_id", 19], ["previousProductId", "previous_product_id", 20],
    ["sameAsPreviousProduct", "same_as_previous_product", 23], ["latestQuantity", "latest_quantity", 15, "0"],
    ["latestOrderValue", "latest_order_value_sgd", 21, '"S$"#,##0.00'], ["latestDiscountPct", "latest_discount_pct", 19, "0.0%"],
    ["latestChannel", "latest_channel", 16], ["region", "region", 13], ["customerProfile", "customer_profile", 22],
    ["contactConsent", "contact_consent", 15], ["targetNextGapDays", "target_next_gap_days", 21, "0"],
    ["targetNextProductId", "target_next_product_id", 22], ["targetRepeatSameProduct", "target_repeat_same_product", 26],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));

  const snapshotColumns = [
    ["customerId", "customer_id", 15], ["customerName", "customer_name", 19], ["asOfDate", "as_of_date", 14, "yyyy-mm-dd"],
    ["datasetSplit", "dataset_split", 14], ["customerProfile", "customer_profile", 22], ["contactConsent", "contact_consent", 15],
    ["orderCount", "order_count", 13, "0"], ["daysSinceLastPurchase", "days_since_last_purchase", 23, "0"],
    ["meanGapDays", "mean_gap_days", 15, "0.00"], ["medianGapDays", "median_gap_days", 17, "0.00"],
    ["gapStdDays", "gap_std_days", 14, "0.00"], ["dominantProductId", "dominant_product_id", 21],
    ["dominantProductName", "dominant_product_name", 30], ["dominantProductShare", "dominant_product_share", 23, "0.0%"],
    ["latestProductId", "latest_product_id", 19], ["latestProductName", "latest_product_name", 30],
    ["candidateState", "candidate_state", 22], ["approvedRecommendationId", "approved_recommendation_id", 27],
    ["approvedRecommendationName", "approved_recommendation_name", 32], ["region", "region", 13],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));

  customerSheet.getRange("A1").write(rowsFor(customers, customerColumns));
  orders.getRange("A1").write(rowsFor(allOrders, orderColumns));
  training.getRange("A1").write(rowsFor(trainingRows, trainingColumns));
  current.getRange("A1").write(rowsFor(snapshots, snapshotColumns));
  styleDataSheet(customerSheet, customerColumns, customers.length, "CustomersTable");
  styleDataSheet(orders, orderColumns, allOrders.length, "OrdersTable");
  styleDataSheet(training, trainingColumns, trainingRows.length, "TrainingTable");
  styleDataSheet(current, snapshotColumns, snapshots.length, "SnapshotTable");

  const productObjects = PRODUCTS.map((row) => ({
    productId: row[0], productName: row[1], category: row[2], unitPrice: row[3],
    baseCycleDays: row[4], approvedRecommendationId: row[5],
    approvedRecommendationName: PRODUCT_BY_ID.get(row[5]).productName,
  }));
  const productColumns = [
    ["productId", "product_id", 20], ["productName", "product_name", 30], ["category", "category", 18],
    ["unitPrice", "unit_price_sgd", 16, '"S$"#,##0.00'], ["baseCycleDays", "base_cycle_days", 17, "0"],
    ["approvedRecommendationId", "approved_recommendation_id", 27], ["approvedRecommendationName", "approved_recommendation_name", 32],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));
  products.getRange("A1").write(rowsFor(productObjects, productColumns));
  styleDataSheet(products, productColumns, productObjects.length, "ProductsTable");

  const inventoryColumns = [
    ["productId", "product_id", 20], ["productName", "product_name", 30],
    ["stockQuantity", "stock_quantity", 16, "0"], ["reorderLevel", "reorder_level", 15, "0"],
    ["stockStatus", "stock_status", 16], ["nextRestockDate", "next_restock_date", 18, "yyyy-mm-dd"],
    ["lastUpdated", "last_updated", 16, "yyyy-mm-dd"],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));
  inventory.getRange("A1").write(rowsFor(inventoryRows, inventoryColumns));
  styleDataSheet(inventory, inventoryColumns, inventoryRows.length, "InventoryTable");
  inventory.getRange(`E2:E${inventoryRows.length + 1}`).conditionalFormats.add("containsText", {
    text: "out_of_stock", format: { fill: "#FEE2E2", font: { bold: true, color: "#B91C1C" } },
  });
  inventory.getRange(`E2:E${inventoryRows.length + 1}`).conditionalFormats.add("containsText", {
    text: "low_stock", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } },
  });

  const offerColumns = [
    ["offerId", "offer_id", 23], ["productId", "product_id", 20], ["productName", "product_name", 30],
    ["regularPrice", "regular_price_sgd", 18, '"S$"#,##0.00'], ["discountPrice", "discount_price_sgd", 19, '"S$"#,##0.00'],
    ["discountPct", "discount_pct", 14, "0.0%"], ["startDate", "start_date", 14, "yyyy-mm-dd"],
    ["endDate", "end_date", 14, "yyyy-mm-dd"], ["isActive", "is_active", 12], ["terms", "terms", 30],
    ["lastUpdated", "last_updated", 16, "yyyy-mm-dd"],
  ].map(([key, label, width, format]) => ({ key, label, width, format }));
  offers.getRange("A1").write(rowsFor(offerRows, offerColumns));
  styleDataSheet(offers, offerColumns, offerRows.length, "OffersTable");

  const dictionaryRows = [
    ["Sheet", "Field", "Type", "Description"],
    ["Model Training", "example_id", "text", "Unique training-example identifier"],
    ["Model Training", "customer_id", "text", "Synthetic customer identifier"],
    ["Model Training", "dataset_split", "category", "Customer-level train, validation, or test split"],
    ["Model Training", "cutoff_order_date", "date", "Latest order visible to the model for this example"],
    ["Model Training", "order_count_to_date", "integer", "Orders observed by the cutoff"],
    ["Model Training", "days_since_previous_order", "integer", "Gap between the two latest visible orders"],
    ["Model Training", "mean_gap_days", "number", "Mean historical order gap before the target purchase"],
    ["Model Training", "median_gap_days", "number", "Median historical order gap before the target purchase"],
    ["Model Training", "gap_std_days", "number", "Standard deviation of historical gaps"],
    ["Model Training", "dominant_product_share", "percentage", "Share of visible orders containing the dominant product"],
    ["Model Training", "target_next_gap_days", "integer target", "Days from cutoff order to the next order"],
    ["Model Training", "target_next_product_id", "category target", "Product in the next order"],
    ["Model Training", "target_repeat_same_product", "boolean target", "Whether the next product repeats the latest product"],
    ["Current Snapshot", "candidate_state", "category", "Rule-based state for chatbot demonstration, not a training target"],
    ["Current Snapshot", "approved_recommendation_id", "text", "Catalogue-controlled complementary or upgraded product"],
    ["Raw Orders", "order_value_sgd", "currency", "Quantity multiplied by unit price after discount"],
    ["Customers", "contact_consent", "boolean", "Whether proactive contact is permitted in the synthetic scenario"],
    ["Inventory", "stock_status", "category", "Derived from current stock quantity and reorder level"],
    ["Inventory", "last_updated", "date", "As-of date for the synthetic inventory snapshot"],
    ["Active Offers", "discount_price_sgd", "currency", "Approved promotional price; used only within the offer date window"],
    ["Active Offers", "is_active", "boolean", "Whether the offer is valid on the dataset as-of date"],
  ];
  dictionary.getRange("A1").write(dictionaryRows);
  const dictionaryColumns = [
    { key: "sheet", label: "Sheet", width: 20 }, { key: "field", label: "Field", width: 28 },
    { key: "type", label: "Type", width: 18 }, { key: "description", label: "Description", width: 70 },
  ];
  styleDataSheet(dictionary, dictionaryColumns, dictionaryRows.length - 1, "DictionaryTable");
  dictionary.getRange(`D2:D${dictionaryRows.length}`).format.wrapText = true;

  summary.showGridLines = false;
  summary.getRange("A2:F2").merge();
  summary.getRange("A2").values = [["Synthetic retail purchase dataset"]];
  summary.getRange("A2").format.font = { name: "Arial", size: 16, bold: true, color: "#1F2937" };
  summary.getRange("A3:F3").merge();
  summary.getRange("A3").values = [["Clean model-training data for purchase-gap regression. All customers and transactions are fictional."]];
  summary.getRange("A3").format.font = { name: "Arial", size: 10, italic: true, color: "#4B5563" };
  summary.getRange("A5:B13").values = [
    ["Dataset measure", "Value"],
    ["Synthetic customers", customers.length],
    ["Raw order lines", allOrders.length],
    ["Model training examples", trainingRows.length],
    ["Products", productObjects.length],
    ["Inventory records", inventoryRows.length],
    ["Currently active offers", offerRows.filter((row) => row.isActive).length],
    ["As-of date", AS_OF],
    ["Random seed", SEED],
  ];
  summary.getRange("A5:B5").format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" } };
  summary.getRange("B12").format.numberFormat = "yyyy-mm-dd";
  summary.getRange("A15:C15").values = [["Validation check", "Status", "Detail"]];
  summary.getRange("A16").write(checks.map((check) => [check.name, check.status, check.detail]));
  summary.getRange(`A15:C${15 + checks.length}`).format.font = { name: "Arial", size: 10, color: "#1F2937" };
  summary.getRange("A15:C15").format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" } };
  summary.getRange(`B16:B${15 + checks.length}`).conditionalFormats.add("containsText", {
    text: "FAIL", format: { fill: "#FEE2E2", font: { bold: true, color: "#B91C1C" } },
  });
  summary.getRange("A5:C30").format.verticalAlignment = "center";
  summary.getRange("A5:C30").format.autofitColumns();
  summary.getRange("A:A").format.columnWidth = 31;
  summary.getRange("B:B").format.columnWidth = 18;
  summary.getRange("C:C").format.columnWidth = 62;
  summary.freezePanes.freezeRows(4);
  summary.tabColor = "#1F4E78";
  training.tabColor = "#5B9BD5";
  current.tabColor = "#5B9BD5";
  inventory.tabColor = "#70AD47";
  offers.tabColor = "#FFC000";
  dictionary.tabColor = "#A5A5A5";

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { workbook, outputPath, counts: { customers: customers.length, orders: allOrders.length, trainingRows: trainingRows.length, snapshots: snapshots.length, inventory: inventoryRows.length, offers: offerRows.length }, checks };
}
