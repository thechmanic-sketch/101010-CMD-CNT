require('dotenv').config();
const express    = require('express');
const path       = require('path');
const cron       = require('node-cron');
const https      = require('https');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3010;
const TZ   = process.env.TIMEZONE || 'Africa/Johannesburg';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// ─── MongoDB ──────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || '';
let db, col;

async function connectDB() {
  if (!MONGO_URI) { console.log('[DB] No MONGODB_URI — using in-memory fallback'); return; }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db  = client.db('101010');
    col = db.collection('appdata');
    console.log('[DB] MongoDB connected ✅');
  } catch(e) { console.error('[DB] Connection failed:', e.message); }
}

let memData = null;
async function readData() {
  if (!col) return memData || freshData();
  try {
    const doc = await col.findOne({ _id: 'main' });
    return doc ? doc.data : freshData();
  } catch(e) { return memData || freshData(); }
}
async function writeData(d) {
  memData = d;
  if (!col) return;
  try { await col.replaceOne({ _id: 'main' }, { _id: 'main', data: d }, { upsert: true }); }
  catch(e) { console.error('[DB] Write error:', e.message); }
}

function freshData() {
  return {
    days: {}, weeklyPlans: {}, projects: [],
    config: {
      habits: ['Morning planning done', 'Exercise', 'Reading', 'Deep work block'],
      goals: { 'Deep Work': 240, 'Meetings': 120, 'Email/Comms': 60 },
      categories: [
        { name:'Deep Work',   color:'#E8863C' }, { name:'Meetings',    color:'#5B9BD5' },
        { name:'Email/Comms', color:'#52D3AA' }, { name:'Admin',       color:'#C4A35A' },
        { name:'Learning',    color:'#7CC674' }, { name:'Break',       color:'#B07FD8' }
      ]
    },
    streaks: {}
  };
}

// ─── Telegram ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const TG_READY  = BOT_TOKEN && !BOT_TOKEN.includes('YOUR_') && CHAT_ID;

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    if (!TG_READY) {
      console.log('\n[Telegram simulated]\n' + text + '\n');
      resolve({ simulated: true, preview: text });
      return;
    }
    const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' });
    const req  = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { const r = JSON.parse(raw); r.ok ? resolve(r) : reject(new Error(r.description)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2,'0');
function todayStr(off=0) {
  const d = new Date(); d.setDate(d.getDate()+off);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function durMin(s,e) {
  if(!s||!e) return 0;
  const [sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);
  let a=sh*60+sm,b=eh*60+em; if(b<a) b+=1440; return b-a;
}
function fmtDur(m) { const h=Math.floor(m/60),mm=m%60; return h>0?`${h}h ${pad(mm)}m`:`${mm}m`; }
function projectProgress(p) {
  const parts=p.parts||[]; if(!parts.length) return 0;
  return Math.round(parts.filter(x=>x.status==='done').length/parts.length*100);
}
function progressBar(pct,len=10) {
  const f=Math.round(pct/100*len);
  return '█'.repeat(f)+'░'.repeat(len-f)+` ${pct}%`;
}

// ─── Message builders ─────────────────────────────────────────────────
function buildMorning(d) {
  const today=todayStr(), yesterday=todayStr(-1);
  const yDay=d.days[yesterday]||{}, todayDay=d.days[today]||{};
  const yEntries=yDay.entries||[];
  const yTotal=yEntries.reduce((a,e)=>a+durMin(e.start,e.end),0);
  const yStats=yEntries.length?`${fmtDur(yTotal)} logged · ${yEntries.length} entries`:'Nothing logged';
  const carryOver=(yDay.dailyPlan?.tasks||[]).filter(t=>!t.done);
  const carryText=carryOver.length
    ?carryOver.map(t=>`  ↩️ ${t.name}${t.dueTime?' (was due '+t.dueTime+')':''}`).join('\n')
    :'  None — clean slate! ✅';
  const todayTasks=todayDay.dailyPlan?.tasks||[];
  const taskText=todayTasks.length
    ?todayTasks.filter(t=>!t.done).map(t=>`  ${t.priority==='high'?'🔴':t.priority==='med'?'🟡':'🟢'} ${t.name}${t.dueTime?' — due '+t.dueTime:''}`).join('\n')
    :'  (Open the app to plan your day)';
  const projects=(d.projects||[]).filter(p=>p.status==='active');
  const projText=projects.length
    ?projects.map(p=>{
      const pct=projectProgress(p),done=p.parts.filter(x=>x.status==='done').length;
      const dueToday=p.parts.filter(x=>x.dueDate===today&&x.status!=='done');
      return `  *${p.name}*: ${progressBar(pct,8)} (${done}/${p.parts.length})${dueToday.length?` ⚠️ ${dueToday.length} due today`:''}`;
    }).join('\n')
    :'  No active projects';
  const top3=(todayDay.top3||[]).filter(Boolean);
  const top3Text=top3.length?top3.map((t,i)=>`  ${i+1}. ${t}`).join('\n'):'  _(not set)_';
  const habits=d.config?.habits||[], streaks=d.streaks||{};
  const streakText=habits.map(h=>`  ${(streaks[h]||0)>=7?'🔥🔥':(streaks[h]||0)>=3?'🔥':'▫️'} ${h}: ${streaks[h]||0}d`).join('\n');
  return [
    `🔟 *101010 Command Center*`,`📅 *5:30am Briefing — ${today}*`,``,
    `📊 *Yesterday:* ${yStats}`,``,`↩️ *Carry-overs:*`,carryText,``,
    `🎯 *Today's Planned Tasks:*`,taskText,``,`🚀 *Project Progress:*`,projText,``,
    `⭐ *Top 3 Priorities:*`,top3Text,
    streakText?`\n🔥 *Habit Streaks:*\n${streakText}`:'',``,
    `Open → ${APP_URL}`,`_Make today count. 🔟_`
  ].filter(x=>x!==null).join('\n');
}

function buildWeekly(d) {
  const days=Array.from({length:7},(_,i)=>todayStr(-i-1));
  let totalMin=0,totalEntries=0,ratingSum=0,ratingCount=0;
  const catTotals={},wins=[],blockers=[];
  days.forEach(day=>{
    const dd=d.days[day]||{};
    (dd.entries||[]).forEach(e=>{const m=durMin(e.start,e.end);totalMin+=m;totalEntries++;catTotals[e.category]=(catTotals[e.category]||0)+m;});
    if(dd.reflection?.wins)wins.push(dd.reflection.wins);
    if(dd.reflection?.blockers)blockers.push(dd.reflection.blockers);
    if(dd.reflection?.rating){ratingSum+=dd.reflection.rating;ratingCount++;}
  });
  const catLines=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,m])=>`  ${c}: ${fmtDur(m)}`).join('\n');
  const avg=ratingCount?(ratingSum/ratingCount).toFixed(1):'—';
  const projects=(d.projects||[]).filter(p=>p.status==='active');
  const projLines=projects.map(p=>`  *${p.name}*: ${progressBar(projectProgress(p),8)}`).join('\n');
  return [
    `🔟 *101010 Command Center*`,`📋 *Sunday Weekly Review*`,``,
    `⏱ *This Week:*`,`  Total: ${fmtDur(totalMin)} · ${totalEntries} entries`,`  Avg productivity: ${avg}/5`,
    catLines?`\n📂 *By Category:*\n${catLines}`:'',
    projLines?`\n🚀 *Project Progress:*\n${projLines}`:'',
    wins.length?`\n✅ *Wins:*\n${wins.slice(-3).map(w=>`  • ${w}`).join('\n')}`:'',
    blockers.length?`\n⚠️ *Blockers:*\n${blockers.slice(-3).map(b=>`  • ${b}`).join('\n')}`:'',
    ``,`🔮 Plan next week → ${APP_URL}`,`_Review. Reflect. Reset. 🔟_`
  ].filter(Boolean).join('\n');
}

// ─── Scheduled jobs ───────────────────────────────────────────────────
cron.schedule('30 5 * * *', async () => {
  console.log('[CRON] 5:30am daily briefing...');
  sendTelegram(buildMorning(await readData())).catch(e=>console.error('[CRON]',e.message));
}, { timezone: TZ });

cron.schedule('0 18 * * 0', async () => {
  console.log('[CRON] Sunday 6pm weekly review...');
  sendTelegram(buildWeekly(await readData())).catch(e=>console.error('[CRON]',e.message));
}, { timezone: TZ });

cron.schedule('* * * * *', async () => {
  const now=new Date(), tgt=now.getHours()*60+now.getMinutes()+60;
  if(tgt>=1440) return;
  const tgtStr=`${pad(Math.floor(tgt/60))}:${pad(tgt%60)}`;
  const d=await readData(), today=todayStr();
  const tasks=d.days[today]?.dailyPlan?.tasks||[];
  let changed=false;
  tasks.forEach(task=>{
    if(!task.done&&!task.reminderSent&&task.dueTime===tgtStr){
      const projName=task.projectId?(d.projects||[]).find(p=>p.id===task.projectId)?.name||'':'';
      sendTelegram(`⏰ *101010 — Task Reminder*\n\n*${task.name}*\nDue at: ${task.dueTime}${projName?`\nProject: ${projName}`:''}\n\n${APP_URL}`).catch(e=>console.error('[REMINDER]',e.message));
      task.reminderSent=true; changed=true;
    }
  });
  if(changed) await writeData(d);
}, { timezone: TZ });

// ─── API ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data',  async (_,res) => res.json(await readData()));
app.post('/api/data', async (req,res) => {
  try { await writeData(req.body); res.json({ok:true}); }
  catch(e) { res.status(500).json({error:e.message}); }
});
app.post('/api/test-telegram', async (req,res) => {
  const type=req.body?.type||'morning', d=await readData();
  const text=type==='weekly'?buildWeekly(d):buildMorning(d);
  try { const r=await sendTelegram(text); res.json({ok:true,simulated:r?.simulated||false,preview:text}); }
  catch(e) { res.status(500).json({error:e.message}); }
});

// ─── Start ────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🔟  101010 Command Center v3`);
    console.log(`    ${APP_URL}`);
    console.log(`    Timezone : ${TZ}`);
    console.log(`    Telegram : ${TG_READY?'✅ configured':'⚠️  add credentials to .env'}`);
    console.log(`    Database : ${MONGO_URI?'MongoDB ✅':'in-memory (add MONGODB_URI)'}`);
    console.log(`    Alerts   : 5:30am daily · 6pm Sundays · task reminders every minute\n`);
  });
});
