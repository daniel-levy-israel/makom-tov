import fs from 'node:fs';
const current=JSON.parse(fs.readFileSync('properties.json','utf8'));
const baselinePath=process.argv[2];
if(!baselinePath) throw new Error('Usage: node scripts/qa-descriptions.mjs <baseline-properties.json>');
const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
const old=new Map(baseline.map(p=>[String(p.id),String(p.desc||'')]));
const words=s=>s.match(/[\p{L}\p{N}״׳"'-]+/gu)||[];
const norm=s=>words(String(s).toLowerCase()).map(x=>x.replace(/["״׳']/g,''));
const ngrams=(s,n)=>{const w=norm(s),r=new Set;for(let i=0;i<=w.length-n;i++)r.add(w.slice(i,i+n).join(' '));return r};
const cliches=['מושלם','מטורף','עוצר נשימה','קסום','מפנק','חלומי','אין שני לה','הגעתם למקום הנכון'];
const bad=[]; let checked=0, min=999,max=0, copied=0;
for(const p of current){
 if(!old.get(String(p.id)).trim()) continue;
 checked++; const d=String(p.desc||''); const wc=words(d).length; min=Math.min(min,wc);max=Math.max(max,wc);
 const thin=d.includes('הרשומה כוללת מידע בסיסי בלבד.'); if((!thin&&wc<60)||wc>90||(thin&&wc<40)) bad.push([p.id,'length',wc]);
 if(/[\u0590-\u05ff][A-Za-z]|[A-Za-z][\u0590-\u05ff]/.test(d)) bad.push([p.id,'mixed-direction token']);
 if(/[\u202A-\u202E\u2066-\u2069]/.test(d)) bad.push([p.id,'direction control']);
 const sentences=d.split(/[.!?]+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean); const sentenceCounts=new Map; for(const sentence of sentences) sentenceCounts.set(sentence,(sentenceCounts.get(sentence)||0)+1); for(const [sentence,count] of sentenceCounts) if(count>1) bad.push([p.id,'duplicate sentence',sentence]);
 const body=d.slice(String(p.name||'').trim().length);
 for(const c of cliches) if(body.includes(c)) bad.push([p.id,'cliche',c]);
 const oldText=old.get(String(p.id)).replace(String(p.name||''),''); const newText=d.replace(String(p.name||'').trim(),'');
 const old6=ngrams(oldText,6), now6=ngrams(newText,6); const hits=[...now6].filter(x=>old6.has(x));
 if(hits.length){copied++;bad.push([p.id,'copied 6-gram',hits[0]]);}
 if(!d.startsWith(String(p.name||'').replace(/\s+/g,' ').trim())) bad.push([p.id,'opening does not start with property name']);
 const allowed=new Set(p.amenities||[]);
 const claims=[['בריכה פרטית','בריכה פרטית ליחידה'],['חימום לבריכה','בריכה מחוממת בחורף','בריכה מחוממת מקורה בחורף'],["ג'קוזי","ג'קוזי  ביחידות","ג'קוזי ספא חיצוני ביחידה","ג'קוזי ספא זרמים"],['סאונה יבשה','סאונה יבשה'],['מטבח מאובזר','מטבח מאובזר'],['מטבח משותף','מטבח משותף במתחם'],['חנייה','חנייה'],['Wi-Fi','אינטרנט wifi']];
 for(const [text,...src] of claims) if(body.includes(text)&&!src.some(x=>allowed.has(x))) bad.push([p.id,'unsupported amenity',text]);
}
console.log(JSON.stringify({checked,minWords:min,maxWords:max,copiedSixGramListings:copied,failures:bad.length,sampleFailures:bad.slice(0,20)},null,2));
if(bad.length) process.exit(1);
