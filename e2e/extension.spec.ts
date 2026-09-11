import { test as base, expect, type BrowserContext } from '@playwright/test';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { xFixture } from './x-fixture';
import { youtubeFixture } from './youtube-fixture';
import { githubFixture } from './github-fixture';

const test=base.extend<{context:BrowserContext;extensionId:string}>({
  context:async ({playwright},use)=>{
    const folder=await mkdtemp(join(tmpdir(),'rote-extension-e2e-'));
    const extension=join(folder,'extension');await cp(resolve('.output/chrome-mv3'),extension,{recursive:true});
    const bg=join(extension,'background.js'); await writeFile(bg, `globalThis.__roteMenus=[];const add=chrome.contextMenus.onClicked.addListener.bind(chrome.contextMenus.onClicked);chrome.contextMenus.onClicked.addListener=(fn)=>{globalThis.__roteMenus.push(fn);add(fn)};`+await readFile(bg,'utf8'));
    const path=join(extension,'manifest.json');const manifest=JSON.parse(await readFile(path,'utf8'));
    // This permission is added only to the disposable test copy, never to the deliverable.
    manifest.host_permissions.push('http://127.0.0.1/*','https://example.com/*');await writeFile(path,JSON.stringify(manifest));
    const context=await playwright.chromium.launchPersistentContext(join(folder,'profile'),{
      channel:'chromium',headless:true,viewport:{width:1100,height:850},
      args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    });
    await context.route(/https:\/\/(pbs\.twimg\.com|i\.ytimg\.com)\/.*/, route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}));
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
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
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
  await page.keyboard.press('Enter');await expect(page.getByRole('menu')).toHaveCount(0);await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^已保存到 Rote$/})).toBeVisible();
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
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Text saved\. Images pending upload\.$/})).toBeVisible();
  await settings.getByRole('button',{name:'Retry',exact:true}).click();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(2);
});
test('a lost create response is reconciled without a duplicate',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'lost-create'}});
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.getByText('Check save result',{exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Check in Rote',exact:true}).click();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
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
  await settings.reload();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible({timeout:30000});
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
  await settings.getByText('默认归档',{exact:true}).click();
  await settings.locator('button[type=submit]').click();
  await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await settings.reload();
  await expect(settings.locator('#defaultTags')).toHaveValue('X, 阅读');
  await expect(settings.locator('#defaultVisibility')).toHaveValue('public');
  await expect(settings.locator('#defaultArchived')).toBeChecked();
  await settings.locator('#defaultArchived').click({position:{x:1,y:1}});
  await expect(settings.locator('#defaultArchived')).not.toBeChecked();
  await settings.locator('#defaultArchived').press('Space');
  await expect(settings.locator('#defaultArchived')).toBeChecked();
  const page=await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'upload'}});
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^文字已保存，图片待补传$/})).toBeVisible();
  await settings.locator('#defaultArchived').press('Space');
  await settings.locator('#defaultTags').fill('新标签');await settings.locator('#defaultVisibility').selectOption('private');
  await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await settings.getByRole('button',{name:'重试',exact:true}).click();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^已保存到 Rote$/})).toBeVisible();
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^已保存到 Rote$/})).toHaveCount(2);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(state.data.notes).toHaveLength(2);
  expect(state.data.notes[0]).toMatchObject({state:'public',tags:['X','阅读'],archived:true});
  expect(state.data.notes[1]).toMatchObject({state:'private',tags:['新标签'],archived:false});
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
  await expect(settings.locator('#addPlatformTag')).toBeChecked();
  const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^已保存到 Rote$/})).toBeVisible();
  const box=await settings.locator('#addPlatformTag').boundingBox();if(!box)throw Error('Switch missing');
  await settings.locator('#addPlatformTag').click({position:{x:box.width-4,y:box.height-4}});
  await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await page.getByRole('button',{name:'Share post'}).first().click();await page.locator('[data-rote-capture]').click();
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^已保存到 Rote$/})).toHaveCount(2);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(state.data.notes[0].tags).toEqual(['阅读','X']);expect(state.data.notes[1].tags).toEqual(['阅读']);
});

test('GitHub saves summary with tags, deduplicates and follows repository navigation',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);
  await settings.locator('#addPlatformTag').click();await settings.locator('button[type=submit]').click();
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

test('GitHub finds an unclassed Fork link beside Star without the legacy action list',async({context,extensionId})=>{
  await connect(context,extensionId);
  const html=githubFixture().replace(/<ul class="pagehead-actions">.*?<\/ul>/, '<div class="repo-toolbar" style="display:flex;gap:8px"><a href="/Owner/Repo/fork" class="new-link">Fork 69</a><div><button class="btn" aria-label="Star Owner/Repo">Star 1k</button></div></div>');
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  await expect(page.locator('.pagehead-actions')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Fork/})).toHaveCount(0);
  const button=page.locator('.repo-toolbar [data-rote-github] button');await expect(button).toBeVisible();
  await button.click();await expect(button).toHaveText('Saved to Rote');
  expect(page.url()).toBe('https://github.com/Owner/Repo');
});
test('GitHub can locate the action group from the reported Unwatch and Star buttons',async({context,extensionId})=>{
  await connect(context,extensionId);
  const html=githubFixture().replace(/<ul class="pagehead-actions">.*?<\/ul>/, '<div class="repo-toolbar" style="display:flex;gap:8px"><div><button class="btn" aria-label="Unwatch: All Activity in Owner/Repo. 3 users are watching this repository. Click to change subscription settings.">Unwatch 3</button></div><div><button class="btn" aria-label="Star Owner/Repo">Star 1k</button></div></div>');
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();await page.goto('https://github.com/Owner/Repo');
  const button=page.locator('.repo-toolbar [data-rote-github] button');await expect(button).toBeVisible();
  await expect(page.locator('[data-rote-github]')).toHaveCount(1);
  await button.click();await expect(button).toHaveText('Saved to Rote');
});

test('X and GitHub share Rote toast styling, success dismissal and recovery controls',async({context,extensionId})=>{
  await connect(context,extensionId);
  const x=await openX(context);await x.emulateMedia({colorScheme:'dark'});
  await x.getByRole('button',{name:'Share post'}).nth(1).click();await x.locator('[data-rote-capture]').click();
  const xToast=x.locator('[data-rote-toast]');await expect(xToast.getByRole('status')).toContainText('Saved to Rote');
  const visual=async(page:typeof x)=>page.locator('[data-rote-toast] .message').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,padding:s.padding,border:s.border,radius:s.borderRadius,font:s.font};});
  const xStyle=await visual(x);
  expect(xStyle.padding).toBe('6px 14px');expect(xStyle.radius).toBe('999px');
  expect((await xToast.getByRole('status').boundingBox())!.height).toBeLessThan(44);
  await context.route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:githubFixture()}));
  const github=await context.newPage();await github.emulateMedia({colorScheme:'dark'});await github.goto('https://github.com/Owner/Repo');
  await expect(github.locator('[data-rote-toast]')).toHaveCount(0);
  await github.locator('[data-rote-github] button').click();
  const toast=github.locator('[data-rote-toast]');await expect(toast.getByRole('status')).toContainText('Saved to Rote');
  expect(await visual(github)).toEqual(xStyle);
  const bounds=await toast.boundingBox();expect(Math.abs(bounds!.x+bounds!.width/2-550)).toBeLessThan(1);
  await mkdir('test-results/visuals',{recursive:true});await github.screenshot({path:'test-results/visuals/shared-toast-dark.png'});
  await expect(toast).toHaveCount(0,{timeout:8000});
  await github.reload();await expect(github.locator('[data-rote-github] button')).toHaveText('Saved to Rote');await expect(toast).toHaveCount(0);
  await github.evaluate(()=>{history.pushState({},'', '/Other/Repo');document.querySelector('meta[name$="_nwo"]')!.setAttribute('content','Other/Repo');document.dispatchEvent(new Event('turbo:load'));});
  await expect(github.locator('[data-rote-github] button')).toHaveText('Save to Rote');
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'create403'}});
  await github.locator('[data-rote-github] button').click();await expect(toast.getByRole('button',{name:'Open settings'})).toBeVisible();
  await github.setViewportSize({width:360,height:600});expect(await github.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await toast.locator('.message').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
  await github.screenshot({path:'test-results/visuals/toast-recovery-narrow.png'});
  await toast.getByRole('button',{name:'Close',exact:true}).click({position:{x:2,y:2}});await expect(toast).toHaveAttribute('data-closing','');await expect(toast).toHaveCount(0);
});

test('YouTube card menus and watch buttons share a video task with its cover',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await settings.locator('#addPlatformTag').click();await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:youtubeFixture(new URL(route.request().url()).pathname==='/watch')}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/');
  await page.getByRole('button',{name:'More actions'}).first().click();
  const row=page.locator('[data-rote-youtube=menu]');await expect(row).toHaveText('Save to Rote');
  await page.keyboard.press('End');await expect(row).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(1);expect(state.data.notes[0].tags).toEqual(['YouTube']);expect(state.data.notes[0].content).toBe('Full video title\n\nhttps://www.youtube.com/watch?v=abcdefghijk');
  await page.goto('https://www.youtube.com/watch?v=abcdefghijk');const button=page.locator('[data-rote-youtube=watch]');await expect(button).toHaveText('Saved to Rote');await expect(button).toBeDisabled();
  await expect(settings.getByRole('link',{name:'Open video'})).toBeVisible();
  await page.getByRole('button',{name:'More actions'}).nth(1).click();await expect(row).toHaveText('Save to Rote');await row.click({position:{x:3,y:3}});await expect(page.getByRole('menu')).toHaveCount(0);await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toHaveCount(2);
});
test('YouTube watch captures survive cover upload failures and SPA navigation rejects stale metadata',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:youtubeFixture(true)}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=abcdefghijk');const button=page.locator('[data-rote-youtube=watch]');await expect(button).toBeVisible();
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'upload'}});await button.click();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Text saved\. Images pending upload\.$/})).toBeVisible();
  await settings.getByRole('button',{name:'Retry',exact:true}).click();await expect(button).toHaveText('Saved to Rote');
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(1);
  await page.evaluate(()=>{document.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'', '/watch?v=lmnopqrstuv');document.dispatchEvent(new Event('yt-navigate-finish'));});await expect(button).toHaveCount(0);
  await page.evaluate(()=>{document.querySelector('ytd-watch-flexy')!.setAttribute('video-id','lmnopqrstuv');document.querySelector('ytd-watch-metadata h1')!.textContent='Second video';});await expect(button).toHaveText('Save to Rote');await expect(button).toHaveCount(1);
});

test('YouTube modern fixed-height popup expands for the full injected row',async({context,extensionId})=>{
  await connect(context,extensionId);
  let html=youtubeFixture();
  html=html.replace("const menu=document.createElement('ytd-menu-popup-renderer')", "const menu=document.createElement('yt-list-view-model')");
  html=html.replace("'<div role=\"menuitem\" tabindex=\"0\"><svg", "'<yt-list-item-view-model role=\"presentation\"><div class=\"ytListItemViewModelLayoutWrapper\" style=\"height:40px;box-sizing:border-box;padding:2px 16px\"><div role=\"menuitem\" tabindex=\"0\"><svg");
  html=html.replace("'+text+'</span></div>'", "'+text+'</span></div></div></yt-list-item-view-model>'");
  html=html.replace('document.body.append(menu);', 'const sheet=document.createElement("yt-sheet-view-model");sheet.style.cssText="display:block;position:fixed;top:200px;left:400px;max-height:80px;overflow:auto";sheet.append(menu);document.body.append(sheet);');
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/');await page.getByRole('button',{name:'More actions'}).first().click();
  const row=page.locator('[data-rote-youtube=menu]');await expect(row).toBeVisible();
  const bounds=await row.boundingBox();const sheet=await page.locator('yt-sheet-view-model').boundingBox();expect(bounds!.height).toBe(40);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(sheet!.y+sheet!.height);
});

test('YouTube refuses a recycled card after its menu has opened',async({context,extensionId})=>{
  await connect(context,extensionId);await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:youtubeFixture()}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/');await page.getByRole('button',{name:'More actions'}).first().click();await expect(page.locator('[data-rote-youtube=menu]')).toBeVisible();
  await page.locator('yt-lockup-view-model a').first().evaluate(el=>el.setAttribute('href','/watch?v=lmnopqrstuv'));
  await page.locator('[data-rote-youtube=menu]').click();await expect(page.getByRole('menu')).toHaveCount(0);
  const state=await (await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(0);
});

async function mockPageAPIs(context: BrowserContext) {
  const worker=context.serviceWorkers()[0]!;
  await worker.evaluate(()=>{
    const native=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      const url=String(input instanceof Request ? input.url : input);
      if(url.startsWith('https://api.bilibili.com/')) return new Response(JSON.stringify({code:0,data:{bvid:'BV1234567890',title:'Video fixture',pic:'https://i0.hdslb.com/bfs/archive/a.jpg',owner:{name:'Creator'}}}));
      if(url.startsWith('https://public.api.bsky.app/')) return new Response(JSON.stringify({thread:{post:{uri:'at://did:plc:fixture/app.bsky.feed.post/123',author:{did:'did:plc:fixture',handle:'user.test',displayName:'User'},record:{$type:'app.bsky.feed.post',text:'Full post\nSecond paragraph',createdAt:'2026-09-07T00:00:00.000Z'},embed:{$type:'app.bsky.embed.images#view',images:[1,2].map(i=>({fullsize:`https://cdn.bsky.app/img/feed_fullsize/plain/${i}.jpg`,alt:String(i)}))}}}}));
      if(url.startsWith('https://i0.hdslb.com/')||url.startsWith('https://cdn.bsky.app/')) return new Response(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}});
      return native(input,init);
    };
  });
}
test('Bilibili enters video through SPA, saves cover once and rebuilds button',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://www.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><body><main></main><script>function video(){history.pushState({},"","/video/BV1234567890");document.querySelector("main").innerHTML=`<div class="video-toolbar-left"><button class="video-share" style="padding:8px;font:14px Arial">Share</button></div>`}</script></body></html>'}));
  const page=await context.newPage();await page.goto('https://www.bilibili.com/');await page.evaluate(()=>{(window as unknown as {video:()=>void}).video();});
  const button=page.locator('[data-rote-page=bilibili]');await expect(button).toHaveCount(1);await button.click({position:{x:2,y:2}});
  await expect(page.locator('[data-rote-toast]').getByRole('status')).toContainText('Saved to Rote');
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();await expect(button).toBeDisabled();
  await page.evaluate(()=>{(window as unknown as {video:()=>void}).video();});await expect(button).toHaveCount(1);await expect(button).toBeDisabled();
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(1);
});
test('HN and arXiv place controls and save main content without comments or PDF',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);
  await context.route('https://news.ycombinator.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><div class="athing"><span class="titleline"><a href="https://example.com/article">Article</a></span></div><span class="subtext"><span class="subline"><a class="hnuser">author</a> | comments</span></span><div class="toptext">Main text</div><div class="comment">Excluded comment</div></html>'}));
  const page=await context.newPage();await page.goto('https://news.ycombinator.com/item?id=123');await page.locator('[data-rote-page=hackernews] button').click({position:{x:1,y:1}});
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
  await context.route('https://arxiv.org/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><head><meta name="citation_title" content="Paper"><meta name="citation_author" content="Author"></head><body><blockquote class="abstract">Abstract: Full abstract</blockquote><div class="full-text"><ul><li><a>PDF</a></li></ul></div></body></html>'}));
  await page.goto('https://arxiv.org/abs/2401.12345v2');await expect(page.locator('.full-text > [data-rote-page=arxiv]')).toHaveCount(1);await page.locator('[data-rote-page=arxiv] button').click({position:{x:2,y:2}});
  await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toHaveCount(2);
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes[0].content).toContain('https://example.com/article');expect(state.data.notes[0].content).not.toContain('Excluded comment');expect(state.data.notes[1].content).toContain('Full abstract');
});
test('Bluesky menu closes and full post plus all images are saved',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://bsky.app/**',r=>r.fulfill({contentType:'text/html',body:`<html lang="en"><body><div data-testid="postThreadItem-by-user.test"><a href="/profile/user.test/post/123">Time</a><button data-testid="postDropdownBtn">More</button></div><script>document.querySelector('button').onclick=()=>{const m=document.createElement('div');m.setAttribute('role','menu');const b=document.createElement('button');b.setAttribute('role','menuitem');b.style.cssText='height:40px;padding:8px';b.textContent='Copy link';m.append(b);document.body.append(m)};document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('[role=menu]')?.remove()})</script></body></html>`}));
  const page=await context.newPage();await page.goto('https://bsky.app/profile/user.test/post/123');await page.getByRole('button',{name:'More'}).click();const button=page.locator('[data-rote-page=bluesky]');await expect(button).toHaveCount(1);await button.click({position:{x:2,y:2}});
  await expect(page.getByRole('menu')).toHaveCount(0);await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
  await expect(page.locator('[data-rote-toast]')).toBeVisible();await page.getByRole('button',{name:'More'}).click();await expect(button).toBeDisabled();
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(2);expect(state.data.notes[0].content).toBe('Full post\nSecond paragraph\n\nhttps://bsky.app/profile/did:plc:fixture/post/123');
});

async function invokeContextCapture(context:BrowserContext,url:string,selection?:string) {
  await context.serviceWorkers()[0]!.evaluate(async({url,selection})=>{
    const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url)!;
    const listeners=(globalThis as unknown as {__roteMenus:Array<(info:unknown,tab:unknown)=>void>}).__roteMenus;
    for(const fn of listeners)fn({menuItemId:selection===undefined?'rote-page':'rote-selection',pageUrl:url,frameId:0,selectionText:selection},tab);
  },{url,selection});
}
test('generic bookmarks and exact multiline selections deduplicate independently',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await settings.locator('#addPlatformTag').click();await settings.locator('button[type=submit]').click();await expect(settings.locator('button[type=submit]')).toBeEnabled();
  await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><title>Reference</title><p>First paragraph</p><p>Second paragraph</p></html>'}));
  const page=await context.newPage();const url='https://example.com/a?q=1#section';await page.goto(url);
  await invokeContextCapture(context,url);await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toHaveCount(1);
  await expect(page.locator('[data-rote-toast]').getByRole('status')).toContainText('Saved to Rote');
  await invokeContextCapture(context,url);await expect(page.locator('[data-rote-toast]').getByRole('status')).toContainText('Saved to Rote');
  await invokeContextCapture(context,url,'First\n\nSecond');await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toHaveCount(2);
  await invokeContextCapture(context,url,'Other');await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toHaveCount(3);
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(3);expect(state.data.notes[1].content).toBe('Reference\n\nFirst\n\nSecond\n\n'+url);expect(state.data.notes[0].tags).toContain('example.com');
});
test('generic capture guides setup',async({context,extensionId})=>{
  await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<title>Reference</title><p>Text</p>'}));const page=await context.newPage();await page.goto('https://example.com/');
  await invokeContextCapture(context,'https://example.com/');await expect.poll(()=>context.pages().some(p=>p.url()===`chrome-extension://${extensionId}/options.html`)).toBe(true);
  await expect(page.locator('[data-rote-toast]').getByRole('status')).toContainText('Connect to Rote');
});
test('Bilibili discards extraction after navigation while the API is pending',async({context,extensionId})=>{
  await connect(context,extensionId);
  await context.serviceWorkers()[0]!.evaluate(()=>{const native=fetch;globalThis.fetch=async(input,init)=>{if(String(input).startsWith('https://api.bilibili.com/')){await new Promise(r=>setTimeout(r,500));throw new Error('offline')}return native(input,init)};});
  await context.route('https://www.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><link rel="canonical" href="https://www.bilibili.com/video/BV1234567890"><h1 class="video-title">A</h1><div class="video-toolbar-left"><button class="video-share">Share</button></div></html>'}));
  const page=await context.newPage();await page.goto('https://www.bilibili.com/video/BV1234567890');await page.locator('[data-rote-page]').click();
  await page.evaluate(()=>{history.pushState({},'','/video/BV9999999999');document.querySelector('h1')!.textContent='B';document.querySelector('link')!.setAttribute('href',location.href)});
  await page.waitForTimeout(700);const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(0);await expect(page.locator('[data-rote-page]')).toHaveText('Save to Rote');
});
test('Bilibili cover task survives page close and worker restart using persisted Blob',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://www.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><div class="video-toolbar-left"><button class="video-share">Share</button></div></html>'}));
  const page=await context.newPage();await page.goto('https://www.bilibili.com/video/BV1234567890');await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'hang-upload'}});await page.locator('[data-rote-page]').click();
  await expect.poll(async()=> (await(await context.request.get('http://127.0.0.1:43119/__state')).json()).data.failure).toBe('upload-pending');await page.close();
  const cdp=await context.newCDPSession(settings);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:''}});await settings.reload();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible({timeout:30000});
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);expect(state.data.notes[0].attachments).toHaveLength(1);
});
test('generic creation failure recovers after source closes without duplicate notes',async({context,extensionId})=>{
  const settings=await connect(context,extensionId);await context.route('https://example.com/**',r=>r.fulfill({contentType:'text/html',body:'<title>Reference</title><p>Text</p>'}));const page=await context.newPage();await page.goto('https://example.com/');
  await context.request.post('http://127.0.0.1:43119/__fail',{data:{failure:'create403'}});await invokeContextCapture(context,'https://example.com/');await expect(settings.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await page.close();await settings.getByRole('button',{name:'Retry',exact:true}).click();await expect(settings.locator('.task .rote-morph-label').filter({hasText:/^Saved to Rote$/})).toBeVisible();
  const state=await(await context.request.get('http://127.0.0.1:43119/__state')).json();expect(state.data.notes).toHaveLength(1);
});
test('Bluesky nested menu preserves native typography and contains the entire row at zoom',async({context,extensionId})=>{
  await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://bsky.app/**',r=>r.fulfill({contentType:'text/html',body:`<html lang="zh"><body style="background:#151b23;color:white"><div data-testid="postThreadItem-by-user.test"><a href="/profile/user.test/post/123">Time</a><button data-testid="postDropdownBtn">More</button></div><script>document.querySelector('button').onclick=()=>{const m=document.createElement('div');m.setAttribute('role','menu');m.style.cssText='position:fixed;left:12px;top:80px;width:200px';m.innerHTML='<div style="padding:4px;background:#222;border-radius:8px"><div role="menuitem" tabindex="0" style="display:flex;flex-direction:row;align-items:center;padding:8px 10px;height:36px;box-sizing:border-box"><span dir="auto" style="font:600 13px/17px Arial;color:white">复制帖文文字</span></div></div>';document.body.append(m)};document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('[role=menu]')?.remove()})</script></body></html>`}));
  const page=await context.newPage();await page.setViewportSize({width:360,height:600});await page.goto('https://bsky.app/profile/user.test/post/123');await page.evaluate(()=>{document.body.style.zoom='1.25'});await page.getByRole('button',{name:'More'}).click();
  const row=page.locator('[data-rote-page]');await expect(row).toHaveText('保存到 Rote');
  const geometry=await row.evaluate(e=>{const s=getComputedStyle(e);const b=e.getBoundingClientRect(),p=e.parentElement!.getBoundingClientRect();return {font:s.fontSize,weight:s.fontWeight,height:b.height,inside:b.bottom<=p.bottom&&b.right<=p.right}});expect(geometry).toEqual({font:'13px',weight:'600',height:45,inside:true});
  await page.getByRole('menuitem').first().focus();
  await page.keyboard.press('End');await expect(row).toBeFocused();await row.click({position:{x:3,y:3}});await expect(page.getByRole('menu')).toHaveCount(0);
});
test('Bluesky menu mounts when native menu opens on pointerdown before click',async({context,extensionId})=>{
  await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://bsky.app/**',r=>r.fulfill({contentType:'text/html',body:`<html lang="en"><body><div data-testid="postThreadItem-by-user.test"><a href="/profile/user.test/post/123">Time</a><button data-testid="postDropdownBtn">More</button></div><script>document.querySelector('button').onpointerdown=()=>{const m=document.createElement('div');m.setAttribute('role','menu');m.innerHTML='<button role=menuitem>Copy post text</button>';document.body.append(m)}</script></body></html>`}));
  const page=await context.newPage();await page.goto('https://bsky.app/profile/user.test/post/123');const more=page.getByRole('button',{name:'More'});await more.hover();await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();await expect(page.locator('[data-rote-page=bluesky]')).toHaveCount(1);
});
test('Bluesky binds pre-opened menus through their native owner and excludes reply menus',async({context,extensionId})=>{
  await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://bsky.app/**',r=>r.fulfill({contentType:'text/html',body:`<html lang="en"><body><div data-testid="postThreadItem-by-user.test"><a href="/profile/user.test/post/123/liked-by">Likes</a><button id="main-more" data-testid="postDropdownBtn">More</button></div><div data-testid="postThreadItem-by-other.test"><a href="/profile/other.test/post/456">Time</a><button id="reply-more" data-testid="postDropdownBtn">Reply More</button></div><div role="menu" aria-labelledby="main-more"><button role="menuitem">Copy text</button></div></body></html>`}));
  const page=await context.newPage();await page.goto('https://bsky.app/profile/user.test/post/123');const row=page.locator('[data-rote-page=bluesky]');await expect(row).toHaveCount(1);
  await page.getByRole('menu').evaluate(e=>e.setAttribute('aria-labelledby','reply-more'));await expect(row).toHaveCount(0);
  await page.getByRole('menu').evaluate(e=>e.setAttribute('aria-labelledby','main-more'));await expect(row).toHaveCount(1);
});
test('Bluesky keyboard opening binds the post before the menu appears',async({context,extensionId})=>{
  await connect(context,extensionId);
  await context.route('https://bsky.app/**',r=>r.fulfill({contentType:'text/html',body:`<html lang="en"><body><div data-testid="postThreadItem-by-user.test"><a href="/profile/user.test/post/123">Time</a><button data-testid="postDropdownBtn">More</button></div><script>document.querySelector('button').onkeydown=e=>{if(e.key!=='ArrowDown')return;const m=document.createElement('div');m.setAttribute('role','menu');m.innerHTML='<button role=menuitem>Copy post text</button>';document.body.append(m)}</script></body></html>`}));
  const page=await context.newPage();await page.goto('https://bsky.app/profile/user.test/post/123');await page.getByRole('button',{name:'More'}).focus();await page.keyboard.press('ArrowDown');await expect(page.locator('[data-rote-page=bluesky]')).toHaveCount(1);
});

test('old published text cache does not block new settings or get cleared', async ({context, extensionId}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(() => chrome.storage.local.set({content: ['unsaved old text\n']}));
  await page.reload();
  await expect(page.locator('#openKey')).toBeVisible();
  await page.locator('#apiUrl').fill('http://127.0.0.1:43119');
  await page.locator('#openKey').fill(testKey);
  await page.locator('#language').selectOption('en');
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('status').filter({hasText:'Connected'})).toBeVisible();
  expect(await page.evaluate(async () => (await chrome.storage.local.get('content')).content)).toEqual(['unsaved old text\n']);
});

test('Bilibili leaves server-rendered DOM intact until hydration completes',async({context,extensionId})=>{
  await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://www.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><body><div id="app" data-server-rendered="true"><header id="biliMainHeader"><a href="/">Home</a></header><div class="video-toolbar-left"><button class="video-share">Share</button></div></div></body></html>'}));
  const page=await context.newPage();await page.goto('https://www.bilibili.com/video/BV1234567890');
  // Allow content-script startup and observer frames while the host JS is delayed.
  await page.waitForTimeout(500);
  await expect(page.locator('[data-rote-page]')).toHaveCount(0);
  await expect(page.locator('.video-toolbar-left')).toHaveText('Share');
  await page.locator('#app').evaluate(el=>el.removeAttribute('data-server-rendered'));
  const button=page.locator('[data-rote-page=bilibili]');await expect(button).toHaveCount(1);
  await expect(page.locator('#biliMainHeader a')).toBeVisible();
  await button.click();await expect(button).toHaveText('Saved to Rote');
  await page.evaluate(()=>{
    history.pushState({},'', '/video/BV1234567891');
    document.querySelector('#app')!.outerHTML='<div id="app" data-server-rendered="true"><header id="biliMainHeader"><a href="/">Home</a></header><div class="video-toolbar-left"><button class="video-share">Share</button></div></div>';
  });
  await page.waitForTimeout(200);await expect(button).toHaveCount(0);
  await page.locator('#app').evaluate(el=>el.removeAttribute('data-server-rendered'));
  await expect(button).toHaveCount(1);await expect(button).toBeEnabled();
  await expect(page.locator('#biliMainHeader a')).toBeVisible();
});

test('Bilibili button follows native hover colors and exposes focus and disabled states',async({context,extensionId})=>{
  await connect(context,extensionId);await mockPageAPIs(context);
  await context.route('https://www.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="en"><style>:root{--text2:rgb(97,102,109);--brand_blue:rgb(0,174,236)}body{padding:40px}.video-share{color:var(--text2);font:14px Arial;padding:8px;transition:color .3s}.video-share:hover{color:var(--brand_blue)}</style><div class="video-toolbar-left"><button class="video-share">Share</button></div></html>'}));
  const page=await context.newPage();await page.goto('https://www.bilibili.com/video/BV1234567890');
  const button=page.locator('[data-rote-page=bilibili]');const native=page.locator('.video-share');
  await expect(button).toBeVisible();const box=(await button.boundingBox())!;
  await native.hover();await expect(native).toHaveCSS('color','rgb(0, 174, 236)');
  await button.hover();await expect(button).toHaveCSS('color','rgb(0, 174, 236)');
  expect(await button.boundingBox()).toEqual(box);
  await page.mouse.move(0,0);await expect(button).toHaveCSS('color','rgb(97, 102, 109)');
  await native.focus();await page.keyboard.press('Tab');await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style','solid');await expect(button).toHaveCSS('color','rgb(0, 174, 236)');
  await button.click({position:{x:box.width-2,y:box.height-2}});await expect(button).toHaveText('Saved to Rote');
  await button.hover();await expect(button).toHaveCSS('color','rgb(97, 102, 109)');
  await expect(button).toHaveCSS('cursor','not-allowed');await expect(button).toHaveCSS('opacity','0.3');
  await page.locator('html').evaluate(el=>{el.style.setProperty('--text2','rgb(200,200,200)');el.style.setProperty('--brand_blue','rgb(60,190,250)');});
  await expect(button).toHaveCSS('color','rgb(200, 200, 200)');
});


test('toast motion respects reduced motion and stays compact in light theme',async({context,extensionId})=>{
  await connect(context,extensionId);
  const page=await openX(context);await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  const toast=page.locator('[data-rote-toast]');await expect(toast.getByRole('status')).toContainText('Saved to Rote');
  const message=toast.locator('.message');await expect(message).toHaveCSS('transition-duration','0s');
  await expect(message).toHaveCSS('transform','none');
  await page.screenshot({path:'test-results/visuals/toast-pill-light.png'});
  const close=toast.getByRole('button',{name:'Close',exact:true});const box=(await close.boundingBox())!;
  await close.click({position:{x:box.width-3,y:box.height-3}});await expect(toast).toHaveCount(0);
});

test('toast enters smoothly and animates out',async({context,extensionId})=>{
  await connect(context,extensionId);
  const page=await openX(context);
  await page.evaluate(()=>{
    new MutationObserver(()=>{
      const message=document.querySelector('[data-rote-toast]')?.shadowRoot?.querySelector('.message');
      if(!message||message.hasAttribute('data-motion-checked'))return;
      message.setAttribute('data-motion-checked','');
      requestAnimationFrame(()=>{
        const motions=message.getAnimations();
        motions.forEach(a=>a.updatePlaybackRate(.1));
        message.setAttribute('data-motion-count',String(motions.length));
      });
    }).observe(document.body,{childList:true});
  });
  await page.getByRole('button',{name:'Share post'}).nth(1).click();await page.locator('[data-rote-capture]').click();
  const toast=page.locator('[data-rote-toast]');const message=toast.locator('.message');
  await expect(message).toHaveAttribute('data-motion-count','2');
  await page.waitForTimeout(1000);
  await page.screenshot({path:'test-results/visuals/toast-motion-slow.png'});
  await message.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
  await expect(message).toHaveCSS('opacity','1');
  await toast.getByRole('button',{name:'Close',exact:true}).click();
  await expect(toast).toHaveAttribute('data-closing','');
  expect(await message.evaluate(el=>el.getAnimations().length)).toBeGreaterThan(0);
  await expect(toast).toHaveCount(0);
});

test('toast morph preserves words, interrupts cleanly and exposes one accessible value', async ({context, extensionId}) => {
  await connect(context, extensionId);
  const page = await openX(context);
  await page.getByRole('button', {name:'Share post'}).nth(1).click();
  await page.locator('[data-rote-capture]').click();
  const toast = page.locator('[data-rote-toast]');
  const label = toast.locator('.rote-morph-label');
  await expect(label).toHaveText('Saved to Rote');
  await page.waitForTimeout(350);
  const update = async (status: 'creating' | 'saved' | 'failed', error?: string) => {
    await context.serviceWorkers()[0]!.evaluate(async ({status, error}) => {
      const [tab] = await chrome.tabs.query({url:'https://x.com/*'});
      await chrome.tabs.sendMessage(tab!.id!, {type:'task:changed', task: {
        site:'x', id:'motion-test', sourceId:'1002', sourceUrl:'https://x.com/test/status/1002',
        author:'Test', excerpt:'', status, error, updatedAt:new Date().toISOString(), imageCount:0, uploadedCount:0,
      }});
    }, {status, error});
  };
  // Slow down only state transitions, keeping the actual extension / Shadow DOM path.
  await toast.locator('.text').evaluate(el => {
    const word = Array.from(el.querySelectorAll('[data-segment]')).find(node => node.textContent === 'to');
    word!.setAttribute('data-retained', '');
    new MutationObserver(() => {
      el.getAnimations({subtree:true}).forEach(animation => animation.updatePlaybackRate(.1));
    }).observe(el, {childList:true, subtree:true});
  });
  await update('creating');
  await expect(label).toHaveText('Saving to Rote…');
  expect(await toast.locator('[data-retained]').count()).toBe(1);
  expect(await toast.locator('.text').evaluate(el => el.getAnimations({subtree:true}).length)).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.screenshot({path:'test-results/visuals/toast-text-morph-slow.png'});
  await update('failed', 'api_403');
  await update('saved');
  await expect(label).toHaveText('Saved to Rote');
  await expect(toast.getByRole('button', {name:'Open settings'})).toBeHidden();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(() => toast.locator('.text').evaluate(el => el.getAnimations({subtree:true}).length)).toBe(0);
  await expect(toast.locator('.text')).toMatchAriaSnapshot('- text: Saved to Rote');
  await expect(toast.locator('[data-exiting]')).toHaveCount(0);
  await expect(toast.locator('.rote-morph-visual')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('head style[data-torph]').count()).toBe(0);
  await update('failed', 'api_403');
  await page.setViewportSize({width:320, height:568});
  const bounds = (await toast.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(305);
  await page.screenshot({path:'test-results/visuals/toast-recovery-320.png'});
  const close = toast.getByRole('button', {name:'Close', exact:true});
  const closeBounds = (await close.boundingBox())!;
  await close.click({position:{x:closeBounds.width - 1, y:closeBounds.height / 2}});
  await expect(toast).toHaveCount(0);
});

test('unresolved checks show inline outcomes and records can be removed without deleting notes', async ({context, extensionId}) => {
  const settings = await connect(context, extensionId, 'zh'); const page = await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail', {data:{failure:'lost-create'}});
  await page.getByRole('button', {name:'Share post'}).nth(1).click(); await page.locator('[data-rote-capture]').click();
  const task = settings.locator('.task');
  const check = task.getByRole('button', {name:'核对 Rote 中的结果', exact:true});
  await expect(check).toBeVisible();
  for (const [failure, result] of [['search-empty','在笔记和归档中未找到匹配结果'], ['search-mismatch','正文与采集内容不同'], ['search-ambiguous','找到了多条内容相同的笔记'], ['search403','此密钥或账号无权执行该操作']]) {
    await context.request.post('http://127.0.0.1:43119/__fail', {data:{failure}});
    await check.click();
    await expect(task.locator('.feedback')).toContainText(result!);
    await expect(check).toBeEnabled();
  }
  settings.once('dialog', dialog => dialog.dismiss());
  await task.getByRole('button', {name:'删除记录', exact:true}).click();
  await expect(task).toHaveCount(1);
  await settings.setViewportSize({width:360, height:780});
  await task.screenshot({path:'test-results/visuals/reconcile-feedback-narrow.png'});
  const otherSettings = await context.newPage(); await otherSettings.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(otherSettings.locator('.task')).toHaveCount(1);
  settings.once('dialog', async dialog => { expect(dialog.message()).toContain('不会删除 Rote 中的笔记'); await dialog.accept(); });
  const remove = task.getByRole('button', {name:'删除记录', exact:true}); const bounds = (await remove.boundingBox())!;
  await remove.click({position:{x:bounds.width-5,y:bounds.height-5}});
  await expect(task).toHaveCount(0); await expect(otherSettings.locator('.task')).toHaveCount(0);
  await settings.reload(); await expect(task).toHaveCount(0);
  const state = await (await context.request.get('http://127.0.0.1:43119/__state')).json(); expect(state.data.notes).toHaveLength(1);
});

test('checking shows progress, disables conflicting actions and completes without duplicating the note', async ({context, extensionId}) => {
  const settings = await connect(context, extensionId); const page = await openX(context);
  await context.request.post('http://127.0.0.1:43119/__fail', {data:{failure:'lost-create'}});
  await page.getByRole('button', {name:'Share post'}).nth(1).click(); await page.locator('[data-rote-capture]').click();
  const task = settings.locator('.task'); const check = task.getByRole('button', {name:'Check in Rote',exact:true});
  await expect(check).toBeVisible();
  await context.request.post('http://127.0.0.1:43119/__fail', {data:{failure:'search-slow'}});
  await check.click();
  await expect(task.getByRole('button', {name:'Checking…',exact:true})).toBeDisabled();
  await expect(task.getByRole('button', {name:'Delete record',exact:true})).toBeDisabled();
  await expect(task.locator('.feedback')).toContainText('Found the saved note');
  await expect(task.locator('.status .rote-morph-label')).toHaveText('Saved to Rote');
  const state = await (await context.request.get('http://127.0.0.1:43119/__state')).json(); expect(state.data.notes).toHaveLength(1);
});
