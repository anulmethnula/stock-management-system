import {useEffect,useState} from "react";
import {FileText,Plus,Eye,Pencil,Send,Check,Printer,ArrowRight,Search,ShoppingBag,
  X,CalendarDays,ClipboardCheck,Package,ShieldCheck,ChevronLeft,ChevronRight,Info,RotateCcw} from "lucide-react";

const money=value=>"Rs "+Number(value||0).toLocaleString("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2});
const localDate=(days=0)=>{const x=new Date();x.setDate(x.getDate()+days);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,"0"),String(x.getDate()).padStart(2,"0")].join("-");};
const displayStatus=q=>(q.status==="Sent"||q.status==="Approved")&&q.validUntil<localDate()?"Expired":q.status;
const total=q=>q.items.reduce((sum,l)=>sum+l.qty*l.price,0);
function QuotationModal({title,sub,close,children,wide=true}){
  useEffect(()=>{const handle=e=>{if(e.key==="Escape")close()};document.addEventListener("keydown",handle);return ()=>document.removeEventListener("keydown",handle)},[close]);
  return <div className="over" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
    <section className={"modal quotation-modal "+(wide?"modal-wide":"")} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head"><div><h3>{title}</h3>{sub&&<p className="mute">{sub}</p>}</div><button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={19}/></button></header>
      {children}
    </section>
  </div>;
}
function Status({q}){const status=displayStatus(q);return <span className={"quote-status quote-"+status.toLowerCase()}>{status}</span>}

export function QuotationPage({d,customer,canEdit,user,setModal,action}){
  const [search,setSearch]=useState(""),[status,setStatus]=useState("all"),[company,setCompany]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[page,setPage]=useState(1);
  const quotes=d.quotations||[];
  const rows=quotes.filter(q=>(status==="all"||displayStatus(q)===status)&&
    (company==="all"||q.cid===Number(company))&&(!from||q.date>=from)&&(!to||q.date<=to)&&
    [q.id,q.customerName,...q.items.map(x=>x.name)].join(" ").toLowerCase().includes(search.toLowerCase()));
  useEffect(()=>setPage(1),[search,status,company,from,to]);
  const pageCount=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pageCount),visible=rows.slice((current-1)*10,current*10);
  const canConvert=canEdit&&(user.role==="admin"||user.permissions?.customer_orders==="edit");
  return <div className="quotations-page">
    <div className="section-heading quote-heading">
      <div><h1>Customer quotations</h1><p className="sub">Offer prices to customer companies before confirming their orders.</p></div>
      {canEdit&&<button className="btn" onClick={()=>setModal({type:"quotation"})}><Plus size={17}/> New quotation</button>}
    </div>
    <div className="quote-summary">
      {[[FileText,"All quotations",quotes.length,"all"],[Send,"Sent",quotes.filter(q=>displayStatus(q)==="Sent").length,"Sent"],
        [ShieldCheck,"Approved",quotes.filter(q=>displayStatus(q)==="Approved").length,"Approved"],
        [ShoppingBag,"Converted",quotes.filter(q=>q.status==="Converted").length,"Converted"]].map(([Icon,label,count,key])=>
        <button type="button" key={key} className={"quote-summary-card "+(status===key?"on":"")} onClick={()=>setStatus(key)}>
          <span><Icon size={21}/></span><div><strong>{count}</strong><small>{label}</small></div></button>)}
    </div>
    <div className="quote-tools">
      <label className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quotation, company or item…"/></label>
      <select aria-label="Filter by customer" value={company} onChange={e=>setCompany(e.target.value)}><option value="all">All companies</option>{d.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="Filter by quotation status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{["Draft","Sent","Approved","Rejected","Converted","Expired"].map(x=><option key={x} value={x}>{x}</option>)}</select>
      <label className="quote-date-filter"><span><CalendarDays size={15}/> From</span><input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} aria-label="Quotations from date"/></label>
      <label className="quote-date-filter"><span><CalendarDays size={15}/> To</span><input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} aria-label="Quotations to date"/></label>
      <button type="button" className="btn ghost quote-reset" onClick={()=>{setSearch("");setCompany("all");setStatus("all");setFrom("");setTo("")}}><RotateCcw size={15}/> Reset</button>
    </div>
    {!rows.length?<div className="empty"><FileText size={38}/><strong>No matching quotations</strong><p>Create a quotation or change your filters.</p></div>:
      <div className="quote-table">
        <div className="quote-table-row quote-table-head"><span>Quotation / Date</span><span>Customer</span><span>Items</span><span>Amount</span><span>Valid until</span><span>Status</span><span>Actions</span></div>
        {visible.map(q=><div className="quote-table-row" key={q.n}>
          <div className="quote-ref"><strong>{q.id}</strong><small>{q.date}</small></div>
          <div className="quote-company"><strong>{q.customerName}</strong></div>
          <div className="quote-lines"><strong>{q.items.length} item{q.items.length===1?"":"s"} · {q.items.reduce((n,l)=>n+l.qty,0)}</strong><small>{q.items.slice(0,2).map(x=>x.name).join(", ")}{q.items.length>2?" +more":""}</small></div>
          <div className="quote-money">{money(total(q))}</div><div className="quote-valid">{q.validUntil}</div>
          <div><Status q={q}/></div>
          <div className="quote-actions">
            <button type="button" className="icon-btn quote-action-btn" title="View / Print quotation" aria-label={"View "+q.id} onClick={()=>setModal({type:"view-quotation",record:q})}><Eye size={16}/><span>View</span></button>
            {canEdit&&q.status==="Draft"&&<button type="button" className="icon-btn quote-action-btn" title="Edit draft" onClick={()=>setModal({type:"quotation",record:q})}><Pencil size={16}/><span>Edit</span></button>}
            {canEdit&&q.status==="Draft"&&<button type="button" className="icon-btn primary-icon quote-action-btn" title="Mark as sent" onClick={()=>action("/quotations/"+q.n+"/status","POST",{status:"Sent"},"Quotation marked as sent.","quotes")}><Send size={16}/><span>Send</span></button>}
            {canEdit&&q.status==="Sent"&&displayStatus(q)!=="Expired"&&<button type="button" className="icon-btn primary-icon quote-action-btn" title="Record customer approval" onClick={()=>setModal({type:"quotation-decision",record:q,status:"Approved"})}><Check size={16}/><span>Approve</span></button>}
            {canEdit&&q.status==="Sent"&&<button type="button" className="icon-btn danger quote-action-btn" title="Record customer rejection" onClick={()=>setModal({type:"quotation-decision",record:q,status:"Rejected"})}><X size={16}/><span>Reject</span></button>}
            {canConvert&&q.status==="Approved"&&displayStatus(q)!=="Expired"&&<button type="button" className="btn sm" title="Convert to customer order" onClick={()=>setModal({type:"quotation-convert",record:q})}><ShoppingBag size={15}/> Convert</button>}
          </div>
        </div>)}
        <div className="quote-pagination"><span>Showing {(current-1)*10+1}–{Math.min(current*10,rows.length)} of {rows.length}</span>
          <div><button type="button" className="icon-btn" disabled={current===1} onClick={()=>setPage(v=>v-1)} aria-label="Previous page"><ChevronLeft size={17}/></button><b>{current} / {pageCount}</b><button type="button" className="icon-btn" disabled={current===pageCount} onClick={()=>setPage(v=>v+1)} aria-label="Next page"><ChevronRight size={17}/></button></div>
        </div>
      </div>}
  </div>;
}

export function QuotationForm({record,d,close,busy,action}){
  const [cid,setCid]=useState(record?.cid||d.customers.find(x=>x.active)?.id||"");
  const [qty,setQty]=useState(()=>Object.fromEntries((record?.items||[]).map(x=>[x.pid,x.qty])));
  const [prices,setPrices]=useState(()=>Object.fromEntries((record?.items||[]).map(x=>[x.pid,x.price])));
  const [until,setUntil]=useState(record?.validUntil||localDate(14));
  const [note,setNote]=useState(record?.note||"");
  const [search,setSearch]=useState("");
  const products=d.products.filter(p=>p.active&&[p.name,p.sku,p.category].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>Number(Number(qty[b.id]||0)>0)-Number(Number(qty[a.id]||0)>0)||a.name.localeCompare(b.name));
  const selected=d.products.filter(p=>Number(qty[p.id])>0).map(p=>({pid:p.id,qty:Number(qty[p.id]),price:Number(prices[p.id]??p.sell)}));
  const grand=selected.reduce((sum,l)=>sum+l.qty*l.price,0);
  const submit=e=>{e.preventDefault();action("/quotations"+(record?"/"+record.n:""),record?"PUT":"POST",{cid:Number(cid),items:selected,valid_until:until,note},"Quotation saved.","quotes");};
  return <QuotationModal title={record?"Edit draft quotation":"Create customer quotation"} sub="Prepare a price offer. No inventory changes until a delivery is recorded." close={close}>
    <form onSubmit={submit} className="quote-form">
      <div className="quote-form-grid">
        <label><span>Customer company *</span><select required value={cid} onChange={e=>setCid(e.target.value)}><option value="">Select a company</option>{d.customers.filter(x=>x.active||x.id===record?.cid).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span>Valid until *</span><input type="date" required min={localDate()} value={until} onChange={e=>setUntil(e.target.value)}/></label>
      </div>
      <div className="notice"><Info size={18}/><span>Enter your offered selling price for each item. Stock is not reserved by a quotation.</span></div>
      <div className="quote-products-head"><h4>Items and prices</h4><label className="search"><Search size={16}/><input placeholder="Find an item…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="quote-item-table">
        <div className="quote-item-row quote-item-head"><span>Item</span><span>Qty</span><span>Price / unit (Rs)</span><span>Amount</span></div>
        {products.map(p=>{const n=Number(qty[p.id]||0),price=Number(prices[p.id]??p.sell);return <div className="quote-item-row" key={p.id}>
          <div className="quote-item-name"><span className="quote-item-picture">{p.img?<img alt="" src={p.img}/>:p.emoji||"📦"}</span><span><strong>{p.name}</strong><small>{p.sku||"No item code"} · {p.stock} in stock</small></span></div>
          <input type="number" min="0" max="100000000" step="1" aria-label={"Quantity for "+p.name} value={n} onChange={e=>setQty(v=>({...v,[p.id]:Math.max(0,Math.floor(Number(e.target.value)||0))}))}/>
          <input type="number" min="0" step=".01" max="1000000000000" aria-label={"Unit price for "+p.name} value={prices[p.id]??p.sell} onChange={e=>setPrices(v=>({...v,[p.id]:e.target.value}))}/>
          <strong>{n?money(n*price):"—"}</strong>
        </div>})}{!products.length&&<p className="mute">No matching products.</p>}
      </div>
      <label className="quote-note"><span>Terms / Notes (optional)</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Delivery terms, payment conditions or other notes"/></label>
      <footer className="quote-form-footer"><div><small>{selected.length} items selected</small><strong>{money(grand)}</strong></div><div><button className="btn ghost" type="button" onClick={close}>Cancel</button><button className="btn" type="submit" disabled={busy||!cid||!selected.length||until<localDate()}><Check size={16}/>{busy?"Saving…":record?"Update Draft":"Save Draft Quotation"}</button></div></footer>
    </form>
  </QuotationModal>;
}
export function QuotationDecision({record,status,close,busy,action}){
  const [note,setNote]=useState("");
  return <QuotationModal title={status==="Approved"?"Record customer approval":"Record customer rejection"} sub={"Quotation "+record.id+" · "+record.customerName} close={close} wide={false}>
    <form className="quote-decision" onSubmit={e=>{e.preventDefault();action("/quotations/"+record.n+"/status","POST",{status,note},"Quotation "+status.toLowerCase()+".","quotes");}}>
      <p>{status==="Approved"?"Only approve after the customer has actually accepted the offered price.":"Enter why the customer declined this offer."}</p>
      <label>How was the decision confirmed? *<textarea required minLength={3} rows={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Example: Customer confirmed by email on 16 Nov"/></label>
      <div className="form-actions"><button type="button" className="btn ghost" onClick={close}>Cancel</button><button type="submit" className="btn" disabled={busy||note.trim().length<3}>{status==="Approved"?"Record Approval":"Record Rejection"}</button></div>
    </form>
  </QuotationModal>;
}
export function QuotationConvert({record,close,busy,action}){
  return <QuotationModal title="Create customer order?" sub={record.id+" · "+record.customerName} close={close} wide={false}>
    <div className="quote-decision"><p>This will create one Customer Order using the approved quantities and prices.</p>
      <div className="notice"><Info size={18}/>Stock will not change until the order is dispatched. This quotation cannot be converted twice.</div>
      <div className="form-actions"><button className="btn ghost" onClick={close}>Cancel</button><button className="btn" disabled={busy} onClick={()=>action("/quotations/"+record.n+"/convert","POST",{},"Customer order created from "+record.id+".","orders")}><ArrowRight size={16}/> Create Customer Order</button></div>
    </div>
  </QuotationModal>;
}
export function QuotationView({record,d,close}){
  const customer=d.customers.find(x=>x.id===record.cid);
  const order=d.orders.find(o=>o.n===record.convertedN);
  return <QuotationModal title={"Quotation "+record.id} sub="Review prices, print or save as PDF." close={close}>
    <div className="print-sheet print-document quote-print">
      <header className="print-document-header"><div className="print-company"><img src="/logo.png" alt="Supun Group of Companies"/><div><strong>SUPUN GROUP OF COMPANIES</strong><span>Customer quotation</span></div></div><div className="print-document-identity"><small>PRICE QUOTATION</small><h1>{record.id}</h1><Status q={record}/></div></header>
      <div className="print-accent-line"/>
      <section className="print-document-meta"><div><span>Customer</span><strong>{record.customerName}</strong></div><div><span>Quotation date</span><strong>{record.date}</strong></div><div><span>Valid until</span><strong>{record.validUntil}</strong></div><div><span>Total items</span><strong>{record.items.length}</strong></div></section>
      {(record.customerAddress||customer?.phone)&&<section className="quote-customer-meta">{record.customerAddress&&<span>Address: {record.customerAddress}</span>}{customer?.phone&&<span>Contact: {customer.phone}</span>}</section>}
      <div className="print-section-title"><span>Quoted items</span><small>Quantities and prices as offered</small></div>
      <table className="quote-print-table"><thead><tr><th>Item / Code</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>{record.items.map(l=><tr key={l.pid}><td><strong>{l.name}</strong><small>{l.sku}</small></td><td>{l.qty}</td><td>{money(l.price)}</td><td><strong>{money(l.qty*l.price)}</strong></td></tr>)}</tbody></table>
      <div className="order-total"><span>Total quotation value</span><strong>{money(total(record))}</strong></div>
      {record.note&&<section className="print-notes"><strong>Terms / Notes</strong><p>{record.note}</p></section>}
      {order&&<section className="quote-converted"><ClipboardCheck size={16}/> Converted to customer order <strong>{order.id}</strong></section>}
      <section className="print-approval"><div><span>Prepared by</span><strong>________________________</strong><small>Signature</small></div><div><span>Customer acceptance</span><strong>________________________</strong><small>Signature / Date</small></div></section>
      <footer className="print-document-footer"><div><strong>StockEasy</strong><span>Supun Group of Companies</span></div><div><span>Generated {new Date().toLocaleString("en-LK")}</span><small>Computer-generated quotation · Prices are as recorded. No automatic taxes added.</small></div></footer>
    </div>
    <div className="quote-action-history">{record.actions?.length>0&&<details><summary>Quotation activity ({record.actions.length})</summary>{record.actions.map((a,i)=><p key={i}><strong>{a.action}</strong> by {a.actor} · {a.at}{a.note?" — "+a.note:""}</p>)}</details>}</div>
    <div className="form-actions print-actions"><button className="btn" type="button" onClick={()=>window.print()}><Printer size={16}/> Print / Save PDF</button><button type="button" className="btn ghost" onClick={close}>Close</button></div>
  </QuotationModal>;
}
