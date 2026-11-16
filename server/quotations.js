// Customer quotation workflow: Draft -> Sent -> Approved -> Converted.
// A quotation never changes stock. Customer acceptance is recorded by staff.
export function registerQuotationRoutes(app, h) {
  const {db,requireEdit,run,transaction,find,ident,required,str,money,validateLines,today,code,check}=h;
  const audit=(qid,action,actor,note="")=>
    db.prepare("INSERT INTO quotation_actions(quotation_id,action,actor,note) VALUES(?,?,?,?)")
      .run(qid,action,actor,str(note,500));
  const getQuote=id=>{
    const q=db.prepare("SELECT * FROM customer_quotations WHERE id=?").get(ident(id));
    check(q,"Quotation not found.",404);
    return q;
  };
  const validDate=value=>{
    const date=str(value,10);
    const d=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+"T00:00:00Z"):null;
    check(d && Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===date,
      "Enter a valid quotation expiry date.");
    check(date>=today(),"Quotation expiry date cannot be in the past.");
    return date;
  };
  const payload=b=>{
    const customer=find("customers",ident(b.cid));
    check(customer.active===1,"Choose an active customer.");
    const lines=validateLines(b.items,"quotation").map(l=>({
      ...l,price:money(l.price??l.product.sale_price,"Quoted selling price")
    }));
    return {customer,lines,valid_until:validDate(b.valid_until),note:str(b.note,1000)};
  };
  const insertLines=(qid,lines)=>{
    const insert=db.prepare("INSERT INTO quotation_items(quotation_id,product_id,item_name,item_code,item_unit,qty,price) VALUES(?,?,?,?,?,?,?)");
    for(const l of lines)insert.run(qid,l.pid,l.product.name,l.product.sku||"",l.product.unit,l.qty,l.price);
  };
  app.post("/api/quotations",requireEdit("quotations"),run(req=>transaction(()=>{
    const {customer,lines,valid_until,note}=payload(req.body||{});
    const id=db.prepare("INSERT INTO customer_quotations(code,customer_id,customer_name,customer_address,date,valid_until,note) VALUES('',?,?,?,?,?,?)")
      .run(customer.id,customer.name,customer.address||"",today(),valid_until,note).lastInsertRowid;
    const document=code("QT",id);
    db.prepare("UPDATE customer_quotations SET code=? WHERE id=?").run(document,id);
    insertLines(id,lines);
    audit(id,"Created",req.user.username);
    return {code:document,id};
  })));
  app.put("/api/quotations/:id",requireEdit("quotations"),run(req=>transaction(()=>{
    const quote=getQuote(req.params.id);
    check(quote.status==="Draft","Only draft quotations can be edited.",409);
    const {customer,lines,valid_until,note}=payload(req.body||{});
    db.prepare("UPDATE customer_quotations SET customer_id=?,customer_name=?,customer_address=?,valid_until=?,note=? WHERE id=?")
      .run(customer.id,customer.name,customer.address||"",valid_until,note,quote.id);
    db.prepare("DELETE FROM quotation_items WHERE quotation_id=?").run(quote.id);
    insertLines(quote.id,lines);
    audit(quote.id,"Edited",req.user.username);
    return {code:quote.code};
  })));
  app.post("/api/quotations/:id/status",requireEdit("quotations"),run(req=>transaction(()=>{
    const quote=getQuote(req.params.id),status=str(req.body?.status,30);
    const allowed=(quote.status==="Draft"&&status==="Sent")||
      (quote.status==="Sent"&&["Approved","Rejected"].includes(status));
    check(allowed,"This quotation cannot be changed to that status.",409);
    if(status==="Approved")check(quote.valid_until>=today(),
      "Quotation has expired. Create a new quotation.",409);
    const note=str(req.body?.note,500);
    if(status!=="Sent")check(note.length>=3,"Describe how the customer approved or rejected the quotation.");
    db.prepare("UPDATE customer_quotations SET status=? WHERE id=?").run(status,quote.id);
    audit(quote.id,status,req.user.username,note);
    return {ok:true};
  })));
  app.post("/api/quotations/:id/convert",requireEdit("quotations"),
    requireEdit("customer_orders"),run(req=>transaction(()=>{
      const quote=getQuote(req.params.id);
      check(quote.status==="Approved"&&!quote.converted_order_id,
        "Only approved, unconverted quotations can create an order.",409);
      check(quote.valid_until>=today(),"Quotation has expired. Create a new quotation.",409);
      const customer=find("customers",quote.customer_id);
      check(customer.active===1,"Customer is inactive.",409);
      const lines=db.prepare("SELECT product_id pid,qty,price FROM quotation_items WHERE quotation_id=?").all(quote.id);
      check(lines.length>0,"Quotation has no items.",409);
      for(const line of lines)check(find("products",line.pid).active===1,
        "An item in this quotation is inactive.",409);
      const id=db.prepare("INSERT INTO customer_orders(code,customer_id,date,note) VALUES('',?,?,?)")
        .run(customer.id,today(),[("From quotation "+quote.code),quote.note].filter(Boolean).join(" · ")).lastInsertRowid;
      const document=code("CO",id);
      db.prepare("UPDATE customer_orders SET code=? WHERE id=?").run(document,id);
      const insert=db.prepare("INSERT INTO customer_order_items(order_id,product_id,qty,price) VALUES(?,?,?,?)");
      for(const line of lines)insert.run(id,line.pid,line.qty,line.price);
      db.prepare("UPDATE customer_quotations SET status='Converted',converted_order_id=? WHERE id=?")
        .run(id,quote.id);
      audit(quote.id,"Converted",req.user.username,document);
      return {code:document,quotation:quote.code,order_id:id};
    })));
}
