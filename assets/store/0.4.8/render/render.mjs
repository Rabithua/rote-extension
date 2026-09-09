/* global console, document */
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
const base=resolve(import.meta.dirname,'..');const browser=await chromium.launch({channel:'chromium',headless:true});
const names=['keep-what-matters','see-it-save-it','keep-this-passage','words-and-images','save-it-your-way'];
for(const lang of ['zh','en']){const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});for(let i=0;i<5;i++){await page.goto(pathToFileURL(base+'/render/artwork.html').href+`?lang=${lang}&slide=${i+1}`);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});await page.screenshot({path:base+'/'+(lang==='zh'?'zh-CN':'en')+`/0${i+1}-${names[i]}.png`});console.log(lang,i+1);}await page.close();}
await mkdir(base+'/promo',{recursive:true});for(const [name,width,height] of [['small',440,280],['marquee',1400,560]]){const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});await p.goto(pathToFileURL(base+'/render/promo.html').href+`?size=${name}`);await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});await p.screenshot({path:base+`/promo/${name}.png`});await p.close();}await browser.close();
