/* Nav shadow on scroll, the sticky offer nav's numbers, and the scroll-spy.
   --nav-h and --sticky-h are measured rather than hard-coded, because the offer
   nav wraps to two rows of chips on a phone and the anchor offsets have to clear
   whatever it actually renders at. .stuck adds the drop shadow only while the bar
   is docked under the brand nav.
   The spy keeps the URL hash and the highlighted chip matched to the group on
   screen while she scrolls (Kate, 25 Aug: the URL said blow-dries while she was
   reading courses). replaceState, not pushState, so back does not replay every
   group she scrolled past. The blonde band is in the spy map without a chip: the
   hash says where she is, and no chip pretends to be it. */
(function(){
  var nav=document.querySelector('.trs-nav');
  if(!nav) return;
  var bar=document.querySelector('.offer-nav');
  var zone=document.querySelector('.menu-zone');
  var root=document.documentElement;
  var SPY=['blowdries','trim','treatments','courses','toner','blonde','colour']
    .map(function(id){ return document.getElementById(id); }).filter(Boolean);
  var chips={};
  document.querySelectorAll('.ochip').forEach(function(a){
    chips[a.getAttribute('href').slice(1)]=a;
  });
  var lastSpy=null, ticking=false;

  var measure=function(){
    var nh=nav.offsetHeight;
    root.style.setProperty('--nav-h',nh+'px');
    if(bar) root.style.setProperty('--sticky-h',(nh+bar.offsetHeight+16)+'px');
  };

  var spy=function(){
    if(!zone||!SPY.length) return;
    var offset=nav.offsetHeight+(bar?bar.offsetHeight:0)+24;
    var current=null;
    if(zone.getBoundingClientRect().bottom>offset){
      for(var i=0;i<SPY.length;i++){
        if(SPY[i].getBoundingClientRect().top<=offset) current=SPY[i].id;
      }
    }
    if(current===lastSpy) return;
    lastSpy=current;
    try{ history.replaceState(null,'',current?'#'+current:location.pathname+location.search); }catch(e){}
    for(var id in chips) chips[id].classList.toggle('active',id===current);
  };

  var os=function(){
    nav.classList.toggle('scrolled', window.scrollY>14);
    if(bar) bar.classList.toggle('stuck',
      window.scrollY>0 && bar.getBoundingClientRect().top<=nav.offsetHeight+1);
    if(!ticking){
      ticking=true;
      requestAnimationFrame(function(){ ticking=false; spy(); });
    }
  };

  window.addEventListener('scroll',os,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  window.addEventListener('load',measure);
  /* The chip rows reflow when the webfont swaps in, so measure again after it. */
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(measure);
  measure(); os();
})();
