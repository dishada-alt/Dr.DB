import React, { useMemo, useState } from 'react';

const api = 'http://localhost:8000';
const CopyBtn = ({ text }) => { const [c, setC] = useState(false); return <button className='copy' onClick={async()=>{await navigator.clipboard.writeText(text||''); setC(true); setTimeout(()=>setC(false),2000);}}>{c?'Copied!':'Copy'}</button>; };

export default function App() {
  const [onboarding, setOnboarding] = useState(true), [query, setQuery] = useState(''), [schema, setSchema] = useState('');
  const [manualTables, setManualTables] = useState({}), [diag, setDiag] = useState(null), [loading, setLoading] = useState(false), [eli5, setEli5] = useState(false);
  const [selected, setSelected] = useState([]), [chat, setChat] = useState([]), [input, setInput] = useState(''), [history, setHistory] = useState([]);
  const [showInfo, setShowInfo] = useState(false), [showHist, setShowHist] = useState(false), [showSettings, setShowSettings] = useState(false), [theme, setTheme] = useState('dark');
  const rowCounts = manualTables;
  const runDiagnosis = async() => { setLoading(true); const res = await fetch(`${api}/analyze`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query, schema: schema||null, row_counts: rowCounts})}); const d = await res.json(); setDiag(d); setSelected([]); setLoading(false); setHistory(h=>[{query, diag:d, ts:Date.now()},...h]); };
  const timeSaved = useMemo(()=>{ if(!diag) return 0; if(!Object.keys(rowCounts).length) return null; const arr=(diag.treatment_plan||[]).filter(t=> selected.length?selected.includes(t.id):true); return arr.reduce((a,b)=>a+(b.estimated_time_saved_seconds||0),0) || diag.total_estimated_time_saved_seconds || 0; },[diag,selected,rowCounts]);

  if (onboarding) return <div className='page center'><h1>Dr.DB</h1><p>Your database's personal physician</p><div className='cards'>{['Describe your patient','Share the symptoms','Receive your diagnosis'].map((t,i)=><div key={t} className='card'><h3>Step {i+1} — {t}</h3></div>)}</div><button className='primary' onClick={()=>setOnboarding(false)}>Begin Consultation →</button></div>;

  return <div className={`page ${theme}`}>
    <header><div>🩺 Dr.DB</div><div className='muted'>Your database's personal physician</div><div><button onClick={()=>setShowHist(true)}>📋</button><button onClick={()=>setShowSettings(true)}>⚙️</button><button onClick={()=>setShowInfo(true)}>?</button></div></header>
    <main><section className='left'>
      <h3>Patient Query</h3><div className='codewrap'><CopyBtn text={query}/><textarea value={query} onChange={e=>setQuery(e.target.value)} placeholder='Paste your SQL query here...'/></div>
      <h3>Patient Records (Schema)</h3><p className='muted'>Optional but recommended for accurate diagnosis</p>
      <div className='codewrap'><CopyBtn text={schema}/><textarea value={schema} onChange={e=>setSchema(e.target.value)} placeholder='Paste your CREATE TABLE statements here...'/></div>
      <button className='primary' disabled={!query.trim()} onClick={runDiagnosis}>🩺 Run Diagnosis</button>
    </section>
    <section className='right'>
      {loading && <div className='pulse'>Diagnosing your query...</div>}
      {diag?.critical_condition_detected && <div className='danger'>⛔ Critical Condition Detected<br/>{diag.message}</div>}
      {diag && !diag.critical_condition_detected && <>
        <div className='scores'><div>Current Health {diag.original_query_score}/100</div><div>→</div><div>After Treatment {diag.optimized_query_score}/100</div></div>
        <h3>⛔ Critical Conditions</h3>{(diag.critical_conditions||[]).length?diag.critical_conditions.map(c=><div className='card red' key={c.id}><b>{c.title}</b><p>{eli5?c.eli5_explanation:c.technical_explanation}</p><pre>{c.fix_sql}<CopyBtn text={c.fix_sql}/></pre><small>Diagnosis Confidence: {c.confidence}</small></div>):<div className='ok'>✅ No critical conditions detected — your query syntax is clean</div>}
        <h3>💊 Treatment Plan</h3><button onClick={()=>setSelected((diag.treatment_plan||[]).map(t=>t.id))}>Select All Treatments</button><button onClick={()=>setEli5(!eli5)}>Explain like I'm not a doctor 🔘</button>
        {(diag.treatment_plan||[]).map(t=><div className='card' key={t.id}><input type='checkbox' checked={selected.includes(t.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,t.id]:s.filter(x=>x!==t.id))}/><b>{t.title}</b><p>{eli5?t.eli5_explanation:t.technical_explanation}</p><pre>{t.migration_sql}<CopyBtn text={t.migration_sql}/></pre></div>)}
        <h3>⚡ Estimated Time Saved: {timeSaved===null?'Add row counts to see time saved estimates':`${timeSaved} seconds per query execution`}</h3>
        <h3>⚠️ Possible Errors Based on Your DB</h3>{schema?(diag.possible_errors||[]).map(w=><div className='card yellow' key={w.id}><b>{w.title}</b><p>{w.explanation}</p><small>{w.recommendation}</small></div>):<p className='muted'>Upload or paste your schema above to see database-specific risk warnings</p>}
        <Chat chat={chat} setChat={setChat} input={input} setInput={setInput} diag={diag} query={query}/>
      </>}
      <button className='outline' disabled>+ Add Data Connector 🔒</button>
    </section></main>

    {showInfo && <Modal onClose={()=>setShowInfo(false)} title='What is Dr.DB?'>Dr.DB is an AI-powered SQL query optimizer...</Modal>}
    {showHist && <Drawer side='left' onClose={()=>setShowHist(false)} title='📋 Previous History'>{history.map((h,i)=><div key={i} className='card'><div>{h.query.split('\n')[0]}</div><div>{h.diag.original_query_score} → {h.diag.optimized_query_score}</div></div>)}</Drawer>}
    {showSettings && <Drawer side='right' onClose={()=>setShowSettings(false)} title='⚙️ Settings'><button onClick={()=>setTheme('dark')}>🌙 Dark</button><button onClick={()=>setTheme('light')}>☀️ Light</button></Drawer>}
    <footer>Queries Diagnosed: {history.length}</footer>
  </div>;
}

function Chat({chat,setChat,input,setInput,diag,query}){ const send=async()=>{if(!input.trim())return; const history=[...chat,{role:'user',content:input}]; setChat(history); const r=await fetch(`${api}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:input,conversation_history:chat,original_query:query,diagnosis_summary:JSON.stringify(diag)})}); const d=await r.json(); setChat([...history,{role:'assistant',content:d.response}]); setInput('');}; return <div><h3>💬 Ask Dr.DB</h3>{chat.map((m,i)=><div key={i} className={m.role==='user'?'bubble user':'bubble bot'}>{m.role==='assistant'&&<small>🩺 Dr.DB</small>}{m.content}</div>)}<input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask a follow-up... e.g. 'why is this index needed?' or 'rewrite for PostgreSQL'"/><button onClick={send}>Send</button></div>; }
function Modal({title,children,onClose}){return <div className='overlay' onClick={onClose}><div className='modal' onClick={e=>e.stopPropagation()}><button onClick={onClose}>X</button><h3>{title}</h3><p>{children}</p><button onClick={onClose}>Got it, let's go →</button></div></div>}
function Drawer({side,title,children,onClose}){return <div className='overlay' onClick={onClose}><div className={`drawer ${side}`} onClick={e=>e.stopPropagation()}><button onClick={onClose}>X</button><h3>{title}</h3>{children}</div></div>}
