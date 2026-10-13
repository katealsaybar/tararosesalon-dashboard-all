/* The submit button looked alive before consent was ticked, so a woman could tap it
   and nothing would happen. Disabled until the form is actually submittable. */
(function(){
  var f=document.querySelector('#book form'); if(!f) return;
  var btn=f.querySelector('button[type=submit]'); if(!btn) return;
  var sync=function(){
    var ok=true;
    f.querySelectorAll('[required]').forEach(function(el){
      if((el.type==='checkbox'&&!el.checked)||(el.type!=='checkbox'&&!String(el.value).trim())) ok=false;
    });
    btn.toggleAttribute('disabled',!ok);
    btn.setAttribute('aria-disabled',String(!ok));
  };
  f.addEventListener('input',sync); f.addEventListener('change',sync); sync();
})();
