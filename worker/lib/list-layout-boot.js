/** SSR helper: embed list data + boot TrueRankLayouts on DOMContentLoaded. */
export function listLayoutBoot({ dataId, containerId, kind, emptyMessage = '' }) {
    const emptyLine = emptyMessage
        ? `opts.emptyMessage=${JSON.stringify(emptyMessage)};`
        : '';
    return `<script nonce="__CSP_NONCE__" src="/js/list-layouts.js"></script>
<script nonce="__CSP_NONCE__">
document.addEventListener('DOMContentLoaded',function(){
  var el=document.getElementById(${JSON.stringify(containerId)});
  var raw=document.getElementById(${JSON.stringify(dataId)});
  if(!el||!raw||!window.TrueRankLayouts)return;
  try{
    var opts={kind:${JSON.stringify(kind)},items:JSON.parse(raw.textContent)};
    ${emptyLine}
    TrueRankLayouts.render(el,opts);
  }catch(e){}
});
</script>`;
}

export function jsonEmbed(id, data) {
    return `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/** Report page: Cards layout shows full SSR product cards; other layouts use the table/list renderers. */
export function productLayoutBoot() {
    return `<script nonce="__CSP_NONCE__" src="/js/list-layouts.js"></script>
<script nonce="__CSP_NONCE__">
document.addEventListener('DOMContentLoaded',function(){
  var el=document.getElementById('product-list');
  var detail=document.getElementById('product-grid-detail');
  var raw=document.getElementById('product-list-data');
  if(!el||!raw||!window.TrueRankLayouts)return;
  function sync(layout){
    if(!detail)return;
    var grid=layout==='grid';
    detail.style.display=grid?'':'none';
    var body=el.querySelector('.history-body');
    if(body)body.style.display=grid?'none':'';
  }
  try{
    TrueRankLayouts.render(el,{
      kind:'product',
      items:JSON.parse(raw.textContent),
      onLayoutChange:sync
    });
    sync(TrueRankLayouts.getLayout());
  }catch(e){}
});
</script>`;
}
