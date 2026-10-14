import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const names=['import','analyze','strategy','move','compare','status'];
const handlers=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await import(`./api/${name}.js`)).default])));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.pgn':'text/plain; charset=utf-8','.json':'application/json'};
export const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){const handler=handlers[url.pathname.slice(5)];if(handler)return handler(req,res);res.writeHead(404);return res.end('Not found');}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let name;try{name=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
  const publicRoot=path.join(root,'public'), file=path.resolve(publicRoot,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403);return res.end();}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Afterplay Chess: http://localhost:${process.env.PORT||3000}`));
