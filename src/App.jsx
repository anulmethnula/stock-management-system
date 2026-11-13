import { useState, useEffect, useMemo } from "react";
import { LayoutGrid, Package, Truck, FileText, PackageCheck, Plus, Minus, Search, Pencil, Camera, Printer, AlertTriangle, Check, Moon, Sun, Inbox, Lightbulb, X } from "lucide-react";

const api = (url, method = "GET", body) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }).then(r => r.json());
const rs = n => "Rs " + Number(n || 0).toLocaleString();
const EMOJIS = ["🍚","🥛","🥚","🍞","🧃","🥫","🍎","🥕","🧴","🧼","🧻","📦","🛍️","🧂","☕","🍬"];
const level = p => (p.stock <= 0 ? "out" : p.stock <= p.reorder ? "low" : "ok");
const LBL = { out: "Out of stock", low: "Running low", ok: "In stock" };

function CountUp({ to, prefix = "" }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let s = null, f;
    const st = t => { s = s || t; const p = Math.min((t - s) / 900, 1); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) f = requestAnimationFrame(st); };
    f = requestAnimationFrame(st);
    return () => cancelAnimationFrame(f);
  }, [to]);
  return <>{prefix}{v.toLocaleString()}</>;
}
const Pic = ({ p }) => (p.img ? <img src={p.img} alt={p.name} /> : <span className="e">{p.emoji}</span>);
const Av = ({ p }) => <div className="av">{p ? <Pic p={p} /> : <Truck size={22} />}</div>;
const Initials = ({ name }) => <div className="av" style={{ fontWeight: 600 }}>{name.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>;
const Modal = ({ children, onClose }) => (
  <div className="over" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal">{children}</div></div>
);
function Qty({ v, set, max }) {
  const c = n => set(Math.max(0, Math.min(max ?? 99999, Number(n) || 0)));
  return (
    <div className="qty">
      <button aria-label="Less" onClick={() => c(v - 1)}><Minus size={16} /></button>
      <input type="number" min="0" value={v} onChange={e => c(e.target.value)} />
      <button aria-label="More" onClick={() => c(v + 1)}><Plus size={16} /></button>
    </div>
  );
}
const Empty = ({ icon: I, children }) => <div className="empty"><I size={40} strokeWidth={1.2} />{children}</div>;

export default function App() {
  const [d, setD] = useState(null);
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("se-theme") || "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("se-theme", theme); }, [theme]);
  const load = () => api("/api/all").then(setD);
  useEffect(() => { load(); }, []);
  const say = m => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const done = (m, go) => { setModal(null); if (go) setPage(go); say(m); return load(); };

  const sup = id => d.suppliers.find(s => s.id === id) || { name: "Unknown" };
  const prod = id => d.products.find(p => p.id === id) || { name: "Removed item", emoji: "?", unit: "" };
  const open = useMemo(() => (d ? d.pos.filter(o => o.status !== "Received") : []), [d]);
  const onOrder = useMemo(() => { const m = {}; open.forEach(o => o.items.forEach(i => { m[i.pid] = (m[i.pid] || 0) + i.qty - i.received; })); return m; }, [open]);
  if (!d) return <div className="main">Loading…</div>;

  const low = d.products.filter(p => level(p) !== "ok");
  const value = d.products.reduce((a, p) => a + p.stock * p.cost, 0);
  const saveProduct = p => api(p.id ? `/api/products/${p.id}` : "/api/products", p.id ? "PUT" : "POST", p).then(() => done("Item saved"));
  const saveSupplier = s => api(s.id ? `/api/suppliers/${s.id}` : "/api/suppliers", s.id ? "PUT" : "POST", s).then(() => done("Supplier saved"));
  const savePO = (sid, items) => api("/api/pos", "POST", { sid, items }).then(r => done(`${r.code} created. Send it to your supplier.`, "orders"));
  const saveGRN = (po, lines, note, by) => api(`/api/pos/${po.n}/receive`, "POST", { lines, note, by }).then(r => done(`${r.code} saved. Stock updated.`, "receive"));
  const orderNow = p => setModal({ t: "po", sid: p.sid, pre: { [p.id]: Math.max(p.reorder * 2 - p.stock, 1) } });
  const ctx = { d, sup, prod, onOrder, setModal, orderNow, low, value, open, setPage };

  const NAV = [["home", LayoutGrid, "Home"], ["products", Package, "Items"], ["suppliers", Truck, "Suppliers"], ["orders", FileText, "Orders", open.length], ["receive", PackageCheck, "Received"]];
  return (
    <div className="app">
      <nav className="side">
        <div className="logo"><i><Package size={19} /></i>StockEasy</div>
        {NAV.map(([k, I, l, n]) => (
          <button key={k} className={"nav" + (page === k ? " on" : "")} onClick={() => setPage(k)}>
            <I size={20} />{l}{n ? <small>{n}</small> : null}
          </button>
        ))}
        <div className="sp" />
        <button className="nav tg" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}{theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </nav>
      <main className="main"><div className="page" key={page}>
        {page === "home" && <Home {...ctx} />}
        {page === "products" && <Products {...ctx} />}
        {page === "suppliers" && <Suppliers {...ctx} />}
        {page === "orders" && <Orders {...ctx} />}
        {page === "receive" && <Receipts {...ctx} />}
      </div></main>
      {modal?.t === "product" && <ProductForm modal={modal} d={d} onSave={saveProduct} onClose={() => setModal(null)} />}
      {modal?.t === "supplier" && <SupplierForm modal={modal} onSave={saveSupplier} onClose={() => setModal(null)} />}
      {modal?.t === "po" && <POForm modal={modal} d={d} onSave={savePO} onClose={() => setModal(null)} />}
      {modal?.t === "grn" && <GRNForm po={modal.po} prod={prod} sup={sup} onSave={saveGRN} onClose={() => setModal(null)} />}
      {modal?.t === "view" && <ViewPO po={modal.po} prod={prod} sup={sup} onClose={() => setModal(null)} />}
      {toast && <div className="toast" key={toast}><Check size={18} />{toast}</div>}
    </div>
  );
}

function Home({ d, low, value, open, onOrder, setModal, orderNow, sup }) {
  const stats = [[Package, "Items in your shop", d.products.length, ""], [AlertTriangle, "Need re-ordering", low.length, ""], [FileText, "Orders waiting", open.length, ""], [PackageCheck, "Stock value", value, "Rs "]];
  const steps = [[FileText, "1. Make an order", "Tell your supplier what you need."], [Truck, "2. Goods arrive", "Check the boxes when they come."], [PackageCheck, "3. Record it", "Your stock goes up by itself."]];
  return (
    <>
      <h1>Good day.</h1><p className="sub">Here is what is happening in your shop today.</p>
      <div className="grid">{stats.map(([I, l, n, pre], i) => (
        <div key={l} className="card pop stat" style={{ "--i": i }}><span><I size={16} />{l}</span><div className="big"><CountUp to={n} prefix={pre} /></div></div>
      ))}</div>
      <h2>How it works</h2>
      <div className="steps">{steps.map(([I, t, s]) => <div key={t} className="step"><I size={28} strokeWidth={1.4} /><div><b>{t}</b><div className="mute">{s}</div></div></div>)}</div>
      <h2>Please re-order these</h2>
      {low.length === 0 ? <Empty icon={Check}>Everything is well stocked.</Empty> :
        <div className="list">{low.map((p, i) => (
          <div key={p.id} className="card pop item" style={{ "--i": i }}>
            <Av p={p} />
            <div className="grow"><div className="name">{p.name}</div><div className="mute">{p.stock} {p.unit} left · {sup(p.sid).name}{onOrder[p.id] ? ` · ${onOrder[p.id]} already ordered` : ""}</div></div>
            <span className={"badge b-" + level(p)}>{LBL[level(p)]}</span>
            <button className="btn sm" onClick={() => orderNow(p)}><FileText size={15} />Order now</button>
          </div>))}</div>}
      {open.length > 0 && <>
        <h2>Orders waiting for goods</h2>
        <div className="list">{open.map(o => (
          <div key={o.id} className="card item"><Initials name={sup(o.sid).name} />
            <div className="grow"><div className="name">{o.id} · {sup(o.sid).name}</div><div className="mute">{o.items.length} item(s) · ordered {o.date}</div></div>
            <button className="btn sm" onClick={() => setModal({ t: "grn", po: o })}><PackageCheck size={15} />Goods arrived</button>
          </div>))}</div></>}
    </>
  );
}

function Products({ d, sup, onOrder, setModal }) {
  const [q, setQ] = useState("");
  const list = d.products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row"><div><h1>Your items</h1><p className="sub">Everything you keep in stock.</p></div><div className="sp" /><button className="btn" onClick={() => setModal({ t: "product" })}><Plus size={16} />Add new item</button></div>
      <div className="search"><Search size={18} /><input placeholder="Search for an item…" value={q} onChange={e => setQ(e.target.value)} /></div>
      {list.length === 0 ? <Empty icon={Search}>No items found. Try another name or add a new item.</Empty> :
        <div className="grid product-grid">{list.map((p, i) => {
          const lv = level(p), pc = Math.min(100, Math.round(p.stock / Math.max(p.reorder * 3, 1) * 100));
          return (
            <div key={p.id} className="card pop product-card" style={{ "--i": i }}>
              <div className="pic"><Pic p={p} /></div>
              <div className="name">{p.name}</div><div className="mute">{sup(p.sid).name} · {rs(p.cost)} each</div>
              <div className="bar"><i style={{ width: Math.max(pc, 4) + "%" }} /></div>
              <div className="row"><b>{p.stock} {p.unit}</b><div className="sp" />{lv !== "ok" ? <span className={"badge b-" + lv}>{LBL[lv]}</span> : <span className="mute">{LBL[lv]}</span>}</div>
              {onOrder[p.id] > 0 && <div className="mute" style={{ marginTop: 6 }}><Truck size={13} style={{ verticalAlign: -2 }} /> {onOrder[p.id]} more on the way</div>}
              <div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={() => setModal({ t: "product", p })}><Pencil size={14} />Edit</button></div>
            </div>);
        })}</div>}
    </>
  );
}

function ProductForm({ modal, d, onSave, onClose }) {
  const [f, setF] = useState(modal.p || { name: "", emoji: "📦", sid: d.suppliers[0]?.id, unit: "pieces", cost: "", stock: 0, reorder: 5 });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const pick = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => {
      const c = document.createElement("canvas"), s = Math.min(1, 400 / Math.max(im.width, im.height));
      c.width = im.width * s; c.height = im.height * s; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      set("img", c.toDataURL("image/jpeg", 0.8)); }; im.src = r.result; };
    r.readAsDataURL(file);
  };
  const ok = f.name.trim() && f.sid && Number(f.cost) > 0;
  return (
    <Modal onClose={onClose}>
      <h3>{modal.p ? "Edit item" : "Add new item"}</h3><p className="mute">Fill in the boxes below.</p>
      <label>Item name</label><input value={f.name} onChange={e => set("name", e.target.value)} placeholder="Example: Rice 5kg bag" />
      <label>Picture</label>
      <div className="emojis">{EMOJIS.map(e => <button key={e} className={!f.img && f.emoji === e ? "on" : ""} onClick={() => setF(x => ({ ...x, emoji: e, img: null }))}>{e}</button>)}</div>
      <div className="row" style={{ marginTop: 10 }}>
        {f.img && <div className="av"><img src={f.img} alt="Your photo" /></div>}
        <label className="btn ghost sm" style={{ margin: 0, cursor: "pointer" }}><Camera size={15} />Use my own photo<input type="file" accept="image/*" hidden onChange={pick} /></label>
      </div>
      <label>Who sells it to you?</label>
      <select value={f.sid} onChange={e => set("sid", Number(e.target.value))}>{d.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <div className="two"><div><label>Counted in</label><input value={f.unit} onChange={e => set("unit", e.target.value)} placeholder="bags, boxes…" /></div>
        <div><label>Price you pay (Rs)</label><input type="number" min="0" value={f.cost} onChange={e => set("cost", e.target.value)} /></div></div>
      <div className="two"><div><label>How many now?</label><input type="number" min="0" value={f.stock} onChange={e => set("stock", Number(e.target.value) || 0)} /></div>
        <div><label>Warn me when below</label><input type="number" min="0" value={f.reorder} onChange={e => set("reorder", Number(e.target.value) || 0)} /></div></div>
      <div className="help"><Lightbulb size={18} />When stock falls to the “warn me” number, we will tell you to order more.</div>
      <div className="row"><button className="btn" disabled={!ok} onClick={() => onSave(f)}>Save item</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function Suppliers({ d, setModal }) {
  return (
    <>
      <div className="row"><div><h1>Your suppliers</h1><p className="sub">The people you buy from.</p></div><div className="sp" /><button className="btn" onClick={() => setModal({ t: "supplier" })}><Plus size={16} />Add supplier</button></div>
      <div className="grid">{d.suppliers.map((s, i) => (
        <div key={s.id} className="card pop" style={{ "--i": i }}>
          <div className="item"><Initials name={s.name} /><div><div className="name">{s.name}</div><div className="mute">{d.products.filter(p => p.sid === s.id).length} item(s)</div></div></div>
          <p className="mute" style={{ margin: "14px 0" }}>{s.contact || "—"}<br />{s.phone || "—"}</p>
          <div className="row"><button className="btn sm" onClick={() => setModal({ t: "po", sid: s.id, pre: {} })}><FileText size={14} />New order</button><button className="btn ghost sm" onClick={() => setModal({ t: "supplier", s })}><Pencil size={14} />Edit</button></div>
        </div>))}</div>
    </>
  );
}
function SupplierForm({ modal, onSave, onClose }) {
  const [f, setF] = useState(modal.s || { name: "", contact: "", phone: "" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal onClose={onClose}>
      <h3>{modal.s ? "Edit supplier" : "Add supplier"}</h3>
      <label>Company name</label><input value={f.name} onChange={e => set("name", e.target.value)} />
      <label>Contact person</label><input value={f.contact} onChange={e => set("contact", e.target.value)} />
      <label>Phone number</label><input value={f.phone} onChange={e => set("phone", e.target.value)} />
      <div className="row" style={{ marginTop: 22 }}><button className="btn" disabled={!f.name.trim()} onClick={() => onSave(f)}>Save supplier</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

const badge = s => (s === "Received" ? "" : s === "Part received" ? "b-low" : "b-low");
function Orders({ d, sup, setModal }) {
  const [tab, setTab] = useState("open");
  const list = d.pos.filter(o => (tab === "open" ? o.status !== "Received" : o.status === "Received"));
  return (
    <>
      <div className="row"><div><h1>Purchase orders</h1><p className="sub">What you have asked suppliers to send.</p></div><div className="sp" /><button className="btn" onClick={() => setModal({ t: "po", sid: d.suppliers[0]?.id, pre: {} })}><Plus size={16} />New order</button></div>
      <div className="tabs"><button className={tab === "open" ? "on" : ""} onClick={() => setTab("open")}>Waiting for goods</button><button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>Completed</button></div>
      {list.length === 0 ? <Empty icon={Inbox}>No orders here yet.</Empty> :
        <div className="list">{list.map((o, i) => {
          const t = o.items.reduce((a, x) => a + x.qty * x.cost, 0), q = o.items.reduce((a, x) => a + x.qty, 0), r = o.items.reduce((a, x) => a + x.received, 0);
          return (
            <div key={o.id} className="card pop" style={{ "--i": i }}>
              <div className="item"><Initials name={sup(o.sid).name} /><div className="grow"><div className="name">{o.id} · {sup(o.sid).name}</div><div className="mute">{o.date} · {rs(t)}</div></div><span className={"badge " + badge(o.status)}>{o.status}</span></div>
              <div className="bar"><i style={{ width: Math.round(r / q * 100) + "%" }} /></div><div className="mute">{r} of {q} received</div>
              <div className="row" style={{ marginTop: 14 }}>
                {o.status !== "Received" && <button className="btn sm" onClick={() => setModal({ t: "grn", po: o })}><PackageCheck size={14} />Goods arrived</button>}
                <button className="btn ghost sm" onClick={() => setModal({ t: "view", po: o })}>View order</button></div>
            </div>);
        })}</div>}
    </>
  );
}
function POForm({ modal, d, onSave, onClose }) {
  const [sid, setSid] = useState(modal.sid);
  const [q, setQ] = useState(modal.pre || {});
  const items = d.products.filter(p => p.sid === sid);
  const lines = items.filter(p => q[p.id] > 0).map(p => ({ pid: p.id, qty: q[p.id], cost: p.cost }));
  const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);
  return (
    <Modal onClose={onClose}>
      <h3>New purchase order</h3><p className="mute">Choose a supplier, then say how many of each you want.</p>
      <label>Supplier</label>
      <select value={sid} onChange={e => { setSid(Number(e.target.value)); setQ({}); }}>{d.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <div className="list" style={{ marginTop: 16 }}>
        {items.length === 0 && <div className="help">This supplier has no items yet. Add an item first from the Items page.</div>}
        {items.map(p => (
          <div key={p.id} className="item"><Av p={p} /><div className="grow"><b>{p.name}</b><div className="mute">{rs(p.cost)} · you have {p.stock}</div></div>
            <Qty v={q[p.id] || 0} set={v => setQ(x => ({ ...x, [p.id]: v }))} /></div>))}
      </div>
      <div className="help">Order total: <b>{rs(total)}</b></div>
      <div className="row"><button className="btn" disabled={!lines.length} onClick={() => onSave(sid, lines)}>Create order</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
function ViewPO({ po, prod, sup, onClose }) {
  return (
    <Modal onClose={onClose}>
      <h3>{po.id}</h3><p className="mute">{sup(po.sid).name} · {po.date}</p>
      <div className="list">{po.items.map(i => (
        <div key={i.pid} className="item"><Av p={prod(i.pid)} /><div className="grow"><b>{prod(i.pid).name}</b><div className="mute">{i.qty} ordered · {i.received} received · {rs(i.qty * i.cost)}</div></div></div>))}</div>
      <div className="help">Total: <b>{rs(po.items.reduce((a, x) => a + x.qty * x.cost, 0))}</b></div>
      <div className="row"><button className="btn" onClick={() => window.print()}><Printer size={16} />Print</button><button className="btn ghost" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function GRNForm({ po, prod, sup, onSave, onClose }) {
  const [q, setQ] = useState(() => Object.fromEntries(po.items.map(i => [i.pid, i.qty - i.received])));
  const [note, setNote] = useState(""), [by, setBy] = useState("");
  const lines = po.items.map(i => ({ pid: i.pid, qty: q[i.pid] || 0 }));
  return (
    <Modal onClose={onClose}>
      <h3>Goods arrived</h3><p className="mute">{po.id} from {sup(po.sid).name}. Count what really came and type the number.</p>
      <div className="list" style={{ marginTop: 14 }}>{po.items.map(i => {
        const left = i.qty - i.received;
        return (
          <div key={i.pid} className="item"><Av p={prod(i.pid)} /><div className="grow"><b>{prod(i.pid).name}</b><div className="mute">Ordered {i.qty} · still waiting for {left}</div></div>
            {left > 0 ? <Qty v={q[i.pid] || 0} max={left} set={v => setQ(x => ({ ...x, [i.pid]: v }))} /> : <span className="badge"><Check size={13} />Done</span>}</div>);
      })}</div>
      <label>Received by (your name)</label><input value={by} onChange={e => setBy(e.target.value)} />
      <label>Notes (broken, late, anything)</label><textarea rows="2" value={note} onChange={e => setNote(e.target.value)} />
      <div className="help"><Lightbulb size={18} />If only some goods came, that is fine. Enter what arrived and record the rest later.</div>
      <div className="row"><button className="btn" disabled={!lines.some(l => l.qty > 0) || !by.trim()} onClick={() => onSave(po, lines, note, by)}>Save and add to stock</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function Receipts({ d, sup, prod }) {
  return (
    <>
      <h1>Goods received</h1><p className="sub">A record of everything that came in (GRN).</p>
      {d.grns.length === 0 ? <Empty icon={Truck}>Nothing received yet. When a delivery arrives, open Orders and press “Goods arrived”.</Empty> :
        <div className="list">{d.grns.map((g, i) => (
          <div key={g.id} className="card pop" style={{ "--i": i }}>
            <div className="item"><Initials name={sup(g.sid).name} /><div className="grow"><div className="name">{g.id} · from {g.poId}</div><div className="mute">{sup(g.sid).name} · {g.date} · received by {g.by}</div></div><span className="badge"><Check size={13} />Added to stock</span></div>
            <div className="mute" style={{ marginTop: 12 }}>{g.lines.map(l => `${prod(l.pid).name} × ${l.qty}`).join("  ·  ")}</div>
            {g.note && <div className="help">{g.note}</div>}
          </div>))}</div>}
    </>
  );
}
