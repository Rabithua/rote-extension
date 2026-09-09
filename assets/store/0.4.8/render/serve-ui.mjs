/* global process, console */
// Optional: re-capture original components. Final artwork renders without this server.
import {createServer} from 'vite';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const repo=resolve(import.meta.dirname,'../../../..'),root=import.meta.dirname;
const web=resolve(process.env.ROTE_WEB_ROOT||join(repo,'../Rote/web'));
const runtime=await mkdtemp(join(tmpdir(),'rote-store-ui-'));
await writeFile(join(runtime,'ui.tsx'),await readFile(join(root,'ui.tsx.source')));
const {default:react}=await import(pathToFileURL(join(web,'node_modules/@vitejs/plugin-react-swc/index.js')));
const demo={name:'store-artwork-demo',transformIndexHtml:{order:'pre',handler(html){return html.replace('src="/ui.tsx"',`src="/@fs/${join(runtime,'ui.tsx')}"`)}},configureServer(server){server.middlewares.use('/__demo/woodland.png',async(_req,res)=>{res.setHeader('Content-Type','image/png');res.end(await readFile(join(root,'../sources/demo-woodland.png')));});}};
const server=await createServer({configFile:false,root,plugins:[demo,react()],resolve:{alias:{'@':join(web,'src'),'@rote-web':join(web,'src'),'@extension':join(repo,'src'),react:join(web,'node_modules/react'),'react-dom':join(web,'node_modules/react-dom')}},server:{host:'127.0.0.1',port:43228,fs:{allow:[repo,web,runtime]}}});await server.listen();console.log('Local demo UI: http://127.0.0.1:43228/ui.html');

process.on('SIGINT',async()=>{await server.close();await rm(runtime,{recursive:true,force:true});process.exit(0)});
