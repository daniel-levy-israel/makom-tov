import fs from 'node:fs';
const path='properties.json';
const data=JSON.parse(fs.readFileSync(path,'utf8'));
const targets=data.filter(p=>String(p.desc||'').trim());
const before=new Map(targets.map(p=>[String(p.id),p.desc]));
fs.writeFileSync('qa-description-before.json',JSON.stringify(Object.fromEntries(before),null,2)+'\n');
const has=(p,s)=>(p.amenities||[]).includes(s);
const any=(p,arr)=>arr.find(x=>has(p,x));
const compact=s=>s.replace(/\s+/g,' ').trim();
const units={
 'צימרים':'מתחם צימרים','וילות':'וילת נופש','דירות נופש':'דירות נופש','בתי מלון':'מלון','בתי מלון בוטיק':'מלון בוטיק','קמפינג':'מתחם אירוח וקמפינג','קרוואנים':'מתחם קרוואנים','סוויטות':'מתחם סוויטות','הוסטלים':'הוסטל','לופטים':'לופט'
};
function opening(p){
 const type=units[p.category]||'מקום אירוח';
 const loc=p.town&&p.region&&p.town!==p.region?`${p.town}, באזור ${p.region}`:(p.town||p.region||'ישראל');
 return `${p.name} הוא ${type} ב${loc}.`;
}
function scale(p){
 const a=[];
 if(p.units>1 && p.units<200) a.push(`במתחם ${p.units} יחידות אירוח`);
 else if(p.units===1) a.push('האירוח הוא ביחידה פרטית אחת');
 if(p.guests>0 && p.guests<500) a.push(`והקיבולת הכוללת היא עד ${p.guests} אורחים`);
 return a.length?`${a.join(' ')}.`:'';
}
function core(p){
 const a=[];
 const A=p.amenities||[];
 if(any(p,['בריכה פרטית ליחידה'])) a.push('בריכה פרטית');
 else if(any(p,['בריכה במתחם'])) a.push('בריכה במתחם');
 else if(any(p,['בריכה ביישוב - כניסה  חופשית לאורחים','בריכה ביישוב - כניסה בתשלום'])) a.push('גישה לבריכה ביישוב');
 if(any(p,['בריכה מחוממת מקורה בחורף','בריכה מחוממת בחורף'])) a.push('חימום לבריכה בחורף');
 if(any(p,["ג'קוזי  ביחידות","ג'קוזי ספא חיצוני ביחידה","ג'קוזי ספא זרמים"])) a.push("ג'קוזי");
 if(has(p,'סאונה יבשה')) a.push('סאונה יבשה');
 if(any(p,['מטבח מאובזר','מטבח משותף במתחם'])) a.push(has(p,'מטבח מאובזר')?'מטבח מאובזר':'מטבח משותף');
 else if(has(p,'פינת קפה')) a.push('פינת קפה');
 if(any(p,['חצר/ גינה','מרפסת','פינת ישיבה'])) a.push(has(p,'חצר/ גינה')?'חצר או גינה':has(p,'מרפסת')?'מרפסת':'פינת ישיבה');
 if(has(p,'חנייה')) a.push('חנייה');
 if(has(p,'אינטרנט wifi')) a.push('Wi-Fi');
 if(!a.length && has(p,'מיזוג אוויר')) a.push('מיזוג אוויר');
 return a.slice(0,5);
}
function facilities(p){
 const a=core(p); if(!a.length) return '';
 return `בין המתקנים הרשומים: ${a.join(', ')}.`;
}
function audience(p){
 const a=[];
 if(has(p,'למשפחות')) a.push('משפחות');
 if(has(p,'לזוגות')) a.push('זוגות');
 if(has(p,'מתאים לקבוצות')) a.push('קבוצות');
 if(has(p,'מתאים למטיילים')) a.push('מטיילים');
 if(has(p,'מתאים לציבור הדתי')) a.push('שומרי מסורת');
 if(!a.length){
  if(p.category==='וילות'||p.category==='קמפינג') a.push('משפחות וקבוצות');
  else if(p.category==='צימרים'||p.category==='סוויטות') a.push('זוגות ומשפחות');
  else a.push('אורחים שמחפשים לינה באזור');
 }
 return `המקום מסומן כמתאים ל${a.slice(0,3).join(', ')}.`;
}
function context(p){
 const a=[];
 if(has(p,'חוף ים')) a.push('חוף ים');
 if(has(p,'מסלולי טיול')) a.push('מסלולי טיול');
 if(has(p,'טיולי אופניים')) a.push('טיולי אופניים');
 if(has(p,"טיולי ג'יפים")) a.push("טיולי ג'יפים");
 if(has(p,'שייט')) a.push('שייט');
 if(has(p,'רכיבה על סוסים')) a.push('רכיבה על סוסים');
 if(!a.length) return '';
 return `בסביבה מופיעות אפשרויות ל${a.slice(0,3).join(', ')}.`;
}
function price(p){
 if(p.priceMin>0&&p.priceMax>=p.priceMin) return `טווח המחיר הרשום הוא ${p.priceMin===p.priceMax?p.priceMin:`${p.priceMin}-${p.priceMax}`} ₪, ויש לאמת זמינות ומחיר מול המקום.`;
 return 'כדאי לאמת מול המקום את המחיר, הזמינות והתאמת היחידה להרכב האורחים.';
}
function words(s){return s.match(/[\p{L}\p{N}״׳"'-]+/gu)?.length||0}
function make(p){
 let seg=[opening(p),scale(p),facilities(p),audience(p),context(p),price(p)].filter(Boolean);
 let s=compact(seg.join(' '));
 if(words(s)<60) s=compact(s+' פרטי האירוח והמתקנים עשויים להשתנות בין היחידות ובעונות שונות, ולכן מומלץ לוודא אותם לפני ההזמנה.');
 if(words(s)>90){
   seg=[opening(p),scale(p),facilities(p),audience(p),price(p)].filter(Boolean); s=compact(seg.join(' '));
 }
 if(words(s)<60) s=compact(s+' המידע מבוסס על פרטי הנכס הזמינים כעת; לפני שסוגרים, מומלץ לפנות למארחים ולבדוק מה כלול, אילו יחידות פנויות, מהם תנאי הביטול והאם קיימות מגבלות מיוחדות להרכב המבוקש.');
 return s;
}
for(const p of targets) p.desc=make(p);
fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const report=targets.map(p=>({id:p.id,name:p.name,words:words(p.desc),old:before.get(String(p.id)),desc:p.desc,amenities:p.amenities||[]}));
fs.writeFileSync('qa-description-report.json',JSON.stringify(report,null,2)+'\n');
console.log({count:report.length,min:Math.min(...report.map(x=>x.words)),max:Math.max(...report.map(x=>x.words)),under:report.filter(x=>x.words<60).length,over:report.filter(x=>x.words>90).length});
