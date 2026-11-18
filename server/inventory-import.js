// Inventory bulk upload is deliberately separate from purchase receiving.
// It sets an absolute physical stock count; PO → GRN remains the only way to
// book newly received supplier goods.
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
    delta:p.qty-(p.previous?.stock||0),cost:p.cost,sell:p.sell
  });
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
      const workbook=buildInventoryTemplate(list);
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
      const plan=[],newCategories=new Set(),canonicalCategories=new Map(categories.map(c=>[normalize(c.name),c.name]));
      for(const row of rows){
        const matches=suppliers.filter(s=>normalize(s.name)===normalize(row.supplier));
        if(matches.length!==1||!matches[0].active){
          errors.push("Row "+row.row+": Supplier / Branch '"+row.supplier+"' must match one active supplier saved in StockEasy.");continue;
        }
        const matchById=row.id?byId.get(row.id):null;
        if(row.id&&!matchById){errors.push("Row "+row.row+": Product ID "+row.id+" does not exist.");continue;}
        const skuMatches=row.sku?bySku.get(normalize(row.sku))||[]:[];
        if(skuMatches.length>1){errors.push("Row "+row.row+": Existing Item Code '"+row.sku+"' is duplicated in StockEasy. Resolve it first.");continue;}
        if(row.id&&skuMatches.length&&skuMatches[0].id!==row.id){errors.push("Row "+row.row+": Product ID and Item Code belong to different products.");continue;}
        const p=matchById||skuMatches[0]||null;
        if(!p){
          const sameName=products.find(x=>normalize(x.name)===normalize(row.name)&&x.supplier_id===matches[0].id);
          if(sameName){errors.push("Row "+row.row+": '"+row.name+"' already exists for this supplier with a different item code. Use its correct Product ID or Item Code.");continue;}
        }
        const cat=categories.find(c=>normalize(c.name)===normalize(row.category));
        const categoryName=canonicalCategories.get(normalize(row.category))||row.category;
        canonicalCategories.set(normalize(row.category),categoryName);
        if(!cat)newCategories.add(categoryName);
        const previous=snapshot(p);
        const changed=!previous||p.name!==row.name||(p.sku||"")!==row.sku||p.category!==categoryName||
          p.supplier_id!==matches[0].id||p.unit!==row.unit||p.stock!==row.qty||
          !moneyEqual(p.cost,row.cost)||!moneyEqual(p.sale_price,row.sell)||p.active!==1;
        const action=!p?"new":changed?"update":"unchanged";
        plan.push({...row,category:categoryName,id:p?.id||null,previous,sid:matches[0].id,action});
      }
      // Fingerprint includes the *current* stock snapshot. A deliberate future
      // physical recount may legitimately match an old Excel quantity after GRNs.
      // Immediate repeats are no-ops, while identical preview commits are once-only.
      const fingerprint=crypto.createHash("sha256")
        .update(JSON.stringify({rows,baseline:plan.map(x=>x.previous)})).digest("hex");
      const duplicate=db.prepare("SELECT id FROM inventory_import_batches WHERE fingerprint=?").get(fingerprint);
      if(duplicate)errors.push("This exact inventory data has already been imported (batch #"+duplicate.id+"). Download a fresh template for another update.");
      const summary={
        rows:rows.length,newCount:plan.filter(x=>x.action==="new").length,
        updateCount:plan.filter(x=>x.action==="update").length,
        unchangedCount:plan.filter(x=>x.action==="unchanged").length,
        categoryCount:newCategories.size,categories:[...newCategories],
        totalQty:plan.reduce((n,x)=>n+x.qty,0),stockDelta:plan.reduce((n,x)=>n+x.qty-(x.previous?.stock||0),0)
      };
      let token=null;
      if(!errors.length&&summary.newCount+summary.updateCount>0){
        token=crypto.randomBytes(24).toString("hex");
        db.prepare("DELETE FROM inventory_import_previews WHERE expires_at<?").run(Date.now());
        db.prepare("INSERT INTO inventory_import_previews(token,staff_id,fingerprint,plan_json,expires_at) VALUES(?,?,?,?,?)")
          .run(token,req.user.id,fingerprint,JSON.stringify(plan),Date.now()+20*60*1000);
      }else if(!errors.length)errors.push("All values already match current StockEasy records. No changes to import.");
      return {token,summary,rows:plan.map(toPreview),errors,canCommit:!!token};
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
    const plan=JSON.parse(preview.plan_json);
    check(plan.length>0,"No items to import.");
    // Re-check the entire preview within the same SQL transaction before any write.
    for(const item of plan){
      if(item.previous){
        const current=snapshot(readProduct(item.id));
        check(JSON.stringify(current)===JSON.stringify(item.previous),
          "StockEasy has changed since preview. Upload the file again before confirming.",409);
      }else{
        check(!db.prepare("SELECT 1 FROM products WHERE sku=? COLLATE NOCASE").get(item.sku),
          "Item Code "+item.sku+" now exists. Upload again.",409);
        check(!db.prepare("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND supplier_id=?").get(item.name,item.sid),
          "Item "+item.name+" now exists. Upload again.",409);
      }
      const supplier=db.prepare("SELECT id,name,active FROM suppliers WHERE id=?").get(item.sid);
      check(supplier&&supplier.active===1&&normalize(supplier.name)===normalize(item.supplier),
        "A supplier has changed since preview. Upload again.",409);
    }
    const changed=plan.filter(p=>p.action!=="unchanged");
    const created=changed.filter(p=>p.action==="new").length,updated=changed.length-created;
    const delta=changed.reduce((n,p)=>n+p.qty-(p.previous?.stock||0),0);
    const batchId=db.prepare("INSERT INTO inventory_import_batches(fingerprint,staff_id,new_count,updated_count,stock_delta,details_json) VALUES(?,?,?,?,?,?)")
      .run(preview.fingerprint,req.user.id,created,updated,delta,JSON.stringify(changed.map(p=>({...toPreview(p),before:p.previous})))).lastInsertRowid;
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
        const diff=item.qty-item.previous.stock;
        db.prepare("UPDATE products SET name=?,sku=?,category=?,supplier_id=?,unit=?,cost=?,sale_price=?,active=1 WHERE id=?")
          .run(item.name,item.sku||null,item.category,item.sid,item.unit,item.cost,item.sell,item.id);
        if(diff){changeStock(item.id,diff);logStock(item.id,diff,"Bulk inventory count",reference,
          "Reviewed Excel final quantity "+item.qty+"; previous "+item.previous.stock,req.user.username);}
      }
    }
    // Hide unused factory demo categories, but never remove categories still in use.
    for(const category of ["Helmets","Electrical","Safety gear","Raw materials","Packaging","Tools","Other"]){
      const existing=ensureCategory.get(category);
      if(existing&&!db.prepare("SELECT 1 FROM products WHERE category=? COLLATE NOCASE LIMIT 1").get(category))
        db.prepare("UPDATE product_categories SET active=0 WHERE id=?").run(existing.id);
    }
    db.prepare("DELETE FROM inventory_import_previews WHERE token=?").run(token);
    return {ok:true,code:reference,created,updated,stockDelta:delta};
  })));
}
