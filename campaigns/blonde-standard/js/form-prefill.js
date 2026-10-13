/* Entry-card prefill: clicking a door pre-selects the matching reason on the form. */
(function(){
  document.querySelectorAll('.door [data-svc]').forEach(function(a){
    a.addEventListener('click',function(){
      var s=document.getElementById('svc'); if(s) s.value=a.getAttribute('data-svc');
    });
  });
  var heard=document.getElementById('heard'), thank=document.getElementById('thankField');
  if(heard&&thank) heard.addEventListener('change',function(){
    thank.classList.toggle('field--hidden', heard.value!=='friend');
  });
})();
