export function endpoint(fn,{get=false}={}) {return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  if(req.method!==(get?'GET':'POST')){res.statusCode=405;res.setHeader('Allow',get?'GET':'POST');return res.end(JSON.stringify({error:'Method not allowed'}));}
  try {
    let data=req.body;
    if(!get&&!data){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2_100_000){res.statusCode=413;return res.end(JSON.stringify({error:'Request exceeds 2 MB.'}));}}data=raw?JSON.parse(raw):{};}
    if(typeof data==='string')data=JSON.parse(data);
    if(data&&Buffer.byteLength(JSON.stringify(data))>2_100_000){res.statusCode=413;return res.end(JSON.stringify({error:'Request exceeds 2 MB.'}));}
    const result=await fn(data||{});res.statusCode=200;res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e.status|| (e instanceof SyntaxError?400:500);res.end(JSON.stringify({error:e.status?e.message:e instanceof SyntaxError?'Invalid JSON.':'Could not complete the request. Please retry.'}));}
};}
