import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Package, Building2, Users, ClipboardList, PackageCheck,
  Truck, History, Shield, LogOut, Moon, Sun, Plus, Pencil, Trash2,
  Search, AlertTriangle, ArrowRight, Check, X, Camera, Minus,
  RotateCcw, Printer, Eye, Archive, ArrowUpRight, ArrowDownLeft,
  LockKeyhole, ShoppingBag, Boxes, Info, RefreshCw
} from "lucide-react";

const request = async (path, method = "GET", body) => {
  const res = await fetch("/api" + path, {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data.error || "Could not complete this action."); error.status = res.status; throw error; }
  return data;
};
const rs = n => "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 2 });
const one = (arr, id) => arr.find(x => Number(x.n ?? x.id) === Number(id));
const today = date => date ? String(date).slice(0, 10) : "—";
const stockLevel = p => p.stock <= 0 ? "out" : p.stock <= p.reorder ? "low" : "ok";
const isClosed = s => ["Received", "Cancelled", "Part cancelled", "Dispatched", "Reversed"].includes(s);
const active = arr => arr.filter(x => x.active);
const number = value => Number(value) || 0;
const Icons = { home: LayoutDashboard, products: Package, branches: Building2, customers: Users,
  pos: ClipboardList, grns: PackageCheck, orders: ShoppingBag, deliveries: Truck, history: History, staff: Shield };
const MENU = [
  ["home", "Home"], ["products", "Items"], ["branches", "Supun branches"],
  ["customers", "Customers"], ["pos", "Stock requests"], ["grns", "Goods received"],
  ["orders", "Customer orders"], ["deliveries", "Deliveries"], ["history", "Stock history"], ["staff", "Staff"]
];

function Picture({ p, large = false }) {
  return <span className={large ? "item-picture large" : "item-picture"}>{p?.img ?
    <img src={p.img} alt={p.name || "Product"} /> : <span>{p?.emoji || "📦"}</span>}</span>;
}
function Pill({ children, kind = "" }) { return <span className={"state-pill " + kind}>{children}</span>; }
function State({ value }) {
  const kind = ["Received", "Dispatched", "Active"].includes(value) ? "good" :
    ["Cancelled", "Reversed", "Part cancelled"].includes(value) ? "off" :
    ["Part received", "Part dispatched"].includes(value) ? "warn" : "neutral";
  return <Pill kind={kind}>{value}</Pill>;
}
function Modal({ title, sub, children, close, wide = false }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="over" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className={"modal " + (wide ? "modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h3>{title}</h3>{sub && <p className="mute">{sub}</p>}</div>
        <button className="icon-btn" title="Close" aria-label="Close" onClick={close}><X size={20} /></button></div>
      {children}
    </section>
  </div>;
}
function Controls({ save, close, busy, valid = true, label = "Save" }) {
  return <div className="form-actions"><button className="btn" type="submit" disabled={busy || !valid}><Check size={17}/>{busy ? "Saving…" : label}</button>
    <button className="btn ghost" type="button" onClick={close}>Cancel</button></div>;
}
function Qty({ value, onChange, max = 1000000 }) {
  const set = v => onChange(Math.max(0, Math.min(max, Math.floor(Number(v) || 0))));
  return <div className="qty"><button type="button" title="Less" onClick={() => set(value - 1)}><Minus size={15}/></button>
    <input aria-label="Quantity" type="number" inputMode="numeric" min="0" max={max} value={value} onChange={e => set(e.target.value)} />
    <button type="button" title="More" onClick={() => set(value + 1)}><Plus size={15}/></button></div>;
}
function SearchBox({ value, change, placeholder = "Search…" }) {
  return <label className="search" aria-label="Search"><Search size={18}/><input placeholder={placeholder} value={value} onChange={e => change(e.target.value)} /></label>;
}
function Empty({ title, sub, Icon = Package }) {
  return <div className="empty"><Icon size={37} strokeWidth={1.4}/><strong>{title}</strong><div>{sub}</div></div>;
}
function SectionHeading({ title, sub, action, label, Icon = Plus }) {
  return <div className="section-heading"><div><h1>{title}</h1><p className="sub">{sub}</p></div>
    {action && <button className="btn" onClick={action}><Icon size={17}/>{label}</button>}</div>;
}

export default function App() {
  const [d, setD] = useState(null), [user, setUser] = useState(null), [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home"), [modal, setModal] = useState(null);
  const [error, setError] = useState(""), [toast, setToast] = useState(""), [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("se-theme") || "light");
  const [staff, setStaff] = useState([]);
  const refresh = async () => {
    const data = await request("/all");
    setD(data); setUser(data.user);
    return data;
  };
  useEffect(() => { refresh().catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setLoading(false)); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("se-theme", theme); }, [theme]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3600); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (page === "staff" && user?.role === "admin") request("/staff").then(result => setStaff(result.staff)).catch(e => setError(e.message));
  }, [page, user?.role]);

  const canEdit = user?.role !== "viewer";
  const branch = id => one(d?.branches || [], id) || { name: "Unknown branch" };
  const customer = id => one(d?.customers || [], id) || { name: "Unknown company" };
  const product = id => one(d?.products || [], id) || { name: "Unknown item", emoji: "📦", unit: "units", stock: 0 };
  const action = async (path, method, body, message, go) => {
    setBusy(true); setError("");
    try {
      const result = await request(path, method, body);
      await refresh();
      if (page === "staff" || go === "staff") {
        const result = await request("/staff").catch(() => ({ staff: [] }));
        setStaff(result.staff);
      }
      setModal(null);
      if (go) setPage(go);
      setToast(message || (result.code ? result.code + " saved successfully." : "Saved successfully."));
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const confirm = (title, text, path, method = "DELETE", go = null) =>
    setModal({ type: "confirm", title, text, execute: () => action(path, method, undefined, "Updated successfully.", go) });
  const reason = (title, sub, path, go) =>
    setModal({ type: "reason", title, sub, execute: r => action(path, "POST", { reason: r }, "Reversal saved in stock history.", go) });
  const signIn = async (username, password) => {
    setBusy(true); setError("");
    try { await request("/login", "POST", { username, password }); await refresh(); setPage("home"); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    await request("/logout", "POST").catch(() => {});
    setUser(null); setD(null); setPage("home"); setModal(null); setError("");
  };
  if (loading) return <div className="loading-screen"><Boxes size={34}/> Loading StockEasy…</div>;
  if (!user) return <Login signIn={signIn} busy={busy} error={error}/>;
  if (!d) return <div className="loading-screen"><AlertTriangle/> Could not load stock data. <button onClick={() => window.location.reload()}>Try again</button></div>;

  const ctx = { d, branch, customer, product, canEdit, user, action, busy, setModal, confirm, reason };
  return <div className="app">
    <aside className="side">
      <div className="logo"><span className="logo-mark"><Boxes size={22}/></span><span>StockEasy<small>SUPUN GROUP</small></span></div>
      <nav className="side-menu" aria-label="Main navigation">
        {MENU.filter(([key]) => key !== "staff" || user.role === "admin").map(([key, label]) => {
          const Icon = Icons[key];
          return <button key={key} className={"nav" + (page === key ? " on" : "")} onClick={() => { setPage(key); setError(""); }}>
            <Icon size={19}/><span>{label}</span>
            {key === "pos" && d.pos.filter(x => !isClosed(x.status)).length > 0 && <small>{d.pos.filter(x => !isClosed(x.status)).length}</small>}
          </button>;
        })}
      </nav>
      <div className="side-bottom"><div className="user-meta"><span className="user-avatar">{user.username[0].toUpperCase()}</span>
        <span><strong>{user.username}</strong><small>{user.role === "admin" ? "Administrator" : user.role === "viewer" ? "View only" : "Staff"}</small></span></div>
        <div className="bottom-buttons"><button className="icon-btn" title="Switch theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Moon size={20}/> : <Sun size={20}/>}</button>
          <button className="icon-btn" title="Log out" onClick={signOut}><LogOut size={20}/></button></div>
      </div>
    </aside>
    <main className="main">
      <div className="top-strip"><span><span className="live-dot"/> StockEasy Workspace</span>
        <div className="top-actions">
          <button className="icon-btn mobile-action" aria-label="Switch theme" title="Switch theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? <Moon size={19}/> : <Sun size={19}/>}</button>
          <button className="icon-btn mobile-action" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={19}/></button>
          <button className="btn ghost sm" onClick={() => refresh().then(() => setToast("All records refreshed.")).catch(e => setError(e.message))}>
            <RefreshCw size={14}/><span>Refresh</span></button>
        </div></div>
      {error && <div className="error-banner" role="alert"><AlertTriangle size={19}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={18}/></button></div>}
      <div className="page" key={page}>
        {page === "home" && <Home {...ctx} setPage={setPage} />}
        {page === "branches" && <Directory {...ctx} type="branches" />}
        {page === "customers" && <Directory {...ctx} type="customers" />}
        {page === "products" && <Products {...ctx} />}
        {page === "pos" && <PurchaseOrders {...ctx} />}
        {page === "grns" && <GoodsReceived {...ctx} />}
        {page === "orders" && <CustomerOrders {...ctx} />}
        {page === "deliveries" && <Deliveries {...ctx} />}
        {page === "history" && <StockHistory {...ctx} />}
        {page === "staff" && <Staff {...ctx} staff={staff} />}
      </div>
    </main>
    {modal && <Dialog modal={modal} ctx={ctx} staff={staff} close={() => setModal(null)}/>}
    {toast && <div className="toast" role="status"><Check size={18}/>{toast}</div>}
  </div>;
}

function Login({ signIn, busy, error }) {
  const [username, setUsername] = useState("admin"), [password, setPassword] = useState("");
  return <div className="login-wrap">
    <div className="login-intro"><div className="login-brand"><Boxes size={30}/> StockEasy</div>
      <h1>All your stock.<br/><span>One simple place.</span></h1>
      <p>From Supun branches to customer companies — keep every item accounted for.</p>
      <div className="login-path"><span><Building2/> Supun branches</span><ArrowRight/><span><PackageCheck/> Receive</span><ArrowRight/><span><Truck/> Deliver</span></div>
    </div>
    <form className="login-card" onSubmit={e => { e.preventDefault(); signIn(username,password); }}>
      <div className="login-icon"><LockKeyhole size={26}/></div><h2>Welcome back</h2><p className="mute">Sign in to manage your stock.</p>
      <label>Username</label><input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required/>
      <label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={18}/></button>
      <p className="login-hint">First time? Your admin password is printed in the server window.</p>
    </form>
  </div>;
}

function Home({ d, setPage, setModal, canEdit, branch }) {
  const low = active(d.products).filter(p => stockLevel(p) !== "ok");
  const pending = d.pos.filter(p => ["Ordered","Part received"].includes(p.status));
  const openCustomers = d.orders.filter(o => ["Open","Part dispatched"].includes(o.status));
  const value = d.products.reduce((a,p) => a + p.stock * p.cost,0);
  const stats = [
    [Package,"Items",active(d.products).length,"Products in your list"],
    [AlertTriangle,"Need attention",low.length,"Low or out of stock"],
    [ClipboardList,"Branch requests",pending.length,"Waiting for goods"],
    [ShoppingBag,"Customer orders",openCustomers.length,"Waiting to send"]
  ];
  return <>
    <div className="home-heading"><div><div className="eyebrow">YOUR STOCK AT A GLANCE</div><h1>Good day! 👋</h1><p className="sub">Here's what's happening between your branches and customers.</p></div>
      {canEdit && <button className="btn" onClick={() => setModal({ type: "po" })}><Plus size={18}/> Request stock</button>}</div>
    <div className="grid stats-grid">{stats.map(([Icon,label,n,sub],i) => <div className="card stat-card pop" style={{"--i":i}} key={label}>
      <span className="stat-icon"><Icon size={20}/></span><span className="stat-num">{n}</span><strong>{label}</strong><small>{sub}</small>
    </div>)}</div>
    <div className="dashboard-cols"><div className="card workflow"><h2>How stock moves</h2><p className="mute">Three simple steps for daily work.</p>
      <div className="workflow-steps">{[
        [Building2,"1. Request from a branch","Create a Purchase Order (PO)","pos"],
        [PackageCheck,"2. Receive the delivery","Save a GRN — stock increases","grns"],
        [Truck,"3. Send to a company","Create a delivery — stock decreases","orders"]
      ].map(([Icon,title,sub,to])=><button className="workflow-step" key={to} onClick={() => setPage(to)}>
        <span><Icon size={22}/></span><span><strong>{title}</strong><small>{sub}</small></span><ArrowRight size={17}/></button>)}</div></div>
      <div className="card stock-summary"><div className="small-heading"><span><h2>Stock value</h2><p className="mute">Based on buying price</p></span><Boxes size={24}/></div>
        <div className="stock-value">{rs(value)}</div><div className="divider-line"/>
        <h3>Needs reordering</h3>
        {low.length ? low.slice(0,4).map(p=><div className="stock-warning" key={p.id}><Picture p={p}/>
          <div><strong>{p.name}</strong><small>{p.stock} {p.unit} available</small></div><Pill kind={p.stock===0?"off":"warn"}>{p.stock===0?"Out":"Low"}</Pill></div>)
          : <p className="mute">All active items have enough stock. ✅</p>}
        {low.length>4 && <button className="text-button" onClick={() => setPage("products")}>See all items <ArrowRight size={14}/></button>}
      </div></div>
    {pending.length>0 && <><h2 className="list-heading">Waiting for branch deliveries</h2><div className="list">
      {pending.slice(0,4).map(po=><div className="card compact-row" key={po.n}><span className="row-icon"><ClipboardList/></span>
        <div className="grow"><strong>{po.id}</strong><div className="mute">{branch(po.sid).name} · {today(po.date)}</div></div>
        <State value={po.status}/>{canEdit && <button className="btn sm" onClick={() => setModal({ type: "grn", po })}>Receive goods</button>}</div>)}
    </div></>}
  </>;
}

function Directory({ d, type, setModal, confirm, canEdit }) {
  const isBranch = type === "branches", list = d[type];
  const [q,setQ]=useState(""), [showArchived,setShowArchived]=useState(false);
  const filtered=list.filter(x => (showArchived||x.active) && [x.name,x.contact,x.phone,x.location,x.address].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title={isBranch?"Supun branches":"Customer companies"}
      sub={isBranch?"Manage the 12 internal Supun branches that supply stock.":"Companies that receive goods from you."}
      action={canEdit?()=>setModal({type:isBranch?"branch":"customer"}):null} label={isBranch?"Add branch":"Add company"}/>
    <div className="list-tools"><SearchBox value={q} change={setQ} placeholder={isBranch?"Search branches…":"Search companies…"}/>
      <label className="toggle-archived"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show removed</label></div>
    {!filtered.length?<Empty Icon={isBranch?Building2:Users} title="Nothing found" sub="Add a new record or try another search."/>:
      <div className="grid directory-grid">{filtered.map(x=><div className="card directory-card pop" key={x.id}>
        <div className="record-head"><span className="record-avatar">{isBranch?<Building2 size={23}/>:<Users size={23}/>}</span>
          <Pill kind={x.active?"good":"off"}>{x.active?"Active":"Removed"}</Pill></div>
        <h3>{x.name}</h3><p className="mute">{x.location||x.address||"No location added"}</p>
        <div className="contact-details">{x.contact&&<span>👤 {x.contact}</span>}{x.phone&&<span>📞 {x.phone}</span>}</div>
        {canEdit && <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:isBranch?"branch":"customer",record:x})}>
          <Pencil size={15}/> Edit {x.active?"":" / Restore"}</button>
          {x.active===1&&<button className="icon-btn danger" title="Remove" onClick={()=>confirm("Remove "+x.name+"?",
            "This will hide the record from new forms. Old orders and history will be kept.",
            "/"+type+"/"+x.id)}><Trash2 size={17}/></button>}</div>}
      </div>)}</div>}
  </>;
}

function Products({d,branch,setModal,confirm,canEdit,user}) {
  const [q,setQ]=useState(""), [showArchived,setShowArchived]=useState(false);
  const filtered=d.products.filter(p => (showArchived||p.active) && [p.name,p.sku].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title="Your items" sub="Pictures, quantities, buying prices and stock alerts."
      action={canEdit?()=>setModal({type:"product"}):null} label="Add item"/>
    <div className="list-tools"><SearchBox value={q} change={setQ} placeholder="Search name or item code…"/>
      <label className="toggle-archived"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show removed</label></div>
    {!filtered.length?<Empty title="No matching items" sub="Add an item or change your search."/>:
      <div className="grid product-grid">{filtered.map((p,i)=><div className="card product-card pop" style={{"--i":i}} key={p.id}>
        <div className="pic"><Picture p={p} large/></div>
        <div className="product-main"><div className="product-title"><strong>{p.name}</strong>
          {!p.active?<Pill kind="off">Removed</Pill>:<Pill kind={stockLevel(p)==="ok"?"good":stockLevel(p)==="low"?"warn":"off"}>
            {stockLevel(p)==="ok"?"In stock":stockLevel(p)==="low"?"Low":"Out of stock"}</Pill>}</div>
          <p className="mute">{p.sku||"No item code"} · {branch(p.sid).name}</p>
          <div className="product-quantity"><strong>{p.stock}</strong> {p.unit} in stock</div>
          <div className="product-prices"><span>Buy: {rs(p.cost)}</span><span>Sell: {rs(p.sell)}</span></div></div>
        {canEdit && <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:"product",record:p})}><Pencil size={15}/> Edit</button>
          {user.role==="admin"&&<button className="btn ghost sm" onClick={()=>setModal({type:"adjust",record:p})}><RefreshCw size={15}/> Correct stock</button>}
          {p.active===1&&<button className="icon-btn danger" title="Remove item" onClick={()=>confirm("Remove item?","This item will be hidden, but all stock history stays available.","/products/"+p.id)}><Trash2 size={16}/></button>}</div>}
      </div>)}</div>}
  </>;
}

function PurchaseOrders({ d,branch,product,setModal,confirm,canEdit }) {
  const [tab,setTab]=useState("open");
  const list=d.pos.filter(o => tab==="all" || (tab==="open" ? ["Ordered","Part received"].includes(o.status) : isClosed(o.status)));
  return <>
    <SectionHeading title="Stock requests (PO)" sub="Request goods from any Supun branch. A PO does not add stock until a GRN is saved."
      action={canEdit?()=>setModal({type:"po"}):null} label="Request stock"/>
    <div className="tabs">{[["open","Waiting"],["closed","Completed / cancelled"],["all","All"]].map(([key,label])=><button key={key} className={tab===key?"on":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {!list.length?<Empty Icon={ClipboardList} title="No stock requests here" sub="Create a PO to request goods from a branch."/>:
      <div className="list">{list.map(po=>{
        const qty=po.items.reduce((a,x)=>a+x.qty,0), received=po.items.reduce((a,x)=>a+x.received,0);
        const total=po.items.reduce((a,x)=>a+x.qty*x.cost,0);
        return <div className="card doc-card" key={po.n}><div className="doc-top"><span className="row-icon"><ClipboardList/></span>
          <div className="grow"><strong>{po.id} <span className="muted-sep">·</span> {branch(po.sid).name}</strong>
            <div className="mute">{today(po.date)} · {rs(total)}</div></div><State value={po.status}/></div>
          <div className="progress-label"><span>{received} of {qty} units received</span><span>{qty?Math.round(received/qty*100):0}%</span></div>
          <div className="bar"><i style={{width:(qty?received/qty*100:0)+"%"}}/></div>
          <div className="doc-items">{po.items.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
          <div className="card-actions">
            <button className="btn ghost sm" onClick={()=>setModal({type:"view-po",record:po})}><Eye size={15}/> View</button>
            {canEdit&&["Ordered","Part received"].includes(po.status)&&<button className="btn sm" onClick={()=>setModal({type:"grn",po})}><PackageCheck size={15}/> Receive goods</button>}
            {canEdit&&po.status==="Ordered"&&<button className="btn ghost sm" onClick={()=>setModal({type:"po",record:po})}><Pencil size={15}/> Edit</button>}
            {canEdit&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn danger" title="Cancel remaining order" onClick={()=>confirm("Cancel this stock request?",
              "No goods will be removed from stock. Any GRNs already saved will stay in history.","/pos/"+po.n)}><X size={18}/></button>}
          </div></div>;
      })}</div>}
  </>;
}

function GoodsReceived({d,branch,product,canEdit,reason}) {
  return <>
    <SectionHeading title="Goods received (GRN)" sub="Every delivery received from a Supun branch increases your stock."/>
    {!d.grns.length?<Empty Icon={PackageCheck} title="No goods received yet" sub="Open a stock request and select Receive goods."/>:
      <div className="list">{d.grns.map(g=><div className="card compact-doc" key={g.n}>
        <div className="doc-top"><span className="row-icon"><PackageCheck/></span><div className="grow">
          <strong>{g.id} <span className="muted-sep">·</span> {g.poId}</strong>
          <div className="mute">{branch(g.sid).name} · {today(g.date)} · Received by {g.by}</div>
        </div><State value={g.status}/></div>
        <div className="doc-items">{g.lines.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
        {g.note&&<p className="mute">Note: {g.note}</p>}
        {canEdit&&g.status==="Active"&&<div className="card-actions"><button className="btn ghost sm" onClick={()=>reason("Reverse "+g.id,
          "This removes the received quantity from stock and records the correction.", "/grns/"+g.n+"/reverse","grns")}>
          <RotateCcw size={15}/> Reverse GRN</button></div>}
      </div>)}</div>}
  </>;
}

function CustomerOrders({d,customer,product,setModal,confirm,canEdit}) {
  const [tab,setTab]=useState("open");
  const list=d.orders.filter(o=>tab==="all"||(tab==="open"?["Open","Part dispatched"].includes(o.status):isClosed(o.status)));
  return <>
    <SectionHeading title="Customer orders" sub="Record goods requested by customer companies before sending them."
      action={canEdit?()=>setModal({type:"order"}):null} label="New customer order"/>
    <div className="tabs">{[["open","Waiting to send"],["closed","Completed / cancelled"],["all","All"]].map(([key,label])=>
      <button key={key} className={tab===key?"on":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {!list.length?<Empty Icon={ShoppingBag} title="No customer orders" sub="Create an order for a customer company."/>:
      <div className="list">{list.map(o=>{
        const qty=o.items.reduce((s,l)=>s+l.qty,0), shipped=o.items.reduce((s,l)=>s+l.dispatched,0);
        return <div className="card doc-card" key={o.n}>
          <div className="doc-top"><span className="row-icon"><ShoppingBag/></span>
            <div className="grow"><strong>{o.id} <span className="muted-sep">·</span> {customer(o.cid).name}</strong>
              <div className="mute">{today(o.date)} · {rs(o.items.reduce((sum,l)=>sum+l.qty*l.price,0))}</div></div>
            <State value={o.status}/></div>
          <div className="progress-label"><span>{shipped} of {qty} units sent</span><span>{qty?Math.round(shipped/qty*100):0}%</span></div>
          <div className="bar"><i style={{width:(qty?shipped/qty*100:0)+"%"}}/></div>
          <div className="doc-items">{o.items.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
          <div className="card-actions">
            <button className="btn ghost sm" onClick={()=>setModal({type:"view-order",record:o})}><Eye size={15}/> View</button>
            {canEdit&&["Open","Part dispatched"].includes(o.status)&&<button className="btn sm" onClick={()=>setModal({type:"dispatch",order:o})}><Truck size={15}/> Send goods</button>}
            {canEdit&&o.status==="Open"&&<button className="btn ghost sm" onClick={()=>setModal({type:"order",record:o})}><Pencil size={15}/> Edit</button>}
            {canEdit&&["Open","Part dispatched"].includes(o.status)&&<button className="icon-btn danger" title="Cancel remaining order" onClick={()=>confirm("Cancel customer order?",
              "Any goods already sent will stay in delivery history.","/customer-orders/"+o.n)}><X size={18}/></button>}
          </div>
        </div>;
      })}</div>}
  </>;
}

function Deliveries({d,customer,product,setModal,canEdit,reason}) {
  const [tab,setTab]=useState("deliveries");
  return <>
    <SectionHeading title="Deliveries & returns" sub="Track what was sent to customer companies, and any goods returned."/>
    <div className="tabs"><button className={tab==="deliveries"?"on":""} onClick={()=>setTab("deliveries")}>Delivery notes</button>
      <button className={tab==="returns"?"on":""} onClick={()=>setTab("returns")}>Customer returns</button></div>
    {tab==="deliveries"?(!d.deliveries.length?<Empty Icon={Truck} title="No deliveries yet" sub="Open a customer order and select Send goods."/>:
      <div className="list">{d.deliveries.map(x=><div className="card compact-doc" key={x.n}>
        <div className="doc-top"><span className="row-icon"><Truck/></span><div className="grow"><strong>{x.id} <span className="muted-sep">·</span> {customer(x.cid).name}</strong>
          <div className="mute">{today(x.date)} · From {one(d.orders,x.orderN)?.id || "customer order"} · Sent by {x.byName||"staff"}</div></div><State value={x.status}/></div>
        <div className="doc-items">{x.lines.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
        {x.note&&<p className="mute">{x.note}</p>}
        <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:"view-delivery",record:x})}><Printer size={15}/> View / Print</button>
          {canEdit&&x.status==="Active"&&<button className="btn ghost sm" onClick={()=>setModal({type:"return",delivery:x})}><RotateCcw size={15}/> Customer return</button>}
          {canEdit&&x.status==="Active"&&<button className="icon-btn danger" title="Reverse delivery" onClick={()=>reason("Reverse "+x.id,
            "This restores the sent quantities to stock. Deliveries with returns cannot be reversed.","/deliveries/"+x.n+"/reverse","deliveries")}>
            <X size={18}/></button>}</div>
      </div>)}</div>) :
      (!d.returns.length?<Empty Icon={RotateCcw} title="No customer returns" sub="Returned goods will appear here."/>:
      <div className="list">{d.returns.map(r=><div className="card compact-doc" key={r.n}>
        <div className="doc-top"><span className="row-icon"><RotateCcw/></span><div className="grow"><strong>{r.id} <span className="muted-sep">·</span> {customer(r.cid).name}</strong>
          <div className="mute">{today(r.date)} · Delivery {one(d.deliveries,r.deliveryN)?.id}</div></div><State value={r.status}/></div>
        <div className="doc-items">{r.lines.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
        <p className="mute">Reason: {r.note}</p>
        {canEdit&&r.status==="Active"&&<div className="card-actions"><button className="btn ghost sm" onClick={()=>reason("Reverse "+r.id,
          "This removes the returned quantity from stock and keeps a record of the correction.","/returns/"+r.n+"/reverse","deliveries")}>
          <RotateCcw size={15}/> Reverse return</button></div>}
      </div>)}</div>)}
  </>;
}

function StockHistory({d,product,user,setModal}) {
  const [q,setQ]=useState("");
  const rows=d.movements.filter(m=>[product(m.pid).name,m.type,m.reference,m.actor,m.note].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title="Stock history" sub="A permanent record of goods received, sent out, returned and corrected."
      action={user.role==="admin"?()=>setModal({type:"adjust"}):null} label="Correct stock" Icon={RefreshCw}/>
    <SearchBox value={q} change={setQ} placeholder="Search items, documents, people…"/>
    {!rows.length?<Empty Icon={History} title="No stock movements" sub="Movements appear after stock is added, received, sent or corrected."/>:
      <div className="card history-wrap"><div className="history-head history-row"><span>Item / action</span><span>Reference</span><span>Quantity</span><span>Recorded by / date</span></div>
      {rows.map(m=><div className="history-row" key={m.id}><div className="history-item"><span className={"delta-icon "+(m.qty>=0?"plus":"minus")}>
        {m.qty>=0?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>}</span>
        <div><strong>{product(m.pid).name}</strong><small>{m.type}{m.note?" · "+m.note:""}</small></div></div>
        <div className="history-ref">{m.reference}</div><div className={"history-qty "+(m.qty>=0?"positive":"negative")}>{m.qty>0?"+":""}{m.qty}</div>
        <div className="mute history-date">{m.actor}<small>{m.at}</small></div></div>)}</div>}
    {d.movements.length>=1000&&<p className="mute">Showing the latest 1,000 movements.</p>}
  </>;
}

function Staff({ staff,user,setModal,confirm }) {
  return <>
    <SectionHeading title="Staff access" sub="Give people access without sharing the admin password."
      action={()=>setModal({type:"staff"})} label="Add staff member"/>
    <div className="grid directory-grid">{staff.map(s=><div className="card directory-card" key={s.id}>
      <div className="record-head"><span className="record-avatar"><Shield size={23}/></span><Pill kind={s.active?"good":"off"}>{s.active?"Active":"Disabled"}</Pill></div>
      <h3>{s.username}</h3><p className="mute">{s.role==="admin"?"Administrator":s.role==="staff"?"Can manage stock":"Can view only"}</p>
      <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:"staff",record:s})}><Pencil size={15}/> Edit</button>
        {s.id!==user.id&&s.active===1&&<button className="icon-btn danger" title="Disable account" onClick={()=>confirm("Disable "+s.username+"?",
          "This person will no longer be able to sign in.","/staff/"+s.id,"DELETE","staff")}><Trash2 size={16}/></button>}</div>
    </div>)}</div>
  </>;
}

function Dialog({ modal, ctx, staff, close }) {
  const {d,branch,customer,product,action,busy,user}=ctx;
  if(modal.type==="confirm") return <Modal title={modal.title} sub={modal.text} close={close}>
    <div className="notice"><Info size={20}/> Historical records are kept for stock accuracy.</div>
    <div className="form-actions"><button className="btn" disabled={busy} onClick={modal.execute}>Yes, continue</button>
      <button className="btn ghost" onClick={close}>Keep it</button></div></Modal>;
  if(modal.type==="reason") return <ReasonDialog modal={modal} busy={busy} close={close}/>;
  if(modal.type==="branch"||modal.type==="customer") return <DirectoryForm modal={modal} close={close} busy={busy} action={action}/>;
  if(modal.type==="product") return <ProductForm modal={modal} close={close} busy={busy} action={action} d={d}/>;
  if(modal.type==="po") return <DocumentForm modal={modal} close={close} busy={busy} action={action} d={d} kind="po"/>;
  if(modal.type==="order") return <DocumentForm modal={modal} close={close} busy={busy} action={action} d={d} kind="order"/>;
  if(modal.type==="grn") return <MovementForm title="Receive goods (GRN)" type="grn" doc={modal.po} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="dispatch") return <MovementForm title="Send goods to customer" type="dispatch" doc={modal.order} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="return") return <MovementForm title="Customer return" type="return" doc={modal.delivery} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="adjust") return <AdjustmentForm d={d} record={modal.record} busy={busy} close={close} action={action}/>;
  if(modal.type==="staff") return <StaffForm record={modal.record} close={close} busy={busy} action={action}/>;
  if(["view-po","view-order","view-delivery"].includes(modal.type)) return <DocumentView modal={modal} d={d} branch={branch} customer={customer} product={product} close={close}/>;
  return null;
}
function ReasonDialog({modal,busy,close}) {
  const [reason,setReason]=useState("");
  return <Modal title={modal.title} sub={modal.sub} close={close}>
    <form onSubmit={e=>{e.preventDefault();modal.execute(reason);}}>
      <label>Why are you reversing this?</label><textarea autoFocus rows={3} value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="Example: Wrong quantity entered" required/>
      <Controls busy={busy} valid={reason.trim().length>0} close={close} label="Save reversal"/>
    </form>
  </Modal>;
}
function DirectoryForm({modal,close,busy,action}) {
  const isBranch=modal.type==="branch",record=modal.record;
  const [f,setF]=useState(()=>record?{...record}:{name:"",contact:"",phone:"",location:"",address:"",active:1});
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  const route=isBranch?"branches":"customers";
  return <Modal title={(record?"Edit ":"Add ")+(isBranch?"Supun branch":"customer company")} sub="Fill in the details below." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/"+route+(record?"/"+record.id:""),record?"PUT":"POST",f,(isBranch?"Branch":"Company")+" saved.");}}>
      <label>{isBranch?"Branch name":"Company name"} *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder={isBranch?"Example: Supun Branch 01":"Example: ABC Company"}/>
      <label>Contact person</label><input value={f.contact||""} onChange={e=>set("contact",e.target.value)} placeholder="Contact name"/>
      <label>Phone</label><input type="tel" value={f.phone||""} onChange={e=>set("phone",e.target.value)} placeholder="Contact number"/>
      <label>{isBranch?"Branch location":"Delivery address"}</label><textarea rows={2} value={(isBranch?f.location:f.address)||""} onChange={e=>set(isBranch?"location":"address",e.target.value)} placeholder="Address or location"/>
      {record&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Active (available in new orders)</label>}
      <Controls busy={busy} close={close} label={record?"Update details":"Add "+(isBranch?"branch":"company")} valid={f.name.trim().length>0}/>
    </form>
  </Modal>;
}
function ProductForm({modal,close,busy,action,d}) {
  const p=modal.record,branches=active(d.branches);
  const [f,setF]=useState(()=>p?{...p}:{name:"",sku:"",emoji:"📦",img:null,sid:branches[0]?.id||"",unit:"pieces",cost:0,sell:0,stock:0,reorder:5,active:1});
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  const upload=e=>{
    const file=e.target.files?.[0]; if(!file)return;
    if(!file.type.startsWith("image/"))return;
    const reader=new FileReader();
    reader.onload=()=>{const img=new Image();img.onload=()=>{
      const canvas=document.createElement("canvas"),scale=Math.min(1,460/Math.max(img.width,img.height));
      canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      set("img",canvas.toDataURL("image/jpeg",.78));
    };img.src=reader.result;};
    reader.readAsDataURL(file);
  };
  return <Modal title={p?"Edit item":"Add new item"} sub="Pictures and simple names help staff find items quickly." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/products"+(p?"/"+p.id:""),p?"PUT":"POST",f,"Item saved.");}}>
      <label>Item name *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Example: Cleaning liquid 1L"/>
      <div className="two"><div><label>Item code (optional)</label><input value={f.sku||""} onChange={e=>set("sku",e.target.value)} placeholder="ITEM-001"/></div>
        <div><label>Counted in</label><input value={f.unit} onChange={e=>set("unit",e.target.value)} placeholder="pieces, packs, bottles" required/></div></div>
      <label>Picture or icon</label><div className="upload-row"><Picture p={f}/>
        <label className="btn ghost sm file-picker"><Camera size={16}/> Upload photo<input type="file" hidden accept="image/*" onChange={upload}/></label>
        <select aria-label="Choose icon" value={f.emoji} onChange={e=>set("emoji",e.target.value)} className="emoji-picker">
          {["📦","🥛","🍚","🥚","🧴","🧻","🛍️","🧹","📄","💻","🪑","🧽","🔧","🧃"].map(v=><option key={v}>{v}</option>)}</select>
        {f.img&&<button type="button" className="text-button" onClick={()=>set("img",null)}>Remove photo</button>}</div>
      <label>Usual Supun branch *</label><select required value={f.sid} onChange={e=>set("sid",Number(e.target.value))}>
        <option value="">Select a branch</option>{d.branches.filter(x=>x.active||x.id===f.sid).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <div className="notice"><Info size={18}/> You can still request this item from any other branch in a PO.</div>
      <div className="two"><div><label>Buying price (Rs)</label><input type="number" min="0" step=".01" value={f.cost} onChange={e=>set("cost",e.target.value)} required/></div>
        <div><label>Selling price (Rs)</label><input type="number" min="0" step=".01" value={f.sell} onChange={e=>set("sell",e.target.value)} required/></div></div>
      <div className="two">{!p&&<div><label>Starting stock</label><input type="number" min="0" step="1" value={f.stock} onChange={e=>set("stock",e.target.value)} required/></div>}
        <div><label>Warn when stock reaches</label><input type="number" min="0" step="1" value={f.reorder} onChange={e=>set("reorder",e.target.value)} required/></div></div>
      {p&&<div className="notice"><Info size={18}/> Current stock: <strong>{p.stock} {p.unit}</strong>. Use "Correct stock" for changes, so history is saved.</div>}
      {p&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Active item</label>}
      <Controls busy={busy} close={close} valid={!!f.name.trim()&&!!f.sid} label={p?"Update item":"Add item"}/>
    </form>
  </Modal>;
}
function DocumentForm({modal,close,busy,action,d,kind}) {
  const purchase=kind==="po",record=modal.record;
  const parties=active(purchase?d.branches:d.customers);
  const [party,setParty]=useState(record?(purchase?record.sid:record.cid):(parties[0]?.id||""));
  const [quantities,setQuantities]=useState(()=>Object.fromEntries((record?.items||[]).map(l=>[l.pid,l.qty])));
  const [prices,setPrices]=useState(()=>Object.fromEntries((record?.items||[]).map(l=>[l.pid,purchase?l.cost:l.price])));
  const [query,setQuery]=useState(""),[note,setNote]=useState(record?.note||"");
  const items=active(d.products).filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
  const lines=d.products.filter(p=>number(quantities[p.id])>0).map(p=>({pid:p.id,qty:number(quantities[p.id]),
    [purchase?"cost":"price"]:number(prices[p.id]??(purchase?p.cost:p.sell))}));
  const total=lines.reduce((s,l)=>s+l.qty*(purchase?l.cost:l.price),0);
  const route=purchase?"/pos":"/customer-orders";
  const handle=e=>{
    e.preventDefault();
    action(route+(record?"/"+record.n:""),record?"PUT":"POST",purchase?{sid:Number(party),items:lines}:{cid:Number(party),items:lines,note},
      (purchase?"Stock request":"Customer order")+" saved.",purchase?"pos":"orders");
  };
  return <Modal wide title={purchase?(record?"Edit stock request":"Request stock from branch"):(record?"Edit customer order":"New customer order")}
    sub={purchase?"Make a PO for any Supun branch. Stock changes only after goods are received.":"Choose a company, then select what they want to order."} close={close}>
    <form onSubmit={handle}>
      <label>{purchase?"Supun branch":"Customer company"} *</label><select value={party} required onChange={e=>setParty(e.target.value)}>
        <option value="">Choose {purchase?"branch":"company"}</option>
        {(record?[...parties,...(purchase?d.branches:d.customers).filter(x=>x.id===(purchase?record.sid:record.cid)&&!x.active)]:parties).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <div className="notice"><Info size={18}/>{purchase?"An item can be requested from any branch, even if it has a different usual branch.":"You cannot send more than the available stock when making a delivery."}</div>
      <h4>Select items & quantities</h4><SearchBox value={query} change={setQuery} placeholder="Find an item…"/>
      <div className="form-item-list">{items.length?items.map(p=>{
        const qty=number(quantities[p.id]),price=number(prices[p.id]??(purchase?p.cost:p.sell));
        return <div className="form-item" key={p.id}><Picture p={p}/><div className="grow">
          <strong>{p.name}</strong><small>{p.stock} {p.unit} available · {rs(price)}</small></div>
          <Qty value={qty} onChange={v=>setQuantities(o=>({...o,[p.id]:v}))}/>
          {qty>0&&<label className="tiny-price">Rs <input aria-label={"Price for "+p.name} type="number" min="0" step=".01" value={prices[p.id]??(purchase?p.cost:p.sell)}
            onChange={e=>setPrices(o=>({...o,[p.id]:e.target.value}))}/></label>}</div>;
      }):<p className="mute">No matching active items.</p>}</div>
      {!purchase&&<><label>Order notes (optional)</label><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Customer request or delivery instructions"/></>}
      <div className="order-total"><span>{lines.length} item(s) selected</span><strong>Total: {rs(total)}</strong></div>
      <Controls busy={busy} close={close} valid={!!party&&lines.length>0} label={record?"Update order":purchase?"Create PO":"Create customer order"}/>
    </form>
  </Modal>;
}
function MovementForm({title,type,doc,d,close,busy,action}) {
  const isGRN=type==="grn",isReturn=type==="return";
  const [q,setQ]=useState({}),[by,setBy]=useState(""),[note,setNote]=useState("");
  const existing=doc.items||doc.lines;
  const options=existing.map(l=>{
    const p=one(d.products,l.pid);
    const before=isGRN?l.qty-l.received: isReturn ? l.qty-d.returns.filter(r=>r.deliveryN===doc.n&&r.status==="Active")
      .reduce((sum,r)=>sum+(r.lines.find(x=>x.pid===l.pid)?.qty||0),0):l.qty-l.dispatched;
    const max=isGRN||isReturn?before:Math.min(before,p?.stock||0);
    return {...l,p,max:Math.max(0,max),remaining:before};
  });
  const lines=options.filter(l=>number(q[l.pid])>0).map(l=>({pid:l.pid,qty:number(q[l.pid])}));
  const destination=isGRN?"/pos/"+doc.n+"/receive":isReturn?"/returns":"/customer-orders/"+doc.n+"/dispatch";
  const label=isGRN?"Save GRN and add stock":isReturn?"Save return and add stock":"Create delivery and reduce stock";
  const hint=isGRN?"Enter ONLY what actually arrived. Stock increases when saved.":isReturn?
    "Returned units will go back into available stock.":"Only sent goods reduce stock. You can send the remaining items later.";
  const handle=e=>{e.preventDefault();action(destination,"POST",isReturn?{deliveryN:doc.n,lines,note}:{lines,note,by},
    isGRN?"GRN saved — stock increased.":isReturn?"Customer return saved — stock increased.":"Delivery saved — stock decreased.",
    isGRN?"grns":"deliveries");};
  return <Modal wide title={title} sub={hint} close={close}>
    <form onSubmit={handle}>
      <div className="notice"><Info size={19}/> {isGRN?"From PO":isReturn?"From delivery":"From customer order"}: <strong>{doc.id}</strong></div>
      <div className="form-item-list">{options.map(l=><div className="form-item" key={l.pid}>
        <Picture p={l.p}/><div className="grow"><strong>{l.p?.name}</strong>
          <small>{isGRN?"Still expected":isReturn?"Can be returned":"Still requested"}: {l.remaining} · {l.p?.stock} currently in stock</small></div>
        {l.max>0?<Qty value={number(q[l.pid])} max={l.max} onChange={v=>setQ(o=>({...o,[l.pid]:v}))}/>:<Pill kind="off">0 available</Pill>}
      </div>)}</div>
      {!isReturn&&<><label>{isGRN?"Received by":"Sent by"}</label><input value={by} onChange={e=>setBy(e.target.value)} placeholder="Your name (optional — login name is used if empty)"/></>}
      <label>{isReturn?"Why are the goods being returned? *":"Notes (optional)"}</label>
      <textarea rows={3} required={isReturn} value={note} onChange={e=>setNote(e.target.value)} placeholder={isReturn?"Example: Damaged or extra goods":"Optional delivery notes"}/>
      <Controls busy={busy} close={close} valid={lines.length>0&&(!isReturn||!!note.trim())} label={label}/>
    </form>
  </Modal>;
}
function AdjustmentForm({d,record,busy,close,action}) {
  const [pid,setPid]=useState(record?.id||active(d.products)[0]?.id||""),[change,setChange]=useState(""),[reason,setReason]=useState("");
  const selected=one(d.products,pid);
  return <Modal title="Correct stock quantity" sub="Every correction is saved in stock history with your name." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/adjustments","POST",{pid:Number(pid),change:Number(change),reason},"Stock correction recorded.","history");}}>
      <label>Item</label><select required value={pid} onChange={e=>setPid(e.target.value)}>{active(d.products).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <div className="notice"><Package size={18}/> Current stock: <strong>{selected?.stock||0} {selected?.unit||""}</strong></div>
      <label>Change amount *</label><input required type="number" step="1" value={change} onChange={e=>setChange(e.target.value)} placeholder="Example: -2 for damage, +3 for correction"/>
      <p className="mute">Positive adds stock (+5). Negative removes stock (-5).</p>
      <label>Why is this change needed? *</label><textarea required rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the change for future reference"/>
      <Controls busy={busy} close={close} valid={!!pid&&Number.isInteger(Number(change))&&Number(change)!==0&&!!reason.trim()} label="Save stock correction"/>
    </form>
  </Modal>;
}
function StaffForm({record,busy,close,action}) {
  const [f,setF]=useState(()=>record?{...record,password:""}:{username:"",password:"",role:"staff",active:1});
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  return <Modal title={record?"Edit staff member":"Add staff member"} sub="Admins manage settings; staff can work with stock; viewers can only read." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/staff"+(record?"/"+record.id:""),record?"PUT":"POST",f,"Staff account saved.","staff");}}>
      <label>Username *</label><input required value={f.username} onChange={e=>set("username",e.target.value)} autoComplete="off"/>
      <label>{record?"New password (leave blank to keep old password)":"Password (8 characters minimum) *"}</label>
      <input type="password" minLength={8} required={!record} value={f.password} onChange={e=>set("password",e.target.value)} autoComplete="new-password"/>
      <label>Access level</label><select value={f.role} onChange={e=>set("role",e.target.value)}>
        <option value="staff">Staff — receive & deliver goods</option><option value="viewer">Viewer — read only</option><option value="admin">Admin — full access</option></select>
      {record&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Account active</label>}
      <Controls busy={busy} close={close} valid={!!f.username.trim()&&(!!record||f.password.length>=8)} label="Save staff account"/>
    </form>
  </Modal>;
}
function DocumentView({modal,d,branch,customer,product,close}) {
  const doc=modal.record,isPo=modal.type==="view-po",isDelivery=modal.type==="view-delivery";
  const lines=doc.items||doc.lines;
  const name=isPo?branch(doc.sid).name:isDelivery?customer(doc.cid).name:customer(doc.cid).name;
  return <Modal wide title={doc.id} sub={(isPo?"Stock request · ":isDelivery?"Delivery note · ":"Customer order · ")+name} close={close}>
    <div className="print-sheet">
      <div className="print-sheet-heading"><strong>StockEasy · Supun Group</strong><State value={doc.status}/></div>
      <div className="summary-grid"><div><span>Document</span><strong>{doc.id}</strong></div><div><span>{isPo?"From branch":"Customer company"}</span><strong>{name}</strong></div>
        <div><span>Date</span><strong>{today(doc.date)}</strong></div></div>
      <div className={"document-table" + (isDelivery ? " two-col" : "")}><div className="document-table-head"><strong>Item</strong><strong>Quantity</strong>{!isDelivery&&<strong>Amount</strong>}</div>
        {lines.map(l=><div className="document-table-row" key={l.pid}><span>{product(l.pid).name}</span><span>{l.qty} {product(l.pid).unit}</span>
          {!isDelivery&&<span>{rs(l.qty*(isPo?l.cost:l.price))}</span>}</div>)}</div>
      {!isDelivery&&<div className="order-total"><span>Total</span><strong>{rs(lines.reduce((s,l)=>s+l.qty*(isPo?l.cost:l.price),0))}</strong></div>}
      {doc.note&&<p className="mute">Notes: {doc.note}</p>}
    </div>
    <div className="form-actions print-actions"><button className="btn" onClick={()=>window.print()}><Printer size={17}/> Print document</button>
      <button className="btn ghost" onClick={close}>Close</button></div>
  </Modal>;
}
