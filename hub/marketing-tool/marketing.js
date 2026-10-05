/* Marketing shares the handover's in-memory state and portable save file.
   No platform connections, publishing, tracking pixels or automatic outreach. */
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses = ['To do', 'Doing', 'Check', 'Done', 'Blocked'];
  const campaigns = ['Blonde care', 'Brunette care', 'Wellness voucher', 'Extensions · internal', 'Juniors · internal', 'Across campaigns'];
  const platforms = ['Instagram + Facebook feed', 'Instagram + Facebook Stories', 'Instagram', 'Facebook', 'Google Business Profile', 'YouTube', 'TishTash PR', 'Website / booking', 'Internal / reception', 'Across platforms'];
  const pillars = ['Quotes', 'Team and BTS', 'Social proof', 'Transformations', 'Founder'];
  const kinds = ['Content', 'Task', 'PR brief', 'Platform check', 'Platform fix'];
  const branches = ['UAE · confirm branches', 'Al Quoz', 'Motor City', 'Khalifa City A', 'Mamsha Al Saadiyat'];
  const stages = ['See / Learn / Trust', 'Book / Consult', 'Create', 'Hold', 'Keep on Track', 'Across the journey'];
  const brief = [
    ['problem','Problem','What is she noticing or feeling?'],
    ['science','Science','Why might it happen? Explain simply, without blame.'],
    ['solution','Solution','What appropriate salon plan are we explaining?'],
    ['result','Result','What should she understand, see or feel?'],
    ['insurance','Insurance','How does home care protect her result?'],
    ['next','Next step','One clear action. How does the care plan continue?']
  ];
  const copy = [
    ['ig','Instagram caption'], ['fb','Facebook caption'], ['stories','Story frames and CTA'],
    ['gbp','Google Business Profile copy'], ['youtube','YouTube title, description and chapters'],
    ['pr','TishTash brief and approved commentary']
  ];
  const checks = [
    ['find','Can she find it?','Client question, service and accurate location.'],
    ['trust','Can she understand and trust it?','Plain language, supported claims, captions and consent.'],
    ['book','Can she take the next step?','One CTA, tested destination and enquiry owner.']
  ];
  const weeks = [
    {start:5,end:11,title:'Build the blonde plan',line:'Connect today’s result to treatment, home care and the next visit.',support:'Brunette result · wellness explanation',shorts:['Blonde-care question, answered','Why the team chose this treatment and home care'],gbp:['Blonde treatment and care','A genuine result from this branch']},
    {start:12,end:18,title:'Bring brunette care into focus',line:'Tone, shine and condition, held together on one plan.',support:'Blonde proof · wellness questions',shorts:['Brunette-care question, answered','The care plan behind a brunette result'],gbp:['Brunette tone, shine and care','Local result or approved wellness explanation']},
    {start:19,end:25,title:'Protect the result between visits',line:'Home care is the insurance on her hair. Give every recommendation its Because.',support:'Blonde demonstration · brunette reminder',shorts:['One home-care function, demonstrated','Founder answers a wellness question'],gbp:['Home care to protect the result','Treatment result from this branch']},
    {start:26,end:31,title:'Keep the plan on track',line:'Make her next step clear. Rebook with a reason, not a rescue.',support:'Brunette maintenance · blonde follow-up · wellness',shorts:['Brunette follow-up and next visit','One care question, one clear answer'],gbp:['Plan the next appropriate visit','Current approved campaign update']}
  ];
  const day = n => `2026-10-${String(n).padStart(2,'0')}`;
  const uaeToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const fmt = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Dubai'}) : 'No date';
  const base = (id,title,due,kind='Task',campaign='Across campaigns',platform='Across platforms') => ({
    id,title,due,kind,campaign,platform,pillar:'',branch:branches[0],stage:'Across the journey',
    status:'To do',owner:'',role:'Marketing lead',priority:'P3',note:'',evidence:'',reviewer:'',
    doneWhen:'Output checked and evidence recorded.',audit:'Not assessed',fields:{},checks:{}
  });
  function seed() {
    const records=[];
    const taskNames=[
      'Assign owners and confirm the UAE account list','Select Week 1 assets and check Instagram',
      'Check Facebook and prepare the first PR handover','Check each Google branch profile',
      'Check YouTube and the mobile booking journey','Check weekend content and enquiry ownership',
      'Duty-cover check and weekly snapshot','Triage verified issues and fix broken booking routes first',
      'Complete approved Instagram and Facebook corrections','Correct approved Google branch information',
      'Improve selected YouTube content and draft November themes','Check Week 3 content and PR feedback',
      'Check live content and real branch availability','Duty-cover check and weekly snapshot',
      'Review results, fixes and the next PR brief','Check client questions, captions and local context',
      'Check treatment and home-care enquiry handover','Run approved junior activity and review extension follow-up',
      'Approve final-week assets and reconfirm wellness terms','Check weekend content and replies',
      'Duty-cover check and month-end readiness','Approve November preview and retest priority fixes',
      'Test campaign links, terms and November booking routes','Follow up suitable internal-campaign enquiries',
      'Prepare October results and unresolved issues','Approve November assets and any offer-expiry actions',
      'Close October and hand over unfinished work'
    ];
    taskNames.forEach((t,i)=>{
      const r=base(`daily-${i+5}`,t,day(i+5));
      r.priority=[5,6,12,13,19,20].includes(i)?'P3':'P2';
      r.note='Assign a named owner. Daily rhythm: priorities → approved content → replies → live checks → save the handover file.';
      if ([6,13,20].includes(i)) {r.role='Assigned duty owner';r.note='Optional duty cover. Confirm the rota; do not assume seven-day staffing.';}
      records.push(r);
    });
    const feed=[
      [6,0,0,'Blonde care starts with a plan'],[7,1,0,'The treatment and home care behind a blonde result'],
      [8,3,1,'Brunette result: the plan behind the finish'],[9,2,2,'A real wellness-client experience'],[10,4,2,'Why the wellness offer exists'],
      [13,0,1,'Brunette care is a plan, too'],[14,1,1,'The team explains brunette tone, shine and care'],
      [15,3,0,'Blonde result with a protection plan'],[16,2,1,'Genuine brunette-care feedback'],[17,4,2,'One wellness question, answered'],
      [20,0,0,'Protect the blonde result between visits'],[21,1,0,'One home-care function for blonde hair'],
      [22,3,0,'Blonde condition: an honest result story'],[23,2,2,'Wellness experience: genuine proof only'],[24,4,1,'Why brunette care deserves a plan'],
      [27,0,1,'Brunette care: keep it on track'],[28,1,2,'Walk through the approved wellness offer'],
      [29,3,1,'Brunette result and the next care step'],[30,2,0,'A real blonde-care follow-up'],[31,4,2,'Wellness decision support, without pressure']
    ];
    feed.forEach(([n,p,c,title])=>{
      const r=base(`feed-${n}`,title,day(n),'Content',campaigns[c],platforms[0]);
      r.pillar=pillars[p];r.role='Content lead';r.stage='See / Learn / Trust';
      r.doneWhen='Approved asset published, live link recorded and reviewer named.';
      r.note=c===2?'Confirm the current offer sheet. No unapproved prices, inclusions, scarcity or closing date.':'Show treatment and home care as part of the plan, not unrelated extras.';
      if(p===2)r.note+=' Use genuine consented proof only. If unavailable, relabel as an educational explanation; never invent a testimonial.';
      records.push(r);
    });
    const storyJobs=['Ask one client question','Explain the concern without blame','Show a real team decision','Show the result and how it is protected','Answer a question or share genuine proof','Give one approved next step'];
    weeks.forEach((w,i)=>{
      for(let n=w.start;n<=Math.min(w.start+5,w.end);n++){
        const r=base(`story-${n}`,storyJobs[n-w.start],day(n),'Content',i===0||i===2?campaigns[0]:campaigns[1],platforms[1]);
        r.role='Story owner';r.doneWhen='Approved sequence checked on both platforms; live evidence recorded.';
        r.note='One coherent 3–5 frame sequence. Adapt interactions and CTA for each platform. Keep one action.';records.push(r);
      }
      w.shorts.forEach((t,j)=>{
        const r=base(`short-${i}-${j}`,t,day(w.start+2+j*2),'Content',i===0||i===2?campaigns[0]:campaigns[1],'YouTube');
        if(i===2&&j===1)r.campaign='Wellness voucher';
        r.role='Video owner';r.note='Short: repurpose a suitable approved asset. Add a useful title, subtitles and an appropriate next step.';records.push(r);
      });
      w.gbp.forEach((t,j)=>{
        const r=base(`google-${i}-${j}`,t,day(w.start+1+j*3),'Content',i===0||i===2?campaigns[0]:campaigns[1],'Google Business Profile');
        r.role='Local platform owner';r.note='Shared brief, not proof of branch publication. Use actual local work; duplicate this card per participating branch before recording it as complete.';records.push(r);
      });
    });
    [[16,'Blonde treatment and home-care plan',0],[30,'Brunette treatment and home-care plan',1]].forEach(([n,t,c])=>{
      const r=base(`long-${n}`,t,day(n),'Content',campaigns[c],'YouTube');r.role='Video owner';
      r.note='Longer video, subject to production capacity. Outline, expert presenter, thumbnail, captions and relevant booking route.';records.push(r);
    });
    [[7,'October priorities and the Hair Plan viewpoint'],[12,'Blonde and brunette care beyond colour'],[19,'Founder perspective and thoughtful wellness planning'],[26,'November preview and October learning']].forEach(([n,t])=>{
      const r=base(`pr-${n}`,t,day(n),'PR brief','Across campaigns','TishTash PR');r.role='PR liaison';
      r.note='Prepare: story angle, approved facts, founder commentary, consented images and credits, destination and specific request. No internal offers. Sending needs founder approval.';
      r.doneWhen='Pack approved and evidence linked. Delivery is a separate authorised task.';records.push(r);
    });
    [[12,3,'Extensions: brief the team on the approved prepaid plan'],[22,4,'Juniors: confirm eligible services and available slots']].forEach(([n,c,t])=>{
      const r=base(`internal-${n}`,t,day(n),'Task',campaigns[c],'Internal / reception');r.role='Operations lead';
      r.note='Internal only: confirm terms, suitability, staff briefing and permission-based follow-up. No public promotion.';records.push(r);
    });
    [['Instagram',6],['Facebook',7],...branches.slice(1).map(b=>['Google Business Profile',8,b]),['YouTube',9],['Website / booking',9]].forEach(([p,n,b],i)=>{
      const r=base(`audit-${i}`,`Check ${p}${b?' · '+b:''}`,day(n),'Platform check','Across campaigns',p);
      r.branch=b||branches[0];r.role='Platform owner';r.priority='P2';
      r.doneWhen='Record live evidence, a check result and reviewer. Log each verified fault as a separate linked fix.';
      records.push(r);
    });
    return {version:1,records};
  }
  function normalise(input) {
    if(!input || !Array.isArray(input.records)) return seed();
    const str=(v,n=10000)=>String(v==null?'':v).slice(0,n), ids=new Set();
    return {version:1,records:input.records.slice(0,1500).filter(r=>{
      if(!r||!/^[\w-]{1,80}$/.test(r.id)||ids.has(r.id))return false;ids.add(r.id);return true;
    }).map(r=>{
      const x=base(r.id,str(r.title,500),/^\d{4}-\d{2}-\d{2}$/.test(r.due)?r.due:'');
      ['kind','campaign','platform','pillar','branch','stage','status','priority','audit'].forEach(k=>{
        const allowed={kind:kinds,campaign:campaigns,platform:platforms,pillar:['',...pillars],branch:branches,stage:stages,status:statuses,priority:['P1','P2','P3','P4'],audit:['Not assessed','Pass','Needs fixing','Not applicable']}[k];
        if(allowed.includes(r[k]))x[k]=r[k];
      });
      ['owner','role','note','evidence','reviewer','doneWhen','parent'].forEach(k=>x[k]=str(r[k]));
      [...brief.map(b=>b[0]),...copy.map(b=>b[0]),'seo','aio','geo','asset','destination','fix','retest'].forEach(k=>x.fields[k]=str(r.fields&&r.fields[k]));
      checks.forEach(([k])=>x.checks[k]=!!(r.checks&&r.checks[k]));
      if(x.status==='Done' && (!x.owner.trim()||!x.evidence.trim()||!x.reviewer.trim()||
        (x.kind==='Platform check'&&x.audit==='Not assessed')||
        (x.kind==='Platform fix'&&!x.fields.retest.trim())||
        (['Content','PR brief'].includes(x.kind)&&checks.some(([k])=>!x.checks[k]))))x.status='Check';
      return x;
    })};
  }
  let C, ui={tab:'today',date:uaeToday(),mode:'due',week:0,campaign:'',platform:'',owner:'',query:'',scope:'all'};
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const options=(values,value,empty)=>`${empty!==undefined?`<option value="">${E(empty)}</option>`:''}${values.map(v=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(v)}</option>`).join('')}`;
  const select=(name,label,values,value,empty)=>`<label class="field">${label}<select class="in" name="${name}">${options(values,value,empty)}</select></label>`;
  const field=(name,label,value,type='text')=>`<label class="field">${label}<input class="in" name="${name}" type="${type}" value="${E(value)}"></label>`;
  const text=(name,label,value,placeholder='')=>`<label class="field">${label}<textarea class="in" name="${name}" rows="3" placeholder="${E(placeholder)}">${E(value)}</textarea></label>`;
  const internal=r=>r.campaign.includes('internal');
  const content=r=>r.kind==='Content'||r.kind==='PR brief';
  const badge=r=>`<span class="mk-badge ${r.status==='Done'?'complete':r.status==='Blocked'?'blocked':''}">${E(r.status)}</span>`;
  function visible(r){
    return (!ui.campaign||r.campaign===ui.campaign)&&(!ui.platform||r.platform===ui.platform)&&
      (!ui.owner||(ui.owner==='__none'?!r.owner:r.owner===ui.owner))&&
      (!ui.query||`${r.title} ${r.owner} ${r.note} ${r.campaign} ${r.platform}`.toLowerCase().includes(ui.query.toLowerCase()));
  }
  function render(ctx) { C=ctx;ui.tab=['today','calendar','health'].includes(ctx.tab)?ctx.tab:'today';draw(); }
  function draw(){
    const all=C.state.records, open=all.filter(r=>r.status!=='Done');
    C.main.innerHTML=`<section class="mk">
      <div class="tool-head"><div><p class="eyebrow">TRK-OS · The Full Loop · UAE</p><h1>Marketing</h1><p>One story. One plan. One clear next step.</p></div><div class="mk-actions"><button class="btn" id="mkLanguage">Our language</button><button class="btn primary" id="mkAdd">Add ${ui.tab==='health'?'check or fix':'task or content'}</button></div></div>
      <div class="mk-save"><span>Working plan · 5–31 October 2026</span><span>Edits stay in this tab. <button id="mkSave" class="mk-textbtn">Save my work</button> · <button id="mkOpen" class="mk-textbtn">Open saved file</button>. Not live team sync.</span></div>
      <nav class="tabs" aria-label="Marketing views">
        <a class="tab ${ui.tab==='today'?'on':''}" ${ui.tab==='today'?'aria-current="page"':''} href="#/marketing/today">Today</a>
        <a class="tab ${ui.tab==='calendar'?'on':''}" ${ui.tab==='calendar'?'aria-current="page"':''} href="#/marketing/calendar">Campaign Calendar</a>
        <a class="tab ${ui.tab==='health'?'on':''}" ${ui.tab==='health'?'aria-current="page"':''} href="#/marketing/health">Platform Health</a>
      </nav>
      <div id="mkView"></div>
      <footer class="mk-foot"><span>Great hair is not one visit. Create · Hold · Keep on Track.</span><button class="btn sm" id="mkExport">Export task list</button></footer>
    </section>`;
    q('#mkSave').onclick=()=>q('#saveBtn').click();
    q('#mkOpen').onclick=()=>q('#loadBtn').click();
    q('#mkLanguage').onclick=language;
    q('#mkAdd').onclick=()=>edit(base('new-'+Date.now(),'',ui.date,ui.tab==='health'?'Platform check':'Task'),true);
    q('#mkExport').onclick=exportList;
    if(ui.tab==='today')todayView(open);else if(ui.tab==='calendar')calendarView();else healthView();
  }
  function filters(){
    const owners=[...new Set(C.state.records.map(r=>r.owner).filter(Boolean))].sort();
    return `<details class="mk-filterbox" ${matchMedia('(min-width:601px)').matches?'open':''}><summary>Find and filter tasks${ui.campaign||ui.platform||ui.owner||ui.query?' · filters active':''}</summary><div class="mk-filters">
      <label class="field">Find a task<input class="in" id="mkQuery" type="search" placeholder="Search title, campaign or owner" value="${E(ui.query)}"></label>
      <label class="field">Campaign<select class="in" id="mkCampaign">${options(campaigns,ui.campaign,'All campaigns')}</select></label>
      <label class="field">Platform<select class="in" id="mkPlatform">${options(platforms,ui.platform,'All platforms')}</select></label>
      <label class="field">Owner<select class="in" id="mkOwner"><option value="">Everyone</option><option value="__none" ${ui.owner==='__none'?'selected':''}>Unassigned</option>${options(owners,ui.owner)}</select></label>
      <button class="btn sm" id="mkClear">Clear filters</button></div></details>`;
  }
  function wireFilters(renderRows){
    [['#mkCampaign','campaign'],['#mkPlatform','platform'],['#mkOwner','owner']].forEach(([s,k])=>q(s).onchange=e=>{ui[k]=e.target.value;renderRows();});
    q('#mkQuery').oninput=e=>{ui.query=e.target.value;renderRows();};
    q('#mkClear').onclick=()=>{ui.campaign='';ui.platform='';ui.owner='';ui.query='';draw();};
  }
  function row(r){
    const late=r.due&&r.due<ui.date&&r.status!=='Done';
    return `<button class="mk-row" data-edit="${E(r.id)}"><span class="mk-row-date ${late?'late':''}">${E(fmt(r.due))}${late?'<small>Overdue</small>':''}</span>
      <span class="mk-row-main"><strong>${E(r.title)}</strong><span>${E(r.platform)} · ${E(r.campaign)}${r.pillar?' · '+E(r.pillar):''}</span></span>
      <span class="mk-owner">${E(r.owner||'Unassigned')}<small>${E(r.priority)}${internal(r)?' · Internal':''}</small></span>${badge(r)}<span class="mk-arrow" aria-hidden="true">↗</span></button>`;
  }
  function bindRows(root){qa('[data-edit]',root).forEach(b=>b.onclick=()=>edit(C.state.records.find(r=>r.id===b.dataset.edit)));}
  function todayView(open){
    const counts={due:open.filter(r=>r.due&&r.due<=ui.date).length,check:open.filter(r=>r.status==='Check').length,blocked:open.filter(r=>r.status==='Blocked').length,all:C.state.records.length};
    q('#mkView').innerHTML=`<div class="mk-dayhead"><div><h2>What needs doing?</h2><p>Open a task, complete the work, then send it to Check.</p></div><label class="field">Working date · UAE<input class="in" type="date" id="mkDate" value="${E(ui.date)}"></label></div>
      <div class="mk-modes" role="group" aria-label="Task view">${[['due','Due + overdue'],['check','Waiting for check'],['blocked','Blocked'],['all','All tasks']].map(([k,t])=>`<button class="mk-mode ${ui.mode===k?'on':''}" data-mode="${k}"><b>${counts[k]}</b><span>${t}</span></button>`).join('')}</div>
      ${filters()}<div id="mkRows"></div>`;
    q('#mkDate').onchange=e=>{ui.date=e.target.value||uaeToday();draw();};
    qa('[data-mode]').forEach(b=>b.onclick=()=>{ui.mode=b.dataset.mode;draw();});
    const update=()=>{
      let rs=C.state.records.filter(visible).filter(r=>ui.mode==='all'||(ui.mode==='due'?r.status!=='Done'&&r.due&&r.due<=ui.date:ui.mode==='check'?r.status==='Check':r.status==='Blocked'));
      rs.sort((a,b)=>a.due.localeCompare(b.due)||a.priority.localeCompare(b.priority));
      q('#mkRows').innerHTML=`<div class="mk-listhead"><span>${rs.length} ${rs.length===1?'task':'tasks'} · select to open</span><span>Owner / priority · status</span></div>`+(rs.length?rs.map(row).join(''):'<div class="mk-empty">Nothing here with these filters. Try All tasks or clear the filters.</div>');
      bindRows(q('#mkRows'));
    };
    wireFilters(update);update();
  }
  function calendarView(){
    const w=weeks[ui.week];
    q('#mkView').innerHTML=`<div class="mk-weeknav" role="group" aria-label="October weeks">${weeks.map((w,i)=>`<button data-week="${i}" class="btn ${i===ui.week?'primary':''}">${w.start}–${w.end} Oct</button>`).join('')}</div>
      <div class="mk-week"><div><p class="eyebrow">This week’s story</p><h2>${E(w.title)}</h2><p>${E(w.line)}</p><small>Also in view: ${E(w.support)}</small></div><div class="mk-loop"><span>Create</span><span>Hold</span><span>Keep on Track</span><p>Care journey, not task statuses.</p></div></div>
      <div class="mk-guide"><strong>Your five pillars</strong><span>Quotes · Team and BTS · Social proof · Transformations · Founder</span><p>Team adds the assets, native captions and optimisation. Dates are planning slots, not scheduled posts.</p></div>
      ${filters()}<div class="mk-scope"><label class="field">Show<select class="in" id="mkScope">${options(['all','feed','stories','other','internal'],ui.scope).replace('>all<','>All campaign work<').replace('>feed<','>Feed / grid<').replace('>stories<','>Stories<').replace('>other<','>Google, YouTube and PR<').replace('>internal<','>Internal campaigns<')}</select></label></div><div id="mkCalendar"></div>`;
    qa('[data-week]').forEach(b=>b.onclick=()=>{ui.week=+b.dataset.week;draw();});
    const update=()=>{
      const rs=C.state.records.filter(visible).filter(r=>r.due>=day(w.start)&&r.due<=day(w.end)&&(content(r)||internal(r))).filter(r=>
        ui.scope==='all'||ui.scope==='feed'&&r.platform===platforms[0]||ui.scope==='stories'&&r.platform===platforms[1]||
        ui.scope==='internal'&&internal(r)||ui.scope==='other'&&['Google Business Profile','YouTube','TishTash PR'].includes(r.platform));
      q('#mkCalendar').innerHTML=rs.length?Array.from({length:w.end-w.start+1},(_,i)=>w.start+i).map(n=>{
        const rows=rs.filter(r=>r.due===day(n));return rows.length?`<section class="mk-agenda"><h3>${E(fmt(day(n)))}</h3>${rows.map(row).join('')}</section>`:'';
      }).join(''):'<div class="mk-empty">No campaign cards match this week and these filters.</div>';
      bindRows(q('#mkCalendar'));
    };
    q('#mkScope').onchange=e=>{ui.scope=e.target.value;update();};
    wireFilters(update);update();
  }
  const auditGuides={
    Instagram:'Profile promise, branch context, bio destination, pinned content, Highlights, captions, accessibility and enquiry ownership.',
    Facebook:'Page details, local contact information, CTA, native copy, Story adaptation, current offers and inbox ownership.',
    'Google Business Profile':'Check each branch: business details, hours, services, genuine local images, booking link, review responses and offer accuracy.',
    YouTube:'Channel promise, playlists, useful titles and thumbnails, subtitles, descriptions and appropriate booking destinations.',
    'Website / booking':'Mobile usability, message match, branch and service selection, forms, confirmation, current terms and enquiry routing.'
  };
  function healthView(){
    const checksAll=C.state.records.filter(r=>r.kind==='Platform check'), fixes=C.state.records.filter(r=>r.kind==='Platform fix');
    q('#mkView').innerHTML=`<div class="mk-dayhead"><div><h2>Protect the route to the chair</h2><p>Find it. Understand it. Book it. Check the actual platform before logging a fault.</p></div></div>
      <div class="mk-notice">No live account audit is connected. Checks start as <strong>Not assessed</strong>; findings and fixes are entered by the team.</div>
      <div class="mk-healthcards">${Object.entries(auditGuides).map(([p,guide])=>{
        const rs=checksAll.filter(r=>r.platform===p),complete=rs.filter(r=>r.status==='Done').length;
        return `<article class="mk-healthcard"><h3>${E(p)}</h3><span class="mk-badge">${complete} / ${rs.length} checks verified</span><p>${E(guide)}</p><button class="btn sm" data-health="${E(p)}">View checks</button></article>`;
      }).join('')}</div>
      ${filters()}<div id="mkHealthRows"></div>
      <p class="mk-muted">P1: booking, privacy or serious client risk. P2: accuracy and handover. P3: discovery and clarity. P4: polish. A fix is Done only after a retest.</p>`;
    const update=()=>{
      const cs=checksAll.filter(visible),fs=fixes.filter(visible);
      q('#mkHealthRows').innerHTML=`<h3 class="mk-section-title">Platform checks <span>${cs.length}</span></h3>${cs.map(row).join('')||'<div class="mk-empty">No checks match these filters.</div>'}
        <h3 class="mk-section-title">Fix register <span>${fs.length}</span></h3>${fs.map(row).join('')||'<div class="mk-empty">No matching fixes logged. Open a check and use “Log a linked fix” after verifying an issue.</div>'}`;
      bindRows(q('#mkHealthRows'));
    };
    qa('[data-health]').forEach(b=>b.onclick=()=>{ui.platform=b.dataset.health;ui.campaign='';ui.owner='';ui.query='';draw();q('#mkHealthRows').scrollIntoView({block:'start'});});
    wireFilters(update);update();
  }
  function modal(html,label){
    q('#mkDialog')?.remove();
    const d=document.createElement('dialog');d.id='mkDialog';d.className='mk-dialog';d.setAttribute('aria-label',label);
    const prior=document.activeElement;
    d.innerHTML=html;document.body.appendChild(d);d.showModal();
    d.addEventListener('close',()=>{d.remove();if(prior&&prior.isConnected)prior.focus();});
    qa('[data-close]',d).forEach(b=>b.onclick=()=>d.close());
    return d;
  }
  function edit(record,isNew=false){
    const r=JSON.parse(JSON.stringify(record));
    const d=modal(`<form id="mkForm">
      <div class="mk-dialog-head"><div><p class="eyebrow">${isNew?'New card':E(r.kind)+' · '+E(r.id)}</p><h2>${isNew?'One task. One owner.':'The next right step'}</h2></div><button type="button" class="iconbtn" data-close aria-label="Close task">×</button></div>
      <div class="mk-dialog-body">
        <div class="mk-formgrid">${field('title','Task or content title',r.title)}${select('kind','Type',kinds,r.kind)}
        ${select('campaign','Campaign',campaigns,r.campaign)}${select('platform','Platform',platforms,r.platform)}
        ${field('owner','Named owner',r.owner)}${field('due','Due / publication date · UAE',r.due,'date')}
        ${select('status','Status',statuses,r.status)}${select('priority','Priority',['P1','P2','P3','P4'],r.priority)}</div>
        <p class="mk-muted">Suggested role: ${E(r.role)}. Save applies this card to every view. It does not publish or send anything.</p>
        <details ${isNew?'open':''}><summary>Brief and branch</summary><div class="dbody mk-formgrid">
          ${select('branch','Branch',branches,r.branch)}${select('pillar','Storytelling pillar',pillars,r.pillar,'Not a pillar-led asset')}
          ${select('stage','Client journey',stages,r.stage)}
          ${text('doneWhen','Done when',r.doneWhen)}${text('note','Instructions, blocker or decision',r.note)}
        </div></details>
        <details ${content(r)?'open':''}><summary>Full Loop content brief</summary><div class="dbody mk-formgrid">${brief.map(([k,l,p])=>text('f_'+k,l,r.fields[k],p)).join('')}</div></details>
        <details><summary>Assets and platform captions</summary><div class="dbody mk-formgrid">
          ${field('f_asset','Approved asset link',r.fields.asset)}${field('f_destination','Booking / campaign destination',r.fields.destination)}
          ${copy.map(([k,l])=>text('f_'+k,l,r.fields[k],'Team adds platform-specific copy.')).join('')}
        </div></details>
        <details><summary>Find it · Understand it · Book it</summary><div class="dbody">
          ${checks.map(([k,t,desc])=>`<label class="mk-check"><input type="checkbox" name="c_${k}" ${r.checks[k]?'checked':''}><span><strong>${t}</strong><small>${desc}</small></span></label>`).join('')}
          <div class="mk-formgrid">${text('f_seo','SEO: search phrase and service context',r.fields.seo)}
          ${text('f_aio','AIO / GEO: direct answer, expert and evidence',r.fields.aio)}
          ${text('f_geo','Local relevance: actual branch and availability',r.fields.geo)}</div>
          <p class="mk-muted">GEO here means generative-engine optimisation. Location is checked separately. No ranking or AI-citation guarantees.</p>
        </div></details>
        <details ${r.kind.startsWith('Platform')?'open':''}><summary>Platform check and fix</summary><div class="dbody">
          <p>${E(auditGuides[r.platform]||'Record the actual issue, its impact and the proposed correction. Never treat an unchecked assumption as a fault.')}</p>
          ${select('audit','Check result',['Not assessed','Pass','Needs fixing','Not applicable'],r.audit)}
          ${text('f_fix','Verified issue and proposed correction',r.fields.fix)}
          ${text('f_retest','Retest: steps and actual outcome',r.fields.retest)}
          ${r.parent?`<p class="mk-muted">Linked to check ${E(r.parent)}.</p>`:''}
        </div></details>
        <details ${r.status==='Check'||r.status==='Done'?'open':''}><summary>Evidence and approval</summary><div class="dbody">
          ${text('evidence','Live URL, evidence or approval record',r.evidence,'Record what was checked. Do not add passwords or private client information.')}
          ${field('reviewer','Checked / approved by',r.reviewer)}
          <p class="mk-muted">Done requires evidence and a named reviewer. Content also needs the three quality checks; platform fixes need a recorded retest.</p>
        </div></details>
        <p id="mkError" class="mk-error" role="alert"></p>
      </div><div class="mk-dialog-foot"><div>${!isNew?'<button type="button" class="btn sm" id="mkDuplicate">Duplicate card</button>':''}${r.kind==='Platform check'&&!isNew?'<button type="button" class="btn sm" id="mkLinkedFix">Log a linked fix</button>':''}</div><div><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Update task</button></div></div>
    </form>`,r.title||'New marketing task');
    q('[name=title]',d).required=true;
    const readForm=()=>{
      const fd=new FormData(q('#mkForm',d)),x=JSON.parse(JSON.stringify(r));
      ['title','kind','campaign','platform','owner','due','status','priority','branch','pillar','stage','doneWhen','note','audit','evidence','reviewer'].forEach(k=>x[k]=String(fd.get(k)||'').trim());
      [...brief,...copy].map(a=>a[0]).concat(['asset','destination','seo','aio','geo','fix','retest']).forEach(k=>x.fields[k]=String(fd.get('f_'+k)||'').trim());
      checks.forEach(([k])=>x.checks[k]=fd.has('c_'+k));return x;
    };
    q('#mkForm',d).onsubmit=e=>{
      e.preventDefault();const x=readForm();let error='';
      if(!x.title)error='Give this card a clear title.';
      else if(!x.due)error='Choose a due date.';
      else if(internal(x)&&x.platform!=='Internal / reception')error='Internal extension and junior offers stay in Internal / reception.';
      else if(x.status==='Done'&&!x.owner)error='Assign a named owner before marking this task Done.';
      else if(x.status==='Done'&&(!x.evidence||!x.reviewer))error='To mark Done, add evidence and a named reviewer under Evidence and approval.';
      else if(x.status==='Done'&&content(x)&&checks.some(([k])=>!x.checks[k]))error='Complete the three quality checks before marking this content Done.';
      else if(x.status==='Done'&&x.kind==='Platform check'&&x.audit==='Not assessed')error='Record a check result before marking this audit Done.';
      else if(x.status==='Done'&&x.kind==='Platform fix'&&!x.fields.retest)error='Record the retest steps and outcome before marking this fix Done.';
      if(error){q('#mkError',d).textContent=error;q('#mkError',d).scrollIntoView({block:'nearest'});return;}
      if(isNew)C.state.records.push(x);else C.state.records.splice(C.state.records.findIndex(t=>t.id===r.id),1,x);
      C.markDirty();d.close();draw();
    };
    const duplicate=q('#mkDuplicate',d);
    if(duplicate)duplicate.onclick=()=>{
      const x=readForm();x.id='copy-'+Date.now();x.title+=' · copy';x.status='To do';x.evidence='';x.reviewer='';x.checks={};x.audit='Not assessed';d.close();edit(x,true);
    };
    const linked=q('#mkLinkedFix',d);
    if(linked)linked.onclick=()=>{
      const current=readForm();
      if(!current.fields.fix.trim()||!current.evidence.trim()){
        q('#mkError',d).textContent='Describe the verified issue and add audit evidence before logging a fix.';q('#mkError',d).scrollIntoView({block:'nearest'});return;
      }
      const audit=C.state.records.find(t=>t.id===r.id);
      audit.audit='Needs fixing';audit.fields.fix=current.fields.fix;audit.evidence=current.evidence;
      C.markDirty();
      const x=base('fix-'+Date.now(),`Fix ${r.platform}: ${current.fields.fix.slice(0,70)}`,ui.date,'Platform fix',r.campaign,r.platform);
      x.parent=r.id;x.branch=r.branch;x.priority='P2';x.fields.fix=current.fields.fix;
      x.note='Linked audit evidence: '+current.evidence;x.doneWhen='Approved correction made, retested and verified with evidence.';
      d.close();draw();edit(x,true);
    };
  }
  function language(){
    modal(`<div class="mk-dialog-head"><div><p class="eyebrow">TRK-OS · Our language</p><h2>Simplify the explanation, not the concept.</h2></div><button class="iconbtn" data-close aria-label="Close language guide">×</button></div>
      <div class="mk-dialog-body">
        <blockquote class="mk-quote">Great hair is not one visit.</blockquote>
        <div class="mk-loop large"><span>Create</span><span>Hold</span><span>Keep on Track</span></div>
        <p>Visit 1 creates the result. Visit 2 protects it. Visit 3 keeps it on track.</p>
        <p>In-salon fixes it. Home care protects it. Rebooking keeps it on track.</p>
        <h3>Every content brief</h3><p>Problem → Science → Solution → Result → Insurance. Finish with one clear next step.</p>
        <h3>The woman before the service</h3><p>See what she notices. Explain without blame. Recommend the appropriate plan. Give each home-care recommendation its Because.</p>
        <h3>One language, not five campaigns of jargon</h3>
        <ul><li>Say “home care to protect your result”, not “buy products”.</li><li>Say “your plan”, not a disconnected service package.</li><li>Use British English and the full brand name, Tara Rose Salons.</li><li>No pressure, invented proof, impossible guarantees or unsupported science.</li></ul>
        <div class="mk-notice"><strong>Naming check remains open.</strong> This app’s existing menu uses Essential · Reset · Ceremony; the project’s treatment instructions use Essential · Ritual · Signature Ceremony. This update preserves the existing app and does not resolve that conflict. Confirm the governing names before new public copy is approved.</div>
        <p><a href="#/p/t_lang" id="mkLanguageLink">Open the existing Language Guide</a> · <a href="https://app.notion.com/p/37675ef7d53d817a86a4f00ae3916f1a?pvs=204" target="_blank" rel="noopener">TRK-OS Master in Notion</a></p>
        <p class="mk-muted">The care journey and task statuses are different. Create / Hold / Keep on Track never replaces To do / Doing / Check / Done.</p>
      </div><div class="mk-dialog-foot"><span></span><button class="btn primary" data-close>Back to work</button></div>`,'Our language');
    q('#mkLanguageLink').onclick=()=>q('#mkDialog').close();
  }
  function exportList(){
    const cell=v=>{let s=String(v??'');if(/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const keys=['id','title','kind','campaign','platform','branch','pillar','owner','due','priority','status','audit','note','doneWhen','evidence','reviewer'];
    C.download('tara-rose-marketing-october-2026.csv','\ufeff'+[keys.map(cell).join(','),...C.state.records.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n'),'text/csv');
  }
  window.TR_MARKETING={seed,normalise,render};
})();
