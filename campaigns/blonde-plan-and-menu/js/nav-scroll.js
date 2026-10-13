/* Nav shadow on scroll, and --nav-h measured rather than hard-coded so the
   anchor offsets clear whatever the bar actually renders at. This page has no
   sticky menu bar and no scroll-spy: the junior page's versions of both stay
   there, and come back here only if this page ever grows a menu. */
(function(){
  var nav=document.querySelector('.trs-nav');
  if(!nav) return;
  var root=document.documentElement;
  var measure=function(){ root.style.setProperty('--nav-h',nav.offsetHeight+'px'); };
  var os=function(){ nav.classList.toggle('scrolled', window.scrollY>14); };
  window.addEventListener('scroll',os,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  window.addEventListener('load',measure);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(measure);
  measure(); os();
})();
