import { FORMATIONS, roleFit, strictRoleFit, roleStatus, getTeamDepartments, computeGel, computeAvgOvr } from './formations.js';
import { COACHES, COACH_FIT, TACTICAL_INSTRUCTIONS, coachName } from './coaches.js';
import { COMMENTATORS, BROADCASTERS, PUNDITS } from './commentary.js';
import { TEAM_PALETTES, REFEREES, WEATHER, MATCH_PERSONALITIES, RANDOM_ARCHETYPES, stadiumInfo, homeBoostFor, estimateAttendance } from './config.js';
import { runSimulation } from './match-engine.js';
import { pick, rndInt, matchName, fmtNum, ovrColor, topPlayerName } from './utils.js';

export function initMatchSimulator(data) {
  const { players = [], allNations = [], allDecades = [] } = data || {};
  const playerById = new Map(players.map(p=>[String(p.id),p]));

function showToast(msg){
  const el=document.getElementById('buildToast');if(!el)return;
  el.textContent=msg;el.classList.add('visible');
  clearTimeout(showToast._t);showToast._t=setTimeout(()=>el.classList.remove('visible'),1800);
}

const state={
  formationA:'4-3-3',formationB:'4-3-3',
  startersA:new Array(11).fill(null),startersB:new Array(11).fill(null),
  benchA:new Array(11).fill(null),benchB:new Array(11).fill(null),
  usedA:new Set(),usedB:new Set(),
  filterNatA:'',filterDecA:0,filterNatB:'',filterDecB:0,
  colorA:'emerald',colorB:'crimson',
  captainA:null,captainB:null,
  liveSpeed:'normal',
  simCount:0,
};

// ── UI INIT ──
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function teamPalette(side){return TEAM_PALETTES[state['color'+side]]||TEAM_PALETTES[side==='A'?'emerald':'crimson'];}
function applyTeamColors(){
  const sim=document.getElementById('simulator');if(!sim)return;
  ['A','B'].forEach(side=>{
    const p=teamPalette(side),key=side.toLowerCase();
    sim.style.setProperty('--team-'+key,p.main);
    sim.style.setProperty('--team-'+key+'-live',p.live);
    sim.style.setProperty('--team-'+key+'-soft',p.soft);
    sim.style.setProperty('--team-'+key+'-border',p.border);
    sim.style.setProperty('--team-'+key+'-rgb',p.rgb);
    const sw=document.getElementById('colorSwatch'+side);if(sw)sw.style.background='linear-gradient(135deg,'+p.main+','+p.live+')';
  });
}
function initTeamColorSelects(){
  ['A','B'].forEach(side=>{
    const sel=document.getElementById('teamColor'+side);if(!sel)return;
    sel.innerHTML='';
    Object.entries(TEAM_PALETTES).forEach(([id,p])=>{const o=document.createElement('option');o.value=id;o.textContent=p.label;sel.appendChild(o);});
    sel.value=state['color'+side];
    sel.addEventListener('change',()=>{
      const other=side==='A'?'B':'A';
      if(sel.value===state['color'+other]){
        sel.value=state['color'+side];
        showToast('Choose two different kit colours.');
        return;
      }
      state['color'+side]=sel.value;applyTeamColors();
      drawPitch('pitch'+side,side);drawPitch('pitch'+other,other);
      updateWinProb();computeAndShowTacticalClash();
    });
  });
  applyTeamColors();
}
function initCoachSelect(id){
  const s=document.getElementById(id);
  COACHES.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name+' · '+c.style;s.appendChild(o);});
  s.addEventListener('change',()=>{updateCoachFitBadge();updateValidation();updateMatchPreview();});
}
function initRefereeSelect(){
  const s=document.getElementById('setReferee');
  REFEREES.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name+' · '+r.profile;s.appendChild(o);});
  updateRefereeInsight();
}
function refereeLens(ref){
  if(ref.controversial)return ref.name+' can turn a quiet match into theatre: low control, high controversy risk.';
  if(ref.strictness>=0.76)return ref.name+' is authoritative. Expect fewer cheap duels and a higher card threshold for reckless sides.';
  if(ref.strictness>=0.68)return ref.name+' keeps a firm line but usually lets football breathe.';
  if(ref.strictness>=0.58)return ref.name+' is balanced-to-lenient: physical teams may get a little more rope.';
  return ref.name+' lets a lot go. The match may feel wilder, especially with aggressive squads.';
}
function updateRefereeInsight(){
  const ref=REFEREES.find(r=>r.id===document.getElementById('setReferee')?.value)||REFEREES[0];
  const insight=document.getElementById('refereeInsight');
  if(insight)insight.textContent=refereeLens(ref);
}
function liveSpeedFactor(){
  return state.liveSpeed==='cinematic'?1.35:state.liveSpeed==='fast'?0.58:1;
}
function syncLiveSpeedButtons(){
  document.querySelectorAll('[data-live-speed]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.liveSpeed===state.liveSpeed);
  });
}
function initFilterSelects(){
  ['A','B'].forEach(side=>{
    const natSel=document.getElementById('filterNat'+side);
    allNations.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;natSel.appendChild(o);});
    natSel.addEventListener('change',()=>{state['filterNat'+side]=natSel.value;buildSlots(side,false);buildSlots(side,true);});
    const decSel=document.getElementById('filterDec'+side);
    allDecades.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d+'s';decSel.appendChild(o);});
    decSel.addEventListener('change',()=>{state['filterDec'+side]=decSel.value?parseInt(decSel.value):0;buildSlots(side,false);buildSlots(side,true);});
  });
}
function updateCoachFitBadge(){
  ['A','B'].forEach(side=>{
    const coachId=document.getElementById('setCoach'+side).value;
    const formation=state['formation'+side];
    const badge=document.getElementById('coachFit'+side);
    if(!coachId){badge.textContent='—';badge.className='coach-fit-badge cfit-med';return;}
    const fit=COACH_FIT[coachId];
    if(!fit){badge.textContent='—';badge.className='coach-fit-badge cfit-med';return;}
    if(fit.pref.includes(formation)){badge.textContent='✓ Perfect fit';badge.className='coach-fit-badge cfit-ok';}
    else{badge.textContent='Best: '+fit.pref[0];badge.className='coach-fit-badge cfit-bad';}
  });
}
function initFormationBtns(side){
  const c=document.getElementById('formationBtns'+side);c.innerHTML='';const cur=state['formation'+side];
  Object.keys(FORMATIONS).forEach(f=>{
    const b=document.createElement('button');b.className='formation-btn'+(f===cur?(side==='A'?' active':' active-b'):'');b.textContent=f;
    b.addEventListener('click',()=>{state['formation'+side]=f;initFormationBtns(side);rebuildSlots(side);updateCoachFitBadge();computeAndShowTacticalClash();});
    c.appendChild(b);
  });
}
function initRandomBtns(side){
  const row=document.getElementById('randomRow'+side);row.innerHTML='';
  RANDOM_ARCHETYPES.forEach(a=>{const b=document.createElement('button');b.className='random-btn';b.title=a.desc;b.textContent=a.label;b.addEventListener('click',()=>generateRandom(side,a.id));row.appendChild(b);});
}

// ── PITCH SVG ──
function drawPitch(svgId,side){
  const svg=document.getElementById(svgId);
  const f=FORMATIONS[state['formation'+side]];const st=state['starters'+side];
  const ac=teamPalette(side).main;
  const otherSt=state['starters'+(side==='A'?'B':'A')];
  const otherIds=new Set(otherSt.filter(Boolean).map(p=>p.id));
  const W=240,H=340;svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.innerHTML='<defs><linearGradient id="pg'+side+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a4a1a"/><stop offset="50%" stop-color="#1f6022"/><stop offset="100%" stop-color="#1a4a1a"/></linearGradient></defs>'
    +'<rect width="'+W+'" height="'+H+'" fill="url(#pg'+side+')" rx="8"/>'
    +'<rect x="8" y="8" width="'+(W-16)+'" height="'+(H-16)+'" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="1.1" rx="4"/>'
    +'<line x1="8" y1="'+(H/2)+'" x2="'+(W-8)+'" y2="'+(H/2)+'" stroke="rgba(255,255,255,0.19)" stroke-width="0.8"/>'
    +'<circle cx="'+(W/2)+'" cy="'+(H/2)+'" r="30" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>'
    +'<circle cx="'+(W/2)+'" cy="'+(H/2)+'" r="2" fill="rgba(255,255,255,0.4)"/>'
    +'<rect x="44" y="8" width="'+(W-88)+'" height="52" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>'
    +'<rect x="44" y="'+(H-60)+'" width="'+(W-88)+'" height="52" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>';
  f.coords.forEach((coord,i)=>{
    const x=(coord[0]/100)*W,y=(coord[1]/100)*H,p=st[i],sr=f.pos[i];
    const fit=p?roleFit(p.r,sr,p.alt):1;const isDup=p&&otherIds.has(p.id);
    const tc=!p?'rgba(255,255,255,0.13)':isDup?'#e07800':fit>=0.9?ac:fit>=0.65?'#c8a800':'#e07800';
    const name=p?p.n.split(',')[0].trim().slice(0,10):sr;
    const stroke=!p?'transparent':fit>=0.82?'rgba(255,255,255,0.28)':'rgba(255,190,0,0.5)';
    const isCaptain=p&&String(p.id)===String(state['captain'+side]);
    const tip=p?esc(p.n+' | '+p.r+(p.alt?' / '+p.alt:'')+' | '+p.nat+' | '+(p.club||'No iconic club')+' | OVR '+p.ovr+' | Work rate '+p.wrt):sr;
    svg.innerHTML+='<g transform="translate('+x+','+y+')">'
      +'<title>'+tip+'</title>'
      +'<circle r="17" fill="'+tc+'" opacity="'+(p?'1':'0.6')+'"/>'
      +(p?'<circle r="17" fill="none" stroke="'+stroke+'" stroke-width="1.2"/>':'')
      +(isCaptain?'<text y="-20" text-anchor="middle" font-size="12" fill="#ffd700">♛</text>':'')
      +'<text y="1" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,Inter,sans-serif" font-size="7.5" font-weight="700" fill="white">'+name+'</text>'
      +(p?'<text y="11" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,Inter,sans-serif" font-size="6" font-weight="600" fill="rgba(255,255,255,0.72)">'+p.ovr+'</text>':'')
      +(isDup?'<text y="-12" text-anchor="middle" font-size="9" fill="#ffd700">⚠</text>':'')
      +'</g>';
  });
}
function getRoleClass(r){if(r==='GK')return'gk';if(['CB','SW','RB','LB'].includes(r))return'def';if(['ST','FW','RW','LW'].includes(r))return'att';return'mid';}
function getPosBg(r){const c=getRoleClass(r);if(c==='gk')return['#fef9e7','#b7950b'];if(c==='def')return['#efffee','#1a7a1a'];if(c==='att')return['#fff0ee','#c0392b'];return['#eef4ff','#0071e3'];}

// ── SLOTS ──
function rebuildSlots(side){
  state['starters'+side]=new Array(11).fill(null);state['used'+side]=new Set();
  buildSlots(side,false);buildSlots(side,true);updateTeamStats(side);drawPitch('pitch'+side,side);updateValidation();
}
function resetSquad(side){
  state['starters'+side]=new Array(11).fill(null);state['bench'+side]=new Array(11).fill(null);state['used'+side]=new Set();
  buildSlots(side,false);buildSlots(side,true);updateTeamStats(side);drawPitch('pitch'+side,side);updateValidation();
}
function buildSlots(side,isBench){
  const f=FORMATIONS[state['formation'+side]];const cid=isBench?'bench'+side:'slots'+side;
  const container=document.getElementById(cid);container.innerHTML='';
  const arr=isBench?state['bench'+side]:state['starters'+side];
  const bPos=['GK','RB','CB','LB','DM','CM','AM','RW','LW','ST','FW'];
  const otherIds=new Set([...state['starters'+(side==='A'?'B':'A')],...state['bench'+(side==='A'?'B':'A')]].filter(Boolean).map(p=>p.id));
  for(let i=0;i<11;i++){
    const sr=isBench?bPos[i]:f.pos[i];const p=arr[i];const isDup=p&&otherIds.has(p.id);
    const row=document.createElement('div');row.className='slot-row';
    const posSpan=document.createElement('span');posSpan.className='slot-pos '+getRoleClass(sr);posSpan.textContent=sr;
    const inputWrap=document.createElement('div');inputWrap.className='slot-input-wrap';
    const input=document.createElement('input');input.type='text';
    let inputCls='slot-input';
    if(p){inputCls+=side==='A'?' filled':' filled-b';if(roleFit(p.r,sr,p.alt)<0.65)inputCls+=' out-of-pos';if(isDup)inputCls+=' duplicate';}
    input.className=inputCls;input.value=p?p.n:'';input.placeholder='Search player…';input.dataset.role=sr;
    const dropdown=document.createElement('div');dropdown.className='slot-dropdown';
    inputWrap.appendChild(input);inputWrap.appendChild(dropdown);
    const ovrSpan=document.createElement('span');ovrSpan.className='slot-ovr';
    if(p){const eff=Math.round(p.ovr*roleFit(p.r,sr,p.alt));ovrSpan.textContent=eff;ovrSpan.style.color=ovrColor(eff);}
    const roleTag=document.createElement('span');const rsInfo=roleStatus(p,sr);roleTag.className='role-fit-tag '+(rsInfo.cls||'');roleTag.textContent=rsInfo.label;roleTag.title=p?'Role fit for '+sr:'';
    const clearBtn=document.createElement('button');clearBtn.className='slot-clear'+(p?' visible':'');clearBtn.innerHTML='×';
    clearBtn.addEventListener('click',()=>{
      const a=isBench?state['bench'+side]:state['starters'+side];const old=a[i];
      if(old)state['used'+side].delete(old.id);a[i]=null;
      buildSlots(side,isBench);updateTeamStats(side);drawPitch('pitch'+side,side);updateValidation();
    });
    row.appendChild(posSpan);row.appendChild(inputWrap);row.appendChild(ovrSpan);row.appendChild(roleTag);row.appendChild(clearBtn);container.appendChild(row);
    input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();if(q.length<2){dropdown.classList.remove('open');return;}showDD(dropdown,q,sr,side,i,isBench,input,ovrSpan,clearBtn,roleTag);});
    input.addEventListener('focus',()=>{if(input.value.trim().length>=2)showDD(dropdown,input.value.trim().toLowerCase(),sr,side,i,isBench,input,ovrSpan,clearBtn,roleTag);});
    document.addEventListener('click',e=>{if(!row.contains(e.target))dropdown.classList.remove('open');});
    input.addEventListener('keydown',e=>{if(e.key==='Escape')dropdown.classList.remove('open');});
  }
}
function showDD(dropdown,query,sr,side,idx,isBench,input,ovrSpan,clearBtn,roleTag){
  const used=state['used'+side];
  const otherIds=new Set([...state['starters'+(side==='A'?'B':'A')],...state['bench'+(side==='A'?'B':'A')]].filter(Boolean).map(p=>p.id));
  const nf=state['filterNat'+side];const df=state['filterDec'+side];
  const results=players.filter(p=>{
    if(used.has(p.id))return false;
    const other=isBench?state['starters'+side]:state['bench'+side];if(other.find(x=>x&&x.id===p.id))return false;
    if(nf&&p.nat!==nf)return false;if(df&&p.dec!==df)return false;
    return p.n.toLowerCase().includes(query);
  }).sort((a,b)=>{const fa=roleFit(a.r,sr,a.alt),fb=roleFit(b.r,sr,b.alt);if(fb!==fa)return fb-fa;return b.ovr-a.ovr;}).slice(0,12);
  if(!results.length){dropdown.classList.remove('open');return;}
  dropdown.innerHTML='';
  results.forEach(p=>{
    const fit=roleFit(p.r,sr,p.alt);const eff=Math.round(p.ovr*fit);const[bg,tc]=getPosBg(p.r);const isDup=otherIds.has(p.id);const rstat=roleStatus(p,sr);
    const item=document.createElement('div');item.className='dd-item';
    const rs=document.createElement('span');rs.className='dd-item-role';rs.style.cssText='background:'+bg+';color:'+tc+';';rs.textContent=p.r;
    const ns=document.createElement('span');ns.className='dd-item-name';ns.textContent=p.n;
    if(fit<0.65)ns.style.color='#e07800';else if(fit<0.82)ns.style.color='#c8a800';
    const nat=document.createElement('span');nat.className='dd-item-nat';nat.textContent=p.nat+(p.dec?' · '+p.dec+'s':'');
    const fs=document.createElement('span');fs.className='dd-role-fit '+rstat.cls;fs.textContent=rstat.label;
    const os=document.createElement('span');os.className='dd-item-ovr';os.style.color=ovrColor(eff);os.textContent=eff;
    item.appendChild(rs);item.appendChild(ns);item.appendChild(nat);item.appendChild(fs);
    if(isDup){const dt=document.createElement('span');dt.className='dd-item-dup';dt.textContent='⚠ both';item.appendChild(dt);}
    item.appendChild(os);
    item.addEventListener('click',()=>{
      const a=isBench?state['bench'+side]:state['starters'+side];const old=a[idx];if(old)state['used'+side].delete(old.id);
      a[idx]=p;state['used'+side].add(p.id);
      input.value=p.n;input.className='slot-input '+(side==='A'?'filled':'filled-b');
      if(fit<0.65)input.classList.add('out-of-pos');if(isDup)input.classList.add('duplicate');
      const e=Math.round(p.ovr*fit);ovrSpan.textContent=e;ovrSpan.style.color=ovrColor(e);
      if(roleTag){roleTag.className='role-fit-tag '+rstat.cls;roleTag.textContent=rstat.label;roleTag.title='Role fit for '+sr;}
      clearBtn.classList.add('visible');dropdown.classList.remove('open');
      updateTeamStats(side);drawPitch('pitch'+side,side);
      drawPitch('pitch'+(side==='A'?'B':'A'),side==='A'?'B':'A');updateValidation();
    });
    dropdown.appendChild(item);
  });
  dropdown.classList.add('open');
}

// ── TEAM STATS (uses getTeamDepartments) ──

function suggestCaptain(side){
  const candidates=state['starters'+side].filter(Boolean);
  return candidates.sort((a,b)=>(b.wrt+b.com+b.con)-(a.wrt+a.com+a.con))[0]||null;
}
function syncCaptain(side){
  const ids=new Set(state['starters'+side].filter(Boolean).map(p=>String(p.id)));
  if(!state['captain'+side]||!ids.has(String(state['captain'+side]))){
    const suggested=suggestCaptain(side);
    state['captain'+side]=suggested?String(suggested.id):null;
  }
}
function buildCaptainSelect(side){
  const sel=document.getElementById('captain'+side);if(!sel)return;
  syncCaptain(side);
  sel.innerHTML='';
  const empty=document.createElement('option');empty.value='';empty.textContent='No captain yet';sel.appendChild(empty);
  state['starters'+side].filter(Boolean).sort((a,b)=>(b.wrt+b.com+b.con)-(a.wrt+a.com+a.con)).forEach((p,idx)=>{
    const o=document.createElement('option');o.value=String(p.id);o.textContent=(idx===0?'Suggested: ':'')+matchName(p.n)+' | WR '+p.wrt;sel.appendChild(o);
  });
  sel.value=state['captain'+side]||'';
  const cap=playerById.get(String(state['captain'+side]||''));
  const badge=document.getElementById('captainHint'+side);
  if(badge)badge.textContent=cap?'Captain: '+matchName(cap.n):'Highest work rate is suggested';
}

function updateTeamStats(side){
  const st=state['starters'+side];const f=FORMATIONS[state['formation'+side]];const filled=st.filter(Boolean);
  if(!filled.length){state['captain'+side]=null;buildCaptainSelect(side);['ovr','att','def'].forEach(id=>document.getElementById(id+side).textContent='—');updateWinProb();return;}
  const deps=getTeamDepartments(st,f);
  const effOvrs=st.map((p,i)=>p?Math.round(p.ovr*roleFit(p.r,f.pos[i],p.alt)):0).filter(v=>v>0);
  const avgOvr=Math.round(effOvrs.reduce((a,b)=>a+b,0)/effOvrs.length);
  const attPs=deps.att.map(x=>x.p);const attR=attPs.length?Math.round(attPs.reduce((s,p)=>s+(p.fin+p.sha+p.otb+p.cre+p.dri)/5,0)/attPs.length):0;
  const defPs=[...deps.def.map(x=>x.p),...deps.gk.map(x=>x.p)];
  const defR=defPs.length?Math.round(defPs.reduce((s,p)=>s+(p.r==='GK'?(p.ref+p.pos+p.han)/3:(p.tac+p.mar+p.dep+p.ant)/4),0)/defPs.length):0;
  const oEl=document.getElementById('ovr'+side);oEl.textContent=avgOvr;oEl.style.color=ovrColor(avgOvr);
  const aEl=document.getElementById('att'+side);aEl.textContent=attR;aEl.style.color=ovrColor(attR);
  const dEl=document.getElementById('def'+side);dEl.textContent=defR;dEl.style.color=ovrColor(defR);
  buildCaptainSelect(side);updateGelling(side);updateAttitude(side);updateWinProb();computeAndShowTacticalClash();
  document.getElementById('mibNameA').textContent=document.getElementById('nameA').value||'Legends XI';
  document.getElementById('mibNameB').textContent=document.getElementById('nameB').value||'Rival XI';
}
function updateGelling(side){
  const st=state['starters'+side];if(st.filter(Boolean).length<2)return;
  const gel=computeGel(st);const pct=Math.min(100,Math.round((gel/80)*100));
  const badge=document.getElementById('gel'+side);badge.childNodes[0].textContent='✦ '+pct;
  badge.className='gelling-badge'+(pct>=60?' high':pct>=30?' med':' low');
}
function updateAttitude(side){
  const f=FORMATIONS[state['formation'+side]];const st=state['starters'+side];let tend=f.tend;
  const deps=getTeamDepartments(st,f);
  const attMean=deps.att.length?deps.att.reduce((s,x)=>s+x.p.otb,0)/deps.att.length:70;
  const defMean=deps.def.length?deps.def.reduce((s,x)=>s+x.p.dep,0)/deps.def.length:70;
  tend+=(attMean-70)/500;tend-=(defMean-70)/500;tend=Math.max(0,Math.min(1,tend));
  const el=document.getElementById('attitude'+side);
  if(tend>0.62){el.className='attitude-badge att-off';el.textContent='⚔️ Offensive';}
  else if(tend<0.38){el.className='attitude-badge att-def';el.textContent='🛡️ Defensive';}
  else{el.className='attitude-badge att-bal';el.textContent='⚖️ Balanced';}
}

// ── WIN PROBABILITY NARRATIVE ──
function updateWinProb(){
  const stA=state.startersA,stB=state.startersB;const fA=state.formationA,fB=state.formationB;
  const fldA=stA.filter(Boolean).length,fldB=stB.filter(Boolean).length;
  const wrap=document.getElementById('winProbWrap');
  if(fldA<3||fldB<3){wrap.classList.remove('visible');updateMatchPreview();return;}
  wrap.classList.add('visible');
  const ovrA=computeAvgOvr(stA,fA),ovrB=computeAvgOvr(stB,fB);
  const gelA=computeGel(stA),gelB=computeGel(stB);
  const stadiumId=document.getElementById('setStadium').value;
  const powA=(1+(ovrA-80)*0.040)*(1+(gelA/80)*0.10)*homeBoostFor(stA,stadiumId);
  const powB=(1+(ovrB-80)*0.040)*(1+(gelB/80)*0.10)*homeBoostFor(stB,stadiumId);
  const pA=Math.min(82,Math.max(18,Math.round(powA/(powA+powB)*100)));const pB=100-pA;
  const nA=document.getElementById('nameA').value||'Legends XI';const nB=document.getElementById('nameB').value||'Rival XI';
  document.getElementById('wpTeamA').textContent=nA;document.getElementById('wpTeamB').textContent=nB;
  document.getElementById('wpPctA').textContent=pA+'%';document.getElementById('wpPctB').textContent=pB+'%';
  document.getElementById('wpBarA').style.width=pA+'%';document.getElementById('wpBarB').style.width=pB+'%';
  const depsA=getTeamDepartments(stA,FORMATIONS[fA]);const depsB=getTeamDepartments(stB,FORMATIONS[fB]);
  const midA=depsA.mid.length?depsA.mid.reduce((s,x)=>s+(x.p.vis+x.p.sps+x.p.cre)/3,0)/depsA.mid.length:0;
  const midB=depsB.mid.length?depsB.mid.reduce((s,x)=>s+(x.p.vis+x.p.sps+x.p.cre)/3,0)/depsB.mid.length:0;
  const diff=Math.abs(pA-pB);
  let edge='',reasons=[];
  if(diff<=6){edge='Evenly matched — anything can happen.';}
  else{
    const fav=pA>pB?nA:nB;edge='Edge: '+fav;
    const isA=pA>pB;
    if(isA&&ovrA>ovrB+3)reasons.push('superior overall quality');
    if(!isA&&ovrB>ovrA+3)reasons.push('superior overall quality');
    if(isA&&gelA>gelB+20)reasons.push('stronger team chemistry');
    if(!isA&&gelB>gelA+20)reasons.push('stronger team chemistry');
    if(isA&&midA>midB+5)reasons.push('midfield control advantage');
    if(!isA&&midB>midA+5)reasons.push('midfield control advantage');
    const homeNation=stadiumInfo(stadiumId).nation;
    if(isA&&stA.filter(p=>p&&p.nat===homeNation).length>=2)reasons.push('stadium familiarity');
    if(!isA&&stB.filter(p=>p&&p.nat===homeNation).length>=2)reasons.push('stadium familiarity');
    if(!reasons.length)reasons.push('slight overall advantage');
  }
  document.getElementById('wpEdge').textContent=edge;
  updateMatchPreview();
  document.getElementById('wpReasons').textContent=reasons.length?'↑ '+reasons.join(' · '):'';
}

// ── TACTICAL CLASH BADGES ──
function updateMatchPreview(){
  const box=document.getElementById('matchPreview');if(!box)return;
  const stA=state.startersA,stB=state.startersB;const fA=FORMATIONS[state.formationA],fB=FORMATIONS[state.formationB];
  const fldA=stA.filter(Boolean).length,fldB=stB.filter(Boolean).length;
  if(fldA<5||fldB<5){box.classList.remove('visible');return;}
  box.classList.add('visible');
  const nA=document.getElementById('nameA').value||'Legends XI',nB=document.getElementById('nameB').value||'Rival XI';
  const depsA=getTeamDepartments(stA,fA),depsB=getTeamDepartments(stB,fB);
  function avg(arr,fn){return arr.length?arr.reduce((s,x)=>s+fn(x.p),0)/arr.length:0;}
  function best(arr,fn){const p=arr.filter(Boolean).sort((a,b)=>fn(b)-fn(a))[0];return p?p.n:'-';}
  const midA=avg(depsA.mid,p=>(p.vis+p.sps+p.cre+p.tmw)/4),midB=avg(depsB.mid,p=>(p.vis+p.sps+p.cre+p.tmw)/4);
  const attA=avg(depsA.att,p=>(p.fin+p.sha+p.otb+p.dri)/4),attB=avg(depsB.att,p=>(p.fin+p.sha+p.otb+p.dri)/4);
  const defA=avg([...depsA.def,...depsA.gk],p=>p.r==='GK'?(p.ref+p.pos+p.han)/3:(p.tac+p.mar+p.dep+p.ant)/4);
  const defB=avg([...depsB.def,...depsB.gk],p=>p.r==='GK'?(p.ref+p.pos+p.han)/3:(p.tac+p.mar+p.dep+p.ant)/4);
  const edge=Math.abs(midA-midB)>4?(midA>midB?nA+' midfield':nB+' midfield'):Math.abs(attA-defB)>Math.abs(attB-defA)?nA+' final third':nB+' final third';
  const keyA=best(stA,p=>p.ovr+(p.fin+p.vis+p.dri)/9),keyB=best(stB,p=>p.ovr+(p.fin+p.vis+p.dri)/9);
  const ref=REFEREES.find(r=>r.id===document.getElementById('setReferee').value)||REFEREES[0];
  const aggA=avg([...depsA.def,...depsA.mid],p=>p.agg),aggB=avg([...depsB.def,...depsB.mid],p=>p.agg);
  const risk=(ref.strictness>0.72||Math.max(aggA,aggB)>77)?'Cards could matter':'Low card pressure';
  const weatherKey=document.getElementById('setWeather').value;
  const weather=weatherKey==='random'?'Random weather':(WEATHER[weatherKey]?.label||'Perfect');
  const stadiumId=document.getElementById('setStadium').value;
  const homeNation=stadiumInfo(stadiumId).nation;
  const homeA=stA.filter(p=>p&&p.nat===homeNation).length,homeB=stB.filter(p=>p&&p.nat===homeNation).length;
  const homeEdge=(homeA||homeB)?' · Home edge '+homeNation+' '+homeA+'-'+homeB:'';
  const coachA=document.getElementById('setCoachA').value,coachB=document.getElementById('setCoachB').value;
  const fitA=COACH_FIT[coachA]?.pref.includes(state.formationA),fitB=COACH_FIT[coachB]?.pref.includes(state.formationB);
  document.getElementById('previewReadiness').textContent=(fldA===11&&fldB===11)?'Ready':'Partial preview';
  document.getElementById('previewEdge').textContent=edge;
  document.getElementById('previewKeys').textContent=keyA+' vs '+keyB;
  document.getElementById('previewRisk').textContent=risk;
  document.getElementById('previewContext').textContent=weather+homeEdge+' · Coach fit '+(fitA?'A':'-')+'/'+(fitB?'B':'-');
}

function computeAndShowTacticalClash(){
  const stA=state.startersA,stB=state.startersB;const fA=state.formationA,fB=state.formationB;
  if(stA.filter(Boolean).length<3||stB.filter(Boolean).length<3){
    document.getElementById('mibClashRow').innerHTML='<span class="clash-badge clash-eq">Build your squads</span>';return;
  }
  const depsA=getTeamDepartments(stA,FORMATIONS[fA]);const depsB=getTeamDepartments(stB,FORMATIONS[fB]);
  function avg(arr,fn){return arr.length?arr.reduce((s,x)=>s+fn(x.p),0)/arr.length:0;}
  const midA=avg(depsA.mid,p=>(p.vis+p.sps+p.tmw)/3),midB=avg(depsB.mid,p=>(p.vis+p.sps+p.tmw)/3);
  const aerA=avg([...depsA.def,...depsA.att],p=>(p.hea+p.jmp)/2),aerB=avg([...depsB.def,...depsB.att],p=>(p.hea+p.jmp)/2);
  const pacA=avg(depsA.att,p=>(p.pac+p.acc)/2),pacB=avg(depsB.att,p=>(p.pac+p.acc)/2);
  const nA=(document.getElementById('nameA').value||'A').slice(0,8);
  const nB=(document.getElementById('nameB').value||'B').slice(0,8);
  function badge(vA,vB,label){const d=Math.abs(vA-vB);if(d<3)return'<span class="clash-badge clash-eq">'+label+': Equal</span>';return vA>vB?'<span class="clash-badge clash-a">'+label+': '+nA+'</span>':'<span class="clash-badge clash-b">'+label+': '+nB+'</span>';}
  document.getElementById('mibClashRow').innerHTML=badge(midA,midB,'Midfield')+badge(aerA,aerB,'Aerial')+badge(pacA,pacB,'Pace');
}

// ── VALIDATION ──
function updateValidation(){
  const sA=state.startersA,sB=state.startersB;
  const gkA=sA[0],gkB=sB[0],fullA=sA.every(Boolean),fullB=sB.every(Boolean);
  const coachA=document.getElementById('setCoachA').value,coachB=document.getElementById('setCoachB').value;
  const coachOk=!!(coachA&&coachB);
  document.getElementById('valGkA').className='val-dot '+(gkA?'ok':'err');
  document.getElementById('valGkB').className='val-dot '+(gkB?'ok':'err');
  document.getElementById('valFullA').className='val-dot '+(fullA?'ok':'warn');
  document.getElementById('valFullB').className='val-dot '+(fullB?'ok':'warn');
  document.getElementById('valCoach').className='val-dot '+(coachOk?'ok':'err');
  document.getElementById('valGkALbl').textContent=gkA?'✓ A:GK':'A:GK';
  document.getElementById('valGkBLbl').textContent=gkB?'✓ B:GK':'B:GK';
  document.getElementById('valFullALbl').textContent=fullA?'✓ A:11':'A:11';
  document.getElementById('valFullBLbl').textContent=fullB?'✓ B:11':'B:11';
  document.getElementById('valCoachLbl').textContent=coachOk?'✓ Coaches':'Coaches';
  ['A','B'].forEach(s=>{const sel=document.getElementById('setCoach'+s);if(sel.value){sel.classList.remove('coach-req');sel.classList.add('coach-ok');}else{sel.classList.add('coach-req');sel.classList.remove('coach-ok');}});
  const valid=gkA&&gkB&&fullA&&fullB&&coachOk;
  document.getElementById('btnSimulate').disabled=!valid;
  const msg=document.getElementById('validateMsg');
  if(valid){msg.textContent='✓ All ready — let\'s play!';msg.style.color='#1a7a1a';}
  else if(!coachOk){msg.textContent='Select a coach for both teams';msg.style.color='#c0392b';}
  else{msg.textContent='Fill both squads to simulate';msg.style.color='#c0392b';}
}

// ── RANDOM GENERATION (natural role or explicit alt role only) ──
function generateSquadForFormation(formKey,arch,initialUsed=new Set()){
  const f=FORMATIONS[formKey];const used=new Set(initialUsed);
  const newSt=new Array(11).fill(null),newBench=new Array(11).fill(null);
  function score(p,sr,a){
    const fit=strictRoleFit(p,sr);
    if(a==='random')return Math.random()*100;
    if(a==='attack')return((p.fin+p.sha+p.otb+p.pac)/4)*fit;
    if(a==='technical')return((p.dri+p.sps+p.vis+p.cre)/4)*fit;
    if(a==='physical')return((p.str+p.jmp+p.sta+p.pac)/4)*fit;
    return p.ovr*fit;
  }
  f.pos.forEach((sr,i)=>{
    const pool=players.filter(p=>!used.has(p.id)&&strictRoleFit(p,sr)>0).sort((a,b)=>score(b,sr,arch)-score(a,sr,arch));
    const topN=arch==='random'?pool.slice(0,Math.min(30,pool.length)):pool.slice(0,Math.min(5,pool.length));
    const idx=arch==='random'?rndInt(0,topN.length-1):rndInt(0,Math.min(2,topN.length-1));
    const chosen=topN[idx]||null;if(chosen){newSt[i]=chosen;used.add(chosen.id);}
  });
  ['GK','RB','CB','LB','DM','CM','AM','RW','LW','ST','FW'].forEach((sr,i)=>{
    const pool=players.filter(p=>!used.has(p.id)&&strictRoleFit(p,sr)>0).sort((a,b)=>b.ovr-a.ovr);
    const chosen=arch==='random'?pool[rndInt(0,Math.min(20,pool.length-1))]:pool[0];
    if(chosen){newBench[i]=chosen;used.add(chosen.id);}
  });
  return{starters:newSt,bench:newBench,used};
}
function applySquadData(side,data){
  state['starters'+side]=data.starters;
  state['bench'+side]=data.bench;
  state['used'+side]=new Set([...data.starters,...data.bench].filter(Boolean).map(p=>p.id));
  buildSlots(side,false);buildSlots(side,true);updateTeamStats(side);drawPitch('pitch'+side,side);updateValidation();
}
function generateRandom(side,arch){
  const otherUsed=new Set([...state['starters'+(side==='A'?'B':'A')],...state['bench'+(side==='A'?'B':'A')]].filter(Boolean).map(p=>p.id));
  const data=generateSquadForFormation(state['formation'+side],arch,otherUsed);
  applySquadData(side,data);
  const archetype=RANDOM_ARCHETYPES.find(a=>a.id===arch)?.label||'Squad';
  const teamName=document.getElementById('name'+side).value||(side==='A'?'Legends XI':'Rival XI');
  const missing=data.starters.filter(Boolean).length<11?' Some slots could not be filled with exact roles.':'';
  showToast(archetype+' generated for '+teamName+'.'+missing);
}

function buildSquadFromPool(formKey,pool,initialUsed=new Set()){
  const f=FORMATIONS[formKey];const used=new Set(initialUsed);
  const starters=new Array(11).fill(null),bench=new Array(11).fill(null);
  f.pos.forEach((sr,i)=>{
    const chosen=pool.filter(p=>!used.has(p.id)&&strictRoleFit(p,sr)>0).sort((a,b)=>b.ovr*strictRoleFit(b,sr)-a.ovr*strictRoleFit(a,sr))[0];
    if(chosen){starters[i]=chosen;used.add(chosen.id);}
  });
  ['GK','RB','CB','LB','DM','CM','AM','RW','LW','ST','FW'].forEach((sr,i)=>{
    const chosen=pool.filter(p=>!used.has(p.id)&&strictRoleFit(p,sr)>0).sort((a,b)=>b.ovr-a.ovr)[0];
    if(chosen){bench[i]=chosen;used.add(chosen.id);}
  });
  return{starters,bench,used};
}
function getPresetDefinitions(){
  const nations=allNations.map(n=>({type:'nation',value:n,label:'Nation | '+n,count:players.filter(p=>p.nat===n).length})).filter(x=>x.count>=8);
  const clubs=[...new Set(players.map(p=>p.club).filter(Boolean))].sort().map(c=>({type:'club',value:c,label:'Club | '+c,count:players.filter(p=>p.club===c).length})).filter(x=>x.count>=8);
  const decades=allDecades.map(d=>({type:'decade',value:String(d),label:'Decade | '+d+'s',count:players.filter(p=>p.dec===d).length})).filter(x=>x.count>=8);
  const leagues=[...new Set(players.map(p=>p.league).filter(Boolean))].sort().map(l=>({type:'league',value:l,label:'League | '+l,count:players.filter(p=>p.league===l).length})).filter(x=>x.count>=8);
  const continents=[...new Set(players.map(p=>p.cont).filter(Boolean))].sort().map(c=>({type:'continent',value:c,label:'Continent | '+c,count:players.filter(p=>p.cont===c).length})).filter(x=>x.count>=8);
  return[...nations,...clubs,...decades,...leagues,...continents];
}
function presetPool(type,value){
  if(type==='nation')return players.filter(p=>p.nat===value);
  if(type==='club')return players.filter(p=>p.club===value);
  if(type==='decade')return players.filter(p=>String(p.dec)===value);
  if(type==='league')return players.filter(p=>p.league===value);
  if(type==='continent')return players.filter(p=>p.cont===value);
  return players;
}
function presetTeamName(type,value){
  return(type==='decade'?value+'s':value)+' All-Time';
}
function presetTypeLabel(type){
  return{nation:'All-Time Nations',club:'All-Time Clubs',decade:'All-Time Decades',league:'All-Time Leagues',continent:'All-Time Continents'}[type]||'Preset Teams';
}
function updatePresetHint(side){
  const sel=document.getElementById('preset'+side),hint=document.getElementById('presetHint'+side);
  if(!sel||!hint)return;
  if(!sel.value){hint.textContent='All-time nations, clubs, decades and more';return;}
  const [type,value]=sel.value.split('|');
  const count=presetPool(type,value).length;
  hint.textContent=presetTypeLabel(type).replace('All-Time ','')+' pool · '+count+' players';
}
function initPresetControls(){
  const presets=getPresetDefinitions();
  const hasLeagueOrContinent=presets.some(p=>p.type==='league'||p.type==='continent');
  ['A','B'].forEach(side=>{
    const sel=document.getElementById('preset'+side);if(!sel)return;
    sel.innerHTML='<option value="">Preset teams...</option>';
    ['nation','club','decade','league','continent'].forEach(type=>{
      const groupItems=presets.filter(p=>p.type===type);
      if(!groupItems.length)return;
      const group=document.createElement('optgroup');group.label=presetTypeLabel(type);
      groupItems.forEach(p=>{const o=document.createElement('option');o.value=p.type+'|'+p.value;o.textContent=p.value+' ('+p.count+')';group.appendChild(o);});
      sel.appendChild(group);
    });
    if(!hasLeagueOrContinent){const future=document.createElement('option');future.disabled=true;future.textContent='League/continent presets need DB fields';sel.appendChild(future);}
    sel.addEventListener('change',()=>updatePresetHint(side));
    document.getElementById('applyPreset'+side)?.addEventListener('click',()=>applyPreset(side));
    updatePresetHint(side);
  });
}
function applyPreset(side){
  const sel=document.getElementById('preset'+side);if(!sel||!sel.value)return;
  const [type,value]=sel.value.split('|');
  const other=side==='A'?'B':'A';
  const used=new Set([...state['starters'+other],...state['bench'+other]].filter(Boolean).map(p=>p.id));
  const pool=presetPool(type,value);
  const data=buildSquadFromPool(state['formation'+side],pool,used);
  applySquadData(side,data);
  document.getElementById('name'+side).value=presetTeamName(type,value);
  document.getElementById('mibName'+side).textContent=document.getElementById('name'+side).value;
  updateWinProb();updateMatchPreview();
  updatePresetHint(side);
  const missing=11-data.starters.filter(Boolean).length;
  const typeLabel={club:'Club',nation:'Nation',decade:'Decade',league:'League',continent:'Continent'}[type]||'Preset';
  showToast(typeLabel+' preset loaded.'+(missing>0?' '+missing+' starting slots need more DB depth.':''));
}
function compatibleCoachFor(formKey){
  const fits=COACHES.filter(c=>COACH_FIT[c.id]?.pref.includes(formKey));
  return pick(fits.length?fits:COACHES).id;
}
function runSurpriseMe(){
  const forms=Object.keys(FORMATIONS);
  const presetDefs=getPresetDefinitions().filter(p=>p.count>=11);
  let best=null;
  for(let i=0;i<220;i++){
    const formA=pick(forms),formB=pick(forms);
    const presetA=pick(presetDefs);
    if(!presetA)break;
    const presetBCandidates=presetDefs.filter(p=>p.type+'|'+p.value!==presetA.type+'|'+presetA.value);
    const presetB=pick(presetBCandidates.length?presetBCandidates:presetDefs);
    if(!presetA||!presetB)break;
    const dataA=buildSquadFromPool(formA,presetPool(presetA.type,presetA.value),new Set());
    const usedA=new Set([...dataA.starters,...dataA.bench].filter(Boolean).map(p=>p.id));
    const dataB=buildSquadFromPool(formB,presetPool(presetB.type,presetB.value),usedA);
    if(dataA.starters.filter(Boolean).length<11||dataB.starters.filter(Boolean).length<11)continue;
    const diff=Math.abs(computeAvgOvr(dataA.starters,formA)-computeAvgOvr(dataB.starters,formB));
    if(!best||diff<best.diff)best={formA,formB,dataA,dataB,diff,presetA,presetB};
    if(diff<=3)break;
  }
  if(!best){
    const archs=['dream','technical','physical','attack','random'];
    for(let i=0;i<90;i++){
      const formA=pick(forms),formB=pick(forms);
      const dataA=generateSquadForFormation(formA,pick(archs),new Set());
      const usedA=new Set([...dataA.starters,...dataA.bench].filter(Boolean).map(p=>p.id));
      const dataB=generateSquadForFormation(formB,pick(archs),usedA);
      if(dataA.starters.filter(Boolean).length<11||dataB.starters.filter(Boolean).length<11)continue;
      const diff=Math.abs(computeAvgOvr(dataA.starters,formA)-computeAvgOvr(dataB.starters,formB));
      if(!best||diff<best.diff)best={formA,formB,dataA,dataB,diff,presetA:null,presetB:null};
      if(diff<=3)break;
    }
  }
  if(!best){showToast('Could not build two complete balanced squads yet.');return;}
  state.formationA=best.formA;state.formationB=best.formB;
  initFormationBtns('A');initFormationBtns('B');
  applySquadData('A',best.dataA);applySquadData('B',best.dataB);
  document.getElementById('nameA').value=best.presetA?presetTeamName(best.presetA.type,best.presetA.value):'Surprise XI';
  document.getElementById('nameB').value=best.presetB?presetTeamName(best.presetB.type,best.presetB.value):'Mystery XI';
  document.getElementById('mibNameA').textContent=document.getElementById('nameA').value;
  document.getElementById('mibNameB').textContent=document.getElementById('nameB').value;
  document.getElementById('setCoachA').value=compatibleCoachFor(best.formA);
  document.getElementById('setCoachB').value=compatibleCoachFor(best.formB);
  document.getElementById('tacticsA').value=pick(['balanced','possession','counter','direct']);
  document.getElementById('tacticsB').value=pick(['balanced','high_press','low_block','counter']);
  updateCoachFitBadge();updateValidation();updateWinProb();updateMatchPreview();
  showToast('Surprise match ready. Balanced OVR diff: '+best.diff.toFixed(1)+'.');
  setTimeout(()=>{if(!document.getElementById('btnSimulate').disabled)runMatch();},450);
}
function rosterKey(side,slot){return'lds.matchSimulator.roster.'+side+'.'+slot;}
function serializeRoster(side){
  return{name:document.getElementById('name'+side).value,formation:state['formation'+side],coach:document.getElementById('setCoach'+side).value,tactic:document.getElementById('tactics'+side).value,color:state['color'+side],captain:state['captain'+side],starters:state['starters'+side].map(p=>p?.id||null),bench:state['bench'+side].map(p=>p?.id||null)};
}
function applyRoster(side,data){
  if(!data)return;
  state['formation'+side]=data.formation||state['formation'+side];
  state['starters'+side]=(data.starters||[]).map(id=>id?playerById.get(String(id))||null:null).slice(0,11);
  state['bench'+side]=(data.bench||[]).map(id=>id?playerById.get(String(id))||null:null).slice(0,11);
  while(state['starters'+side].length<11)state['starters'+side].push(null);
  while(state['bench'+side].length<11)state['bench'+side].push(null);
  state['used'+side]=new Set([...state['starters'+side],...state['bench'+side]].filter(Boolean).map(p=>p.id));
  state['captain'+side]=data.captain||null;
  if(data.color&&TEAM_PALETTES[data.color]&&data.color!==state['color'+(side==='A'?'B':'A')])state['color'+side]=data.color;
  document.getElementById('name'+side).value=data.name||document.getElementById('name'+side).value;
  document.getElementById('mibName'+side).textContent=document.getElementById('name'+side).value;
  document.getElementById('setCoach'+side).value=data.coach||'';
  document.getElementById('tactics'+side).value=data.tactic||'balanced';
  const colorSel=document.getElementById('teamColor'+side);if(colorSel)colorSel.value=state['color'+side];
  applyTeamColors();initFormationBtns(side);buildSlots(side,false);buildSlots(side,true);updateTeamStats(side);drawPitch('pitch'+side,side);drawPitch('pitch'+(side==='A'?'B':'A'),side==='A'?'B':'A');updateCoachFitBadge();updateValidation();updateMatchPreview();
}
function initRosterSave(side){
  const trigger=document.getElementById('saveRoster'+side),panel=document.getElementById('savePanel'+side);if(!trigger||!panel)return;
  function render(){
    panel.innerHTML='';
    for(let i=1;i<=3;i++){
      const saved=localStorage.getItem(rosterKey(side,i));
      const row=document.createElement('div');row.className='save-slot-row';
      const label=document.createElement('span');label.textContent='Slot '+i+(saved?' | '+(JSON.parse(saved).name||'Saved XI'):' | empty');
      const save=document.createElement('button');save.type='button';save.textContent='Save';save.onclick=()=>{localStorage.setItem(rosterKey(side,i),JSON.stringify(serializeRoster(side)));render();showToast('Roster saved in slot '+i+'.');};
      const load=document.createElement('button');load.type='button';load.textContent='Load';load.disabled=!saved;load.onclick=()=>{applyRoster(side,JSON.parse(localStorage.getItem(rosterKey(side,i))));showToast('Roster loaded from slot '+i+'.');};
      const del=document.createElement('button');del.type='button';del.textContent='Clear';del.disabled=!saved;del.onclick=()=>{localStorage.removeItem(rosterKey(side,i));render();};
      row.appendChild(label);row.appendChild(save);row.appendChild(load);row.appendChild(del);panel.appendChild(row);
    }
  }
  trigger.addEventListener('click',()=>{panel.classList.toggle('open');render();});
}

// ═══════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════





// ═══════════════════════════════════════════════════════════
// MATCH DISPLAY
// ═══════════════════════════════════════════════════════════
function runMatch(){
  const ws=document.getElementById('setWeather').value;
  const aw=ws==='random'?['sun','light_rain','heavy_rain','storm','snow'][rndInt(0,4)]:ws;
  const stadiumId=document.getElementById('setStadium').value;
  const competition=document.getElementById('setCompetition').value;
  state.simCount++;
  const cfg={stA:state.startersA,stB:state.startersB,formA:state.formationA,formB:state.formationB,
    coachA:document.getElementById('setCoachA').value,coachB:document.getElementById('setCoachB').value,
    tacticA:document.getElementById('tacticsA').value,tacticB:document.getElementById('tacticsB').value,
    weather:aw,matchType:document.getElementById('setMatchType').value,
    maxSubs:parseInt(document.getElementById('setSubs').value),
    benchA:state.benchA,benchB:state.benchB,
    refereeId:document.getElementById('setReferee').value,
    stadiumId,competition,
    attendance:estimateAttendance(state.startersA,state.startersB,state.formationA,state.formationB,stadiumId,competition),
    commentator:pick(COMMENTATORS),
    broadcaster:pick(BROADCASTERS),
    pundit:pick(PUNDITS),
    captainA:state.captainA,captainB:state.captainB,
    simNo:state.simCount};
  document.getElementById('loadingOverlay').classList.add('active');
  setTimeout(()=>{const result=runSimulation(cfg);document.getElementById('loadingOverlay').classList.remove('active');displayMatch(result,cfg,WEATHER[aw]||WEATHER.sun);},80);
}

function showFinalReveal(result,nA,nB,cfg,done){
  const el=document.getElementById('finalReveal');if(!el){done();return;}
  const winner=result.winner==='A'?nA:result.winner==='B'?nB:'Draw';
  document.getElementById('finalRevealCup').textContent=document.getElementById('mhCompetition')?.textContent||'Full Time';
  document.getElementById('finalRevealTeams').textContent=nA+' vs '+nB;
  document.getElementById('finalRevealScore').textContent=result.scoreA+' - '+result.scoreB;
  document.getElementById('finalRevealWinner').textContent=result.winner==='draw'?'No winner. Honours even.':'Winner: '+winner;
  el.classList.add('active');
  setTimeout(()=>{el.classList.remove('active');done();},2600);
}

function displayMatch(result,cfg,wData){
  const nA=document.getElementById('nameA').value||'Legends XI';
  const nB=document.getElementById('nameB').value||'Rival XI';
  const comp=document.getElementById('setCompetition');const stad=document.getElementById('setStadium');
  const ref=REFEREES.find(r=>r.id===cfg.refereeId)||REFEREES[0];
  const tiA=TACTICAL_INSTRUCTIONS[cfg.tacticA]||TACTICAL_INSTRUCTIONS['balanced'];
  const tiB=TACTICAL_INSTRUCTIONS[cfg.tacticB]||TACTICAL_INSTRUCTIONS['balanced'];
  const mp=MATCH_PERSONALITIES[result.personality];
  document.getElementById('phase-setup').style.display='none';
  document.getElementById('phase-match').classList.remove('hidden');
  document.getElementById('match-results').style.display='none';
  document.getElementById('penaltiesSection').style.display='none';
  document.getElementById('mhCompetition').textContent=comp.options[comp.selectedIndex].text;
  document.getElementById('mhStadium').textContent=stad.options[stad.selectedIndex].text;
  document.getElementById('mhWeather').textContent=wData.label;
  document.getElementById('mhAttendance').textContent='Attendance '+fmtNum(cfg.attendance||0);
  document.getElementById('mhCommentator').textContent=(cfg.broadcaster||'Broadcast')+' · '+(cfg.commentator||pick(COMMENTATORS));
  document.getElementById('mhRunCount').textContent='Simulation #'+(cfg.simNo||1);
  const pBadge=document.getElementById('mhPersonality');pBadge.textContent=result.personality;pBadge.className='mhb-personality '+mp.cssClass;
  const refEl=document.getElementById('mhReferee');
  refEl.textContent=ref.name+' · '+ref.profile+' · Cards '+ref.cardRisk;
  refEl.title=refereeLens(ref);
  document.getElementById('sbNameA').textContent=nA;document.getElementById('sbNameB').textContent=nB;
  document.getElementById('sbMetaA').textContent=cfg.formA+' · '+tiA.label;
  document.getElementById('sbMetaB').textContent=cfg.formB+' · '+tiB.label;
  document.getElementById('sbScoreA').textContent='0';document.getElementById('sbScoreB').textContent='0';
  document.getElementById('sbStatus').className='sb-status live';document.getElementById('sbStatus').textContent='LIVE';
  const pre=document.getElementById('preMatchBroadcast');
  pre.classList.add('active');
  document.getElementById('broadcastNetwork').textContent=cfg.broadcaster||pick(BROADCASTERS);
  document.getElementById('broadcastCommentator').textContent='Commentary · '+(cfg.commentator||pick(COMMENTATORS));
  document.getElementById('broadcastTitle').textContent=nA+' vs '+nB;
  document.getElementById('broadcastSub').textContent=comp.options[comp.selectedIndex].text+' · '+wData.label+' · '+result.personality;
  document.getElementById('broadcastVenue').textContent=stad.options[stad.selectedIndex].text;
  document.getElementById('broadcastCrowd').textContent=fmtNum(cfg.attendance||0);
  document.getElementById('broadcastCoaches').textContent=coachName(cfg.coachA)+' vs '+coachName(cfg.coachB);
  document.getElementById('broadcastKeyMen').textContent=topPlayerName(cfg.stA)+' vs '+topPlayerName(cfg.stB);
  document.getElementById('momNameA').textContent=nA;document.getElementById('momNameB').textContent=nB;
  function setMomentum(a,b){
    a=Math.max(0,Math.min(100,Math.round(a??50)));b=Math.max(0,Math.min(100,Math.round(b??50)));
    const total=a+b||100;const pctA=Math.round(a/total*100);const pctB=100-pctA;
    document.getElementById('momBarA').style.width=pctA+'%';document.getElementById('momBarB').style.width=pctB+'%';
    let label='Momentum balanced';
    if(pctA>=58)label='Momentum: '+nA;
    else if(pctB>=58)label='Momentum: '+nB;
    document.getElementById('momLabel').textContent=label;
    let story='Both sides are feeling each other out.';
    if(pctA>=66)story=nA+' are pinning the game into the opposition half.';
    else if(pctB>=66)story=nB+' have the tempo now, and the pressure is building.';
    else if(pctA>=57)story=nA+' are finding the cleaner routes through midfield.';
    else if(pctB>=57)story=nB+' are starting to win the second balls.';
    else story='The game is balanced: possession changes hands without a clear owner.';
    document.getElementById('momNarrative').textContent=story;
  }
  setMomentum(50,50);
  const timelineTrack=document.getElementById('timelineTrack');timelineTrack.innerHTML='';
  const maxMinute=cfg.matchType==='90'?90:120;
  result.events.forEach(ev=>{
    let cls='';
    if(ev.isGoalA)cls='tl-goal-a';
    else if(ev.isGoalB)cls='tl-goal-b';
    else if(ev.type==='red')cls='tl-red';
    else if(ev.type==='woodwork')cls='tl-wood';
    else if(ev.type==='save_miracle')cls='tl-save';
    else if(ev.type==='injury')cls='tl-injury';
    else if(ev.type==='penalty_goal'||ev.type==='penalty_save')cls='tl-pen';
    if(!cls)return;
    const dot=document.createElement('span');dot.className='timeline-dot '+cls;
    dot.style.left=Math.max(0,Math.min(100,(ev.min/maxMinute)*100))+'%';
    dot.title=(ev.min>=121?'Pens':ev.min+"'")+' · '+ev.text;
    ev._dot=dot;timelineTrack.appendChild(dot);
  });
  const feed=document.getElementById('commentaryFeed');feed.innerHTML='';
  function eventBadge(ev){
    if(ev.type==='goal'||ev.type==='penalty_goal')return{label:'GOAL',cls:'goal'};
    if(['save','save_miracle','penalty_save'].includes(ev.type))return{label:'SAVE',cls:'save'};
    if(['woodwork','miss','blocked','chance','cross','freekick'].includes(ev.type))return{label:'CHANCE',cls:'chance'};
    if(['yellow','red'].includes(ev.type))return{label:'CARD',cls:'card'};
    if(['tackle','dribble','interception','sterile','momentum','tension'].includes(ev.type))return{label:'TACTIC',cls:'tactical'};
    if(['injury','sub','weather','ht','ft'].includes(ev.type))return{label:ev.type==='sub'?'SUB':'INFO',cls:'info'};
    return{label:'LIVE',cls:'info'};
  }
  const skipBtn=document.getElementById('btnSkipResult');
  const resetBtn=document.getElementById('btnReset');
  const rematchBtn=document.getElementById('btnRematch');
  let cA=0,cB=0,ei=0,nextTimer=null,resultShown=false;
  function finishMatch(delay=1800){
    if(resultShown)return;
    resultShown=true;
    if(nextTimer)clearTimeout(nextTimer);
    pre.classList.remove('active');
    skipBtn.disabled=true;skipBtn.textContent='Result Ready';
    resetBtn.disabled=false;rematchBtn.disabled=false;
    document.getElementById('sbStatus').className='sb-status ft';document.getElementById('sbStatus').textContent='FT';
    document.getElementById('sbTime').textContent='FT';
    document.getElementById('sbScoreA').textContent=result.scoreA;
    document.getElementById('sbScoreB').textContent=result.scoreB;
    result.events.forEach(ev=>{if(ev._dot)ev._dot.classList.add('active');});
    const lastMomentum=[...result.events].reverse().find(ev=>typeof ev.momA==='number');
    if(lastMomentum)setMomentum(lastMomentum.momA,lastMomentum.momB);
    setTimeout(()=>showFinalReveal(result,nA,nB,cfg,()=>showResults(result,nA,nB,cfg)),delay);
  }
  syncLiveSpeedButtons();
  skipBtn.disabled=false;resetBtn.disabled=true;rematchBtn.disabled=true;skipBtn.textContent='⏩ Skip to Result';skipBtn.onclick=()=>finishMatch(120);
  function next(){
    if(resultShown)return;
    if(ei>=result.events.length){finishMatch(1800);return;}
    const ev=result.events[ei++];
    if(typeof ev.momA==='number')setMomentum(ev.momA,ev.momB);
    if(ev._dot)ev._dot.classList.add('active');
    if(ev.isGoalA){cA++;const el=document.getElementById('sbScoreA');el.textContent=cA;el.classList.remove('goal-flash');void el.offsetWidth;el.classList.add('goal-flash');}
    if(ev.isGoalB){cB++;const el=document.getElementById('sbScoreB');el.textContent=cB;el.classList.remove('goal-flash');void el.offsetWidth;el.classList.add('goal-flash');}
    document.getElementById('sbTime').textContent=ev.min+"'";
    const item=document.createElement('div');item.className='cmt-item'+(ev.type==='ht'?' ht-item':'');
    const minEl=document.createElement('div');minEl.className='cmt-min';minEl.textContent=ev.type==='ft'?'FT':ev.type==='ht'?'HT':ev.min+"'";
    const badgeData=eventBadge(ev);const badgeEl=document.createElement('div');badgeEl.className='cmt-badge '+badgeData.cls;badgeEl.textContent=badgeData.label;
    const textEl=document.createElement('div');
    let cls='cmt-text';
    if(ev.type==='goal'||ev.type==='penalty_goal')cls+=' goal-event';
    else if(ev.type==='woodwork')cls+=' woodwork-event';
    else if(ev.type==='save_miracle')cls+=' save-event';
    else if(ev.type==='red')cls+=' red-event';
    else if(ev.type==='ht'||ev.type==='ft')cls+=' ht-event';
    else if(ev.type==='sub')cls+=' sub-event';
    else if(ev.type==='weather')cls+=' weather-event';
    else if(ev.type==='momentum')cls+=' momentum-event';
    else if(['freekick','tackle','blocked','chance','cross','interception'].includes(ev.type))cls+=' danger-event';
    textEl.className=cls;textEl.textContent=ev.text;
    item.appendChild(minEl);item.appendChild(badgeEl);item.appendChild(textEl);feed.appendChild(item);
    requestAnimationFrame(()=>requestAnimationFrame(()=>item.classList.add('visible')));
    feed.scrollTop=feed.scrollHeight;
    const delay=ev.type==='goal'?2400:ev.type==='woodwork'?1800:ev.type==='save_miracle'?1900:ev.type==='ht'||ev.type==='weather'?2300:ev.type==='ft'?2800:['penalty_goal','penalty_save'].includes(ev.type)?1900:ev.type==='red'?1900:ev.type==='momentum'?1600:1350;
    nextTimer=setTimeout(next,Math.round(delay*liveSpeedFactor()));
  }
  nextTimer=setTimeout(()=>{pre.classList.remove('active');next();},Math.round(8500*liveSpeedFactor()));
}

// ── CINEMATIC REPORT ──
function buildMatchComment(result,nA,nB){
  const{scoreA,scoreB,winner,stats,motm,penShootout}=result;
  const diff=Math.abs(scoreA-scoreB);
  const winnerName=winner==='A'?nA:winner==='B'?nB:null;
  const loserName=winner==='A'?nB:winner==='B'?nA:null;
  const firstGoal=stats.goalScorers[0];
  const isComeback=firstGoal&&winner!=='draw'&&firstGoal.team!==(winner);
  const totalGoals=scoreA+scoreB;
  const shots=stats.shotsA+stats.shotsB;
  if(penShootout)return'What a game, honestly. Level after 120 minutes, nerves everywhere, and then '+winnerName+' handled the shootout better — '+(penShootout.totA>penShootout.totB?penShootout.totA+'-'+penShootout.totB:penShootout.totB+'-'+penShootout.totA)+' on pens. Cruel for one side, pure relief for the other.';
  if(isComeback&&winner!=='draw')return'That turned into a proper comeback. '+loserName+' had it, or at least thought they had it, but '+winnerName+' kept hanging around and flipped the whole thing. '+(motm?.p?.n||'The match winner')+' was the player who made it feel possible.';
  if(diff>=4)return'No sugar-coating this: '+winnerName+' battered them. A '+scoreA+'-'+scoreB+' scoreline, total control, and very little mercy once the chances started coming. Legends or not, that got ugly.';
  if(diff===3||diff===2)return winnerName+' deserved it. Not a demolition, but clearly the better side in the big moments. '+(motm?.p?.n||'The standout performer')+' gave the game its shape, while '+loserName+' had flashes without ever really taking over.';
  if(diff===1){const lateGoal=stats.goalScorers.find(g=>g.min>75);if(lateGoal)return'Late drama, because of course. '+lateGoal.name+' decided it in the '+lateGoal.min+'th minute, and until then it was hanging by a thread. '+winnerName+' edge it, but nobody walks away thinking this was comfortable.';return'Tight, tense, not always clean. '+winnerName+' win '+scoreA+'-'+scoreB+' by the kind of margin that makes every missed chance feel massive. '+(motm?.p?.n||'The man of the match')+' just about tilted it.';}
  if(totalGoals===0)return'Boring? Yeah, a bit. So many legends, so little end product. There were '+shots+' shots, but the final ball and finishing never really matched the names on the team sheet. A 0-0 that felt more like chess than fireworks.';
  return'Honours even, and that feels about right. Both sides had spells, neither side truly owned it, and the '+scoreA+'-'+scoreB+' scoreline tells the story: competitive, imperfect, and still pretty watchable.';
}

function buildCinematicReport(result,nA,nB){
  const{events,stats,winner,duelResults,personality,scoreA,scoreB}=result;
  const winnerName=winner==='A'?nA:winner==='B'?nB:null;

  // Turning Point
  let tp='The first goal set the tone for the entire contest.';
  const red=events.find(e=>e.type==='red');
  const miracle=events.find(e=>e.type==='save_miracle');
  const lateGoal=stats.goalScorers.find(g=>g.min>78);
  if(lateGoal&&diff(scoreA,scoreB)<=1)tp=lateGoal.name+'\'s goal in the '+lateGoal.min+'\' proved to be the decisive moment.';
  else if(miracle)tp='A miraculous save at a crucial moment shifted the match irrevocably.';
  else if(red)tp='The red card changed everything — 10 men against 11 for the rest of the match.';
  document.getElementById('cpillTP').textContent=tp;

  // Key Duel winner
  let kd='No clear winner emerged from the individual battles.';
  if(duelResults.length){const best=duelResults.find(d=>d.duelWinner!=='draw')||duelResults[0];if(best.duelWinner!=='draw'){const w=best.duelWinner==='A'?best.pA:best.pB;const l=best.duelWinner==='A'?best.pB:best.pA;kd=best.type+': '+w.n+' ('+best[best.duelWinner==='A'?'scoreA':'scoreB'].toFixed(1)+') edged out '+l.n+' ('+best[best.duelWinner==='A'?'scoreB':'scoreA'].toFixed(1)+')';}else kd=best.type+': '+best.pA.n+' vs '+best.pB.n+' — an even contest all match.';}
  document.getElementById('cpillKD').textContent=kd;

  // Tactical Story
  const possWinner=stats.possA>stats.possB+8?nA:stats.possB>stats.possA+8?nB:null;
  let ts='';
  if(winner!=='draw'&&possWinner&&possWinner!==winnerName)ts=winnerName+' won without dominating possession ('+stats[possWinner===nA?'possA':'possB']+'% vs '+(100-stats[possWinner===nA?'possA':'possB'])+'%), exploiting space effectively on the counter.';
  else if(winner!=='draw'&&possWinner&&possWinner===winnerName)ts=winnerName+' controlled the tempo throughout ('+stats.possA+'% possession), suffocating the opposition\'s build-up play.';
  else if(personality==='Physical War')ts='Physical intensity defined this match — '+stats.foulsA+' fouls vs '+stats.foulsB+'. The team with greater composure under pressure prevailed.';
  else if(personality==='Technical Showcase')ts='A match of fluid, high-quality football. The woodwork was hit '+(stats.woodA+stats.woodB)+' times, underlining how fine the margins were.';
  else ts='A closely contested match decided by fine margins. Shots on target: '+stats.onTargetA+' vs '+stats.onTargetB+'.';
  document.getElementById('cpillTS').textContent=ts;
}
function diff(a,b){return Math.abs(a-b);}

function buildPostMatchNotes(result,nA,nB){
  const st=result.stats;
  const winnerName=result.winner==='A'?nA:result.winner==='B'?nB:null;
  const loserName=result.winner==='A'?nB:result.winner==='B'?nA:null;
  const winShots=result.winner==='A'?st.shotsA:st.shotsB;
  const loseShots=result.winner==='A'?st.shotsB:st.shotsA;
  const winPoss=result.winner==='A'?st.possA:st.possB;
  const losePoss=result.winner==='A'?st.possB:st.possA;
  const motm=result.motm?.p?.n||'the standout player';
  let why='No winner, and honestly that feels fair. Neither side found enough separation in the key moments.';
  let wrong='Both teams had spells, but the last pass and finishing never fully lined up.';
  if(winnerName){
    if(result.penShootout)why=winnerName+' won the nerve test. The football was even; the penalties were not.';
    else if(winShots<loseShots)why=winnerName+' were ruthless. Fewer shots, better moments, cleaner execution.';
    else if(winPoss<45)why=winnerName+' did not need the ball all night. They picked their moments and punished space.';
    else why=winnerName+' won the important phases: enough control, enough threat, and '+motm+' giving them the extra push.';
    if((result.winner==='A'?st.redsB:st.redsA)>0)wrong=loserName+' lost discipline, and once the red card arrived the match tilted hard.';
    else if(loseShots>winShots)wrong=loserName+' created enough to ask questions, but the finishing was not at the level of the build-up.';
    else wrong=loserName+' never quite turned possession or territory into sustained danger.';
  }
  let hidden='Possession finished '+st.possA+'%-'+st.possB+'%, but chance quality was '+(st.xgA||0).toFixed(2)+'-'+(st.xgB||0).toFixed(2)+' xG. That tells you more than the ball share.';
  if(st.woodA+st.woodB>0)hidden='The woodwork was hit '+(st.woodA+st.woodB)+' time'+(st.woodA+st.woodB===1?'':'s')+'. Tiny margins, very real swing.';
  else if(st.yellowsA+st.yellowsB+st.redsA+st.redsB>=4)hidden='Discipline shaped the rhythm: '+(st.yellowsA+st.yellowsB)+' yellows and '+(st.redsA+st.redsB)+' reds in total.';
  return{why,wrong,hidden};
}

function buildTVFacts(result,nA,nB,cfg){
  const st=result.stats;
  const winnerName=result.winner==='A'?nA:result.winner==='B'?nB:'Nobody';
  const loserName=result.winner==='A'?nB:result.winner==='B'?nA:'Both sides';
  let stat='Chance quality finished '+(st.xgA||0).toFixed(2)+'-'+(st.xgB||0).toFixed(2)+' xG, with big chances '+(st.bigChancesA||0)+'-'+(st.bigChancesB||0)+'.';
  if(st.redsA+st.redsB>0)stat='The red card changed the whole texture of the match.';
  else if(st.woodA+st.woodB>0)stat='The woodwork mattered: '+(st.woodA+st.woodB)+' huge swing moment'+(st.woodA+st.woodB===1?'':'s')+'.';
  else if(Math.abs(st.possA-st.possB)>14)stat='Possession was lopsided at '+st.possA+'-'+st.possB+'%, but control and danger were not always the same thing.';
  const fitA=COACH_FIT[cfg.coachA]?.pref.includes(cfg.formA),fitB=COACH_FIT[cfg.coachB]?.pref.includes(cfg.formB);
  let coach='Coach fit: '+(fitA?coachName(cfg.coachA)+' looked aligned':'Team A had tactical friction')+'; '+(fitB?coachName(cfg.coachB)+' matched the setup':'Team B looked less natural tactically')+'.';
  let problem=result.winner==='draw'?'Neither side found enough penalty-box clarity. Lots of quality, not enough separation.':loserName+' never solved the decisive phase often enough.';
  if(result.winner!=='draw'&&(result.winner==='A'?st.shotsB>st.shotsA:st.shotsA>st.shotsB))problem=loserName+' had volume, but not enough quality. That is the painful part.';
  const ref=REFEREES.find(r=>r.id===cfg.refereeId)||REFEREES[0];
  const referee=ref.profile+' referee, card risk '+ref.cardRisk+'. '+(st.yellowsA+st.yellowsB+st.redsA+st.redsB>2?'He was part of the story.':'He mostly stayed out of the way.');
  const crowd=fmtNum(cfg.attendance||0)+' in attendance, and the noise followed every momentum swing.';
  return{stat,coach,problem,referee,crowd};
}

function buildPunditQuote(pundit,result,nA,nB,cfg){
  const st=result.stats;
  const winner=result.winner==='A'?nA:result.winner==='B'?nB:null;
  const loser=result.winner==='A'?nB:result.winner==='B'?nA:null;
  const score=result.scoreA+'-'+result.scoreB;
  const motm=matchName(result.motm?.p?.n||'the decisive player');
  const xgLine='The chance quality was '+(st.xgA||0).toFixed(2)+'-'+(st.xgB||0).toFixed(2)+' xG, big chances '+(st.bigChancesA||0)+'-'+(st.bigChancesB||0)+'.';
  const capLine=result.captainMorale
    ? ' The captains mattered in the margins: '+matchName(result.captainMorale.A?.name||'Team A')+' and '+matchName(result.captainMorale.B?.name||'Team B')+' set the emotional temperature.'
    : '';
  const ref=REFEREES.find(r=>r.id===cfg.refereeId)||REFEREES[0];
  const refLine=' '+ref.profile+' officiating gave this match '+(ref.strictness>0.72?'a stricter edge.':'room to breathe.');
  if(pundit?.id==='wilson'){
    return winner
      ? 'The scoreline says '+score+', but the real story is structural. '+winner+' protected the central lanes better, then used '+motm+' as the release point when the game stretched. '+xgLine+refLine
      : 'A draw is not a lack of story. It is a tactical stalemate: both teams found moments of access, neither created enough clean superiority in the final third. '+xgLine;
  }
  if(pundit?.id==='buffa'){
    return winner
      ? 'And here you have to stop for a second. '+winner+' did not just win a match; they found the one man, '+motm+', who could turn a collection of legends into a story with an ending. '+loser+' will remember the little moments, because football always hides destiny in the little moments.'+capLine
      : 'This is one of those nights where the game refuses the easy ending. The names are enormous, the score is '+score+', and somewhere inside the draw there is still a small, stubborn piece of theatre. '+xgLine;
  }
  if(pundit?.id==='galeano'){
    return winner
      ? winner+' won, yes, but the ball also left a few ghosts behind. In the feet of '+motm+' there was a flash of street football: brief, disobedient, and enough to enter memory before it entered the net. '+xgLine
      : 'The match ended level, but not empty. The ball wandered between order and desire, and for a few seconds at a time it remembered why people fall in love with this impossible game.';
  }
  if(pundit?.id==='goldblatt'){
    return winner
      ? 'This was not merely a technical victory for '+winner+'. In a stadium of '+fmtNum(cfg.attendance||0)+', identity, memory and hierarchy all had a role. The stronger side imposed not only play, but meaning.'+refLine
      : 'A drawn match can still reveal a social fact: two squads full of inherited prestige, trying to convert memory into authority, and discovering that history does not always choose a winner.';
  }
  return winner
    ? 'A curious match, and not without old lessons. '+winner+' were sharper where it mattered, while '+loser+' repeated that familiar footballing sin: attractive passages, insufficient grammar. '+motm+', at least, understood the assignment. '+xgLine
    : 'One has seen worse draws, certainly, but also better uses of genius. A great deal of talent was present; rather less clarity accompanied it. '+xgLine;
}
function renderPunditFocus(result,nA,nB,cfg){
  const pundit=cfg.pundit||pick(PUNDITS);
  const card=document.getElementById('punditFocus');if(!card)return;
  document.getElementById('punditImg').src=pundit.image;
  document.getElementById('punditImg').alt=pundit.name;
  document.getElementById('punditName').textContent=pundit.name;
  document.getElementById('punditRole').textContent=pundit.role;
  document.getElementById('punditQuote').textContent=buildPunditQuote(pundit,result,nA,nB,cfg);
}

function renderEventMap(result){
  const pitch=document.getElementById('eventPitch');if(!pitch)return;
  pitch.innerHTML='';
  const big=result.events.filter(ev=>ev.isGoalA||ev.isGoalB||['save_miracle','woodwork','red','injury','penalty_goal','penalty_save'].includes(ev.type)).slice(0,18);
  if(!big.length){pitch.innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.58);font-size:11px;font-weight:700;">No major map events. This one lived in the margins.</div>';return;}
  big.forEach((ev,i)=>{
    const dot=document.createElement('div');
    let cls='event-map-dot ',txt='•',x=50;
    if(ev.isGoalA||(ev.type==='penalty_goal'&&ev.side==='A')){cls+='goal-a';txt='G';x=78;}
    else if(ev.isGoalB||(ev.type==='penalty_goal'&&ev.side==='B')){cls+='goal-b';txt='G';x=22;}
    else if(ev.type==='save_miracle'||ev.type==='penalty_save'){cls+='save';txt='S';x=i%2?31:69;}
    else if(ev.type==='red'){cls+='red';txt='R';x=i%2?43:57;}
    else if(ev.type==='woodwork'){cls+='wood';txt='W';x=i%2?26:74;}
    else{cls+='injury';txt='+';x=50;}
    const y=18+((i*29+ev.min*3)%134);
    dot.className=cls;dot.textContent=txt;dot.style.left=x+'%';dot.style.top=y+'px';dot.title=(ev.min>=121?'Pens':ev.min+"'")+' · '+ev.text;
    pitch.appendChild(dot);
  });
}

function buildShareSummary(result,nA,nB,cfg){
  const comp=document.getElementById('setCompetition');
  const competition=comp.options[comp.selectedIndex]?.text||'Legendary Match Simulator';
  const score=result.scoreA+' - '+result.scoreB;
  const pens=result.penShootout?' ('+result.penShootout.totA+'-'+result.penShootout.totB+' pens)':'';
  const winner=result.winner==='A'?nA:result.winner==='B'?nB:'Draw';
  const motm=result.motm?.p?.n||'No clear MOTM';
  const st=result.stats;
  const scorers=st.goalScorers.length?st.goalScorers.map(g=>g.name+" "+g.min+"'").join(', '):'No goals';
  return [
    competition+' · Simulation #'+(cfg.simNo||1),
    nA+' '+score+pens+' '+nB,
    'Winner: '+winner,
    'MOTM: '+motm,
    'Attendance: '+fmtNum(cfg.attendance||0)+' · Commentator: '+(cfg.commentator||'Random'),
    'Scorers: '+scorers,
    'Shots: '+st.shotsA+'-'+st.shotsB+' · On target: '+st.onTargetA+'-'+st.onTargetB+' · Possession: '+st.possA+'%-'+st.possB+'%',
    'Generated on Legends Database.'
  ].join('\n');
}

function copyText(text){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
  const ta=document.createElement('textarea');
  ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';
  document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
  return Promise.resolve();
}

function showResults(result,nA,nB,cfg){
  const res=document.getElementById('match-results');res.style.display='block';
  document.getElementById('scorersStrip').style.display='flex';
  setTimeout(()=>res.scrollIntoView({behavior:'smooth',block:'start'}),200);
  document.getElementById('resNameA').textContent=nA;document.getElementById('resNameB').textContent=nB;
  const scoreText=result.scoreA+' – '+result.scoreB;
  const winnerName=result.winner==='A'?nA:result.winner==='B'?nB:'Draw';
  const motmName=result.motm?.p?.n||'—';
  document.getElementById('resFinalScore').textContent=scoreText;
  const comp=document.getElementById('setCompetition');const compText=comp.options[comp.selectedIndex].text;document.getElementById('resCup').textContent=compText;
  document.getElementById('stickyCup').textContent=compText;
  document.getElementById('stickyScore').textContent=scoreText;
  document.getElementById('stickyDetail').textContent=(result.winner==='draw'?'Draw':'Winner: '+winnerName)+' · MOTM: '+motmName;
  const winPill=document.getElementById('resWinnerPill');winPill.textContent=result.winner==='draw'?'Draw':'Winner · '+winnerName;winPill.className='result-meta-pill '+(result.winner==='A'?'win-a':result.winner==='B'?'win-b':'');
  document.getElementById('resVenuePill').textContent=document.getElementById('mhStadium').textContent+' · '+fmtNum(cfg.attendance||0);
  document.getElementById('resWeatherPill').textContent=document.getElementById('mhWeather').textContent;
  document.getElementById('resMotmPill').textContent='MOTM · '+motmName;
  document.getElementById('resComment').textContent=buildMatchComment(result,nA,nB);
  const copyBtn=document.getElementById('btnCopySummary');
  const copyStatus=document.getElementById('copyStatus');
  copyStatus.textContent='';
  copyBtn.onclick=()=>{
    copyText(buildShareSummary(result,nA,nB,cfg)).then(()=>{
      copyStatus.textContent='Copied';
      setTimeout(()=>{copyStatus.textContent='';},1800);
    }).catch(()=>{
      copyStatus.textContent='Copy failed';
    });
  };
  buildCinematicReport(result,nA,nB);
  const postNotes=buildPostMatchNotes(result,nA,nB);
  document.getElementById('postWhyWon').textContent=postNotes.why;
  document.getElementById('postWrong').textContent=postNotes.wrong;
  document.getElementById('postHidden').textContent=postNotes.hidden;
  const facts=buildTVFacts(result,nA,nB,cfg);
  document.getElementById('factStat').textContent=facts.stat;
  document.getElementById('factCoach').textContent=facts.coach;
  document.getElementById('factProblem').textContent=facts.problem;
  document.getElementById('factReferee').textContent=facts.referee;
  document.getElementById('factCrowd').textContent=facts.crowd;
  renderPunditFocus(result,nA,nB,cfg);
  renderEventMap(result);

  // Scorers
  const sA=document.getElementById('scorersA'),sB=document.getElementById('scorersB');sA.innerHTML='';sB.innerHTML='';
  result.stats.goalScorers.forEach(g=>{
    const el=document.createElement('div');el.className='scorer-item';
    const min=document.createElement('span');min.className='scorer-min';min.textContent=g.min+"'";
    const name=document.createElement('span');name.textContent=g.name;
    if(g.team==='A'){el.appendChild(min);el.appendChild(name);sA.appendChild(el);}else{el.appendChild(name);el.appendChild(min);sB.appendChild(el);}
  });
  if(!result.stats.goalScorers.length){
    sA.innerHTML='<div class="empty-state">No goals for '+nA+'.</div>';
    sB.innerHTML='<div class="empty-state">No goals for '+nB+'.</div>';
  }

  // MOTM
  if(result.motm?.p){
    document.getElementById('motmName').textContent=result.motm.p.n;
    document.getElementById('motmMeta').textContent=result.motm.p.r+' · '+result.motm.p.nat+' · '+(result.motm.side==='A'?nA:nB);
    const sc=result.motm.base.toFixed(1);document.getElementById('motmRating').textContent=sc;
    document.getElementById('motmRating').style.color=parseFloat(sc)>=8?'#ffd700':'#fff';
  }

  // Key Duels section
  const kdBody=document.getElementById('keyDuelsBody');kdBody.innerHTML='';
  if(!result.duelResults.length){
    kdBody.innerHTML='<div class="empty-state">No clear individual duel emerged. This one was decided more by collective balance than isolated matchups.</div>';
  }else result.duelResults.forEach(d=>{
    const row=document.createElement('div');row.className='kd-row';
    const typeEl=document.createElement('div');typeEl.className='kd-type';typeEl.textContent=d.type;
    const pAEl=document.createElement('div');pAEl.className='kd-player-a';pAEl.textContent=d.pA.n;
    const scoreEl=document.createElement('div');
    const sA2=d.scoreA.toFixed(1),sB2=d.scoreB.toFixed(1);
    const cls=d.duelWinner==='A'?'kd-score a-won':d.duelWinner==='B'?'kd-score b-won':'kd-score draw';
    scoreEl.className=cls;scoreEl.textContent=sA2+' vs '+sB2;
    const pBEl=document.createElement('div');pBEl.className='kd-player-b';pBEl.textContent=d.pB.n;
    row.appendChild(typeEl);row.appendChild(pAEl);row.appendChild(scoreEl);row.appendChild(pBEl);kdBody.appendChild(row);
  });

  // Ratings
  function buildRatings(rats,fk){const f=FORMATIONS[fk];return rats.map((r,i)=>{if(!r.p)return'';const sc=r.base.toFixed(1);const sv=parseFloat(sc);let cls='rs-avg';if(sv>=8.5)cls='rs-elite';else if(sv>=7.5)cls='rs-great';else if(sv>=6.8)cls='rs-good';else if(sv>=5.5)cls='rs-avg';else if(sv>=4.8)cls='rs-poor';else cls='rs-bad';const role=f?f.pos[i]:r.p.r;const[bg,tc]=getPosBg(role);return'<div class="rating-row"><span class="rating-pos" style="background:'+bg+';color:'+tc+';">'+role+'</span><span class="rating-name">'+r.p.n+'</span><span class="rating-events">'+r.events.join(' ')+'</span><span class="rating-score '+cls+'">'+sc+'</span></div>';}).join('');}
  document.getElementById('ratTeamAName').textContent=nA;document.getElementById('ratTeamBName').textContent=nB;
  document.getElementById('ratingsA').innerHTML=buildRatings(result.ratA,cfg.formA);
  document.getElementById('ratingsB').innerHTML=buildRatings(result.ratB,cfg.formB);

  // Stats
  const st=result.stats;
  function setBar(idA,idB,vA,vB){const t=vA+vB||1;document.getElementById(idA).style.width=(vA/t*100)+'%';document.getElementById(idB).style.width=(vB/t*100)+'%';}
  document.getElementById('stShotsA').textContent=st.shotsA;document.getElementById('stShotsB').textContent=st.shotsB;setBar('stShotsBarA','stShotsBarB',st.shotsA,st.shotsB);
  document.getElementById('stXgA').textContent=(st.xgA||0).toFixed(2);document.getElementById('stXgB').textContent=(st.xgB||0).toFixed(2);setBar('stXgBarA','stXgBarB',st.xgA||0,st.xgB||0);
  document.getElementById('stBigA').textContent=st.bigChancesA||0;document.getElementById('stBigB').textContent=st.bigChancesB||0;
  document.getElementById('stOnTargetA').textContent=st.onTargetA;document.getElementById('stOnTargetB').textContent=st.onTargetB;setBar('stOnTargetBarA','stOnTargetBarB',st.onTargetA,st.onTargetB);
  document.getElementById('stCornersA').textContent=st.cornersA;document.getElementById('stCornersB').textContent=st.cornersB;setBar('stCornersBarA','stCornersBarB',st.cornersA,st.cornersB);
  document.getElementById('stPossA').textContent=st.possA+'%';document.getElementById('stPossB').textContent=st.possB+'%';setBar('stPossBarA','stPossBarB',st.possA,st.possB);
  document.getElementById('stFoulsA').textContent=st.foulsA;document.getElementById('stFoulsB').textContent=st.foulsB;setBar('stFoulsBarA','stFoulsBarB',st.foulsA,st.foulsB);
  document.getElementById('stYellowA').textContent=st.yellowsA;document.getElementById('stYellowB').textContent=st.yellowsB;
  document.getElementById('stRedA').textContent=st.redsA;document.getElementById('stRedB').textContent=st.redsB;
  document.getElementById('stOffA').textContent=st.offsetA;document.getElementById('stOffB').textContent=st.offsetB;
  document.getElementById('stWoodA').textContent=st.woodA;document.getElementById('stWoodB').textContent=st.woodB;

  if(result.penShootout){
    const ps=result.penShootout;
    document.getElementById('penRowA').innerHTML=ps.pksA.map(s=>'<div class="penalty-kick '+(s?'pk-scored-a':'pk-saved-a')+'">'+(s?'✓':'×')+'</div>').join('');
    document.getElementById('penRowB').innerHTML=ps.pksB.map(s=>'<div class="penalty-kick '+(s?'pk-scored-b':'pk-saved-b')+'">'+(s?'✓':'×')+'</div>').join('');
    document.getElementById('penaltiesSection').style.display='block';
    document.getElementById('resFinalScore').textContent+=' ('+ps.totA+'-'+ps.totB+' pens)';
    document.getElementById('stickyScore').textContent=scoreText+' ('+ps.totA+'-'+ps.totB+' pens)';
  }
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS + INIT
// ═══════════════════════════════════════════════════════════
['A','B'].forEach(side=>{
  document.getElementById('benchToggle'+side).addEventListener('click',()=>{
    const s=document.getElementById('bench'+side);const b=document.getElementById('benchToggle'+side);
    s.classList.toggle('open');b.textContent=s.classList.contains('open')?'− Hide bench':'+ Bench (11)';
  });
  document.getElementById('resetSquad'+side).addEventListener('click',()=>resetSquad(side));
  document.getElementById('tactics'+side).addEventListener('change',()=>{updateCoachFitBadge();updateMatchPreview();});
  document.getElementById('captain'+side)?.addEventListener('change',e=>{state['captain'+side]=e.target.value||null;buildCaptainSelect(side);drawPitch('pitch'+side,side);});
  initRosterSave(side);
});
['setCompetition','setStadium','setWeather','setReferee','setMatchType','setSubs'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{if(id==='setReferee')updateRefereeInsight();updateWinProb();updateMatchPreview();}));
document.getElementById('btnSimulate').addEventListener('click',runMatch);
document.getElementById('btnSurpriseMe')?.addEventListener('click',runSurpriseMe);
document.getElementById('calcToggle')?.addEventListener('click',()=>{
  const box=document.getElementById('calcInfo');
  if(box)box.classList.toggle('open');
});
document.getElementById('btnReset').addEventListener('click',()=>{
  document.getElementById('phase-setup').style.display='';
  document.getElementById('phase-match').classList.add('hidden');
  document.getElementById('match-results').style.display='none';
  document.getElementById('penaltiesSection').style.display='none';
  updateValidation();updateWinProb();computeAndShowTacticalClash();
  window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('btnRematch').addEventListener('click',()=>{
  document.getElementById('commentaryFeed').innerHTML='';
  document.getElementById('sbScoreA').textContent='0';document.getElementById('sbScoreB').textContent='0';
  document.getElementById('sbStatus').className='sb-status live';document.getElementById('sbStatus').textContent='LIVE';
  document.getElementById('match-results').style.display='none';document.getElementById('penaltiesSection').style.display='none';
  runMatch();
});
document.getElementById('nameA').addEventListener('input',()=>{updateWinProb();document.getElementById('mibNameA').textContent=document.getElementById('nameA').value||'Legends XI';});
document.getElementById('nameB').addEventListener('input',()=>{updateWinProb();document.getElementById('mibNameB').textContent=document.getElementById('nameB').value||'Rival XI';});
document.querySelectorAll('[data-collapse-target]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const target=document.getElementById(btn.dataset.collapseTarget);
    if(!target)return;
    target.classList.toggle('collapsed');
    const label=btn.querySelector('span');
    if(label)label.textContent=target.classList.contains('collapsed')?'Show':'Hide';
  });
});
document.querySelectorAll('[data-live-speed]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    state.liveSpeed=btn.dataset.liveSpeed||'normal';
    syncLiveSpeedButtons();
    showToast('Live speed: '+btn.textContent.trim()+'.');
  });
});

initTeamColorSelects();initCoachSelect('setCoachA');initCoachSelect('setCoachB');initRefereeSelect();initFilterSelects();initPresetControls();
['A','B'].forEach(side=>{initFormationBtns(side);initRandomBtns(side);buildSlots(side,false);buildSlots(side,true);buildCaptainSelect(side);drawPitch('pitch'+side,side);});
updateValidation();
updateMatchPreview();
}
