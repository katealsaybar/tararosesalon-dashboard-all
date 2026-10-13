/* Tracking layer. Same shape as the junior page's, which is the vocabulary the
   GHL pipeline already speaks. Fills the hidden fields. No third-party script, no
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
  if(!ref){ ref='TBS-'+Math.random().toString(36).slice(2,6).toUpperCase(); store('trs_ref',ref); }
  set('ref',ref);
  document.querySelectorAll('a[href*="wa.me"]').forEach(function(a){
    a.href = a.href + encodeURIComponent(' (ref '+ref+')');
  });

  var svc=q.get('svc'); if(svc){ var s=document.getElementById('svc'); if(s) s.value=svc; }

  /* channel and branch arrive on the URL, because the GBP booking links carry
     ?channel=gbp&branch=<slug> and the four profiles cannot be told apart
     without them. offering and emirate derive from her own selections. */
  set('channel', q.get('channel')||'');
  var urlBranch=q.get('branch')||'';
  set('branch', urlBranch);
  /* offering: Emma's exact GHL tag vocabulary, copied from the junior page so
     this page feeds the same pipeline with no translation step. No new values
     invented: the three lanes and a first-time blonde are colour work, warmth
     is the toner appointment, condition is the treatment appointment. */
  var OFFERING={soft:'colour-package',signature:'colour-package',transformation:'colour-package',
    'new':'colour-package',warm:'toner-reset',dry:'treatment-blowdry'};
  /* branch, in Emma's GHL vocabulary. Her list has no tag for "either Dubai salon",
     so that one is left blank rather than guessed; the salon field still carries
     her answer. */
  var BRANCH={'khalifa-city':'abudhabi','saadiyat':'abudhabi','either-abudhabi':'abudhabi',
    'al-quoz':'dubai-alquoz','motor-city':'dubai-motorcity'};
  /* Derived fields must CLEAR as well as fill: set() above deliberately ignores
     an empty value, which is right for a UTM and wrong for a derived field. */
  var reset=function(n,v){ var el=f.querySelector('[name="'+n+'"]'); if(el) el.value=v; };
  var deriveTags=function(){
    var sv=(document.getElementById('svc')||{}).value||'';
    var sa=(document.getElementById('salon')||{}).value||'';
    /* product carries the raw self-selection (lane or concern), so the pipeline
       can tell a named-lane lead from a symptom lead. */
    reset('product', sv==='unsure' ? '' : sv);
    reset('offering', OFFERING[sv]||'');
    reset('emirate', sa ? ((sa==='al-quoz'||sa==='motor-city'||sa==='either-dubai')?'dubai':'abudhabi') : '');
    /* A GBP link carries ?branch= and wins. Everything else arrives without one,
       so her salon choice fills it: the spec wants a branch tag on every lead. */
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
