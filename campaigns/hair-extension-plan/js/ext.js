/* Hair Extension Plan, short version. Same behaviour as the long page, minus the countdown.
   TEMPLATE: swap __FORM_ENDPOINT__ for the CRM/GHL inbound webhook URL. Inert until set. */
(function(){
  var nav=document.querySelector('.trs-nav');
  if(nav){ var os=function(){ nav.classList.toggle('scrolled', window.scrollY>14); }; window.addEventListener('scroll',os,{passive:true}); os(); }

  document.querySelectorAll('.vs-cta[data-pick]').forEach(function(c){
    c.addEventListener('click',function(){ var sel=document.getElementById('plan'); if(sel){ sel.value=c.getAttribute('data-pick'); sel.dispatchEvent(new Event('change',{bubbles:true})); } });
  });
  document.querySelectorAll('[data-gift]').forEach(function(g){
    g.addEventListener('click',function(){ var cb=document.getElementById('c-gift'); if(cb){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
  });

  var FORM_ENDPOINT="__FORM_ENDPOINT__";
  var f=document.querySelector('main form')||document.querySelector('form');
  if(f){
    try{ var qp=new URLSearchParams(location.search); ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k){ var v=qp.get(k)||sessionStorage.getItem(k); if(v){ sessionStorage.setItem(k,v); var h=f.querySelector('[name='+k+']'); if(h) h.value=v; } }); }catch(err){}
    f.addEventListener('submit',function(e){
      e.preventDefault();
      if(!f.checkValidity()){ f.reportValidity(); var bad=f.querySelector(':invalid'); if(bad){ bad.setAttribute('aria-invalid','true'); bad.focus(); } return; }
      var data={};
      f.querySelectorAll('[name]').forEach(function(el){ if(el.type==='checkbox'){data[el.name]=el.checked;} else if(el.type==='radio'){ if(el.checked) data[el.name]=el.value; } else if(el.value){ data[el.name]=el.value; } });
      if(data.cc && data.whatsapp){ data.whatsapp = data.cc + " " + data.whatsapp; delete data.cc; }
      if(FORM_ENDPOINT.indexOf("__FORM_ENDPOINT__")===-1){ try{ fetch(FORM_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); }catch(err){} }
      var t=document.createElement('div'); t.className='form-thanks';
      t.innerHTML='<h3>Thank you. We have you.</h3><p>Our team will reply within one working day.</p>';
      t.setAttribute('role','status'); t.tabIndex=-1;
      f.parentNode.replaceChild(t,f); t.focus({preventScroll:true});
      t.scrollIntoView({behavior: (window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth'});
    });
    /* The reserve button stays visibly inactive until the form can be submitted. */
    var btn=f.querySelector('button[type=submit], .submit-row .pill');
    var hint=document.getElementById('submit-hint');
    if(btn){
      var sync=function(){
        var ok=f.checkValidity();
        btn.classList.toggle('pill--inactive',!ok);
        btn.setAttribute('aria-disabled',String(!ok));
        if(hint) hint.textContent = ok ? '' : 'Fill in the starred fields and tick the consent box to reserve.';
      };
      f.addEventListener('input',sync); f.addEventListener('change',sync); sync();
    }
  }

  var fc=document.getElementById('floatCta');
  if(fc){
    var hero=document.querySelector('.hero-c'), reserve=document.getElementById('reserve');
    var upd=function(){
      var pastHero=hero?(hero.getBoundingClientRect().bottom<40):(window.scrollY>500);
      var rv=false; if(reserve){ var r=reserve.getBoundingClientRect(); rv=r.top<window.innerHeight&&r.bottom>0; }
      var show=pastHero&&!rv;
      fc.classList.toggle('show',show); fc.setAttribute('aria-hidden',show?'false':'true');
      var l=fc.querySelector('a'); if(l) l.tabIndex=show?0:-1;
      document.body.classList.toggle('float-on',show);
    };
    window.addEventListener('scroll',upd,{passive:true}); window.addEventListener('resize',upd); upd();
  }
})();
