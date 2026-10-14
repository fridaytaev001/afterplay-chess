import {Chess,parseGames,analyzeGames} from './core.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={pgn:'',profile:null,strategy:null,source:'',chess:new Chess(),human:'w',selected:null,last:null,busy:false,connected:false,revision:0,promotion:null};
const pieces={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'},names={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'};
function notice(text,good=false){$('notice').textContent=text;$('notice').className='notice'+(good?' success':'');$('notice').hidden=!text;}
async function api(name,data){const res=await fetch('/api/'+name,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});let value;try{value=await res.json();}catch{throw new Error('The server did not return JSON. Start the Node server or deploy the complete project, including its api folder.');}if(!res.ok)throw new Error(value.error||'The request failed.');return value;}
function persist(){try{localStorage.setItem('afterplay-chess-v1',JSON.stringify({pgn:state.pgn,username:state.profile?.username,strategy:state.strategy,source:state.source}));}catch{notice('Your games are loaded for this session, but browser storage is full.');}}
function view(name){for(const n of ['prepare','play','memory'])$(n+'-view').hidden=n!==name;for(const b of document.querySelectorAll('.tab')){b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-selected',String(b.dataset.view===name));}if(name==='play')renderBoard();}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
function renderProfile(){
  const p=state.profile;if(!p)return;
  $('memory-tag').textContent=state.source==='Synthetic sample'?'SYNTHETIC SAMPLE':`${p.games} GAMES LOADED`;$('memory-tag').className='pill ready';
  const metrics=p.observations.filter(m=>m.id!=='captures').map(m=>`<div class="metric"><div class="metric-head"><span>${esc(m.label)}</span><strong>${m.value===null?'—':m.value+'%'}</strong></div><div class="bar"><span style="width:${m.value||0}%"></span></div><small>${m.numerator} of ${m.denominator} eligible games · ${esc(m.detail)}</small></div>`).join('');
  const openings=p.whiteOpenings.length?p.whiteOpenings.slice(0,3).map(o=>`<div><span>As White: <strong>${esc(o.move)}</strong></span><span>${o.count} game${o.count===1?'':'s'}</span></div>`).join(''):p.blackResponses.slice(0,3).map(o=>`<div><span>As Black: <strong>${esc(o.move)}</strong></span><span>${o.count} games</span></div>`).join('');
  $('profile-content').className='';$('profile-content').innerHTML=`<div class="profile-sub">THE OBSERVED SIGNATURE OF ${esc(p.username.toUpperCase())}</div><h3 class="player-signature">${esc(p.signature)}.</h3><div class="profile-sub">${p.games} games · ${p.totalMoves} player moves · ${esc(state.source)}</div><div class="results"><div class="result"><strong>${p.wins}</strong><span>Wins</span></div><div class="result"><strong>${p.losses}</strong><span>Losses</span></div><div class="result"><strong>${p.draws}</strong><span>Draws</span></div>${p.unfinished?`<div class="result"><strong>${p.unfinished}</strong><span>Unfinished</span></div>`:''}</div>${metrics}<div class="opening-list">${openings}</div><p class="confidence">${esc(p.confidence)}</p><button id="inspect-evidence" class="quiet">Inspect the games behind this profile →</button>`;
  $('inspect-evidence').onclick=()=>view('memory');$('build-strategy').disabled=false;$('player-name').textContent=p.username;
  const notes=p.importNotes||{};
  $('evidence').innerHTML=`<p class="fine">${esc(state.source)}. ${notes.unrelated||0} games skipped for a different player; ${notes.variants||0} variants/custom positions skipped; ${notes.errors?.length||0} parse failures. Up to 40 games are used.</p>`+p.evidence.map(g=>`<article class="evidence-item"><div><strong>${esc(g.id)} · ${g.color==='w'?'White':'Black'} vs ${esc(g.opponent||'Unknown')}</strong><p>${esc(g.date)} · ${esc(g.result)} · ${g.earlyQueen?'Queen first moved on turn '+g.earlyQueen:'No queen move in first 10 turns'} · ${g.castleMove?'Castled on turn '+g.castleMove:'No castling observed'}</p><code>${esc(g.firstMoves.join(' · '))}</code></div>${g.link?`<a href="${esc(g.link)}" target="_blank" rel="noreferrer">View game ↗</a>`:''}</article>`).join('');
  renderStrategy();
}
function renderStrategy(){const s=state.strategy;
  if(!s){$('strategy-content').innerHTML='<div class="strategy-empty"><span>↗</span><h3>Your history is ready.</h3><p>Build a counter-plan to turn these observations into an opponent’s memory.</p></div>';$('build-strategy').textContent='Build opponent memory ↗';$('opponent-name').textContent='Afterplay';$('opponent-description').textContent='History loaded. Build a model counter-plan, or play using the measured profile.';return;}
  $('strategy-content').innerHTML=`<h3 class="player-signature">${esc(s.title)}</h3><p class="strategy-summary">${esc(s.summary)}</p>`+s.plans.map((p,i)=>`<div class="plan"><small>COUNTER-PLAN ${i+1}</small><p>${esc(p.counter)}</p><div class="observation">Observed: ${esc(p.observation)}</div><div class="limitation">${esc(p.limitation)}</div><div class="fine">Evidence: ${esc((p.evidenceIds||[]).join(', ')||'aggregate profile')}</div></div>`).join('')+`<p class="fine">Model: ${esc(s.model)}</p><button id="challenge" class="secondary full">Challenge this opponent →</button>`;
  $('challenge').onclick=()=>{if(state.connected)$('mode').value='adapted';newGame();view('play');};$('build-strategy').textContent='Rebuild opponent memory ↗';$('opponent-name').textContent=s.title;$('opponent-description').textContent=s.summary;
}
function loadPgn(pgn,username,source){
  if(pgn.length>2_000_000)throw new Error('Please use a PGN smaller than 2 MB.');
  const parsed=parseGames(pgn,username),profile=analyzeGames(parsed.games,username);
  profile.importNotes={errors:parsed.errors,unrelated:parsed.unrelated,variants:parsed.variants,capped:parsed.capped};
  state.pgn=parsed.games.map(g=>g.pgn).join('\n\n');state.profile=profile;state.strategy=null;state.source=source;$('username').value=username;
  renderProfile();persist();notice(`Loaded ${profile.games} games for ${username}.${parsed.errors.length?' '+parsed.errors.length+' games could not be parsed.':''}${parsed.unrelated?' '+parsed.unrelated+' games did not match that name.':''}`,true);
}
$('import-form').onsubmit=async e=>{e.preventDefault();const b=$('import-button'),name=$('username').value.trim();b.disabled=true;b.textContent='Importing recent games…';notice('Fetching recent monthly archives from Chess.com…');try{const data=await api('import',{username:name});loadPgn(data.pgn,data.username,data.source);}catch(e){notice(e.message);}finally{b.disabled=false;b.innerHTML='Import from Chess.com <span>↗</span>';}};
async function fileImport(file){if(!file)return;try{if(file.size>2_000_000)throw new Error('Please use a PGN smaller than 2 MB.');if(!$('username').value.trim())throw new Error('Enter your player name first, exactly as it appears in the PGN.');loadPgn(await file.text(),$('username').value.trim(),'Uploaded PGN');}catch(e){notice(e.message);}}
$('pgn-file').onchange=e=>fileImport(e.target.files[0]);const drop=document.querySelector('.upload');drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');fileImport(e.dataTransfer.files[0]);};
$('analyze-paste').onclick=()=>{try{loadPgn($('pgn-text').value,$('username').value.trim(),'Pasted PGN');}catch(e){notice(e.message);}};
$('sample').onclick=async()=>{try{loadPgn(await(await fetch('/sample.pgn')).text(),'DemoPlayer','Synthetic sample');}catch(e){notice(e.message);}};
$('build-strategy').onclick=async()=>{if(!state.profile)return;const b=$('build-strategy');b.disabled=true;b.classList.add('loading');b.textContent='Studying your signature…';notice('The model is preparing a counter-plan from your measured habits.');try{const result=await api('strategy',{pgn:state.pgn,username:state.profile.username});state.profile=result.profile;state.strategy=result.strategy;renderProfile();persist();notice('Opponent memory prepared. Open Play a game to challenge it.',true);}catch(e){notice(e.message);}finally{b.disabled=false;b.classList.remove('loading');b.textContent=state.strategy?'Rebuild opponent memory ↗':'Build opponent memory ↗';}};
function statusText(){const c=state.chess;if(c.in_checkmate())return (c.turn()===state.human?'Afterplay wins':'You win')+' · checkmate';if(c.in_stalemate())return 'Draw · stalemate';if(c.in_threefold_repetition())return 'Draw · threefold repetition';if(c.insufficient_material())return 'Draw · insufficient material';if(c.in_draw())return 'Draw';return (c.turn()===state.human?'Your move':'Afterplay to move')+(c.in_check()?' · check':'');}
function renderBoard(){
  const c=state.chess,files=state.human==='w'?'abcdefgh':'hgfedcba',ranks=state.human==='w'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
  const legal=state.selected?c.moves({square:state.selected,verbose:true}):[];
  $('board').innerHTML=ranks.map((rank,ri)=>[...files].map((file,fi)=>{const sq=file+rank,p=c.get(sq),dark=((file.charCodeAt(0)-97)+rank)%2===1,classes=['square',dark?'dark':'',p?'has-piece':'',state.selected===sq?'selected':'',state.last&&(state.last.from===sq||state.last.to===sq)?'last':'',legal.some(m=>m.to===sq)?'legal':''].join(' ');return `<button class="${classes}" data-square="${sq}" aria-label="${sq}${p?' '+(p.color==='w'?'white':'black')+' '+names[p.type]:''}" ${state.busy?'aria-disabled="true"':''}>${p?`<span class="piece ${p.color==='w'?'white':''}">${pieces[p.type]}</span>`:''}${ri===7?`<span class="coord">${file}</span>`:''}${fi===0?`<span class="coord rank-coord">${rank}</span>`:''}</button>`;}).join('')).join('');
  for(const square of $('board').querySelectorAll('button'))square.onclick=()=>clickSquare(square.dataset.square);
  $('board-status').textContent=state.busy?'Afterplay is considering its move…':statusText();
  const history=c.history(),rows=[];for(let i=0;i<history.length;i+=2)rows.push(`<div class="move-row"><span>${i/2+1}.</span><span>${esc(history[i])}</span><span>${esc(history[i+1]||'')}</span></div>`);$('moves').innerHTML=rows.join('')||'<p class="fine">A fresh board. Make your first move.</p>';$('moves').scrollTop=$('moves').scrollHeight;
  $('bot-label').textContent=$('mode').selectedOptions[0].textContent;$('human-color').textContent=state.human==='w'?'WHITE':'BLACK';$('bot-color').textContent=state.human==='w'?'BLACK':'WHITE';
  for(const id of ['new-game','undo','mode','color','compare','save-game'])$(id).disabled=state.busy;
}
async function clickSquare(sq){
  if(state.busy||state.chess.game_over()||state.chess.turn()!==state.human)return;
  const p=state.chess.get(sq);
  if(state.selected){const candidates=state.chess.moves({square:state.selected,verbose:true}).filter(m=>m.to===sq);if(candidates.length){let promotion='q';if(candidates.some(m=>m.promotion)){promotion=await askPromotion();if(!promotion)return;}const moved=state.chess.move({from:state.selected,to:sq,promotion});if(moved){state.last=moved;state.selected=null;renderBoard();if(!state.chess.game_over())await botMove();return;}}}
  state.selected=p?.color===state.human&&state.selected!==sq?sq:null;renderBoard();
}
function askPromotion(){return new Promise(resolve=>{state.promotion=resolve;$('promotion').showModal();});}
function boardImage(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='50px "Segoe UI Symbol", "DejaVu Sans", serif';
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    ctx.fillStyle=(row+col)%2?'#36464f':'#e7deca';ctx.fillRect(col*64,row*64,64,64);
    const piece=state.chess.get('abcdefgh'[col]+(8-row));if(!piece)continue;
    ctx.fillStyle=piece.color==='w'?'#fffdf2':'#172027';ctx.strokeStyle=piece.color==='w'?'#172027':'#b3c2c7';ctx.lineWidth=1;
    ctx.strokeText(pieces[piece.type],col*64+32,row*64+34);ctx.fillText(pieces[piece.type],col*64+32,row*64+34);
  }
  return canvas.toDataURL('image/png');
}
document.querySelectorAll('[data-piece]').forEach(b=>b.onclick=()=>{const done=state.promotion;state.promotion=null;$('promotion').close();done?.(b.dataset.piece);});$('promotion').oncancel=()=>{state.promotion?.(null);state.promotion=null;};
async function botMove(){
  if(state.busy||state.chess.turn()===state.human||state.chess.game_over())return;
  const rev=state.revision;state.busy=true;$('retry').hidden=true;$('game-message').textContent='';renderBoard();
  try{const result=await api('move',{fen:state.chess.fen(),moves:state.chess.history(),mode:$('mode').value,profile:state.profile,strategy:state.strategy,...($('mode').value==='engine'?{}:{boardImage:boardImage()})});if(rev!==state.revision)return;
    const moved=state.chess.move({from:result.uci.slice(0,2),to:result.uci.slice(2,4),promotion:result.uci[4]||'q'});if(!moved)throw new Error('No legal move was applied. Retry the opponent.');state.last=moved;
    $('decision').innerHTML=`<div class="decision-move">${esc(result.san)}</div><p class="decision-note">${esc(result.reason)}</p><p class="habit-note">${esc(result.habit||'')}</p><p class="fine">${result.model?'Model: '+esc(result.model)+' · '+esc((result.modalities||[]).join(' + ')):'Engine practice · no language model or profile'} · search depth ${result.search.depth}</p>`;
  }catch(e){if(rev===state.revision){$('game-message').textContent=e.message;$('retry').hidden=false;notice(e.message);}}
  finally{if(rev===state.revision){state.busy=false;renderBoard();}}
}
function newGame(){if(state.busy)return;if($('mode').value==='adapted'&&!state.profile){notice('Import your games before choosing an opponent with memory.');return;}state.revision++;state.chess=new Chess();state.human=$('color').value;state.selected=null;state.last=null;$('retry').hidden=true;$('comparison').innerHTML='';$('decision').innerHTML='<p class="muted">A new game. Your opponent’s next decision will appear here.</p>';$('game-message').textContent='';renderBoard();if(state.human==='b')botMove();}
$('new-game').onclick=newGame;$('retry').onclick=botMove;
$('mode').onchange=()=>{if($('mode').value==='adapted'&&!state.profile)notice('Import games first so the model has a profile to use.');renderBoard();if(state.chess.turn()!==state.human)botMove();};
$('undo').onclick=()=>{if(state.busy)return;state.revision++;if(state.chess.history().length){state.chess.undo();if(state.chess.turn()!==state.human&&state.chess.history().length)state.chess.undo();}state.last=null;state.selected=null;$('retry').hidden=true;$('comparison').innerHTML='';$('decision').innerHTML='<p class="muted">Turn taken back. Previous explanations no longer describe this position.</p>';renderBoard();};
function currentPgn(){const c=state.chess,user=state.profile?.username||'Player';let result='*';if(c.in_checkmate())result=c.turn()==='w'?'0-1':'1-0';else if(c.in_draw())result='1/2-1/2';c.header('Event','Afterplay practice','Date',new Date().toISOString().slice(0,10).replace(/-/g,'.'),'White',state.human==='w'?user:'Afterplay','Black',state.human==='b'?user:'Afterplay','Result',result);return c.pgn();}
$('export-game').onclick=()=>{if(!state.chess.history().length){notice('Play a move before exporting.');return;}const blob=new Blob([currentPgn()],{type:'application/x-chess-pgn'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='afterplay-game.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('save-game').onclick=()=>{if(!state.profile){notice('Import a player profile first.');return;}if(!state.chess.history().length){notice('Play a few moves first.');return;}const pgn=currentPgn();const source=state.source;try{loadPgn(pgn+'\n\n'+state.pgn,state.profile.username,source+' + practice');notice('Practice game added. The profile was recalculated and the old counter-plan cleared. Rebuild opponent memory to use the updated plan.',true);}catch(e){notice(e.message);}};
$('compare').onclick=async()=>{
  if(state.busy)return;if(!state.profile){notice('Import your games before comparing memory conditions.');return;}if(state.chess.game_over()){notice('Start a new game to compare decisions.');return;}
  state.busy=true;const b=$('compare'),side=state.chess.turn()==='w'?'White':'Black';b.textContent='Comparing two decisions…';$('comparison').textContent=`Comparing the current position for ${side} to move. No move will be applied.`;renderBoard();
  try{const result=await api('compare',{fen:state.chess.fen(),moves:state.chess.history(),profile:state.profile,strategy:state.strategy,boardImage:boardImage()});$('comparison').innerHTML=`<p>Same position · ${side} to move.</p><article><small>WITHOUT YOUR MEMORY</small><h3>${esc(result.without.san)}</h3><p>${esc(result.without.reason)}</p></article><article><small>WITH YOUR MEMORY</small><h3>${esc(result.withMemory.san)}</h3><p>${esc(result.withMemory.reason)}</p><small>${esc(result.withMemory.habit)}</small></article><p>${result.same?'Both conditions chose the same move.':'The conditions chose different moves.'}</p><small>${esc(result.note)}</small>`;}catch(e){$('comparison').textContent=e.message;notice(e.message);}finally{state.busy=false;b.textContent='Compare with / without memory';renderBoard();}
};
$('clear-memory').onclick=()=>{if(state.busy)return;localStorage.removeItem('afterplay-chess-v1');location.reload();};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
try{const saved=JSON.parse(localStorage.getItem('afterplay-chess-v1')||'null');if(saved?.pgn&&saved.username){loadPgn(saved.pgn,saved.username,saved.source||'Saved browser history');if(saved.strategy){state.strategy=saved.strategy;renderStrategy();}notice('Restored your player memory from this browser.',true);}}catch{/* Broken or unavailable storage does not block a fresh import. */}
renderBoard();
api('status').then(s=>{state.connected=s.connected;$('connection').textContent=s.connected?'AI Gateway key configured':'Engine practice available · AI not connected';$('connection').classList.toggle('online',s.connected);for(const option of $('mode').options)if(option.value!=='engine')option.disabled=!s.connected;}).catch(()=>{$('connection').textContent='Server unavailable';});
