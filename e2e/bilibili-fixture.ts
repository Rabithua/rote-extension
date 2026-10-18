/** A delayed Vue 2 takeover of Bilibili's server-rendered toolbar. */
export function bilibiliHydrationFixture(serverMarker = false, focusableShare = true) {
  const shareTag = focusableShare ? 'button' : 'div';
  const shareType = focusableShare ? ' type="button"' : '';
  return `<!doctype html><html lang="en"><head><style>
    :root{--text2:rgb(97,102,109);--brand_blue:rgb(0,174,236)}
    body{margin:0;color:var(--text2);font:14px Arial}
    #app{margin:0 32px;max-width:1000px}
    #biliMainHeader{height:64px;background:#eee}
    .video-space{height:280px}
    .video-toolbar{display:flex;justify-content:space-between;align-items:center}
    .video-toolbar-left{display:flex;align-items:center;flex:1;min-width:0}
    .toolbar-left-item-wrap{display:inline-flex;margin-right:28px}
    .video-share{display:inline-flex;align-items:center;gap:6px;color:var(--text2);font:14px Arial;padding:8px;border:0;background:transparent}
    .video-share svg{width:22px;height:22px}
    .video-toolbar-right{flex:none;padding:8px}
    .after-video{height:1400px}
  </style><script src="/__fixture_vue.js"></script></head><body><div id="app"${serverMarker ? ' data-server-rendered="true"' : ''}><header id="biliMainHeader"><a href="/">Home</a></header><div class="video-space"></div><div class="video-toolbar"><div class="video-toolbar-left"><span class="toolbar-left-item-wrap"><${shareTag} class="video-share"${shareType}><svg width="22" height="22"></svg><span>Share</span></${shareTag}></span></div><button class="video-toolbar-right" type="button">Report</button></div><div class="after-video"></div></div><script>
    Vue.config.productionTip=false;Vue.config.devtools=false;
    window.biliNativeMutations=[];
    new MutationObserver(records=>window.biliNativeMutations.push(...records.map(record=>record.type+':'+record.target.nodeName))).observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,characterData:true});
    window.biliHydrate=()=>{
      window.biliVue=new Vue({render(h){return h('div',{attrs:{id:'app'}},[
        h('header',{attrs:{id:'biliMainHeader'}},[h('a',{attrs:{href:'/'}},['Home'])]),
        h('div',{class:'video-space'}),
        h('div',{class:'video-toolbar'},[
          h('div',{class:'video-toolbar-left'},[
            h('span',{class:'toolbar-left-item-wrap'},[
              h('${shareTag}',{class:'video-share',attrs:${focusableShare ? "{type:'button'}" : '{}'}},[
                h('svg',{attrs:{width:'22',height:'22'}}),h('span',['Share'])
              ])
            ])
          ]),h('button',{class:'video-toolbar-right',attrs:{type:'button'}},['Report'])
        ]),h('div',{class:'after-video'})
      ])}}).$mount('#app',true);
    };
  </script></body></html>`;
}
