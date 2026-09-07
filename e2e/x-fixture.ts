import { postHtml } from '../tests/fixtures';
export function xFixture(language='en',dark=false) {
  const share=language==='zh'?'分享帖子':'Share post';
  const picture='<div data-testid="tweetPhoto"><img width="64" height="64" src="https://pbs.twimg.com/media/one?format=png&name=small" alt="one"></div><div data-testid="tweetPhoto"><img width="64" height="64" src="https://pbs.twimg.com/media/two?format=png&name=small" alt="two"></div>';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:${dark?'#000':'#fff'};color:${dark?'#e7e9ea':'#0f1419'};font:15px Arial,sans-serif}main{width:600px;margin:0 auto;border-inline:1px solid ${dark?'#2f3336':'#eff3f4'}}article{padding:16px;border-bottom:1px solid ${dark?'#2f3336':'#eff3f4'}}a{color:inherit;text-decoration:none}[data-testid=User-Name]{display:flex;gap:8px;margin-bottom:12px}[data-testid=tweetText]{line-height:22px}[data-testid=tweetPhoto]{display:inline-block;margin:12px 8px 12px 0}button{cursor:pointer}article button{color:inherit;background:transparent;border:0;padding:8px}[role=menu]{position:fixed;top:180px;left:calc(50% + 30px);width:240px;border-radius:12px;background:${dark?'#000':'#fff'};box-shadow:0 0 8px ${dark?'#ffffff40':'#0003'};overflow:hidden}[role=menuitem]{display:flex;align-items:center;cursor:pointer;padding:12px 16px;font:700 15px/20px Arial,sans-serif;color:inherit}[role=menuitem]:hover,[role=menuitem]:focus{background:${dark?'#ffffff14':'#00000008'}}[role=menuitem]>div:first-child{margin-right:12px;display:flex}[role=menuitem] svg{width:20px;height:20px;fill:currentColor}button:focus-visible,[role=menuitem]:focus-visible{outline:2px solid #1d9bf0;outline-offset:-2px}
  </style></head><body><main><h1 style="padding:16px">${language==='zh'?'主页':'Home'}</h1>${postHtml('1001',picture).replace('Share post',share)}${postHtml('1002').replace('Share post',share)}${postHtml('1003','<button data-testid="tweet-text-show-more-link">Show more</button>').replace('Share post',share)}</main><script>
  document.addEventListener('click',event=>{
    const button=event.target.closest('button[aria-haspopup="menu"]');
    if(button){document.querySelector('[role=menu]')?.remove();const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML=['${language==='zh'?'复制链接':'Copy link'}','${language==='zh'?'通过私信发送':'Send via Direct Message'}'].map(text=>'<div role="none"><div role="menuitem" tabindex="0"><div><svg viewBox="0 0 24 24"><path d="M8 7h8v10H8z"/></svg></div><div dir="auto">'+text+'</div></div></div>').join('');document.body.append(menu);menu.querySelector('[role=menuitem]').focus();}
    else if(!event.target.closest('[role=menu]'))document.querySelector('[role=menu]')?.remove();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('[role=menu]')?.remove();});
  </script></body></html>`;
}
