export const COACHES=[
  {id:'ferguson',name:'Ferguson',    bonus:{agg:8,con:10,com:5},  style:'Counter'},
  {id:'sacchi',  name:'Sacchi',      bonus:{dep:12,tmw:10,mar:8}, style:'High Press'},
  {id:'michels', name:'Michels',     bonus:{cre:10,otb:8,vis:8},  style:'Total Football'},
  {id:'guardiola',name:'Guardiola',  bonus:{sps:12,vis:10,tmw:8}, style:'Possession'},
  {id:'ancelotti',name:'Ancelotti',  bonus:{com:8,con:8,cre:5},   style:'Balanced'},
  {id:'clough',  name:'Clough',      bonus:{com:10,wrt:8,agg:5},  style:'Direct'},
  {id:'santana', name:'Telê Santana',bonus:{cre:15,dri:10,otb:8}, style:'Attack'},
  {id:'menotti', name:'Menotti',     bonus:{cre:8,vis:5,sps:8},   style:'Fluid'},
  {id:'happel',  name:'Happel',      bonus:{tmw:10,dep:5,sta:8,con:6},style:'Tactical'},
  {id:'mourinho',name:'Mourinho',    bonus:{dep:10,com:8,con:7,agg:5},style:'Pragmatic'},
];

export const COACH_FIT={
  'ferguson':  {pref:['4-4-2','3-5-2','4-5-1'],                      bonus:0.06},
  'sacchi':    {pref:['4-4-2','4-3-3','4-1-4-1'],                    bonus:0.08},
  'michels':   {pref:['4-3-3','3-4-3'],                              bonus:0.08},
  'guardiola': {pref:['4-3-3','4-2-3-1','3-4-3','4-3-1-2'],         bonus:0.10},
  'ancelotti': {pref:['4-4-2','4-3-3','4-2-3-1','4-4-1-1'],         bonus:0.05},
  'clough':    {pref:['4-4-2','5-3-2','4-5-1'],                      bonus:0.06},
  'santana':   {pref:['4-3-3','3-4-3','4-3-1-2'],                    bonus:0.09},
  'menotti':   {pref:['4-3-3','4-4-2','3-4-3'],                      bonus:0.06},
  'happel':    {pref:['3-5-2','4-2-3-1','4-4-1-1','3-4-1-2'],       bonus:0.07},
  'mourinho':  {pref:['4-2-3-1','4-4-1-1','4-5-1','5-3-2'],         bonus:0.08},
};

export const TACTICAL_INSTRUCTIONS={
  'balanced':  {label:'⚖️ Balanced',   attMod:1.00,defMod:1.00,staMod:1.00,posMod:1.00},
  'high_press':{label:'⬆️ High Press', attMod:1.06,defMod:1.06,staMod:0.92,posMod:1.08},
  'low_block': {label:'🔒 Low Block',  attMod:0.85,defMod:1.18,staMod:1.05,posMod:0.84},
  'direct':    {label:'🎯 Direct',     attMod:1.08,defMod:0.94,staMod:0.97,posMod:0.80},
  'possession':{label:'🔄 Possession', attMod:0.95,defMod:1.08,staMod:0.99,posMod:1.14},
  'counter':   {label:'⚡ Counter',    attMod:1.10,defMod:1.05,staMod:0.96,posMod:0.82},
};

export function coachName(id){return COACHES.find(c=>c.id===id)?.name||'No coach';}
