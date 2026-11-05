import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Flame, Clock3,
  Moon, Sun, LogOut, Settings, Download, Upload, Plus, Pencil, Trash2,
  Check, Cloud, CloudOff, LoaderCircle, LayoutDashboard, FileText, X,
  BarChart3, ShieldCheck, UserRound, CheckCircle2
} from 'lucide-react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider, configured } from './firebase'

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const defaultSections = [
  { id: 'gym', name: 'Gym', icon: 'Dumbbell', color: '#d6b65d', archived: false },
  { id: 'workout', name: 'Workout', icon: 'Activity', color: '#69b89a', archived: false },
  { id: 'food', name: 'Food & Meals', icon: 'FileText', color: '#8e9ed8', archived: false },
  { id: 'reading', name: 'Reading', icon: 'FileText', color: '#b18bd4', archived: false },
]
const emptyData = () => ({
  gymDays: {}, foodLogs: {}, workoutLogs: {}, theme: 'dark',
  sections: defaultSections, dailyEntries: {}, trackerDays: {}, updatedAt: null
})
const dateLabel = (key) => {
  const [y,m,d] = key.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})
}
const safeObject = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const normalizeSections = (sections) => {
  const existing = Array.isArray(sections) && sections.length ? sections : defaultSections
  return existing.some(section => section.id === 'reading') ? existing : [...existing, defaultSections.find(section => section.id === 'reading')]
}

export default function App() {
  const [user,setUser] = useState(null)
  const [authLoading,setAuthLoading] = useState(true)
  const [data,setData] = useState(emptyData)
  const [cloudReady,setCloudReady] = useState(false)
  const [syncState,setSyncState] = useState('idle')
  const [error,setError] = useState('')
  const [view,setView] = useState('dashboard')
  const [activeTrackerId,setActiveTrackerId] = useState('gym')
  const [selectedDate,setSelectedDate] = useState(todayKey())
  const [month,setMonth] = useState(() => new Date())
  const [editingSection,setEditingSection] = useState(null)
  const [newSection,setNewSection] = useState('')
  const [showAdd,setShowAdd] = useState(false)
  const [backupMessage,setBackupMessage] = useState('')
  const remoteUpdate = useRef(false)
  const fileInput = useRef(null)

  useEffect(() => {
    if (!configured) { setAuthLoading(false); return }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); setError('') })
  }, [])

  useEffect(() => {
    if (!user || !db) { setCloudReady(false); return }
    setCloudReady(false)
    setSyncState('syncing')
    const ref = doc(db,'users',user.uid,'tracker','main')
    let firstSnapshot = true
    const unsub = onSnapshot(ref, async (snap) => {
      try {
        if (firstSnapshot) {
          firstSnapshot = false
          if (!snap.exists()) {
            // One-time, non-destructive import from the legacy browser storage.
            const legacy = {
              gymDays: safeObject(JSON.parse(localStorage.getItem('gymDays') || '{}')),
              foodLogs: safeObject(JSON.parse(localStorage.getItem('foodLogs') || '{}')),
              workoutLogs: safeObject(JSON.parse(localStorage.getItem('workoutLogs') || '{}')),
              theme: localStorage.getItem('theme') || 'dark',
              sections: defaultSections,
              dailyEntries: {},
              trackerDays: {},
              migration: { source: 'legacy-localStorage', completedAt: new Date().toISOString() }
            }
            await setDoc(ref,{...legacy, updatedAt: serverTimestamp()})
            setData({...emptyData(),...legacy})
          } else {
            const cloud = snap.data()
            setData({...emptyData(),...cloud, sections: normalizeSections(cloud.sections), trackerDays: safeObject(cloud.trackerDays)})
          }
          setCloudReady(true)
          setSyncState('saved')
          return
        }
        // Ignore local pending-write snapshots; local state is already current.
        if (snap.exists() && !snap.metadata.hasPendingWrites) {
          remoteUpdate.current = true
          const cloud = snap.data()
          setData(prev => ({...prev,...cloud, sections: normalizeSections(cloud.sections || prev.sections), trackerDays: safeObject(cloud.trackerDays || prev.trackerDays)}))
          setCloudReady(true)
          setSyncState('saved')
        }
      } catch (e) {
        setError(`Could not initialize cloud data: ${e.message}`)
        setSyncState('error')
      }
    }, (e) => { setError(e.message); setSyncState('error') })
    return () => unsub()
  }, [user])

  useEffect(() => {
    document.body.classList.toggle('light-theme',data.theme === 'light')
  }, [data.theme])

  useEffect(() => {
    if (!user || !cloudReady || !db) return
    if (remoteUpdate.current) { remoteUpdate.current = false; return }
    setSyncState('syncing')
    const timer = setTimeout(async () => {
      try {
        const { updatedAt, ...payload } = data
        await setDoc(doc(db,'users',user.uid,'tracker','main'),{...payload,updatedAt:serverTimestamp()})
        setSyncState('saved')
      } catch(e) { setSyncState('error'); setError(`Sync failed: ${e.message}`) }
    },450)
    return () => clearTimeout(timer)
  }, [data,user,cloudReady])

  const update = (patch) => setData(prev => ({...prev,...patch}))
  const activeSections = data.sections.filter(s => !s.archived)
  const activeTracker = activeSections.find(s => s.id === activeTrackerId) || activeSections[0] || defaultSections[0]
  const sectionName = (id, fallback) => data.sections.find(s => s.id === id)?.name || fallback
  const isMarked = (key, trackerId=activeTracker.id) => trackerId === 'gym'
    ? !!data.gymDays[key]
    : !!data.trackerDays?.[trackerId]?.[key]
  const activeTrackerDays = Object.keys(activeTracker.id === 'gym' ? data.gymDays : (data.trackerDays?.[activeTracker.id] || {}))
    .filter(k => isMarked(k, activeTracker.id))
  const toggleTrackerDay = (key) => {
    if (activeTracker.id === 'gym') update({gymDays:{...data.gymDays,[key]:!data.gymDays[key]}})
    else update({trackerDays:{...(data.trackerDays || {}),[activeTracker.id]:{...(data.trackerDays?.[activeTracker.id] || {}),[key]:!data.trackerDays?.[activeTracker.id]?.[key]}}})
  }
  const updateLog = (field,value) => update({[field]:{...data[field],[selectedDate]:value}})
  const setTrackerNote = (value) => {
    if (activeTracker.id === 'gym') updateLog('workoutLogs',value)
    else if (activeTracker.id === 'food') updateLog('foodLogs',value)
    else update({dailyEntries:{...data.dailyEntries,[selectedDate]:{...(data.dailyEntries[selectedDate] || {}),[activeTracker.id]:value}}})
  }
  const trackerNote = activeTracker.id === 'gym' ? (data.workoutLogs[selectedDate] || '')
    : activeTracker.id === 'food' ? (data.foodLogs[selectedDate] || '')
    : (data.dailyEntries[selectedDate]?.[activeTracker.id] || '')
  const trackerPlaceholder = activeTracker.id === 'gym' ? 'Workout details, exercises, sets, reps, weights…'
    : activeTracker.id === 'food' ? 'Meals, protein, water, supplements…'
    : `What did you do for ${activeTracker.name.toLowerCase()} today?`

  const monthYear = month.toLocaleDateString(undefined,{month:'long',year:'numeric'})
  const daysInMonth = new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
  const firstDay = new Date(month.getFullYear(),month.getMonth(),1).getDay()
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`
  const monthCount = activeTrackerDays.filter(k => k.startsWith(monthPrefix)).length
  const streak = useMemo(() => {
    const marked = new Set(activeTrackerDays)
    let d = new Date(); let count = 0
    if (!marked.has(todayKey())) d.setDate(d.getDate()-1)
    while (marked.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)) {
      count++; d.setDate(d.getDate()-1)
    }
    return count
  },[activeTrackerDays.join('|')])
  const loggedDays = activeTrackerDays.length
  const thisMonthPercent = Math.round(monthCount / daysInMonth * 100)

  const addSection = () => {
    const name = newSection.trim()
    if (!name) return
    const id = `section-${Date.now()}`
    update({sections:[...data.sections,{id,name,icon:'Activity',color:'#b18bd4',archived:false}]})
    setActiveTrackerId(id); setView('dashboard'); setNewSection(''); setShowAdd(false)
  }
  const saveSection = (id,patch) => update({sections:data.sections.map(s => s.id===id?{...s,...patch}:s)})
  const removeSection = (id) => {
    if (!confirm('Permanently delete this section and its recorded entries? Export a backup first if you may need this data.')) return
    const entries = {...data.dailyEntries}
    Object.keys(entries).forEach(k => { const day={...entries[k]}; delete day[id]; entries[k]=day })
    const trackerDays={...(data.trackerDays || {})}; delete trackerDays[id]
    update({sections:data.sections.filter(s=>s.id!==id),dailyEntries:entries,trackerDays})
    if (activeTrackerId===id) setActiveTrackerId('gym')
  }
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`gym-tracker-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(url)
    setBackupMessage('Backup downloaded.')
  }
  const importBackup = async (file) => {
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || !parsed.gymDays || !parsed.sections || !parsed.dailyEntries) throw new Error('This does not look like a valid Gym Tracker backup.')
      if (!confirm('Import this backup and replace the current cloud tracker data? This cannot be undone. Export your current data first.')) return
      const next={...emptyData(),...parsed}
      delete next.exportedAt; delete next.updatedAt
      update(next)
      setBackupMessage('Backup imported. It will sync to your account.')
    } catch(e) { setBackupMessage(e.message) }
  }
  const handleLogin = async () => {
    setError('')
    try { await signInWithPopup(auth,googleProvider) }
    catch(e) { setError(e.code === 'auth/unauthorized-domain' ? 'Add this website domain to Firebase Authentication → Settings → Authorized domains.' : e.message) }
  }
  const handleLogout = async () => { await signOut(auth); setData(emptyData()); setCloudReady(false); setView('dashboard') }

  if (!configured) return <SetupScreen />
  if (authLoading) return <div className="center-screen"><LoaderCircle className="spin"/><p>Checking your account…</p></div>
  if (!user) return <LoginScreen onLogin={handleLogin} error={error}/>
  if (!cloudReady) return <div className="center-screen"><LoaderCircle className="spin"/><p>Connecting your private tracker…</p>{error && <small className="error-text">{error}</small>}</div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Dumbbell size={22}/></div><div><strong>FORM<span>.</span></strong><small>PERSONAL TRACKER</small></div></div>
      <div className="side-label tracker-nav-label">MY TRACKERS</div>
      {activeSections.map(section=><button key={section.id} className={`side-link tracker-link ${view==='dashboard' && activeTrackerId===section.id?'active':''}`} onClick={()=>{setActiveTrackerId(section.id);setView('dashboard')}}><Activity size={18}/> {section.name}</button>)}
      <button className={`side-link ${view==='history'?'active':''}`} onClick={()=>setView('history')}><CalendarDays size={18}/> Activity history</button>
      <button className={`side-link ${view==='settings'?'active':''}`} onClick={()=>setView('settings')}><Settings size={18}/> Settings</button>
      <div className="sidebar-bottom">
        <div className="sync-pill">{syncState==='syncing'?<LoaderCircle size={14} className="spin"/>:syncState==='error'?<CloudOff size={14}/>:<Cloud size={14}/>} {syncState==='syncing'?'Syncing':syncState==='error'?'Sync issue':'Cloud synced'}</div>
        <div className="user-mini"><img src={user.photoURL || ''} alt="" referrerPolicy="no-referrer"/><div className="user-mini-text"><b>{user.displayName || 'My account'}</b><small>{user.email}</small></div><button title="Sign out" onClick={handleLogout}><LogOut size={16}/></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">YOUR PERSONAL SPACE</span><h1>{view==='dashboard'?`${activeTracker.name} Tracker`:view==='history'?`${activeTracker.name} History`:'Settings'}</h1></div><div className="top-actions"><span className="today-chip"><Clock3 size={15}/>{dateLabel(todayKey())}</span><button className="icon-btn" title="Toggle theme" onClick={()=>update({theme:data.theme==='dark'?'light':'dark'})}>{data.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div></header>
      {error && <div className="notice error-notice">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}

      {view==='dashboard' && <div className="page-content">
        <section className="welcome-row"><div><span className="eyebrow">CONSISTENCY OVER INTENSITY</span><h2>Make time for <em>{activeTracker.name.toLowerCase()}.</em></h2><p>Track your {activeTracker.name.toLowerCase()} progress one day at a time. Select a date and record what you did.</p></div><div className="welcome-icon"><Activity size={34}/></div></section>
        <section className="stats-grid">
          <Stat icon={<Dumbbell/>} label={`${activeTracker.name.toUpperCase()} DAYS THIS MONTH`} value={monthCount}/>
          <Stat icon={<BarChart3/>} label="MONTHLY CONSISTENCY" value={`${thisMonthPercent}%`}/>
          <Stat icon={<Flame/>} label="CURRENT STREAK" value={`${streak} days`}/>
          <Stat icon={<CalendarDays/>} label="TOTAL TRACKED DAYS" value={loggedDays}/>
        </section>
        <div className="dashboard-grid">
          <section className="panel calendar-panel">
            <div className="panel-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h3>{activeTracker.name} calendar</h3></div><div className="calendar-controls"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button><b>{monthYear}</b><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button></div></div>
            <div className="calendar-grid">{['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=><div className="weekday" key={d}>{d}</div>)}{Array.from({length:firstDay},(_,i)=><div key={`blank${i}`}/>)}{Array.from({length:daysInMonth},(_,i)=>{const d=i+1,key=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return <button key={key} className={`day ${isMarked(key)?'done':''} ${selectedDate===key?'selected':''} ${key===todayKey()?'today':''}`} onClick={()=>setSelectedDate(key)} onDoubleClick={()=>toggleTrackerDay(key)} title={`Select day; double-click to mark ${activeTracker.name.toLowerCase()} complete`}>{d}</button>})}</div>
            <div className="calendar-foot"><span><i className="legend-dot gold"/> {activeTracker.name} day</span><span><i className="legend-dot outline"/> Selected date</span><small>Double-click a date to mark or unmark this tracker.</small></div>
          </section>
          <section className="panel daily-panel">
            <div className="panel-heading"><div><span className="eyebrow">DAILY JOURNAL</span><h3>Your daily log</h3></div><span className="date-badge">{selectedDate}</span></div>
            <div className="selected-date">{dateLabel(selectedDate)}</div>
            <div className="tracker-completion-row"><div><b>{activeTracker.name} completed?</b><small>Mark this date as a day you showed up.</small></div><button className={`completion-toggle ${isMarked(selectedDate)?'is-complete':''}`} onClick={()=>toggleTrackerDay(selectedDate)}>{isMarked(selectedDate)?<><Check size={16}/> Completed</>:<><Plus size={16}/> Mark complete</>}</button></div>
            <label className="field-label">{activeTracker.name} notes</label><textarea value={trackerNote} onChange={e=>setTrackerNote(e.target.value)} placeholder={trackerPlaceholder}/>
            <div className="daily-bottom"><span><ShieldCheck size={14}/> Private to your Google account</span><span>{syncState==='syncing'?'Saving…':'Changes sync automatically'}</span></div>
          </section>
        </div>
      </div>}

      {view==='history' && <div className="page-content"><section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR RECORDS</span><h3>Recent activity</h3></div></div>{activeTrackerDays.sort((a,b)=>b.localeCompare(a)).slice(0,60).map(k=><button className="history-row" key={k} onClick={()=>{setSelectedDate(k);setMonth(new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1));setView('dashboard')}}><span className="history-date"><b>{Number(k.slice(8,10))}</b><small>{new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,Number(k.slice(8,10))).toLocaleDateString(undefined,{month:'short',year:'numeric'})}</small></span><span><strong>{activeTracker.name} day</strong><small>{activeTracker.id==='gym'?(data.workoutLogs[k]||'Completed') : activeTracker.id==='food'?(data.foodLogs[k]||'Completed'):(data.dailyEntries[k]?.[activeTracker.id]||'Completed')}</small></span><CheckCircle2 className="history-check"/></button>)}{loggedDays===0&&<div className="empty-state">No {activeTracker.name.toLowerCase()} days recorded yet. Mark a date complete to get started.</div>}</section></div>}

      {view==='settings' && <div className="page-content settings-layout">
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h3>Manage sections</h3><p className="panel-subtitle">Add a tracker such as Reading, Gym, Meditation or Sleep. Each tracker gets its own calendar, notes, history and statistics.</p></div><button className="primary-btn" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add section</button></div>
          {showAdd&&<div className="add-section"><input autoFocus value={newSection} onChange={e=>setNewSection(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSection()} placeholder="e.g. Reading, Sleep, Meditation"/><button className="primary-btn" onClick={addSection}>Add</button><button className="icon-btn" onClick={()=>setShowAdd(false)}><X size={17}/></button></div>}
          <div className="section-list">{data.sections.map(s=><div className={`section-row ${s.archived?'archived':''}`} key={s.id}><span className="section-color" style={{background:s.color}}/><div className="section-name">{editingSection===s.id?<input defaultValue={s.name} autoFocus onBlur={e=>{saveSection(s.id,{name:e.target.value.trim()||s.name});setEditingSection(null)}} onKeyDown={e=>e.key==='Enter'&&e.currentTarget.blur()}/>:<><b>{s.name}</b><small>{s.archived?'Archived':'Active tracker section'}</small></>}</div><button className="icon-btn" title="Rename" onClick={()=>setEditingSection(s.id)}><Pencil size={16}/></button><button className="icon-btn" title={s.archived?'Restore':'Archive'} onClick={()=>saveSection(s.id,{archived:!s.archived})}>{s.archived?<Check size={16}/>:<X size={16}/>}</button><button className="icon-btn danger" title="Delete permanently" onClick={()=>removeSection(s.id)}><Trash2 size={16}/></button></div>)}</div>
        </section>
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR DATA</span><h3>Backup & recovery</h3><p className="panel-subtitle">Keep an offline copy of your tracker history.</p></div></div><div className="backup-actions"><button className="secondary-btn" onClick={exportBackup}><Download size={17}/> Export JSON backup</button><button className="secondary-btn" onClick={()=>fileInput.current?.click()}><Upload size={17}/> Import backup</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e=>e.target.files?.[0]&&importBackup(e.target.files[0])}/></div>{backupMessage&&<p className="backup-message">{backupMessage}</p>}<p className="settings-note">Your records are stored in Firestore under your signed-in Google account. The browser also keeps an offline cache to support connectivity interruptions.</p></section>
        <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNT</span><h3>Google account</h3></div></div><div className="account-row"><img src={user.photoURL||''} alt="" referrerPolicy="no-referrer"/><div><b>{user.displayName}</b><small>{user.email}</small></div><button className="secondary-btn" onClick={handleLogout}><LogOut size={16}/> Sign out</button></div></section>
      </div>}
      <footer className="footer-note">BUILT FOR YOUR CONSISTENCY <span>•</span> YOUR DATA, YOUR JOURNEY</footer>
    </main>
  </div>
}

function Stat({icon,label,value}) { return <div className="stat-card"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div> }
function LoginScreen({onLogin,error}) { return <div className="login-screen"><div className="login-card"><div className="brand login-brand"><div className="brand-mark"><Dumbbell size={24}/></div><div><strong>FORM<span>.</span></strong><small>PERSONAL TRACKER</small></div></div><div className="login-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><Dumbbell size={54}/></div><span className="eyebrow">YOUR PERSONAL TRAINING JOURNAL</span><h1>Progress is<br/><em>personal.</em></h1><p>Keep your workouts, daily notes and habits in one private space. Sign in to sync your progress across devices.</p><button className="google-btn" onClick={onLogin}><GoogleMark/> Continue with Google</button>{error&&<div className="login-error">{error}</div>}<small className="privacy-line"><ShieldCheck size={14}/> Private to your Google account</small></div><div className="login-side-copy">SHOW UP. KEEP TRACK. GET STRONGER.</div></div> }
function SetupScreen() { return <div className="center-screen setup-screen"><div className="brand-mark"><Dumbbell size={24}/></div><h2>Connect your Firebase project</h2><p>Copy <code>.env.example</code> to <code>.env</code>, add your Firebase web app configuration, then restart the development server.</p><ol><li>Create a Firebase project on the Spark plan.</li><li>Enable Google in Authentication.</li><li>Create Firestore and publish <code>firestore.rules</code>.</li><li>Fill in all <code>VITE_FIREBASE_*</code> values.</li></ol></div> }
function GoogleMark(){return <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.11 7.14-10.16 7.14-17.56z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.84 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}
