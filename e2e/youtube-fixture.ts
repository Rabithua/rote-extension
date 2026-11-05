export function youtubeCard(id='abcdefghijk',title='Full video title',channel='Test Channel') {
  return `<yt-lockup-view-model><h3 title="${title}"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=${id}&list=ignored">${title}</a></h3><yt-content-metadata-view-model><div class="ytContentMetadataViewModelMetadataRow"><span role="text">${channel}</span></div></yt-content-metadata-view-model><div class="ytLockupMetadataViewModelMenuButton"><button aria-label="More actions">⋮</button></div></yt-lockup-view-model>`;
}
export function youtubeFixture(watch=false) {
  return `<!doctype html><html lang="en"><head><style>body{font:14px Arial;margin:24px;color:#0f0f0f}yt-lockup-view-model{display:block;border:1px solid #ddd;padding:16px;margin:16px;width:320px}button{border:0;border-radius:20px;padding:8px 16px;font:500 14px/20px Arial;background:#eee;cursor:pointer}#top-level-buttons-computed{display:flex}ytd-menu-popup-renderer{display:block;position:fixed;top:200px;left:400px;background:white;border-radius:12px;box-shadow:0 4px 10px #0003;padding:8px 0}[role=menuitem]{display:flex;align-items:center;padding:8px 16px;font:400 14px/24px Arial;cursor:pointer;gap:16px}[role=menuitem] svg{width:24px;height:24px}ytd-watch-flexy,ytd-watch-metadata{display:block}</style></head><body>${watch?'<ytd-watch-flexy video-id="abcdefghijk"><div id="player"><h1>Advertisement title</h1></div><ytd-watch-metadata><h1><yt-formatted-string>Full video title</yt-formatted-string></h1><div id="owner"><div id="channel-name"><a href="/@test">Test Channel</a></div></div><div id="top-level-buttons-computed"><button aria-label="Share">Share</button><button>Download</button></div></ytd-watch-metadata></ytd-watch-flexy>':''}${youtubeCard()}${youtubeCard('lmnopqrstuv','Second video','Second Channel')}<script>
  document.addEventListener('click',event=>{if(event.target.closest('button[aria-label="More actions"]')){document.querySelector('ytd-menu-popup-renderer')?.remove();const menu=document.createElement('ytd-menu-popup-renderer');menu.setAttribute('role','menu');menu.innerHTML=['Add to queue','Share'].map(text=>'<div role="menuitem" tabindex="0"><svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg><span>'+text+'</span></div>').join('');document.body.append(menu);menu.querySelector('[role=menuitem]').focus();}});
  document.addEventListener('keydown',event=>{if(event.keyCode===27)document.querySelector('ytd-menu-popup-renderer')?.remove();});
  </script></body></html>`;
}

/** Native watch actions can all be icon-only, including the first Share peer. */
export function youtubeWatchIconFixture(language:'en'|'zh',dark=false,legacy=false,mainstage=false) {
  const host=language==='zh'?'ytSpecButtonShapeNextHost':'yt-spec-button-shape-next';
  const modifier=(name:string)=>language==='zh'?`ytSpecButtonShapeNext${name}`:`yt-spec-button-shape-next--${name.replace(/[A-Z]/g,(letter,index)=>`${index?'-':''}${letter.toLowerCase()}`)}`;
  const shape=`${host} ${modifier('SizeM')} ${modifier('Tonal')} ${modifier('Mono')}`;
  const icon=(name:string)=>`<yt-button-view-model><button class="${shape} ${modifier('IconButton')}${mainstage?` ${modifier('MainstagePadding')} ${modifier('MainstageIconSize')}`:''}" aria-label="${name}"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 4h16v16H4z" fill="currentColor"/></svg></button></yt-button-view-model>`;
  const segmented=legacy?'ytd-segmented-like-dislike-button-renderer':'segmented-like-dislike-button-view-model';
  const actions=`<${segmented}><button class="${shape} ${modifier('SegmentedStart')}" aria-label="Like">405</button><button class="${shape} ${modifier('SegmentedEnd')}" aria-label="Dislike">−</button></${segmented}>${icon('Share')}${icon('Ask')}`;
  return youtubeFixture(true)
    .replace('<html lang="en">',`<html lang="${language==='zh'?'zh-CN':'en'}">`)
    .replace('<div id="top-level-buttons-computed"><button aria-label="Share">Share</button><button>Download</button></div>',`<div id="top-level-buttons-computed">${actions}</div>`)
    .replace('</style>',`
      body{background:${dark?'#0f0f0f':'white'};color:${dark?'white':'#0f0f0f'}}
      #top-level-buttons-computed{width:380px;align-items:center}
      #top-level-buttons-computed>yt-button-view-model{display:flex;flex:none;margin-left:8px}
      ${segmented}{display:flex;flex:none}
      .${host}{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;border:0;cursor:pointer}
      .${modifier('SizeM')}{height:40px;padding:0 16px;border-radius:20px;font:500 14px/20px Arial}
      .${modifier('Mono')}.${modifier('Tonal')}{background:${dark?'#272727':'#f2f2f2'};color:inherit}
      .${modifier('SizeM')}.${modifier('IconButton')}{width:40px;padding:0}
      .${modifier('SizeM')}.${modifier('MainstagePadding')}{padding:0 16px}
      .${modifier('IconButton')}{flex:0 0 auto}
      .${modifier('SegmentedStart')}{width:64px;border-radius:20px 0 0 20px}
      .${modifier('SegmentedEnd')}{width:40px;border-radius:0 20px 20px 0}
    </style>`);
}
