/* Tracking layer, Layer 5 F. Fills the hidden fields. No third-party script, no
   cookie of our own beyond the two stores below, so nothing here needs consent.
   TEMPLATE: swap __FORM_ENDPOINT__ for the GHL inbound webhook. Inert until set. */
(function(){
  var FORM_ENDPOINT="__FORM_ENDPOINT__";
  var f=document.querySelector('#book form'); if(!f) return;
  var q=new URLSearchParams(location.search);
  var set=function(n,v){ var el=f.querySelector('[name="'+n+'"]'); if(el&&v!=null&&v!=='') el.value=v; };
  var store=function(k,v){ try{ localStorage.setItem(k,v); }catch(e){} };
  var load=function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  var cookie=function(n){ var m=document.cookie.match('(^|; )'+n+'=([^;]*)'); return m?decodeURIComponent(m[2]):''; };

  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){ set(k, q.get(k)||''); });
  var gclid=q.get('gclid')||load('trs_gclid'), fbclid=q.get('fbclid')||load('trs_fbclid');
  if(q.get('gclid')) store('trs_gclid',q.get('gclid'));
  if(q.get('fbclid')) store('trs_fbclid',q.get('fbclid'));
  set('gclid',gclid); set('fbclid',fbclid);
  set('fbp',cookie('_fbp'));
  set('fbc', cookie('_fbc') || (fbclid ? 'fb.1.'+Date.now()+'.'+fbclid : ''));

  var touch=JSON.stringify({src:q.get('utm_source')||'',med:q.get('utm_medium')||'',cmp:q.get('utm_campaign')||'',ref:document.referrer||'',path:location.pathname});
  if(!load('trs_first_touch')) store('trs_first_touch',touch);
  set('first_touch', load('trs_first_touch')||touch);
  set('last_touch', touch);
  set('landing_path', load('trs_landing_path') || (store('trs_landing_path',location.pathname), location.pathname));
  set('referrer', document.referrer||'');

  /* Session ref, so a WhatsApp thread can be matched back to a session. */
  var ref=load('trs_ref');
  if(!ref){ ref='JE-'+Math.random().toString(36).slice(2,6).toUpperCase(); store('trs_ref',ref); }
  set('ref',ref);
  document.querySelectorAll('a[href*="wa.me"]').forEach(function(a){
    a.href = a.href + encodeURIComponent(' (ref '+ref+')');
  });

  var svc=q.get('svc'); if(svc){ var s=document.getElementById('svc'); if(s) s.value=svc; }

  /* Layer 4 tags. channel and branch arrive on the URL, because the GBP booking links
     carry ?channel=gbp&branch=<slug> and the four profiles cannot be told apart without
     them. product and emirate derive from her own selections, never typed. */
  set('channel', q.get('channel')||'');
  var urlBranch=q.get('branch')||'';
  set('branch', urlBranch);
  /* offering: uses Emma's exact GHL tag vocabulary so the page feeds her pipeline
     without a translation step. product stays look-vs-door, which is what Layer 4
     measures the conversion on. */
  var OFFERING={toner:'toner-reset',treatment:'treatment-blowdry',bundle:'blowdry',
    scalp:'treatment-blowdry',course:'treatment-course'};
  /* branch, in Emma's GHL vocabulary. Her list has no tag for "either Dubai salon", so
     that one is left blank rather than guessed; the salon field still carries her answer. */
  var BRANCH={'khalifa-city':'abudhabi','saadiyat':'abudhabi','either-abudhabi':'abudhabi',
    'al-quoz':'dubai-alquoz','motor-city':'dubai-motorcity'};
  /* Derived fields must CLEAR as well as fill. set() above deliberately ignores an
     empty value, which is right for a UTM that arrives once and must not be wiped by
     a later empty read. It is wrong here: if she picks The Smooth Edit and then
     changes to 'not sure', a sticky set() would send offering:smooth-edit to GHL for
     a woman who told us she does not know. So these three assign unconditionally. */
  var reset=function(n,v){ var el=f.querySelector('[name="'+n+'"]'); if(el) el.value=v; };
  var deriveTags=function(){
    var sv=(document.getElementById('svc')||{}).value||'';
    var sa=(document.getElementById('salon')||{}).value||'';
    reset('product', sv ? (sv==='look'?'look':(sv==='unsure'?'':'door')) : '');
    reset('offering', OFFERING[sv]||'');
    reset('emirate', sa ? ((sa==='al-quoz'||sa==='motor-city'||sa==='either-dubai')?'dubai':'abudhabi') : '');
    /* A GBP link carries ?branch= and wins. Everything else, Instagram, a caption link,
       a stylist's own bio, arrives without one, so her salon choice fills it: Emma's spec
       wants a branch tag on every lead, not only on the ones that came from Google. */
    if(!urlBranch) reset('branch', BRANCH[sa]||'');
  };
  f.addEventListener('change',deriveTags); deriveTags();

  f.addEventListener('submit',function(e){
    e.preventDefault();
    var req=f.querySelectorAll('[required]');
    for(var i=0;i<req.length;i++){
      var el=req[i];
      if((el.type==='checkbox'&&!el.checked)||(el.type!=='checkbox'&&!String(el.value).trim())){ el.focus(); return; }
    }
    var data={};
    f.querySelectorAll('[name]').forEach(function(el){
      if(el.type==='checkbox'){ data[el.name]=el.checked; }
      else if(el.value){ data[el.name]=el.value; }
    });
    if(data.cc&&data.whatsapp){ data.whatsapp=data.cc+' '+data.whatsapp; delete data.cc; }
    if(FORM_ENDPOINT.indexOf("__FORM_ENDPOINT__")===-1){
      try{ fetch(FORM_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); }catch(err){}
    }
    var t=document.createElement('div'); t.className='form-thanks';
    t.innerHTML='<h3>Thank you. We have you.</h3><p>We will come back to you on WhatsApp with a time. Your reference is '+ref+'.</p>';
    f.parentNode.replaceChild(t,f); t.scrollIntoView({behavior:'smooth'});
  });
})();
