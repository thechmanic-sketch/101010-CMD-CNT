require('dotenv').config();
const express    = require('express');
const path       = require('path');
const cron       = require('node-cron');
const https      = require('https');
const { MongoClient } = require('mongodb');

const app     = express();
const PORT    = process.env.PORT    || 3010;
const TZ      = process.env.TIMEZONE || 'Africa/Johannesburg';
const APP_URL = process.env.APP_URL  || `http://localhost:${PORT}`;

// ─── MongoDB ──────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || '';
let col;
async function connectDB() {
  if (!MONGO_URI) { console.log('[DB] No URI — in-memory mode'); return; }
  try {
    const client = new MongoClient(MONGO_URI, {
      tls: true,
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await client.connect();
    col = client.db('101010').collection('appdata');
    console.log('[DB] MongoDB connected ✅');
  } catch(e) {
    console.error('[DB] Connection failed:', e.message);
    console.log('[DB] Retrying in 10 seconds...');
    setTimeout(connectDB, 10000);
  }
}
let _mem = null;
async function readData() {
  if (!col) return _mem || freshData();
  try { const d = await col.findOne({_id:'main'}); return d ? d.data : freshData(); }
  catch(e) { return _mem || freshData(); }
}
async function writeData(d) {
  _mem = d;
  if (!col) return;
  try { await col.replaceOne({_id:'main'},{_id:'main',data:d},{upsert:true}); }
  catch(e) { console.error('[DB write]', e.message); }
}
function freshData() {
  return {
    days:{}, weeklyPlans:{}, projects:[], books:[], events:[], contacts:[], ideas:[],
    activeTimer: null,
    config:{
      habits:['Morning planning done','Prayer & Scripture','Exercise','Reading','Deep work block'],
      goals:{'Deep Work':240,'Meetings':120,'Email/Comms':60},
      readingGoal: 20,
      categories:[
        {name:'Deep Work',color:'#E8943C'},{name:'Meetings',color:'#5B9BD5'},
        {name:'Email/Comms',color:'#52D3AA'},{name:'Admin',color:'#C4A35A'},
        {name:'Learning',color:'#7CC674'},{name:'Break',color:'#B07FD8'}
      ]
    },
    streaks:{}
  };
}

// ─── 31 Daily Quotes ──────────────────────────────────────────────────
const QUOTES = [
  "The secret of getting ahead is getting started. — Mark Twain",
  "Hard work beats talent when talent doesn't work hard. — Tim Notke",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. — Churchill",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
  "Dreams don't work unless you do. — John C. Maxwell",
  "The only way to do great work is to love what you do. — Steve Jobs",
  "Push yourself, because no one else is going to do it for you.",
  "Great things never come from comfort zones.",
  "Wake up with determination. Go to bed with satisfaction.",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Don't stop when you're tired. Stop when you're done.",
  "Success is the sum of small efforts repeated day in and day out. — Robert Collier",
  "The difference between ordinary and extraordinary is that little extra.",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Your only limit is your mind.",
  "Do something today that your future self will thank you for.",
  "Little by little, a little becomes a lot.",
  "The expert in anything was once a beginner.",
  "Consistency is what transforms average into excellence.",
  "Start where you are. Use what you have. Do what you can. — Arthur Ashe",
  "The man who moves a mountain begins by carrying away small stones. — Confucius",
  "Success usually comes to those who are too busy to be looking for it. — Thoreau",
  "The only place where success comes before work is in the dictionary. — Vidal Sassoon",
  "Opportunities don't happen. You create them. — Chris Grosser",
  "Don't count the days, make the days count. — Muhammad Ali",
  "You are never too old to set another goal or to dream a new dream. — C.S. Lewis",
  "Act as if what you do makes a difference. It does. — William James",
  "Energy and persistence conquer all things. — Benjamin Franklin",
  "The future depends on what you do today. — Mahatma Gandhi"
];

// ─── 14 Rotating 9pm Strength Messages ───────────────────────────────
const STRENGTH_MSGS = [
  `🙏 *Evening Strength*\n\n_"Be sober-minded; be watchful. Your adversary prowls around like a roaring lion — resist him, firm in your faith."_\n— 1 Peter 5:8\n\nYou are stronger than your temptations. End this day with integrity. 💪`,
  `🙏 *Evening Strength*\n\n_"No temptation has overtaken you that is not common to man. God is faithful — He will provide a way of escape."_\n— 1 Corinthians 10:13\n\nThere is always a way out. Choose it tonight. 🔟`,
  `🙏 *Evening Strength*\n\n_"Submit yourselves to God. Resist the devil, and he will flee from you."_\n— James 4:7\n\nYour authority over temptation comes from God. Use it. 🛡️`,
  `🙏 *Evening Strength*\n\n_"I can do all things through Christ who strengthens me."_\n— Philippians 4:13\n\nThis includes saying no to what weakens you. Stay strong tonight. ✊`,
  `🙏 *Evening Strength*\n\n_"Greater is He that is in you than he that is in the world."_\n— 1 John 4:4\n\nThe power inside you is greater than any temptation outside you. 🔥`,
  `🙏 *Evening Strength*\n\n_"Walk in the Spirit, and you will not gratify the desires of the flesh."_\n— Galatians 5:16\n\nChoose Spirit over flesh tonight. Your tomorrow thanks you. 🌙`,
  `🙏 *Evening Strength*\n\n_"Put on the full armor of God so that you can stand against the devil's schemes."_\n— Ephesians 6:11\n\nYou are equipped. Stand firm tonight. ⚔️`,
  `🙏 *Evening Strength*\n\n_"Blessed is the man who remains steadfast under trial, for when he has stood the test he will receive the crown of life."_\n— James 1:12\n\nYour steadfastness tonight builds your crown. 👑`,
  `🙏 *Evening Strength*\n\n_"Create in me a clean heart, O God, and renew a right spirit within me."_\n— Psalm 51:10\n\nEnd this day with a prayer for renewal. You are not defined by your struggles. 💎`,
  `🙏 *Evening Strength*\n\n_"Your word I have hidden in my heart, that I might not sin against You."_\n— Psalm 119:11\n\nThe Word you've stored will protect you in moments of weakness. Trust it. 📖`,
  `🙏 *Evening Strength*\n\n_"The Lord is faithful. He will establish you and guard you against evil."_\n— 2 Thessalonians 3:3\n\nYou are guarded. Rest in that truth tonight. 🕊️`,
  `🙏 *Evening Strength*\n\n_"You were bought with a price. Honor God with your body and your choices."_\n— 1 Corinthians 6:20\n\nYou are valuable. Live like it tonight. 🔟`,
  `🙏 *Evening Strength*\n\n_"The night is nearly over; the day is almost here. So let us put aside the deeds of darkness."_\n— Romans 13:12\n\nChoose light over darkness as you close this day. 🌟`,
  `🙏 *Evening Strength*\n\n_"He who began a good work in you will carry it on to completion."_\n— Philippians 1:6\n\nGod is not done with you. Neither should you be. Stay the course tonight. 🔟`
];

// ─── Telegram ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const TG_READY  = BOT_TOKEN && !BOT_TOKEN.includes('YOUR_') && CHAT_ID;

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    if (!TG_READY) { console.log('\n[TG sim]\n'+text+'\n'); resolve({simulated:true,preview:text}); return; }
    const body = JSON.stringify({chat_id:CHAT_ID, text, parse_mode:'Markdown'});
    const req  = https.request({
      hostname:'api.telegram.org', path:`/bot${BOT_TOKEN}/sendMessage`,
      method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    }, res => {
      let raw=''; res.on('data',d=>raw+=d);
      res.on('end',()=>{ try{const r=JSON.parse(raw);r.ok?resolve(r):reject(new Error(r.description));}catch(e){reject(e);} });
    });
    req.on('error',reject); req.write(body); req.end();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2,'0');
function todayStr(off=0){const d=new Date();d.setDate(d.getDate()+off);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function durMin(s,e){if(!s||!e)return 0;const[sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);let a=sh*60+sm,b=eh*60+em;if(b<a)b+=1440;return b-a;}
function fmtDur(m){const h=Math.floor(m/60),mm=m%60;return h>0?`${h}h ${pad(mm)}m`:`${mm}m`;}
function projectProgress(p){const pts=p.parts||[];if(!pts.length)return 0;return Math.round(pts.filter(x=>x.status==='done').length/pts.length*100);}
function progressBar(pct,len=10){const f=Math.round(pct/100*len);return '█'.repeat(f)+'░'.repeat(len-f)+` ${pct}%`;}
function getDayQuote(){return QUOTES[(new Date().getDate()-1)%31];}
function getStrengthMsg(){const d=new Date();const idx=(Math.floor(d.getTime()/86400000))%STRENGTH_MSGS.length;return STRENGTH_MSGS[idx];}

// ─── Message builders ─────────────────────────────────────────────────
function buildMorning(d) {
  const today=todayStr(),yesterday=todayStr(-1);
  const yDay=d.days[yesterday]||{},todayDay=d.days[today]||{};
  const yEntries=yDay.entries||[];
  const yTotal=yEntries.reduce((a,e)=>a+durMin(e.start,e.end),0);
  const yStats=yEntries.length?`${fmtDur(yTotal)} · ${yEntries.length} entries`:'Nothing logged';
  const carryOver=(yDay.dailyPlan?.tasks||[]).filter(t=>!t.done);
  const carryText=carryOver.length?carryOver.map(t=>`  ↩️ ${t.name}${t.startTime?' @ '+t.startTime:''}`).join('\n'):'  Clean slate ✅';
  const tasks=(todayDay.dailyPlan?.tasks||[]).filter(t=>!t.done);
  const taskText=tasks.length?tasks.map(t=>`  ${t.priority==='high'?'🔴':t.priority==='med'?'🟡':'🟢'} ${t.name}${t.startTime?' @ '+t.startTime:''}`).join('\n'):'  (Open app to plan your day)';
  const projects=(d.projects||[]).filter(p=>p.status==='active');
  const projText=projects.length?projects.map(p=>{
    const pct=projectProgress(p),done=p.parts.filter(x=>x.status==='done').length;
    const due=p.parts.filter(x=>x.dueDate===today&&x.status!=='done');
    return `  *${p.name}*: ${progressBar(pct,8)} (${done}/${p.parts.length})${due.length?` ⚠️ ${due.length} due today`:''}`;
  }).join('\n'):'  No active projects';
  const top3=(todayDay.top3||[]).filter(Boolean);
  const top3Text=top3.length?top3.map((t,i)=>`  ${i+1}. ${t}`).join('\n'):'  _(not set)_';
  const habits=d.config?.habits||[],streaks=d.streaks||{};
  const streakText=habits.map(h=>`  ${(streaks[h]||0)>=7?'🔥🔥':(streaks[h]||0)>=3?'🔥':'▫️'} ${h}: ${streaks[h]||0}d`).join('\n');
  const todayBook=(d.books||[]).find(b=>b.isPrimary&&b.status==='reading');
  const bookText=todayBook?`\n📖 *Reading:* ${todayBook.title} — target ${todayBook.dailyGoal||d.config?.readingGoal||20} pages today`:'';
  const quote=getDayQuote();
  return [
    `🔟 *101010 Command Center*`,
    `📅 *5:30am Briefing — ${today}*`,
    `_Powered by Techmanic_`,``,
    `💬 *"${quote}"*`,``,
    `📊 *Yesterday:* ${yStats}`,``,
    `↩️ *Carry-overs:*`,carryText,``,
    `🎯 *Today's Tasks:*`,taskText,``,
    `🚀 *Projects:*`,projText,``,
    `⭐ *Top 3:*`,top3Text,
    bookText,
    streakText?`\n🔥 *Streaks:*\n${streakText}`:'',``,
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
  const pagesRead=(d.books||[]).reduce((a,b)=>{
    const weekSessions=(b.sessions||[]).filter(s=>days.includes(s.date));
    return a+weekSessions.reduce((x,s)=>x+(s.pagesRead||0),0);
  },0);
  return [
    `🔟 *101010 Command Center*`,`📋 *Sunday Weekly Review*`,`_Powered by Techmanic_`,``,
    `⏱ *This Week:*`,`  Total: ${fmtDur(totalMin)} · ${totalEntries} entries`,`  Avg productivity: ${avg}/5`,
    pagesRead?`  📖 Pages read: ${pagesRead}`:'',
    catLines?`\n📂 *By Category:*\n${catLines}`:'',
    projLines?`\n🚀 *Projects:*\n${projLines}`:'',
    wins.length?`\n✅ *Wins:*\n${wins.slice(-3).map(w=>`  • ${w}`).join('\n')}`:'',
    blockers.length?`\n⚠️ *Blockers:*\n${blockers.slice(-3).map(b=>`  • ${b}`).join('\n')}`:'',``,
    `🔮 Plan next week → ${APP_URL}`,`_Review. Reflect. Reset. 🔟_`
  ].filter(Boolean).join('\n');
}

function buildDailyReview() {
  return [
    `🌙 *101010 — Daily Review Time*`,`_Powered by Techmanic_`,``,
    `It's 10:30pm. Take 5 minutes to close your day:`,``,
    `✅ Did you complete your Top 3?`,
    `📊 Log your EOD reflection in the app`,
    `🙏 Set your prayer intention for tomorrow`,
    `⭐ Set your Top 3 priorities for tomorrow`,
    `📖 Log your reading session`,
    `💧 Did you drink enough water today?`,``,
    `Open → ${APP_URL}`,`_End well. Start better. 🔟_`
  ].join('\n');
}

// ─── Scheduled jobs ────────────────────────────────────────────────────
// 5:30am daily briefing
cron.schedule('30 5 * * *', async()=>{
  console.log('[CRON] 5:30am...');
  sendTelegram(buildMorning(await readData())).catch(e=>console.error('[CRON]',e.message));
},{timezone:TZ});

// 9pm strength message
cron.schedule('0 21 * * *', ()=>{
  console.log('[CRON] 9pm strength...');
  sendTelegram(getStrengthMsg()).catch(e=>console.error('[CRON]',e.message));
},{timezone:TZ});

// 10:30pm daily review
cron.schedule('30 22 * * *', ()=>{
  console.log('[CRON] 10:30pm review...');
  sendTelegram(buildDailyReview()).catch(e=>console.error('[CRON]',e.message));
},{timezone:TZ});

// Sunday 6pm weekly review
cron.schedule('0 18 * * 0', async()=>{
  console.log('[CRON] Sunday 6pm...');
  sendTelegram(buildWeekly(await readData())).catch(e=>console.error('[CRON]',e.message));
},{timezone:TZ});

// 8pm — check for tomorrow's events
cron.schedule('0 20 * * *', async()=>{
  const d=await readData();
  const tomorrow=todayStr(1);
  const events=(d.events||[]).filter(e=>e.date===tomorrow&&!e.reminderSent);
  for(const ev of events){
    await sendTelegram(`📍 *Event Tomorrow!*\n\n*${ev.title}*\n📅 ${ev.date}${ev.time?' @ '+ev.time:''}\n📍 ${ev.location||'TBC'}${ev.travelTime?'\n🚗 Travel time: '+ev.travelTime:''}${ev.whatToBring?'\n🎒 Bring: '+ev.whatToBring:''}${ev.prepNotes?'\n📝 Prep: '+ev.prepNotes:''}\n\n${APP_URL}`).catch(e=>console.error('[EVENT]',e.message));
    ev.reminderSent=true;
  }
  if(events.length) await writeData(d);
},{timezone:TZ});

// Every minute — task start reminders (10min before), task due reminders (60min before), timer end alert (10min before)
cron.schedule('* * * * *', async()=>{
  const now=new Date();
  const nowMin=now.getHours()*60+now.getMinutes();
  const d=await readData();
  const today=todayStr();
  const tasks=d.days[today]?.dailyPlan?.tasks||[];
  let changed=false;

  tasks.forEach(task=>{
    // 10min before start
    if(task.startTime&&!task.startReminderSent&&!task.done){
      const tMin=toMin(task.startTime);
      if(tMin!==null&&tMin-nowMin===10){
        const proj=task.projectId?(d.projects||[]).find(p=>p.id===task.projectId)?.name||'':'';
        sendTelegram(`⏰ *Starting in 10 minutes!*\n\n${task.priority==='high'?'🔴':task.priority==='med'?'🟡':'🟢'} *${task.name}*\nStarts at: ${task.startTime}${proj?'\nProject: '+proj:''}\n\n${APP_URL}`).catch(e=>console.error('[REMINDER]',e.message));
        task.startReminderSent=true;changed=true;
      }
    }
    // 60min before due
    if(task.dueTime&&!task.reminderSent&&!task.done){
      const tMin=toMin(task.dueTime);
      if(tMin!==null&&tMin-nowMin===60){
        sendTelegram(`⚠️ *Due in 1 hour!*\n\n*${task.name}*\nDue at: ${task.dueTime}\n\n${APP_URL}`).catch(e=>console.error('[DUE]',e.message));
        task.reminderSent=true;changed=true;
      }
    }
  });

  // Timer end alert (10min before)
  const timer=d.activeTimer;
  if(timer&&timer.endTime&&!timer.endAlerted&&timer.date===today){
    const tMin=toMin(timer.endTime);
    if(tMin!==null&&tMin-nowMin===10){
      sendTelegram(`⏱ *Timer ending in 10 minutes!*\n\n*${timer.task||'Current task'}*\nEnds at: ${timer.endTime}\n\n${APP_URL}`).catch(e=>console.error('[TIMER]',e.message));
      timer.endAlerted=true;changed=true;
    }
  }

  if(changed) await writeData(d);
},{timezone:TZ});

function toMin(t){if(!t)return null;const[h,m]=t.split(':').map(Number);return h*60+m;}

// ─── API ──────────────────────────────────────────────────────────────
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/data',  async(_,res)=>res.json(await readData()));
app.post('/api/data', async(req,res)=>{
  try{await writeData(req.body);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/test-telegram', async(req,res)=>{
  const type=req.body?.type||'morning',d=await readData();
  const map={morning:()=>buildMorning(d),weekly:()=>buildWeekly(d),review:()=>buildDailyReview(),strength:()=>getStrengthMsg()};
  const text=(map[type]||map.morning)();
  try{const r=await sendTelegram(text);res.json({ok:true,simulated:r?.simulated||false,preview:text});}
  catch(e){res.status(500).json({error:e.message});}
});

// ─── Start ────────────────────────────────────────────────────────────
connectDB().then(()=>{
  app.listen(PORT,()=>{
    console.log(`\n🔟  101010 Command Center — Powered by Techmanic`);
    console.log(`    ${APP_URL}`);
    console.log(`    Timezone : ${TZ}`);
    console.log(`    Telegram : ${TG_READY?'✅':'⚠️  configure .env'}`);
    console.log(`    Database : ${MONGO_URI?'MongoDB ✅':'in-memory'}`);
    console.log(`    Alerts   : 5:30am · 9pm · 10:30pm · 8pm events · Sunday 6pm · per-minute reminders\n`);
  });
});
