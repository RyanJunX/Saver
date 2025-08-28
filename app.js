// 攒钱小助手（本地存储版）
(function(){
  const $ = (id)=>document.getElementById(id);

  const els = {
    daily: $('dailyAmount'), start: $('startDate'), end: $('endDate'), target: $('targetAmount'),
    theme: $('theme'), calcHint: $('calcHint'), save: $('saveConfig'), resetAll: $('resetAll'),
    savedTotal: $('savedTotal'), targetTotal: $('targetTotal'), percent: $('percent'), remain: $('remain'), bar: $('barFill'),
    motivate: $('motivate'), depositAmount: $('depositAmount'), addDeposit: $('addDeposit'), logList: $('logList'),
    confetti: $('confetti'), emojiTrack: $('emojiTrack'), emojiMarkers: $('emojiMarkers'), mascot: $('mascot'),
    exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), badgesList: $('badgesList')
  };

  const KEY = 'saver.v3';
  let state = migrate(load()) || defaultState();
  let celebrating = false;
  let lastPct = 0;

  const THEMES = {
    appliance: ['💡','🧺','🧊','📺','🔌','🔊','🧽','🧯'],
    fruits: ['🍎','🍊','🍋','🍇','🍉','🍓','🍒','🍍'],
    stars: ['✨','🌟','🌙','🪐','⭐','☄️','🌌','🚀']
  };

  // 初始化表单默认值
  initForm();
  renderAll();
  wireEvents();

  function defaultState(){
    const today = new Date();
    const tomorrow = addDays(startOfDay(today), 1);
    const end = new Date(today.getFullYear(), 11, 31); // 当年 12/31
    const daily = 10;
    const days = inclusiveDays(tomorrow, end);
    const target = daily * Math.max(days, 0);
    const goalId = uuid();
    return {
      version: 3,
      goals: [{ id: goalId, name: '我的目标', target, start: toISO(tomorrow), end: toISO(end), theme: 'appliance', archived: false, updatedAt: Date.now(), cloudId: null, dailyHint: daily }],
      entries: [],
      badges: [],
      currentGoalId: goalId,
      cloud: { url: '', anon: '' }
    };
  }

  function migrate(s){
    if (!s) return null;
    try{
      // v2 -> v3
      if (s.cfg) {
        const goalId = uuid();
        const goals = [{ id: goalId, name: '我的目标', target: Number(s.cfg.target)||0, start: s.cfg.start, end: s.cfg.end, theme: s.cfg.theme||'appliance', archived:false, updatedAt: Date.now(), cloudId:null, dailyHint: Number(s.cfg.daily)||0 }];
        const entries = (s.logs||[]).map(l=>({ id: uuid(), goalId, amount: Number(l.amt)||0, note:'', t: l.t, clientId: String(l.id||uuid()), cloudId:null }));
        const badges = (s.badges||[]).map(m=>({ id: uuid(), goalId, milestone: m, cloudId:null }));
        return { version:3, goals, entries, badges, currentGoalId: goalId, cloud: { url:'', anon:'' } };
      }
      if (s.version === 3) return s;
      return s;
    }catch{ return null; }
  }

  function load(){
    try{ const raw = localStorage.getItem(KEY); return raw? JSON.parse(raw) : null; }catch{ return null; }
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }

  function initForm(){
    const g = currentGoal();
    els.daily.value = g?.dailyHint ?? 10;
    els.start.value = g?.start || '';
    els.end.value = g?.end || '';
    els.target.value = g?.target || 0;
    els.theme.value = g?.theme || 'appliance';
    els.depositAmount.value = g?.dailyHint ?? 10;
    updateCalcHint();
    renderGoals();
  }

  function wireEvents(){
    // 动态计算提示
    ['input','change'].forEach(evt=>{
      [els.daily, els.start, els.end].forEach(el=> el.addEventListener(evt, updateCalcHint));
    });
    els.save.addEventListener('click', onSaveCfg);
    els.resetAll.addEventListener('click', onResetAll);
    els.addDeposit.addEventListener('click', onAddDeposit);
    els.exportBtn.addEventListener('click', onExport);
    els.importBtn.addEventListener('click', ()=> els.importFile.click());
    els.importFile.addEventListener('change', onImportFile);
    // goals
    $('addGoalBtn').addEventListener('click', onAddGoal);
    // cloud
    $('cloudSave').addEventListener('click', onCloudSave);
    $('cloudLogin').addEventListener('click', onCloudLogin);
    $('cloudLogout').addEventListener('click', onCloudLogout);
    $('syncDown').addEventListener('click', onSyncDown);
    $('syncUp').addEventListener('click', onSyncUp);
  }

  function onSaveCfg(){
    const daily = clamp(parseFloat(els.daily.value)||0, 0, 1e9);
    const start = els.start.value || toISO(new Date());
    const end = els.end.value || start;
    const theme = els.theme.value || 'appliance';
    const computedDays = inclusiveDays(new Date(start), new Date(end));
    const computedTarget = Math.max(0, Math.round((daily * Math.max(computedDays,0))));

    let target = parseFloat(els.target.value);
    if (!(target>=0)) target = computedTarget;

    const g = currentGoal();
    if (g){
      g.dailyHint = daily; g.start = start; g.end = end; g.target = target; g.theme = theme; g.updatedAt = Date.now();
      els.depositAmount.value = daily;
      save();
      renderAll();
    }
  }

  function onResetAll(){
    if(!confirm('确定要清空所有数据并重置设置吗？')) return;
    const fresh = defaultState();
    state.cfg = fresh.cfg; state.logs = [];
    save();
    initForm();
    renderAll();
  }

  function onAddDeposit(){
    const amt = clamp(parseFloat(els.depositAmount.value)||0, 0, 1e12);
    if (amt <= 0) { alert('请输入有效的存入金额'); return; }
    const now = new Date();
    const g = currentGoal(); if (!g) { alert('请先创建目标'); return; }
    state.entries.unshift({ id: uuid(), goalId: g.id, amount: Math.round(amt*100)/100, note:'', t: now.toISOString(), clientId: String(now.getTime()), cloudId:null });
    save();
    renderAll(true);
  }

  function onExport(){
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `saver-data-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function onImportFile(e){
    const file = e.target.files && e.target.files[0];
    if (!file) return; const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !obj.cfg || !('logs' in obj)) throw new Error('格式不对');
        state.cfg = {
          daily: Number(obj.cfg.daily)||0,
          start: obj.cfg.start || toISO(new Date()),
          end: obj.cfg.end || obj.cfg.start || toISO(new Date()),
          target: Number(obj.cfg.target)||0,
          theme: obj.cfg.theme || 'appliance'
        };
        state.logs = Array.isArray(obj.logs) ? obj.logs : [];
        state.badges = Array.isArray(obj.badges) ? obj.badges : [];
        save(); initForm(); renderAll();
        alert('导入成功');
      } catch(err){ alert('导入失败：' + err.message); }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function updateCalcHint(){
    const daily = parseFloat(els.daily.value)||0;
    const start = els.start.value ? new Date(els.start.value) : new Date();
    const end = els.end.value ? new Date(els.end.value) : start;
    const days = inclusiveDays(start, end);
    const target = Math.max(0, Math.round(daily * Math.max(days,0)));
    els.calcHint.textContent = days>=0
      ? `从 ${fmtDate(start)} 到 ${fmtDate(end)} 共 ${days} 天，按每日 ${daily} 元，目标约 ${target} 元。`
      : '结束日期应不早于开始日期。';
  }

  function renderAll(justDeposited=false){
    const g = currentGoal();
    const target = Math.max(0, Number(g?.target)||0);
    const saved = Math.max(0, Math.round(state.entries.filter(e=>e.goalId===g?.id).reduce((s,l)=>s+l.amount,0)));
    // 剩余 & 百分比
    const remain = Math.max(0, target - saved);
    const pct = target>0 ? Math.min(100, Math.round(saved/target*100)) : 0;

    els.targetTotal.textContent = target.toString();
    els.savedTotal.textContent = saved.toString();
    els.remain.textContent = remain.toString();
    els.percent.textContent = pct + '%';
    els.bar.style.width = pct + '%';

    // 激励话术
    els.motivate.textContent = motivateText(pct, remain);

    // 列表
    renderLogs();

    // 趣味进度 & 成就
    renderEmojiProgress(pct);
    checkMilestones(pct, justDeposited);
    renderBadges();

    // 达成庆祝（只触发一次或刚存入跨越目标时触发）
    if (target>0 && saved >= target && (justDeposited || !celebrating)) {
      celebrate();
    }
    lastPct = pct;
  }

  function renderLogs(){
    const frag = document.createDocumentFragment();
    const g = currentGoal();
    state.entries.filter(e=>e.goalId===g?.id).forEach(l=>{
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = `${fmtDateTime(new Date(l.t))}`;
      const right = document.createElement('strong');
      right.textContent = `+${l.amount}`;
      li.appendChild(left); li.appendChild(right);
      frag.appendChild(li);
    });
    els.logList.innerHTML='';
    els.logList.appendChild(frag);
  }

  function renderEmojiProgress(pct){
    // markers at 10,25,50,75,100
    const milestones = [10,25,50,75,100];
    const g = currentGoal();
    const theme = g?.theme || 'appliance';
    const set = THEMES[theme] || THEMES.appliance;
    const markers = document.createDocumentFragment();
    milestones.forEach((m, i)=>{
      const span = document.createElement('span');
      span.className = 'marker';
      span.textContent = set[i % set.length];
      markers.appendChild(span);
    });
    els.emojiMarkers.innerHTML = '';
    els.emojiMarkers.appendChild(markers);
    // move mascot
    const left = Math.max(0, Math.min(100, pct));
    els.mascot.textContent = set[Math.min(set.length-1, Math.floor((pct/100)*(set.length)))] || '🎯';
    els.mascot.style.left = left + '%';
    // small bounce when progress increases
    if (pct > lastPct) {
      els.mascot.classList.remove('bounce');
      void els.mascot.offsetWidth; // reflow
      els.mascot.classList.add('bounce');
    }
  }

  function checkMilestones(pct, justDeposited){
    const ms = [10,25,50,75,100];
    state.badges = state.badges || [];
    ms.forEach(m=>{
      if (pct >= m && !state.badges.includes(m)) {
        state.badges.push(m);
        save();
        if (justDeposited) {
          // 小提示
          try { toast(`解锁成就：${m}%`); } catch {}
        }
      }
    });
  }

  function renderBadges(){
    const g = currentGoal();
    const theme = g?.theme || 'appliance';
    const set = THEMES[theme] || THEMES.appliance;
    const frag = document.createDocumentFragment();
    (state.badges||[]).filter(b=>b.goalId===g?.id).map(b=>b.milestone).sort((a,b)=>a-b).forEach((m,i)=>{
      const li = document.createElement('li');
      const emo = document.createElement('span'); emo.className='b-emoji'; emo.textContent=set[i%set.length]||'🏅';
      const txt = document.createElement('span'); txt.className='b-text'; txt.textContent = `${m}% 里程碑已达成`;
      li.appendChild(emo); li.appendChild(txt); frag.appendChild(li);
    });
    els.badgesList.innerHTML=''; els.badgesList.appendChild(frag);
  }

  function toast(msg){
    const d = document.createElement('div');
    d.textContent = msg; d.style.position='fixed'; d.style.left='50%'; d.style.top='20px';
    d.style.transform='translateX(-50%)'; d.style.background='rgba(0,0,0,.6)'; d.style.color='#fff'; d.style.padding='8px 12px'; d.style.borderRadius='8px'; d.style.zIndex=9999; d.style.fontSize='14px';
    document.body.appendChild(d); setTimeout(()=>{ d.style.transition='opacity .4s'; d.style.opacity='0'; }, 1200);
    setTimeout(()=> d.remove(), 1800);
  }

  // Goals UI
  function renderGoals(){
    const ul = $('goalsList');
    const frag = document.createDocumentFragment();
    state.goals.filter(g=>!g.archived).forEach(g=>{
      const li = document.createElement('li');
      const name = document.createElement('span'); name.className='name'; name.textContent = g.name;
      const meta = document.createElement('span'); meta.className='meta'; meta.textContent = `目标 ${g.target} 元 ${g.start||''}~${g.end||''}`;
      const sel = document.createElement('button'); sel.textContent = (state.currentGoalId===g.id)?'当前':'选择'; sel.addEventListener('click', ()=>{ state.currentGoalId=g.id; save(); initForm(); renderAll(); });
      const arc = document.createElement('button'); arc.textContent='归档'; arc.addEventListener('click', ()=>{ if(confirm('归档该目标？')){ g.archived=true; save(); renderGoals(); if(state.currentGoalId===g.id){ const next = state.goals.find(x=>!x.archived); if(next) state.currentGoalId=next.id; save(); initForm(); renderAll(); } }});
      li.appendChild(name); li.appendChild(meta); li.appendChild(sel); li.appendChild(arc);
      frag.appendChild(li);
    });
    ul.innerHTML=''; ul.appendChild(frag);
  }

  function onAddGoal(){
    const name = ($('goalName').value||'').trim() || '新目标';
    const target = clamp(parseFloat($('goalTarget').value)||0, 0, 1e12);
    const id = uuid();
    state.goals.push({ id, name, target, start:'', end:'', theme:'appliance', archived:false, updatedAt:Date.now(), cloudId:null, dailyHint:10 });
    state.currentGoalId = id; save(); $('goalName').value=''; $('goalTarget').value=''; initForm(); renderAll();
  }

  function currentGoal(){ return state.goals.find(g=>g.id===state.currentGoalId) || state.goals[0]; }

  // Cloud (Supabase)
  let supa = { client: null, user: null };
  function cloudStatus(msg){ $('cloudStatus').textContent = msg; }
  function onCloudSave(){
    state.cloud.url = ($('supaUrl').value||'').trim();
    state.cloud.anon = ($('supaAnon').value||'').trim();
    save(); cloudInit();
  }
  async function cloudInit(){
    if (!state.cloud.url || !state.cloud.anon) { cloudStatus('未连接'); return; }
    try{
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      supa.client = createClient(state.cloud.url, state.cloud.anon, { auth: { persistSession: true } });
      const { data: { session } } = await supa.client.auth.getSession();
      supa.user = session?.user || null;
      $('supaUrl').value = state.cloud.url; $('supaAnon').value = state.cloud.anon;
      cloudStatus(supa.user ? `已登录：${supa.user.email||supa.user.id}` : '未登录');
    }catch(e){ cloudStatus('连接失败：'+e.message); }
  }
  async function onCloudLogin(){
    if (!supa.client) await cloudInit(); if (!supa.client) return;
    const email = ($('supaEmail').value||'').trim(); if (!email){ alert('请输入邮箱'); return; }
    const { error } = await supa.client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    if (error) alert('发送失败：'+error.message); else alert('已发送登录链接，请查收邮箱');
  }
  async function onCloudLogout(){ if (!supa.client) return; await supa.client.auth.signOut(); supa.user=null; cloudStatus('已登出'); }

  async function ensureSession(){ if (!supa.client) await cloudInit(); const { data:{ session } } = await supa.client.auth.getSession(); supa.user = session?.user || null; cloudStatus(supa.user?`已登录：${supa.user.email||supa.user.id}`:'未登录'); return !!supa.user; }

  function yuanToCents(y){ return Math.round((Number(y)||0)*100); }
  function centsToYuan(c){ return Math.round((Number(c)||0))/100; }

  async function onSyncUp(){
    if (!await ensureSession()) { alert('请先登录'); return; }
    cloudStatus('同步中（上传）...');
    try{
      // Upsert goals
      for (const g of state.goals){
        const row = { user_id: supa.user.id, name: g.name, target_cents: yuanToCents(g.target), start_date: g.start||null, end_date: g.end||null, theme: g.theme||null, daily_hint_cents: yuanToCents(g.dailyHint||0), archived: !!g.archived, updated_at: new Date(g.updatedAt||Date.now()).toISOString() };
        if (g.cloudId){
          const { error } = await supa.client.from('saver_goals').update(row).eq('id', g.cloudId).eq('user_id', supa.user.id);
          if (error) throw error;
        } else {
          const { data, error } = await supa.client.from('saver_goals').insert(row).select('id').single();
          if (error) throw error; g.cloudId = data.id; save();
        }
      }
      // Upload entries (idempotent via client_id)
      for (const e of state.entries){
        const g = state.goals.find(x=>x.id===e.goalId); if (!g?.cloudId) continue;
        const row = { goal_id: g.cloudId, amount_cents: yuanToCents(e.amount), client_id: e.clientId, note: e.note||null, entry_date: (e.t? new Date(e.t).toISOString().slice(0,10): null) };
        const { error } = await supa.client.from('saver_entries').upsert(row, { onConflict: 'goal_id,client_id' });
        if (error) throw error;
      }
      // Upload badges
      for (const b of (state.badges||[])){
        const g = state.goals.find(x=>x.id===b.goalId); if (!g?.cloudId) continue;
        const row = { goal_id: g.cloudId, kind: 'percent', milestone: b.milestone };
        const { error } = await supa.client.from('saver_badges').upsert(row, { onConflict: 'goal_id,kind,milestone' });
        if (error) throw error;
      }
      cloudStatus('上传完成');
    }catch(e){ cloudStatus('上传失败：'+e.message); }
  }

  async function onSyncDown(){
    if (!await ensureSession()) { alert('请先登录'); return; }
    cloudStatus('同步中（下载）...');
    try{
      const { data: goals, error: gerr } = await supa.client.from('saver_goals').select('*').order('created_at'); if (gerr) throw gerr;
      const goalMap = new Map();
      // Map cloud goals to local
      for (const row of goals){
        let g = state.goals.find(x=>x.cloudId===row.id);
        if (!g){ g = { id: uuid(), name: row.name||'目标', target: centsToYuan(row.target_cents), start: row.start_date||'', end: row.end_date||'', theme: row.theme||'appliance', archived: !!row.archived, updatedAt: Date.parse(row.updated_at)||Date.now(), cloudId: row.id, dailyHint: centsToYuan(row.daily_hint_cents||0) }; state.goals.push(g); }
        else { g.name=row.name; g.target=centsToYuan(row.target_cents); g.start=row.start_date||''; g.end=row.end_date||''; g.theme=row.theme||'appliance'; g.archived=!!row.archived; g.updatedAt=Date.parse(row.updated_at)||Date.now(); }
        goalMap.set(row.id, g.id);
      }
      // Fetch entries
      const cloudGoalIds = goals.map(x=>x.id);
      if (cloudGoalIds.length){
        const { data: entries, error: eerr } = await supa.client.from('saver_entries').select('*').in('goal_id', cloudGoalIds).order('created_at'); if (eerr) throw eerr;
        const existingKey = new Set(state.entries.map(e=> `${(state.goals.find(g=>g.id===e.goalId)?.cloudId)||'local'}|${e.clientId}`));
        for (const r of entries){
          const localGoalId = goalMap.get(r.goal_id); if (!localGoalId) continue;
          const key = `${r.goal_id}|${r.client_id||''}`;
          if (existingKey.has(key)) continue;
          state.entries.push({ id: uuid(), goalId: localGoalId, amount: centsToYuan(r.amount_cents), note: r.note||'', t: r.entry_date? new Date(r.entry_date).toISOString(): new Date().toISOString(), clientId: r.client_id||uuid(), cloudId: r.id||null });
        }
      }
      // Fetch badges
      if (cloudGoalIds.length){
        const { data: badges, error: berr } = await supa.client.from('saver_badges').select('*').in('goal_id', cloudGoalIds); if (berr) throw berr;
        const have = new Set((state.badges||[]).map(b=> `${(state.goals.find(g=>g.id===b.goalId)?.cloudId)||'local'}|${b.milestone}`));
        for (const r of badges){
          const localGoalId = goalMap.get(r.goal_id); if (!localGoalId) continue;
          const key = `${r.goal_id}|${r.milestone}`; if (have.has(key)) continue;
          state.badges.push({ id: uuid(), goalId: localGoalId, milestone: r.milestone, cloudId: r.id||null });
        }
      }
      // Select a current goal if needed
      if (!state.currentGoalId){ const first = state.goals.find(g=>!g.archived) || state.goals[0]; if (first) state.currentGoalId = first.id; }
      save();
      renderGoals(); initForm(); renderAll();
      cloudStatus('下载完成');
    }catch(e){ cloudStatus('下载失败：'+e.message); }
  }

  // Init cloud panel values
  $('supaUrl').value = state.cloud?.url || '';
  $('supaAnon').value = state.cloud?.anon || '';
  cloudInit();

  // UUID util
  function uuid(){
    const r = crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(16)) : Array.from({length:16},()=>Math.random()*256|0);
    r[6] = (r[6] & 0x0f) | 0x40; r[8] = (r[8] & 0x3f) | 0x80;
    const h=[...r].map(b=>b.toString(16).padStart(2,'0')).join('');
    return `${h.substr(0,8)}-${h.substr(8,4)}-${h.substr(12,4)}-${h.substr(16,4)}-${h.substr(20)}`;
  }

  // 文案
  function motivateText(pct, remain){
    if (pct === 0) return '万事开头难，先存第一笔！';
    if (pct < 25) return '不错的开始，保持节奏～';
    if (pct < 50) return '已完成四分之一，离目标更近了！';
    if (pct < 75) return '一半进度达成，继续稳扎稳打！';
    if (pct < 90) return '冲到 90% 不要松懈！剩余约 ' + remain + ' 元。';
    if (pct < 100) return '最后冲刺！再接再厉！';
    return '目标达成！太棒了！🎉';
  }

  // 庆祝动画（简易彩带）
  function celebrate(){
    if (celebrating) return;
    celebrating = true;
    const canvas = els.confetti; const ctx = canvas.getContext('2d');
    resize();
    const colors = ['#ff3b30','#ffd60a','#34c759','#5ad1ff','#9b5de5'];
    const N = 150;
    const parts = Array.from({length:N}, ()=>({
      x: Math.random()*canvas.width,
      y: -20 - Math.random()*canvas.height*0.5,
      r: 3+Math.random()*4,
      c: colors[(Math.random()*colors.length)|0],
      vx: -2+Math.random()*4,
      vy: 2+Math.random()*3,
      a: Math.random()*Math.PI*2,
      va: -0.2+Math.random()*0.4
    }));
    let t=0, stopAt=2000; // ms

    function step(ts){
      if (!step.last) step.last = ts; const dt = Math.min(32, ts - step.last); step.last = ts; t+=dt;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      parts.forEach(p=>{
        p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.y>canvas.height+20) { p.y=-10; p.x=Math.random()*canvas.width; }
        ctx.save();
        ctx.translate(p.x,p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
        ctx.restore();
      });
      if (t<stopAt) requestAnimationFrame(step); else { ctx.clearRect(0,0,canvas.width,canvas.height); celebrating=false; }
    }
    window.addEventListener('resize', resize);
    requestAnimationFrame(step);
    function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  }

  // 工具函数
  function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function inclusiveDays(a,b){ const d1=startOfDay(a), d2=startOfDay(b); return Math.round((d2-d1)/86400000)+1; }
  function toISO(d){ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
  function fmtDate(d){ return d.toLocaleDateString('zh-CN'); }
  function fmtDateTime(d){ return d.toLocaleString('zh-CN', { hour12:false }); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
})();
