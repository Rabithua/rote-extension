import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

type Attachment = {id:string;url:string;details:{key:string}};
type Note = {id:string;content:string;state:string;tags:string[];attachments:Attachment[]};
const notes: Note[] = [];
const uploads = new Map<string,number>();
let failure = '';
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
  if(url.pathname==='/__reset'){notes.length=0;uploads.clear();failure='';reply({});return;}
  if(url.pathname==='/__state'){reply({notes,uploads:[...uploads],failure});return;}
  if(url.pathname==='/__fail'){failure=body.failure;reply({});return;}
  if(url.pathname.startsWith('/upload/') && req.method==='PUT'){
    if(failure==='hang-upload'){failure='upload-pending';return;}
    if(failure==='upload'){failure='';reply({},503);return;}
    uploads.set(url.pathname.slice('/upload/'.length),bytes.length);res.writeHead(200).end();return;
  }
  const path=url.pathname.replace('/v2/api/openkey','');
  if(path==='/permissions'){reply({permissions:['SENDROTE','UPLOADATTACHMENT','GETROTE']});return;}
  if(path==='/notes' && req.method==='POST'){
    if(failure==='create403'){failure='';reply({},403);return;}
    const note={id:randomUUID(),content:body.content,state:body.state,tags:body.tags,attachments:[]};notes.push(note);
    if(failure==='lost-create'){failure='';res.writeHead(201,{'Content-Type':'application/json'});res.end('{');return;}
    reply(note,201);return;
  }
  if(path==='/notes/search'){reply(notes.filter(note=>note.content.includes(url.searchParams.get('keyword')!)));return;}
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
