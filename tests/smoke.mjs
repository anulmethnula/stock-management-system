import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
test("Supun branch → GRN → customer delivery → return → audit history", { timeout: 50000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "stockeasy-test-"));
  const port = await unusedPort();
  const password = "TestOnlyPassword#123";
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: path.resolve("."),
    env: { ...process.env, PORT: String(port), STOCKEASY_DB_PATH: path.join(temp, "test.sqlite"),
      STOCKEASY_ADMIN_USER: "testadmin", STOCKEASY_ADMIN_PASSWORD: password, STOCKEASY_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", v => logs += v);
  child.stderr.on("data", v => logs += v);
  const root = `http://127.0.0.1:${port}/api`;
  let cookie = "";
  async function api(path, method = "GET", body, status = 200, cookieOverride) {
    const res = await fetch(root + path, {
      method, headers: { "Content-Type": "application/json", ...(cookieOverride ?? cookie ? { Cookie: cookieOverride ?? cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const result = await res.json();
    assert.equal(res.status, status, `${method} ${path} expected ${status}, got ${res.status}: ${JSON.stringify(result)}`);
    return { data: result, response: res };
  }
  const idOf = async (path, field, body) => (await api(path, "POST", body)).data[field];
  const snapshot = async () => (await api("/all")).data;

  try {
    let online = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error("Server exited early:\n" + logs);
      try { await fetch(root + "/all"); online = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(online, "Server did not start:\n" + logs);
    await api("/all", "GET", undefined, 401);
    const login = await api("/login", "POST", { username: "testadmin", password });
    cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";
    assert.match(cookie, /^stockeasy_session=/);

    const a = await idOf("/branches", "id", { name: "Supun Branch A", contact: "Manager A", phone: "077000001", phone2: "071000001", location: "Colombo", notes: "Open weekdays", supplier_type: "internal" });
    const b = await idOf("/branches", "id", { name: "External Supplier B", contact: "Manager B", phone: "077000002", location: "Galle", supplier_type: "external" });
    await api("/branches/" + a, "PUT", { name: "Supun Central", contact: "Manager A", phone: "077000001", phone2: "071000001", location: "Colombo", notes: "Use rear entrance", supplier_type: "internal", active: 1 });
    const cid = await idOf("/customers", "id", { name: "Test Customer Ltd", contact: "Buyer", phone: "077999999", phone2: "071999999", address: "Office", notes: "Call before delivery", customer_type: "external" });
    const pid = await idOf("/products", "id", { name: "Paper Box", sku: "BOX-001", category: "Packaging", emoji: "📦", sid: a, unit: "boxes",
      cost: 100, sell: 150, stock: 0, reorder: 5 });
    // A product's usual branch A does not prevent requesting it from branch B.
    const poCode = await idOf("/pos", "code", { sid: b, items: [{ pid, qty: 20, cost: 100 }] });
    const poN = (await snapshot()).pos.find(x => x.id === poCode).n;
    // A PO can be edited before receiving starts.
    await api("/pos/" + poN, "PUT", { sid: b, items: [{ pid, qty: 20, cost: 105 }] });
    assert.equal((await snapshot()).pos.find(x => x.n === poN).items[0].cost, 105);
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 0);
    await api("/pos/" + poN + "/receive", "POST", { lines: [{ pid, qty: 12 }], by: "Store clerk" });
    let snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 12);
    assert.equal(snap.pos.find(x => x.n === poN).status, "Part received");
    await api("/pos/" + poN, "PUT", { sid: b, items: [{ pid, qty: 20, cost: 105 }] }, 409);
    const firstGrn = snap.grns[0].n;
    await api("/pos/" + poN + "/receive", "POST", { lines: [{ pid, qty: 8 }], by: "Store clerk" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 20);
    assert.equal(snap.pos.find(x => x.n === poN).status, "Received");
    const secondGrn = snap.grns[0].n;
    await api("/pos/" + poN + "/receive", "POST", { lines: [{ pid, qty: 1 }] }, 409);

    const coCode = await idOf("/customer-orders", "code", { cid, items: [{ pid, qty: 15, price: 150 }], note: "Send this week" });
    const coN = (await snapshot()).orders.find(x => x.id === coCode).n;
    const deliveryCode = await idOf("/customer-orders/" + coN + "/dispatch", "code",
      { lines: [{ pid, qty: 10 }], by: "Delivery person" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 10);
    assert.equal(snap.orders.find(x => x.n === coN).status, "Part dispatched");
    const dN1 = snap.deliveries.find(x => x.id === deliveryCode).n;
    await api("/customer-orders/" + coN + "/dispatch", "POST", { lines: [{ pid, qty: 5 }], by: "Delivery person" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 5);
    assert.equal(snap.orders.find(x => x.n === coN).status, "Dispatched");
    const dN2 = snap.deliveries[0].n;
    const co2 = await idOf("/customer-orders", "code", { cid, items: [{ pid, qty: 11, price: 150 }] });
    const co2n = (await snapshot()).orders.find(x => x.id === co2).n;
    await api("/customer-orders/" + co2n + "/dispatch", "POST", { lines: [{ pid, qty: 11 }] }, 409);
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 5);

    await api("/returns", "POST", { deliveryN: dN1, lines: [{ pid, qty: 2 }], note: "Wrong packaging" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 7);
    await api("/returns", "POST", { deliveryN: dN1, lines: [{ pid, qty: 9 }], note: "Too many" }, 409);
    await api("/deliveries/" + dN1 + "/reverse", "POST", { reason: "Wrong delivery" }, 409);
    await api("/returns/" + snap.returns[0].n + "/reverse", "POST", { reason: "Corrected return" });
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 5);
    await api("/deliveries/" + dN2 + "/reverse", "POST", { reason: "Delivery was cancelled" });
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 10);
    await api("/grns/" + secondGrn + "/reverse", "POST", { reason: "Wrong receipt quantity" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 2);
    assert.equal(snap.pos.find(x => x.n === poN).status, "Part received");
    await api("/grns/" + secondGrn + "/reverse", "POST", { reason: "Duplicate" }, 409);
    await api("/adjustments", "POST", { pid, change: -1, reason: "Damaged box" });
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 1);
    await api("/adjustments", "POST", { pid, change: -10, reason: "Impossible" }, 409);
    await api("/branches/" + b, "DELETE");
    snap = await snapshot();
    assert.equal(snap.branches.find(x => x.id === b).active, 0);
    assert.equal(snap.pos.find(x => x.n === poN).sid, b);
    assert.ok(snap.movements.some(x => x.type === "Delivered to customer" && x.qty < 0));
    assert.ok(snap.movements.some(x => x.type === "Goods received" && x.qty > 0));
    assert.ok(snap.movements.some(x => x.type === "Stock correction"));

    // Custom permissions hide unapproved modules and block edits at the API.
    const restrictedPermissions = { dashboard:"none", products:"none", suppliers:"view", customers:"none", purchase_orders:"none", goods_received:"none", customer_orders:"none", deliveries:"none", stock_history:"none" };
    const restrictedId = await idOf("/staff", "id", { username:"supplier-reader", password:"RestrictedPassword#123", role:"staff", permissions:restrictedPermissions });
    const restrictedLogin = await api("/login", "POST", { username:"supplier-reader", password:"RestrictedPassword#123" });
    const restrictedCookie = restrictedLogin.response.headers.get("set-cookie")?.split(";")[0];
    const restrictedData = (await api("/all", "GET", undefined, 200, restrictedCookie)).data;
    assert.ok(restrictedData.branches.length > 0);
    assert.equal(restrictedData.products.length, 0);
    await api("/branches", "POST", { name:"Forbidden supplier" }, 403, restrictedCookie);
    await api("/staff/" + restrictedId, "DELETE");

    const viewerId = await idOf("/staff", "id", { username: "viewer", password: "ViewerPassword#123", role: "viewer" });
    const viewerLogin = await api("/login", "POST", { username: "viewer", password: "ViewerPassword#123" });
    const viewerCookie = viewerLogin.response.headers.get("set-cookie")?.split(";")[0];
    await api("/all", "GET", undefined, 200, viewerCookie);
    await api("/branches", "POST", { name: "Should fail" }, 403, viewerCookie);
    await api("/staff/" + viewerId, "DELETE");
    await api("/customers/" + cid, "DELETE");
    assert.equal((await snapshot()).customers.find(x => x.id === cid).active, 0);

    // Order cancellation still keeps historical documents.
    await api("/customer-orders/" + co2n, "DELETE");
    assert.equal((await snapshot()).orders.find(x => x.n === co2n).status, "Cancelled");
    await api("/logout", "POST");
    await api("/all", "GET", undefined, 401);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
