// Shared search form used by the research result page and the browse page
// (previously duplicated inline in both). Includes the autocomplete dropdown
// and the submit-time loading overlay.
//
// Phase 1 runs exactly one research pipeline, so there is no depth/tier
// radiogroup and no tier-dependent Turnstile toggle here — tier UI returns
// in Phase 2.

export function searchBar(size = 'large') {
  const ph = size === 'large'
    ? 'What product are you researching?'
    : 'Research a product...';

  const loadingScript = `<script nonce="__CSP_NONCE__">
(function(){
if(window.__loadInit)return;window.__loadInit=true;
document.querySelectorAll('form.search-form').forEach(function(f){
f.addEventListener('submit',function(){
var o=document.createElement('div');
o.style.cssText='position:fixed;inset:0;background:rgba(12,17,25,0.94);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:#fff;gap:1.25rem;padding:1rem;text-align:center';
o.innerHTML='<div class="spinner"></div><div style="font-size:1.1rem;font-weight:600">Running research…</div><div style="font-size:0.95rem;color:rgba(255,255,255,0.75);max-width:440px">Takes about 90 seconds. Please keep this tab open — we’ll redirect you automatically when it’s ready.</div>';
document.body.appendChild(o);
var btn=f.querySelector('button[type="submit"]');
if(btn){btn.disabled=true;btn.textContent='Researching…'}
})
})
})();
</script>`;

  const autocompleteScript = `<script nonce="__CSP_NONCE__">
(function(){
if(window.__acInit)return;window.__acInit=true;
var inputs=document.querySelectorAll('input[name="q"]');
inputs.forEach(function(input){
var box=input.closest('.search-box');
if(!box)return;
box.style.position='relative';
var dd=document.createElement('div');
dd.className='ac-dropdown';
box.appendChild(dd);
var t;
input.addEventListener('input',function(){
clearTimeout(t);
var q=input.value.trim();
if(q.length<2){dd.style.display='none';return}
t=setTimeout(function(){
fetch('/api/search/suggest?q='+encodeURIComponent(q))
.then(function(r){return r.json()})
.then(function(items){
if(!items.length){dd.style.display='none';return}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
dd.innerHTML=items.map(function(i){
return '<a class="ac-item" href="/research/'+encodeURIComponent(i.slug)+'"><span>'+esc(i.query)+'</span>'+(i.category?'<span class="ac-cat">'+esc(i.category)+'</span>':'')+'</a>'
}).join('');
dd.style.display='block'
}).catch(function(){dd.style.display='none'})
},200)
});
input.addEventListener('blur',function(){setTimeout(function(){dd.style.display='none'},200)});
input.addEventListener('focus',function(){if(dd.innerHTML&&input.value.trim().length>=2)dd.style.display='block'});
})
})();
</script>`;

  return `<form action="/research/new" method="GET" class="search-form">
<div class="search-glow"></div>
<div class="search-box">
<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
<input type="text" name="q" placeholder="${ph}" required aria-label="Search query" autocomplete="off">
<button type="submit">Research</button>
</div>
${autocompleteScript}
${loadingScript}
</form>`;
}
