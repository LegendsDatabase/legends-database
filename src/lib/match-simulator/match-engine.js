import { FORMATIONS, getTeamDepartments, roleFit, computeGel, computeAvgOvr } from './formations.js';

import { COACHES, COACH_FIT, TACTICAL_INSTRUCTIONS } from './coaches.js';

import { WEATHER, REFEREES, MATCH_PERSONALITIES, homeBoostFor } from './config.js';

import { CMT, WEATHER_CMT } from './commentary.js';

import { pick, rnd, rndInt, bc, matchName } from './utils.js';

export function applyCoach(pls,cid){
  const c=COACHES.find(x=>x.id===cid);if(!c)return pls;
  return pls.map(p=>{if(!p)return p;const cl={...p};Object.entries(c.bonus).forEach(([k,v])=>{if(cl[k]!==undefined)cl[k]=Math.min(99,cl[k]+v);});return cl;});
}

export function teamStr(st,fk,weather,cid,tactic,stadiumId){
  const boosted=applyCoach(st,cid);const f=FORMATIONS[fk];const w=WEATHER[weather]||WEATHER.sun;
  const ti=TACTICAL_INSTRUCTIONS[tactic]||TACTICAL_INSTRUCTIONS['balanced'];
  let att=0,def=0;const gk=boosted[0];const gkS=gk?((gk.ref+gk.pos+gk.han)/3)*w.physMod:60;
  const deps=getTeamDepartments(boosted,f);
  deps.att.forEach(({p,role})=>{const fit=roleFit(p.r,role,p.alt);att+=(p.fin*0.28+p.sha*0.22+p.otb*0.20+p.dri*0.15+p.pac*0.10+p.cre*0.05)*fit*w.techMod;});
  deps.mid.forEach(({p,role})=>{const fit=roleFit(p.r,role,p.alt);const raw=(p.vis*0.20+p.sps*0.20+p.tac*0.15+p.ant*0.15+p.cre*0.15+p.otb*0.15);att+=raw*fit*w.techMod*0.45;def+=raw*fit*w.physMod*0.45;});
  deps.def.forEach(({p,role})=>{const fit=roleFit(p.r,role,p.alt);def+=(p.tac*0.28+p.mar*0.25+p.dep*0.22+p.ant*0.15+p.hea*0.10)*fit*w.physMod;});
  const cfFit=COACH_FIT[cid];const coachBonus=(cfFit&&cfFit.pref.includes(fk))?cfFit.bonus:0;
  att*=ti.attMod*(1+coachBonus);def*=ti.defMod*(1+coachBonus);
  const homeBoost=homeBoostFor(boosted,stadiumId);
  att*=homeBoost;def*=homeBoost;
  const avgSta=boosted.filter(Boolean).reduce((s,p)=>s+p.sta,0)/(boosted.filter(Boolean).length||1);
  const attCount=deps.att.length+deps.mid.length*0.45||5;const defCount=deps.def.length+deps.mid.length*0.45||5;
  return{att:Math.max(40,att/attCount),def:Math.max(40,def/defCount+gkS*0.3),gkS,gk,avgSta,tiPosMod:ti.posMod,homeBoost};
}

export function identifyKeyDuels(stA,stB,fA,fB){
  const dA=getTeamDepartments(stA,fA),dB=getTeamDepartments(stB,fB);const duels=[];
  const strA=dA.att.map(x=>x.p).sort((a,b)=>(b.fin+b.sha)-(a.fin+a.sha))[0];
  const cbB=dB.def.map(x=>x.p).sort((a,b)=>(b.tac+b.mar)-(a.tac+a.mar))[0];
  if(strA&&cbB)duels.push({type:'Striker vs CB',pA:strA,pB:cbB,sA:'A',sB:'B'});
  const wA=dA.att.map(x=>x.p).filter(p=>p.id!==strA?.id).sort((a,b)=>(b.dri+b.pac)-(a.dri+a.pac))[0];
  const fbB=dB.def.map(x=>x.p).sort((a,b)=>b.ovr-a.ovr)[0];
  if(wA&&fbB)duels.push({type:'Winger vs Full-Back',pA:wA,pB:fbB,sA:'A',sB:'B'});
  const pmA=dA.mid.map(x=>x.p).sort((a,b)=>(b.vis+b.sps+b.cre)-(a.vis+a.sps+a.cre))[0];
  const dmB=dB.mid.map(x=>x.p).sort((a,b)=>(b.tac+b.dep)-(a.tac+a.dep))[0];
  if(pmA&&dmB)duels.push({type:'Playmaker vs Destroyer',pA:pmA,pB:dmB,sA:'A',sB:'B'});
  return duels;
}

export function determineMatchPersonality(stA,stB,weather,fA,fB){
  const all=[...stA,...stB].filter(Boolean);
  const avgAgg=all.reduce((s,p)=>s+p.agg,0)/all.length;
  const avgTech=all.reduce((s,p)=>s+(p.dri+p.sps+p.cre)/3,0)/all.length;
  const gelA=computeGel(stA),gelB=computeGel(stB);
  const tendA=FORMATIONS[fA]?.tend||0.5,tendB=FORMATIONS[fB]?.tend||0.5;
  if(['storm','snow'].includes(weather)||avgAgg>76)return'Physical War';
  if(avgTech>79&&(gelA+gelB)>55)return'Technical Showcase';
  if(gelA>40&&gelB>40&&!(tendA>0.58&&tendB>0.58))return'Tactical Battle';
  if(tendA>0.58&&tendB>0.58)return'Open Game';
  return'Chaotic Final';
}

export function pickGoalscorer(st,f){const deps=getTeamDepartments(st,f);const pool=[...deps.att,...deps.mid.slice(0,2)].filter(x=>x.p);if(!pool.length)return st.find(Boolean);return wPick(pool.map(x=>x.p),pool.map(x=>(x.p.fin+x.p.sha+x.p.otb)/3+(x.role==='ST'?10:x.role==='FW'?7:x.role==='AM'?5:2)));}

export function pickAssist(st,f,exId){const deps=getTeamDepartments(st,f);const pool=[...deps.mid,...deps.att].filter(x=>x.p&&x.p.id!==exId);if(!pool.length)return st.find(p=>p&&p.id!==exId);return wPick(pool.map(x=>x.p),pool.map(x=>(x.p.vis+x.p.sps+x.p.cre)/3));}

export function pickDef(st,f){const deps=getTeamDepartments(st,f);const pool=[...deps.def,...deps.mid.slice(0,1)].filter(x=>x.p);if(!pool.length)return st.find(Boolean);return wPick(pool.map(x=>x.p),pool.map(x=>(x.p.tac+x.p.mar+x.p.dep)/3));}

export function pickDrb(st,f){const deps=getTeamDepartments(st,f);const pool=[...deps.att,...deps.mid].filter(x=>x.p&&x.p.dri>75);if(!pool.length){const c=st.filter(Boolean);return c[rndInt(0,c.length-1)];}return wPick(pool.map(x=>x.p),pool.map(x=>x.p.dri+x.p.agi));}

export function pickFK(st){const c=st.filter(Boolean);if(!c.length)return null;return wPick(c,c.map(p=>p.frk+p.sps));}

export function wPick(arr,w){let t=w.reduce((s,x)=>s+x,0),r=Math.random()*t;for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return arr[i];}return arr[arr.length-1];}

function captainMorale(st,captainId){
  const cap=st.find(p=>p&&String(p.id)===String(captainId||''));
  if(!cap)return{mult:1,score:70,name:null,label:'No named captain'};
  const score=cap.wrt*0.45+cap.com*0.35+cap.con*0.20;
  const mult=1+Math.max(-0.008,Math.min(0.035,(score-72)*0.0013));
  const label=score>=84?'Elite dressing-room presence':score>=77?'Strong leadership':score>=70?'Steady captaincy':'Quiet captaincy';
  return{mult,score,name:cap.n,label};
}

export function runSimulation(cfg){
  let{stA,stB,formA,formB,coachA,coachB,weather,matchType,maxSubs,refereeId,tacticA,tacticB,stadiumId}=cfg;
  stA=[...stA];stB=[...stB];
  const ref=REFEREES.find(r=>r.id===refereeId)||REFEREES[0];
  const w=WEATHER[weather]||WEATHER.sun;
  const sA=teamStr(stA,formA,weather,coachA,tacticA,stadiumId);const sB=teamStr(stB,formB,weather,coachB,tacticB,stadiumId);
  const avgOvrA=computeAvgOvr(stA,formA),avgOvrB=computeAvgOvr(stB,formB);
  const gelA=computeGel(stA),gelB=computeGel(stB);
  const fA=FORMATIONS[formA],fB=FORMATIONS[formB];
  const personality=determineMatchPersonality(stA,stB,weather,formA,formB);
  const mp=MATCH_PERSONALITIES[personality]||MATCH_PERSONALITIES['Open Game'];
  const keyDuels=identifyKeyDuels(stA,stB,fA,fB);
  const capA=captainMorale(stA,cfg.captainA),capB=captainMorale(stB,cfg.captainB);
  function basePow(str,avgOvr,gel){return str.att*(1+(avgOvr-80)*0.040)*(1+(gel/80)*0.10);}
  function baseDefPow(str,avgOvr,gel){return str.def*(1+(avgOvr-80)*0.035)*(1+(gel/80)*0.08);}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  let redPenA=1.0,redPenB=1.0,momentumA=50+(capA.mult-1)*120,momentumB=50+(capB.mult-1)*120;
  const inactiveA=new Set(),inactiveB=new Set();
  function activeSt(isA){const inactive=isA?inactiveA:inactiveB;return (isA?stA:stB).map(p=>p&&!inactive.has(p.id)?p:null);}
  function markInactive(isA,p){if(p)(isA?inactiveA:inactiveB).add(p.id);}
  function stampLastMomentum(){const last=events[events.length-1];if(last){last.momA=Math.round(momentumA);last.momB=Math.round(momentumB);}}
  function updMom(isA,evt){
    if(evt==='goal'){if(isA){momentumA=Math.min(100,momentumA+22);momentumB=Math.max(0,momentumB-14);}else{momentumB=Math.min(100,momentumB+22);momentumA=Math.max(0,momentumA-14);}}
    else if(evt==='red'){if(isA)momentumA=Math.max(0,momentumA-28);else momentumB=Math.max(0,momentumB-28);}
    else if(evt==='miracle'){if(isA)momentumA=Math.min(100,momentumA+12);else momentumB=Math.min(100,momentumB+12);}
    else if(evt==='wood'){if(isA)momentumA=Math.min(100,momentumA+7);else momentumB=Math.min(100,momentumB+7);}
    momentumA=momentumA*0.88+50*0.12;momentumB=momentumB*0.88+50*0.12;
    stampLastMomentum();
  }
  const events=[];let scoreA=0,scoreB=0,eventSeq=0;
  const goalMinutes=new Set();
  function reserveGoalMinute(min){if(goalMinutes.has(min))return false;goalMinutes.add(min);return true;}
  const ratA=stA.map((p,i)=>({p,base:p?6.5+rnd(-0.65,0.85):6.5,events:[],motmScore:0,role:fA.pos[i]}));
  const ratB=stB.map((p,i)=>({p,base:p?6.5+rnd(-0.65,0.85):6.5,events:[],motmScore:0,role:fB.pos[i]}));
  const stats={shotsA:0,shotsB:0,onTargetA:0,onTargetB:0,xgA:0,xgB:0,bigChancesA:0,bigChancesB:0,cornersA:0,cornersB:0,foulsA:0,foulsB:0,yellowsA:0,yellowsB:0,redsA:0,redsB:0,offsetA:0,offsetB:0,woodA:0,woodB:0,goalScorers:[]};
  let subsUsedA=0,subsUsedB=0,subBoostA=1.0,subBoostB=1.0;
  const benchA=[...(cfg.benchA||[])],benchB=[...(cfg.benchB||[])];
  const minuteLoads=new Map();
  const fixedEventTypes=new Set(['ht','ft','weather','penalty_goal','penalty_save']);
  function eventMinute(min,type){
    const base=Math.max(1,Math.round(min||1));
    if(type==='goal'){minuteLoads.set(base,(minuteLoads.get(base)||0)+1);return base;}
    if(fixedEventTypes.has(type))return base;
    const max=matchType==='90'?90:125;
    const candidates=[base,base+1,base-1,base+2,base-2,base+3].map(m=>clamp(m,1,max));
    for(const cand of candidates){
      const load=minuteLoads.get(cand)||0;
      if(load<1){minuteLoads.set(cand,load+1);return cand;}
    }
    const load=minuteLoads.get(base)||0;minuteLoads.set(base,load+1);
    return base;
  }
  function addEv(min,type,text,isGA,isGB){
    const safeMin=eventMinute(min,type);
    events.push({min:safeMin,type,text,isGoalA:!!isGA,isGoalB:!!isGB,momA:Math.round(momentumA),momB:Math.round(momentumB),_ord:eventSeq++});
  }
  function applySub(isA,sub,outgoing,minute,reason,boostAdd,boostMax){
    if(!sub)return null;
    const st=isA?stA:stB,bench=isA?benchA:benchB,rats=isA?ratA:ratB,form=isA?fA:fB;
    const idx=outgoing?st.findIndex(p=>p&&p.id===outgoing.id):-1;
    const role=idx>=0?form.pos[idx]:sub.r;
    const benchIdx=bench.findIndex(p=>p&&p.id===sub.id);
    if(benchIdx>=0)bench[benchIdx]=null;
    if(idx>=0)st[idx]=sub;
    const outRat=outgoing?rats.find(r=>r.p&&r.p.id===outgoing.id&&!r.sub):null;
    if(outRat){
      outRat.outMin=minute;
      outRat.replacedBy=sub.n;
      if(reason==='injury')outRat.base-=0.25;
    }
    const subRat={p:sub,base:6.15+rnd(-0.30,0.35),events:[],motmScore:0,sub:true,inMin:minute,outFor:outgoing?.n||'',role};
    rats.push(subRat);
    if(isA){subsUsedA++;subBoostA=Math.min(subBoostA+boostAdd,boostMax);}
    else{subsUsedB++;subBoostB=Math.min(subBoostB+boostAdd,boostMax);}
    return subRat;
  }

  function attemptGoal(isA,minute,isET,etSeg){
    const attSt=activeSt(isA),attF=isA?fA:fB;
    const myPen=isA?redPenA:redPenB,mySubBoost=isA?subBoostA:subBoostB,myMom=isA?momentumA:momentumB;
    const oppPen=isA?redPenB:redPenA;
    const myCap=isA?capA:capB,oppCap=isA?capB:capA;
    let fatigueMod=1.0;
    if(!isET&&minute>65){const avgSta=isA?sA.avgSta:sB.avgSta;fatigueMod=Math.max(0.88,1-((minute-65)*(100-avgSta)*0.0003));}
    if(isET&&etSeg!==undefined){const avgSta=isA?sA.avgSta:sB.avgSta;fatigueMod=Math.max(0.78,1-(etSeg*(100-avgSta)*0.004));}
    const attPow=basePow(isA?sA:sB,isA?avgOvrA:avgOvrB,isA?gelA:gelB)*myPen*fatigueMod*mySubBoost*myCap.mult;
    const defPow=baseDefPow(isA?sB:sA,isA?avgOvrB:avgOvrA,isA?gelB:gelA)*oppPen*(1+(oppCap.mult-1)*0.65);
    const momMod=1+(myMom-50)/220;
    const baseProb=isET?0.28:0.32;const goalProb=baseProb*(attPow/(attPow+defPow))*momMod*mp.goalMult;
    const teamName=isA?'A':'B';const oppGk=isA?sB.gk:sA.gk;const myRat=isA?ratA:ratB;const oppRat=isA?ratB:ratA;
    if(isA)stats.shotsA++;else stats.shotsB++;
    const shotXg=Math.max(0.02,Math.min(0.45,goalProb*0.86+rnd(0.005,0.055)));
    if(isA){stats.xgA+=shotXg;if(shotXg>=0.24)stats.bigChancesA++;}else{stats.xgB+=shotXg;if(shotXg>=0.24)stats.bigChancesB++;}
    if(Math.random()>goalProb){
      const gk=isA?sB.gk:sA.gk;const scorer=pickGoalscorer(attSt,attF);
      const defender=pickDef(activeSt(!isA),isA?fB:fA);
      if(Math.random()<0.09*mp.woodMult&&scorer){
        addEv(minute,'woodwork',bc(pick(CMT.woodwork),{A:scorer.n,GK:gk?.n}));
        if(isA)stats.woodA++;else stats.woodB++;
        if(isA)stats.cornersA+=Math.random()<0.5?1:0;else stats.cornersB+=Math.random()<0.5?1:0;
        updMom(isA,'wood');return 0;
      }
      const qualityEdge=(attPow-defPow)/(attPow+defPow);
      const blockCut=clamp(0.22-qualityEdge*0.05,0.14,0.30);
      const chanceCut=blockCut+clamp(0.14+qualityEdge*0.08,0.08,0.24);
      const saveCut=chanceCut+clamp(0.30+goalProb*0.58+qualityEdge*0.18,0.24,0.60);
      const shotOutcome=Math.random();
      if(defender&&shotOutcome<blockCut){
        addEv(minute,'blocked',bc(pick(CMT.blocked),{A:scorer?.n,B:defender.n,T:teamName}));
        const dRat=oppRat.find(r=>r.p===defender);if(dRat){dRat.base+=0.16;dRat.motmScore+=0.25;}
        if(isA)stats.cornersA+=Math.random()<0.30?1:0;else stats.cornersB+=Math.random()<0.30?1:0;
      }else if(scorer&&shotOutcome<chanceCut){
        const creator=pickAssist(attSt,attF,scorer.id)||scorer;
        addEv(minute,'chance',bc(pick(CMT.chance),{A:creator.n,T:teamName}));
      }else if(gk&&shotOutcome<saveCut){
        if(isA)stats.onTargetA++;else stats.onTargetB++;
        const mir=Math.random()<0.18;
        addEv(minute,mir?'save_miracle':'save',bc(pick(mir?CMT.save_miracle:CMT.save_normal),{A:scorer?.n,GK:gk.n,T:teamName}));
        const gkRat=oppRat.find(r=>r.p===gk);if(gkRat){gkRat.base+=mir?0.95:0.35;gkRat.motmScore+=mir?2:0.5;}
        if(mir)updMom(!isA,'miracle');
        if(isA)stats.cornersA+=Math.random()<0.4?1:0;else stats.cornersB+=Math.random()<0.4?1:0;
      }else{if(scorer)addEv(minute,'miss',bc(pick(minute>78&&Math.abs(scoreA-scoreB)<=1?CMT.late_miss:CMT.miss),{A:scorer.n,T:teamName}));const rat=myRat.find(r=>r.p===scorer);if(rat)rat.base-=(100-scorer.com)/230;}
      return 0;
    }
    if(isA)stats.onTargetA++;else stats.onTargetB++;
    const scorer=pickGoalscorer(attSt,attF);if(!scorer)return 0;
    if(!reserveGoalMinute(minute)){
      const gk=isA?sB.gk:sA.gk;
      addEv(minute,'save',bc(pick(CMT.save_normal),{A:scorer.n,GK:gk?.n,T:teamName}));
      return 0;
    }
    const assister=pickAssist(attSt,attF,scorer.id);
    let goalType='normal';
    if(scorer.hea>82&&Math.random()<0.25)goalType='header';
    else if(scorer.shp>84&&scorer.frk>82&&Math.random()<0.15)goalType='long';
    else if(scorer.otb>85&&Math.random()<0.20)goalType='poach';
    const gArr=goalType==='header'?CMT.goal_header:goalType==='long'?CMT.goal_long:goalType==='poach'?CMT.goal_poach:CMT.goal_normal;
    const isLate=minute>80;const nowS=isA?scoreA+1:scoreB+1;const oppS=isA?scoreB:scoreA;const wasLevel=isLate&&nowS-1===oppS;
    let cmt='';
    if(wasLevel)cmt='⚽ GOAL! '+bc(pick(CMT.equaliser),{A:scorer.n,T:teamName,GK:oppGk?.n});
    else if(isET)cmt='⚽ GOAL! '+bc(pick(CMT.goal_et),{A:scorer.n,T:teamName,GK:oppGk?.n});
    else cmt='⚽ GOAL! '+bc(pick(gArr),{A:scorer.n,T:teamName,GK:oppGk?.n});
    if(assister)cmt+=' Assisted by '+matchName(assister.n)+'.';
    addEv(minute,'goal',cmt,isA,!isA);
    stats.goalScorers.push({min:minute,name:scorer.n,team:teamName,type:goalType});
    updMom(isA,'goal');
    const sRat=myRat.find(r=>r.p===scorer);if(sRat){sRat.base+=1.10;sRat.motmScore+=3;sRat.events.push('⚽');}
    if(assister){const aRat=myRat.find(r=>r.p===assister);if(aRat){aRat.base+=0.55;aRat.motmScore+=1.5;aRat.events.push('🎯');}}
    if(oppGk){const gkRat=oppRat.find(r=>r.p===oppGk);if(gkRat)gkRat.base-=0.40;}
    return isA?1:-1;
  }

  let prevMomA=50,prevMomB=50;
  for(let seg=0;seg<18;seg++){
    const minute=Math.max(1,seg*5+rndInt(0,4));
    if(seg===9){addEv(45,'ht',pick(CMT.ht));const wLine=WEATHER_CMT[weather];if(wLine)addEv(45,'weather',wLine);}
    const pAttA=basePow(sA,avgOvrA,gelA)*redPenA*capA.mult,pAttB=basePow(sB,avgOvrB,gelB)*redPenB*capB.mult;
    const pDefA=baseDefPow(sA,avgOvrA,gelA)*redPenA*(1+(capA.mult-1)*0.65),pDefB=baseDefPow(sB,avgOvrB,gelB)*redPenB*(1+(capB.mult-1)*0.65);
    const ratioA=pAttA/(pAttA+pDefB),ratioB=pAttB/(pAttB+pDefA);
    if(momentumA>prevMomA+18&&seg>3)addEv(minute,'momentum',bc(pick(CMT.momentum_a),{T:'A'}));
    else if(momentumB>prevMomB+18&&seg>3)addEv(minute,'momentum',bc(pick(CMT.momentum_b),{T:'B'}));
    prevMomA=momentumA;prevMomB=momentumB;
    if(seg<2&&Math.random()<0.35)addEv(minute,'tension',pick(CMT.early));
    if(minute>68&&scoreA!==scoreB&&Math.random()<0.16)addEv(minute,'momentum',bc(pick(CMT.chasing),{T:scoreA>scoreB?'B':'A'}));
    if(minute>80&&Math.abs(scoreA-scoreB)<=1&&Math.random()<0.14)addEv(minute,'tension',pick(CMT.late_tension));
    const chaseA=scoreB>scoreA?(scoreB-scoreA)*0.035:scoreA>scoreB?-(scoreA-scoreB)*0.018:0;
    const chaseB=scoreA>scoreB?(scoreA-scoreB)*0.035:scoreB>scoreA?-(scoreB-scoreA)*0.018:0;
    const qualityTiltA=(avgOvrA-avgOvrB)*0.006,qualityTiltB=(avgOvrB-avgOvrA)*0.006;
    const initA=ratioA+(momentumA-50)/180+qualityTiltA+chaseA+rnd(-0.08,0.08);
    const initB=ratioB+(momentumB-50)/180+qualityTiltB+chaseB+rnd(-0.08,0.08);
    const gap=clamp(Math.abs(initA-initB),0,0.24);
    const chanceA=clamp(0.31+ratioA*0.58+(initA>=initB?0.14+gap*0.45:-0.11-gap*0.35),0.22,0.93);
    const chanceB=clamp(0.31+ratioB*0.58+(initB>initA?0.14+gap*0.45:-0.11-gap*0.35),0.22,0.93);
    if(Math.random()<chanceA){const r=attemptGoal(true,minute,false);if(r>0)scoreA++;}
    if(Math.random()<chanceB){const r=attemptGoal(false,minute,false);if(r<0)scoreB++;}
    if(Math.random()<0.20*mp.foulMult){const isADef=Math.random()<0.5;const df=pickDef(activeSt(isADef),isADef?fA:fB);const att=pickGoalscorer(activeSt(!isADef),isADef?fB:fA);if(df&&att){addEv(minute,'tackle',bc(pick(CMT.tackle),{A:df.n,B:att.n}));const rat=(isADef?ratA:ratB).find(r=>r.p===df);if(rat){rat.base+=0.14;rat.motmScore+=0.3;}}}
    if(Math.random()<0.12*mp.dribMult){const isA=Math.random()<0.5;const drb=pickDrb(activeSt(isA),isA?fA:fB);const opp=pickDef(activeSt(!isA),isA?fB:fA);if(drb&&opp&&drb.dri>75)addEv(minute,'dribble',bc(pick(CMT.dribble),{A:drb.n,B:opp.n}));}
    if(Math.random()<0.10){const isA=Math.random()<0.5;const crosser=pickAssist(activeSt(isA),isA?fA:fB,null)||pickDrb(activeSt(isA),isA?fA:fB);if(crosser)addEv(minute,'cross',bc(pick(CMT.cross),{A:crosser.n,T:isA?'A':'B'}));}
    if(Math.random()<0.08){const isA=Math.random()<0.5;const stopper=pickDef(activeSt(isA),isA?fA:fB);if(stopper)addEv(minute,'interception',bc(pick(CMT.interception),{A:stopper.n,T:isA?'A':'B'}));}
    if(Math.random()<0.055){addEv(minute,'sterile',pick(CMT.sterile));}
    if(Math.random()<0.08){const isA=Math.random()<0.5;const fk=pickFK(activeSt(isA));if(fk){if(fk.frk>85&&Math.random()<0.38&&reserveGoalMinute(minute)){addEv(minute,'goal','⚽ FREE KICK GOAL! '+bc(pick(CMT.freekick_goal),{A:fk.n,T:isA?'A':'B',GK:isA?sB.gk?.n:sA.gk?.n}),isA,!isA);if(isA){scoreA++;stats.onTargetA++;stats.goalScorers.push({min:minute,name:fk.n,team:'A',type:'fk'});const r=ratA.find(r=>r.p===fk);if(r){r.base+=1.0;r.motmScore+=2.5;r.events.push('⚽🎯');}}else{scoreB++;stats.onTargetB++;stats.goalScorers.push({min:minute,name:fk.n,team:'B',type:'fk'});const r=ratB.find(r=>r.p===fk);if(r){r.base+=1.0;r.motmScore+=2.5;r.events.push('⚽🎯');}}updMom(isA,'goal');}else{addEv(minute,'freekick',bc(pick(CMT.freekick),{A:fk.n}));if(isA)stats.cornersA++;else stats.cornersB++;}}}
    if(Math.random()<0.14){if(ratioA>0.5)stats.cornersA++;else stats.cornersB++;}
    if(Math.random()<0.12){if(Math.random()<0.5)stats.offsetA++;else stats.offsetB++;}
    ['A','B'].forEach(s=>{const isA=s==='A';const pool=activeSt(isA);const avgAgg=pool.filter(Boolean).reduce((sum,p)=>sum+p.agg,0)/(pool.filter(Boolean).length||1);if(Math.random()<(0.35+(avgAgg-70)/190)*mp.foulMult){if(isA)stats.foulsA++;else stats.foulsB++;}});
    if(Math.random()<0.034*ref.strictness){
      const isA=Math.random()<0.5;const pool=activeSt(isA);const cands=pool.filter(p=>p&&p.r!=='GK');
      if(cands.length){
        const injured=cands[rndInt(0,cands.length-1)];
        if(injured){
        markInactive(isA,injured);addEv(minute,'injury',bc(pick(CMT.injury),{A:injured.n}));
        const injRat=(isA?ratA:ratB).find(r=>r.p===injured);if(injRat){injRat.base-=0.55;injRat.events.push('🤕');}
        const curSubs=isA?subsUsedA:subsUsedB;
        if(curSubs<maxSubs){
          const bp=isA?benchA:benchB;
          const sub=bp.find(p=>p&&p.r===injured.r&&p.r!=='GK')||bp.find(p=>p&&p.r!=='GK');
          if(sub){const subMinute=minute+1;addEv(subMinute,'sub',bc(pick(CMT.sub),{A:sub.n,B:injured.n,T:isA?'A':'B'}));applySub(isA,sub,injured,subMinute,'injury',0.030,1.14);}
        }else{if(isA)redPenA=Math.max(0.82,redPenA*0.93);else redPenB=Math.max(0.82,redPenB*0.93);}
        }
      }
    }
    if(Math.random()<0.06*ref.strictness*mp.foulMult){const isA=Math.random()<0.5;const pool=activeSt(isA);const cands=pool.filter(p=>p&&p.agg>68);if(cands.length){const yp=cands[rndInt(0,cands.length-1)];const tgt=pickGoalscorer(activeSt(!isA),isA?fB:fA);addEv(minute,'yellow',bc(pick(CMT.yellow),{A:yp.n,B:tgt?.n||'?'}));if(isA){stats.yellowsA++;stats.foulsA++;}else{stats.yellowsB++;stats.foulsB++;}}}
    if(Math.random()<0.007*ref.strictness*mp.redMult+(ref.controversial?0.006:0)){const isA=Math.random()<0.5;const pool=activeSt(isA);const cands=pool.filter(p=>p&&p.agg>80&&p.r!=='GK');if(cands.length){const rp=cands[rndInt(0,cands.length-1)];markInactive(isA,rp);addEv(minute,'red',bc(pick(CMT.red),{A:rp.n,T:isA?'A':'B'}));if(isA){stats.redsA++;redPenA=Math.max(0.70,redPenA*0.84);}else{stats.redsB++;redPenB=Math.max(0.70,redPenB*0.84);}updMom(isA,'red');const rat=(isA?ratA:ratB).find(r=>r.p===rp);if(rat){rat.base-=1.8;rat.events.push('🟥');}}}
    if(minute>=55&&minute<=68){
      ['A','B'].forEach(s=>{
        const isA=s==='A',cur=isA?subsUsedA:subsUsedB;
        if(cur>=maxSubs||cur>=Math.ceil(maxSubs/2))return;
        const bp=isA?benchA:benchB,st2=activeSt(isA),form=isA?fA:fB,live=isA?stA:stB;
        const outPool=st2.filter(p=>p&&p.r!=='GK');
        if(!outPool.length)return;
        const so=outPool[rndInt(0,outPool.length-1)];
        if(!so)return;
        const idx=live.findIndex(p=>p&&p.id===so.id);
        const role=idx>=0?form.pos[idx]:so.r;
        const si=bp.find(p=>p&&p.r!=='GK'&&roleFit(p.r,role,p.alt)>=0.65)||bp.find(p=>p&&p.r!=='GK');
        if(si){const subMinute=minute+rndInt(0,3);addEv(subMinute,'sub',bc(pick(CMT.sub),{A:si.n,B:so.n,T:s}));applySub(isA,si,so,subMinute,'tactical',0.015,1.12);}
      });
    }
  }

  if(!events.find(e=>e.type==='ht'))events.splice(Math.floor(events.length/2),0,{min:45,type:'ht',text:pick(CMT.ht),momA:Math.round(momentumA),momB:Math.round(momentumB)});
  let penShootout=null,shootoutWinner=null;
  if(scoreA===scoreB){
    if(matchType==='et'){
      addEv(90,'ht','🕐 Full time: '+scoreA+'-'+scoreB+'. Extra time!');
      for(let seg=0;seg<4;seg++){const m=90+seg*5+rndInt(1,4);const pA=basePow(sA,avgOvrA,gelA)*redPenA*capA.mult,pB=basePow(sB,avgOvrB,gelB)*redPenB*capB.mult,pdA=baseDefPow(sA,avgOvrA,gelA)*redPenA*(1+(capA.mult-1)*0.65),pdB=baseDefPow(sB,avgOvrB,gelB)*redPenB*(1+(capB.mult-1)*0.65);if(Math.random()<(0.65+(pA/(pA+pdB))*0.25)){const r=attemptGoal(true,m,true,seg);if(r>0){scoreA++;break;}}if(scoreA>scoreB)break;if(Math.random()<(0.65+(pB/(pB+pdA))*0.25)){const r=attemptGoal(false,m,true,seg);if(r<0){scoreB++;break;}}if(scoreB>scoreA)break;}
      if(scoreA===scoreB){addEv(120,'ht','⚡ Still level. PENALTY SHOOTOUT!');penShootout=simPens(activeSt(true),activeSt(false),ratA,ratB,events);shootoutWinner=penShootout.winner;}
    }else if(matchType==='golden'){
      addEv(90,'ht','🥇 Golden Goal period begins!');let done=false;
      for(let seg=0;seg<6&&!done;seg++){const m=90+seg*3+rndInt(1,2);if(Math.random()<0.55){const r=attemptGoal(true,m,true,seg);if(r>0){scoreA++;addEv(m+1,'goal','🥇 GOLDEN GOAL! Match over!');done=true;}}if(!done&&Math.random()<0.55){const r=attemptGoal(false,m,true,seg);if(r<0){scoreB++;addEv(m+1,'goal','🥇 GOLDEN GOAL! Match over!');done=true;}}}
      if(!done){if(Math.random()<0.5)scoreA++;else scoreB++;}
    }
  }
  addEv(90+(matchType!=='90'?30:0),'ft',pick(CMT.ft));

  // Possession
  const midA2=getTeamDepartments(activeSt(true),fA).mid.map(x=>x.p),midB2=getTeamDepartments(activeSt(false),fB).mid.map(x=>x.p);
  const pasA=midA2.reduce((s,p)=>s+(p.sps+p.lps+p.vis)/3,0)/(midA2.length||1)*sA.tiPosMod;
  const pasB=midB2.reduce((s,p)=>s+(p.sps+p.lps+p.vis)/3,0)/(midB2.length||1)*sB.tiPosMod;
  stats.possA=Math.round(pasA/(pasA+pasB)*100);stats.possB=100-stats.possA;

  const winner=shootoutWinner||(scoreA>scoreB?'A':scoreA<scoreB?'B':'draw');
  ratA.forEach(r=>{if(!r.p)return;r.base+=winner==='A'?0.40:winner==='B'?-0.30:0;r.base+=rnd(-0.12,0.12);r.base=Math.max(4.5,Math.min(9.5,r.base));});
  ratB.forEach(r=>{if(!r.p)return;r.base+=winner==='B'?0.40:winner==='A'?-0.30:0;r.base+=rnd(-0.12,0.12);r.base=Math.max(4.5,Math.min(9.5,r.base));});
  const capRatA=ratA.find(r=>r.p&&String(r.p.id)===String(cfg.captainA||''));if(capRatA){capRatA.base=Math.min(9.5,capRatA.base+(capA.mult-1)*8);capRatA.events.push('C');}
  const capRatB=ratB.find(r=>r.p&&String(r.p.id)===String(cfg.captainB||''));if(capRatB){capRatB.base=Math.min(9.5,capRatB.base+(capB.mult-1)*8);capRatB.events.push('C');}
  stats.xgA=Number(stats.xgA.toFixed(2));stats.xgB=Number(stats.xgB.toFixed(2));

  const duelResults=keyDuels.map(duel=>{
    const rA=(duel.sA==='A'?ratA:ratB).find(r=>r.p?.id===duel.pA.id);
    const rB=(duel.sB==='B'?ratB:ratA).find(r=>r.p?.id===duel.pB.id);
    const sA2=rA?.base||6.5,sB2=rB?.base||6.5;
    const dw=sA2>sB2+0.25?'A':sB2>sA2+0.25?'B':'draw';
    return{...duel,scoreA:sA2,scoreB:sB2,duelWinner:dw};
  });

  events.sort((a,b)=>a.min-b.min||((a._ord||0)-(b._ord||0)));
  const all=[...ratA.map(r=>({...r,side:'A'})),...ratB.map(r=>({...r,side:'B'}))].filter(r=>r.p);
  const winnerRat=winner!=='draw'?all.filter(r=>r.side===winner):all;
  const motm=winnerRat.sort((a,b)=>(b.base+b.motmScore*0.3)-(a.base+a.motmScore*0.3))[0];
  return{scoreA,scoreB,events,ratA,ratB,motm,penShootout,winner,stats,personality,duelResults,weather:w,captainMorale:{A:capA,B:capB}};
}

export function simPens(stA,stB,ratA,ratB,events){
  const pksA=[],pksB=[];let totA=0,totB=0;
  const shA=stA.filter(p=>p&&p.r!=='GK').sort((a,b)=>b.pen-a.pen);
  const shB=stB.filter(p=>p&&p.r!=='GK').sort((a,b)=>b.pen-a.pen);
  const gkA=stA[0],gkB=stB[0];
  function kick(team,idx){
    const isA=team==='A';
    const shooters=isA?shA:shB;
    const gk=isA?gkB:gkA;
    const p=shooters[idx%shooters.length];
    if(!p)return false;
    const raw=(p.pen+p.com)/2/100-(gk?(gk.ref+gk.han)/2/100*0.45:0.15)*0.5+0.5;
    const sc=Math.max(0.50,Math.min(0.92,raw));
    const scored=Math.random()<sc;
    events.push({min:121+idx,type:scored?'penalty_goal':'penalty_save',side:team,text:bc(pick(scored?CMT.pen_score:CMT.pen_save),{A:p.n,GK:gk?.n,T:team}),momA:50,momB:50});
    return scored;
  }
  for(let i=0;i<5;i++){
    const aS=kick('A',i);pksA.push(aS);if(aS)totA++;
    const bS=kick('B',i);pksB.push(bS);if(bS)totB++;
    const remaining=4-i;
    if(totA>totB+remaining)return{pksA,pksB,totA,totB,winner:'A'};
    if(totB>totA+remaining)return{pksA,pksB,totA,totB,winner:'B'};
  }
  let i=5;
  while(totA===totB&&i<22){
    const aS=kick('A',i);pksA.push(aS);if(aS)totA++;
    const bS=kick('B',i);pksB.push(bS);if(bS)totB++;
    if(aS!==bS)break;
    i++;
  }
  if(totA===totB)return{pksA,pksB,totA,totB,winner:Math.random()<0.5?'A':'B'};
  return{pksA,pksB,totA,totB,winner:totA>totB?'A':'B'};
}
