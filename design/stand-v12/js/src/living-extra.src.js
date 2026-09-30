/* living-extra.js — ленивый чанк v12.1 (15 §14.1 SUPERSEDE + §14.3):
 * «Ткань коры» — переливчатая волна ВСЕГДА (амбиент «дыхания», 8–12s,
 * альфа в капах ≤0.08, без event-гейта); события шины рождают МАЛЫЕ
 * НЕЙРОНЫ, бегущие по рёбрам (тишина = волна без нейронов); «Спокойный» =
 * волна минимальной амплитуды + статичный тинт, «Выключен» = не рендерится.
 * + Весма — ярус В4 «Спутник», персонаж Vesma (§14.3). Свет = данные. */
(function () {
"use strict";
var doc=document,root=doc.documentElement,W=window;
var screen=doc.body.getAttribute("data-screen");
function v(n,f){var x=getComputedStyle(root).getPropertyValue(n).trim();return x||f}
function reduced(){return matchMedia("(prefers-reduced-motion: reduce)").matches||root.getAttribute("data-motion")==="reduced"}
function lmode(){var m=root.getAttribute("data-living");return m==="full"||m==="calm"||m==="off"?m:"calm"}
function eff(){return reduced()?"calm":lmode()}
var EV_COL={error:"--synapse-error",write:"--synapse-write","task.done":"--synapse-write","owner.wait":"--synapse-write"};
function colOf(ev){return v(EV_COL[ev]||"--synapse-recall","#4fc2ce")}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}

/* ── Паутина «Ткань коры» (§14.1 SUPERSEDE): везде кроме Обзора ───── */
(function web(){
if(screen==="overview")return;
var HH=doc.createElement("div");HH.className="cortex-web";HH.setAttribute("aria-hidden","true");
HH.innerHTML='<canvas class="cw-anim"></canvas><canvas class="cw-static"></canvas>';
doc.body.insertBefore(HH,doc.body.firstChild);
var cv=HH.children[0],cs=HH.children[1],x1=cv.getContext("2d"),x2=cs.getContext("2d");
var NA=parseFloat(v("--web-node-alpha","0.05")),EA=parseFloat(v("--web-edge-alpha","0.07"));
var WA=parseFloat(v("--web-wave-alpha","0.08")),SP=parseFloat(v("--web-wave-speed","160"));
var HAIR="",IRIS="";
function rc(){HAIR=v("--myelin-hairline","rgba(230,237,243,.07)");IRIS=v("--color-iris","#1a8a96")}
rc();
/* малые нейроны: события → рождение на якоре, пробег по рёбрам (≤3) */
var NU=[],PN=null,PTm=0;
function SPN(a){if(NU.length>=3)return;
var path=[],node=a.n,used={};
for(var s=0;s<4&&ADJ[node].length;s++){
 var opts=ADJ[node].filter(function(e){return !used[e]});
 if(!opts.length)break;
 var e=opts[Math.floor(Math.random()*opts.length)];used[e]=1;
 path.push({e:e,from:node});node=E[e][0]===node?E[e][1]:E[e][0]}
if(path.length)NU.push({path:path,seg:0,k:0,c:a.c,t0:performance.now()})}
doc.addEventListener("stand:feed-event",function(e){
if(eff()==="off")return;
var ev=(e.detail||{}).ev||"",a={ev:ev,c:colOf(ev),n:hash(ev)%N};
if(W.__toneRaw)W.__toneRaw(ev);/* §14.6.1: тон-чанк опционален */
if(eff()==="calm"){tint(a);return}
PN=a;/* coalesce 600ms (как у курьеров) */
if(!PTm)PTm=setTimeout(function(){PTm=0;
if(PN){SPN(PN);PN=null}
if(W.__toneEvent)W.__toneEvent(a.ev)},600);
if(W.Vesma)W.Vesma.CLD(ev);
STT()});
var TI=[];/* «Спокойный»: одиночный статичный тинт затронутых рёбер 1.5s */
function tint(a){var ax=X[a.n],ay=Y[a.n],hit=[];
E.forEach(function(e){var mx=(X[e[0]]+X[e[1]])/2,my=(Y[e[0]]+Y[e[1]])/2;
if(Math.hypot(mx-ax,my-ay)<120)hit.push(e)});
TI.push({e:hit,c:a.c,t0:performance.now()})}
var lite=false,stat=false,fr=0,acc=0,fms=0,raf=null,tPrev=0;
function PNT(now){raf=doc.hidden?null:requestAnimationFrame(PNT);if(doc.hidden)return;
var dt=tPrev?Math.min(64,now-tPrev):16;tPrev=now;
var c=x1,T0=performance.now();
c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,innerWidth,innerHeight);
/* ВСЕГДА-волна: бегущая альфа по рёбрам, период 10s, длина 420px;
 * полный: центр 0.06 ±0.02 → пик 0.08 (кап); спокойный: ±0.005 */
var nodeCol=W.__toneFrame?W.__toneFrame(now,dt):null;
var calm=eff()==="calm",mid=0.06,amp=calm?0.005:0.02,T=10000,L=420;
var t=now%T,ph=t/T,dx=0.89,dy=0.45;
c.lineWidth=0.5;
E.forEach(function(e){var mx=(X[e[0]]+X[e[1]])/2,my=(Y[e[0]]+Y[e[1]])/2;
var al=mid+amp*Math.sin(Math.PI*2*((mx*dx+my*dy)/L-ph*2));
if(al<0.035)al=0.035;if(al>WA)al=WA;
c.strokeStyle=HAIR;c.globalAlpha=al;
c.beginPath();c.moveTo(X[e[0]],Y[e[0]]);c.lineTo(X[e[1]],Y[e[1]]);c.stroke()});
c.globalAlpha=NA;c.fillStyle=IRIS;
X.forEach(function(x,i){c.beginPath();c.arc(x,Y[i],1.6,0,7);c.fill()});
/* нейроны: точка словаря + мягкий ореол, пробег 160px/s, жизнь ≤4s */
if(!lite)NU=NU.filter(function(u){
var life=now-u.t0;if(life>4000)return false;
var st=u.path[u.seg],e=E[st.e];
var a1=st.from===e[0]?0:1,x0=X[e[a1]],y0=Y[e[a1]],x1_=X[e[1-a1]],y1_=Y[e[1-a1]];
var len=Math.hypot(x1_-x0,y1_-y0);u.k+=dt/1000*SP/len;
if(u.k>=1){u.k=0;u.seg++;if(u.seg>=u.path.length)return false;
st=u.path[u.seg];e=E[st.e];a1=st.from===e[0]?0:1;
x0=X[e[a1]];y0=Y[e[a1]];x1_=X[e[1-a1]];y1_=Y[e[1-a1]]}
var px=x0+(x1_-x0)*u.k,py=y0+(y1_-y0)*u.k;
var fade=Math.min(1,life/240,(4000-life)/240+1);
c.globalAlpha=0.15*fade;c.fillStyle=u.c;c.beginPath();c.arc(px,py,4.5,0,7);c.fill();
c.globalAlpha=0.85*fade;c.beginPath();c.arc(px,py,1.8,0,7);c.fill();return true});
/* тины «Спокойного» */
TI=TI.filter(function(tn){return now-tn.t0<1500});
TI.forEach(function(tn){c.strokeStyle=tn.c;c.globalAlpha=WA;c.lineWidth=1;
tn.e.forEach(function(e){c.beginPath();c.moveTo(X[e[0]],Y[e[0]]);c.lineTo(X[e[1]],Y[e[1]]);c.stroke()});c.lineWidth=0.5});
c.globalAlpha=1;
fms+=performance.now()-T0;acc+=dt;fr++;
if(acc>=1000){W.__webFrameMs=fms/fr;var fps=fr*1000/acc;fr=0;acc=0;fms=0;
if(fps<45&&!stat){stat=true;lite=true;HH.classList.add("cw-static-mode")}
else if(fps<55.5&&!lite){lite=true;dpr=1.5;size()}}}
function STT(){if(raf==null&&!doc.hidden&&eff()!=="off"&&!stat)raf=requestAnimationFrame(PNT)}
doc.addEventListener("visibilitychange",function(){tPrev=0;STT()});
new MutationObserver(function(){rc();size();
if(lmode()==="off"){HH.remove();return}
if(reduced()){PNT(0);return}
HH.classList.toggle("cw-calm",lmode()==="calm");STT()}).observe(root,{attributes:true,attributeFilter:["data-living","data-theme"]});
if(lmode()==="off"){HH.remove();return}
HH.classList.toggle("cw-calm",lmode()==="calm");
size();
if(reduced()){HH.classList.add("cw-static-mode");DST();PNT(0)}
else raf=requestAnimationFrame(PNT);
})();

/* Vesma — V4 «Спутник», персонаж Vesma (§14.3); тело — LOD В3 атласа
 * (fetch assets/neura-v2.svg), стили состояний — living-extra.css. */
(function(){
function vm(){var m=root.getAttribute("data-living");return reduced()?"calm":(m==="full"?"full":m==="off"?"off":"calm")}
var NST=doc.createElement("div");NST.className="sat-NST";NST.id="sat-NST";
NST.innerHTML='<svg class="sat-homes" viewBox="0 0 96 96" aria-hidden="true"><path d="M12,84 A40,40 0 0 1 84,84"/></svg>'+
'<button type="button" class="sat-body" aria-label="Весма — помощник. Клик — пауза живого слоя">'+
'<svg class="neura-v2 lod-v3 idle" viewBox="0 0 120 120" aria-hidden="true"></svg></button>'+
'<div class="sat-replica" role="status" aria-live="polite" hidden></div>';
doc.body.appendChild(NST);doc.body.classList.add("has-satellite");
var UN=NST.querySelector(".sat-body"),svg=NST.querySelector(".neura-v2"),rep=NST.querySelector(".sat-replica");
fetch("assets/neura-v2.svg").then(function(r){return r.text()}).then(function(t){
var a=new DOMParser().parseFromString(t,"image/svg+xml").documentElement;
["neura-body","neura-arms","neura-tail"].forEach(function(id){
var g=a.querySelector("#"+id);if(g)svg.appendChild(doc.importNode(g,true))})});
var FL=[],flying=false,PQ=null,SLP=null;
function SS(s){svg.setAttribute("class","neura-v2 lod-v3 "+s)}
function SY(txt,href,ok){rep.hidden=false;rep.innerHTML="";
var p=doc.createElement("span");p.textContent="Весма: "+txt;rep.appendChild(p);
if(href){var a=doc.createElement("a");a.href=href;a.textContent="Открыть →";rep.appendChild(a)}
if(ok){var b=doc.createElement("button");b.type="button";b.className="btn ghost sm";b.textContent="Понятно";
b.onclick=function(){rep.hidden=true;HM()};rep.appendChild(b)}}
function HM(){UN.classList.remove("is-flight","is-hold","is-pointing");flying=false;
if(PQ){var q=PQ;PQ=null;q()}}
function CF(){var n=Date.now();FL=FL.filter(function(t){return n-t<6e5});
return FL.length<3&&(!FL.length||n-FL[FL.length-1]>=6e4)}
function FT(el,hold,at){
if(vm()!=="full"||flying||doc.querySelector(".palette-overlay.is-open")||!CF())return false;
flying=true;FL.push(Date.now());
var r=el.getBoundingClientRect(),nx=innerWidth-64,ny=innerHeight-64;
var tx=Math.max(8,Math.min(innerWidth-72,r.left-56)),ty=Math.max(8,Math.min(innerHeight-72,r.top+r.height/2-28));
UN.style.setProperty("--tx",(tx-nx)+"px");UN.style.setProperty("--ty",(ty-ny)+"px");
UN.style.setProperty("--arc",(r.top<110?60:-60)+"px");
UN.classList.add("is-flight");
setTimeout(function(){UN.classList.add("is-hold","is-pointing");el.classList.add("sat-attention");
if(at)at();
setTimeout(function(){el.classList.remove("sat-attention");UN.classList.remove("is-pointing");
setTimeout(HM,600)},hold)},850);return true}
function BR(d){var t=doc.querySelector(".hud-wait-chip")||doc.querySelector("#facade-wait")||
(doc.getElementById("pult-badge")&&!doc.getElementById("pult-badge").hidden?doc.getElementById("pult-badge"):null);
if(!t)return;var go=function(){FT(t,2500,function(){SY("Есть решение по "+((d&&d.mem)||"задача")+" — ждёт вас","tasks.html")})};
if(!go())PQ=go}
function CL(){SS("flash-error");
var t=doc.querySelector(".living-v3-card.is-open")||doc.querySelector(".pill.live");
if(!FT(t,4000,function(){SY("Связь под контролем — восстанавливаю")}))return;
function h(e){if((e.detail||{}).ev==="error")return;
doc.removeEventListener("stand:feed-event",h);
setTimeout(function(){SS("idle");SY("Связь с памятью восстановлена");
setTimeout(function(){rep.hidden=true},2200)},400)}
doc.addEventListener("stand:feed-event",h)}
function SH(el,ph){if(!el)return;
FT(el,5000,function(){SY(ph||"Показать главное за минуту",null,true);
var g=doc.createElement("span");g.className="sat-ring";el.appendChild(g);
setTimeout(function(){g.remove()},5000)})}
var cloudLast=0,cloudTxt="",cloudT=null;
function CLD(ev){/* облачко = голос Весмы (§14.6.1: инвариант 2): у домика
   для фон/обычных классов, без полёта; owner.wait/error говорят у цели */
if(vm()!=="full")return;
if(ev==="owner.wait"||ev==="error")return;
var M={write:"Записала в память.",recall:"Нашла в памяти.","task.done":"Задача закрыта.",
"task.start":"Задача пошла.","owner.clear":"Ждущих нет.","device.connected":"Устройство на связи.",
index:"Индекс обновила.","task.blocked":"Задача встала.","inbox.arrived":"Пришло во входящие."};
var t=M[ev];if(!t)return;
var now=Date.now();
if(now-cloudLast<90000||t===cloudTxt)return;/* ≤1/90s + без повторов */
cloudLast=now;cloudTxt=t;
SY(t,null,true);
clearTimeout(cloudT);
cloudT=setTimeout(function(){rep.hidden=true},4000)}
W.Vesma={SH:SH,BR:BR,CL:CL,CLD:CLD};
UN.addEventListener("click",function(){
var b=doc.querySelector(".living-neura");if(b)b.click();
UN.classList.add("is-flinch");setTimeout(function(){UN.classList.remove("is-flinch")},120)});
doc.addEventListener("stand:feed-event",function(e){
if(vm()==="off")return;
if(vm()==="calm"){svg.style.setProperty("--neura-last",colOf((e.detail||{}).ev));SS("calm-static");return}
var ev=(e.detail||{}).ev||"";
SS(ev==="error"?"flash-error":(ev==="write"||ev==="task.done")?"flash-write":ev==="owner.wait"?"attention":"flash-recall");
if(ev!=="error")setTimeout(function(){if(!flying)SS("idle")},900);
if(ev==="owner.wait")BR(e.detail);else if(ev==="error")CL();
clearTimeout(SLP);NST.classList.remove("is-asleep");
SLP=setTimeout(function(){NST.classList.add("is-asleep")},3e5)});
function SYN(){if(vm()==="off"){NST.remove();doc.body.classList.remove("has-satellite");return}
NST.classList.toggle("sat-calm",vm()==="calm");if(vm()==="calm")SS("calm-static")}
new MutationObserver(SYN).observe(root,{attributes:true,attributeFilter:["data-living"]});
SYN();
})();


})();
