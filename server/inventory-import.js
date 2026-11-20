// Inventory bulk upload is deliberately separate from purchase receiving.
// Existing-product quantities are additive. Zero updates details only; PO → GRN
// remains the normal traceable workflow for receiving supplier goods.
import crypto from "node:crypto";
import { buildInventoryTemplate, parseInventoryUpload } from "./po-excel.js";

export function registerInventoryImportRoutes(app,h){
  const {db,express,requireEdit,run,transaction,check,changeStock,logStock}=h;
  const normalize=value=>String(value??"").trim().toLocaleLowerCase("en");
  const moneyEqual=(a,b)=>Math.abs(Number(a)-Number(b))<0.005;
  const snapshot=p=>p?{
    id:p.id,name:p.name,sku:p.sku||"",category:p.category,
    sid:p.supplier_id,unit:p.unit,stock:p.stock,cost:p.cost,
    sell:p.sale_price,active:p.active
  }:null;
  const readProduct=id=>db.prepare("SELECT * FROM products WHERE id=?").get(id);
  const toPreview=p=>({
    row:p.row,action:p.action,id:p.id||null,sku:p.sku,name:p.name,category:p.category,
    supplier:p.supplier,unit:p.unit,qty:p.qty,oldStock:p.previous?.stock??null,
    oldName:p.previous?.name??null,oldCategory:p.previous?.category??null,
    oldCost:p.previous?.cost??null,oldSell:p.previous?.sell??null,
    delta:p.qty,finalStock:(p.previous?.stock||0)+p.qty,cost:p.cost,sell:p.sell
  });
  const archiveReason=p=>{
    if(p.stock>0||p.damaged_stock>0)return "Stock must be zero (including quarantined stock)";
    const openPO=db.prepare("SELECT 1 FROM po_items pi JOIN purchase_orders po ON po.id=pi.po_id WHERE pi.product_id=? AND pi.received<pi.qty AND po.status IN ('Ordered','Part received') LIMIT 1").get(p.id);
    if(openPO)return "Item has outstanding purchase orders";
    const openOrder=db.prepare("SELECT 1 FROM customer_order_items li JOIN customer_orders co ON co.id=li.order_id WHERE li.product_id=? AND li.dispatched<li.qty AND co.status IN ('Open','Part dispatched') LIMIT 1").get(p.id);
    if(openOrder)return "Item has outstanding customer orders";
    const openQuotation=db.prepare("SELECT 1 FROM quotation_items li JOIN customer_quotations q ON q.id=li.quotation_id WHERE li.product_id=? AND q.status IN ('Draft','Sent','Approved') LIMIT 1").get(p.id);
    if(openQuotation)return "Item belongs to an open quotation";
    return null;
  };
  const authorize=requireEdit("products"),authorizeStock=requireEdit("stock_adjustments");
  app.get("/api/inventory-template",authorize,run(req=>{
    const list=db.prepare("SELECT p.id,p.sku,p.name,p.category,s.name supplierName,p.unit,p.stock,p.cost,p.sale_price sell FROM products p JOIN suppliers s ON s.id=p.supplier_id WHERE p.active=1 ORDER BY p.name COLLATE NOCASE,p.id").all();
    // JSON is used here to let the existing run wrapper handle auth errors.
    // The binary route below sends the workbook directly.
    return { count:list.length,download:"/api/inventory-template.xlsx" };
  }));
  app.get("/api/inventory-template.xlsx",authorize,(req,res)=>{
    try{
      const list=db.prepare("SELECT p.id,p.sku,p.name,p.category,s.name supplierName,p.unit,p.stock,p.cost,p.sale_price sell FROM products p JOIN suppliers s ON s.id=p.supplier_id WHERE p.active=1 ORDER BY p.name COLLATE NOCASE,p.id").all();
      const workbook=buildInventoryTemplate(list,{zeroExistingQuantity:true});
      res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition",'attachment; filename="StockEasy_Current_Stock_Migration_Bordered.xlsx"');
      res.setHeader("Cache-Control","no-store");
      res.send(workbook);
    }catch(e){console.error("Inventory template:",e);res.status(500).json({error:"Could not download the stock template."});}
  });
  app.post("/api/inventory-import/preview",authorize,authorizeStock,
    express.raw({type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",limit:"4mb"}),
    run(req=>{
      check(Buffer.isBuffer(req.body)&&req.body.length,"Upload an Excel .xlsx file.",400);
      let rows,errors;
      try{({rows,errors}=parseInventoryUpload(req.body));}
      catch(e){e.status=422;throw e;}
      const products=db.prepare("SELECT * FROM products").all(),suppliers=db.prepare("SELECT * FROM suppliers").all(),categories=db.prepare("SELECT * FROM product_categories").all();
      const byId=new Map(products.map(p=>[p.id,p]));
      const bySku=new Map();
      for(const p of products)if(p.sku){
        const key=normalize(p.sku);
        if(!bySku.has(key))bySku.set(key,[]);
        bySku.get(key).push(p);
      }
      const plan=[],seenProducts=new Map(),newCategories=new Set(),newSuppliers=new Set(),canonicalCategories=new Map(categories.map(c=>[normalize(c.name),c.name]));
      for(const row of rows){
        const matches=suppliers.filter(s=>normalize(s.name)===normalize(row.supplier));
        const supplierMatch=matches.find(s=>s.active===1)||matches[0]||null;
        if(!supplierMatch||supplierMatch.active!==1)newSuppliers.add(row.supplier);
        // Product IDs from legacy systems are only references. If an ID is not
        // known in StockEasy, match by Item Code or create a new local product.
        const matchById=row.id?byId.get(row.id):null;
        const skuMatches=row.sku?bySku.get(normalize(row.sku))||[]:[];
        if(skuMatches.length>1){errors.push("Row "+row.row+": Existing Item Code '"+row.sku+"' is duplicated in StockEasy. Resolve it first.");continue;}
        if(matchById&&skuMatches.length&&skuMatches[0].id!==matchById.id){errors.push("Row "+row.row+": Product ID and Item Code belong to different products.");continue;}
        const p=matchById||skuMatches[0]||null;
        // Different Excel rows can still refer to the SAME saved product via
        // Product ID on one row and Item Code on another. Never apply both.
        if(p&&seenProducts.has(p.id)){
          errors.push("Row "+row.row+": This is the same saved item as row "+seenProducts.get(p.id)+" (Product ID "+p.id+"). Remove the duplicate row.");
          continue;
        }
        if(p)seenProducts.set(p.id,row.row);
        const cat=categories.find(c=>normalize(c.name)===normalize(row.category));
        const categoryName=canonicalCategories.get(normalize(row.category))||row.category;
        canonicalCategories.set(normalize(row.category),categoryName);
        if(!cat)newCategories.add(categoryName);
        const previous=snapshot(p);
        const changed=!previous||p.name!==row.name||(p.sku||"")!==row.sku||p.category!==categoryName||
          p.supplier_id!==supplierMatch?.id||p.unit!==row.unit||row.qty>0||
          !moneyEqual(p.cost,row.cost)||!moneyEqual(p.sale_price,row.sell)||p.active!==1;
        const action=!p?"new":changed?"update":"unchanged";
        plan.push({...row,category:categoryName,id:p?.id||null,previous,sid:supplierMatch?.id||null,action});
      }
      const missing=products.filter(p=>p.active===1&&!seenProducts.has(p.id)).map(p=>{
        const reason=archiveReason(p);
        return {id:p.id,name:p.name,sku:p.sku||"",stock:p.stock,damagedStock:p.damaged_stock,eligible:!reason,reason,previous:snapshot(p)};
      });
      // Fingerprint uploaded values (not current stock) so an identical additive
      // sheet can never increase inventory twice.
      const fingerprint=crypto.createHash("sha256")
        .update(JSON.stringify({mode:"additive-stock-v1",rows})).digest("hex");
      const duplicate=db.prepare("SELECT id FROM inventory_import_batches WHERE fingerprint=?").get(fingerprint);
      if(duplicate)errors.push("This exact inventory data has already been imported (batch #"+duplicate.id+"). Download a fresh template for another update.");
      const summary={
        rows:rows.length,newCount:plan.filter(x=>x.action==="new").length,
        updateCount:plan.filter(x=>x.action==="update").length,
        unchangedCount:plan.filter(x=>x.action==="unchanged").length,
        categoryCount:newCategories.size,categories:[...newCategories],supplierCount:newSuppliers.size,suppliers:[...newSuppliers],
        missingCount:missing.length,archiveEligible:missing.filter(x=>x.eligible).length,archiveBlocked:missing.filter(x=>!x.eligible).length,
        rejectedCount:errors.length,totalQty:plan.reduce((n,x)=>n+x.qty,0),stockDelta:plan.reduce((n,x)=>n+x.qty,0)
      };
      let token=null;
      // Row errors do not discard valid rows. Staff can import the valid rows,
      // then upload only the corrected rejected rows in a later sheet.
      if(!duplicate&&summary.newCount+summary.updateCount+summary.archiveEligible>0){
        token=crypto.randomBytes(24).toString("hex");
        db.prepare("DELETE FROM inventory_import_previews WHERE expires_at<?").run(Date.now());
        db.prepare("INSERT INTO inventory_import_previews(token,staff_id,fingerprint,plan_json,expires_at) VALUES(?,?,?,?,?)")
          .run(token,req.user.id,fingerprint,JSON.stringify({items:plan,missing}),Date.now()+20*60*1000);
      }else if(!errors.length)errors.push("All values already match current StockEasy records. No changes to import.");
      return {token,summary,rows:plan.map(toPreview),missing:missing.map(({previous,...rest})=>rest),errors,canCommit:!!token};
    })
  );
  app.post("/api/inventory-import/commit",authorize,authorizeStock,run(req=>transaction(()=>{
    check(req.body?.confirm===true,"Review the changes and confirm before importing.",400);
    const token=String(req.body?.token||"");
    check(/^[a-f0-9]{48}$/.test(token),"Your upload preview has expired. Upload again.",409);
    const preview=db.prepare("SELECT * FROM inventory_import_previews WHERE token=? AND staff_id=?").get(token,req.user.id);
    check(preview&&preview.expires_at>Date.now(),"Upload preview has expired. Upload the file again.",409);
    check(!db.prepare("SELECT 1 FROM inventory_import_batches WHERE fingerprint=?").get(preview.fingerprint),
      "This Excel data has already been imported. Upload a new file.",409);
    const {items:plan,missing=[]}=JSON.parse(preview.plan_json);
    const archiveMissing=req.body?.archiveMissing===true;
    check(plan.length>0||archiveMissing&&missing.length>0,"No items to import.");
    check(!archiveMissing||missing.some(p=>p.eligible),"No eligible missing items can be archived.",409);
    check(plan.some(p=>p.action!=="unchanged")||archiveMissing,
      "No changes selected. Confirm the safe archive option or upload changed rows.",400);
    // Missing or inactive suppliers from Excel are created/reactivated inside
    // this transaction. No separate supplier setup is required before import.
    for(const item of plan){
      let supplier=db.prepare("SELECT id,name,active FROM suppliers WHERE name=? COLLATE NOCASE ORDER BY active DESC,id LIMIT 1").get(item.supplier);
      if(!supplier){
        const id=db.prepare("INSERT INTO suppliers(name,supplier_type) VALUES(?,'external')").run(item.supplier).lastInsertRowid;
        supplier={id,name:item.supplier,active:1};
      }else if(!supplier.active){
        db.prepare("UPDATE suppliers SET active=1 WHERE id=?").run(supplier.id);
        supplier={...supplier,active:1};
      }
      item.sid=supplier.id;
    }
    // Re-check the entire preview within the same SQL transaction before any write.
    for(const item of plan){
      if(item.previous){
        const current=snapshot(readProduct(item.id));
        check(JSON.stringify(current)===JSON.stringify(item.previous),
          "StockEasy has changed since preview. Upload the file again before confirming.",409);
      }else{
        check(!db.prepare("SELECT 1 FROM products WHERE sku=? COLLATE NOCASE").get(item.sku),
          "Item Code "+item.sku+" now exists. Upload again.",409);
      }
    }
    if(archiveMissing){
      for(const item of missing.filter(x=>x.eligible)){
        const product=readProduct(item.id);
        check(JSON.stringify(snapshot(product))===JSON.stringify(item.previous)
          &&product.active===1&&!archiveReason(product),
          "Missing item "+item.name+" has changed or is now needed by an open document. Upload and preview again.",409);
      }
    }
    const changed=plan.filter(p=>p.action!=="unchanged");
    const created=changed.filter(p=>p.action==="new").length,updated=changed.length-created;
    const delta=changed.reduce((n,p)=>n+p.qty,0);
    const archived=archiveMissing?missing.filter(x=>x.eligible):[];
    const batchId=db.prepare("INSERT INTO inventory_import_batches(fingerprint,staff_id,new_count,updated_count,stock_delta,details_json) VALUES(?,?,?,?,?,?)")
      .run(preview.fingerprint,req.user.id,created,updated,delta,JSON.stringify([...changed.map(p=>({...toPreview(p),before:p.previous})),...archived.map(p=>({id:p.id,name:p.name,action:"archive",before:p.previous}))])).lastInsertRowid;
    const reference="BULK-"+String(batchId).padStart(4,"0");
    const ensureCategory=db.prepare("SELECT id,name,active FROM product_categories WHERE name=? COLLATE NOCASE");
    for(const item of changed){
      const found=ensureCategory.get(item.category);
      if(!found)db.prepare("INSERT INTO product_categories(name) VALUES(?)").run(item.category);
      else if(!found.active)db.prepare("UPDATE product_categories SET active=1 WHERE id=?").run(found.id);
      if(item.action==="new"){
        const p=db.prepare("INSERT INTO products(name,sku,category,emoji,supplier_id,unit,cost,sale_price,stock,reorder) VALUES(?,?,?,'📦',?,?,?,?,?,5)")
          .run(item.name,item.sku,item.category,item.sid,item.unit,item.cost,item.sell,item.qty).lastInsertRowid;
        logStock(p,item.qty,"Opening balance",reference,"Initial stock imported from reviewed Excel",req.user.username);
      }else{
        db.prepare("UPDATE products SET name=?,sku=?,category=?,supplier_id=?,unit=?,cost=?,sale_price=?,active=1 WHERE id=?")
          .run(item.name,item.sku||null,item.category,item.sid,item.unit,item.cost,item.sell,item.id);
        if(item.qty){changeStock(item.id,item.qty);logStock(item.id,item.qty,"Bulk stock addition",reference,
          "Added "+item.qty+" units from reviewed Excel; previous stock "+item.previous.stock,req.user.username);}
      }
    }
    for(const item of archived){
      db.prepare("UPDATE products SET active=0 WHERE id=?").run(item.id);
      logStock(item.id,0,"Item archived",reference,"Explicitly archived because item was missing from an approved complete inventory list",req.user.username);
    }
    // Hide unused factory demo categories, but never remove categories still in use.
    for(const category of ["Helmets","Electrical","Safety gear","Raw materials","Packaging","Tools","Other"]){
      const existing=ensureCategory.get(category);
      if(existing&&!db.prepare("SELECT 1 FROM products WHERE category=? COLLATE NOCASE LIMIT 1").get(category))
        db.prepare("UPDATE product_categories SET active=0 WHERE id=?").run(existing.id);
    }
    db.prepare("DELETE FROM inventory_import_previews WHERE token=?").run(token);
    return {ok:true,code:reference,created,updated,archived:archived.length,stockDelta:delta};
  })));
}
