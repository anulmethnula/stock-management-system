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
  ["home", "Home"], ["products", "Items"], ["branches", "Suppliers"],
  ["customers", "Customers"], ["pos", "Stock requests"], ["grns", "Goods received"],
  ["orders", "Customer orders"], ["deliveries", "Deliveries"], ["history", "Stock history"], ["staff", "Staff"]
];
const PRODUCT_CATEGORIES = ["Helmets", "Electrical", "Safety gear", "Raw materials", "Packaging", "Tools", "Other"];
const PAGE_FEATURE = {home:"dashboard",products:"products",branches:"suppliers",customers:"customers",pos:"purchase_orders",grns:"goods_received",orders:"customer_orders",deliveries:"deliveries",history:"stock_history",staff:"staff"};
const ACCESS_MODULES = [["dashboard","Dashboard"],["products","Items & stock counts"],["suppliers","Suppliers"],["customers","Customers"],["purchase_orders","Stock requests (PO)"],["goods_received","Goods received (GRN)"],["customer_orders","Customer orders"],["deliveries","Deliveries & returns"],["stock_history","Stock history"]];
const defaultAccess = role => Object.fromEntries(ACCESS_MODULES.map(([key])=>[key,role==="viewer"?"view":"edit"]));
const accessLevel = (user,feature) => user?.role==="admin"?"edit":user?.permissions?.[feature]||(feature==="staff"?"none":user?.role==="viewer"?"view":"edit");

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
  const [productFocus,setProductFocus]=useState(null);
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
  useEffect(() => {
    if (!user || accessLevel(user,PAGE_FEATURE[page])!=="none") return;
    const first=MENU.find(([key])=>accessLevel(user,PAGE_FEATURE[key])!=="none");
    if(first) setPage(first[0]);
  }, [user,page]);

  const canEdit = accessLevel(user,PAGE_FEATURE[page]) === "edit";
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

  const openProduct=pid=>{if(accessLevel(user,"products")==="none"){setError("You do not have access to Items.");setModal(null);return;}setProductFocus(pid);setPage("products");setModal(null);};
  const ctx = { d, branch, customer, product, canEdit, user, action, busy, setModal, confirm, reason, productFocus, setProductFocus, openProduct };
  return <div className="app">
    <aside className="side">
      <div className="logo"><img className="brand-full-logo" src="/logo.png" alt="Supun Group of Companies"/></div>
      <nav className="side-menu" aria-label="Main navigation">
        {MENU.filter(([key]) => accessLevel(user,PAGE_FEATURE[key]) !== "none").map(([key, label]) => {
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
    <div className="login-intro"><div className="login-brand"><img className="brand-full-logo" src="/logo.png" alt="Supun Group of Companies"/></div>
      <h1>All your stock.<br/><span>One simple place.</span></h1>
      <p>From suppliers to customer companies — keep every item accounted for.</p>
      <div className="login-path"><span><Building2/> Suppliers</span><ArrowRight/><span><PackageCheck/> Receive</span><ArrowRight/><span><Truck/> Deliver</span></div>
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
    {pending.length>0 && <><h2 className="list-heading">Waiting for supplier deliveries</h2><div className="list">
      {pending.slice(0,4).map(po=><div className="card compact-row" key={po.n}><span className="row-icon"><ClipboardList/></span>
        <div className="grow"><strong>{po.id}</strong><div className="mute">{branch(po.sid).name} · {today(po.date)}</div></div>
        <State value={po.status}/>{canEdit && <button className="btn sm" onClick={() => setModal({ type: "grn", po })}>Receive goods</button>}</div>)}
    </div></>}
  </>;
}

function Directory({ d, type, setModal, confirm, canEdit }) {
  const isBranch = type === "branches", list = d[type];
  const [q,setQ]=useState(""), [showArchived,setShowArchived]=useState(false), [recordFilter,setRecordFilter]=useState("all");
  const typeOf=x=>isBranch?x.supplier_type:x.customer_type;
  const filtered=list.filter(x => (showArchived||x.active) && (recordFilter==="all"||typeOf(x)===recordFilter) && [x.name,x.contact,x.phone,x.phone2,x.location,x.address,x.notes].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title={isBranch?"Suppliers":"Customer companies"}
      sub={isBranch?"Manage internal Supun locations and external supply partners.":"Companies that receive goods from you."}
      action={canEdit?()=>setModal({type:isBranch?"branch":"customer"}):null} label={isBranch?"Add supplier":"Add company"}/>
    <div className="list-tools"><SearchBox value={q} change={setQ} placeholder={isBranch?"Search branches…":"Search companies…"}/>
      <div className="supplier-filters" role="group" aria-label={isBranch?"Filter suppliers":"Filter customers"}>
        {[["all","All"],["internal","Internal"],["external","External"]].map(([key,label])=><button key={key} className={recordFilter===key?"on":""} onClick={()=>setRecordFilter(key)}>{label}<small>{list.filter(x=>x.active&&(key==="all"||typeOf(x)===key)).length}</small></button>)}
      </div>
      <label className="toggle-archived"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show removed</label></div>
    {!filtered.length?<Empty Icon={isBranch?Building2:Users} title="Nothing found" sub="Add a new record or try another search."/>:
      <div className="grid directory-grid">{filtered.map(x=><div className={"card directory-card pop supplier-card "+(isBranch?"supplier-"+(x.supplier_type||"external"):"customer-"+(x.customer_type||"external"))} key={x.id}>
        <div className="record-head"><span className="record-avatar">{(isBranch?x.supplier_type:x.customer_type)==="internal"?<Building2 size={23}/>:isBranch?<Truck size={23}/>:<Users size={23}/>}</span>
          <div className="record-states"><Pill kind={(isBranch?x.supplier_type:x.customer_type)==="internal"?"neutral":"warn"}>{(isBranch?x.supplier_type:x.customer_type)==="internal"?"Internal":"External"}</Pill><Pill kind={x.active?"good":"off"}>{x.active?"Active":"Removed"}</Pill></div></div>
        <h3>{x.name}</h3><p className="mute">{x.location||x.address||"No location added"}</p>
        <div className="contact-details">{x.contact&&<span>👤 {x.contact}</span>}{x.phone&&<span>📞 {x.phone}</span>}{x.phone2&&<span>📱 {x.phone2}</span>}</div>
        {x.notes&&<p className="record-note">{x.notes}</p>}
        {canEdit && <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:isBranch?"branch":"customer",record:x})}>
          <Pencil size={15}/> Edit {x.active?"":" / Restore"}</button>
          {x.active===1&&<button className="icon-btn danger" title="Remove" onClick={()=>confirm("Remove "+x.name+"?",
            "This will hide the record from new forms. Old orders and history will be kept.",
            "/"+type+"/"+x.id)}><Trash2 size={17}/></button>}</div>}
      </div>)}</div>}
  </>;
}

function Products({d,branch,setModal,confirm,canEdit,user,productFocus,setProductFocus}) {
  const [q,setQ]=useState(""), [showArchived,setShowArchived]=useState(false), [category,setCategory]=useState("all"), [stockFilter,setStockFilter]=useState("all");
  const categories=[...new Set([...PRODUCT_CATEGORIES,...d.products.map(p=>p.category||"Other")])];
  const filtered=d.products.filter(p => (showArchived||p.active) && (category==="all"||p.category===category) && (stockFilter==="all"||stockLevel(p)===stockFilter) && [p.name,p.sku,p.category,branch(p.sid).name].join(" ").toLowerCase().includes(q.toLowerCase()));
  useEffect(()=>{if(!productFocus)return;const target=one(d.products,productFocus);if(target){setQ(target.name);setCategory("all");setStockFilter("all");setShowArchived(!target.active);}setProductFocus(null);},[productFocus]);
  return <>
    <SectionHeading title="Factory inventory" sub="Helmets, electrical components, safety equipment and manufacturing materials."
      action={canEdit?()=>setModal({type:"product"}):null} label="Add item"/>
    <div className="list-tools product-tools"><SearchBox value={q} change={setQ} placeholder="Search name, code, category or supplier…"/>
      <select className="filter-select" aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <select className="filter-select" aria-label="Filter by stock status" value={stockFilter} onChange={e=>setStockFilter(e.target.value)}><option value="all">All stock levels</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      <label className="toggle-archived"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show removed</label></div>
    <div className="result-count"><strong>{filtered.length}</strong> of {d.products.length} items shown{category!=="all"?` in ${category}`:""}</div>
    {!filtered.length?<Empty title="No matching items" sub="Add an item or change your search."/>:
      <div className="grid product-grid">{filtered.map((p,i)=><div className="card product-card pop" style={{"--i":i}} key={p.id}>
        <div className="pic"><Picture p={p} large/></div>
        <div className="product-main"><div className="product-title"><strong>{p.name}</strong>
          {!p.active?<Pill kind="off">Removed</Pill>:<Pill kind={stockLevel(p)==="ok"?"good":stockLevel(p)==="low"?"warn":"off"}>
            {stockLevel(p)==="ok"?"In stock":stockLevel(p)==="low"?"Low":"Out of stock"}</Pill>}</div>
          <div className="product-meta"><span className="category-tag">{p.category||"Other"}</span><span>{p.sku||"No item code"}</span><span>{branch(p.sid).name}</span></div>
          <div className="product-metrics"><div><small>Available</small><strong>{p.stock} <em>{p.unit}</em></strong></div>
            <div><small>Buy price</small><strong>{rs(p.cost)}</strong></div><div><small>Sell price</small><strong>{rs(p.sell)}</strong></div></div></div>
        {canEdit && <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:"product",record:p})}><Pencil size={15}/> Edit</button>
          {user.role==="admin"&&<button className="btn ghost sm" onClick={()=>setModal({type:"adjust",record:p})}><RefreshCw size={15}/> Update stock</button>}
          {p.active===1&&<button className="icon-btn danger" title="Remove item" onClick={()=>confirm("Remove item?","This item will be hidden, but all stock history stays available.","/products/"+p.id)}><Trash2 size={16}/></button>}</div>}
      </div>)}</div>}
  </>;
}

function PurchaseOrders({ d,branch,product,setModal,confirm,canEdit }) {
  const [q,setQ]=useState(""),[supplierFilter,setSupplierFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("open");
  const suppliers=[...new Set(d.pos.map(o=>o.sid))].map(id=>branch(id));
  const list=d.pos.filter(o => (supplierFilter==="all"||Number(supplierFilter)===o.sid) && (statusFilter==="all"||(statusFilter==="open"?["Ordered","Part received"].includes(o.status):o.status===statusFilter)) && [o.id,branch(o.sid).name,o.status,...o.items.map(i=>product(i.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title="Stock requests (PO)" sub="Request goods from any supplier. A PO does not add stock until a GRN is saved."
      action={canEdit?()=>setModal({type:"po"}):null} label="Request stock"/>
    <div className="list-tools po-tools"><SearchBox value={q} change={setQ} placeholder="Search PO, supplier or item…"/>
      <select className="filter-select" value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)} aria-label="Filter by supplier"><option value="all">All suppliers</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="open">Waiting to receive</option><option value="Ordered">Ordered</option><option value="Part received">Part received</option><option value="Received">Received</option><option value="Cancelled">Cancelled</option><option value="Part cancelled">Part cancelled</option><option value="all">All statuses</option></select></div>
    <div className="result-count"><strong>{list.length}</strong> of {d.pos.length} stock requests shown</div>
    {!list.length?<Empty Icon={ClipboardList} title="No matching stock requests" sub="Change the filters or create a new request."/>:
      <div className="po-table-wrap"><div className="po-table-head po-table-row"><span>PO / Date</span><span>Supplier</span><span>Items</span><span>Receiving progress</span><span>Total</span><span>Status</span><span>Actions</span></div>
        {list.map(po=>{const qty=po.items.reduce((a,x)=>a+x.qty,0),received=po.items.reduce((a,x)=>a+x.received,0),total=po.items.reduce((a,x)=>a+x.qty*x.cost,0),percent=qty?Math.round(received/qty*100):0;return <div className="po-table-row" key={po.n}>
          <div className="po-ref"><strong>{po.id}</strong><small>{today(po.date)}</small></div>
          <div className="po-supplier"><span className="row-icon"><ClipboardList size={18}/></span><strong>{branch(po.sid).name}</strong></div>
          <div className="po-item-summary"><strong>{po.items.length} item{po.items.length===1?"":"s"}</strong><small>{po.items.slice(0,2).map(l=>product(l.pid).name).join(", ")}{po.items.length>2?` +${po.items.length-2} more`:""}</small></div>
          <div className="po-progress"><div><strong>{received}/{qty}</strong><small>{qty-received} remaining</small><b>{percent}%</b></div><div className="bar"><i style={{width:percent+"%"}}/></div></div>
          <strong className="po-total">{rs(total)}</strong><State value={po.status}/>
          <div className="po-actions"><button className="icon-btn" title="View all details" onClick={()=>setModal({type:"view-po",record:po})}><Eye size={17}/></button>
            {canEdit&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn primary-icon" title="Receive goods" onClick={()=>setModal({type:"grn",po})}><PackageCheck size={17}/></button>}
            {canEdit&&po.status==="Ordered"&&<button className="icon-btn" title="Edit request" onClick={()=>setModal({type:"po",record:po})}><Pencil size={16}/></button>}
            {canEdit&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn danger" title="Cancel remaining request" onClick={()=>confirm("Cancel this stock request?","No goods will be removed from stock. Any GRNs already saved will stay in history.","/pos/"+po.n)}><X size={17}/></button>}</div>
        </div>})}</div>}
  </>;
}

function GoodsReceived({d,branch,product,canEdit,reason,setModal}) {
  return <>
    <SectionHeading title="Goods received (GRN)" sub="Every delivery received from a supplier increases your stock."/>
    {!d.grns.length?<Empty Icon={PackageCheck} title="No goods received yet" sub="Open a stock request and select Receive goods."/>:
      <div className="list">{d.grns.map(g=><div className="card compact-doc" key={g.n}>
        <div className="doc-top"><span className="row-icon"><PackageCheck/></span><div className="grow">
          <strong>{g.id} <span className="muted-sep">·</span> {g.poId}</strong>
          <div className="mute">{branch(g.sid).name} · {today(g.date)} · Received by {g.by}</div>
        </div><State value={g.status}/></div>
        <div className="doc-items">{g.lines.map(l=><span key={l.pid}>{product(l.pid).name} × {l.qty}</span>)}</div>
        {g.note&&<p className="mute">Note: {g.note}</p>}
        <div className="card-actions">
          <button className="btn ghost sm" onClick={()=>setModal({type:"view-grn",record:g})}><Printer size={15}/> View / Print</button>
          {canEdit&&g.status==="Active"&&<button className="btn ghost sm" onClick={()=>reason("Reverse "+g.id,
            "This removes the received quantity from stock and records the correction.", "/grns/"+g.n+"/reverse","grns")}>
            <RotateCcw size={15}/> Reverse GRN</button>}
        </div>
      </div>)}</div>}
  </>;
}

function CustomerOrders({d,customer,product,setModal,confirm,canEdit}) {
  const [q,setQ]=useState(""),[customerFilter,setCustomerFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("open");
  const customers=[...new Set(d.orders.map(o=>o.cid))].map(id=>customer(id));
  const list=d.orders.filter(o=>(customerFilter==="all"||Number(customerFilter)===o.cid)&&(statusFilter==="all"||(statusFilter==="open"?["Open","Part dispatched"].includes(o.status):o.status===statusFilter))&&[o.id,customer(o.cid).name,o.status,...o.items.map(i=>product(i.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <>
    <SectionHeading title="Customer orders" sub="Record goods requested by customer companies before sending them."
      action={canEdit?()=>setModal({type:"order"}):null} label="New customer order"/>
    <div className="list-tools po-tools"><SearchBox value={q} change={setQ} placeholder="Search order, customer or item…"/>
      <select className="filter-select" value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="open">Waiting to send</option><option value="Open">Open</option><option value="Part dispatched">Part dispatched</option><option value="Dispatched">Dispatched</option><option value="Cancelled">Cancelled</option><option value="Part cancelled">Part cancelled</option><option value="all">All statuses</option></select></div>
    <div className="result-count"><strong>{list.length}</strong> of {d.orders.length} customer orders shown</div>
    {!list.length?<Empty Icon={ShoppingBag} title="No matching customer orders" sub="Change the filters or create a new order."/>:
      <div className="po-table-wrap"><div className="po-table-head po-table-row"><span>Order / Date</span><span>Customer</span><span>Items</span><span>Dispatch progress</span><span>Total</span><span>Status</span><span>Actions</span></div>
        {list.map(o=>{const qty=o.items.reduce((s,l)=>s+l.qty,0),shipped=o.items.reduce((s,l)=>s+l.dispatched,0),total=o.items.reduce((s,l)=>s+l.qty*l.price,0),percent=qty?Math.round(shipped/qty*100):0;return <div className="po-table-row" key={o.n}>
          <div className="po-ref"><strong>{o.id}</strong><small>{today(o.date)}</small></div>
          <div className="po-supplier"><span className="row-icon"><ShoppingBag size={18}/></span><strong>{customer(o.cid).name}</strong></div>
          <div className="po-item-summary"><strong>{o.items.length} item{o.items.length===1?"":"s"}</strong><small>{o.items.slice(0,2).map(l=>product(l.pid).name).join(", ")}{o.items.length>2?` +${o.items.length-2} more`:""}</small></div>
          <div className="po-progress"><div><strong>{shipped}/{qty}</strong><small>{qty-shipped} remaining</small><b>{percent}%</b></div><div className="bar"><i style={{width:percent+"%"}}/></div></div>
          <strong className="po-total">{rs(total)}</strong><State value={o.status}/><div className="po-actions"><button className="icon-btn" title="View all details" onClick={()=>setModal({type:"view-order",record:o})}><Eye size={17}/></button>
            {canEdit&&["Open","Part dispatched"].includes(o.status)&&<button className="icon-btn primary-icon" title="Send goods" onClick={()=>setModal({type:"dispatch",order:o})}><Truck size={17}/></button>}
            {canEdit&&o.status==="Open"&&<button className="icon-btn" title="Edit order" onClick={()=>setModal({type:"order",record:o})}><Pencil size={16}/></button>}
            {canEdit&&["Open","Part dispatched"].includes(o.status)&&<button className="icon-btn danger" title="Cancel remaining order" onClick={()=>confirm("Cancel customer order?","Any goods already sent will stay in delivery history.","/customer-orders/"+o.n)}><X size={17}/></button>}</div>
        </div>})}</div>}
  </>;
}

function Deliveries({d,customer,product,setModal,canEdit,reason}) {
  const [tab,setTab]=useState("deliveries"),[q,setQ]=useState(""),[customerFilter,setCustomerFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("all");
  const source=tab==="deliveries"?d.deliveries:d.returns;
  const customers=[...new Set(source.map(x=>x.cid))].map(id=>customer(id));
  const rows=source.filter(x=>(customerFilter==="all"||Number(customerFilter)===x.cid)&&(statusFilter==="all"||x.status===statusFilter)&&[x.id,customer(x.cid).name,x.status,x.note,...x.lines.map(l=>product(l.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  const switchTab=value=>{setTab(value);setQ("");setCustomerFilter("all");setStatusFilter("all");};
  return <>
    <SectionHeading title="Deliveries & returns" sub="Track what was sent to customer companies, and any goods returned."/>
    <div className="tabs"><button className={tab==="deliveries"?"on":""} onClick={()=>switchTab("deliveries")}>Delivery notes <small>{d.deliveries.length}</small></button>
      <button className={tab==="returns"?"on":""} onClick={()=>switchTab("returns")}>Customer returns <small>{d.returns.length}</small></button></div>
    <div className="list-tools po-tools"><SearchBox value={q} change={setQ} placeholder={tab==="deliveries"?"Search delivery, customer or item…":"Search return, customer or item…"}/>
      <select className="filter-select" value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="Active">Active</option><option value="Reversed">Reversed</option></select></div>
    <div className="result-count"><strong>{rows.length}</strong> of {source.length} {tab==="deliveries"?"deliveries":"returns"} shown</div>
    {!rows.length?<Empty Icon={tab==="deliveries"?Truck:RotateCcw} title={tab==="deliveries"?"No matching deliveries":"No matching returns"} sub="Change the filters to find another record."/>:
      <div className="movement-table-wrap"><div className="movement-table-head movement-table-row"><span>Document / Date</span><span>Customer</span><span>Source</span><span>Items</span><span>{tab==="deliveries"?"Sent by / Note":"Reason"}</span><span>Status</span><span>Actions</span></div>
        {rows.map(x=><div className="movement-table-row" key={x.n}><div className="po-ref"><strong>{x.id}</strong><small>{today(x.date)}</small></div>
          <div className="po-supplier"><span className="row-icon">{tab==="deliveries"?<Truck size={18}/>:<RotateCcw size={18}/>}</span><strong>{customer(x.cid).name}</strong></div>
          <div className="movement-source"><strong>{tab==="deliveries"?(one(d.orders,x.orderN)?.id||"Customer order"):(one(d.deliveries,x.deliveryN)?.id||"Delivery")}</strong></div>
          <div className="po-item-summary"><strong>{x.lines.reduce((sum,l)=>sum+l.qty,0)} units · {x.lines.length} item{x.lines.length===1?"":"s"}</strong><small>{x.lines.slice(0,2).map(l=>product(l.pid).name).join(", ")}{x.lines.length>2?` +${x.lines.length-2} more`:""}</small></div>
          <div className="movement-note"><strong>{tab==="deliveries"?(x.byName||"Staff"):(x.note||"No reason")}</strong>{tab==="deliveries"&&<small>{x.note||"No note"}</small>}</div><State value={x.status}/>
          <div className="po-actions"><button className="icon-btn" title="View and print" onClick={()=>setModal({type:tab==="deliveries"?"view-delivery":"view-return",record:x})}><Eye size={17}/></button>
            {tab==="deliveries"&&canEdit&&x.status==="Active"&&<button className="icon-btn primary-icon" title="Record customer return" onClick={()=>setModal({type:"return",delivery:x})}><RotateCcw size={17}/></button>}
            {canEdit&&x.status==="Active"&&<button className="icon-btn danger" title={tab==="deliveries"?"Reverse delivery":"Reverse return"} onClick={()=>reason("Reverse "+x.id,tab==="deliveries"?"This restores sent quantities to stock. Deliveries with returns cannot be reversed.":"This removes the returned quantity from stock and records the correction.",tab==="deliveries"?"/deliveries/"+x.n+"/reverse":"/returns/"+x.n+"/reverse","deliveries")}><X size={17}/></button>}</div>
        </div>)}</div>}
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
    <SectionHeading title="User access management" sub="Create accounts and choose View, Edit, or No Access for every system module."
      action={()=>setModal({type:"staff"})} label="Add user account"/>
    <div className="grid staff-grid">{staff.map(s=>{const levels=Object.values(s.permissions||{});return <div className="card directory-card staff-card" key={s.id}>
      <div className="record-head"><span className="record-avatar"><Shield size={23}/></span><Pill kind={s.active?"good":"off"}>{s.active?"Active":"Disabled"}</Pill></div>
      <h3>{s.username}</h3><p className="mute">{s.role==="admin"?"Administrator · Full system access":"Custom module access"}</p>
      {s.role!=="admin"&&<div className="access-summary"><span><strong>{levels.filter(x=>x==="edit").length}</strong>Edit</span><span><strong>{levels.filter(x=>x==="view").length}</strong>View</span><span><strong>{levels.filter(x=>x==="none").length}</strong>Hidden</span></div>}
      <div className="card-actions"><button className="btn ghost sm" onClick={()=>setModal({type:"staff",record:s})}><Pencil size={15}/> Edit access</button>
        {s.id!==user.id&&s.active===1&&<button className="icon-btn danger" title="Disable account" onClick={()=>confirm("Disable "+s.username+"?",
          "This person will no longer be able to sign in.","/staff/"+s.id,"DELETE","staff")}><Trash2 size={16}/></button>}</div>
    </div>})}</div>
  </>;
}

function Dialog({ modal, ctx, staff, close }) {
  const {d,branch,customer,product,action,busy,user,openProduct}=ctx;
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
  if(["view-po","view-order","view-delivery","view-grn","view-return"].includes(modal.type)) return <DocumentView modal={modal} d={d} branch={branch} customer={customer} product={product} openProduct={openProduct} close={close}/>;
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
  const [f,setF]=useState(()=>record?{...record}:{name:"",contact:"",phone:"",phone2:"",location:"",address:"",notes:"",supplier_type:"external",customer_type:"external",active:1});
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  const route=isBranch?"branches":"customers";
  const typeKey=isBranch?"supplier_type":"customer_type",recordType=f[typeKey]||"external";
  return <Modal title={(record?"Edit ":"Add ")+(isBranch?"supplier":"customer company")} sub="Fill in the details below." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/"+route+(record?"/"+record.id:""),record?"PUT":"POST",f,(isBranch?"Supplier":"Company")+" saved.");}}>
      <label>{isBranch?"Supplier":"Customer"} type *</label><div className="type-choice">
        <button type="button" className={recordType==="internal"?"on":""} onClick={()=>set(typeKey,"internal")}><Building2 size={18}/><span><strong>Internal</strong><small>Supun group</small></span></button>
        <button type="button" className={recordType==="external"?"on":""} onClick={()=>set(typeKey,"external")}>{isBranch?<Truck size={18}/>:<Users size={18}/>}<span><strong>External</strong><small>Outside company</small></span></button>
      </div>
      <label>{isBranch?"Supplier name":"Company name"} *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder={isBranch?"Example: Fresh Farm Foods":"Example: ABC Company"}/>
      <label>Contact person</label><input value={f.contact||""} onChange={e=>set("contact",e.target.value)} placeholder="Contact name"/>
      <div className="two"><div><label>Primary phone</label><input type="tel" value={f.phone||""} onChange={e=>set("phone",e.target.value)} placeholder="Contact number"/></div>
      <div><label>Secondary phone</label><input type="tel" value={f.phone2||""} onChange={e=>set("phone2",e.target.value)} placeholder="Alternative number"/></div></div>
      <label>{isBranch?"Supplier location":"Delivery address"}</label><textarea rows={2} value={(isBranch?f.location:f.address)||""} onChange={e=>set(isBranch?"location":"address",e.target.value)} placeholder="Address or location"/>
      <label>Notes</label><textarea rows={3} value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Add delivery instructions, opening hours, or other notes"/>
      {record&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Active (available in new orders)</label>}
      <Controls busy={busy} close={close} label={record?"Update details":"Add "+(isBranch?"supplier":"company")} valid={f.name.trim().length>0}/>
    </form>
  </Modal>;
}
function ProductForm({modal,close,busy,action,d}) {
  const p=modal.record,branches=active(d.branches);
  const [f,setF]=useState(()=>p?{...p}:{name:"",sku:"",category:"Helmets",emoji:"📦",img:null,sid:branches[0]?.id||"",unit:"pieces",cost:0,sell:0,stock:0,reorder:5,active:1});
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
      <label>Item name *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Example: Safety helmet shell"/>
      <div className="two"><div><label>Item code (optional)</label><input value={f.sku||""} onChange={e=>set("sku",e.target.value)} placeholder="ITEM-001"/></div>
        <div><label>Counted in</label><input value={f.unit} onChange={e=>set("unit",e.target.value)} placeholder="pieces, packs, bottles" required/></div></div>
      <label>Category *</label><select required value={f.category||"Other"} onChange={e=>set("category",e.target.value)}>{PRODUCT_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
      <label>Picture or icon</label><div className="upload-row"><Picture p={f}/>
        <label className="btn ghost sm file-picker"><Camera size={16}/> Upload photo<input type="file" hidden accept="image/*" onChange={upload}/></label>
        <select aria-label="Choose icon" value={f.emoji} onChange={e=>set("emoji",e.target.value)} className="emoji-picker">
          {["📦","🪖","⚡","🔌","💡","🔋","🧤","🥽","🦺","🔧","⚙️","🧰","🔩","🛠️","🧯","🧵"].map(v=><option key={v}>{v}</option>)}</select>
        {f.img&&<button type="button" className="text-button" onClick={()=>set("img",null)}>Remove photo</button>}</div>
      <label>Usual supplier *</label><select required value={f.sid} onChange={e=>set("sid",Number(e.target.value))}>
        <option value="">Select a supplier</option>{d.branches.filter(x=>x.active||x.id===f.sid).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <div className="notice"><Info size={18}/> You can still request this item from any other supplier in a PO.</div>
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
    sub={purchase?"Make a PO for any supplier. Stock changes only after goods are received.":"Choose a company, then select what they want to order."} close={close}>
    <form onSubmit={handle}>
      <label>{purchase?"Supplier":"Customer company"} *</label><select value={party} required onChange={e=>setParty(e.target.value)}>
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
  const [pid,setPid]=useState(record?.id||active(d.products)[0]?.id||""),[target,setTarget]=useState(record?.stock??""),[reason,setReason]=useState("");
  const selected=one(d.products,pid);
  const change=Number(target)-Number(selected?.stock||0);
  return <Modal title="Update stock count" sub="Enter the actual quantity counted. Every update is saved in stock history." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/adjustments","POST",{pid:Number(pid),change,reason},"Stock count updated.","history");}}>
      <label>Item</label><select required value={pid} onChange={e=>{const id=Number(e.target.value);setPid(id);setTarget(one(d.products,id)?.stock??"");}}>{active(d.products).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"No code"}</option>)}</select>
      <div className="notice"><Package size={18}/> Current stock: <strong>{selected?.stock||0} {selected?.unit||""}</strong></div>
      <label>New stock count *</label><input required autoFocus type="number" min="0" step="1" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Enter the quantity physically counted"/>
      {target!==""&&<p className="mute">This will {change>=0?"add":"remove"} <strong>{Math.abs(change)} {selected?.unit||"units"}</strong>.</p>}
      <label>Reason for update *</label><textarea required rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: Physical stock count on factory floor"/>
      <Controls busy={busy} close={close} valid={!!pid&&target!==""&&Number.isInteger(Number(target))&&Number(target)>=0&&change!==0&&!!reason.trim()} label="Update stock count"/>
    </form>
  </Modal>;
}
function StaffForm({record,busy,close,action}) {
  const [f,setF]=useState(()=>record?{...record,password:"",permissions:record.permissions||defaultAccess(record.role)}:{username:"",password:"",role:"staff",permissions:defaultAccess("staff"),active:1});
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  const setPermission=(key,value)=>setF(o=>({...o,permissions:{...o.permissions,[key]:value}}));
  const changeRole=role=>setF(o=>({...o,role,permissions:defaultAccess(role)}));
  return <Modal wide title={record?"Edit user access":"Add user account"} sub="Choose exactly which parts of StockEasy this person can see or change." close={close}>
    <form onSubmit={e=>{e.preventDefault();action("/staff"+(record?"/"+record.id:""),record?"PUT":"POST",f,"Staff account saved.","staff");}}>
      <label>Username *</label><input required value={f.username} onChange={e=>set("username",e.target.value)} autoComplete="off"/>
      <label>{record?"New password (leave blank to keep old password)":"Password (8 characters minimum) *"}</label>
      <input type="password" minLength={8} required={!record} value={f.password} onChange={e=>set("password",e.target.value)} autoComplete="new-password"/>
      <label>Account type</label><select value={f.role} onChange={e=>changeRole(e.target.value)}>
        <option value="staff">Custom access</option><option value="viewer">View-only preset</option><option value="admin">Administrator — full system access</option></select>
      {f.role==="admin"?<div className="notice"><Shield size={18}/><span><strong>Administrators have full access</strong><br/>They can manage all records, stock corrections, and user accounts.</span></div>:
        <div className="permission-panel"><div className="permission-head"><span>System module</span><span>Permission</span></div>
          {ACCESS_MODULES.map(([key,label])=><div className="permission-row" key={key}><span>{label}</span><select value={f.permissions?.[key]||"none"} onChange={e=>setPermission(key,e.target.value)}>
            <option value="none">No access</option><option value="view">View only</option><option value="edit">View & edit</option></select></div>)}
        </div>}
      {record&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Account active</label>}
      <Controls busy={busy} close={close} valid={!!f.username.trim()&&(!!record||f.password.length>=8)} label="Save staff account"/>
    </form>
  </Modal>;
}
function DocumentView({modal,d,branch,customer,product,openProduct,close}) {
  const doc=modal.record,isPo=modal.type==="view-po",isGRN=modal.type==="view-grn";
  const isDelivery=modal.type==="view-delivery",isReturn=modal.type==="view-return",isOrder=modal.type==="view-order";
  const hasPrices=isPo||isOrder;
  const lines=doc.items||doc.lines;
  const name=isPo||isGRN?branch(doc.sid).name:customer(doc.cid).name;
  const kind=isPo?"Stock request":isGRN?"Goods received note":isDelivery?"Delivery note":isReturn?"Customer return":"Customer order";
  return <Modal wide title={doc.id} sub={kind+" · "+name} close={close}>
    <div className="print-sheet">
      <div className="print-sheet-heading"><strong>StockEasy · Supun Group</strong><State value={doc.status}/></div>
      <div className="summary-grid"><div><span>Document</span><strong>{doc.id}</strong></div><div><span>{isPo?"Supplier":"Customer company"}</span><strong>{name}</strong></div>
        <div><span>Date</span><strong>{today(doc.date)}</strong></div></div>
      {isPo?<div className="po-detail-table"><div className="po-detail-row po-detail-head"><strong>Item</strong><strong>Ordered</strong><strong>Received</strong><strong>Remaining</strong><strong>Unit cost</strong><strong>Amount</strong></div>
        {lines.map(l=><div className="po-detail-row" key={l.pid}><button className="product-link" onClick={()=>openProduct(l.pid)}><strong>{product(l.pid).name}</strong><small>{product(l.pid).sku||"No item code"}</small></button><span>{l.qty} {product(l.pid).unit}</span><span>{l.received||0}</span><span>{l.qty-(l.received||0)}</span><span>{rs(l.cost)}</span><strong>{rs(l.qty*l.cost)}</strong></div>)}</div>:
        isOrder?<div className="po-detail-table"><div className="po-detail-row po-detail-head"><strong>Item</strong><strong>Ordered</strong><strong>Sent</strong><strong>Remaining</strong><strong>Unit price</strong><strong>Amount</strong></div>
          {lines.map(l=><div className="po-detail-row" key={l.pid}><button className="product-link" onClick={()=>openProduct(l.pid)}><strong>{product(l.pid).name}</strong><small>{product(l.pid).sku||"No item code"}</small></button><span>{l.qty} {product(l.pid).unit}</span><span>{l.dispatched||0}</span><span>{l.qty-(l.dispatched||0)}</span><span>{rs(l.price)}</span><strong>{rs(l.qty*l.price)}</strong></div>)}</div>:
        <div className={"document-table" + (!hasPrices ? " two-col" : "")}><div className="document-table-head"><strong>Item</strong><strong>Quantity</strong>{hasPrices&&<strong>Amount</strong>}</div>
          {lines.map(l=><div className="document-table-row" key={l.pid}><button className="product-link simple" onClick={()=>openProduct(l.pid)}>{product(l.pid).name}</button><span>{l.qty} {product(l.pid).unit}</span>{hasPrices&&<span>{rs(l.qty*l.price)}</span>}</div>)}</div>}
      {hasPrices&&<div className="order-total"><span>Total</span><strong>{rs(lines.reduce((s,l)=>s+l.qty*(isPo?l.cost:l.price),0))}</strong></div>}
      {doc.note&&<p className="mute">Notes: {doc.note}</p>}
    </div>
    <div className="form-actions print-actions"><button className="btn" onClick={()=>window.print()}><Printer size={17}/> Print document</button>
      <button className="btn ghost" onClick={close}>Close</button></div>
  </Modal>;
}
