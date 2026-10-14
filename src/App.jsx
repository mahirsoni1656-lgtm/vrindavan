import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BadgeCheck,
  Boxes, Camera, Check, ChevronRight, CircleAlert, Clock3, DoorOpen,
  Download, LogOut, Pencil, Plus, QrCode, RefreshCw, ShieldCheck, Ticket, Trash2, Users, X
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const cx = (...s) => s.filter(Boolean).join(" ");
const fmt = (date) => new Date(date).toLocaleString();
const shortId = (s) => s ? `${s.slice(0, 8)}…` : "—";
const passExpired = (code) => Boolean(code.expires_at && new Date(code.expires_at).getTime() <= Date.now());
const passSuspended = (code) => Boolean(code.daily_suspended_until && new Date(code.daily_suspended_until).getTime() > Date.now());

async function fetchScanEventsForDate(date) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const events = [];
  for (let offset = 0; ; offset += 1000) {
    const {data, error} = await supabase.from("entry_events")
      .select("id, category_id, qr_code_id, action, scanned_at, categories(name), qr_codes(label)")
      .gte("scanned_at", dayStart.toISOString())
      .lt("scanned_at", dayEnd.toISOString())
      .order("scanned_at", {ascending:false})
      .range(offset, offset + 999);
    if (error) return {data:null, error};
    events.push(...(data || []));
    if ((data || []).length < 1000) return {data:events, error:null};
  }
}
function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Button({ children, onClick, variant = "primary", disabled = false, className = "", type = "button" }) {
  const variants = {
    primary: "bg-violet-700 text-white hover:bg-violet-800 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100",
    quiet: "text-slate-600 hover:bg-slate-100"
  };
  return <button type={type} disabled={disabled} onClick={onClick}
    className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", variants[variant], className)}>{children}</button>;
}

function Field({ label, ...props }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">{label}</span>
    <input {...props} className={cx("w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100", props.className)} />
  </label>;
}

function Notice({ notice, clear }) {
  if (!notice) return null;
  const good = notice.type === "success";
  return <div className={cx("mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm", good ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800")}>
    {good ? <BadgeCheck size={18} /> : <CircleAlert size={18} />}
    <div className="flex-1">{notice.message}</div>
    <button onClick={clear} aria-label="Dismiss"><X size={16}/></button>
  </div>;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!supabase) { setError("Add your Supabase URL and key to the .env file, then restart the dev server."); return; }
    setBusy(true); setError("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session) setError("Account created. Check your email to confirm the account, then sign in.");
    else onAuth(result.data.session?.user ?? result.data.user);
  }
  return <div className="flex min-h-screen bg-white">
    <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-violet-950 via-violet-800 to-indigo-700 p-12 text-white lg:flex">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-white/15 p-2.5"><QrCode size={26}/></div><span className="text-xl font-bold">GateCount</span></div>
      <div className="max-w-lg"><div className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide">EVENT ACCESS CONTROL</div><h1 className="text-5xl font-bold leading-tight">Every scan.<br/>Counted correctly.</h1><p className="mt-5 max-w-md text-lg leading-8 text-violet-100">Manage category capacity, track live entry and exit, and keep your event moving.</p>
        <div className="mt-10 grid grid-cols-3 gap-3">{[["01","Create categories"],["02","Generate QR codes"],["03","Track occupancy"]].map(([n,t])=><div key={n} className="rounded-2xl border border-white/15 bg-white/10 p-4"><div className="text-xs text-violet-200">{n}</div><div className="mt-2 text-sm font-semibold">{t}</div></div>)}</div>
      </div>
      <p className="text-xs text-violet-200">Built for event teams and category-based access.</p>
    </div>
    <div className="flex w-full items-center justify-center p-6 lg:w-1/2 lg:p-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="rounded-xl bg-violet-700 p-2.5 text-white"><QrCode size={23}/></div><span className="text-xl font-bold text-slate-900">GateCount</span></div>
        <div className="mb-8"><p className="text-sm font-semibold text-violet-700">WELCOME TO GATECOUNT</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{mode === "login" ? "Sign in to your account" : "Create your account"}</h2><p className="mt-2 text-sm text-slate-500">Use your event manager account to continue.</p></div>
        <form onSubmit={submit} className="space-y-5">
          <Field label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email"/>
          <Field label="Password (minimum 6 characters)" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" minLength={6} required autoComplete={mode==="login"?"current-password":"new-password"}/>
          {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full py-3">{busy ? "Please wait…" : mode==="login"?"Sign in":"Create account"} <ChevronRight size={17}/></Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">{mode==="login"?"Don't have an account?":"Already have an account?"} <button className="font-semibold text-violet-700 hover:underline" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}>{mode==="login"?"Sign up":"Sign in"}</button></p>
        <p className="mt-8 text-center text-xs leading-5 text-slate-400">Your data is stored in your Supabase project. Keep your database keys private.</p>
      </div>
    </div>
  </div>;
}

function Stat({ label, value, icon: Icon, note }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Icon size={19}/></div></div><div className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</div><p className="mt-1 text-xs text-slate-400">{note}</p></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("Overview");
  const [categories, setCategories] = useState([]);
  const [codes, setCodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [scanDate, setScanDate] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setExpiryTick] = useState(0);
  const [catName, setCatName] = useState("");
  const [catCapacity, setCatCapacity] = useState("4");
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [qrCategory, setQrCategory] = useState("");
  const [qrLabel, setQrLabel] = useState("");
  const [qrDailyEntryLimit, setQrDailyEntryLimit] = useState("");
  const [qrDailyExitLimit, setQrDailyExitLimit] = useState("");
  const [generatingQr, setGeneratingQr] = useState(false);
  const [editingCodeId, setEditingCodeId] = useState(null);
  const [editCodeLabel, setEditCodeLabel] = useState("");
  const [editCodeEntryLimit, setEditCodeEntryLimit] = useState("");
  const [editCodeExitLimit, setEditCodeExitLimit] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanAction, setScanAction] = useState("IN");
  const [lastScan, setLastScan] = useState(null);
  const [search, setSearch] = useState("");
  const [scannerKey, setScannerKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setExpiryTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const loadData = useCallback(async (showFeedback = false) => {
    if (!supabase) {
      setNotice({type:"error", message:"Supabase is not configured. Add the project URL and publishable key, then restart the app."});
      return;
    }
    if (!session?.user) {
      setNotice({type:"error", message:"Sign in to refresh event data."});
      return;
    }
    setLoading(true);
    try {
      const [catRes, codeRes, eventRes, usageRes, dateEventRes] = await Promise.all([
        supabase.from("category_dashboard").select("*").order("created_at", {ascending:false}),
        supabase.from("qr_codes").select("id, category_id, label, token, enabled, created_at, expires_at, daily_entry_limit, daily_exit_limit, daily_suspended_until, categories(name, capacity)").order("created_at", {ascending:false}),
        supabase.from("entry_events").select("id, category_id, qr_code_id, action, scanned_at, categories(name), qr_codes(label)").order("scanned_at", {ascending:false}).limit(100),
        supabase.from("qr_code_daily_usage").select("qr_code_id, entries_today, exits_today"),
        scanDate ? fetchScanEventsForDate(scanDate) : Promise.resolve(null)
      ]);
      const err = catRes.error || codeRes.error || eventRes.error || usageRes.error || dateEventRes?.error;
      if (err) throw err;
      const usageByCode = Object.fromEntries((usageRes.data || []).map(usage => [usage.qr_code_id, usage]));
      setCategories(catRes.data || []);
      setCodes((codeRes.data || []).map(code => ({...code,entries_today:usageByCode[code.id]?.entries_today||0,exits_today:usageByCode[code.id]?.exits_today||0})));
      setEvents(eventRes.data || []);
      setHistoryEvents(dateEventRes?.data || eventRes.data || []);
      if (showFeedback) setNotice({type:"success", message:"Data refreshed."});
    } catch (error) {
      setNotice({type:"error", message:`Could not load data: ${error.message || "Network request failed."} Make sure you ran the latest supabase/schema.sql.`});
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, scanDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (page !== "Scan" || !session) return;
    let scanner;
    const timer = setTimeout(() => {
      const element = document.getElementById("qr-reader");
      if (!element) return;
      scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 240, height: 240}, rememberLastUsedCamera: true }, false);
      scanner.render(async (decodedText) => {
        if (scannerRef.current === decodedText) return;
        scannerRef.current = decodedText;
        setScanValue(decodedText);
        await processScan(decodedText, scanAction);
        setTimeout(() => { scannerRef.current = null; }, 1800);
      }, () => {});
    }, 100);
    return () => { clearTimeout(timer); if (scanner) scanner.clear().catch(()=>{}); scannerRef.current = null; };
  }, [page, session?.user?.id, scannerKey, scanAction]);

  const totals = useMemo(() => {
    const active = categories.reduce((n,c)=>n+(c.active_count || 0),0);
    const cap = categories.reduce((n,c)=>n+Number(c.capacity || 0),0);
    const today = new Date().toDateString();
    const entries = events.filter(e=>e.action==="IN" && new Date(e.scanned_at).toDateString()===today).length;
    const exits = events.filter(e=>e.action==="OUT" && new Date(e.scanned_at).toDateString()===today).length;
    return {active, cap, entries, exits};
  }, [categories, events]);

  function editCategory(category) {
    setEditingCategoryId(category.id);
    setCatName(category.name);
    setCatCapacity(String(category.capacity));
  }

  function cancelCategoryEdit() {
    setEditingCategoryId(null);
    setCatName("");
    setCatCapacity("4");
  }

  async function saveCategory(e) {
    e.preventDefault();
    const capacity = Number(catCapacity);
    if (!catName.trim() || !Number.isInteger(capacity) || capacity < 1) return;
    let query;
    if (editingCategoryId) {
      const activePasses = codes.filter(code => code.category_id === editingCategoryId && code.enabled && !passExpired(code)).length;
      if (capacity < activePasses) {
        setNotice({type:"error",message:`Capacity cannot be lower than the ${activePasses} active QR passes. Delete unused passes first.`});
        return;
      }
      query = supabase.from("categories").update({name:catName.trim(), capacity}).eq("id", editingCategoryId);
    } else {
      query = supabase.from("categories").insert({name:catName.trim(), capacity, owner_id:session.user.id});
    }
    const {error} = await query;
    if (error) setNotice({type:"error",message:error.message});
    else {
      setNotice({type:"success",message:editingCategoryId?`Category "${catName.trim()}" updated.`:`Category "${catName.trim()}" created.`});
      cancelCategoryEdit();
      await loadData();
    }
  }

  async function deleteCategory(category) {
    const passCount = codes.filter(code => code.category_id === category.id).length;
    if (!window.confirm(`Delete "${category.name}"? This permanently removes ${passCount} QR passes and all scan history for this category.`)) return;
    const {error} = await supabase.from("categories").delete().eq("id", category.id);
    if (error) setNotice({type:"error",message:error.message});
    else {
      if (qrCategory === category.id) setQrCategory("");
      if (editingCategoryId === category.id) cancelCategoryEdit();
      await loadData();
      setNotice({type:"success",message:`Category "${category.name}" deleted.`});
    }
  }

  function editCode(code) {
    setEditingCodeId(code.id);
    setEditCodeLabel(code.label);
    setEditCodeEntryLimit(code.daily_entry_limit ?? "");
    setEditCodeExitLimit(code.daily_exit_limit ?? "");
  }

  async function saveCode(e) {
    e.preventDefault();
    const entryLimit = editCodeEntryLimit === "" ? null : Number(editCodeEntryLimit);
    const exitLimit = editCodeExitLimit === "" ? null : Number(editCodeExitLimit);
    if (!editCodeLabel.trim() || (entryLimit !== null && (!Number.isInteger(entryLimit) || entryLimit < 1)) || (exitLimit !== null && (!Number.isInteger(exitLimit) || exitLimit < 1))) return;
    const {error} = await supabase.from("qr_codes").update({label:editCodeLabel.trim(),daily_entry_limit:entryLimit,daily_exit_limit:exitLimit}).eq("id", editingCodeId);
    if (error) setNotice({type:"error",message:error.message});
    else {
      setNotice({type:"success",message:"QR pass updated."});
      setEditingCodeId(null);
      await loadData();
    }
  }

  async function deleteCode(code) {
    const {count,error:countError} = await supabase.from("entry_events").select("id", {count:"exact",head:true}).eq("qr_code_id", code.id);
    if (countError) {setNotice({type:"error",message:countError.message});return;}
    const historyMessage = count ? ` This also permanently removes ${count} scan records.` : "";
    if (!window.confirm(`Delete QR pass "${code.label}"?${historyMessage}`)) return;
    const {error} = await supabase.from("qr_codes").delete().eq("id", code.id);
    if (error) setNotice({type:"error",message:error.message});
    else {
      if (editingCodeId === code.id) setEditingCodeId(null);
      await loadData();
      setNotice({type:"success",message:`QR pass "${code.label}" deleted.`});
    }
  }

  async function createQr(e) {
    e.preventDefault();
    if (!qrCategory || !qrLabel.trim()) return;
    const selectedCategory = categories.find(category => category.id === qrCategory);
    if (!selectedCategory) return;
    const activePassCount = codes.filter(code => code.category_id === qrCategory && code.enabled && !passExpired(code)).length;
    const passCount = Math.max(0, Number(selectedCategory.capacity) - activePassCount);
    if (passCount === 0) {
      setNotice({type:"error",message:`This category already has ${activePassCount} active QR passes for its capacity of ${selectedCategory.capacity}.`});
      return;
    }

    setGeneratingQr(true);
    try {
      const labelPrefix = qrLabel.trim();
      const labelWidth = String(selectedCategory.capacity).length;
      const passes = Array.from({length:passCount}, (_, index) => ({
        category_id:qrCategory,
        label:`${labelPrefix} ${String(activePassCount + index + 1).padStart(labelWidth, "0")}`,
        token:crypto.randomUUID() + "-" + crypto.randomUUID(),
        enabled:true,
        daily_entry_limit:qrDailyEntryLimit?Number(qrDailyEntryLimit):null,
        daily_exit_limit:qrDailyExitLimit?Number(qrDailyExitLimit):null
      }));
      const {error} = await supabase.from("qr_codes").insert(passes);
      if (error) throw error;
      setNotice({type:"success",message:`Generated ${passCount} QR passes for ${labelPrefix}. Active passes now match the category capacity.`});
      setQrLabel("");
      setQrDailyEntryLimit("");
      setQrDailyExitLimit("");
      await loadData();
      setPage("QR Passes");
    } catch (error) {
      setNotice({type:"error",message:`Could not generate QR passes: ${error.message || "Request failed."}`});
    } finally {
      setGeneratingQr(false);
    }
  }

  async function processScan(raw = scanValue, action = scanAction) {
    if (!raw.trim()) {setNotice({type:"error",message:"Scan a QR code or paste its token first."});return;}
    if (!supabase) return;
    const {data,error} = await supabase.rpc("scan_qr", {p_token:raw.trim(),p_action:action});
    if (error) {
      setLastScan({ok:false,message:error.message,at:new Date().toISOString()});
      setNotice({type:"error",message:error.message});
    } else {
      const result = Array.isArray(data) ? data[0] : data;
      const ok = result?.ok === true;
      setLastScan({ok,message:result?.message || (ok?"Scan successful":"Scan rejected"),category:result?.category_name,action:result?.action,at:new Date().toISOString()});
      setNotice({type:ok?"success":"error",message:result?.message || (ok?"Scan successful":"Scan rejected")});
      setScanValue("");
      await loadData();
    }
  }

  async function signOut() { await supabase.auth.signOut(); setPage("Overview"); }
  const nav = [
    {name:"Overview", icon:Activity}, {name:"Categories", icon:Boxes}, {name:"QR Passes", icon:QrCode},
    {name:"Scan", icon:Camera}, {name:"Scan History", icon:Clock3}
  ];
  const filteredEvents = historyEvents.filter(e => (activeFilter==="all" || e.action===activeFilter) && `${e.categories?.name||""} ${e.qr_codes?.label||""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredCodes = codes.filter(code => `${code.label} ${code.categories?.name||""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedCode = codes.find(code => code.id === editingCodeId);
  const categoryById = Object.fromEntries(categories.map(c=>[c.id,c]));
  const selectedQrCategory = categories.find(category => category.id === qrCategory);
  const activeQrPassCount = codes.filter(code => code.category_id === qrCategory && code.enabled && !passExpired(code)).length;
  const qrPassesRemaining = selectedQrCategory ? Math.max(0, Number(selectedQrCategory.capacity) - activeQrPassCount) : 0;
  const insideCount = (catId) => events.filter(e=>e.category_id===catId).length; // Recent-event count is only a display fallback; database capacity checks are authoritative.

  if (authLoading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading GateCount…</div>;
  if (!session) return <AuthScreen onAuth={(user)=>{ if (user) supabase.auth.getSession().then(({data})=>setSession(data.session)); }} />;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6"><div className="rounded-xl bg-violet-700 p-2.5 text-white"><QrCode size={22}/></div><div><div className="font-bold">GateCount</div><div className="text-xs text-slate-400">Event access manager</div></div></div>
      <div className="px-4 pt-6"><p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</p>{nav.map(({name,icon:Icon})=><button key={name} onClick={()=>{setPage(name);setNotice(null);}} className={cx("mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",page===name?"bg-violet-50 text-violet-800":"text-slate-600 hover:bg-slate-50")}><Icon size={18}/>{name}{name==="Scan"&&<span className="ml-auto h-2 w-2 rounded-full bg-emerald-500"/>}</button>)}</div>
      <div className="mt-auto p-4"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-emerald-600"/> Capacity protection</div><p className="mt-2 text-xs leading-5 text-slate-500">The database checks category limits when a QR is scanned.</p></div><button onClick={signOut} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50"><LogOut size={18}/> Sign out</button></div>
    </aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur md:px-8">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Event control panel</p><h1 className="mt-0.5 text-xl font-bold">{page}</h1></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{session.user.email}</p><p className="text-xs text-slate-400">Administrator</p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 font-bold text-violet-800">{(session.user.email||"A")[0].toUpperCase()}</div><button onClick={signOut} title="Sign out" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><LogOut size={18}/></button></div>
      </header>
      <main className="mx-auto max-w-7xl px-5 pt-5 pb-28 md:px-8 md:pt-8 md:pb-28 lg:pb-8">
        <Notice notice={notice} clear={()=>setNotice(null)}/>
        {page==="Overview" && <>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Event overview</h2><p className="mt-1 text-sm text-slate-500">A live view of your event access activity.</p></div><Button onClick={()=>loadData(true)} variant="secondary" disabled={loading}><RefreshCw size={16} className={loading?"animate-spin":""}/>{loading?"Refreshing…":"Refresh data"}</Button></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="People currently inside" value={totals.active} icon={Users} note="Across all categories"/>
            <Stat label="Total capacity" value={totals.cap} icon={Boxes} note="Sum of category limits"/>
            <Stat label="Entries today (recent 100)" value={totals.entries} icon={ArrowDownToLine} note="Based on loaded scan history"/>
            <Stat label="Exits today (recent 100)" value={totals.exits} icon={ArrowUpFromLine} note="Based on loaded scan history"/>
          </div>
          <div className="mt-8 grid gap-6 xl:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-3"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold">Category capacity</h3><p className="mt-1 text-sm text-slate-500">Occupancy refreshes after a successful scan.</p></div><Boxes size={20} className="text-slate-400"/></div>
              {categories.length===0?<Empty icon={Boxes} title="No categories yet" text="Create your first category and set its maximum capacity." action={()=>setPage("Categories")} actionText="Create category"/>:<div className="space-y-5">{categories.map(c=>{const active=Number(c.active_count||0), cap=Number(c.capacity||0), pct=cap?Math.min(100,active/cap*100):0;return <div key={c.id}><div className="mb-2 flex items-center justify-between gap-3"><div><p className="font-semibold">{c.name}</p><button type="button" onClick={()=>{setSearch(c.name);setPage("QR Passes");}} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline"><QrCode size={13}/>{c.code_count||0} passes issued · View passes</button></div><p className="text-sm font-bold tabular-nums">{active} <span className="font-normal text-slate-400">inside / {cap}</span></p></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={cx("h-full rounded-full transition-all",pct>=100?"bg-rose-500":pct>=80?"bg-amber-500":"bg-violet-600")} style={{width:`${pct}%`}}/></div></div>})}</div>}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold">Recent scans</h3><p className="mt-1 text-sm text-slate-500">Latest recorded activity</p></div><Clock3 size={20} className="text-slate-400"/></div>
              {events.length===0?<div className="py-8 text-center text-sm text-slate-400">No scans recorded yet.</div>:<div className="space-y-4">{events.slice(0,6).map(e=><div key={e.id} className="flex items-center gap-3"><div className={cx("rounded-xl p-2",e.action==="IN"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>{e.action==="IN"?<ArrowDownToLine size={17}/>:<ArrowUpFromLine size={17}/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{e.qr_codes?.label||"QR pass"}</p><p className="text-xs text-slate-400">{e.categories?.name||"Category"} · {fmt(e.scanned_at)}</p></div><span className={cx("rounded-full px-2.5 py-1 text-[10px] font-bold",e.action==="IN"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>{e.action}</span></div>)}</div>}
              <Button variant="secondary" className="mt-5 w-full" onClick={()=>setPage("Scan History")}>View all history <ChevronRight size={16}/></Button>
            </section>
          </div>
          <div className="mt-6 rounded-2xl bg-violet-950 p-6 text-white md:flex md:items-center md:justify-between"><div className="flex items-start gap-4"><div className="rounded-xl bg-white/10 p-3"><Camera size={22}/></div><div><h3 className="font-bold">Ready to scan passes?</h3><p className="mt-1 text-sm text-violet-200">Scan the person's assigned QR code to check them in or out.</p></div></div><Button className="mt-5 bg-white text-violet-900 hover:bg-violet-50 md:mt-0" onClick={()=>setPage("Scan")}>Open QR scanner <ChevronRight size={16}/></Button></div>
        </>}
        {page==="Categories" && <div className="grid items-start gap-6 xl:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">{editingCategoryId?"Edit category":"Create a category"}</h2><p className="mt-1 text-sm text-slate-500">Set a separate occupancy limit for each area or stall.</p><form onSubmit={saveCategory} className="mt-6 space-y-4"><Field label="Category name" value={catName} onChange={e=>setCatName(e.target.value)} placeholder="e.g. Vada Pav Stall" required maxLength={80}/><Field label="Maximum people inside" type="number" min="1" max="100000" value={catCapacity} onChange={e=>setCatCapacity(e.target.value)} required/><div className="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-800"><ShieldCheck size={15} className="mr-1 inline"/> Capacity is the maximum number of active passes and people inside.</div><div className="flex gap-2"><Button type="submit" className="flex-1">{editingCategoryId?<Pencil size={16}/>:<Plus size={17}/>} {editingCategoryId?"Save changes":"Add category"}</Button>{editingCategoryId&&<Button type="button" variant="secondary" onClick={cancelCategoryEdit}>Cancel</Button>}</div></form></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Your categories</h2><p className="mt-1 text-sm text-slate-500">Each category has an independent capacity limit.</p></div><Button variant="secondary" disabled={!categories.length} onClick={()=>downloadCsv("categories.csv",[["name","capacity","people_inside","active_passes","created_at"],...categories.map(category=>[category.name,category.capacity,category.active_count,category.code_count,category.created_at])])}><Download size={16}/> Export CSV</Button></div>
            {categories.length===0?<Empty icon={Boxes} title="Nothing here yet" text="Add your first category to get started."/>:<div className="grid gap-4 sm:grid-cols-2">{categories.map(c=>{const active=Number(c.active_count||0),cap=Number(c.capacity||0);return <div key={c.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Ticket size={20}/></div><span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold",active>=cap?"bg-rose-50 text-rose-700":"bg-emerald-50 text-emerald-700")}>{active>=cap?"At capacity":"Available"}</span></div><h3 className="mt-4 font-bold">{c.name}</h3><p className="mt-1 text-sm text-slate-500">{active} inside · {Math.max(0,cap-active)} spaces available</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600" style={{width:`${cap?Math.min(100,active/cap*100):0}%`}}/></div><div className="mt-4 flex justify-between text-xs text-slate-400"><span>Capacity: {cap}</span><span>{c.code_count||0} passes</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={()=>editCategory(c)}><Pencil size={15}/> Edit</Button><Button variant="danger" onClick={()=>deleteCategory(c)}><Trash2 size={15}/> Delete</Button><Button variant="secondary" className="col-span-2" onClick={()=>{setQrCategory(c.id);setPage("QR Passes");}}>Generate QR passes <QrCode size={15}/></Button></div></div>})}</div>}
          </section>
        </div>}
        {page==="QR Passes" && <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Generate QR passes</h2><p className="mt-1 text-sm text-slate-500">Generate numbered passes to match the selected category's capacity.</p>
            {categories.length===0?<div className="mt-5"><Empty icon={Boxes} title="Create a category first" text="QR passes must belong to a category." action={()=>setPage("Categories")} actionText="Go to categories"/></div>:<form onSubmit={createQr} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end"><label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Category</span><select value={qrCategory} onChange={e=>setQrCategory(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"><option value="">Choose category…</option>{categories.map(c=>{const activeCount=codes.filter(code=>code.category_id===c.id&&code.enabled&&!passExpired(code)).length;const remaining=Math.max(0,Number(c.capacity)-activeCount);return <option key={c.id} value={c.id}>{c.name} ({remaining} passes remaining of {c.capacity})</option>;})}</select></label><Field label="Pass label prefix" value={qrLabel} onChange={e=>setQrLabel(e.target.value)} placeholder="e.g. Attendee" maxLength={90} required/><Field label="Daily entry limit" type="number" min="1" step="1" value={qrDailyEntryLimit} onChange={e=>setQrDailyEntryLimit(e.target.value)} placeholder="Unlimited"/><Field label="Daily exit limit" type="number" min="1" step="1" value={qrDailyExitLimit} onChange={e=>setQrDailyExitLimit(e.target.value)} placeholder="Unlimited"/><Button type="submit" disabled={generatingQr||!qrCategory||qrPassesRemaining===0}>{generatingQr?<RefreshCw size={17} className="animate-spin"/>:<Plus size={17}/ >}{generatingQr?"Generating…":qrCategory?`Generate ${qrPassesRemaining} passes`:"Choose category"}</Button><p className="text-xs text-slate-500 md:col-span-2 xl:col-span-5">{qrCategory?`This creates ${qrPassesRemaining} numbered passes to fill capacity.`:"Choose a category to see how many passes are needed."} Leave daily limits blank for unlimited scans; limits reset each day.</p></form>}
          </section>
          {codes.length>0&&<section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5"><h2 className="text-lg font-bold">Manage a QR pass</h2><p className="mt-1 text-sm text-slate-500">Update pass details or remove an unused pass.</p></div><label className="block max-w-xl space-y-1.5"><span className="text-sm font-medium text-slate-700">Select pass</span><select value={editingCodeId||""} onChange={e=>{const code=codes.find(item=>item.id===e.target.value);if(code)editCode(code);else setEditingCodeId(null);}} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"><option value="">Choose a pass…</option>{codes.map(code=><option key={code.id} value={code.id}>{code.label} · {code.categories?.name||"Category"}{code.enabled?"":" · disabled"}</option>)}</select></label>{selectedCode&&<form onSubmit={saveCode} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end"><Field label="Pass label" value={editCodeLabel} onChange={e=>setEditCodeLabel(e.target.value)} required maxLength={100}/><Field label="Daily entry limit" type="number" min="1" step="1" value={editCodeEntryLimit} onChange={e=>setEditCodeEntryLimit(e.target.value)} placeholder="Unlimited"/><Field label="Daily exit limit" type="number" min="1" step="1" value={editCodeExitLimit} onChange={e=>setEditCodeExitLimit(e.target.value)} placeholder="Unlimited"/><div className="flex flex-wrap gap-2"><Button type="submit"><Pencil size={15}/> Save changes</Button><Button type="button" variant="danger" onClick={()=>deleteCode(selectedCode)}><Trash2 size={15}/> Delete pass</Button></div></form>}</section>}
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Generated QR passes</h2><p className="mt-1 text-sm text-slate-500">{codes.length} total passes · CSV excludes QR tokens</p></div><div className="flex flex-wrap items-end gap-3"><Field label="Search passes" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or category"/><Button variant="secondary" disabled={!filteredCodes.length} onClick={()=>downloadCsv("qr-passes.csv",[["label","category","enabled","expires_at","daily_entry_limit","daily_exit_limit","entries_today","exits_today","daily_suspended_until","created_at"],...filteredCodes.map(code=>[code.label,code.categories?.name,code.enabled,code.expires_at,code.daily_entry_limit,code.daily_exit_limit,code.entries_today,code.exits_today,code.daily_suspended_until,code.created_at])])}><Download size={16}/> Export CSV</Button></div></div>
            {filteredCodes.length===0?<Empty icon={QrCode} title="No QR passes found" text="Generate a pass for a category to see it here."/>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredCodes.map(c=><div key={c.id} data-qr-id={c.id} className="qr-pass-card rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{c.label}</h3><p className="mt-1 text-xs text-slate-500">{c.categories?.name||"Category"}</p></div><span className={cx("rounded-full px-2 py-1 text-[10px] font-bold",!c.enabled?"bg-slate-100 text-slate-500":passExpired(c)?"bg-rose-50 text-rose-700":passSuspended(c)?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700")}>{!c.enabled?"DISABLED":passExpired(c)?"EXPIRED":passSuspended(c)?"LIMIT REACHED TODAY":"ACTIVE"}</span></div><div className="my-5 flex justify-center rounded-xl bg-white p-3"><QRCodeCanvas value={c.token} size={180} level="H" includeMargin/></div><p className="text-center text-xs text-slate-400">Pass ID: {shortId(c.id)}</p><p className="mt-1 text-center text-xs text-slate-400">Created {fmt(c.created_at)}</p><p className="text-center text-xs text-slate-500">{passExpired(c)?"Expired":"Valid until"} {fmt(c.expires_at)}</p><p className="mt-2 text-center text-xs font-medium text-slate-600">Today: IN {c.entries_today??0}/{c.daily_entry_limit??"∞"} · OUT {c.exits_today??0}/{c.daily_exit_limit??"∞"}</p>{passSuspended(c)&&!passExpired(c)&&<p className="mt-2 text-center text-xs font-medium text-amber-700">Your limit is finished for today. Suspended until {fmt(c.daily_suspended_until)}. Exit remains available if currently inside.</p>}{passExpired(c)&&<p className="mt-2 text-center text-xs font-medium text-rose-700">This QR is no longer valid. Generate a replacement pass.</p>}<Button variant="secondary" className="mt-4 w-full" disabled={!c.enabled||passExpired(c)} onClick={()=>downloadQr(c)}><Download size={16}/>{passExpired(c)?"QR expired":"Download QR PNG"}</Button></div>)}</div>}
          </section>
        </div>}
        {page==="Scan" && <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Scan entry / exit</h2><p className="mt-1 text-sm text-slate-500">Choose whether this scan records an entry or an exit.</p></div><div role="group" aria-label="Scan action" className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1"><button type="button" aria-pressed={scanAction==="IN"} onClick={()=>setScanAction("IN")} className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",scanAction==="IN"?"bg-emerald-100 text-emerald-800 shadow-sm":"text-slate-500 hover:bg-slate-50")}><ArrowDownToLine size={17}/> Entry</button><button type="button" aria-pressed={scanAction==="OUT"} onClick={()=>setScanAction("OUT")} className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",scanAction==="OUT"?"bg-amber-100 text-amber-800 shadow-sm":"text-slate-500 hover:bg-slate-50")}><ArrowUpFromLine size={17}/> Exit</button></div></div>
          <div className="grid items-start gap-6 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3"><div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><Camera size={21}/></div><div><h3 className="font-bold">Camera scanner · {scanAction==="IN"?"Entry":"Exit"} mode</h3><p className="text-xs text-slate-500">Allow camera permission when prompted.</p></div></div><div id="qr-reader" className="overflow-hidden rounded-xl border border-slate-100"></div><Button variant="secondary" className="mt-4 w-full" onClick={()=>{setScannerKey(k=>k+1);setLastScan(null);}}><RefreshCw size={16}/> Restart camera</Button><p className="mt-3 text-xs leading-5 text-slate-400">Camera access requires HTTPS in production (localhost is allowed for development).</p></section>
            <div className="space-y-5 lg:col-span-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Manual token entry</h3><p className="mt-1 text-sm text-slate-500">For testing, paste the QR token instead of using the camera.</p><form onSubmit={e=>{e.preventDefault();processScan(scanValue,scanAction);}} className="mt-4 space-y-3"><Field label="QR token" value={scanValue} onChange={e=>setScanValue(e.target.value)} placeholder="Paste token value"/><Button type="submit" className="w-full">{scanAction==="IN"?<ArrowDownToLine size={16}/>:<ArrowUpFromLine size={16}/>} Record {scanAction==="IN"?"entry":"exit"}</Button></form></section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Last scan result</h3>{!lastScan?<div className="py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><QrCode size={22}/></div><p className="mt-3 text-sm text-slate-500">Waiting for a QR scan…</p></div>:<div className="mt-5"><div className={cx("mx-auto grid h-14 w-14 place-items-center rounded-full",lastScan.ok?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-700")}>{lastScan.ok?<Check size={27}/>:<X size={27}/>}</div><h4 className={cx("mt-3 text-center text-lg font-bold",lastScan.ok?"text-emerald-700":"text-rose-700")}>{lastScan.ok?"Scan successful":"Scan rejected"}</h4><p className="mt-2 text-center text-sm text-slate-600">{lastScan.message}</p>{lastScan.category&&<p className="mt-3 text-center text-xs text-slate-400">{lastScan.category} · {lastScan.action}</p>}<p className="mt-2 text-center text-xs text-slate-400">{fmt(lastScan.at)}</p></div>}</section>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Capacity rule:</strong> If a category allows 4 people, only 4 can be inside at once. A 5th entry is rejected until somebody exits.</div>
            </div>
          </div>
        </div>}
        {page==="Scan History" && <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-bold">Scan history</h2><p className="mt-1 text-sm text-slate-500">{scanDate?`${filteredEvents.length} scans on ${scanDate}.`:`Most recent 100 recorded entry and exit events.`}</p></div><div className="flex flex-wrap items-end gap-2"><label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Date</span><input type="date" value={scanDate} onChange={e=>setScanDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500"/></label>{scanDate&&<Button variant="quiet" onClick={()=>setScanDate("")}>Clear date</Button>}<select value={activeFilter} onChange={e=>setActiveFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">All actions</option><option value="IN">Entries only</option><option value="OUT">Exits only</option></select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search person/category" className="w-52 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"/><Button variant="secondary" disabled={!filteredEvents.length} onClick={()=>downloadCsv("scan-history.csv",[["action","pass_label","category","scanned_at","event_id"],...filteredEvents.map(event=>[event.action,event.qr_codes?.label,event.categories?.name,event.scanned_at,event.id])])}><Download size={16}/> Export CSV</Button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 pr-4 font-semibold">Action</th><th className="pb-3 pr-4 font-semibold">Pass holder</th><th className="pb-3 pr-4 font-semibold">Category</th><th className="pb-3 pr-4 font-semibold">Date & time</th><th className="pb-3 font-semibold">Event ID</th></tr></thead><tbody>{filteredEvents.map(e=><tr key={e.id} className="border-b border-slate-50 last:border-0"><td className="py-4 pr-4"><span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",e.action==="IN"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>{e.action==="IN"?<ArrowDownToLine size={13}/>:<ArrowUpFromLine size={13}/>} {e.action}</span></td><td className="py-4 pr-4 font-semibold">{e.qr_codes?.label||"QR pass"}</td><td className="py-4 pr-4 text-slate-600">{e.categories?.name||"—"}</td><td className="py-4 pr-4 text-slate-500">{fmt(e.scanned_at)}</td><td className="py-4 font-mono text-xs text-slate-400">{shortId(e.id)}</td></tr>)}</tbody></table>{filteredEvents.length===0&&<div className="py-12 text-center text-sm text-slate-400">No matching scan events.</div>}</div>
        </section>}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-xs text-slate-400"><span>GateCount · QR Event Manager</span><span>Capacity checks are enforced in the database</span></footer>
      </main>
      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white px-1 pt-1.5 lg:hidden" aria-label="Main navigation">{nav.map(({name,icon:Icon})=><button key={name} aria-label={name} aria-current={page===name?"page":undefined} onClick={()=>{setPage(name);setNotice(null);}} className={cx("flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-lg px-0.5 py-1 text-[10px] font-semibold",page===name?"text-violet-700":"text-slate-500")}><Icon size={19}/>{name==="Scan History"?"History":name}</button>)}</nav>
    </div>
  </div>;
}

function Empty({icon:Icon,title,text,action,actionText}) {
  return <div className="flex flex-col items-center justify-center py-10 text-center"><div className="rounded-2xl bg-slate-100 p-4 text-slate-400"><Icon size={24}/></div><h3 className="mt-4 font-bold">{title}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">{text}</p>{action&&<Button className="mt-4" onClick={action}>{actionText}</Button>}</div>;
}

function downloadQr(code) {
  // Locate the QR canvas inside the card for this pass.
  const card = document.querySelector(`[data-qr-id="${code.id}"]`);
  const target = card?.querySelector("canvas");
  if (!target) { alert("Could not find the QR image. Try refreshing the page."); return; }
  const filename = `${code.label.replace(/[^a-z0-9-_]+/gi,"-")}-qr.png`;
  const dataUrl = target.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  const blobUrl = URL.createObjectURL(new Blob([bytes], {type:"image/png"}));
  const downloadFile = () => {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  };

  if (navigator.share && navigator.canShare && typeof File !== "undefined") {
    const file = new File([bytes], filename, {type:"image/png"});
    if (navigator.canShare({files:[file]})) {
      navigator.share({files:[file], title:code.label}).catch(error => {
        if (error.name === "AbortError") return;
        downloadFile();
      });
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return;
    }
  }

  downloadFile();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
