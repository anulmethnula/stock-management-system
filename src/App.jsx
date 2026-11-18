import { useEffect, useMemo, useState } from "react";
import { QuotationPage, QuotationForm, QuotationView, QuotationDecision, QuotationConvert } from "./QuotationUI.jsx";
import {
  LayoutDashboard, Package, Building2, Users, ClipboardList, PackageCheck,
  Truck, History, Shield, LogOut, Plus, Pencil, Trash2,
  Search, AlertTriangle, ArrowRight, Check, X, Camera, Minus,
  RotateCcw, Printer, Eye, Archive, ArrowUpRight, ArrowDownLeft,
  LockKeyhole, ShoppingBag, Boxes, Info, RefreshCw, Download, Upload, BarChart3, ExternalLink,
  MapPin, Phone, UserRound, ChevronLeft, ChevronRight, FileText
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
const colomboDate=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const businessNow=()=>new Date(colomboDate()+"T12:00:00");
const stockLevel = p => p.stock <= 0 ? "out" : p.stock <= p.reorder ? "low" : "ok";
const isClosed = s => ["Received", "Cancelled", "Part cancelled", "Dispatched", "Reversed"].includes(s);
const active = arr => arr.filter(x => x.active);
const number = value => Number(value) || 0;
const Icons = { home: LayoutDashboard, products: Package, branches: Building2, customers: Users,
  pos: ClipboardList, grns: PackageCheck, quotes: FileText, orders: ShoppingBag, deliveries: Truck, history: History, reports: BarChart3, staff: Shield };
const MENU = [
  ["home", "Home"], ["products", "Items"], ["branches", "Suppliers"],
  ["pos", "Stock Requests"], ["grns", "Goods Received"], ["customers", "Customers"],
  ["quotes", "Quotations"], ["orders", "Customer Orders"], ["deliveries", "Deliveries"],
  ["history", "Stock History"], ["reports", "Reports"], ["staff", "Staff"]
];
const PAGE_FEATURE = {home:"dashboard",products:"products",branches:"suppliers",customers:"customers",pos:"purchase_orders",grns:"goods_received",quotes:"quotations",orders:"customer_orders",deliveries:"deliveries",history:"stock_history",reports:"reports",staff:"staff"};
const ACCESS_MODULES = [["dashboard","Dashboard"],["products","Items"],["suppliers","Suppliers"],["customers","Customers"],["purchase_orders","Stock requests (PO)"],["goods_received","Goods received (GRN)"],["quotations","Customer quotations"],["customer_orders","Customer orders"],["deliveries","Deliveries & returns"],["stock_history","Stock history"],["reports","Reports"],["stock_adjustments","Stock corrections & quarantine"]];
const defaultAccess = role => Object.fromEntries(ACCESS_MODULES.map(([key])=>[key,role==="admin"?"edit":key==="stock_adjustments"?"none":role==="viewer"?"view":"edit"]));
const accessLevel = (user,feature) => user?.role==="admin"?"edit":user?.permissions?.[feature]||"none";

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
function Modal({ title, sub, children, close, wide = false, className = "", HeaderIcon = null }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="over" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className={"modal " + (wide ? "modal-wide " : "")+className} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head">{HeaderIcon&&<span className="modal-title-icon"><HeaderIcon size={25}/></span>}<div><h3>{title}</h3>{sub && <p className="mute">{sub}</p>}</div>
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
  const [welcome,setWelcome]=useState(true);
  const [staff, setStaff] = useState([]);
  const [productFocus,setProductFocus]=useState(null);
  const refresh = async () => {
    const data = await request("/all");
    setD(data); setUser(data.user);
    return data;
  };
  useEffect(() => { refresh().catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setLoading(false)); }, []);
  useEffect(() => { delete document.documentElement.dataset.theme; localStorage.removeItem("se-theme"); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3600); return () => clearTimeout(id); }, [toast]);
  useEffect(()=>{if(!user||!d)return;setWelcome(true);const id=setTimeout(()=>setWelcome(false),2100);return()=>clearTimeout(id);},[user?.id,!!d]);
  useEffect(() => {
    if (page === "staff" && user?.role === "admin") request("/staff").then(result => setStaff(result.staff)).catch(e => setError(e.message));
  }, [page, user?.role]);
  useEffect(() => {
    if (!user || accessLevel(user,PAGE_FEATURE[page])!=="none") return;
    const first=MENU.find(([key])=>accessLevel(user,PAGE_FEATURE[key])!=="none");
    if(first) setPage(first[0]);else setPage("no-access");
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
  const signIn = async (username, password, remember = false) => {
    setBusy(true); setError("");
    try { await request("/login", "POST", { username, password, remember }); await refresh(); setPage("home"); return true; }
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
  const ctx = { d, branch, customer, product, canEdit, user, action, busy, setModal, confirm, reason, productFocus, setProductFocus, openProduct, refresh };
  return <div className="app">
    {welcome&&<WelcomeScreen close={()=>setWelcome(false)}/>}
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
        <div className="bottom-buttons"><button className="icon-btn" title="Log out" onClick={signOut}><LogOut size={20}/></button></div>
      </div>
    </aside>
    <main className="main">
      <header className="workspace-header">
        <svg className="workspace-waves" viewBox="0 0 1200 150" preserveAspectRatio="none" aria-hidden="true"><path d="M0 108 C190 72 330 132 515 100 S760 18 930 61 S1080 116 1200 62 L1200 150 L0 150Z"/><path d="M0 128 C210 94 370 148 565 119 S790 53 958 86 S1090 128 1200 101 L1200 150 L0 150Z"/></svg>
        <div className="workspace-brand"><span className="workspace-box" aria-hidden="true"><Package size={24}/></span><strong>StockEasy <b>Workspace</b></strong><i/><span>Inventory &amp; Stock Management System</span></div>
        <div className="workspace-illustration" aria-hidden="true"><svg viewBox="0 0 190 90"><g className="mini-boxes"><path d="M11 49h48v34H11z"/><path d="M34 17h46v34H34z"/><path d="M58 48h43v35H58z"/><path className="tape" d="M29 49h12v10H29zM52 17h11v11H52zM72 48h11v10H72z"/></g><g className="clipboard" transform="translate(112 8) rotate(8 31 38)"><rect x="4" y="5" width="59" height="75" rx="8"/><rect x="11" y="14" width="45" height="59" rx="4"/><path d="M23 27l4 4 8-9M23 42l4 4 8-9M23 57l4 4 8-9M39 28h11M39 43h11M39 58h11"/><rect x="23" y="0" width="22" height="12" rx="5"/></g></svg></div>
        <div className="top-actions">
          <button className="icon-btn mobile-action" aria-label="Log out" title="Log out" onClick={signOut}><LogOut size={19}/></button>
          <button className="btn ghost sm" onClick={() => refresh().then(() => setToast("All records refreshed.")).catch(e => setError(e.message))}>
            <RefreshCw size={14}/><span>Refresh</span></button>
        </div>
      </header>
      <nav className="page-breadcrumb" aria-label="Breadcrumb"><button disabled={accessLevel(user,"dashboard")==="none"} onClick={()=>setPage("home")}><LayoutDashboard size={14}/> Home</button>{page!=="home"&&<><ArrowRight size={13}/><strong>{MENU.find(([key])=>key===page)?.[1]||"Page"}</strong></>}</nav>
      {error && <div className="error-banner" role="alert"><AlertTriangle size={19}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={18}/></button></div>}
      <div className="page" key={page}>
        {page === "no-access" && <Empty title="No module access" sub="Ask your administrator to grant access."/>}
        {page === "home" && accessLevel(user,"dashboard")!=="none" && <Home {...ctx} setPage={setPage} />}
        {page === "branches" && <Directory {...ctx} type="branches" />}
        {page === "customers" && <Directory {...ctx} type="customers" />}
        {page === "products" && <Products {...ctx} />}
        {page === "pos" && <PurchaseOrders {...ctx} />}
        {page === "grns" && <GoodsReceived {...ctx} />}
        {page === "quotes" && <QuotationPage {...ctx} />}
        {page === "orders" && <CustomerOrders {...ctx} navigate={setPage} />}
        {page === "deliveries" && <Deliveries {...ctx} />}
        {page === "history" && <StockHistory {...ctx} />}
        {page === "reports" && <Reports {...ctx} />}
        {page === "staff" && <Staff {...ctx} staff={staff} />}
      </div>
      <footer className="stockeasy-footer" aria-label="StockEasy footer">
        <svg className="stockeasy-footer-waves" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 110 C160 101 300 114 470 100 S730 31 905 52 S1150 115 1440 94 L1440 120 L0 120Z" fill="var(--footer-wave-back)"/>
          <path d="M0 112 C225 106 340 122 550 108 S775 65 960 78 S1230 114 1440 103 L1440 120 L0 120Z" fill="var(--footer-wave-front)"/>
        </svg>
        <div className="stockeasy-footer-inner">
          <a className="stockeasy-footer-credit" href="https://it.supuncompanies.com/" target="_blank" rel="noopener noreferrer"
            aria-label="Supun IT Solutions website (opens in new tab)">
            <span>Developed by</span>
            <strong>Supun IT Solutions</strong>
            <ExternalLink size={17} aria-hidden="true"/>
          </a>
        </div>
      </footer>
    </main>
    {modal && <Dialog modal={modal} ctx={ctx} staff={staff} close={() => setModal(null)}/>}
    {toast && <div className="toast" role="status"><Check size={18}/>{toast}</div>}
  </div>;
}

function WelcomeScreen({close}) {
  const hour=new Date().getHours(),greeting=hour<12?["Good Morning","☀️"]:hour<17?["Good Afternoon","🌤️"]:hour<21?["Good Evening","🌆"]:["Good Night","🌙"];
  return <div className="welcome-screen" role="dialog" aria-modal="true" aria-label="Welcome to StockEasy">
    <svg className="welcome-waves" viewBox="0 0 1440 700" preserveAspectRatio="none" aria-hidden="true"><path d="M0 430 C220 330 390 510 650 395 S1040 230 1440 360 L1440 700 L0 700Z"/><path d="M0 520 C250 415 470 585 730 470 S1110 330 1440 455 L1440 700 L0 700Z"/></svg>
    <button className="welcome-skip" type="button" onClick={close}>Skip</button>
    <div className="welcome-glow" aria-hidden="true"/>
    <div className="welcome-content"><div className="welcome-cube" aria-hidden="true"><span className="cube-front"><Package size={48}/></span><span className="cube-top"/><span className="cube-side"/></div>
      <p className="welcome-greeting">{greeting[0]} <span>{greeting[1]}</span></p><h1>Welcome to <strong>StockEasy</strong></h1><p className="welcome-sub">Inventory &amp; Stock Management System</p>
      <div className="welcome-loader" aria-label="Opening dashboard"><i/></div>
    </div>
  </div>;
}

function Login({ signIn, busy, error }) {
  const [username, setUsername] = useState("admin"), [password, setPassword] = useState(""), [remember,setRemember]=useState(false);
  return <div className="login-wrap">
    <div className="login-intro"><div className="login-brand"><img className="brand-full-logo" src="/logo.png" alt="Supun Group of Companies"/></div>
      <span className="login-accent" aria-hidden="true"/>
      <h1>All your stock.<br/><span>One simple place.</span></h1>
      <p>From suppliers to customer companies — keep every item accounted for.</p>
      <div className="login-path"><span><Building2/> Suppliers</span><ArrowRight/><span><PackageCheck/> Receive</span><ArrowRight/><span><Truck/> Deliver</span></div>
    </div>
    <div className="login-panel"><div className="login-product-brand"><span><Package size={28}/></span><strong>Stock<span>Easy</span></strong><small>Inventory &amp; Stock Management System</small></div>
      <form className="login-card" onSubmit={e => { e.preventDefault(); signIn(username,password,remember); }}>
        <div className="login-icon"><LockKeyhole size={26}/></div><h2>Welcome back</h2><p className="mute">Sign in to manage your stock.</p>
        <label>Username</label><div className="login-field"><Users size={18}/><input autoFocus autoComplete="username" placeholder="Enter your username" value={username} onChange={e => setUsername(e.target.value)} required/></div>
        <label>Password</label><div className="login-field"><LockKeyhole size={18}/><input type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required/></div>
        <label className="login-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span><strong>Remember me</strong><small>Keep me signed in securely for 30 days</small></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={18}/></button>
      </form>
    </div>
  </div>;
}

function Home({ d, setPage, setModal, canEdit, branch,user }) {
  const [range,setRange]=useState("7d"),[hover,setHover]=useState(null);
  const low = active(d.products).filter(p => stockLevel(p) !== "ok");
  const counts=d.dashboardCounts||{items:active(d.products).length,low:low.length,pending:d.pos.filter(p=>["Ordered","Part received"].includes(p.status)).length,orders:d.orders.filter(o=>["Open","Part dispatched"].includes(o.status)).length};
  const pending = d.pos.filter(p => ["Ordered","Part received"].includes(p.status));
  const openCustomers = d.orders.filter(o => ["Open","Part dispatched"].includes(o.status));
  const stats = [
    [Package,"Items",counts.items,"Active products","green","products"],[AlertTriangle,"Low stock",counts.low,"Need attention","amber","products"],
    [ClipboardList,"Pending POs",counts.pending,"Waiting to receive","blue","pos"],[ShoppingBag,"Customer orders",counts.orders,"Waiting to send","purple","orders"]
  ];
  const chart=useMemo(()=>{
    const now=businessNow(),b=[];if(range==="12m")for(let i=11;i>=0;i--){const x=new Date(now.getFullYear(),now.getMonth()-i,1);b.push({key:`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`,label:x.toLocaleDateString("en-LK",{month:"short"}),full:x.toLocaleDateString("en-LK",{month:"long",year:"numeric"}),received:0,delivered:0});}else{const n=range==="30d"?30:7;for(let i=n-1;i>=0;i--){const x=new Date(now);x.setDate(now.getDate()-i);b.push({key:[x.getFullYear(),String(x.getMonth()+1).padStart(2,"0"),String(x.getDate()).padStart(2,"0")].join("-"),label:x.toLocaleDateString("en-LK",n===7?{weekday:"short"}:{day:"numeric",month:"short"}),full:x.toLocaleDateString("en-LK",{day:"numeric",month:"short",year:"numeric"}),received:0,delivered:0});}}
    const map=new Map(b.map(x=>[x.key,x]));(d.dashboardChart||[]).forEach(m=>{const x=map.get(String(m.day).slice(0,range==="12m"?7:10));if(x){x.received+=m.received;x.delivered+=m.delivered;}});const max=Math.max(1,...b.flatMap(x=>[x.received,x.delivered])),min=Math.min(0,...b.flatMap(x=>[x.received,x.delivered])),pts=k=>b.map((x,i)=>({x:20+i*660/(b.length-1),y:188-(x[k]-min)/(max-min)*140,value:x[k],label:x.full})),smooth=p=>p.reduce((s,x,i)=>i?s+` C ${(p[i-1].x+x.x)/2} ${p[i-1].y}, ${(p[i-1].x+x.x)/2} ${x.y}, ${x.x} ${x.y}`:`M ${x.x} ${x.y}`,"");const r=pts("received"),v=pts("delivered"),fill=p=>smooth(p)+` L ${p.at(-1).x} 202 L ${p[0].x} 202 Z`;return{b,r,v,rp:smooth(r),vp:smooth(v),rf:fill(r),vf:fill(v)};
  },[d.dashboardChart,range]);
  return <div className="home-dashboard"><section className="home-hero"><div className="home-hero-copy"><div className="eyebrow">STOCKEASY ERP</div><h1>Complete Stock Management<br/>for <span>Your Business</span></h1><p>Manage inventory, suppliers, orders, and deliveries — all in one powerful, easy-to-use system.</p><div className="home-hero-actions"><button className="btn" disabled={accessLevel(user,"purchase_orders")!=="edit"} onClick={()=>setModal({type:"po"})}><Plus size={17}/> Request Stock</button><button className="btn ghost" disabled={accessLevel(user,"reports")==="none"} onClick={()=>setPage("reports")}><BarChart3 size={17}/> View Reports</button></div><div className="home-benefits"><span><Boxes size={18}/> Track stock</span><span><Shield size={18}/> Reduce shortages</span><span><BarChart3 size={18}/> Improve control</span></div></div><div className="home-hero-visual" aria-hidden="true"><div className="hero-glow"/><div className="hero-laptop"><div className="hero-screen"><b>StockEasy</b><span/><span/><span/></div><i/></div><div className="hero-box box-one"/><div className="hero-box box-two"/><div className="hero-float one"><Package size={19}/><span><small>Inventory</small><strong>{counts.items} items</strong></span></div><div className="hero-float two"><Truck size={19}/><span><small>Pending POs</small><strong>{counts.pending} requests</strong></span></div></div></section>
    <h2 className="dashboard-title">Your Stock at a Glance</h2><div className="home-kpis">{stats.map(([Icon,label,n,sub,tone,target])=><button type="button" className={`home-kpi ${tone}`} key={label} disabled={accessLevel(user,PAGE_FEATURE[target])==="none"} onClick={()=>setPage(target)} aria-label={`Open ${label}`}><span><Icon size={21}/></span><div><strong>{n}</strong><b>{label}</b><small>{sub}</small></div></button>)}</div>
    <div className="home-dashboard-grid"><section className="home-chart-card"><div className="home-card-head"><div><h2>Stock Movement</h2><p>Net received vs. delivered (including reversals)</p></div><div className="chart-ranges">{[["7d","7 days"],["30d","30 days"],["12m","12 months"]].map(([k,l])=><button key={k} className={range===k?"on":""} onClick={()=>{setRange(k);setHover(null)}}>{l}</button>)}</div></div><div className="chart-legend"><span><i className="received"/>Received</span><span><i className="delivered"/>Delivered</span></div><div className="movement-chart" key={range}>{hover&&<div className="chart-tooltip" style={{left:`${hover.x/7}%`,top:`${hover.y/2.2}%`}}><strong>{hover.label}</strong><span>{hover.series}: {hover.value}</span></div>}<svg viewBox="0 0 700 225"><path className="chart-fill received" d={chart.rf}/><path className="chart-fill delivered" d={chart.vf}/><path pathLength="1" className="chart-line received" d={chart.rp}/><path pathLength="1" className="chart-line delivered" d={chart.vp}/>{[[chart.r,"Received","received"],[chart.v,"Delivered","delivered"]].map(([p,l,c])=>p.map((x,i)=><circle key={l+i} className={`chart-dot ${c}`} cx={x.x} cy={x.y} r="4" tabIndex="0" onMouseEnter={()=>setHover({...x,series:l})} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover({...x,series:l})} onBlur={()=>setHover(null)}/>))}{chart.b.map((x,i)=>(range!=="30d"||i%5===0||i===chart.b.length-1)&&<text key={x.key} x={chart.r[i].x} y="220" textAnchor="middle">{x.label}</text>)}</svg></div></section>
      <section className="recent-po-card"><div className="home-card-head"><div><h2>Recent Stock Requests</h2><p>Latest supplier requests</p></div><button className="text-button" disabled={accessLevel(user,"purchase_orders")==="none"} onClick={()=>setPage("pos")}>View all <ArrowRight size={14}/></button></div><div className="recent-po-list">{d.pos.slice(0,5).map(po=><div className="recent-po" key={po.n}><span className="row-icon"><ClipboardList size={17}/></span><div><strong>{po.id}</strong><small>{branch(po.sid).name} · {po.items.reduce((n,l)=>n+l.qty,0)}</small></div><State value={po.status}/><div className="recent-po-actions"><button className="icon-btn" title="View request" onClick={()=>setModal({type:"view-po",record:po})}><Eye size={15}/></button>{accessLevel(user,"goods_received")==="edit"&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn primary-icon" title="Receive goods" onClick={()=>setModal({type:"grn",po})}><PackageCheck size={15}/></button>}</div></div>)}{!d.pos.length&&<p className="mute">No stock requests yet.</p>}</div></section></div>
  </div>;
}

function LegacyDirectory({ d, type, setModal, confirm, canEdit }) {
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

function Directory({ d, type, setModal, confirm, canEdit }) {
  const isBranch=type==="branches",list=d[type];
  const [q,setQ]=useState(""),[recordFilter,setRecordFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("active"),[page,setPage]=useState(1);
  const typeOf=x=>isBranch?x.supplier_type:x.customer_type;
  const filtered=list.filter(x=>(statusFilter==="all"||(statusFilter==="active"?x.active:!x.active))&&(!isBranch||recordFilter==="all"||typeOf(x)===recordFilter)&&[x.name,x.contact,x.phone,x.phone2,x.location,x.address,x.notes].join(" ").toLowerCase().includes(q.toLowerCase()));
  const pageCount=Math.max(1,Math.ceil(filtered.length/9)),visible=filtered.slice((page-1)*9,page*9);
  useEffect(()=>setPage(1),[q,recordFilter,statusFilter]);
  useEffect(()=>{if(page>pageCount)setPage(pageCount)},[page,pageCount]);
  const activeCount=list.filter(x=>x.active).length,internalCount=list.filter(x=>x.active&&typeOf(x)==="internal").length,externalCount=list.filter(x=>x.active&&typeOf(x)!=="internal").length;
  const summaries=isBranch?[[Building2,"Total",list.length,"green","all"],[Users,"Internal",internalCount,"blue","internal"],[Truck,"External",externalCount,"amber","external"],[Check,"Active",activeCount,"green","active"]]:[[Users,"Total customers",list.length,"green","all"],[Check,"Active",activeCount,"blue","active"],[Archive,"Inactive",list.length-activeCount,"amber","inactive"]];
  const selectSummary=key=>{if(isBranch){if(key==="all"){setStatusFilter("all");setRecordFilter("all")}else if(key==="active"){setStatusFilter("active");setRecordFilter("all")}else{setStatusFilter("active");setRecordFilter(key)}}else setStatusFilter(key)};
  const summaryOn=key=>isBranch?(key==="all"?statusFilter==="all"&&recordFilter==="all":key==="active"?statusFilter==="active"&&recordFilter==="all":statusFilter==="active"&&recordFilter===key):statusFilter===key;
  return <>
    <SectionHeading title={isBranch?"Suppliers":"Customer companies"} sub={isBranch?"Manage internal Supun locations and external supply partners.":"Companies that receive goods from you."} action={canEdit?()=>setModal({type:isBranch?"branch":"customer"}):null} label={isBranch?"Add supplier":"Add company"}/>
    <div className={`directory-summary ${isBranch?"supplier-summary":"customer-summary"}`}>{summaries.map(([Icon,label,value,tone,key])=><button type="button" className={`directory-summary-card ${tone} ${summaryOn(key)?"on":""}`} key={label} onClick={()=>selectSummary(key)} aria-pressed={summaryOn(key)}><span><Icon size={20}/></span><div><small>{label}</small><strong>{value}</strong></div></button>)}</div>
    <div className={`directory-tools ${isBranch?"supplier-tools":"customer-tools"}`}><SearchBox value={q} change={setQ} placeholder={isBranch?"Search supplier, contact or location...":"Search company, contact or address..."}/></div>
    {!filtered.length?<Empty Icon={isBranch?Building2:Users} title="Nothing found" sub="Add a new record or try another search."/>:<div className="grid directory-grid">{visible.map(x=><div className={`card directory-card pop supplier-card ${isBranch?"supplier-"+(x.supplier_type||"external"):"customer-record"} ${canEdit?"clickable-card":""}`} key={x.id}
      role={canEdit?"button":undefined} tabIndex={canEdit?0:undefined} title={canEdit?`Edit ${x.name}`:undefined}
      onClick={e=>{if(canEdit&&!e.target.closest("button,a"))setModal({type:isBranch?"branch":"customer",record:x})}}
      onKeyDown={e=>{if(canEdit&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setModal({type:isBranch?"branch":"customer",record:x})}}}>
      <div className="record-head"><span className="record-avatar">{isBranch&&x.supplier_type==="internal"?<Building2 size={23}/>:isBranch?<Truck size={23}/>:<Users size={23}/>}</span><div className="record-states">{isBranch&&<Pill kind={x.supplier_type==="internal"?"neutral":"warn"}>{x.supplier_type==="internal"?"Internal":"External"}</Pill>}<Pill kind={x.active?"good":"off"}>{x.active?"Active":"Removed"}</Pill></div></div>
      <h3>{x.name}</h3>
      <div className="directory-details">{(x.location||x.address)&&<span><MapPin size={15}/>{x.location||x.address}</span>}{x.contact&&<span><UserRound size={15}/>{x.contact}</span>}{x.phone&&<span><Phone size={15}/>{x.phone}</span>}{x.phone2&&<span><Phone size={15}/>{x.phone2}</span>}{!(x.location||x.address||x.contact||x.phone||x.phone2)&&<span className="mute">No contact details added</span>}</div>
      {x.notes&&<p className="record-note">{x.notes}</p>}
      <div className="card-actions">{canEdit&&<button className="btn ghost sm" title={x.active?"Edit record":"Edit or restore record"} onClick={()=>setModal({type:isBranch?"branch":"customer",record:x})}><Pencil size={15}/> {x.active?"Edit":"Edit / Restore"}</button>}
        {(x.location||x.address)&&<a className="btn ghost sm" title={isBranch?"View location":"View address"} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.location||x.address)}`} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> {isBranch?"Location":"Address"}</a>}
        {canEdit&&x.active===1&&<button className="icon-btn danger" title="Remove" onClick={()=>confirm("Remove "+x.name+"?","This will hide the record from new forms. Old orders and history will be kept.","/"+type+"/"+x.id)}><Trash2 size={17}/></button>}</div>
    </div>)}</div>}
    {!!filtered.length&&<div className="directory-pagination"><span>Showing {(page-1)*9+1}-{Math.min(page*9,filtered.length)} of {filtered.length}</span><div><button className="icon-btn" title="Previous page" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><strong>{page}</strong><span>of {pageCount}</span><button className="icon-btn" title="Next page" disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div>}
  </>;
}

function LegacyProducts({d,branch,setModal,confirm,canEdit,user,productFocus,setProductFocus}) {
  const [q,setQ]=useState(""), [showArchived,setShowArchived]=useState(false), [category,setCategory]=useState("all"), [stockFilter,setStockFilter]=useState("all");
  const categories=(d.categories||[]).filter(c=>c.active).map(c=>c.name);
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
      <div className="inventory-table-wrap"><div className="inventory-table-head inventory-table-row"><span>Item / Code</span><span>Category</span><span>Supplier</span><span>Stock count</span><span>Buy price</span><span>Sell price</span><span>Status</span><span>Actions</span></div>
        {filtered.map(p=><div className="inventory-table-row" key={p.id}><div className="inventory-item"><Picture p={p}/><span><strong>{p.name}</strong><small>{p.sku||"No item code"}</small></span></div>
          <span><span className="category-tag">{p.category||"Other"}</span></span><strong className="inventory-supplier">{branch(p.sid).name}</strong>
          <div className="inventory-stock"><strong>{p.stock}</strong>{p.damagedStock>0&&<small style={{display:"block",color:"#a46a13"}}>{p.damagedStock} quarantined</small>}</div><strong>{rs(p.cost)}</strong><strong>{rs(p.sell)}</strong>
          {!p.active?<Pill kind="off">Removed</Pill>:<Pill kind={stockLevel(p)==="ok"?"good":stockLevel(p)==="low"?"warn":"off"}>{stockLevel(p)==="ok"?"In stock":stockLevel(p)==="low"?"Low":"Out of stock"}</Pill>}
          <div className="po-actions">{canEdit&&<button className="icon-btn" title="Edit item" onClick={()=>setModal({type:"product",record:p})}><Pencil size={16}/></button>}
            {canEdit&&<button className="icon-btn primary-icon" title="Update stock count" onClick={()=>setModal({type:"adjust",record:p})}><RefreshCw size={16}/></button>}
            {canEdit&&p.active===1&&<button className="icon-btn danger" title="Remove item" onClick={()=>confirm("Remove item?","This item will be hidden, but all stock history stays available.","/products/"+p.id)}><Trash2 size={16}/></button>}</div>
        </div>)}</div>}
  </>;
}

function Products({d,branch,setModal,confirm,canEdit,user,productFocus,setProductFocus}) {
  const [q,setQ]=useState(""),[showArchived,setShowArchived]=useState(false),[category,setCategory]=useState("all"),[stockFilter,setStockFilter]=useState("all"),[view,setView]=useState("table"),[page,setPage]=useState(1);
  const categories=(d.categories||[]).filter(c=>c.active).map(c=>c.name);
  const current=active(d.products),counts={total:current.length,ok:current.filter(p=>stockLevel(p)==="ok").length,low:current.filter(p=>stockLevel(p)==="low").length,out:current.filter(p=>stockLevel(p)==="out").length};
  const filtered=d.products.filter(p=>(showArchived||p.active)&&(category==="all"||p.category===category)&&(stockFilter==="all"||stockLevel(p)===stockFilter)&&[p.name,p.sku,p.category,branch(p.sid).name].join(" ").toLowerCase().includes(q.toLowerCase()));
  const totalPages=Math.max(1,Math.ceil(filtered.length/10)),currentPage=Math.min(page,totalPages),visible=filtered.slice((currentPage-1)*10,currentPage*10);
  useEffect(()=>setPage(1),[q,showArchived,category,stockFilter]);
  useEffect(()=>{if(!productFocus)return;const target=one(d.products,productFocus);if(target){setQ(target.name);setCategory("all");setStockFilter("all");setShowArchived(!target.active);}setProductFocus(null);},[productFocus]);
  const actions=p=><div className="inventory-actions">{canEdit&&<button className="icon-btn" title="Edit item" aria-label={`Edit ${p.name}`} onClick={()=>setModal({type:"product",record:p})}><Pencil size={16}/></button>}{accessLevel(user,"stock_adjustments")==="edit"&&<button className="icon-btn primary-icon" title="Correct stock" aria-label={`Correct stock for ${p.name}`} onClick={()=>setModal({type:"adjust",record:p})}><RefreshCw size={16}/></button>}{canEdit&&p.active===1&&<button className="icon-btn danger" title="Remove item" aria-label={`Remove ${p.name}`} onClick={()=>confirm("Remove item?","This item will be hidden, but all stock history stays available.","/products/"+p.id)}><Trash2 size={16}/></button>}</div>;
  const status=p=>!p.active?<Pill kind="off">Removed</Pill>:<Pill kind={stockLevel(p)==="ok"?"good":stockLevel(p)==="low"?"warn":"off"}>{stockLevel(p)==="ok"?"In stock":stockLevel(p)==="low"?"Low stock":"Out of stock"}</Pill>;
  return <div className="inventory-page">
    <SectionHeading title="Inventory items" sub="Manage current stock, item details and bulk Excel updates." action={canEdit?()=>setModal({type:"product"}):null} label="Add item"/>
    {canEdit&&<div className="inventory-secondary-actions">
      <button className="btn ghost sm" type="button" onClick={()=>setModal({type:"categories"})}><Pencil size={15}/> Manage Categories</button>
      {accessLevel(user,"stock_adjustments")==="edit"&&<button className="btn sm" type="button" onClick={()=>setModal({type:"inventory-bulk"})}><Upload size={15}/> Bulk Upload Excel</button>}
    </div>}
    <div className="inventory-summary">{[[Package,"Total items",counts.total,"all","green"],[Check,"In stock",counts.ok,"ok","blue"],[AlertTriangle,"Low stock",counts.low,"low","amber"],[X,"Out of stock",counts.out,"out","red"]].map(([Icon,label,value,key,tone])=><button key={key} className={`inventory-summary-card ${tone} ${stockFilter===key?"on":""}`} onClick={()=>setStockFilter(key)}><span><Icon size={21}/></span><div><strong>{value}</strong><small>{label}</small></div></button>)}</div>
    <div className="inventory-tools"><SearchBox value={q} change={setQ} placeholder="Search item name, code, category or supplier..."/><select className="filter-select" aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select><select className="filter-select" aria-label="Filter by stock status" value={stockFilter} onChange={e=>setStockFilter(e.target.value)}><option value="all">All stock levels</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><label className="toggle-archived"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show removed</label><div className="inventory-view-toggle" role="group" aria-label="Inventory view"><button className={view==="grid"?"on":""} onClick={()=>setView("grid")} title="Grid view"><Boxes size={17}/></button><button className={view==="table"?"on":""} onClick={()=>setView("table")} title="Table view"><ClipboardList size={17}/></button></div></div>
    {!filtered.length?<Empty title="No matching items" sub="Add an item or change your filters."/>:view==="grid"?<div className="inventory-card-grid">{visible.map(p=><article className="inventory-product-card" key={p.id}><div className="inventory-card-top"><Picture p={p}/>{status(p)}</div><h3>{p.name}</h3><small>{p.sku||"No item code"}</small><div className="inventory-card-meta"><span><b>Category</b>{p.category||"Other"}</span><span><b>Supplier</b>{branch(p.sid).name}</span><span><b>Available stock</b><strong>{p.stock}</strong>{p.damagedStock>0&&<small>{p.damagedStock} quarantined</small>}</span><span><b>Prices</b>{rs(p.cost)} / {rs(p.sell)}</span></div>{actions(p)}</article>)}</div>:<div className="inventory-table-wrap inventory-modern-table"><div className="inventory-table-head inventory-table-row"><span>Item / Code</span><span>Category</span><span>Supplier</span><span>Stock count</span><span>Buy price</span><span>Sell price</span><span>Status</span><span>Actions</span></div>{visible.map(p=><div className="inventory-table-row" key={p.id}><div className="inventory-item"><Picture p={p}/><span><strong>{p.name}</strong><small>{p.sku||"No item code"}</small></span></div><span><span className="category-tag">{p.category||"Other"}</span></span><strong className="inventory-supplier">{branch(p.sid).name}</strong><div className="inventory-stock"><strong>{p.stock}</strong></div><strong>{rs(p.cost)}</strong><strong>{rs(p.sell)}</strong>{status(p)}{actions(p)}</div>)}</div>}
    {!!filtered.length&&<div className="inventory-pagination"><span>Showing {(currentPage-1)*10+1}-{Math.min(currentPage*10,filtered.length)} of {filtered.length} items</span><div><button className="icon-btn" disabled={currentPage===1} title="Previous page" onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><strong>{currentPage}</strong><span>of {totalPages}</span><button className="icon-btn" disabled={currentPage===totalPages} title="Next page" onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div>}
  </div>;
}

function PurchaseOrders({ d,branch,product,setModal,confirm,canEdit,user }) {
  const [q,setQ]=useState(""),[supplierFilter,setSupplierFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("open"),[page,setPage]=useState(1);
  const suppliers=[...new Set(d.pos.map(o=>o.sid))].map(id=>branch(id));
  const list=d.pos.filter(o => (supplierFilter==="all"||Number(supplierFilter)===o.sid) && (statusFilter==="all"||(statusFilter==="open"?["Ordered","Part received"].includes(o.status):o.status===statusFilter)) && [o.id,branch(o.sid).name,o.status,...o.items.map(i=>product(i.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  const counts={total:d.pos.length,ordered:d.pos.filter(o=>o.status==="Ordered").length,part:d.pos.filter(o=>o.status==="Part received").length,completed:d.pos.filter(o=>o.status==="Received").length};
  const totalPages=Math.max(1,Math.ceil(list.length/10)),currentPage=Math.min(page,totalPages),visible=list.slice((currentPage-1)*10,currentPage*10);
  useEffect(()=>setPage(1),[q,supplierFilter,statusFilter]);
  return <>
    <SectionHeading title="Stock requests (PO)" sub="Request goods from any supplier. A PO does not add stock until a GRN is saved."
      action={canEdit?()=>setModal({type:"po"}):null} label="Request stock"/>
    <div className="po-summary">{[[ClipboardList,"Total requests",counts.total,"all","green"],[ShoppingBag,"Ordered",counts.ordered,"Ordered","blue"],[Truck,"Part received",counts.part,"Part received","amber"],[Check,"Completed",counts.completed,"Received","purple"]].map(([Icon,label,value,key,tone])=><button type="button" key={key} className={`${tone} ${statusFilter===key?"on":""}`} onClick={()=>setStatusFilter(key)}><span><Icon size={20}/></span><div><strong>{value}</strong><small>{label}</small></div></button>)}</div>
    <div className="list-tools po-request-tools"><SearchBox value={q} change={setQ} placeholder="Search PO, supplier or item…"/>
      <select className="filter-select" value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)} aria-label="Filter by supplier"><option value="all">All suppliers</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="open">Waiting to receive</option><option value="Ordered">Ordered</option><option value="Part received">Part received</option><option value="Received">Received</option><option value="Cancelled">Cancelled</option><option value="Part cancelled">Part cancelled</option><option value="all">All statuses</option></select></div>
    <div className="result-count"><strong>{list.length}</strong> of {d.pos.length} stock requests shown</div>
    {!list.length?<Empty Icon={ClipboardList} title="No matching stock requests" sub="Change the filters or create a new request."/>:
      <div className="po-request-table"><div className="po-request-head po-request-row"><span>PO No. / Date</span><span>Supplier</span><span>Items</span><span>Receiving Progress</span><span>Status</span><span>Actions</span></div>
        {visible.map(po=>{const qty=po.items.reduce((a,x)=>a+x.qty,0),received=po.items.reduce((a,x)=>a+x.received,0),percent=qty?Math.round(received/qty*100):0;return <div className="po-request-row" key={po.n}>
          <div className="po-ref po-request-ref"><strong>{po.id}</strong><small>{today(po.date)}</small></div>
          <div className="po-supplier po-request-supplier"><span className="row-icon"><ClipboardList size={17}/></span><strong>{branch(po.sid).name}</strong></div>
          <div className="po-item-summary po-request-items"><strong>{po.items.length} item{po.items.length===1?"":"s"} · {qty}</strong><small>{po.items.slice(0,2).map(l=>product(l.pid).name).join(", ")}{po.items.length>2?` +${po.items.length-2} more`:""}</small></div>
          <div className="po-request-progress"><div><strong>{received} received</strong><b>{percent}%</b></div><div className="bar"><i style={{width:percent+"%"}}/></div><small>{qty-received} remaining of {qty}</small></div>
          <div className="po-request-status"><State value={po.status}/></div>
          <div className="po-request-actions"><button className="icon-btn" aria-label="View PO details" title="View PO details" onClick={()=>setModal({type:"view-po",record:po})}><Eye size={16}/></button>
            {accessLevel(user,"goods_received")==="edit"&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn primary-icon" title="Receive goods" onClick={()=>setModal({type:"grn",po})}><PackageCheck size={17}/></button>}
            {canEdit&&po.status==="Ordered"&&<button className="icon-btn" title="Edit request" onClick={()=>setModal({type:"po",record:po})}><Pencil size={16}/></button>}
            {canEdit&&["Ordered","Part received"].includes(po.status)&&<button className="icon-btn danger" title="Cancel remaining request" onClick={()=>confirm("Cancel this stock request?","No goods will be removed from stock. Any GRNs already saved will stay in history.","/pos/"+po.n)}><X size={17}/></button>}</div>
        </div>})}</div>}
    {!!list.length&&<div className="po-pagination"><span>Showing {(currentPage-1)*10+1}-{Math.min(currentPage*10,list.length)} of {list.length} requests</span><div><button className="icon-btn" disabled={currentPage===1} title="Previous page" onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><strong>{currentPage}</strong><span>of {totalPages}</span><button className="icon-btn" disabled={currentPage===totalPages} title="Next page" onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div>}
  </>;
}

function GoodsReceived({d,branch,product,canEdit,reason,setModal}) {
  const [tab,setTab]=useState("grns"),[q,setQ]=useState(""),[statusFilter,setStatusFilter]=useState("all");
  const receivedUnits=d.grns.filter(g=>g.status==="Active").reduce((sum,g)=>sum+g.lines.reduce((n,l)=>n+l.qty,0),0);
  const activeGrns=d.grns.filter(g=>g.status==="Active").length;
  const source=tab==="grns"?d.grns:d.supplierReturns;
  const list=source.filter(g=>(statusFilter==="all"||g.status===statusFilter)&&[g.id,g.poId,g.grnId,branch(g.sid).name,g.by,g.note,g.reasonType,g.status,...g.lines.map(l=>product(l.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  const switchTab=value=>{setTab(value);setQ("");setStatusFilter("all");};
  return <>
    <SectionHeading title="Goods received & supplier returns" sub="Track supplier receipts and goods returned against their original GRN."/>
    <div className="tabs"><button className={tab==="grns"?"on":""} onClick={()=>switchTab("grns")}>Goods received <small>{d.grns.length}</small></button><button className={tab==="supplierReturns"?"on":""} onClick={()=>switchTab("supplierReturns")}>Supplier returns <small>{d.supplierReturns.length}</small></button></div>
    <div className="grn-summary"><div><span className="grn-summary-icon"><PackageCheck size={20}/></span><span><small>Total GRNs</small><strong>{d.grns.length}</strong></span></div><div><span><small>Active receipts</small><strong>{activeGrns}</strong></span></div><div><span><small>Supplier returns</small><strong>{d.supplierReturns.length}</strong></span></div><div><span><small>Received count</small><strong>{receivedUnits}</strong></span></div></div>
      <div className="list-tools grn-tools"><SearchBox value={q} change={setQ} placeholder={tab==="grns"?"Search GRN, PO, supplier or item…":"Search GRTN, GRN, supplier or item…"}/>
        <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter GRNs by status"><option value="all">All statuses</option><option value="Active">Active</option><option value="Reversed">Reversed</option></select></div>
      {!list.length?<Empty Icon={tab==="grns"?PackageCheck:RotateCcw} title={tab==="grns"?"No matching GRNs":"No matching supplier returns"} sub={tab==="grns"?"Open a stock request and receive goods, or change the filters.":"Use Return on an active GRN to create a supplier return."}/>:
      tab==="grns"?<div className="grn-table-wrap"><div className="grn-table-head grn-table-row"><span>GRN / Date</span><span>PO Number</span><span>Supplier</span><span>Received Items</span><span>Received By</span><span>Status</span><span>Actions</span></div>
        {list.map(g=>{const totalQty=g.lines.reduce((sum,l)=>sum+l.qty,0);return <div className="grn-table-row" key={g.n}>
          <div className="po-ref grn-cell"><strong>{g.id}</strong><small>{today(g.date)}</small></div>
          <div className="grn-po grn-cell"><strong>{g.poId}</strong></div>
          <div className="grn-supplier grn-cell"><strong>{branch(g.sid).name}</strong></div>
          <div className="po-item-summary grn-cell"><strong>{totalQty} · {g.lines.length} item{g.lines.length===1?"":"s"}</strong><small>{g.lines.slice(0,2).map(l=>`${product(l.pid).name} × ${l.qty}`).join(", ")}{g.lines.length>2?` +${g.lines.length-2} more`:""}</small></div>
          <div className="movement-note grn-cell"><strong>{g.by||"Staff"}</strong>{g.note&&<small>{g.note}</small>}</div><div className="grn-status grn-cell"><State value={g.status}/></div>
          <div className="grn-actions grn-cell"><div><button className="grn-action view" title="Open and print this GRN" onClick={()=>setModal({type:"view-grn",record:g})}><Eye size={14}/><span>View</span></button>
            {canEdit&&g.status==="Active"&&<button className="grn-action view" title="Return goods to supplier" onClick={()=>setModal({type:"supplier-return",grn:g})}><ArrowUpRight size={14}/><span>Return</span></button>}
            {canEdit&&g.status==="Active"&&<button className="grn-action reverse" title="Reverse this GRN and remove its quantities from stock" onClick={()=>reason("Reverse "+g.id,
              "This removes the received quantity from stock and records the correction.", "/grns/"+g.n+"/reverse","grns")}><RotateCcw size={14}/><span>Reverse</span></button>}</div></div>
        </div>})}</div>:
      <div className="movement-table-wrap"><div className="movement-table-head movement-table-row"><span>GRTN / Date</span><span>Supplier</span><span>Original GRN</span><span>Returned Items</span><span>Reason</span><span>Status</span><span>Actions</span></div>{list.map(r=><div className="movement-table-row" key={r.n}><div className="po-ref"><strong>{r.id}</strong><small>{today(r.date)}</small></div><div className="po-supplier"><span className="row-icon"><ArrowUpRight size={18}/></span><strong>{branch(r.sid).name}</strong></div><div className="movement-source"><strong>{r.grnId}</strong></div><div className="po-item-summary"><strong>{r.lines.reduce((n,l)=>n+l.qty,0)} · {r.lines.length} item{r.lines.length===1?"":"s"}</strong><small>{r.lines.slice(0,2).map(l=>product(l.pid).name).join(", ")}</small></div><div className="movement-note"><strong>{String(r.reasonType||"").replace("_"," ")}</strong>{r.note&&<small>{r.note}</small>}</div><State value={r.status}/><div className="po-actions"><button className="icon-btn" title="View and print GRTN" onClick={()=>setModal({type:"view-supplier-return",record:r})}><Eye size={17}/></button>{canEdit&&r.status==="Active"&&<button className="icon-btn danger" title="Reverse supplier return" onClick={()=>reason("Reverse "+r.id,"This restores the returned quantities to stock and keeps the GRTN in history.","/supplier-returns/"+r.n+"/reverse","grns")}><RotateCcw size={17}/></button>}</div></div>)}</div>}
  </>;
}

function CustomerOrders({d,customer,product,setModal,confirm,canEdit,navigate,user}) {
  const [q,setQ]=useState(""),[customerFilter,setCustomerFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("open"),[dateFilter,setDateFilter]=useState("all"),[page,setPage]=useState(1);
  const customers=[...new Set(d.orders.map(o=>o.cid))].map(id=>customer(id));
  const dateMatches=date=>{if(dateFilter==="all")return true;const now=new Date(),value=new Date(String(date).slice(0,10)+"T00:00:00"),days=Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-value)/86400000);return dateFilter==="today"?days===0:dateFilter==="7"?days>=0&&days<7:dateFilter==="30"?days>=0&&days<30:value.getFullYear()===now.getFullYear()&&value.getMonth()===now.getMonth();};
  const list=d.orders.filter(o=>(customerFilter==="all"||Number(customerFilter)===o.cid)&&(statusFilter==="all"||(statusFilter==="open"?["Open","Part dispatched"].includes(o.status):o.status===statusFilter))&&dateMatches(o.date)&&[o.id,customer(o.cid).name,o.status,...o.items.map(i=>product(i.pid).name)].join(" ").toLowerCase().includes(q.toLowerCase()));
  const pageSize=10,totalPages=Math.max(1,Math.ceil(list.length/pageSize)),currentPage=Math.min(page,totalPages),visible=list.slice((currentPage-1)*pageSize,currentPage*pageSize);
  useEffect(()=>setPage(1),[q,customerFilter,statusFilter,dateFilter]);
  return <div className="customer-orders-page">
    <SectionHeading title="Customer orders" sub="Record goods requested by customer companies before sending them."
      action={canEdit?()=>setModal({type:"order"}):null} label="New customer order"/>
    {accessLevel(user,"quotations")!=="none"&&<div className="quote-shortcut"><button type="button" className="text-button" onClick={()=>navigate("quotes")}><FileText size={16}/> View customer quotations <ArrowRight size={14}/></button></div>}
    <div className="customer-order-summary"><button type="button" className={"green "+(statusFilter==="all"?"on":"")} onClick={()=>setStatusFilter("all")}><span><ShoppingBag size={19}/></span><small>Total orders</small><strong>{d.orders.length}</strong></button><button type="button" className={"blue "+(statusFilter==="Open"?"on":"")} onClick={()=>setStatusFilter("Open")}><span><Truck size={19}/></span><small>Waiting to send</small><strong>{d.orders.filter(o=>o.status==="Open").length}</strong></button><button type="button" className={"amber "+(statusFilter==="Part dispatched"?"on":"")} onClick={()=>setStatusFilter("Part dispatched")}><span><Package size={19}/></span><small>Part dispatched</small><strong>{d.orders.filter(o=>o.status==="Part dispatched").length}</strong></button><button type="button" className={"green "+(statusFilter==="Dispatched"?"on":"")} onClick={()=>setStatusFilter("Dispatched")}><span><Check size={19}/></span><small>Completed</small><strong>{d.orders.filter(o=>o.status==="Dispatched").length}</strong></button></div>
    <div className="list-tools customer-order-tools"><SearchBox value={q} change={setQ} placeholder="Search order, customer or item…"/>
      <select className="filter-select" value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="open">Waiting to send</option><option value="Open">Open</option><option value="Part dispatched">Part dispatched</option><option value="Dispatched">Dispatched</option><option value="Cancelled">Cancelled</option><option value="Part cancelled">Part cancelled</option><option value="all">All statuses</option></select>
      <select className="filter-select" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} aria-label="Filter by date"><option value="all">All dates</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option></select></div>
    {!list.length?<Empty Icon={ShoppingBag} title="No matching customer orders" sub="Change the filters or create a new order."/>:
      <><div className="po-request-table customer-order-table"><div className="po-request-head po-request-row"><span>Order / Date</span><span>Customer</span><span>Items</span><span>Dispatch Progress</span><span>Status</span><span>Actions</span></div>
        {visible.map(o=>{const qty=o.items.reduce((s,l)=>s+l.qty,0),shipped=o.items.reduce((s,l)=>s+l.dispatched,0),percent=qty?Math.round(shipped/qty*100):0;return <div className="po-request-row customer-order-row" key={o.n}>
          <div className="po-ref po-request-ref"><strong>{o.id}</strong><small>{today(o.date)}</small></div>
          <div className="po-supplier po-request-supplier"><span className="row-icon"><ShoppingBag size={17}/></span><strong>{customer(o.cid).name}</strong></div>
          <div className="po-item-summary po-request-items"><strong>{o.items.length} item{o.items.length===1?"":"s"} · {qty}</strong><small>{o.items.slice(0,2).map(l=>product(l.pid).name).join(", ")}{o.items.length>2?` +${o.items.length-2} more`:""}</small></div>
          <div className="po-request-progress"><div><strong>{shipped} dispatched</strong><b>{percent}%</b></div><div className="bar"><i style={{width:percent+"%"}}/></div><small>{qty-shipped} remaining of {qty}</small></div>
          <div className="po-request-status"><State value={o.status}/></div><div className="po-request-actions"><button className="icon-btn" aria-label="View order details" title="View order details" onClick={()=>setModal({type:"view-order",record:o})}><Eye size={16}/></button>
            {accessLevel(user,"deliveries")==="edit"&&["Open","Part dispatched"].includes(o.status)&&<button className="icon-btn primary-icon" aria-label="Dispatch order" title="Dispatch order" onClick={()=>setModal({type:"dispatch",order:o})}><Truck size={16}/></button>}
            {canEdit&&o.status==="Open"&&<button className="icon-btn" aria-label="Edit order" title="Edit order" onClick={()=>setModal({type:"order",record:o})}><Pencil size={16}/></button>}
            {canEdit&&["Open","Part dispatched"].includes(o.status)&&<button className="icon-btn danger" aria-label="Cancel remaining order" title="Cancel remaining order" onClick={()=>confirm("Cancel customer order?","Any goods already sent will stay in delivery history.","/customer-orders/"+o.n)}><X size={16}/></button>}</div>
        </div>})}</div>{totalPages>1&&<div className="customer-order-pagination"><span>Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize,list.length)} of {list.length} orders</span><div><button className="btn ghost sm" disabled={currentPage===1} onClick={()=>setPage(p=>p-1)}>Previous</button><strong>{currentPage}</strong><button className="btn ghost sm" disabled={currentPage===totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>}</>}
  </div>;
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
    {!rows.length?<Empty Icon={tab==="deliveries"?Truck:RotateCcw} title={tab==="deliveries"?"No matching deliveries":"No matching returns"} sub="Change the filters to find another record."/>:
      <div className="movement-table-wrap"><div className="movement-table-head movement-table-row"><span>Document / Date</span><span>Customer</span><span>Source</span><span>Items</span><span>{tab==="deliveries"?"Sent by / Note":"Reason"}</span><span>Status</span><span>Actions</span></div>
        {rows.map(x=><div className="movement-table-row" key={x.n}><div className="po-ref"><strong>{x.id}</strong><small>{today(x.date)}</small></div>
          <div className="po-supplier"><span className="row-icon">{tab==="deliveries"?<Truck size={18}/>:<RotateCcw size={18}/>}</span><strong>{customer(x.cid).name}</strong></div>
          <div className="movement-source"><strong>{tab==="deliveries"?(one(d.orders,x.orderN)?.id||"Customer order"):(one(d.deliveries,x.deliveryN)?.id||"Delivery")}</strong></div>
          <div className="po-item-summary"><strong>{x.lines.reduce((sum,l)=>sum+l.qty,0)} · {x.lines.length} item{x.lines.length===1?"":"s"}</strong><small>{x.lines.slice(0,2).map(l=>product(l.pid).name).join(", ")}{x.lines.length>2?` +${x.lines.length-2} more`:""}</small></div>
          <div className="movement-note"><strong>{tab==="deliveries"?(x.byName||"Staff"):(x.note||"No reason")}</strong>{tab==="deliveries"&&<small>{x.note||"No note"}</small>}</div><State value={x.status}/>
          <div className="po-actions"><button className="icon-btn" title="View and print" onClick={()=>setModal({type:tab==="deliveries"?"view-delivery":"view-return",record:x})}><Eye size={17}/></button>
            {tab==="deliveries"&&canEdit&&x.status==="Active"&&<button className="icon-btn primary-icon" title="Record customer return" onClick={()=>setModal({type:"return",delivery:x})}><RotateCcw size={17}/></button>}
            {canEdit&&x.status==="Active"&&<button className="icon-btn danger" title={tab==="deliveries"?"Reverse delivery":"Reverse return"} onClick={()=>reason("Reverse "+x.id,tab==="deliveries"?"This restores sent quantities to stock. Deliveries with returns cannot be reversed.":"This removes the returned quantity from its original stock condition and records the correction.",tab==="deliveries"?"/deliveries/"+x.n+"/reverse":"/returns/"+x.n+"/reverse","deliveries")}><X size={17}/></button>}</div>
        </div>)}</div>}
  </>;
}

function StockHistory({d,product,user,setModal}) {
  const [q,setQ]=useState(""),[typeFilter,setTypeFilter]=useState("all"),[itemFilter,setItemFilter]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[direction,setDirection]=useState("all"),[page,setPage]=useState(1);
  const movementGroup=type=>/reversed/i.test(type)?"Reversal":/goods received/i.test(type)?"GRN":/^supplier return/i.test(type)?"Supplier Return":/^customer return/i.test(type)?"Customer Return":/deliver/i.test(type)?"Delivery":/^quarantine/i.test(type)?"Quarantine":"Adjustment";
  const relatedDocument=m=>{if(/^GRTN-/i.test(m.reference))return {type:"view-supplier-return",record:d.supplierReturns.find(x=>x.id===m.reference)};if(/^GRN-/i.test(m.reference))return {type:"view-grn",record:d.grns.find(x=>x.id===m.reference)};if(/^(DN|DEL)-/i.test(m.reference))return {type:"view-delivery",record:d.deliveries.find(x=>x.id===m.reference)};if(/^(RTN|RET)-/i.test(m.reference))return {type:"view-return",record:d.returns.find(x=>x.id===m.reference)};return null;};
  const [result,setResult]=useState({rows:[],totals:{records:0,stockIn:0,stockOut:0,adjustments:0},page:1,pageSize:10}),[fetching,setFetching]=useState(true),[historyError,setHistoryError]=useState("");
  useEffect(()=>setPage(1),[q,typeFilter,itemFilter,from,to,direction]);
  useEffect(()=>{let cancelled=false;setFetching(true);setHistoryError("");const query=new URLSearchParams({q,type:typeFilter,pid:itemFilter,from,to,direction,page:String(page)});request("/stock-history?"+query).then(value=>{if(!cancelled)setResult(value)}).catch(e=>{if(!cancelled)setHistoryError(e.message)}).finally(()=>{if(!cancelled)setFetching(false)});return()=>{cancelled=true};},[q,typeFilter,itemFilter,from,to,direction,page,d]);
  const totals={records:result.totals.records,in:result.totals.stockIn,out:result.totals.stockOut,adjustments:result.totals.adjustments};
  const pageSize=result.pageSize,totalPages=Math.max(1,Math.ceil(totals.records/pageSize)),currentPage=result.page,visible=result.rows;
  const reset=()=>{setQ("");setTypeFilter("all");setItemFilter("all");setFrom("");setTo("");setDirection("all");};
  return <>
    <SectionHeading title="Stock history" sub="A permanent record of goods received, sent out, returned and corrected."
      action={accessLevel(user,"stock_adjustments")==="edit"?()=>setModal({type:"adjust"}):null} label="Correct stock" Icon={RefreshCw}/>
    <div className="stock-history-summary"><button type="button" className={typeFilter==="all"&&direction==="all"?"on":""} onClick={()=>{setTypeFilter("all");setDirection("all")}}><span><History size={20}/></span><div><strong>{totals.records}</strong><small>Total records</small></div></button><button type="button" className={direction==="in"?"on stock-in":"stock-in"} onClick={()=>setDirection("in")}><span><ArrowDownLeft size={20}/></span><div><strong>{totals.in}</strong><small>Stock in</small></div></button><button type="button" className={direction==="out"?"on stock-out":"stock-out"} onClick={()=>setDirection("out")}><span><ArrowUpRight size={20}/></span><div><strong>{totals.out}</strong><small>Stock out</small></div></button><button type="button" className={typeFilter==="Adjustment"?"on adjustment":"adjustment"} onClick={()=>{setTypeFilter("Adjustment");setDirection("all")}}><span><BarChart3 size={20}/></span><div><strong>{totals.adjustments}</strong><small>Adjustments</small></div></button></div>
    <div className="stock-history-filters"><div className="stock-history-search stock-history-field"><span>Search</span><SearchBox value={q} change={setQ} placeholder="Search item, document or staff…"/></div>
      <label className="stock-history-field"><span>Movement Type</span><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} aria-label="Filter by movement type"><option value="all">All movement types</option><option value="GRN">GRN</option><option value="Delivery">Delivery</option><option value="Supplier Return">Supplier Return</option><option value="Customer Return">Customer Return</option><option value="Quarantine">Quarantine</option><option value="Adjustment">Adjustment</option><option value="Reversal">Reversal</option></select></label>
      <label className="stock-history-field"><span>Item</span><select value={itemFilter} onChange={e=>setItemFilter(e.target.value)} aria-label="Filter by item"><option value="all">All items</option>{[...d.products].sort((a,b)=>a.name.localeCompare(b.name)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label><span>From</span><input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
      <label><span>To</span><input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
      <label className="stock-history-field"><span>Direction</span><select value={direction} onChange={e=>setDirection(e.target.value)} aria-label="Filter by stock direction"><option value="all">Stock in & out</option><option value="in">Stock in</option><option value="out">Stock out</option><option value="quarantine">Quarantine changes</option></select></label>
      <button className="btn ghost stock-history-reset" type="button" onClick={reset}>Reset filters</button></div>
    <div className="stock-history-count"><strong>{totals.records}</strong> matching record{totals.records===1?"":"s"}</div>
    {historyError?<p className="field-error">{historyError}</p>:fetching?<p className="mute">Loading stock history…</p>:!visible.length?<Empty Icon={History} title="No stock movements" sub="Movements appear after stock is added, received, sent or corrected."/>:
      <><div className="stock-history-table"><div className="stock-history-head stock-history-row"><span>Date & Time</span><span>Item</span><span>Movement Type</span><span>Reference</span><span>Stock In</span><span>Stock Out</span><span>Recorded By</span><span>Actions</span></div>
      {visible.map(m=>{const doc=relatedDocument(m),date=String(m.at||"").replace("T"," ");return <div className="stock-history-row" key={m.id}>
        <div className="stock-history-time"><strong>{date.slice(0,10)}</strong><small>{date.slice(11,16)||"—"}</small></div>
        <div className="stock-history-item"><span className={"delta-icon "+(m.qty>0?"plus":"minus")}>{m.qty>0?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</span><div><strong>{product(m.pid).name}</strong>{m.note&&<small>{m.note}</small>}</div></div>
        <div><span className="stock-history-type">{movementGroup(m.type)}</span><small className="stock-history-event">{m.type}</small>{!!m.damagedQty&&<small className="stock-history-event">Quarantine {m.damagedQty>0?"+":""}{m.damagedQty}</small>}</div>
        <div>{doc?.record?<button className="stock-history-reference" onClick={()=>setModal(doc)}>{m.reference}</button>:<span className="stock-history-reference plain">{m.reference}</span>}</div>
        <strong className={`stock-history-in ${m.qty>0?"has-value":""}`}>{m.qty>0?`+${m.qty}`:"—"}</strong><strong className={`stock-history-out ${m.qty<0?"has-value":""}`}>{m.qty<0?m.qty:"—"}</strong>
        <div className="stock-history-actor">{m.actor||"System"}</div><div className="stock-history-actions">{doc?.record?<button className="icon-btn" title={"View "+m.reference} aria-label={"View "+m.reference} onClick={()=>setModal(doc)}><Eye size={16}/></button>:<span>—</span>}</div>
      </div>})}</div>
      <div className="stock-history-pagination"><span>Showing {(currentPage-1)*pageSize+1}-{Math.min(currentPage*pageSize,totals.records)} of {totals.records} records</span><div><button className="icon-btn" title="Previous page" disabled={currentPage===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><strong>{currentPage}</strong><span>of {totalPages}</span><button className="icon-btn" title="Next page" disabled={currentPage===totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div></>}

  </>;
}

const REPORT_TYPES = [
  ["stock","Stock Summary Report",Package],["po","Stock Requests (PO) Report",ClipboardList],["grn","Goods Received (GRN) Report",PackageCheck],["supplierReturn","Supplier Returns (GRTN) Report",ArrowUpRight],["orders","Customer Orders Report",ShoppingBag],
  ["quotations","Customer Quotations Report",FileText],["deliveries","Deliveries Report",Truck],["customerReturn","Customer Returns Report",RotateCcw],["movement","Stock Movement History Report",History],["suppliers","Suppliers / Branches Report",Building2],["customers","Customer Companies Report",Users]
];
function Reports({d,branch,customer,product}) {
  const iso=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  const periodRange=period=>{const now=businessNow(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);if(period==="today"){}else if(period==="yesterday"){start.setDate(start.getDate()-1);end.setTime(start.getTime());}else if(period==="thisWeek"){start.setDate(start.getDate()-((start.getDay()+6)%7));}else if(period==="thisMonth"){start.setDate(1);}else if(period==="lastMonth"){start.setMonth(start.getMonth()-1,1);end.setDate(0);}else if(period==="thisYear"){start.setMonth(0,1);}else return {from:"",to:""};return {from:iso(start),to:iso(end)};};
  const blankFilters=()=>({from:"",to:"",period:"all",sid:"all",cid:"all",pid:"all",status:"all"});
  const [type,setType]=useState("stock"),[filters,setFilters]=useState(()=>blankFilters()),[report,setReport]=useState(null);
  const setFilter=(key,value)=>setFilters(o=>({...o,[key]:value})),config=REPORT_TYPES.find(x=>x[0]===type);
  const setPeriod=value=>setFilters(o=>({...o,period:value,...(["all","custom"].includes(value)?{from:"",to:""}:periodRange(value))}));
  const resetFilters=()=>setFilters(blankFilters());
  const usesDate=["stock","po","grn","supplierReturn","orders","quotations","deliveries","customerReturn","movement"].includes(type),usesSupplier=["stock","po","grn","supplierReturn","suppliers"].includes(type),usesCustomer=["orders","quotations","deliveries","customerReturn","customers"].includes(type),usesItem=["stock","po","grn","supplierReturn","orders","quotations","deliveries","customerReturn","movement"].includes(type),usesStatus=!['suppliers','customers'].includes(type);
  const movementGroup=t=>/reversed/i.test(t)?"Reversal":/goods received/i.test(t)?"GRN":/^supplier return/i.test(t)?"Supplier Return":/^customer return/i.test(t)?"Customer Return":/deliver/i.test(t)?"Delivery":/^quarantine/i.test(t)?"Quarantine":"Adjustment";
  const statuses={stock:[["active","Active"],["low","Low stock"],["out","Out of stock"],["archived","Archived"]],po:[...new Set(d.pos.map(x=>x.status))].map(x=>[x,x]),grn:[...new Set(d.grns.map(x=>x.status))].map(x=>[x,x]),supplierReturn:[...new Set(d.supplierReturns.map(x=>x.status))].map(x=>[x,x]),orders:[...new Set(d.orders.map(x=>x.status))].map(x=>[x,x]),quotations:[...new Set(d.quotations.map(x=>["Sent","Approved"].includes(x.status)&&x.validUntil<colomboDate()?"Expired":x.status))].map(x=>[x,x]),deliveries:[...new Set(d.deliveries.map(x=>x.status))].map(x=>[x,x]),customerReturn:[...new Set(d.returns.map(x=>x.status))].map(x=>[x,x]),movement:["GRN","Delivery","Supplier Return","Customer Return","Quarantine","Adjustment","Reversal"].map(x=>[x,x])}[type]||[];
  const dateOk=date=>(!filters.from||String(date).slice(0,10)>=filters.from)&&(!filters.to||String(date).slice(0,10)<=filters.to),hasItem=lines=>filters.pid==="all"||lines.some(l=>l.pid===Number(filters.pid)),selectedLines=lines=>lines.filter(l=>filters.pid==="all"||l.pid===Number(filters.pid)),sumQty=lines=>selectedLines(lines).reduce((n,l)=>n+l.qty,0);
  const build=()=>{
    let columns=[],rows=[],summary=[];
    if(type==="stock"){
      const movements=d.reportMovements||[],from=filters.from;
      const byProduct=new Map();
      for(const m of movements){if(!byProduct.has(m.pid))byProduct.set(m.pid,[]);byProduct.get(m.pid).push(m);}
      const docs=d.products.map(p=>{
        const all=byProduct.get(p.id)||[],prior=from?all.filter(m=>String(m.at).slice(0,10)<from):[],period=all.filter(m=>dateOk(m.at));
        const opening=prior.reduce((n,m)=>n+m.qty,0),openingHold=prior.reduce((n,m)=>n+(m.damagedQty||0),0);
        let received=0,supplierReturns=0,deliveries=0,customerReturns=0,adjustments=0,holdChange=0;
        period.forEach(m=>{if(m.type==="Goods received"||m.type==="GRN reversed")received+=m.qty;else if(/^Supplier return/.test(m.type))supplierReturns-=m.qty;else if(m.type==="Delivered to customer"||m.type==="Delivery reversed")deliveries-=m.qty;else if(/^Customer return/.test(m.type))customerReturns+=m.qty;else adjustments+=m.qty;holdChange+=m.damagedQty||0;});
        const closing=opening+received-supplierReturns-deliveries+customerReturns+adjustments,closingHold=openingHold+holdChange,status=p.active!==1?"Archived":closing<=0?"Out of stock":closing<=p.reorder?"Low stock":"Active";
        return {p,opening,received,supplierReturns,deliveries,customerReturns,adjustments,closing,openingHold,holdChange,closingHold,status};
      }).filter(x=>(filters.sid==="all"||x.p.sid===Number(filters.sid))&&(filters.pid==="all"||x.p.id===Number(filters.pid))&&(filters.status==="all"||(filters.status==="active"?x.status==="Active":filters.status==="archived"?x.status==="Archived":filters.status==="out"?x.status==="Out of stock":x.status==="Low stock")));
      columns=["Item / SKU","Opening available","Net received","Net supplier returns","Net deliveries","Net sellable returns","Net adjustments","Closing available","Opening quarantine","Quarantine change","Closing quarantine","Stock status"];
      rows=docs.map(x=>[`${x.p.name} / ${x.p.sku||"—"}`,x.opening,x.received,x.supplierReturns,x.deliveries,x.customerReturns,x.adjustments,x.closing,x.openingHold,x.holdChange,x.closingHold,x.status]);
      summary=[["Items",docs.length],["Opening available",docs.reduce((n,x)=>n+x.opening,0)],["Closing available",docs.reduce((n,x)=>n+x.closing,0)],["Closing quarantine",docs.reduce((n,x)=>n+x.closingHold,0)]];
    } else if(type==="po"){
      const docs=d.pos.filter(x=>dateOk(x.date)&&(filters.sid==="all"||x.sid===Number(filters.sid))&&hasItem(x.items)&&(filters.status==="all"||x.status===filters.status));columns=["PO","Date","Supplier","Items","Requested","Received","Remaining","Status"];rows=docs.map(x=>{const lines=selectedLines(x.items),q=lines.reduce((n,l)=>n+l.qty,0),r=lines.reduce((n,l)=>n+l.received,0);return[x.id,today(x.date),branch(x.sid).name,lines.map(l=>product(l.pid).name).join(", "),q,r,q-r,x.status]});summary=[["Requests",docs.length],["Requested",rows.reduce((n,r)=>n+Number(r[4]),0)],["Received",rows.reduce((n,r)=>n+Number(r[5]),0)]];
    } else if(type==="grn"){
      const docs=d.grns.filter(x=>dateOk(x.date)&&(filters.sid==="all"||x.sid===Number(filters.sid))&&hasItem(x.lines)&&(filters.status==="all"||x.status===filters.status));columns=["GRN","Date","PO","Supplier","Items","Quantity","Received By","Status"];rows=docs.map(x=>[x.id,today(x.date),x.poId,branch(x.sid).name,selectedLines(x.lines).map(l=>product(l.pid).name).join(", "),sumQty(x.lines),x.by,x.status]);summary=[["GRNs",docs.length],["Active received",docs.filter(x=>x.status==="Active").reduce((n,x)=>n+sumQty(x.lines),0)],["Reversed qty",docs.filter(x=>x.status==="Reversed").reduce((n,x)=>n+sumQty(x.lines),0)]];
    } else if(type==="supplierReturn"){
      const docs=d.supplierReturns.filter(x=>dateOk(x.date)&&(filters.sid==="all"||x.sid===Number(filters.sid))&&hasItem(x.lines)&&(filters.status==="all"||x.status===filters.status));columns=["GRTN","Original GRN","Company","Item","Quantity","Date","Reason","Status","Recorded By"];rows=docs.flatMap(x=>selectedLines(x.lines).map(l=>[x.id,x.grnId,branch(x.sid).name,product(l.pid).name,l.qty,today(x.date),`${String(x.reasonType).replace("_"," ")}${x.note?` — ${x.note}`:""}`,x.status,x.by||"—"]));summary=[["Supplier returns",docs.length],["Active returned",docs.filter(x=>x.status==="Active").reduce((n,x)=>n+sumQty(x.lines),0)],["Reversed qty",docs.filter(x=>x.status==="Reversed").reduce((n,x)=>n+sumQty(x.lines),0)]];
    } else if(type==="quotations"){
      const docs=d.quotations.map(x=>({...x,status:["Sent","Approved"].includes(x.status)&&x.validUntil<colomboDate()?"Expired":x.status})).filter(x=>dateOk(x.date)&&(filters.cid==="all"||x.cid===Number(filters.cid))&&hasItem(x.items)&&(filters.status==="all"||x.status===filters.status));
      columns=["Quotation","Date","Customer","Items","Quantity","Total (Rs)","Valid Until","Status","Customer Order"];
      rows=docs.map(x=>{const lines=selectedLines(x.items),qty=lines.reduce((n,l)=>n+l.qty,0),value=lines.reduce((n,l)=>n+l.qty*l.price,0);
        const linked=d.orders.find(o=>o.n===x.convertedN);
        return [x.id,today(x.date),x.customerName,lines.map(l=>l.name).join(", "),qty,value.toFixed(2),x.validUntil,x.status,linked?.id||"—"];});
      summary=[["Quotations",docs.length],["Total quoted (Rs)",rows.reduce((n,r)=>n+Number(r[5]),0).toFixed(2)],["Converted",docs.filter(x=>x.status==="Converted").length]];
    } else if(type==="orders"){
      const docs=d.orders.filter(x=>dateOk(x.date)&&(filters.cid==="all"||x.cid===Number(filters.cid))&&hasItem(x.items)&&(filters.status==="all"||x.status===filters.status));columns=["Order","Date","Customer","Items","Ordered","Dispatched","Remaining","Status"];rows=docs.map(x=>{const lines=selectedLines(x.items),q=lines.reduce((n,l)=>n+l.qty,0),sent=lines.reduce((n,l)=>n+l.dispatched,0);return[x.id,today(x.date),customer(x.cid).name,lines.map(l=>product(l.pid).name).join(", "),q,sent,q-sent,x.status]});summary=[["Orders",docs.length],["Ordered",rows.reduce((n,r)=>n+Number(r[4]),0)],["Dispatched",rows.reduce((n,r)=>n+Number(r[5]),0)]];
    } else if(type==="deliveries"){
      const docs=d.deliveries.filter(x=>dateOk(x.date)&&(filters.cid==="all"||x.cid===Number(filters.cid))&&hasItem(x.lines)&&(filters.status==="all"||x.status===filters.status));columns=["Delivery","Original Order","Company","Item","Quantity","Date","Status","Recorded By"];rows=docs.flatMap(x=>selectedLines(x.lines).map(l=>[x.id,one(d.orders,x.orderN)?.id||"—",customer(x.cid).name,product(l.pid).name,l.qty,today(x.date),x.status,x.byName||"—"]));summary=[["Deliveries",docs.length],["Active delivered",docs.filter(x=>x.status==="Active").reduce((n,x)=>n+sumQty(x.lines),0)],["Reversed qty",docs.filter(x=>x.status==="Reversed").reduce((n,x)=>n+sumQty(x.lines),0)]];
    } else if(type==="customerReturn"){
      const docs=d.returns.filter(x=>dateOk(x.date)&&(filters.cid==="all"||x.cid===Number(filters.cid))&&hasItem(x.lines)&&(filters.status==="all"||x.status===filters.status));columns=["Return","Original Delivery","Company","Item","Quantity","Date","Reason","Status","Recorded By","Condition"];rows=docs.flatMap(x=>selectedLines(x.lines).map(l=>[x.id,one(d.deliveries,x.deliveryN)?.id||"—",customer(x.cid).name,product(l.pid).name,l.qty,today(x.date),x.note||"—",x.status,(d.reportMovements||[]).find(m=>m.reference===x.id)?.actor||"—",l.condition==="quarantine"?"Quarantined":"Sellable"]));summary=[["Customer returns",docs.length],["Active returned",docs.filter(x=>x.status==="Active").reduce((n,x)=>n+sumQty(x.lines),0)],["Reversed qty",docs.filter(x=>x.status==="Reversed").reduce((n,x)=>n+sumQty(x.lines),0)]];
    } else if(type==="movement"){
      const docs=(d.reportMovements||d.movements).filter(x=>dateOk(x.at)&&(filters.pid==="all"||x.pid===Number(filters.pid))&&(filters.status==="all"||movementGroup(x.type)===filters.status));columns=["Date & Time (SL)","Item","Movement Type","Reference","Available In","Available Out","Quarantine Change","Recorded By"];rows=docs.map(x=>[x.at,product(x.pid).name,x.type,x.reference,x.qty>0?x.qty:"—",x.qty<0?Math.abs(x.qty):"—",x.damagedQty||0,x.actor]);summary=[["Movements",docs.length],["Stock in",docs.filter(x=>x.qty>0).reduce((n,x)=>n+x.qty,0)],["Stock out",Math.abs(docs.filter(x=>x.qty<0).reduce((n,x)=>n+x.qty,0))]];
    } else if(type==="suppliers"){
      const docs=d.branches.filter(x=>filters.sid==="all"||x.id===Number(filters.sid));columns=["Supplier / Branch","Type","Contact","Phone","Location","Status"];rows=docs.map(x=>[x.name,x.supplier_type||"—",x.contact||"—",x.phone||"—",x.location||"—",x.active===1?"Active":"Archived"]);summary=[["Suppliers",docs.length],["Active",docs.filter(x=>x.active===1).length],["Archived",docs.filter(x=>x.active!==1).length]];
    } else {const docs=d.customers.filter(x=>filters.cid==="all"||x.id===Number(filters.cid));columns=["Customer Company","Type","Contact","Phone","Address","Status"];rows=docs.map(x=>[x.name,x.customer_type||"—",x.contact||"—",x.phone||"—",x.address||"—",x.active===1?"Active":"Archived"]);summary=[["Customers",docs.length],["Active",docs.filter(x=>x.active===1).length],["Archived",docs.filter(x=>x.active!==1).length]];}
    const chosen=[];if(filters.from)chosen.push(`From ${filters.from}`);if(filters.to)chosen.push(`To ${filters.to}`);if(filters.sid!=="all")chosen.push((type==="stock"?"Usual supplier: ":"")+branch(Number(filters.sid)).name);if(filters.cid!=="all")chosen.push(customer(Number(filters.cid)).name);if(filters.pid!=="all")chosen.push(product(Number(filters.pid)).name);if(filters.status!=="all")chosen.push(filters.status);
    setReport({title:config[1],columns,rows,summary,filters:chosen.length?chosen.join(" · "):"All records",generated:new Date().toLocaleString("en-LK",{timeZone:"Asia/Colombo"})});
  };
  useEffect(()=>{build();},[type,filters.from,filters.to,filters.sid,filters.cid,filters.pid,filters.status,d]);
  const safe=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"),html=()=>`<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px Arial;color:#10251f;padding:24px}h1{color:#147a5b;margin-bottom:4px}p{color:#687b74}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dfe9e4;padding:8px;text-align:left}th{background:#edf5f1}.meta{display:flex;justify-content:space-between}</style></head><body><h1>${safe(report.title)}</h1><div class="meta"><strong>Supun Group of Companies</strong><span>Generated ${safe(report.generated)}</span></div><p>${safe(report.filters)} · Sri Lanka time</p><p>${report.summary.map(([label,value])=>safe(label)+": "+safe(value)).join(" · ")}</p><table><thead><tr>${report.columns.map(x=>`<th>${safe(x)}</th>`).join("")}</tr></thead><tbody>${report.rows.map(row=>`<tr>${row.map(x=>`<td>${safe(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const download=()=>{const url=URL.createObjectURL(new Blob([html()],{type:"application/vnd.ms-excel;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=report.title.replace(/[^a-z0-9]+/gi,"_")+".xls";a.click();URL.revokeObjectURL(url);},printReport=()=>{const w=window.open("","_blank");if(w){w.document.write(html());w.document.close();setTimeout(()=>w.print(),150);}};
  return <div className="reports-page"><SectionHeading title="Reports" sub="Generate read-only operational reports from current StockEasy records."/>
    <div className="report-type-grid">{REPORT_TYPES.map(([key,label,Icon])=><button key={key} className={"report-type-card"+(type===key?" on":"")} onClick={()=>{setType(key);setFilters(blankFilters());}}><Icon size={19}/><span>{label}</span></button>)}</div>
    <div className="report-filter-panel"><div className="report-filter-head"><div><span>Report filters</span><strong>{config[1]}</strong></div><div className="report-actions"><button className="btn ghost sm" type="button" onClick={resetFilters}><RotateCcw size={15}/> Reset Filters</button></div></div><div className="report-filter-grid">{type==="stock"&&<label><span>Date Range</span><select value={filters.period} onChange={e=>setPeriod(e.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="thisWeek">This Week</option><option value="thisMonth">This Month</option><option value="lastMonth">Last Month</option><option value="thisYear">This Year</option><option value="custom">Custom Date Range</option></select></label>}{usesDate&&<><label><span>From</span><input type="date" value={filters.from} max={filters.to||undefined} disabled={type==="stock"&&!['custom','all'].includes(filters.period)} onChange={e=>setFilter("from",e.target.value)}/></label><label><span>To</span><input type="date" value={filters.to} min={filters.from||undefined} disabled={type==="stock"&&!['custom','all'].includes(filters.period)} onChange={e=>setFilter("to",e.target.value)}/></label></>}{usesSupplier&&<label><span>{type==="stock"?"Usual Supplier":"Supplier / Branch"}</span><select value={filters.sid} onChange={e=>setFilter("sid",e.target.value)}><option value="all">All suppliers / branches</option>{d.branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}{usesCustomer&&<label><span>Customer Company</span><select value={filters.cid} onChange={e=>setFilter("cid",e.target.value)}><option value="all">All customer companies</option>{d.customers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}{usesItem&&<label><span>Item / Product</span><select value={filters.pid} onChange={e=>setFilter("pid",e.target.value)}><option value="all">All items</option>{d.products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}{usesStatus&&<label><span>{type==="movement"?"Movement Type":"Status"}</span><select value={filters.status} onChange={e=>setFilter("status",e.target.value)}><option value="all">All {type==="movement"?"movement types":"statuses"}</option>{statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}</div></div>
    {!report?<div className="report-placeholder"><BarChart3 size={30}/><strong>Select filters and preview the report</strong><span>No data is changed when reports are generated.</span></div>:<div className="report-output">{type==="stock"&&<div className="notice"><Info size={16}/> Balances use recorded movements in Sri Lanka time. Usual supplier is a product attribute, not stock provenance. Historical status uses current reorder settings. Balances before the initial migration are not available.</div>}<div className="report-output-head"><div><span>Supun Group of Companies</span><h2>{report.title}</h2><p>{report.filters} · Generated {report.generated}</p></div><div className="report-actions"><button className="btn ghost sm" onClick={download}><Download size={15}/> Download Excel</button><button className="btn ghost sm" onClick={printReport}><Printer size={15}/> Print / Save as PDF</button></div></div><div className="report-summary">{report.summary.map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>{!report.rows.length?<Empty Icon={BarChart3} title="No matching records" sub="Change the filters and preview again."/>:<div className="report-table-wrap"><table><thead><tr>{report.columns.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{report.rows.map((row,i)=><tr key={i}>{row.map((x,j)=><td key={j}>{x}</td>)}</tr>)}</tbody></table></div>}</div>}
  </div>;
}

function Staff({ staff,user,setModal,confirm,action }) {
  const [q,setQ]=useState(""),[roleFilter,setRoleFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("all"),[page,setPage]=useState(1);
  const accessName=s=>s.role==="admin"?"Administrator · Full access":s.role==="viewer"?"Viewer · View only":"Staff · Custom access";
  const rows=staff.filter(s=>(roleFilter==="all"||s.role===roleFilter)&&(statusFilter==="all"||(statusFilter==="active"?s.active===1:s.active!==1))&&[s.username,s.role,accessName(s),...Object.entries(s.permissions||{}).flat()].join(" ").toLowerCase().includes(q.toLowerCase()));
  const pageSize=10,totalPages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,totalPages),visible=rows.slice((currentPage-1)*pageSize,currentPage*pageSize);
  useEffect(()=>setPage(1),[q,roleFilter,statusFilter]);
  return <>
    <SectionHeading title="User access management" sub="Create accounts and choose View, Edit, or No Access for every system module."
      action={()=>setModal({type:"staff"})} label="Add user account"/>
    <div className="database-backup-card"><div><span><Download size={20}/></span><div><strong>Database backup</strong><small>Download a secure snapshot of all StockEasy records.</small></div></div><a className="btn ghost sm" href="/api/admin/database-backup"><Download size={16}/> Download Backup</a></div>
    <div className="staff-summary"><div><small>Total users</small><strong>{staff.length}</strong></div><div><small>Active</small><strong>{staff.filter(s=>s.active===1).length}</strong></div><div><small>Disabled</small><strong>{staff.filter(s=>s.active!==1).length}</strong></div></div>
    <div className="staff-tools"><SearchBox value={q} change={setQ} placeholder="Search username, role or access…"/><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} aria-label="Filter by role or access"><option value="all">All roles / access</option><option value="admin">Administrators</option><option value="staff">Custom access</option><option value="viewer">View only</option></select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Filter by account status"><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></div>
    <div className="result-count"><strong>{rows.length}</strong> matching user{rows.length===1?"":"s"}</div>
    {!rows.length?<Empty Icon={Shield} title="No matching users" sub="Change the search text or filters."/>:<><div className="staff-table"><div className="staff-row staff-head"><span>Username</span><span>Role / Access</span><span>Status</span><span>Actions</span></div>{visible.map(s=><div className="staff-row" key={s.id}>
      <div className="staff-user"><span className="user-avatar">{s.username[0].toUpperCase()}</span><div><strong>{s.username}</strong>{s.id===user.id&&<small>Current account</small>}</div></div>
      <div className="staff-role"><strong>{accessName(s)}</strong>{s.role!=="admin"&&<small>{Object.values(s.permissions||{}).filter(x=>x==="edit").length} edit · {Object.values(s.permissions||{}).filter(x=>x==="view").length} view</small>}</div>
      <div className="staff-status"><Pill kind={s.active?"good":"off"}>{s.active?"Active":"Disabled"}</Pill></div>
      <div className="staff-actions"><button className="icon-btn" title="View permissions" aria-label={"View permissions for "+s.username} onClick={()=>setModal({type:"staff-permissions",record:s})}><Eye size={16}/></button><button className="icon-btn" title="Edit access" aria-label={"Edit access for "+s.username} onClick={()=>setModal({type:"staff",record:s})}><Pencil size={16}/></button>
        {s.id!==user.id&&s.active===1&&<button className="icon-btn danger" title="Disable account" aria-label={"Disable "+s.username} onClick={()=>confirm("Disable "+s.username+"?","This person will no longer be able to sign in.","/staff/"+s.id,"DELETE","staff")}><X size={16}/></button>}
        {s.id!==user.id&&s.active!==1&&<button className="icon-btn primary-icon" title="Enable account" aria-label={"Enable "+s.username} onClick={()=>action("/staff/"+s.id,"PUT",{username:s.username,role:s.role,permissions:s.permissions,active:1},s.username+" enabled.","staff")}><Check size={16}/></button>}</div>
    </div>)}</div>{totalPages>1&&<div className="staff-pagination"><button className="btn ghost sm" disabled={currentPage===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page <strong>{currentPage}</strong> of {totalPages}</span><button className="btn ghost sm" disabled={currentPage===totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div>}</>}
  </>;
}

function Dialog({ modal, ctx, staff, close }) {
  const {d,branch,customer,product,action,busy,user,openProduct,refresh,setModal}=ctx;
  if(modal.type==="confirm") return <Modal title={modal.title} sub={modal.text} close={close}>
    <div className="notice"><Info size={20}/> Historical records are kept for stock accuracy.</div>
    <div className="form-actions"><button className="btn" disabled={busy} onClick={modal.execute}>Yes, continue</button>
      <button className="btn ghost" onClick={close}>Keep it</button></div></Modal>;
  if(modal.type==="reason") return <ReasonDialog modal={modal} busy={busy} close={close}/>;
  if(modal.type==="branch"||modal.type==="customer") return <DirectoryForm modal={modal} close={close} busy={busy} action={action}/>;
  if(modal.type==="product") return <ProductForm modal={modal} close={close} busy={busy} action={action} d={d} refresh={refresh} user={user} openBulk={()=>setModal({type:"inventory-bulk"})}/>;
  if(modal.type==="inventory-bulk") return <InventoryBulkForm d={d} close={close} action={action} busy={busy}/>;
  if(modal.type==="categories") return <CategoryManager d={d} close={close} refresh={refresh}/>;
  if(modal.type==="po") return <DocumentForm modal={modal} close={close} busy={busy} action={action} d={d} kind="po"/>;
  if(modal.type==="quotation") return <QuotationForm record={modal.record} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="view-quotation") return <QuotationView record={modal.record} d={d} close={close}/>;
  if(modal.type==="quotation-decision") return <QuotationDecision record={modal.record} status={modal.status} close={close} busy={busy} action={action}/>;
  if(modal.type==="quotation-convert") return <QuotationConvert record={modal.record} close={close} busy={busy} action={action}/>;
  if(modal.type==="order") return <DocumentForm modal={modal} close={close} busy={busy} action={action} d={d} kind="order"/>;
  if(modal.type==="grn") return <MovementForm title="Receive goods (GRN)" type="grn" doc={modal.po} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="supplier-return") return <SupplierReturnForm grn={modal.grn} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="dispatch") return <MovementForm title="Send goods to customer" type="dispatch" doc={modal.order} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="return") return <MovementForm title="Customer return" type="return" doc={modal.delivery} d={d} close={close} busy={busy} action={action}/>;
  if(modal.type==="adjust"&&accessLevel(user,"stock_adjustments")==="edit") return <AdjustmentForm d={d} record={modal.record} busy={busy} close={close} action={action} user={user}/>;
  if(modal.type==="staff") return <StaffForm record={modal.record} close={close} busy={busy} action={action}/>;
  if(modal.type==="staff-permissions") return <StaffPermissionsView record={modal.record} close={close}/>;
  if(["view-po","view-order","view-delivery","view-grn","view-return","view-supplier-return"].includes(modal.type)) return <DocumentView modal={modal} d={d} branch={branch} customer={customer} product={product} openProduct={openProduct} close={close}/>;
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
  const submit=e=>{e.preventDefault();action("/"+route+(record?"/"+record.id:""),record?"PUT":"POST",f,(isBranch?"Supplier":"Company")+" saved.");};
  if(isBranch)return <Modal wide className="supplier-form-modal" HeaderIcon={Building2} title={(record?"Edit ":"Add ")+"supplier"} sub="Add the supplier and contact details used in stock requests." close={close}>
    <form className="supplier-form" onSubmit={submit}>
      <div className="supplier-form-type"><label>Supplier type *</label><div className="type-choice">
        <button type="button" className={recordType==="internal"?"on":""} onClick={()=>set(typeKey,"internal")}><Building2 size={18}/><span><strong>Internal</strong><small>Supun Group branch</small></span></button>
        <button type="button" className={recordType==="external"?"on":""} onClick={()=>set(typeKey,"external")}><Truck size={18}/><span><strong>External</strong><small>Outside supplier</small></span></button>
      </div></div>
      <div className="supplier-form-field full"><label>Supplier name *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Example: Fresh Farm Foods"/></div>
      <div className="supplier-form-field"><label>Contact person</label><input value={f.contact||""} onChange={e=>set("contact",e.target.value)} placeholder="Contact name"/></div>
      <div className="supplier-form-field"><label>Primary phone</label><input type="tel" value={f.phone||""} onChange={e=>set("phone",e.target.value)} placeholder="Contact number"/></div>
      <div className="supplier-form-field"><label>Secondary phone</label><input type="tel" value={f.phone2||""} onChange={e=>set("phone2",e.target.value)} placeholder="Alternative number"/></div>
      <div className="supplier-form-field"><label>Supplier location</label><input value={f.location||""} onChange={e=>set("location",e.target.value)} placeholder="Address or location"/></div>
      <div className="supplier-form-field full"><label>Notes</label><textarea rows={2} value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Opening hours, delivery instructions, or other notes"/></div>
      {record&&<label className="supplier-active-toggle full"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/><span aria-hidden="true"/><div><strong>Active supplier</strong><small>Available in new stock requests</small></div></label>}
      <div className="supplier-form-actions"><button className="btn ghost" type="button" onClick={close}>Cancel</button><button className="btn" type="submit" disabled={busy||!f.name.trim()}><Check size={17}/>{busy?"Saving...":record?"Update supplier":"Save supplier"}</button></div>
    </form>
  </Modal>;
  return <Modal title={(record?"Edit ":"Add ")+"customer company"} sub="Fill in the details below." close={close}>
    <form onSubmit={submit}>
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
function ProductForm({modal,close,busy,action,d,refresh,user,openBulk}) {
  const p=modal.record,branches=active(d.branches);
  const categories=d.categories||[];
  const defaultCategory=p?.category||categories.find(c=>c.active)?.name||"";
  const [f,setF]=useState(()=>p?{...p}:{name:"",sku:"",category:defaultCategory,emoji:"📦",img:null,sid:branches[0]?.id||"",unit:"units",cost:0,sell:0,stock:0,reorder:5,active:1});
  const [categoryOpen,setCategoryOpen]=useState(false),[categoryName,setCategoryName]=useState(""),[categoryBusy,setCategoryBusy]=useState(false),[categoryError,setCategoryError]=useState("");
  const set=(key,val)=>setF(o=>({...o,[key]:val}));
  const addCategory=async e=>{e.preventDefault();setCategoryBusy(true);setCategoryError("");try{const result=await request("/categories","POST",{name:categoryName});await refresh();set("category",result.name);setCategoryName("");setCategoryOpen(false);}catch(error){setCategoryError(error.message);}finally{setCategoryBusy(false);}};
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
      <label>Item name *</label><input autoFocus required value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Example: CAMY Air Conditioner"/>
      <label>Item code (optional)</label><input value={f.sku||""} onChange={e=>set("sku",e.target.value)} placeholder="ITEM-001"/>
      <label>Category *</label><div className="category-field"><select required value={f.category} onChange={e=>set("category",e.target.value)}><option value="">Choose a category</option>{categories.filter(c=>c.active||c.name===f.category).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select><button className="btn ghost sm" type="button" onClick={()=>setCategoryOpen(true)}><Plus size={15}/> Add New Category</button></div>
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
      <div className="two">{!p&&<div><label>Starting stock</label><input disabled={accessLevel(user,"stock_adjustments")!=="edit"} type="number" min="0" step="1" value={f.stock} onChange={e=>set("stock",e.target.value)} required/></div>}
        <div><label>Warn when stock reaches</label><input type="number" min="0" step="1" value={f.reorder} onChange={e=>set("reorder",e.target.value)} required/></div></div>
      {p&&<div className="notice"><Info size={18}/> Available stock: <strong>{p.stock}</strong> · Quarantined: <strong>{p.damagedStock||0}</strong>. Use "Correct stock" for changes, so history is saved.</div>}
      {p&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Active item</label>}
      <Controls busy={busy} close={close} valid={!!f.name.trim()&&!!f.sid&&!!f.category} label={p?"Update item":"Add item"}/>
      {accessLevel(user,"stock_adjustments")==="edit"&&<div className="notice" style={{marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>Many items? Use your Excel template.</span><button type="button" className="btn ghost sm" onClick={openBulk}><Upload size={15}/> Bulk Upload Excel</button></div>}
    </form>
    {categoryOpen&&<div className="category-mini-over" onMouseDown={e=>{if(e.target===e.currentTarget)setCategoryOpen(false)}}><section className="category-mini-modal" role="dialog" aria-modal="true" aria-label="Add new category"><div className="modal-head"><div><h3>Add new category</h3><p className="mute">Create a reusable inventory category.</p></div><button className="icon-btn" type="button" onClick={()=>setCategoryOpen(false)}><X size={18}/></button></div><form onSubmit={addCategory}><label>Category name *</label><input autoFocus required maxLength="40" value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="Example: Spare parts"/>{categoryError&&<p className="field-error">{categoryError}</p>}<div className="form-actions"><button className="btn" disabled={categoryBusy||!categoryName.trim()}><Check size={16}/>{categoryBusy?"Saving…":"Save Category"}</button><button className="btn ghost" type="button" onClick={()=>setCategoryOpen(false)}>Cancel</button></div></form></section></div>}
  </Modal>;
}
function DocumentForm({modal,close,busy,action,d,kind}) {
  const purchase=kind==="po",record=modal.record;
  const parties=active(purchase?d.branches:d.customers);
  const [party,setParty]=useState(record?(purchase?record.sid:record.cid):(parties[0]?.id||""));
  const [quantities,setQuantities]=useState(()=>Object.fromEntries((record?.items||[]).map(l=>[l.pid,l.qty])));
  const [prices,setPrices]=useState(()=>Object.fromEntries((record?.items||[]).map(l=>[l.pid,purchase?l.cost:l.price])));
  const [query,setQuery]=useState(""),[note,setNote]=useState(record?.note||"");
  const [availableOnly,setAvailableOnly]=useState(true);
  const [poCategory,setPoCategory]=useState("all");
  const poCategories=[...new Set(active(d.products).map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const [importing,setImporting]=useState(false);
  const [importError,setImportError]=useState("");
  const [imported,setImported]=useState(null);
  const onExcelUpload=async event=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    setImportError("");setImported(null);
    if(!file.name.toLowerCase().endsWith(".xlsx")){
      setImportError("Please upload an Excel .xlsx file.");return;
    }
    if(file.size>4*1024*1024){
      setImportError("The file is too large (maximum 4 MB).");return;
    }
    setImporting(true);
    try {
      const response=await fetch("/api/po-import",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        body:file
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Excel import failed.");
      // Imported quantities replace the current selection; the PO is NOT saved yet.
      setQuantities(Object.fromEntries(result.items.map(x=>[x.pid,x.qty])));
      setPrices(Object.fromEntries(result.items.map(x=>[x.pid,x.cost])));
      setImported({count:result.count,total:result.total,name:file.name});
      setQuery("");setPoCategory("all");
    } catch(error){
      setImportError(error.message||"Could not read the Excel file.");
    } finally {setImporting(false);}
  };
  const items=active(d.products).filter(p=>
    [p.name,p.sku,p.category].join(" ").toLowerCase().includes(query.toLowerCase())
    &&(!purchase||poCategory==="all"||p.category===poCategory)
    &&(purchase||!availableOnly||p.stock>0||number(quantities[p.id])>0))
    .sort((a,b)=>Number(number(quantities[b.id])>0)-Number(number(quantities[a.id])>0)||a.name.localeCompare(b.name));
  const lines=d.products.filter(p=>number(quantities[p.id])>0).map(p=>({pid:p.id,qty:number(quantities[p.id]),
    [purchase?"cost":"price"]:number(prices[p.id]??(purchase?p.cost:p.sell))}));
  const total=lines.reduce((s,l)=>s+l.qty*(purchase?l.cost:l.price),0);
  const route=purchase?"/pos":"/customer-orders";
  const handle=e=>{
    e.preventDefault();
    action(route+(record?"/"+record.n:""),record?"PUT":"POST",purchase?{sid:Number(party),items:lines}:{cid:Number(party),items:lines,note},
      (purchase?"Stock request":"Customer order")+" saved.",purchase?"pos":"orders");
  };
  return <Modal wide className={purchase?"po-document-modal":"order-document-modal"} HeaderIcon={purchase?null:ShoppingBag} title={purchase?(record?"Edit Purchase Order (PO)":"Create Purchase Order (PO)"):(record?"Edit Customer Order":"New Customer Order")}
    sub={purchase?"Make a PO for any supplier. Stock changes only after goods are received.":"Choose a company, then select what they want to order."} close={close}>
    <form className={purchase?"po-document-form":"order-document-form"} onSubmit={handle}>
      <div className={purchase?"po-supplier-panel":"order-customer-panel"}><label>{purchase?"Select Supplier":"Customer company"} *</label><select value={party} required onChange={e=>setParty(e.target.value)}>
        <option value="">Choose {purchase?"branch":"company"}</option>
        {(record?[...parties,...(purchase?d.branches:d.customers).filter(x=>x.id===(purchase?record.sid:record.cid)&&!x.active)]:parties).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className={purchase?"notice po-form-notice":"notice order-form-notice"}><Info size={18}/>{purchase?"An item can be requested from any branch, even if it has a different usual branch.":"Stock availability is shown for planning. Goods reduce stock only when they are dispatched."}</div>
      {purchase&&<div className="po-excel">
        <div className="po-excel-heading"><span className="po-excel-symbol"><Download size={20}/></span>
          <div><strong>Ordering lots of items?</strong><small>Use Excel instead of adding everything by hand.</small></div></div>
        <div className="po-excel-steps"><span><b>1</b>Download</span><i>→</i><span><b>2</b>Fill Quantities</span><i>→</i><span><b>3</b>Upload &amp; Check</span></div>
        <div className="po-excel-actions">
          {active(d.products).length>0?<a className="btn ghost sm" href="/api/po-template" download="StockEasy_PO_Template.xlsx">
            <Download size={16}/> Download latest PO template</a>:<span className="mute">Import Items first to download the PO template.</span>}
          <label className={"btn sm po-excel-upload"+(importing?" disabled":"")}><Upload size={16}/>
            {importing?"Checking Excel…":"Upload filled Excel"}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing||active(d.products).length===0} onChange={onExcelUpload} hidden aria-label="Upload filled Excel template"/>
          </label>
        </div>
        <p className="po-excel-help">This sheet is refreshed from your <b>current active Items</b> after the stock migration, including Category, Usual Supplier, Available Stock and buying cost. Choose the supplier above, fill <b>Order Quantity (column H)</b> and review Unit Cost (column I). Uploading only prepares a PO; <b>stock increases only when its GRN is saved</b>.</p>
        {importError&&<div className="po-excel-error" role="alert"><AlertTriangle size={17}/><span>{importError}</span></div>}
        {imported&&<div className="po-excel-success" role="status"><Check size={18}/>
          <span><b>{imported.count} items loaded from Excel.</b> Please check the quantities below before saving.</span>
          <button type="button" className="icon-btn" title="Dismiss" aria-label="Dismiss import message" onClick={()=>setImported(null)}><X size={16}/></button></div>}
      </div>}
      <h4>Select items & quantities {purchase&&<span className="po-excel-optional">(or use the latest Excel template above)</span>}</h4>
      <div className={purchase?"order-product-tools":"order-product-tools"}><SearchBox value={query} change={setQuery} placeholder="Find item, code or category…"/>{purchase&&<select className="filter-select" aria-label="Filter purchase order items by category" value={poCategory} onChange={e=>setPoCategory(e.target.value)}><option value="all">All categories</option>{poCategories.map(c=><option key={c} value={c}>{c}</option>)}</select>}{!purchase&&<label className="available-toggle"><input type="checkbox" checked={availableOnly} onChange={e=>setAvailableOnly(e.target.checked)}/><span>Available items only</span></label>}</div>
      <div className={purchase?"form-item-list po-product-list":"form-item-list order-product-list"}>{items.length?items.map(p=>{
        const qty=number(quantities[p.id]),price=number(prices[p.id]??(purchase?p.cost:p.sell));
        return <div className="form-item" key={p.id}><Picture p={p}/><div className="grow">
          <strong>{p.name}</strong><small>{p.category||"Uncategorized"} · {p.sku||"No code"} · {p.stock} available</small></div>
          <Qty value={qty} onChange={v=>setQuantities(o=>({...o,[p.id]:v}))}/>
          </div>;
      }):<p className="mute">{purchase&&active(d.products).length===0?"No inventory items yet. First use Items → Bulk Upload Excel to create or migrate products.": "No matching active items. Change the search or category."}</p>}</div>
      {!purchase&&<div className="order-notes"><label>Order notes (optional)</label><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Customer request or delivery instructions"/></div>}
      {purchase?<div className="po-sticky-summary"><div><strong>{lines.length}</strong> item{lines.length===1?"":"s"} selected · Estimated PO cost <strong>{rs(total)}</strong></div><Controls busy={busy||importing} close={close} valid={!!party&&lines.length>0} label={record?"Update PO":"Save Purchase Order"}/></div>:<div className="order-sticky-summary"><div><strong>{lines.length}</strong> item{lines.length===1?"":"s"} selected</div><div><button className="btn ghost" type="button" onClick={close}><X size={16}/> Cancel</button><button className="btn" type="submit" disabled={busy||!party||!lines.length}><Check size={17}/>{busy?"Saving…":record?"Update Customer Order":"Create Customer Order"}</button></div></div>}
    </form>
  </Modal>;
}
function MovementForm({title,type,doc,d,close,busy,action}) {
  const isGRN=type==="grn",isReturn=type==="return",isDispatch=!isGRN&&!isReturn;
  const [q,setQ]=useState({}),[by,setBy]=useState(""),[note,setNote]=useState(""),[conditions,setConditions]=useState({});
  const [importing,setImporting]=useState(false),[importError,setImportError]=useState(""),[importInfo,setImportInfo]=useState("");
  const onReceiveExcel=async event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    setImportError("");setImportInfo("");
    if(!file.name.toLowerCase().endsWith(".xlsx")){setImportError("Select a GRN .xlsx file.");return;}
    if(file.size>4*1024*1024){setImportError("Maximum GRN Excel size is 4 MB.");return;}
    setImporting(true);
    try{
      const res=await fetch("/api/pos/"+doc.n+"/grn-import",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:file});
      const data=await res.json();
      if(!res.ok)throw Error(data.error||"Excel validation failed.");
      setQ(Object.fromEntries(data.lines.map(l=>[l.pid,l.qty])));
      setImportInfo(data.count+" items / "+data.total+" units loaded. Review below, then save GRN.");
    }catch(e){setImportError(e.message);}finally{setImporting(false);}
  };
  const existing=doc.items||doc.lines;
  const options=existing.map(l=>{
    const p=one(d.products,l.pid);
    const before=isGRN?l.qty-l.received: isReturn ? l.qty-d.returns.filter(r=>r.deliveryN===doc.n&&r.status==="Active")
      .reduce((sum,r)=>sum+(r.lines.find(x=>x.pid===l.pid)?.qty||0),0):l.qty-l.dispatched;
    const max=isGRN||isReturn?before:Math.min(before,p?.stock||0);
    return {...l,p,max:Math.max(0,max),remaining:before};
  });
  const lines=options.filter(l=>number(q[l.pid])>0).map(l=>({pid:l.pid,qty:number(q[l.pid]),...(isReturn?{condition:conditions[l.pid]||"quarantine"}:{})}));
  const receiveAll=()=>setQ(Object.fromEntries(options.filter(l=>l.max>0).map(l=>[l.pid,l.max])));
  const dispatchAll=()=>setQ(Object.fromEntries(options.filter(l=>l.max>0).map(l=>[l.pid,l.max])));
  const resetQuantities=()=>setQ({});
  const selectedTotal=lines.reduce((sum,l)=>sum+l.qty,0);
  const destination=isGRN?"/pos/"+doc.n+"/receive":isReturn?"/returns":"/customer-orders/"+doc.n+"/dispatch";
  const label=isGRN?"Save GRN and add stock":isReturn?"Save customer return":"Create delivery and reduce stock";
  const hint=isGRN?"Enter ONLY what actually arrived. Stock increases when saved.":isReturn?
    "Inspect returns. Damaged or uninspected goods go into quarantine, not available stock.":"Only sent goods reduce stock. You can send the remaining items later.";
  const handle=e=>{e.preventDefault();action(destination,"POST",isReturn?{deliveryN:doc.n,lines,note}:{lines,note,by},
    isGRN?"GRN saved — stock increased.":isReturn?"Customer return saved — stock updated.":"Delivery saved — stock decreased.",
    isGRN?"grns":"deliveries");};
  return <Modal wide className={isGRN?"grn-receive-modal":isDispatch?"grn-receive-modal dispatch-modal":""} title={title} sub={hint} close={close}>
    <form onSubmit={handle}>
      <div className="notice"><Info size={19}/> {isGRN?"From PO":isReturn?"From delivery":"From customer order"}: <strong>{doc.id}</strong></div>
      {isGRN?<><div className="po-excel" style={{margin:"12px 0"}}>
        <div className="po-excel-heading"><span className="po-excel-symbol"><Download size={20}/></span>
          <div><strong>Receiving many PO items?</strong><small>Download this PO's GRN sheet, enter actual received quantities, and upload to review.</small></div></div>
        <div className="po-excel-actions">
          <a className="btn ghost sm" href={"/api/pos/"+doc.n+"/grn-template"} download={"StockEasy_"+doc.id+"_GRN.xlsx"}><Download size={16}/> Download GRN Excel</a>
          <label className={"btn sm po-excel-upload"+(importing?" disabled":"")}><Upload size={16}/>{importing?"Checking Excel…":"Upload GRN Excel"}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={importing||busy} onChange={onReceiveExcel}/>
          </label>
        </div>
        <p className="po-excel-help">Enter <strong>Receive Now</strong> in column I. Upload only fills the quantities below. Stock changes <strong>after Save GRN</strong>, not on upload.</p>
        {importError&&<div className="po-excel-error" role="alert"><AlertTriangle size={17}/>{importError}</div>}
        {importInfo&&<div className="po-excel-success" role="status"><Check size={17}/>{importInfo}</div>}
      </div><div className="grn-bulk-actions"><button className="btn" type="button" onClick={receiveAll} disabled={!options.some(l=>l.max>0)}><PackageCheck size={17}/> Receive All</button><button className="btn ghost" type="button" onClick={resetQuantities} disabled={!lines.length}><RotateCcw size={16}/> Reset Quantities</button><span>Fill remaining quantities, then review before saving.</span></div>
      <div className="grn-entry-table"><div className="grn-entry-row grn-entry-head"><span>Item</span><span>Ordered</span><span>Received</span><span>Still expected</span><span>Receive now</span><span>Stock after</span></div>
        {options.map(l=>{const receive=number(q[l.pid]);return <div className="grn-entry-row" key={l.pid}>
          <div className="inventory-item"><Picture p={l.p}/><span><strong>{l.p?.name}</strong><small>{l.p?.sku||"No item code"}</small></span></div>
          <strong>{l.qty}</strong><span>{l.received||0}</span><strong className="grn-remaining">{l.remaining}</strong>
          <div>{l.max>0?<Qty value={receive} max={l.max} onChange={v=>setQ(o=>({...o,[l.pid]:v}))}/>:<Pill kind="off">Complete</Pill>}</div>
          <span className="grn-stock-after"><strong>{(l.p?.stock||0)+receive}</strong></span>
        </div>})}</div></>:isDispatch?<><div className="grn-bulk-actions"><button className="btn" type="button" onClick={dispatchAll} disabled={!options.some(l=>l.max>0)}><Truck size={17}/> Dispatch All</button><button className="btn ghost" type="button" onClick={resetQuantities} disabled={!lines.length}><RotateCcw size={16}/> Reset Quantities</button><span>Quantities are limited by remaining demand and available stock.</span></div>
      <div className="grn-entry-table dispatch-entry-table"><div className="grn-entry-row grn-entry-head"><span>Item</span><span>Ordered</span><span>Already Sent</span><span>Remaining</span><span>Available Stock</span><span>Send Now</span></div>
        {options.map(l=>{const shortage=Math.max(0,l.remaining-(l.p?.stock||0));return <div className={"grn-entry-row dispatch-entry-row"+(shortage?" has-shortage":"")} key={l.pid}>
          <div className="inventory-item"><Picture p={l.p}/><span><strong>{l.p?.name}</strong><small>{l.p?.sku||"No item code"}</small></span></div>
          <strong>{l.qty}</strong><span>{l.dispatched||0}</span><strong className="grn-remaining">{l.remaining}</strong>
          <span className={shortage?"dispatch-stock-short":""}><strong>{l.p?.stock||0}</strong>{shortage>0&&<small>{shortage} short</small>}</span>
          <div>{l.max>0?<Qty value={number(q[l.pid])} max={l.max} onChange={v=>setQ(o=>({...o,[l.pid]:v}))}/>:<Pill kind="off">No stock</Pill>}</div>
        </div>})}</div></>:
      <div className="form-item-list">{options.map(l=><div className="form-item" key={l.pid}>
        <Picture p={l.p}/><div className="grow"><strong>{l.p?.name}</strong>
          <small>{isReturn?"Can be returned":"Still requested"}: {l.remaining} · {l.p?.stock} currently in stock</small>{isReturn&&l.max>0&&<select aria-label={"Returned condition for "+l.p?.name} value={conditions[l.pid]||"quarantine"} onChange={e=>setConditions(v=>({...v,[l.pid]:e.target.value}))}><option value="quarantine">Quarantine — damaged / uninspected</option><option value="sellable">Inspected — sellable</option></select>}</div>
        {l.max>0?<Qty value={number(q[l.pid])} max={l.max} onChange={v=>setQ(o=>({...o,[l.pid]:v}))}/>:<Pill kind="off">0 available</Pill>}
      </div>)}</div>}
      {(isGRN||isDispatch)&&<div className="order-total"><span>{lines.length} item{lines.length===1?"":"s"} selected</span><strong>{selectedTotal} {isGRN?"to receive":"units to dispatch"}</strong></div>}
      {!isReturn&&<><label>{isGRN?"Received by":"Sent by"}</label><input value={by} onChange={e=>setBy(e.target.value)} placeholder="Your name (optional — login name is used if empty)"/></>}
      <label>{isReturn?"Why are the goods being returned? *":"Notes (optional)"}</label>
      <textarea rows={isGRN?2:3} required={isReturn} value={note} onChange={e=>setNote(e.target.value)} placeholder={isReturn?"Example: Damaged or extra goods":"Optional delivery notes"}/>
      {isDispatch?<div className="dispatch-sticky-actions"><div><strong>{lines.length}</strong> selected · <strong>{selectedTotal}</strong> units</div><div><button className="btn ghost" type="button" onClick={close}>Cancel</button><button className="btn" type="submit" disabled={busy||!lines.length}><Truck size={17}/>{busy?"Saving…":"Create Delivery"}</button></div></div>:<Controls busy={busy||importing} close={close} valid={lines.length>0&&(!isReturn||!!note.trim())} label={label}/>} 
    </form>
  </Modal>;
}
function SupplierReturnForm({grn,d,close,busy,action}) {
  const [q,setQ]=useState({}),[reasonType,setReasonType]=useState(""),[note,setNote]=useState(""),[by,setBy]=useState("");
  const options=grn.lines.map(l=>{
    const p=one(d.products,l.pid),previous=d.supplierReturns.filter(r=>r.grnN===grn.n&&r.status==="Active").reduce((n,r)=>n+(r.lines.find(x=>x.pid===l.pid)?.qty||0),0);
    const returnable=Math.max(0,l.qty-previous),max=Math.min(returnable,p?.stock||0);
    return {...l,p,previous,returnable,max};
  });
  const lines=options.filter(l=>number(q[l.pid])>0).map(l=>({pid:l.pid,qty:number(q[l.pid])}));
  const total=lines.reduce((n,l)=>n+l.qty,0),returnAll=()=>setQ(Object.fromEntries(options.filter(l=>l.max>0).map(l=>[l.pid,l.max])));
  const valid=lines.length>0&&!!reasonType&&(reasonType!=="other"||!!note.trim());
  const handle=e=>{e.preventDefault();action("/supplier-returns","POST",{grnN:grn.n,lines,reasonType,note,by},"Supplier return saved — stock decreased.","grns");};
  return <Modal wide className="grn-receive-modal" title="Return goods to supplier (GRTN)" sub={`Linked to ${grn.id}. Stock decreases only after the return is saved.`} close={close}>
    <form onSubmit={handle}><div className="notice"><Info size={18}/> Original GRN: <strong>{grn.id}</strong>. Replacement goods must be requested separately.</div>
      <div className="grn-bulk-actions"><button className="btn" type="button" onClick={returnAll} disabled={!options.some(l=>l.max>0)}><ArrowUpRight size={17}/> Return All</button><button className="btn ghost" type="button" onClick={()=>setQ({})} disabled={!lines.length}><RotateCcw size={16}/> Reset Quantities</button><span>Return All uses the lower of returnable quantity and available stock.</span></div>
      <div className="grn-entry-table"><div className="grn-entry-row supplier-return-head"><span>Item</span><span>Received</span><span>Returned</span><span>Available stock</span><span>Return now</span><span>Stock after</span></div>{options.map(l=>{const qty=number(q[l.pid]);return <div className="grn-entry-row" key={l.pid}><div className="inventory-item"><Picture p={l.p}/><span><strong>{l.p?.name}</strong><small>{l.p?.sku||"No item code"}</small></span></div><strong>{l.qty}</strong><span>{l.previous}</span><strong className="grn-remaining">{l.p?.stock||0}</strong><div>{l.max>0?<Qty value={qty} max={l.max} onChange={v=>setQ(o=>({...o,[l.pid]:v}))}/>:<Pill kind="off">Unavailable</Pill>}</div><span className="grn-stock-after"><strong>{(l.p?.stock||0)-qty}</strong></span></div>})}</div>
      <div className="order-total"><span>{lines.length} item{lines.length===1?"":"s"} selected</span><strong>{total} to return</strong></div>
      <div className="two"><div><label>Return reason *</label><select required value={reasonType} onChange={e=>setReasonType(e.target.value)}><option value="">Select reason</option><option value="damaged">Damaged</option><option value="defective">Defective</option><option value="wrong_item">Wrong item</option><option value="other">Other</option></select></div><div><label>Returned by</label><input value={by} onChange={e=>setBy(e.target.value)} placeholder="Login name used if empty"/></div></div>
      <label>{reasonType==="other"?"Other reason *":"Notes (optional)"}</label><textarea rows={2} required={reasonType==="other"} value={note} onChange={e=>setNote(e.target.value)} placeholder={reasonType==="other"?"Enter the return reason":"Condition, packaging, or supplier instructions"}/>
      <Controls busy={busy} close={close} valid={valid} label="Save GRTN and reduce stock"/>
    </form></Modal>;
}
function InventoryBulkForm({d,close,action,busy}) {
  const [uploading,setUploading]=useState(false),[fileName,setFileName]=useState(""),[preview,setPreview]=useState(null),[error,setError]=useState(""),[confirmed,setConfirmed]=useState(false),[showUnchanged,setShowUnchanged]=useState(false),[archiveMissing,setArchiveMissing]=useState(false);
  const upload=async e=>{
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    setFileName(file.name);setPreview(null);setError("");setConfirmed(false);setShowUnchanged(false);setArchiveMissing(false);
    if(!file.name.toLowerCase().endsWith(".xlsx")){setError("Choose an Excel .xlsx file.");return;}
    if(file.size>4*1024*1024){setError("Excel file must be smaller than 4 MB.");return;}
    setUploading(true);
    try{
      const res=await fetch("/api/inventory-import/preview",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:file});
      const result=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(result.error||"Could not preview the Excel file.");
      setPreview(result);
    }catch(err){setError(err.message);}finally{setUploading(false);}
  };
  const changes=preview?.rows?.filter(x=>x.action!=="unchanged")||[];
  const reviewRows=showUnchanged?preview?.rows||[]:changes;
  const canSave=preview?.canCommit&&confirmed&&!busy&&!uploading&&(changes.length>0||archiveMissing);
  return <Modal wide title="Bulk Upload Items & Current Stock" sub="One Excel template for first-time migration and future item/stock updates." close={close}>
    <div className="notice"><Info size={18}/> Excel Quantity is the <strong>final stock count</strong>, not an amount to add. For new supplier goods, use PO → GRN instead.</div>
    <div className="po-excel" style={{marginTop:16,marginBottom:16}}>
      <div className="po-excel-steps"><span><b>1</b> Download</span><i>→</i><span><b>2</b> Fill Excel</span><i>→</i><span><b>3</b> Upload & Preview</span><i>→</i><span><b>4</b> Confirm</span></div>
      <div className="po-excel-actions">
        <a className="btn ghost sm" href="/api/inventory-template.xlsx" download="StockEasy_Current_Stock_Migration_Bordered.xlsx"><Download size={16}/> Download Current Stock Template</a>
        <label className={"btn sm"+(uploading?" disabled":"")}><Upload size={16}/>{uploading?"Checking file…":"Upload & Preview Excel"}
          <input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={uploading||busy} onChange={upload}/>
        </label>
      </div>
      <p className="po-excel-help">The template includes current active items, existing Product IDs and quantities. New items must use a unique Item Code; leave their Product ID blank. Use the exact saved supplier name. New categories are created from your sheet. Existing items missing from Excel are kept by default. A separate option can archive eligible missing items only if you upload your COMPLETE product list.</p>
      {fileName&&<small>Selected: <strong>{fileName}</strong></small>}
    </div>
    {error&&<div className="error-banner" role="alert"><AlertTriangle size={17}/><span>{error}</span></div>}
    {preview&&<>
      <div className="inventory-summary" style={{gridTemplateColumns:"repeat(auto-fit,minmax(135px,1fr))",marginBottom:12}}>
        {[[ "New items",preview.summary.newCount ],["Items updated",preview.summary.updateCount],["No change",preview.summary.unchangedCount],["New categories",preview.summary.categoryCount],["Missing from Excel",preview.summary.missingCount]].map(([label,count])=><div className="inventory-summary-card green" key={label}><div><strong>{count}</strong><small>{label}</small></div></div>)}
      </div>
      {!!preview.summary.categories.length&&<div className="notice"><Info size={16}/><span>New categories from Excel: <strong>{preview.summary.categories.join(", ")}</strong></span></div>}
      {!!preview.errors.length&&<div className="error-banner" style={{display:"block",marginTop:12}} role="alert"><strong>Fix these problems and upload again:</strong><ul>{preview.errors.slice(0,40).map((x,i)=><li key={i}>{x}</li>)}</ul>{preview.errors.length>40&&<p>...and {preview.errors.length-40} more errors</p>}</div>}
      <p className="mute" style={{margin:"12px 0"}}><strong>Review every change before saving.</strong> Current Stock → Excel Final Stock. No PO or GRN will be created. {preview.summary.unchangedCount>0&&<button type="button" className="text-button" onClick={()=>setShowUnchanged(v=>!v)}>{showUnchanged?"Hide":"Show"} {preview.summary.unchangedCount} unchanged item(s)</button>}</p>
      <div className="report-table-wrap" style={{maxHeight:330,overflow:"auto",border:"1px solid #dce6df",borderRadius:10}}>
        <table><thead><tr>{["Excel Row","Action","Item / Code","Category","Supplier","Current","Final","Difference","Cost","Selling"].map(x=><th key={x}>{x}</th>)}</tr></thead>
          <tbody>{reviewRows.map(x=><tr key={x.row}>
            <td>{x.row}</td><td><strong>{x.action==="new"?"Create":x.action==="update"?"Update":"Unchanged"}</strong></td>
            <td><strong>{x.name}</strong>{x.oldName&&x.oldName!==x.name&&<small style={{display:"block"}}>Was: {x.oldName}</small>}<small style={{display:"block"}}>{x.sku||"—"}</small></td><td>{x.category}{x.oldCategory&&x.oldCategory!==x.category&&<small style={{display:"block"}}>Was: {x.oldCategory}</small>}</td><td>{x.supplier}</td>
            <td>{x.oldStock===null?"New":x.oldStock}</td><td><strong>{x.qty}</strong></td>
            <td>{x.delta>0?"+":""}{x.delta}</td><td>{rs(x.cost)}{x.oldCost!==null&&x.oldCost!==x.cost&&<small style={{display:"block"}}>Was: {rs(x.oldCost)}</small>}</td><td>{rs(x.sell)}{x.oldSell!==null&&x.oldSell!==x.sell&&<small style={{display:"block"}}>Was: {rs(x.oldSell)}</small>}</td>
          </tr>)}</tbody>
        </table>
      </div>

      {(preview.missing||[]).length>0&&<div className="notice" style={{marginTop:14,display:"block"}}>
        <strong>{preview.summary.missingCount} existing active items are absent from this file.</strong>
        <p className="mute">{preview.summary.archiveEligible} are eligible for optional archiving (zero stock and no open orders/quotations). {preview.summary.archiveBlocked} cannot be archived because of stock or pending documents. No missing item will be removed by default.</p>
        <details><summary>Review missing items</summary><div style={{maxHeight:190,overflow:"auto"}}>{preview.missing.map(p=><p key={p.id} className="mute">{p.name} ({p.sku||p.id}) — {p.eligible?"Eligible for archive":p.reason}</p>)}</div></details>
        {preview.summary.archiveEligible>0&&<label className="checkline" style={{marginTop:12}}>
          <input type="checkbox" checked={archiveMissing} onChange={e=>{setArchiveMissing(e.target.checked);setConfirmed(false);}}/>
          Archive the {preview.summary.archiveEligible} eligible missing items. Only select this if the Excel is your COMPLETE item list; otherwise leave unchecked.
        </label>}
      </div>}
      <p className="mute" style={{marginTop:10}}>Net stock adjustment: <strong>{preview.summary.stockDelta>0?"+":""}{preview.summary.stockDelta}</strong> units across all items.</p>
      <label className="checkline" style={{marginTop:14}}>
        <input type="checkbox" checked={confirmed} disabled={!preview.canCommit} onChange={e=>setConfirmed(e.target.checked)}/>
        I checked the Excel. These are final physical quantities and I approve updating the inventory.
      </label>
    </>}
    <div className="form-actions">
      <button type="button" className="btn" disabled={!canSave} onClick={()=>action("/inventory-import/commit","POST",{token:preview.token,confirm:true,archiveMissing},"Bulk inventory upload saved. Item details and stock history updated.","products")}>
        <Check size={16}/>{busy?"Saving…":"Confirm Bulk Upload"}
      </button>
      <button className="btn ghost" type="button" onClick={close}>Cancel</button>
    </div>
  </Modal>;
}

function CategoryManager({d,close,refresh}) {
  const categories=(d.categories||[]).filter(c=>c.active);
  const [names,setNames]=useState(()=>Object.fromEntries(categories.map(c=>[c.id,c.name]))),[newName,setNewName]=useState(""),[working,setWorking]=useState(null),[error,setError]=useState("");
  const save=async(category,payload)=>{setWorking(category?.id||"new");setError("");try{await request(category?`/categories/${category.id}`:"/categories",category?"PUT":"POST",payload);await refresh();if(!category)setNewName("");}catch(e){setError(e.message);}finally{setWorking(null);}};
  const remove=async category=>{if(!window.confirm(`Delete category "${category.name}"?`))return;setWorking(category.id);setError("");try{await request(`/categories/${category.id}`,"DELETE");await refresh();}catch(e){setError(e.message);}finally{setWorking(null);}};
  return <Modal wide className="category-manager-modal" title="Manage Categories" sub="Add, edit, or delete inventory categories." close={close}>
    <form className="category-create" onSubmit={e=>{e.preventDefault();save(null,{name:newName});}}><input required maxLength="40" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New category name"/><button className="btn" disabled={working!==null||!newName.trim()}><Plus size={16}/> Add Category</button></form>
    {error&&<div className="error-banner category-error"><AlertTriangle size={17}/><span>{error}</span></div>}
    <div className="category-manager-list">{categories.map(c=>{const count=d.products.filter(p=>p.category.toLowerCase()===c.name.toLowerCase()).length,changed=(names[c.id]||"").trim()!==c.name;return <div className="category-manager-row" key={c.id}><div><input aria-label={`Category name ${c.name}`} maxLength="40" value={names[c.id]??c.name} onChange={e=>setNames(o=>({...o,[c.id]:e.target.value}))}/><small>{count} item{count===1?"":"s"} assigned</small></div><div className="category-row-actions"><button className="btn ghost sm" type="button" disabled={working!==null||!changed||!names[c.id]?.trim()} onClick={()=>save(c,{name:names[c.id],active:1})}><Pencil size={15}/> Edit</button><button className="btn ghost sm danger-text" type="button" disabled={working!==null||count>0} title={count?"Reassign all items before deleting":"Delete category"} onClick={()=>remove(c)}><Trash2 size={15}/> Delete</button></div></div>})}</div>
    <div className="form-actions"><button className="btn ghost" type="button" onClick={close}>Close</button></div>
  </Modal>;
}
function AdjustmentForm({d,record,busy,close,action,user}) {
  const [pid,setPid]=useState(record?.id||active(d.products)[0]?.id||""),[target,setTarget]=useState(record?.stock??""),[reason,setReason]=useState("");
  const [mode,setMode]=useState("count"),[qty,setQty]=useState("");
  const selected=one(d.products,pid);
  const change=Number(target)-Number(selected?.stock||0);
  const max=mode==="hold"?selected?.stock||0:selected?.damagedStock||0;
  const go=accessLevel(user,"stock_history")!=="none"?"history":"products";
  const valid=!!pid&&!!reason.trim()&&(mode==="count"?target!==""&&Number.isSafeInteger(Number(target))&&Number(target)>=0&&change!==0:qty!==""&&Number.isSafeInteger(Number(qty))&&Number(qty)>0&&Number(qty)<=max);
  return <Modal title="Update stock count" sub="Enter the actual quantity counted. Every update is saved in stock history." close={close}>
    <form onSubmit={e=>{e.preventDefault();action(mode==="count"?"/adjustments":"/quarantine","POST",mode==="count"?{pid:Number(pid),change,reason}:{pid:Number(pid),mode,qty:Number(qty),reason},"Stock updated and audited.",go);}}>
      <label>Item</label><select required value={pid} onChange={e=>{const id=Number(e.target.value);setPid(id);setTarget(one(d.products,id)?.stock??"");}}>{active(d.products).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"No code"}</option>)}</select>
      <div className="notice"><Package size={18}/> Available: <strong>{selected?.stock||0}</strong> · Quarantined: <strong>{selected?.damagedStock||0}</strong></div>
      <label>Action</label><select value={mode} onChange={e=>{setMode(e.target.value);setQty("");}}><option value="count">Correct available stock count</option><option value="hold">Move available goods to quarantine</option><option value="release">Release inspected goods to available stock</option><option value="dispose">Dispose of quarantined goods</option></select>
      {mode==="count"?<><label>New stock count *</label><input required autoFocus type="number" min="0" step="1" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Enter the quantity physically counted"/>
      {target!==""&&<p className="mute">This will {change>=0?"add":"remove"} <strong>{Math.abs(change)}</strong>.</p>}</>:<><label>Quantity *</label><input required type="number" min="1" max={max} step="1" value={qty} onChange={e=>setQty(e.target.value)}/><p className="mute">Maximum: {max}. Confirm physical inspection or disposal before saving.</p></>}
      <label>Reason for update *</label><textarea required rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: Physical stock count on factory floor"/>
      <Controls busy={busy} close={close} valid={valid} label="Save stock update"/>
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
            <option value="none">No access</option><option value="view">View only</option>{f.role!=="viewer"&&<option value="edit">View & edit</option>}</select></div>)}
        </div>}
      {record&&<label className="checkline"><input type="checkbox" checked={f.active===1} onChange={e=>set("active",e.target.checked?1:0)}/> Account active</label>}
      <Controls busy={busy} close={close} valid={!!f.username.trim()&&(!!record||f.password.length>=8)} label="Save staff account"/>
    </form>
  </Modal>;
}
function StaffPermissionsView({record,close}) {
  return <Modal title={record.username} sub={record.role==="admin"?"Administrator · Full system access":"Current module permissions"} close={close}>
    <div className="permission-panel"><div className="permission-head"><span>System module</span><span>Permission</span></div>{ACCESS_MODULES.map(([key,label])=><div className="permission-row" key={key}><span>{label}</span><Pill kind={record.role==="admin"||record.permissions?.[key]==="edit"?"good":record.permissions?.[key]==="view"?"warn":"off"}>{record.role==="admin"?"Edit":record.permissions?.[key]||"None"}</Pill></div>)}</div>
    <div className="form-actions"><button className="btn ghost" onClick={close}>Close</button></div>
  </Modal>;
}
function DocumentView({modal,d,branch,customer,product,openProduct,close}) {
  const doc=modal.record,isPo=modal.type==="view-po",isGRN=modal.type==="view-grn";
  const isDelivery=modal.type==="view-delivery",isReturn=modal.type==="view-return",isSupplierReturn=modal.type==="view-supplier-return",isOrder=modal.type==="view-order";
  const hasPrices=isPo||isOrder;
  const lines=doc.items||doc.lines;
  const name=isPo||isGRN||isSupplierReturn?branch(doc.sid).name:customer(doc.cid).name;
  const kind=isPo?"Stock request":isGRN?"Goods received note":isSupplierReturn?"Goods return to supplier":isDelivery?"Delivery note":isReturn?"Customer return":"Customer order";
  const totalQty=lines.reduce((sum,line)=>sum+Number(line.qty||0),0),generated=new Date().toLocaleString("en-LK",{dateStyle:"medium",timeStyle:"short"});
  return <Modal wide title={doc.id} sub={kind+" · "+name} close={close}>
    <div className="print-sheet print-document">
      <header className="print-document-header"><div className="print-company"><img src="/logo.png" alt="Supun Group of Companies"/><div><strong>SUPUN GROUP OF COMPANIES</strong><span>StockEasy Inventory &amp; Stock Management System</span></div></div><div className="print-document-identity"><small>{kind}</small><h1>{doc.id}</h1><State value={doc.status}/></div></header>
      <div className="print-accent-line"/>
      <section className="print-document-meta"><div><span>Document date</span><strong>{today(doc.date)}</strong></div><div><span>{isPo||isGRN||isSupplierReturn?"Supplier / Branch":"Customer company"}</span><strong>{name}</strong></div><div><span>{isSupplierReturn?"Original GRN":"Total items"}</span><strong>{isSupplierReturn?doc.grnId:lines.length}</strong></div><div><span>Total quantity</span><strong>{totalQty}</strong></div></section>
      <div className="print-section-title"><span>Line items</span><small>Quantities recorded in this document</small></div>
      {isPo?<div className="po-detail-table"><div className="po-detail-row po-detail-head"><strong>Item</strong><strong>Ordered</strong><strong>Received</strong><strong>Remaining</strong><strong>Unit cost</strong><strong>Amount</strong></div>
        {lines.map(l=><div className="po-detail-row" key={l.pid}><button className="product-link" onClick={()=>openProduct(l.pid)}><strong>{product(l.pid).name}</strong><small>{product(l.pid).sku||"No item code"}</small></button><span>{l.qty}</span><span>{l.received||0}</span><span>{l.qty-(l.received||0)}</span><span>{rs(l.cost)}</span><strong>{rs(l.qty*l.cost)}</strong></div>)}</div>:
        isOrder?<div className="po-detail-table"><div className="po-detail-row po-detail-head"><strong>Item</strong><strong>Ordered</strong><strong>Sent</strong><strong>Remaining</strong><strong>Unit price</strong><strong>Amount</strong></div>
          {lines.map(l=><div className="po-detail-row" key={l.pid}><button className="product-link" onClick={()=>openProduct(l.pid)}><strong>{product(l.pid).name}</strong><small>{product(l.pid).sku||"No item code"}</small></button><span>{l.qty}</span><span>{l.dispatched||0}</span><span>{l.qty-(l.dispatched||0)}</span><span>{rs(l.price)}</span><strong>{rs(l.qty*l.price)}</strong></div>)}</div>:
        <div className={"document-table" + (!hasPrices ? " two-col" : "")}><div className="document-table-head"><strong>Item</strong><strong>Quantity</strong>{hasPrices&&<strong>Amount</strong>}</div>
          {lines.map(l=><div className="document-table-row" key={l.pid}><button className="product-link simple" onClick={()=>openProduct(l.pid)}>{product(l.pid).name}{isReturn&&<small>{l.condition==="quarantine"?"Quarantined":"Sellable"}</small>}</button><span>{l.qty}</span>{hasPrices&&<span>{rs(l.qty*l.price)}</span>}</div>)}</div>}
      {hasPrices&&<div className="order-total"><span>Total</span><strong>{rs(lines.reduce((s,l)=>s+l.qty*(isPo?l.cost:l.price),0))}</strong></div>}
      {(doc.note||isSupplierReturn)&&<section className="print-notes"><strong>{isSupplierReturn?"Return reason":"Notes"}</strong><p>{isSupplierReturn?`${String(doc.reasonType||"").replace("_"," ")}${doc.note?` — ${doc.note}`:""}`:doc.note}</p></section>}
      <section className="print-approval"><div><span>Prepared by</span><strong>{doc.by||"________________________"}</strong><small>Signature</small></div><div><span>Checked by</span><strong>________________________</strong><small>Signature</small></div><div><span>Received / Approved by</span><strong>________________________</strong><small>Signature</small></div></section>
      <footer className="print-document-footer"><div><strong>StockEasy</strong><span>Supun Group of Companies</span></div><div><span>Generated {generated}</span><small>Computer-generated document</small></div></footer>
    </div>
    <div className="form-actions print-actions"><button className="btn" onClick={()=>window.print()}><Printer size={17}/> Print / Save PDF</button>
      <button className="btn ghost" onClick={close}>Close</button></div>
  </Modal>;
}
