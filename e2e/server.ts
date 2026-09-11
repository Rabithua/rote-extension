import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

type Attachment = {id:string;url:string;details:{key:string}};
type Note = {id:string;content:string;state:string;archived:boolean;tags:string[];attachments:Attachment[]};
const notes: Note[] = [];
const uploads = new Map<string,number>();
let failure = '';
let protocol = false;
const ownerId='22222222-2222-4222-8222-222222222222';
const server=createServer(async (req,res)=>{
  const url=new URL(req.url!,'http://127.0.0.1:43119');
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  const reply=(data:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({data}));};
  const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk));
  const bytes=Buffer.concat(chunks);
  const body=bytes.length && req.headers['content-type']?.includes('json') ? JSON.parse(bytes.toString()) : {};
  if(url.pathname==='/health'){reply({ready:true});return;}
  if(url.pathname==='/__reset'){notes.length=0;uploads.clear();failure='';protocol=false;reply({});return;}
  if(url.pathname==='/__protocol'){protocol=body.enabled===true;reply({});return;}
  if(url.pathname==='/__state'){reply({notes,uploads:[...uploads],failure});return;}
  if(url.pathname==='/__fail'){failure=body.failure;reply({});return;}
  if(url.pathname.startsWith('/upload/') && req.method==='PUT'){
    if(failure==='hang-upload'){failure='upload-pending';return;}
    if(failure==='upload'){failure='';reply({},503);return;}
    uploads.set(url.pathname.slice('/upload/'.length),bytes.length);res.writeHead(200).end();return;
  }
  const path=url.pathname.replace('/v2/api/openkey','');
  if(path==='/permissions'){reply({permissions:['SENDROTE','UPLOADATTACHMENT','GETROTE'],...(protocol ? {ownerId,capabilities:{noteCreateIdempotency:1}} : {})});return;}
  if(path==='/notes' && req.method==='POST'){
    if(failure==='create403'){failure='';reply({},403);return;}
    const identity=protocol ? req.headers['idempotency-key'] as string | undefined : undefined;
    const existing=identity ? notes.find(note=>note.id===identity) : undefined;
    if(existing){reply(existing,201);return;}
    const note={id:identity??randomUUID(),content:body.content,state:body.state,archived:body.archived??false,tags:body.tags,attachments:[]};notes.push(note);
    if(failure==='disconnect-create'){failure='';res.destroy();return;}
    if(failure==='hang-create'){failure='create-pending';return;}
    if(failure==='lost-create'){failure='';res.writeHead(201,{'Content-Type':'application/json'});res.end('{');return;}
    reply(note,201);return;
  }
  if(path==='/notes/search'){
    const matches=notes.filter(note=>note.content.includes(url.searchParams.get('keyword')!));
    if(failure==='search403'){reply({},403);return;}
    if(failure==='search-empty'){reply([]);return;}
    if(failure==='search-mismatch'){reply(matches.map(note=>({...note,content:note.content+' edited'})));return;}
    if(failure==='search-ambiguous'){reply([...matches,...matches.map(note=>({...note,id:randomUUID()}))]);return;}
    if(failure==='search-slow'){setTimeout(()=>reply(matches),800);return;}
    reply(matches);return;
  }
  if(path.startsWith('/notes/') && req.method==='GET'){const note=notes.find(note=>note.id===path.split('/').at(-1));reply(note,note?200:404);return;}
  if(path==='/attachments/presign'){
    reply({items:body.files.map((file:{contentType:string})=>{
      const uuid=randomUUID();return {uuid,original:{key:`original/${uuid}.png`,putUrl:`http://127.0.0.1:43119/upload/${uuid}`,contentType:file.contentType}};
    })});return;
  }
  if(path==='/attachments/finalize'){
    const note=notes.find(note=>note.id===body.noteId);
    if(!note){reply({},404);return;}
    const result=body.attachments.map((item:{uuid:string;originalKey:string})=>{
      const existing=note.attachments.find(a=>a.details.key===item.originalKey);if(existing)return existing;
      const attachment={id:randomUUID(),url:`http://127.0.0.1:43119/${item.originalKey}`,details:{key:item.originalKey}};
      note.attachments.push(attachment);return attachment;
    });reply(result,201);return;
  }
  reply({},404);
});
server.listen(43119,'127.0.0.1');
