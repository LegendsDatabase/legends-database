import { computeAvgOvr } from './formations.js';

import { rnd } from './utils.js';

export const STADIUMS={
  maracana:{nation:'Brazil',capacity:78838,homeLabel:'Brazilian home edge'},
  wembley:{nation:'England',capacity:90000,homeLabel:'English home edge'},
  bernabeu:{nation:'Spain',capacity:81044,homeLabel:'Spanish home edge'},
  sansiro:{nation:'Italy',capacity:80018,homeLabel:'Italian home edge'},
  campnou:{nation:'Spain',capacity:99354,homeLabel:'Spanish home edge'},
  azteca:{nation:'Mexico',capacity:87523,homeLabel:'Mexican home edge'},
  anfield:{nation:'England',capacity:61276,homeLabel:'English home edge'},
  bombonera:{nation:'Argentina',capacity:54000,homeLabel:'Argentine home edge'},
  iduna:{nation:'Germany',capacity:81365,homeLabel:'German home edge'},
  centenario:{nation:'Uruguay',capacity:60235,homeLabel:'Uruguayan home edge'},
  oldtrafford:{nation:'England',capacity:74310,homeLabel:'English home edge'},
  allianz:{nation:'Germany',capacity:75024,homeLabel:'German home edge'},
  psg:{nation:'France',capacity:47929,homeLabel:'French home edge'},
};

export const TEAM_PALETTES={
  emerald:{label:'Emerald',main:'#1a7a1a',live:'#4dff88',soft:'#efffee',border:'#c6ead4',rgb:'77,255,136'},
  crimson:{label:'Crimson',main:'#b83227',live:'#ff6b5b',soft:'#fff0ee',border:'#f5c6bc',rgb:'255,107,91'},
  royal:{label:'Royal Blue',main:'#0057b8',live:'#5aa7ff',soft:'#eef6ff',border:'#cfe4ff',rgb:'90,167,255'},
  amber:{label:'Amber',main:'#9a6a00',live:'#ffd166',soft:'#fff8df',border:'#f1d98d',rgb:'255,209,102'},
  violet:{label:'Violet',main:'#5b3fd6',live:'#a99cff',soft:'#f2efff',border:'#d8d0ff',rgb:'169,156,255'},
  graphite:{label:'Graphite',main:'#2f343b',live:'#d5dde8',soft:'#f0f2f5',border:'#d6dbe3',rgb:'213,221,232'},
  teal:{label:'Teal',main:'#00796b',live:'#40e0c8',soft:'#eafffb',border:'#b8ebe4',rgb:'64,224,200'},
  claret:{label:'Claret',main:'#7d1734',live:'#ff7aa2',soft:'#fff0f5',border:'#efbdd0',rgb:'255,122,162'},
};

export const REFEREES=[
  {id:'collina',   name:'Pierluigi Collina',  strictness:0.80,profile:'Authoritative',cardRisk:'Medium'},
  {id:'merck',     name:'Markus Merk',        strictness:0.75,profile:'Strict',       cardRisk:'High'},
  {id:'frisk',     name:'Anders Frisk',       strictness:0.70,profile:'Let It Play',  cardRisk:'Low'},
  {id:'archundia', name:'Benito Archundia',   strictness:0.65,profile:'Balanced',     cardRisk:'Medium'},
  {id:'michel',    name:'Lubos Michel',       strictness:0.60,profile:'Lenient',      cardRisk:'Low'},
  {id:'hauge',     name:'Rune Hauge',         strictness:0.55,profile:'Permissive',   cardRisk:'Very Low'},
  {id:'moreno',    name:'Byron Moreno ⚠️',    strictness:0.15,controversial:true,profile:'Controversial',cardRisk:'Chaos'},
];

export const WEATHER={
  sun:       {label:'☀️ Perfect',   attMod:1.00,defMod:1.00,techMod:1.00,physMod:1.00},
  light_rain:{label:'🌧️ Light Rain',attMod:0.97,defMod:1.02,techMod:0.95,physMod:1.03},
  heavy_rain:{label:'⛈️ Heavy Rain',attMod:0.93,defMod:1.05,techMod:0.88,physMod:1.08},
  storm:     {label:'🌪️ Storm',     attMod:0.90,defMod:1.03,techMod:0.82,physMod:1.10},
  snow:      {label:'🌨️ Snow',      attMod:0.94,defMod:1.03,techMod:0.90,physMod:1.02},
};

export const MATCH_PERSONALITIES={
  'Tactical Battle':   {cssClass:'mp-tactical',foulMult:0.85,woodMult:1.2,goalMult:0.88,dribMult:0.80,redMult:0.9},
  'Open Game':         {cssClass:'mp-open',    foulMult:1.00,woodMult:1.1,goalMult:1.15,dribMult:1.10,redMult:0.9},
  'Physical War':      {cssClass:'mp-physical',foulMult:1.45,woodMult:0.9,goalMult:0.90,dribMult:0.70,redMult:1.4},
  'Technical Showcase':{cssClass:'mp-technical',foulMult:0.75,woodMult:1.3,goalMult:1.05,dribMult:1.30,redMult:0.7},
  'Chaotic Final':     {cssClass:'mp-chaotic', foulMult:1.10,woodMult:1.1,goalMult:1.20,dribMult:1.00,redMult:1.2},
};

export const RANDOM_ARCHETYPES=[
  {id:'dream',     label:'⭐ Dream XI',  desc:'Highest OVR'},
  {id:'attack',    label:'⚔️ Attack',    desc:'Best finishers'},
  {id:'technical', label:'🎨 Technical', desc:'Dribbling & passing'},
  {id:'physical',  label:'💪 Physical',  desc:'Strength & pace'},
  {id:'random',    label:'🎲 Random',    desc:'Random by role'},
];

export function stadiumInfo(id){return STADIUMS[id]||STADIUMS.maracana;}

export function homeBoostFor(st,stadiumId){
  const homeNation=stadiumInfo(stadiumId).nation;
  const homeCount=st.filter(p=>p&&p.nat===homeNation).length;
  return 1+Math.min(0.035,homeCount*0.0045);
}

export function estimateAttendance(stA,stB,formA,formB,stadiumId,competition){
  const stadium=stadiumInfo(stadiumId);
  const avg=(computeAvgOvr(stA,formA)+computeAvgOvr(stB,formB))/2;
  const compBoost={friendly:0.00,worldcup:0.09,champions:0.07,libertadores:0.08}[competition]||0;
  const fill=Math.max(0.52,Math.min(0.995,0.58+((avg-70)/30)*0.30+compBoost+rnd(-0.015,0.015)));
  return Math.min(stadium.capacity,Math.round(stadium.capacity*fill/100)*100);
}
