import { test as base, expect, type BrowserContext } from '@playwright/test';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { xFixture } from './x-fixture';

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
  await expect(settings.getByText('Saved to Rote',{exact:true})).toBeVisible();
  const result=await (await context.request.get('http://127.0.0.1:43119/__state')).json();
  expect(result.data.notes).toHaveLength(1);expect(result.data.notes[0].state).toBe('private');expect(result.data.notes[0].attachments).toHaveLength(2);
  expect(result.data.notes[0].content).toContain('/status/1001');
  await page.getByRole('button',{name:'Share post'}).first().click();await expect(page.locator('[data-rote-capture]')).toHaveText('Saved to Rote');
  await expect(page.locator('[data-rote-capture]')).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');await expect(page.locator('[data-rote-capture]')).toHaveCount(0);
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
  await page.keyboard.press('Enter');await expect(settings.getByText('已保存到 Rote',{exact:true})).toBeVisible();
  await settings.screenshot({path:'test-results/visuals/settings-dark-zh.png',fullPage:true});
});
test('refuses collapsed posts and does not leak settings to a content script',async({context,extensionId})=>{
  await connect(context,extensionId);const page=await openX(context);
  await page.getByRole('button',{name:'Share post'}).nth(2).click();await page.locator('[data-rote-capture]').click();
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
