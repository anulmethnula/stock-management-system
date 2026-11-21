import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { buildPOTemplate, buildInventoryTemplate, buildGRNTemplate } from "../server/po-excel.js";

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

    // PO Excel must download before any suppliers, categories, or products exist.
    const emptyPOTemplate=await fetch(root+"/po-template.xlsx",{headers:{Cookie:cookie}});
    assert.equal(emptyPOTemplate.status,200);
    assert.match(emptyPOTemplate.headers.get("content-type")||"",/spreadsheetml/);
    const emptyPOBuffer=Buffer.from(await emptyPOTemplate.arrayBuffer());
    assert.equal(emptyPOBuffer.readUInt32LE(0),0x04034b50);
    assert.ok(emptyPOBuffer.includes(Buffer.from("Order Quantity")));

    const a = await idOf("/branches", "id", { name: "Supun Branch A", contact: "Manager A", phone: "077000001", phone2: "071000001", location: "Colombo", notes: "Open weekdays", supplier_type: "internal" });
    const b = await idOf("/branches", "id", { name: "External Supplier B", contact: "Manager B", phone: "077000002", location: "Galle", supplier_type: "external" });
    await api("/branches/" + a, "PUT", { name: "Supun Central", contact: "Manager A", phone: "077000001", phone2: "071000001", location: "Colombo", notes: "Use rear entrance", supplier_type: "internal", active: 1 });
    const cid = await idOf("/customers", "id", { name: "Test Customer Ltd", contact: "Buyer", phone: "077999999", phone2: "071999999", address: "Office", notes: "Call before delivery", customer_type: "external" });
    // Categories must come from users or their uploaded Excel, not demo defaults.
    assert.equal((await snapshot()).categories.length,0);
    await idOf("/categories","id",{name:"Packaging"});
    const pid = await idOf("/products", "id", { name: "Paper Box", sku: "BOX-001", category: "Packaging", emoji: "📦", sid: a, unit: "boxes",
      cost: 100, sell: 150, stock: 0, reorder: 5 });
    await api("/products","POST",{name:"Paper Box",sku:"BOX-002",category:"Packaging",sid:a,unit:"boxes",cost:100,sell:150,stock:0,reorder:5},409);
    await api("/products","POST",{name:"Missing Code",sku:"",category:"Packaging",sid:a,unit:"pieces",cost:1,sell:2,stock:0,reorder:1},400);
    await api("/adjustments","POST",{pid,change:4,reason:"Prepare edit stock guard test"});
    await api("/products/"+pid,"PUT",{name:"Paper Box",sku:"BOX-001",category:"Packaging",emoji:"📦",sid:a,unit:"boxes",cost:110,sell:165,stock:999,reorder:6,active:1});
    assert.equal((await snapshot()).products.find(x=>x.id===pid).stock,4,"editing item details must not change stock");
    await api("/adjustments","POST",{pid,change:-4,reason:"Restore test opening stock"});
    // Categories persist, reject case-insensitive duplicates, and cannot be archived while assigned.
    let categorySnapshot=await snapshot();
    const packaging=categorySnapshot.categories.find(x=>x.name==="Packaging");
    assert.ok(packaging);
    await api("/categories/"+packaging.id,"PUT",{name:"Packaging",active:0},409);
    const categoryId=await idOf("/categories","id",{name:"Consumables"});
    await api("/categories","POST",{name:"consumables"},409);
    await api("/categories/"+categoryId,"PUT",{name:"Factory Consumables",active:1});
    categorySnapshot=await snapshot();
    assert.ok(categorySnapshot.categories.some(x=>x.id===categoryId&&x.name==="Factory Consumables"));
    await api("/categories/"+categoryId,"PUT",{name:"Factory Consumables",active:0});
    await api("/categories/"+categoryId,"PUT",{name:"Factory Consumables",active:1});
    // One reusable Items bulk template: create, change final count, block double import.
    const inventoryFile=buildInventoryTemplate([{
      id:"10095",sku:"BULK-AC",name:"CAMY Test AC",category:"Air Conditioners",
      supplierName:"Supun Central",unit:"pieces",stock:12,cost:900,sell:1200
    }]);
    const inventoryDownload=await fetch(root+"/inventory-template.xlsx",{headers:{Cookie:cookie}});
    assert.equal(inventoryDownload.status,200);
    assert.match(inventoryDownload.headers.get("content-type")||"",/spreadsheetml/);
    const currentFile=Buffer.from(await inventoryDownload.arrayBuffer());
    assert.equal(currentFile.readUInt32LE(0),0x04034b50);
    const previewExcel=async book=>{
      const response=await fetch(root+"/inventory-import/preview",{
        method:"POST",headers:{Cookie:cookie,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:book
      });
      const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
      return result;
    };
    const firstPreview=await previewExcel(inventoryFile);
    assert.equal(firstPreview.canCommit,true);
    assert.equal(firstPreview.summary.newCount,1);
    assert.equal(firstPreview.summary.categoryCount,1);
    assert.equal((await snapshot()).products.some(x=>x.sku==="BULK-AC"),false);
    const legacyIdPreview=await previewExcel(buildInventoryTemplate([{
      id:987654,sku:"LEGACY-ID-01",name:"Legacy ID Product",category:"Air Conditioners",
      supplierName:"Supun Central",unit:"pieces",stock:3,cost:10,sell:20
    }]));
    assert.equal(legacyIdPreview.errors.length,0);
    assert.equal(legacyIdPreview.summary.newCount,1);
    const done=(await api("/inventory-import/commit","POST",{token:firstPreview.token,confirm:true})).data;
    assert.match(done.code,/^BULK-/);
    let bulkState=await snapshot();
    const bulkItem=bulkState.products.find(x=>x.sku==="BULK-AC");
    assert.equal(bulkItem.productId,"10095");
    assert.equal(bulkItem.stock,12);
    assert.equal(bulkState.categories.find(x=>x.name==="Air Conditioners").active,1);
    const reusedCategory=await previewExcel(buildInventoryTemplate([{
      id:"10095",sku:"BULK-AC",name:"CAMY Test AC",category:"  air   conditioners  ",
      supplierName:"Supun Central",unit:"pieces",stock:12,cost:900,sell:1200
    }]));
    assert.equal(reusedCategory.summary.categoryCount,0);
    assert.equal(reusedCategory.rows[0].category,"Air Conditioners");
    assert.equal(reusedCategory.rows[0].action,"unchanged");
    const twice=await previewExcel(inventoryFile);
    assert.equal(twice.summary.newCount,0);
    assert.equal(twice.summary.updateCount,0);
    assert.equal(twice.canCommit,true);
    assert.equal(twice.errors.length,0);
    assert.ok(twice.summary.archiveEligible>=1);
    assert.equal((await snapshot()).products.find(x=>x.id===pid).active,1);
    // Existing-product quantities are final physical counts.
    await api("/adjustments","POST",{pid:bulkItem.id,change:2,reason:"Later stock movement"});
    const additionFile=buildInventoryTemplate([{
      id:bulkItem.productId,sku:"BULK-AC",name:"CAMY Air Conditioner",category:"Air Conditioners",
      supplierName:"Supun Central",unit:"pieces",stock:3,cost:900,sell:1200
    }]);
    const addition=await previewExcel(additionFile);
    assert.equal(addition.canCommit,true);
    assert.equal(addition.summary.stockDelta,-11);
    assert.equal(addition.rows[0].finalStock,3);
    await api("/inventory-import/commit","POST",{token:addition.token,confirm:true});
    assert.equal((await snapshot()).products.find(x=>x.id===bulkItem.id).stock,3);
    await api("/products","POST",{name:"Duplicate SKU",sku:"bulk-ac",category:"Packaging",sid:a,unit:"pieces",cost:1,stock:0},409);
    const changedFile=buildInventoryTemplate([{
      id:bulkItem.productId,sku:"BULK-AC",name:"CAMY Updated AC",category:"Appliances",
      supplierName:"Supun Central",unit:"pieces",stock:3,cost:800,sell:1250
    }]);
    const stale=await previewExcel(changedFile);
    await api("/adjustments","POST",{pid:bulkItem.id,change:1,reason:"Stock changed after preview"});
    await api("/inventory-import/commit","POST",{token:stale.token,confirm:true},409);
    await api("/adjustments","POST",{pid:bulkItem.id,change:-1,reason:"Restore original physical count"});
    const corrected=await previewExcel(changedFile);
    assert.equal(corrected.summary.updateCount,1);
    assert.equal(corrected.summary.stockDelta,0);
    await api("/inventory-import/commit","POST",{token:corrected.token,confirm:true});
    bulkState=await snapshot();
    assert.equal(bulkState.products.find(x=>x.id===bulkItem.id).name,"CAMY Updated AC");
    assert.equal(bulkState.products.find(x=>x.id===bulkItem.id).stock,3);
    assert.equal(bulkState.products.find(x=>x.id===bulkItem.id).cost,800);
    assert.equal(bulkState.categories.find(x=>x.name==="Appliances").active,1);
    assert.equal(bulkState.products.filter(x=>x.sku?.toLowerCase()==="bulk-ac").length,1);
    assert.equal(bulkState.movements.filter(x=>x.reference===done.code).length,1);
    // Two rows that point to one existing product under different keys MUST
    // not apply two separate quantity changes.
    const aliases=await previewExcel(buildInventoryTemplate([
      {id:bulkItem.productId,sku:"BULK-AC",name:"CAMY Updated AC",category:"Appliances",
       supplierName:"Supun Central",unit:"pieces",stock:16,cost:800,sell:1250},
      {id:"",sku:"BULK-AC",name:"CAMY Similar AC",category:"Appliances",
       supplierName:"Supun Central",unit:"pieces",stock:25,cost:800,sell:1250}
    ]));
    assert.equal(aliases.canCommit,true);
    assert.equal(aliases.summary.rejectedCount,1);
    assert.match(aliases.errors.join(" "),/Product ID is required/);
    assert.equal((await snapshot()).products.find(x=>x.id===bulkItem.id).stock,3);
    const missingSupplier=await previewExcel(buildInventoryTemplate([{
      id:"BAD-SUPPLIER-PID",sku:"BAD-SUPPLIER",name:"Unknown Supplier Item",category:"Other",
      supplierName:"Not In System",unit:"pieces",stock:5,cost:10,sell:20
    }]));
    assert.equal(missingSupplier.canCommit,true);
    assert.equal(missingSupplier.errors.length,0);
    assert.equal(missingSupplier.summary.supplierCount,1);
    assert.deepEqual(missingSupplier.summary.suppliers,["Not In System"]);

    // Quote -> recorded customer approval -> exactly one CO, with prices preserved.
    const expiry=new Date();expiry.setDate(expiry.getDate()+14);
    const validUntil=[expiry.getFullYear(),String(expiry.getMonth()+1).padStart(2,"0"),String(expiry.getDate()).padStart(2,"0")].join("-");
    await api("/quotations","POST",{cid,items:[{pid,qty:1,price:0}],valid_until:validUntil},400);
    const inventorySellingPrice=(await snapshot()).products.find(x=>x.id===pid).sell;
    const inventoryBuyingPrice=(await snapshot()).products.find(x=>x.id===pid).cost;
    assert.notEqual(inventorySellingPrice,inventoryBuyingPrice);
    const qtCode=await idOf("/quotations","code",{
      cid,items:[{pid,qty:4}],valid_until:validUntil,note:"Offer valid for 14 days"
    });
    let qSnapshot=await snapshot();
    assert.equal(qSnapshot.products.find(x=>x.id===pid).stock,0);
    assert.equal(qSnapshot.quotations[0].id,qtCode);
    assert.equal(qSnapshot.quotations[0].status,"Draft");
    assert.equal(qSnapshot.quotations[0].items[0].price,inventorySellingPrice);
    const qtN=qSnapshot.quotations[0].n;
    await api("/quotations/"+qtN+"/convert","POST",{},409);
    await api("/quotations/"+qtN,"PUT",{
      cid,items:[{pid,qty:6,price:180}],valid_until:validUntil,note:"Final offer"
    });
    await api("/quotations/"+qtN+"/status","POST",{status:"Approved",note:"Cannot approve an unsent quote"},409);
    await api("/quotations/"+qtN+"/status","POST",{status:"Sent"});
    await api("/quotations/"+qtN,"PUT",{cid,items:[{pid,qty:1,price:150}],valid_until:validUntil},409);
    await api("/quotations/"+qtN+"/status","POST",{status:"Approved",note:"Customer accepted by email"});
    const conversion=(await api("/quotations/"+qtN+"/convert","POST",{})).data;
    qSnapshot=await snapshot();
    const converted=qSnapshot.orders.find(x=>x.id===conversion.code);
    assert.ok(converted);
    assert.equal(converted.items[0].qty,6);
    assert.equal(converted.items[0].price,180);
    assert.equal(qSnapshot.products.find(x=>x.id===pid).stock,0);
    assert.equal(qSnapshot.quotations[0].status,"Converted");
    assert.equal(qSnapshot.quotations[0].convertedN,converted.n);
    assert.deepEqual(qSnapshot.quotations[0].actions.map(x=>x.action),
      ["Created","Edited","Sent","Approved","Converted"]);
    await api("/quotations/"+qtN+"/convert","POST",{},409);
    await api("/customer-orders/"+converted.n,"PUT",{cid,items:[{pid,qty:3,price:2}]},409);
    const rejectedCode=await idOf("/quotations","code",{cid,items:[{pid,qty:1,price:120}],valid_until:validUntil});
    const rejectedN=(await snapshot()).quotations.find(x=>x.id===rejectedCode).n;
    await api("/quotations/"+rejectedN+"/status","POST",{status:"Sent"});
    await api("/quotations/"+rejectedN+"/status","POST",{status:"Rejected",note:"Customer did not accept"});
    await api("/quotations/"+rejectedN+"/convert","POST",{},409);
    await api("/quotations","POST",{cid,items:[{pid,qty:2,price:100}],valid_until:"2020-01-01"},400);
    // Excel template download is protected, and upload previews a PO without creating it.
    const templateResponse=await fetch(root+"/po-template",{headers:{Cookie:cookie}});
    assert.equal(templateResponse.status,200);
    assert.match(templateResponse.headers.get("content-type")||"",/spreadsheetml/);
    const templateBuffer=Buffer.from(await templateResponse.arrayBuffer());
    assert.equal(templateBuffer.readUInt32LE(0),0x04034b50);
    assert.ok(templateBuffer.includes(Buffer.from("Appliances")), "PO template must include the latest category assigned by inventory import");
    assert.ok(templateBuffer.includes(Buffer.from("CAMY Updated AC")), "PO template must include products updated by stock migration");
    assert.ok(templateBuffer.includes(Buffer.from("Order Quantity")), "PO template must use the new PO-specific order quantity column");
    assert.equal((await api("/all")).data.pos.length,0);
    const fill=buildPOTemplate([{id:pid,sku:"BOX-001",name:"Paper Box",category:"Packaging",supplierName:"Supun Central",unit:"boxes",stock:0,cost:100,active:1}],{[pid]:20});
    const previewResponse=await fetch(root+"/po-import",{
      method:"POST",headers:{Cookie:cookie,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:fill
    });
    assert.equal(previewResponse.status,200);
    const preview=await previewResponse.json();
    assert.equal(preview.count,1);
    assert.deepEqual(preview.items.map(x=>({pid:x.pid,qty:x.qty,cost:x.cost})),[{pid,qty:20,cost:100}]);
    assert.equal((await api("/all")).data.pos.length,0);
    const newPOWorkbook=buildPOTemplate([{sku:"PO-NEW-001",name:"Excel PO New Item",category:"PO Created Category",unit:"sets",cost:55}],{"PO-NEW-001":6});
    const newPOResponse=await fetch(root+"/po-import",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:newPOWorkbook});
    assert.equal(newPOResponse.status,200);
    const newPOPreview=await newPOResponse.json();
    assert.equal(newPOPreview.newCount,1);
    assert.equal(newPOPreview.items[0].isNew,true);
    // A product's usual branch A does not prevent requesting it from branch B.
    const poCode = await idOf("/pos", "code", { sid: b, items: preview.items, newItems:newPOPreview.items });
    const poN = (await snapshot()).pos.find(x => x.id === poCode).n;
    const poCreatedProduct=(await snapshot()).products.find(x=>x.sku==="PO-NEW-001");
    assert.ok(poCreatedProduct);
    assert.equal(poCreatedProduct.stock,0);
    assert.equal(poCreatedProduct.sid,b);
    assert.ok((await snapshot()).categories.some(x=>x.name==="PO Created Category"));
    // A PO can be edited before receiving starts.
    await api("/pos/" + poN, "PUT", { sid: b, items: [{ pid, qty: 20, cost: 105 }] });
    assert.equal((await snapshot()).pos.find(x => x.n === poN).items[0].cost, 105);
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 0);
    const grnDownload=await fetch(root+"/pos/"+poN+"/grn-template",{headers:{Cookie:cookie}});
    assert.equal(grnDownload.status,200);
    assert.match(grnDownload.headers.get("content-type")||"",/spreadsheetml/);
    assert.ok(Buffer.from(await grnDownload.arrayBuffer()).includes(Buffer.from("Receive Now")));
    const firstGRNWorkbook=buildGRNTemplate({code:poCode},[
      {id:pid,sku:"BOX-001",name:"Paper Box",category:"Packaging",unit:"boxes",ordered:20,received:0}
    ],{[pid]:12});
    const grnExcelPreview=async book=>{
      const response=await fetch(root+"/pos/"+poN+"/grn-import",{method:"POST",
        headers:{Cookie:cookie,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:book});
      const data=await response.json();return {status:response.status,data};
    };
    const firstGRNPreview=await grnExcelPreview(firstGRNWorkbook);
    assert.equal(firstGRNPreview.status,200,JSON.stringify(firstGRNPreview.data));
    assert.deepEqual(firstGRNPreview.data.lines,[{pid,qty:12}]);
    assert.equal((await snapshot()).products.find(x=>x.id===pid).stock,0);
    await api("/pos/" + poN + "/receive", "POST", { lines: firstGRNPreview.data.lines, by: "Store clerk" });
    let snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 12);
    assert.equal(snap.pos.find(x => x.n === poN).status, "Part received");
    await api("/pos/" + poN, "PUT", { sid: b, items: [{ pid, qty: 20, cost: 105 }] }, 409);
    const firstGrn = snap.grns[0].n;
    assert.equal((await grnExcelPreview(firstGRNWorkbook)).status,422);
    const secondGRNWorkbook=buildGRNTemplate({code:poCode},[
      {id:pid,sku:"BOX-001",name:"Paper Box",category:"Packaging",unit:"boxes",ordered:20,received:12}
    ],{[pid]:8});
    const secondGRNPreview=await grnExcelPreview(secondGRNWorkbook);
    assert.equal(secondGRNPreview.status,200,JSON.stringify(secondGRNPreview.data));
    await api("/pos/" + poN + "/receive", "POST", { lines: secondGRNPreview.data.lines, by: "Store clerk" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 20);
    assert.equal(snap.pos.find(x => x.n === poN).status, "Received");
    const secondGrn = snap.grns[0].n;
    await api("/pos/" + poN + "/receive", "POST", { lines: [{ pid, qty: 1 }] }, 409);

    // Supplier returns are separate GRTNs: they reduce stock without changing PO receipt totals.
    const grtnCode = await idOf("/supplier-returns", "code", { grnN:firstGrn,lines:[{pid,qty:2}],reasonType:"damaged",note:"Damaged in transit",by:"Store clerk" });
    snap=await snapshot();
    assert.match(grtnCode,/^GRTN-/);
    assert.equal(snap.products.find(x=>x.id===pid).stock,18);
    assert.equal(snap.pos.find(x=>x.n===poN).items[0].received,20);
    assert.equal(snap.supplierReturns[0].grnN,firstGrn);
    await api("/supplier-returns","POST",{grnN:firstGrn,lines:[{pid,qty:11}],reasonType:"defective"},409);
    await api("/grns/"+firstGrn+"/reverse","POST",{reason:"Wrong receipt"},409);
    await api("/supplier-returns/"+snap.supplierReturns[0].n+"/reverse","POST",{reason:"Supplier return cancelled"});
    assert.equal((await snapshot()).products.find(x=>x.id===pid).stock,20);

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

    await api("/returns", "POST", { deliveryN: dN1, lines: [{ pid, qty: 2, condition:"sellable" }], note: "Wrong packaging" });
    snap = await snapshot();
    assert.equal(snap.products.find(x => x.id === pid).stock, 7);
    await api("/returns", "POST", { deliveryN: dN1, lines: [{ pid, qty: 9 }], note: "Too many" }, 409);
    await api("/deliveries/" + dN1 + "/reverse", "POST", { reason: "Wrong delivery" }, 409);
    await api("/returns/" + snap.returns[0].n + "/reverse", "POST", { reason: "Corrected return" });
    assert.equal((await snapshot()).products.find(x => x.id === pid).stock, 5);
    // Damaged and uninspected items never increase dispatchable stock.
    await api("/returns","POST",{deliveryN:dN1,lines:[{pid,qty:1}],note:"Condition missing"},400);
    const damaged=await idOf("/returns","code",{deliveryN:dN1,lines:[{pid,qty:3,condition:"quarantine"}],note:"Broken items"});
    snap=await snapshot();
    assert.equal(snap.products.find(x=>x.id===pid).stock,5);
    assert.equal(snap.products.find(x=>x.id===pid).damagedStock,3);
    assert.equal(snap.returns.find(x=>x.id===damaged).lines[0].condition,"quarantine");
    await api("/customer-orders/"+co2n+"/dispatch","POST",{lines:[{pid,qty:6}]},409);
    await api("/returns/"+snap.returns.find(x=>x.id===damaged).n+"/reverse","POST",{reason:"Return counting mistake"});
    assert.equal((await snapshot()).products.find(x=>x.id===pid).damagedStock,0);
    await api("/returns","POST",{deliveryN:dN1,lines:[{pid,qty:3,condition:"quarantine"}],note:"Damaged items"});
    await api("/quarantine","POST",{pid,mode:"release",qty:1,reason:"Passed inspection"});
    await api("/quarantine","POST",{pid,mode:"dispose",qty:2,reason:"Scrapped after inspection"});
    await api("/quarantine","POST",{pid,mode:"release",qty:1,reason:"Nothing left"},409);
    snap=await snapshot();
    assert.equal(snap.products.find(x=>x.id===pid).stock,6);
    assert.equal(snap.products.find(x=>x.id===pid).damagedStock,0);
    await api("/quarantine","POST",{pid,mode:"hold",qty:1,reason:"Damage found in warehouse"});
    assert.equal((await snapshot()).products.find(x=>x.id===pid).stock,5);
    await api("/quarantine","POST",{pid,mode:"dispose",qty:1,reason:"Scrapped"});
    assert.equal((await snapshot()).products.find(x=>x.id===pid).damagedStock,0);
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
    assert.ok(snap.movements.some(x => x.type === "Supplier return" && x.qty < 0));
    assert.ok(snap.movements.some(x => x.type === "Supplier return reversed" && x.qty > 0));
    assert.ok(snap.movements.some(x => x.type === "Stock correction"));

    // Custom permissions hide unapproved modules and block edits at the API.
    const restrictedPermissions = { dashboard:"none", products:"none", suppliers:"view", customers:"none", purchase_orders:"none", goods_received:"none", customer_orders:"none", deliveries:"none", stock_history:"none" };
    const restrictedId = await idOf("/staff", "id", { username:"supplier-reader", password:"RestrictedPassword#123", role:"staff", permissions:restrictedPermissions });
    const restrictedLogin = await api("/login", "POST", { username:"supplier-reader", password:"RestrictedPassword#123" });
    const restrictedCookie = restrictedLogin.response.headers.get("set-cookie")?.split(";")[0];
    const restrictedData = (await api("/all", "GET", undefined, 200, restrictedCookie)).data;
    assert.ok(restrictedData.branches.length > 0);
    assert.equal(restrictedData.products.length, 0);
    assert.equal(restrictedData.quotations.length,0);
    await api("/quotations","POST",{cid,items:[{pid,qty:1,price:120}],valid_until:validUntil},403,restrictedCookie);
    await api("/branches", "POST", { name:"Forbidden supplier" }, 403, restrictedCookie);
    await api("/po-template", "GET", undefined, 403, restrictedCookie);
    await api("/po-import", "POST", {}, 403, restrictedCookie);
    await api("/stock-history","GET",undefined,403,restrictedCookie);
    await api("/adjustments","POST",{pid,change:1,reason:"Unauthorized"},403,restrictedCookie);
    await api("/staff/" + restrictedId, "DELETE");
    const inventoryEditor=await idOf("/staff","id",{username:"inventory-editor",password:"InventoryPassword#123",role:"staff",permissions:{products:"edit",dashboard:"view"}});
    const editorLogin=await api("/login","POST",{username:"inventory-editor",password:"InventoryPassword#123"});
    const editorCookie=editorLogin.response.headers.get("set-cookie")?.split(";")[0];
    await api("/adjustments","POST",{pid,change:1,reason:"Unauthorized"},403,editorCookie);
    await api("/quarantine","POST",{pid,mode:"hold",qty:1,reason:"Unauthorized"},403,editorCookie);
    await api("/products","POST",{name:"Unauthorized stock",sku:"NO-STOCK-PERM",sid:a,category:"Packaging",unit:"pieces",cost:0,stock:1},403,editorCookie);
    const editorData=(await api("/all","GET",undefined,200,editorCookie)).data;
    assert.ok(editorData.dashboardCounts);
    assert.equal(editorData.movements.length,0);
    assert.ok(editorData.dashboardChart.length>0);
    await api("/staff/"+inventoryEditor,"DELETE");

    const viewerId = await idOf("/staff", "id", { username: "viewer", password: "ViewerPassword#123", role: "viewer",permissions:{suppliers:"edit",stock_adjustments:"edit",stock_history:"view"} });
    const viewerLogin = await api("/login", "POST", { username: "viewer", password: "ViewerPassword#123" });
    const viewerCookie = viewerLogin.response.headers.get("set-cookie")?.split(";")[0];
    await api("/all", "GET", undefined, 200, viewerCookie);
    await api("/branches", "POST", { name: "Should fail" }, 403, viewerCookie);
    await api("/quotations","POST",{cid,items:[{pid,qty:1,price:150}],valid_until:validUntil},403,viewerCookie);
    await api("/staff/" + viewerId, "DELETE");
    await api("/customers/" + cid, "DELETE");
    assert.equal((await snapshot()).customers.find(x => x.id === cid).active, 0);

    // Full paginated history and Colombo midnight boundary (UTC+05:30).
    const auditDb=new DatabaseSync(path.join(temp,"test.sqlite"));
    try {
      const ins=auditDb.prepare("INSERT INTO stock_movements(product_id,qty_change,event_type,reference,created_at) VALUES(?,0,'Stock correction',?,?)");
      auditDb.exec("BEGIN IMMEDIATE");
      ins.run(pid,"MIDNIGHT_BEFORE","2025-01-31 18:29:59");
      ins.run(pid,"MIDNIGHT_AFTER","2025-01-31 18:30:00");
      for(let i=0;i<1010;i++)ins.run(pid,"PAGING-"+i,"2025-02-01 00:00:00");
      auditDb.exec("COMMIT");
      const day=(await api("/stock-history?from=2025-02-01&to=2025-02-01&pid="+pid)).data;
      assert.equal(day.totals.records,1011);
      assert.equal(day.rows.length,10);
      const last=(await api("/stock-history?from=2025-02-01&to=2025-02-01&pid="+pid+"&page=102")).data;
      assert.equal(last.rows[0].reference,"MIDNIGHT_AFTER");
      assert.match(last.rows[0].at,/^2025-02-01 00:00:00/);
      const prior=(await api("/stock-history?from=2025-01-31&to=2025-01-31&pid="+pid)).data;
      assert.equal(prior.rows[0].reference,"MIDNIGHT_BEFORE");
      const full=await snapshot();
      assert.equal(full.reportMovements.length,0,"Full movement history should not load on every page.");
      const stockReport=(await api("/reports/stock-summary?pid="+pid)).data;
      const reportRow=stockReport.rows[0];
      assert.equal(reportRow[7],full.products.find(x=>x.id===pid).stock,"Stock report closing available matches actual stock.");
      assert.equal(reportRow[10],full.products.find(x=>x.id===pid).damagedStock,"Stock report quarantine matches actual.");
      const movementReport=(await api("/reports/movements?pid="+pid+"&from=2025-02-01&to=2025-02-01")).data;
      assert.equal(movementReport.totalRecords,1011);
      assert.equal(movementReport.rows.length,200);
      assert.ok(movementReport.totalPages>1);
      const movExcel=await fetch(root+"/reports/movements.xlsx?pid="+pid,{headers:{Cookie:cookie}});
      assert.equal(movExcel.status,200);
      assert.match(movExcel.headers.get("content-type")||"",/spreadsheetml/);
      assert.equal(Buffer.from(await movExcel.arrayBuffer()).readUInt32LE(0),0x04034b50);
      const generalExcel=await fetch(root+"/reports/xlsx",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},
        body:JSON.stringify(stockReport)});
      assert.equal(generalExcel.status,200);
      assert.equal(Buffer.from(await generalExcel.arrayBuffer()).readUInt32LE(0),0x04034b50);
    } finally {auditDb.close();}
    // Re-uploading an archived item restores the SAME row and sets the exact
    // final count, preserving the previous 930-unit history with a -920 entry.
    const restoreId=await idOf("/products","id",{
      productId:"COMPANY-RESTORE-930",name:"Archived Restore Test",sku:"RESTORE-930",category:"Packaging",sid:a,
      unit:"pieces",cost:5,sell:8,stock:930
    });
    const archiveSetupDb=new DatabaseSync(path.join(temp,"test.sqlite"));
    archiveSetupDb.prepare("UPDATE products SET active=0 WHERE id=?").run(restoreId);
    archiveSetupDb.close();
    assert.equal((await snapshot()).products.find(p=>p.id===restoreId).active,0);
    const restorePreview=await previewExcel(buildInventoryTemplate([{
      id:"COMPANY-RESTORE-930",sku:"RESTORE-930",name:"Archived Restore Test",category:"Packaging",
      supplierName:"Supun Central",unit:"pieces",stock:10,cost:5,sell:8
    }]));
    assert.equal(restorePreview.summary.newCount,0);
    assert.equal(restorePreview.summary.updateCount,1);
    assert.equal(restorePreview.summary.stockDelta,-920);
    const restoreResult=(await api("/inventory-import/commit","POST",{token:restorePreview.token,confirm:true})).data;
    const restoredState=await snapshot(),restored=restoredState.products.find(p=>p.id===restoreId);
    assert.equal(restored.active,1);
    assert.equal(restored.stock,10);
    assert.equal(restoredState.products.filter(p=>p.sku==="RESTORE-930").length,1);
    assert.ok(restoredState.movements.some(m=>m.pid===restoreId&&m.reference===restoreResult.code&&m.qty===-920));
    // Missing products can be archived only after explicit approval and only
    // when stock, quarantine and outstanding documents are all clear.
    const archiveId=await idOf("/products","id",{
      name:"Obsolete Packaging",sku:"ARCH-009",category:"Packaging",sid:a,
      unit:"pieces",cost:1,sell:2,stock:0
    });
    await api("/products/"+archiveId,"DELETE");
    const afterPermanentDelete=await snapshot();
    assert.equal(afterPermanentDelete.products.some(p=>p.id===archiveId),false);
    assert.equal(afterPermanentDelete.movements.some(m=>m.pid===archiveId),false);
    const beforeArchive=afterPermanentDelete;
    const archiveFile=buildInventoryTemplate(beforeArchive.products.filter(p=>p.active&&p.id!==archiveId&&beforeArchive.branches.find(b=>b.id===p.sid)?.active).map(p=>({
      id:p.productId||p.id,sku:p.sku,name:p.name,category:p.category,
      supplierName:beforeArchive.branches.find(b=>b.id===p.sid).name,
      unit:p.unit,stock:p.stock,cost:p.cost,sell:p.sell
    })));
    const archivePreview=await previewExcel(archiveFile);
    assert.equal(archivePreview.summary.archiveEligible,1);
    assert.equal(archivePreview.canCommit,true);
    const archiveResult=(await api("/inventory-import/commit","POST",{
      token:archivePreview.token,confirm:true,archiveMissing:true
    })).data;
    assert.equal(archiveResult.archived,1);
    assert.equal((await snapshot()).products.some(p=>p.id===archiveId),false);
    assert.equal((await snapshot()).products.find(p=>p.id===bulkItem.id).active,1);
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
