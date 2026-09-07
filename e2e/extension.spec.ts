import { test as base, expect, type BrowserContext } from '@playwright/test';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { xFixture } from './x-fixture';
import { githubFixture } from './github-fixture';

const test=base.extend<{context:BrowserContext;extensionId:string}>({
  context:async ({playwright},use)=>{
    const folder=await mkdtemp(join(tmpdir(),'rote-extension-e2e-'));
    const extension=join(folder,'extension');await cp(resolve('.output/chrome-mv3'),extension,{recursive:true});
    const path=join(extension,'manifest.json');const manifest=JSON.parse(await readFile(path,'utf8'));
    // This permission is added only to the disposable test copy, never to the deliverable.
    manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path,JSON.stringify(manifest));
    const context=await playwright.chromium.launchPersistentContext(join(folder,'profile'),{
      channel:'chromium',headless:true,viewport:{width:1100,height:850},
      args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    });
    await context.route('https://pbs.twimg.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
    await context.request.post('http://127.0.0.1:43119/__reset');
    await use(context);await context.close();await rm(folder,{recursive:true,force:true});
  },
  extensionId:async ({context},use)=>{
    let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});
const testKey='11111111-1111-4111-8111-111111111111';
async function connect(context:BrowserContext,id:string,language='en') {
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);
  await page.locator('#apiUrl').fill('http://127.0.0.1:43119');await page.locator('#openKey').fill(testKey);
  await page.locator('#language').selectOption(language);await page.locator('button[type=submit]').click();
  await expect(page.getByRole('status').filter({hasText:language==='zh'?'已连接':'Connected'})).toBeVisible();return page;
}
async function openX(context:BrowserContext,language='en',dark=false,path='/home') {
  await context.route('https://x.com/**',route=>route.fulfill({contentType:'text/html',body:xFixture(language,dark)}));
  const page=await context.newPage();await page.goto(`https://x.com${path}`);return page;
}
test('saves all images from the correct post, deduplicates and preserves menu styling',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);
  const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).first().click();
  const row=page.locator('[data-rote-capture]');await expect(row).toHaveCount(1);
  await expect(row).toHaveText('Save to Rote');
  const sizes=await page.locator('[role=menuitem]').evaluateAll(items=>items.map(item=>({height:item.getBoundingClientRect().height,padding:getComputedStyle(item).padding,font:getComputedStyle(item).fontSize})));
  expect(sizes[2]).toEqual(sizes[0]);
  await row.click({position:{x:2,y:2}});
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('[data-testid=mask]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Share post'}).first()).toBeFocused();
  await expect(settings.getByText('Saved to Rote',{exact:true})).toBeVisible();
  const result=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(result.data.notes).toHaveLength(1);expect(result.data.notes[0].state).toBe('private');expect(result.data.notes[0].attachments).toHaveLength(2);
  expect(result.data.notes[0].content).toContain('/status/1001');
  await page.getByRole('button',{name:'Share post'}).first().click();await expect(page.locator('[data-rote-capture]')).toHaveText('Saved to Rote');
  await expect(page.locator('[data-rote-capture]')).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');await expect(page.locator('[data-rote-capture]')).toHaveCount(0);
});
test('dismisses menus without a mask using the native keyboard handler',async({context,extensionId})=>{
  await connect(context,extensionId);const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).nth(1).click();
  await expect(page.locator('[data-rote-capture]')).toHaveCount(1);
  await page.locator('[data-testid=mask]').evaluate(element=>element.remove());
  await page.locator('[data-rote-capture]').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});
test('handles keyboard focus, repeated menu mounts, Chinese and dark theme',async({context,extensionId})=>{
  const settings=await connect(context,extensionId,'zh');
  await settings.locator('#theme').selectOption('dark');await settings.locator('button[type=submit]').click();
  await expect(settings.locator('html')).toHaveClass('dark');
  const page=await openX(context,'zh',true,'/test');
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'分享帖子'}).nth(1).click();await expect(page.locator('[data-rote-capture]')).toHaveCount(1);
    await page.keyboard.press('Escape');await expect(page.locator('[data-rote-capture]')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'分享帖子'}).nth(1).click();await expect(page.locator('[data-rote-capture]')).toHaveText('保存到 Rote');
  await page.keyboard.press('End');await expect(page.locator('[data-rote-capture]')).toBeFocused();
  await mkdir('test-results/visuals',{recursive:true});
  await page.screenshot({path:'test-results/visuals/x-menu-dark-zh.png'});
  await page.keyboard.press('Enter');await expect(page.getByRole('menu')).toHaveCount(0);await expect(settings.getByText('已保存到 Rote',{exact:true})).toBeVisible();
  await settings.screenshot({path:'test-results/visuals/settings-dark-zh.png',fullPage:true});
});
test('refuses collapsed posts and does not leak settings to a content script',async({context,extensionId})=>{
  await connect(context,extensionId);const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).nth(2).click();await page.locator('[data-rote-capture]').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(0);
  expect(await page.evaluate(()=>typeof (window as unknown as {chrome:{runtime?:unknown}}).chrome.runtime)).toBe('undefined');
});
test('recovers an upload failure into the same note',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'upload'}});
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('Text saved. Images need attention.',{exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Retry',exact:true}).click();await expect(settings.getByText('Saved to Rote',{exact:true})).toBeVisible();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(2);
});
test('a lost create response is reconciled without a duplicate',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'lost-create'}});
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('Check save result',{exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Check in Rote',exact:true}).click();await expect(settings.getByText('Saved to Rote',{exact:true})).toBeVisible();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);
});
test('resumes persisted images after the service worker stops',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'hang-upload'}});
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(async()=>{const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();return state.data.failure;}).toBe('upload-pending');
  const cdp=await context.newCDPSession(settings);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:''}});
  await settings.reload();await expect(settings.getByText('Saved to Rote',{exact:true})).toBeVisible({timeout:30000});
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(2);
});
test('supports corner clicks across routes, narrow layout and zoom, and rejects recycled targets',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await settings.setViewportSize({width:360,height:780});
  expect(await settings.evaluate(()=>document.documentElement.scrollWidth)).toBe(360);
  const page=await openX(context);await page.setViewportSize({width:800,height:900});
  for(const [index,path] of ['/home','/test/status/2002','/search?q=test','/test'].entries()){
    await page.goto(`https://x.com${path}`);
    await page.locator('article').nth(1).locator('time').evaluate((time,id)=>time.closest('a')!.setAttribute('href',`/test/status/${id}`),String(2001+index));
    await page.getByRole('button',{name:'Share post'}).nth(1).click();const row=page.locator('[data-rote-capture]');await expect(row).toHaveCount(1);
    const box=await row.boundingBox();if(!box)throw Error('Missing menu');
    await row.click({position:{x:index%2?box.width-6:6,y:index<2?6:box.height-6}});
    await expect.poll(async()=>{const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();return state.data.notes.length;}).toBe(index+1);
  }
  await page.goto('https://x.com/home');await page.evaluate(()=>{document.body.style.zoom='1.25';});
  await page.getByRole('button',{name:'Share post'}).first().click();await expect(page.locator('[data-rote-capture]')).toHaveCount(1);
  await page.locator('article').first().locator('time').evaluate(time=>time.closest('a')!.setAttribute('href','/test/status/9999'));
  await page.locator('[data-rote-capture]').click();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(4);
});

test('persists default tags and visibility and keeps saved-note settings during retries',async({context,extensionId})=>{
  const settings=await connect(context,extensionId,'zh');
  await settings.locator('#defaultTags').fill('#X， 阅读, X');
  await settings.locator('#defaultVisibility').selectOption('public');
  await settings.locator('button[type=submit]').click();
  await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await settings.reload();
  await expect(settings.locator('#defaultTags')).toHaveValue('X, 阅读');
  await expect(settings.locator('#defaultVisibility')).toHaveValue('public');
  const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'upload'}});
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('文字已保存，图片待补传',{exact:true})).toBeVisible();
  await settings.locator('#defaultTags').fill('新标签');await settings.locator('#defaultVisibility').selectOption('private');
  await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await settings.getByRole('button',{name:'重试',exact:true}).click();await expect(settings.getByText('已保存到 Rote',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('已保存到 Rote',{exact:true})).toHaveCount(2);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(state.data.notes).toHaveLength(2);
  expect(state.data.notes[0]).toMatchObject({state:'public',tags:['X','阅读']});
  expect(state.data.notes[1]).toMatchObject({state:'private',tags:['新标签']});
});
test('renders legacy worker settings without crashing on missing tags',async({context,extensionId})=>{
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({key})=>{
    // Reproduce an older background worker replying to an updated settings page.
    const original=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(async(message: {type:string})=>{
      if(message.type==='settings:get')return {ok:true,data:{settings:{id:'legacy',apiUrl:'http://127.0.0.1:43119',openKey:key,language:'en',theme:'light'}}};
      if(message.type==='tasks:list')return {ok:true,data:{tasks:[]}};
      return original(message);
    }) as typeof chrome.runtime.sendMessage;
  },{key:testKey});
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('#defaultTags')).toHaveValue('');
  await expect(page.locator('#defaultVisibility')).toHaveValue('private');
  await expect(page.locator('button[type=submit]')).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('link[rel=modulepreload]')).toHaveCount(0);
});
test('registers a toolbar action without a popup and opens standalone settings',async({context,extensionId})=>{
  const worker=context.serviceWorkers()[0]!;
  const config=await worker.evaluate(()=>({manifest:chrome.runtime.getManifest(),clickHandler:chrome.action.onClicked.hasListeners()}));
  expect(config.manifest.action?.default_popup).toBeUndefined();
  expect(config.manifest.options_ui?.open_in_tab).toBe(true);expect(config.clickHandler).toBe(true);
  // Exercise the browser API called by the registered toolbar handler.
  await worker.evaluate(()=>chrome.runtime.openOptionsPage());
  await expect.poll(()=>context.pages().map(page=>page.url())).toContain(`chrome-extension://${extensionId}/options.html`);
  const page=context.pages().find(page=>page.url().endsWith('/options.html'))!;
  await expect(page.locator('#defaultTags')).toBeVisible();
});
test('persists the platform tag switch and applies it only to new captures',async({context,extensionId})=>{
  const settings=await connect(context,extensionId,'zh');const toggle=settings.getByRole('switch',{name:'自动添加平台标签'});
  await expect(toggle).not.toBeChecked();
  await toggle.click({position:{x:4,y:4}});await expect(toggle).toBeChecked();
  await settings.locator('label[for=addPlatformTag]').click();await expect(toggle).not.toBeChecked();
  await toggle.focus();await settings.keyboard.press('Space');await expect(toggle).toBeChecked();
  await settings.locator('#defaultTags').fill('阅读');await settings.locator('button[type=submit]').click();
  await expect(settings.locator('button[type=submit]')).toBeEnabled();await settings.reload();
  await expect(settings.getByRole('switch')).toBeChecked();
  const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('已保存到 Rote',{exact:true})).toBeVisible();
  const box=await settings.getByRole('switch').boundingBox();if(!box)throw Error('Switch missing');
  await settings.getByRole('switch').click({position:{x:box.width-4,y:box.height-4}});
  await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('已保存到 Rote',{exact:true})).toHaveCount(2);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(state.data.notes[0].tags).toEqual(['阅读','X']);expect(state.data.notes[1].tags).toEqual(['阅读']);
});

test('GitHub saves summary with tags, deduplicates and follows repository navigation',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);
  await settings.getByRole('switch').click();await settings.locator('button[type=submit]').click();
  await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:githubFixture(new URL(route.request().url()).pathname.slice(1),true,'A useful project')}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  const button=page.locator('[data-rote-github] button');await expect(button).toHaveText('Save to Rote');
  expect((await button.boundingBox())!.height).toBe((await page.getByRole('button',{name:'Star',exact:true}).boundingBox())!.height);
  await button.click({position:{x:2,y:2}});await expect(button).toHaveText('Saved to Rote');await expect(button).toBeDisabled();
  expect(await page.locator('body').getAttribute('data-star-clicked')).toBeNull();
  await expect(settings.getByRole('link',{name:'Open project'})).toBeVisible();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].content).toBe('Owner/Repo\n\nA useful project\n\nhttps://github.com/Owner/Repo');expect(state.data.notes[0].tags).toEqual(['GitHub']);
  await page.reload();await expect(button).toHaveText('Saved to Rote');
  await page.evaluate(()=>{
    history.pushState({},'', '/Other/Project');
    document.querySelector('meta[name$="_nwo"]')!.setAttribute('content','Other/Project');
    const actions=document.querySelector('.pagehead-actions')!;actions.replaceWith(actions.cloneNode(true));
    document.querySelector('[data-rote-github]')?.remove();
    document.dispatchEvent(new Event('turbo:load'));
  });
  await expect(button).toHaveCount(1);await expect(button).toHaveText('Save to Rote');
  await page.evaluate(()=>{history.pushState({},'', '/Other/Project/issues');document.dispatchEvent(new Event('turbo:load'));});
  await expect(button).toHaveCount(0);
});
test('GitHub excludes private repos and recovers failed creation from settings',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:githubFixture('Owner/Repo',false)}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');await expect(page.locator('[data-rote-github]')).toHaveCount(0);
  await page.evaluate(()=>{document.querySelector('meta[name$="_public"]')!.setAttribute('content','true');document.querySelector('p')!.textContent='';document.dispatchEvent(new Event('turbo:load'));});
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'create403'}});
  await page.locator('[data-rote-github] button').click();await expect(settings.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('[data-rote-github] button')).toHaveText('Saved to Rote');
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes[0].content).toBe('Owner/Repo\n\nhttps://github.com/Owner/Repo');
});
test('settings use document scrolling and a sticky sidebar without nested scroll areas',async({context,extensionId})=>{
  const settings=await connect(context,extensionId,'zh');await settings.setViewportSize({width:1100,height:1100});
  await settings.locator('#theme').selectOption('dark');
  await settings.locator('button[type=submit]').click();await expect(settings.locator('html')).toHaveClass('dark');
  await settings.evaluate(()=>{
    const list=document.querySelector('.activity-column .section')!;
    for(let i=0;i<30;i++){const row=document.createElement('article');row.className='task';row.textContent='Recent capture '+i;row.style.height='80px';list.append(row);}
    window.scrollTo(0,200);
  });
  await expect.poll(()=>settings.locator('.settings-column').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(24);
  await settings.evaluate(()=>window.scrollTo(0,600));
  await expect.poll(()=>settings.evaluate(()=>window.scrollY)).toBe(600);
  expect(await settings.locator('.settings-column').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(24);
  for(const column of ['.settings-column','.activity-column']) expect(await settings.locator(column).evaluate(el=>getComputedStyle(el).overflowY)).toBe('visible');
  await mkdir('test-results/visuals',{recursive:true});await settings.screenshot({path:'test-results/visuals/sticky-settings-dark.png'});
  await settings.setViewportSize({width:1100,height:600});
  await settings.locator('button[type=submit]').scrollIntoViewIfNeeded();await expect(settings.locator('button[type=submit]')).toBeInViewport();
  expect(await settings.locator('.settings-column').evaluate(el=>el.scrollTop)).toBe(0);
  await settings.setViewportSize({width:360,height:600});
  expect(await settings.locator('.settings-column').evaluate(el=>getComputedStyle(el).position)).toBe('static');
  expect(await settings.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('GitHub dark Chinese button supports keyboard and bottom corner clicks at zoom',async({context,extensionId})=>{
  await connect(context,extensionId);
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:githubFixture('Owner/Repo',true,'Description',true).replace('lang="en"','lang="zh"')}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  await page.evaluate(()=>{document.body.style.zoom='1.25';});
  const button=page.locator('[data-rote-github] button');await expect(button).toHaveText('保存到 Rote');
  await button.focus();await expect(button).toBeFocused();
  await mkdir('test-results/visuals',{recursive:true});await page.screenshot({path:'test-results/visuals/github-dark-zh.png'});
  const box=await button.boundingBox();if(!box)throw Error('missing button');
  // Four pixels inward is inside the visible rounded corner at 125% zoom.
  await page.mouse.click(box.x+box.width-4,box.y+box.height-4);await expect(button).toHaveText('已保存到 Rote');
  await page.evaluate(()=>{history.pushState({},'', '/Other/Repo');document.querySelector('meta[name$="_nwo"]')!.setAttribute('content','Other/Repo');document.dispatchEvent(new Event('turbo:load'));});
  await expect(button).toHaveText('保存到 Rote');await button.focus();await page.keyboard.press('Enter');await expect(button).toHaveText('已保存到 Rote');
});

test('GitHub mounts beside modern Star/Fork controls and ignores hidden legacy actions',async({context,extensionId})=>{
  await connect(context,extensionId);
  const html=githubFixture().replace('<ul class="pagehead-actions">','<ul class="pagehead-actions" style="display:none">').replace('</body>', '<div class="modern-actions" style="display:flex;gap:8px"><button class="modern-button" data-component="Button">Watch</button><button class="modern-button" data-component="Button">Fork <span>2</span></button><div><button class="modern-button" data-component="Button"><svg width="16" height="16" style="vertical-align:text-bottom" class="octicon-star-fill"></svg>Starred <span>20</span></button></div></div><style>.modern-button{font:500 12px/20px system-ui;padding:3px 12px;border:1px solid #d1d9e0;border-radius:6px;background:#f6f8fa}</style></body>');
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  const button=page.locator('[data-rote-github] button');await expect(button).toBeVisible();
  await expect(page.locator('.modern-actions [data-rote-github]')).toHaveCount(1);
  const native=page.getByRole('button',{name:'Starred 20'});
  expect((await button.boundingBox())!.height).toBe((await native.boundingBox())!.height);
  await page.evaluate(()=>{document.querySelector('.modern-actions')!.replaceWith(document.querySelector('.modern-actions')!.cloneNode(true));});
  await expect(button).toHaveCount(1);await expect(button).toBeVisible();
  await button.click();await expect(button).toHaveText('Saved to Rote');
});
test('GitHub mounts after public metadata arrives without a navigation event',async({context,extensionId})=>{
  await connect(context,extensionId);
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:githubFixture('Owner/Repo',false)}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  await expect(page.locator('[data-rote-github]')).toHaveCount(0);
  await page.evaluate(()=>document.querySelector('meta[name$="_public"]')!.setAttribute('content','true'));
  await expect(page.locator('[data-rote-github] button')).toBeVisible();
});
