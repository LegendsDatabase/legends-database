export function pick(a){return a[Math.floor(Math.random()*a.length)];}

export function rnd(mn,mx){return mn+Math.random()*(mx-mn);}

export function rndInt(mn,mx){return Math.floor(rnd(mn,mx+1));}

export function matchName(name){
  const raw=(name||'?').toString().trim();
  if(!raw)return'?';
  if(raw.includes(','))return raw.split(',')[0].trim()||raw;
  const parts=raw.split(/\s+/).filter(Boolean);
  return parts.length>1?parts[parts.length-1]:raw;
}

export function fmtNum(n){return Math.round(n).toLocaleString('en-US');}

export function bc(t,v){return t.replace(/{A}/g,matchName(v.A)).replace(/{B}/g,matchName(v.B)).replace(/{T}/g,v.T||'?').replace(/{GK}/g,matchName(v.GK));}

export function ovrColor(v){if(v>=93)return'#0071e3';if(v>=88)return'#1a5e1a';if(v>=82)return'#2e8b2e';if(v>=74)return'#6aaa2a';if(v>=65)return'#c8a800';return'#c0392b';}

export function topPlayerName(st){
  const p=st.filter(Boolean).sort((a,b)=>b.ovr-a.ovr)[0];
  return p?matchName(p.n):'-';
}
