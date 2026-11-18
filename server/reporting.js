import {buildTableWorkbook} from "./po-excel.js";

// Large movement datasets remain in SQLite instead of being sent to each browser.
// Business-date boundaries use Asia/Colombo while DB timestamps stay UTC.
export function registerReportingRoutes(app,h){
  const {db,check,cleanPermissions}=h;
  const access=(req,res,next)=>cleanPermissions(req.user.permissions,req.user.role).reports==="none"
    ?res.status(403).json({error:"No Reports access."}):next();
  const withError=fn=>(req,res)=>{try{fn(req,res);}catch(e){
    const status=e.status||400;
    res.status(status).json({error:e.message||"Report failed."});
  }};
  const date=v=>{
    if(!v)return "";
    check(/^\d{4}-\d{2}-\d{2}$/.test(String(v))&&!Number.isNaN(Date.parse(String(v)+"T00:00:00Z")),
      "Enter a valid report date.",400);
    return String(v);
  };
  const num=v=>v&&v!=="all"&&Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
  const now=()=>new Date().toLocaleString("en-LK",{timeZone:"Asia/Colombo"});
  const dateExpr="date(datetime(m.created_at,'+330 minutes'))";
  const moveGroup="CASE WHEN m.event_type LIKE '%reversed%' THEN 'Reversal' WHEN m.event_type='Goods received' THEN 'GRN' WHEN m.event_type LIKE 'Supplier return%' THEN 'Supplier Return' WHEN m.event_type LIKE 'Customer return%' THEN 'Customer Return' WHEN m.event_type='Delivered to customer' THEN 'Delivery' WHEN m.event_type LIKE 'Quarantine%' THEN 'Quarantine' ELSE 'Adjustment' END";
  const moveCols=["Date & Time (SL)","Item","Movement Type","Reference","Available In","Available Out","Quarantine Change","Recorded By"];
  function stockSummary(req){
    const from=date(req.query.from),to=date(req.query.to);
    check(!from||!to||from<=to,"Start date must not be after end date.");
    const status=String(req.query.status||"all");
    check(["all","active","low","out","archived"].includes(status),"Invalid stock status.");
    const sid=num(req.query.sid),pid=num(req.query.pid);
    const sql=[
      "WITH timeline AS (",
      "SELECT product_id pid,qty_change qty,damaged_change damaged,event_type event,",
      "CASE WHEN ?<>'' AND date(datetime(created_at,'+330 minutes'))<? THEN 1 ELSE 0 END prior,",
      "CASE WHEN (?='' OR date(datetime(created_at,'+330 minutes'))>=?)",
      "AND (?='' OR date(datetime(created_at,'+330 minutes'))<=?) THEN 1 ELSE 0 END current",
      "FROM stock_movements",
      "), totals AS (",
      "SELECT pid,",
      "SUM(CASE WHEN prior=1 THEN qty ELSE 0 END) opening,",
      "SUM(CASE WHEN prior=1 THEN damaged ELSE 0 END) openingHold,",
      "SUM(CASE WHEN current=1 AND event IN ('Goods received','GRN reversed') THEN qty ELSE 0 END) received,",
      "SUM(CASE WHEN current=1 AND event LIKE 'Supplier return%' THEN -qty ELSE 0 END) supplierReturns,",
      "SUM(CASE WHEN current=1 AND event IN ('Delivered to customer','Delivery reversed') THEN -qty ELSE 0 END) deliveries,",
      "SUM(CASE WHEN current=1 AND event LIKE 'Customer return%' THEN qty ELSE 0 END) customerReturns,",
      "SUM(CASE WHEN current=1 AND event NOT IN ('Goods received','GRN reversed','Delivered to customer','Delivery reversed')",
      "AND event NOT LIKE 'Supplier return%' AND event NOT LIKE 'Customer return%' THEN qty ELSE 0 END) adjustments,",
      "SUM(CASE WHEN current=1 THEN damaged ELSE 0 END) holdChange",
      "FROM timeline GROUP BY pid",
      ") SELECT p.id,p.name,p.sku,p.category,p.supplier_id sid,p.reorder,p.active,",
      "COALESCE(t.opening,0) opening,COALESCE(t.openingHold,0) openingHold,",
      "COALESCE(t.received,0) received,COALESCE(t.supplierReturns,0) supplierReturns,",
      "COALESCE(t.deliveries,0) deliveries,COALESCE(t.customerReturns,0) customerReturns,",
      "COALESCE(t.adjustments,0) adjustments,COALESCE(t.holdChange,0) holdChange",
      "FROM products p LEFT JOIN totals t ON t.pid=p.id ORDER BY p.name COLLATE NOCASE,p.id"
    ].join(" ");
    const all=db.prepare(sql).all(from,from,from,from,to,to);
    const selected=all.map(x=>{
      const closing=x.opening+x.received-x.supplierReturns-x.deliveries+x.customerReturns+x.adjustments;
      const closingHold=x.openingHold+x.holdChange;
      const state=x.active!==1?"Archived":closing<=0?"Out of stock":closing<=x.reorder?"Low stock":"Active";
      return {...x,closing,closingHold,state};
    }).filter(x=>(sid===null||x.sid===sid)&&(pid===null||x.id===pid)
      &&(status==="all"||(status==="active"&&x.state==="Active")||(status==="low"&&x.state==="Low stock")
         ||(status==="out"&&x.state==="Out of stock")||(status==="archived"&&x.state==="Archived")));
    const rows=selected.map(x=>[
      x.name+" / "+(x.sku||"—"),x.opening,x.received,x.supplierReturns,x.deliveries,x.customerReturns,
      x.adjustments,x.closing,x.openingHold,x.holdChange,x.closingHold,x.state
    ]);
    const summary=[["Items",selected.length],
      ["Opening available",selected.reduce((n,x)=>n+x.opening,0)],
      ["Closing available",selected.reduce((n,x)=>n+x.closing,0)],
      ["Closing quarantine",selected.reduce((n,x)=>n+x.closingHold,0)]];
    return {title:"Stock Summary Report",columns:[
      "Item / SKU","Opening available","Net received","Net supplier returns",
      "Net deliveries","Net sellable returns","Net adjustments","Closing available",
      "Opening quarantine","Quarantine change","Closing quarantine","Stock status"
    ],rows,summary,filters:[from&&"From "+from,to&&"To "+to,sid&&"Usual supplier ID: "+sid,pid&&"Item ID: "+pid,status!=="all"&&status].filter(Boolean).join(" · ")||"All records",generated:now()};
  }
  const movementsWhere=req=>{
    const from=date(req.query.from),to=date(req.query.to);
    check(!from||!to||from<=to,"Start date must not be after end date.");
    const pid=num(req.query.pid),type=String(req.query.status||"all");
    check(["all","GRN","Supplier Return","Customer Return","Delivery","Quarantine","Adjustment","Reversal"].includes(type),
      "Invalid movement type.");
    const parts=[],params=[];
    if(from){parts.push(dateExpr+">=?");params.push(from);}
    if(to){parts.push(dateExpr+"<=?");params.push(to);}
    if(pid){parts.push("m.product_id=?");params.push(pid);}
    if(type!=="all"){parts.push("("+moveGroup+")=?");params.push(type);}
    return {source:" FROM stock_movements m JOIN products p ON p.id=m.product_id"+(parts.length?" WHERE "+parts.join(" AND "):""),params,filters:[from&&"From "+from,to&&"To "+to,pid&&"Item ID: "+pid,type!=="all"&&type].filter(Boolean).join(" · ")||"All records"};
  };
  function movementRecord(record){
    return [record.at,record.name,record.type,record.reference,record.qty>0?record.qty:"—",
      record.qty<0?Math.abs(record.qty):"—",record.damagedQty||0,record.actor];
  }
  function movementSummary(req,all=false){
    const {source,params,filters}=movementsWhere(req);
    const totals=db.prepare("SELECT COUNT(*) count,"
      +"COALESCE(SUM(CASE WHEN m.qty_change>0 THEN m.qty_change ELSE 0 END),0) received,"
      +"COALESCE(SUM(CASE WHEN m.qty_change<0 THEN -m.qty_change ELSE 0 END),0) sent"+source).get(...params);
    const pageSize=200,page=Math.max(1,Math.min(Math.ceil(totals.count/pageSize)||1,Number(req.query.page)||1));
    const sql="SELECT datetime(m.created_at,'+330 minutes') at,p.name,m.event_type type,m.reference,m.qty_change qty,m.damaged_change damagedQty,m.actor"+source+" ORDER BY m.id DESC";
    if(all)check(totals.count<=50000,"This report has more than 50,000 movements. Choose a shorter date range before exporting.",413);
    const data=all?db.prepare(sql).all(...params):db.prepare(sql+" LIMIT ? OFFSET ?").all(...params,pageSize,(page-1)*pageSize);
    return {title:"Stock Movement History Report",columns:moveCols,rows:data.map(movementRecord),
      summary:[["Movements",totals.count],["Stock in",totals.received],["Stock out",totals.sent]],
      filters,generated:now(),page,totalPages:Math.max(1,Math.ceil(totals.count/pageSize)),
      totalRecords:totals.count,partial:!all&&totals.count>pageSize};
  }
  const excel=(res,filename,report)=>{
    const buffer=buildTableWorkbook({sheetName:"Report",headers:report.columns,rows:report.rows,
      guide:[["Title",report.title],["Date filters",report.filters],["Generated",report.generated],
        ...report.summary.map(([key,value])=>[key,String(value)])]});
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",'attachment; filename="'+filename+'"');
    res.send(buffer);
  };
  app.get("/api/reports/stock-summary",access,withError((req,res)=>res.json(stockSummary(req))));
  app.get("/api/reports/movements",access,withError((req,res)=>res.json(movementSummary(req))));
  app.get("/api/reports/movements.xlsx",access,withError((req,res)=>
    excel(res,"StockEasy_Movement_History.xlsx",movementSummary(req,true))));
  // Non-stock operational reports already have the data in their authorized
  // preview; this endpoint converts their rows to a real, safe XLSX workbook.
  app.post("/api/reports/xlsx",access,withError((req,res)=>{
    const b=req.body||{};
    check(typeof b.title==="string"&&b.title.length<=120,"Invalid report title.");
    check(Array.isArray(b.columns)&&b.columns.length>0&&b.columns.length<=35
      &&b.columns.every(x=>typeof x==="string"&&x.length<=120),"Invalid report columns.");
    check(Array.isArray(b.rows)&&b.rows.length<=50000,"Report is too large.",413);
    check(b.rows.every(row=>Array.isArray(row)&&row.length===b.columns.length
      &&row.every(value=>["string","number"].includes(typeof value)&&String(value).length<=1000)),
      "Invalid report data.");
    check(Array.isArray(b.summary)&&b.summary.length<=30&&b.summary.every(row=>
      Array.isArray(row)&&row.length===2&&row.every(v=>["string","number"].includes(typeof v))),
      "Invalid report summary.");
    const report={title:b.title,columns:b.columns,rows:b.rows,summary:b.summary,
      filters:String(b.filters||"").slice(0,500),generated:now()};
    excel(res,"StockEasy_"+b.title.replace(/[^a-z0-9_-]+/gi,"_")+".xlsx",report);
  }));
}
