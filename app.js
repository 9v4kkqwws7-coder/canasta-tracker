const TARGET=5000, KEY='canastaTrackerDataV2';
let state=load();
function fresh(){return{current:{startedAt:new Date().toISOString(),rounds:[]},games:[]}}
function load(){try{return JSON.parse(localStorage.getItem(KEY))||fresh()}catch{return fresh()}}
function persist(){localStorage.setItem(KEY,JSON.stringify(state));render()}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function totals(rounds=state.current.rounds){return rounds.reduce((a,r)=>({mu:a.mu+Number(r.mu),as:a.as+Number(r.as)}),{mu:0,as:0})}
function fmt(n){return new Intl.NumberFormat('de-DE').format(n)}
function dateFmt(s){return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium'}).format(new Date(s))}
function render(){
 const t=totals(); $('#muTotal').textContent=fmt(t.mu); $('#asTotal').textContent=fmt(t.as);
 $('#muRemaining').textContent=t.mu>=TARGET?'Ziel erreicht':`Noch ${fmt(TARGET-t.mu)}`;
 $('#asRemaining').textContent=t.as>=TARGET?'Ziel erreicht':`Noch ${fmt(TARGET-t.as)}`;
 $('#roundHeading').textContent=`Runde ${state.current.rounds.length+1}`;
 const rl=$('#roundsList'); rl.innerHTML='';
 if(!state.current.rounds.length){rl.textContent='Noch keine Runde gespeichert.';rl.className='list empty'} else {rl.className='list';let c={mu:0,as:0};state.current.rounds.forEach((r,i)=>{c.mu+=+r.mu;c.as+=+r.as;const d=document.createElement('div');d.className='row';d.innerHTML=`<div><strong>Runde ${i+1}: MU ${fmt(r.mu)} · AS ${fmt(r.as)}</strong><div class="round-meta">Gesamt: ${fmt(c.mu)} : ${fmt(c.as)}</div></div><button data-edit="${i}">Ändern</button><button data-del="${i}">Löschen</button>`;rl.appendChild(d)})}
 const hl=$('#historyList');hl.innerHTML='';if(!state.games.length){hl.textContent='Noch keine beendeten Spiele.';hl.className='list empty'}else{hl.className='list';[...state.games].reverse().forEach((g,rev)=>{const i=state.games.length-1-rev;const t=totals(g.rounds);const winner=t.mu===t.as?'Unentschieden':t.mu>t.as?'MU':'AS';const d=document.createElement('div');d.className='row';d.innerHTML=`<div><strong>${dateFmt(g.finishedAt)} · ${winner}</strong><div class="history-meta">MU ${fmt(t.mu)} : ${fmt(t.as)} AS · ${g.rounds.length} Runden</div></div><button data-load="${i}">Ansehen</button><button data-game-del="${i}">Löschen</button>`;hl.appendChild(d)})}
 renderStats();
}
function renderStats(){const games=state.games;let muWins=0,asWins=0,totalRounds=0,bestMu=null,bestAs=null;games.forEach(g=>{const t=totals(g.rounds);if(t.mu>t.as)muWins++;else if(t.as>t.mu)asWins++;totalRounds+=g.rounds.length;g.rounds.forEach(r=>{bestMu=bestMu===null?+r.mu:Math.max(bestMu,+r.mu);bestAs=bestAs===null?+r.as:Math.max(bestAs,+r.as)})});const vals=[['Spiele',games.length],['Siege MU',muWins],['Siege AS',asWins],['MU Siegquote',games.length?`${Math.round(muWins/games.length*100)} %`:'–'],['Ø Runden',games.length?(totalRounds/games.length).toFixed(1):'–'],['Beste MU-Runde',bestMu??'–'],['Beste AS-Runde',bestAs??'–'],['Gespeicherte Runden',games.reduce((s,g)=>s+g.rounds.length,0)+state.current.rounds.length]];$('#statsGrid').innerHTML=vals.map(([k,v])=>`<article class="stat"><strong>${v}</strong><span>${k}</span></article>`).join('')}
function saveRound(){const mu=$('#muInput').value,as=$('#asInput').value;if(mu===''||as===''){alert('Bitte Punkte für MU und AS eingeben.');return}state.current.rounds.push({mu:+mu,as:+as});$('#muInput').value='';$('#asInput').value='';const t=totals();persist();if(t.mu>=TARGET||t.as>=TARGET){setTimeout(()=>{if(confirm(`Ziel erreicht (${fmt(t.mu)} : ${fmt(t.as)}). Spiel beenden?`))finishGame()},50)}}
function finishGame(){if(!state.current.rounds.length)return alert('Noch keine Runde gespeichert.');state.games.push({startedAt:state.current.startedAt,finishedAt:new Date().toISOString(),rounds:structuredClone(state.current.rounds)});state.current={startedAt:new Date().toISOString(),rounds:[]};persist()}
$('#saveRoundBtn').onclick=saveRound;
$('#finishGameBtn').onclick=finishGame;
$('#newGameBtn').onclick=()=>{if(state.current.rounds.length&&!confirm('Aktuelles Spiel verwerfen und neu beginnen?'))return;state.current={startedAt:new Date().toISOString(),rounds:[]};persist()};
$('#undoBtn').onclick=()=>{if(state.current.rounds.length&&confirm('Letzte Runde löschen?')){state.current.rounds.pop();persist()}};
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));$$('.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.view).classList.add('active')});
document.addEventListener('click',e=>{const ed=e.target.dataset.edit;if(ed!==undefined){const r=state.current.rounds[+ed];$('#editIndex').value=ed;$('#editMu').value=r.mu;$('#editAs').value=r.as;$('#editDialog').showModal()}const del=e.target.dataset.del;if(del!==undefined&&confirm('Diese Runde löschen?')){state.current.rounds.splice(+del,1);persist()}const gd=e.target.dataset.gameDel;if(gd!==undefined&&confirm('Dieses gespeicherte Spiel löschen?')){state.games.splice(+gd,1);persist()}const ld=e.target.dataset.load;if(ld!==undefined){const g=state.games[+ld],t=totals(g.rounds);alert(`${dateFmt(g.finishedAt)}\nMU ${fmt(t.mu)} : ${fmt(t.as)} AS\n${g.rounds.length} Runden`)}});
$('#saveEditBtn').onclick=e=>{e.preventDefault();const i=+$('#editIndex').value;state.current.rounds[i]={mu:+$('#editMu').value,as:+$('#editAs').value};$('#editDialog').close();persist()};
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`canasta-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
$('#importInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!d.current||!Array.isArray(d.games))throw new Error();if(confirm('Vorhandene Daten durch dieses Backup ersetzen?')){state=d;persist()}}catch{alert('Ungültige Backup-Datei.')}e.target.value=''};
$('#resetBtn').onclick=()=>{if(confirm('Wirklich alle Canasta-Daten auf diesem Gerät löschen?')){state=fresh();persist()}};
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
