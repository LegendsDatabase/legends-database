export const FORMATIONS = {
  '4-3-3':   {pos:['GK','RB','CB','CB','LB','CM','CM','CM','RW','ST','LW'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[72,47],[50,43],[28,47],[82,22],[50,18],[18,22]], tend:0.55},
  '4-4-2':   {pos:['GK','RB','CB','CB','LB','RM','CM','CM','LM','ST','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[82,46],[62,44],[38,44],[18,46],[62,20],[38,20]], tend:0.50},
  '4-2-3-1': {pos:['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[62,58],[38,58],[78,36],[50,32],[22,36],[50,16]], tend:0.50},
  '3-5-2':   {pos:['GK','CB','CB','CB','RM','CM','DM','CM','LM','ST','ST'],   coords:[[50,88],[70,70],[50,68],[30,70],[86,46],[68,44],[50,50],[32,44],[14,46],[62,20],[38,20]], tend:0.45},
  '4-1-4-1': {pos:['GK','RB','CB','CB','LB','DM','RM','CM','CM','LM','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[50,58],[82,42],[62,38],[38,38],[18,42],[50,16]], tend:0.35},
  '5-3-2':   {pos:['GK','RB','CB','CB','CB','LB','CM','DM','CM','ST','ST'],   coords:[[50,88],[88,64],[72,70],[50,72],[28,70],[12,64],[72,44],[50,48],[28,44],[62,20],[38,20]], tend:0.25},
  '3-4-3':   {pos:['GK','CB','CB','CB','RM','CM','CM','LM','RW','ST','LW'],   coords:[[50,88],[70,70],[50,68],[30,70],[82,44],[62,40],[38,40],[18,44],[82,22],[50,18],[18,22]], tend:0.75},
  '4-5-1':   {pos:['GK','RB','CB','CB','LB','RM','CM','DM','CM','LM','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[82,44],[66,40],[50,48],[34,40],[18,44],[50,16]], tend:0.30},
  '4-3-1-2': {pos:['GK','RB','CB','CB','LB','CM','CM','CM','AM','ST','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[72,52],[50,48],[28,52],[50,34],[62,18],[38,18]], tend:0.58},
  '3-4-1-2': {pos:['GK','CB','CB','CB','RM','CM','CM','LM','AM','ST','ST'],   coords:[[50,88],[70,70],[50,68],[30,70],[86,48],[66,46],[34,46],[14,48],[50,32],[62,18],[38,18]], tend:0.55},
  '4-4-1-1': {pos:['GK','RB','CB','CB','LB','RM','CM','CM','LM','AM','ST'],   coords:[[50,88],[82,68],[62,68],[38,68],[18,68],[82,48],[64,44],[36,44],[18,48],[50,30],[50,16]], tend:0.45},
};

export const COMPAT = {
  GK:['GK'],RB:['RB','CB','LB'],LB:['LB','CB','RB'],CB:['CB','SW','RB','LB'],SW:['SW','CB'],
  DM:['DM','CM','CB'],CM:['CM','DM','AM','LM','RM'],AM:['AM','CM','RW','LW'],
  RM:['RM','CM','RW','AM','LM'],LM:['LM','CM','LW','AM','RM'],
  RW:['RW','RM','AM','FW','LW'],LW:['LW','LM','AM','FW','RW'],
  FW:['FW','ST','AM','RW','LW'],ST:['ST','FW','RW','LW'],
};

export function roleFit(pr, sr, alt) {
  if (!alt) alt = '';
  if (pr === sr) return 1.0;
  if (alt) {
    const alts = alt.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (alts.includes(sr)) return 0.82;
    const c = COMPAT[sr]||[sr];
    for (const a of alts) { if (c.includes(a)) return 0.72; }
  }
  const c = COMPAT[sr]||[sr];
  if (c.includes(pr)) return 0.65;
  return 0.35;
}

export function listedRoles(p) {
  const alts=(p.alt||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  return [p.r,...alts];
}

export function strictRoleFit(p, sr) {
  return listedRoles(p).includes(sr) ? (p.r===sr ? 1.0 : 0.82) : 0;
}

export function roleStatus(p, sr) {
  if(!p)return{label:'',cls:''};
  if(p.r===sr)return{label:'Natural',cls:'role-natural'};
  const alts=(p.alt||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  if(alts.includes(sr))return{label:'Alt',cls:'role-alt'};
  return roleFit(p.r,sr,p.alt)>=0.65?{label:'Compat',cls:'role-compat'}:{label:'Out',cls:'role-oop'};
}

export function getTeamDepartments(starters, formation) {
  const gk=[],def=[],mid=[],att=[];
  starters.forEach((p,i)=>{
    if(!p)return;const role=formation.pos[i];
    if(role==='GK')gk.push({p,role,idx:i});
    else if(['CB','SW','RB','LB'].includes(role))def.push({p,role,idx:i});
    else if(['DM','CM','AM','RM','LM'].includes(role))mid.push({p,role,idx:i});
    else att.push({p,role,idx:i});
  });
  return{gk,def,mid,att};
}

export function computeGel(st){
  let s=0;
  for(let i=0;i<st.length;i++)for(let j=i+1;j<st.length;j++){const a=st[i],b=st[j];if(!a||!b)continue;if(a.nat===b.nat&&a.club===b.club&&a.club)s+=3;else if(a.nat===b.nat)s+=1;else if(a.club===b.club&&a.club)s+=1;}
  [[1,2,3,4],[5,6,7],[8,9,10]].forEach(idxs=>{const u=idxs.map(i=>st[i]).filter(Boolean);if(u.length<3)return;if(u.every(p=>p.nat===u[0].nat&&p.club===u[0].club&&p.club))s+=5;else if(u.every(p=>p.nat===u[0].nat))s+=4;});
  return s;
}

export function computeAvgOvr(st,fk){
  const f=FORMATIONS[fk];const v=st.map((p,i)=>p?Math.round(p.ovr*roleFit(p.r,f.pos[i],p.alt)):0).filter(v=>v>0);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:70;
}
