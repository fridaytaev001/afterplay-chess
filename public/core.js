import { Chess } from './vendor/chess.js';
export { Chess };
export const MAX_GAMES = 40;
export function normalizeName(name) { return String(name || '').trim().toLowerCase(); }
export function splitPgn(text) {
  const cleaned = String(text).replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  // A new header block after movetext marks the next game; Event is not required.
  return cleaned.split(/\r?\n\s*\r?\n(?=\[[A-Za-z][A-Za-z0-9_]*\s+")/).filter(Boolean);
}
export function parseGames(text, username) {
  const parts = splitPgn(text);
  const games = [], errors = [];
  let unrelated = 0, variants = 0;
  for (let i = 0; i < parts.length && games.length < MAX_GAMES; i++) {
    const chess = new Chess();
    try {
      if (!chess.load_pgn(parts[i], { sloppy: true })) throw new Error('Invalid moves or PGN headers');
      const headers = chess.header();
      if (headers.Variant && !/^standard$|^chess$/i.test(headers.Variant)) { variants++; continue; }
      if (headers.SetUp === '1' || headers.FEN) { variants++; continue; }
      const user = normalizeName(username);
      const color = normalizeName(headers.White) === user ? 'w' : normalizeName(headers.Black) === user ? 'b' : null;
      if (!color) { unrelated++; continue; }
      const moves = chess.history({ verbose: true });
      if (!moves.length || moves.length > 1200) throw new Error('Game contains no moves or is too long');
      const link = /^https:\/\/(www\.)?chess\.com\/game\/(live|daily)\/\d+$/.test(headers.Link || headers.Site || '') ? (headers.Link || headers.Site) : null;
      games.push({ id: `game-${i + 1}`, headers, color, moves, pgn: parts[i], link });
    } catch { errors.push(`Game ${i + 1} could not be parsed.`); }
  }
  return { games, errors, unrelated, variants, available: parts.length, capped: games.length === MAX_GAMES && parts.length > MAX_GAMES };
}
const pct = (n, d) => d ? Math.round(100 * n / d) : null;
export function analyzeGames(games, username) {
  if (!games.length) throw new Error('No standard games match that player name. Use the exact White/Black name from the PGN.');
  let wins = 0, losses = 0, draws = 0, unfinished = 0, totalMoves = 0, captures = 0;
  let earlyQueen = 0, flankGames = 0, castleEarly = 0, castleEligible = 0;
  const whiteOpenings = {}, blackResponses = {}, sequences = {}, evidence = [];
  for (const g of games) {
    const own = g.moves.filter(m => m.color === g.color);
    const first10 = own.slice(0, 10), first8 = own.slice(0, 8);
    const queen = first10.findIndex(m => m.piece === 'q');
    const castle = own.findIndex(m => m.flags.includes('k') || m.flags.includes('q'));
    const flank = first8.filter(m => m.piece === 'p' && /[abfgh]/.test(m.from[0]));
    if (queen >= 0) earlyQueen++;
    if (flank.length >= 2) flankGames++;
    if (own.length >= 12 || castle >= 0) { castleEligible++; if (castle >= 0 && castle < 12) castleEarly++; }
    totalMoves += own.length; captures += own.filter(m => m.captured).length;
    const result = g.headers.Result;
    if (result === '1/2-1/2') draws++;
    else if (!result || result === '*') unfinished++;
    else if ((result === '1-0' && g.color === 'w') || (result === '0-1' && g.color === 'b')) wins++;
    else if (result === '1-0' || result === '0-1') losses++;
    if (own[0]) {
      const bag = g.color === 'w' ? whiteOpenings : blackResponses;
      const key = g.color === 'w' ? own[0].san : `${g.moves[0].san} → ${own[0].san}`;
      bag[key] = (bag[key] || 0) + 1;
    }
    const seq = own.slice(0, 4).map(m => m.san).join(' ');
    if (seq) sequences[seq] = (sequences[seq] || 0) + 1;
    evidence.push({ id: g.id, opponent: g.color === 'w' ? g.headers.Black : g.headers.White, color: g.color, date: g.headers.Date || 'Unknown date', result: result || '*', link: g.link, firstMoves: own.slice(0, 6).map(m => m.san), earlyQueen: queen >= 0 ? queen + 1 : null, castleMove: castle >= 0 ? castle + 1 : null });
  }
  const sort = bag => Object.entries(bag).sort((a,b) => b[1]-a[1]).map(([move,count]) => ({move,count}));
  const observations = [
    { id: 'queen', label: 'Early queen activity', value: pct(earlyQueen, games.length), numerator: earlyQueen, denominator: games.length, detail: 'Games with a queen move in your first 10 moves. Short games offer less observation time.' },
    { id: 'castle', label: 'Castled by move 12', value: pct(castleEarly, castleEligible), numerator: castleEarly, denominator: castleEligible, detail: 'Includes games where you played 12 moves, plus games where you castled earlier.' },
    { id: 'flank', label: 'Early flank pawn play', value: pct(flankGames, games.length), numerator: flankGames, denominator: games.length, detail: 'Games with at least two a-, b-, f-, g-, or h-pawn moves in your first 8 moves.' },
    { id: 'captures', label: 'Capture frequency', value: pct(captures, totalMoves), numerator: captures, denominator: totalMoves, detail: 'Your moves that captured a piece. This alone does not establish aggression or accuracy.' }
  ];
  const signature = earlyQueen / games.length >= .45 ? 'An active queen' : flankGames / games.length >= .45 ? 'Play on the wings' : castleEligible && castleEarly / castleEligible >= .7 ? 'King safety first' : 'A developing repertoire';
  return { username: String(username).trim(), games: games.length, totalMoves, wins, losses, draws, unfinished, signature, observations, whiteOpenings: sort(whiteOpenings), blackResponses: sort(blackResponses), sequences: sort(sequences).slice(0,5), evidence, confidence: games.length < 10 ? 'Small sample: treat patterns as tentative.' : 'Descriptive sample, not a rating or proof of a weakness.' };
}
const VALUES = { p:100, n:320, b:335, r:500, q:900, k:0 };
function evaluate(chess) {
  let score = 0, bishops = {w:0,b:0}; const board=chess.board();
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p=board[r][f]; if (!p) continue;
    const advance=p.color==='w'?6-r:r-1;
    const center=3.5-(Math.abs(f-3.5)+Math.abs(r-3.5))/2;
    let bonus=p.type==='p'?advance*7+center*5:p.type==='n'?center*18:p.type==='b'?center*10:p.type==='r'?advance*2:p.type==='q'?center*3:0;
    if(p.type==='k') bonus=(p.color==='w'?r===7:r===0)&&[2,6].includes(f)?35:0;
    if(p.type==='b')bishops[p.color]++;
    score+=(p.color==='w'?1:-1)*(VALUES[p.type]+bonus);
  }
  if(bishops.w>=2)score+=25;if(bishops.b>=2)score-=25;
  return score;
}
function ordered(chess) { return chess.moves({verbose:true}).sort((a,b)=>(VALUES[b.captured]||0)*10-(VALUES[b.piece]||0)-((VALUES[a.captured]||0)*10-(VALUES[a.piece]||0))); }
export function rankCandidates(fen, options={}) {
  const chess=new Chess(fen), root=chess.turn(), deadline=Date.now()+(options.budgetMs||950);
  let nodes=0, timedOut=false;
  function search(depth,alpha,beta,ply) {
    if(++nodes%64===0 && Date.now()>deadline) { timedOut=true; return evaluate(chess)*(chess.turn()==='w'?1:-1); }
    if(timedOut)return evaluate(chess)*(chess.turn()==='w'?1:-1);
    const moves=ordered(chess);
    if(!moves.length)return chess.in_check()?-100000+ply:0;
    if(chess.in_draw())return 0;
    if(depth===0)return evaluate(chess)*(chess.turn()==='w'?1:-1);
    let best=-Infinity;
    for(const move of moves) {
      chess.move(move); const value=-search(depth-1,-beta,-alpha,ply+1); chess.undo();
      best=Math.max(best,value);alpha=Math.max(alpha,value);if(alpha>=beta||timedOut)break;
    }
    return best;
  }
  const moves=ordered(chess); if(!moves.length)return {candidates:[],nodes,depth:0};
  let scores=moves.map(m=>({move:m,score:0})), completed=0;
  for(let depth=1;depth<=(options.depth||3);depth++) {
    const iteration=[];
    for(const item of scores) {
      chess.move(item.move);const score=-search(depth-1,-Infinity,Infinity,1);chess.undo();
      iteration.push({move:item.move,score});if(timedOut)break;
    }
    if(timedOut)break;
    scores=iteration.sort((a,b)=>b.score-a.score);completed=depth;
  }
  const best=scores[0].score;
  const candidates=scores.filter(s=>s.score>=best-80).slice(0,6).map(({move,score})=>({ uci:move.from+move.to+(move.promotion||''),san:move.san,from:move.from,to:move.to,promotion:move.promotion||null,score:Math.round(score),capture:move.captured||null,check:move.san.includes('+')||move.san.includes('#'),piece:move.piece }));
  return { candidates, nodes, depth:completed, color:root, note:'Prototype search scores, not Stockfish evaluations or Elo.' };
}
export function applyUci(chess,uci) {
  if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))return null;
  return chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
}
