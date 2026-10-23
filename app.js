const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {get:(k,d='')=>{try{return localStorage.getItem(k)??d}catch{return d}}, set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};

const THEMES = {
  "Islamic Luxury Gold Pattern":"Islamic luxury gold seamless pattern, ornate mandala ornament, elegant dark background",
  "Business & Finance Line Icons":"business and finance minimalist line icon set, clean outline, white background",
  "Modern Technology Infographic":"modern technology infographic elements, clean data visualization",
  "Organic Eco Green Leaf Background":"organic eco green leaf pattern, minimalist nature background",
  "3D Isometric Clay Tech Character":"3D isometric clay character working on laptop, cute modern render",
  "Healthcare & Medical Banner":"healthcare medical service banner, doctor and patient illustration",
  "Indonesian Culinary Illustration":"Indonesian culinary food illustration, delicious gourmet concept",
  "Abstract Watercolor Floral":"abstract watercolor floral composition, elegant botanical background",
  "Minimalist Typography Banner":"minimalist modern typography banner, inspirational poster background",
  "Cyberpunk Neon City Background":"cyberpunk neon city abstract background, futuristic glow"
};
let type='vector', refImg=null, variations=[], assets=[], running=false;

// ---------- UI helpers ----------
function toast(msg, err){
  const t=document.createElement('div');
  t.className='px-4 py-3 rounded-xl text-xs font-medium text-white shadow-xl '+(err?'bg-red-600':'bg-blue-600');
  t.textContent=msg; $('toasts').appendChild(t); setTimeout(()=>t.remove(),4000);
}
function go(n){
  for(let i=1;i<=4;i++){
    $('s'+i).classList.toggle('hidden',i!==n);
    $('tab'+i).className='px-5 py-3 whitespace-nowrap '+(i===n?'tab-on':'text-slate-400 hover:text-slate-200');
  }
  if(n===3) renderReview();
}
['Konfigurasi & Prompt','Generasi Batch','Review Metadata','Ekspor ZIP'].forEach((l,i)=>{
  const b=document.createElement('button'); b.id='tab'+(i+1); b.textContent=(i+1)+'. '+l; b.onclick=()=>go(i+1); $('tabs').appendChild(b);
});
Object.keys(THEMES).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;$('preset').appendChild(o)});
function applyPreset(k){ if(k) $('prompt').value=THEMES[k]; }
function setType(t){
  type=t; $('tVector').classList.toggle('sel',t==='vector'); $('tPhoto').classList.toggle('sel',t==='photo');
  $('svgLine').classList.toggle('hidden',t!=='vector');
}
function saveKeys(){
  ['txtProv','txtKey','imgProv','imgKey'].forEach(id=>store.set(id,$(id).value.trim()));
  toast('Pengaturan disimpan di browser ini.');
}
['txtProv','txtKey','imgProv','imgKey'].forEach(id=>{const v=store.get(id); if(v) $(id).value=v;});
function loadRef(e){
  const f=e.target.files[0]; if(!f) return;
  if(f.size>5*1024*1024){toast('Maksimal 5MB',1);e.target.value='';return;}
  const r=new FileReader(); r.onload=()=>{refImg=r.result;toast('Gambar acuan dimuat.')}; r.readAsDataURL(f);
}
function addDaily(n){
  const k='daily-'+new Date().toISOString().slice(0,10);
  const v=parseInt(store.get(k,'0'))+n; store.set(k,v); $('daily').textContent=v;
}
$('daily').textContent=store.get('daily-'+new Date().toISOString().slice(0,10),'0');

// ---------- LLM (text + vision) ----------
async function llm(system, userText, {json=false, image=null}={}){
  const prov=$('txtProv').value, key=$('txtKey').value.trim();
  if(!key) throw new Error('Isi API key teks di panel Pengaturan API.');
  if(prov==='gemini'){
    const parts=[]; if(image) parts.push({inlineData:{mimeType:image.split(';')[0].split(':')[1],data:image.split(',')[1]}});
    parts.push({text:userText});
    let r,d;
    for(let t=0;t<3;t++){ // retry bila kena rate limit tier gratis
      r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts}],
          generationConfig:json?{responseMimeType:'application/json'}:{}})});
      if(r.status!==429&&r.status!==503) break; await sleep(7000*(t+1));
    }
    d=await r.json(); if(!r.ok) throw new Error(d.error?.message||'Gemini error '+r.status);
    return d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  }
  const model=image?'meta-llama/llama-4-scout-17b-16e-instruct':'llama-3.3-70b-versatile';
  const content=image?[{type:'text',text:userText},{type:'image_url',image_url:{url:image}}]:userText;
  let r,d;
  for(let t=0;t<3;t++){
    r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
      body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content}],...(json?{response_format:{type:'json_object'}}:{})})});
    if(r.status!==429) break; await sleep(7000*(t+1));
  }
  d=await r.json(); if(!r.ok) throw new Error(d.error?.message||'Groq error '+r.status);
  return d.choices?.[0]?.message?.content||'';
}
const parseJSON = t => JSON.parse(t.replace(/^```json|^```|```$/gm,'').trim());

// ---------- Prompt variations ----------
async function fetchVariations(base){
  const sys='You are a commercial microstock art director. Return ONLY a JSON object: {"prompts":[10 distinct English image prompts optimized for Adobe Stock, varying subject details, composition, style, color palette and perspective]}.';
  const user=refImg?'Analyze style, objects, lighting and mood of this reference image and write 10 original commercial prompt variations inspired by it.':`Write 10 variations of this theme: "${base}"`;
  const out=parseJSON(await llm(sys,user,{json:true,image:refImg}));
  variations=(out.prompts||[]).map(String).slice(0,10);
  if(!variations.length) throw new Error('Respons AI kosong.');
  $('pills').innerHTML=''; $('vars').classList.remove('hidden');
  variations.forEach((p,i)=>{
    const b=document.createElement('button');
    b.className='block w-full text-left text-xs bg-slate-950 hover:border-blue-500 border border-slate-800 p-2.5 rounded-lg text-slate-300';
    b.innerHTML='<b class="text-blue-400">#'+(i+1)+'</b> '+esc(p);
    b.onclick=()=>{$('prompt').value=p;toast('Prompt #'+(i+1)+' dipakai.')};
    $('pills').appendChild(b);
  });
}
async function autoPrompts(){
  const btn=$('autoBtn'), base=$('prompt').value.trim();
  if(!refImg && !base){toast('Isi prompt/preset atau unggah gambar acuan.',1);return;}
  const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Menganalisis...';
  try{await fetchVariations(base); $('prompt').value=variations[0]; toast('10 variasi prompt dibuat.');}
  catch(e){console.error(e);toast(e.message,1);}
  finally{btn.disabled=false;btn.innerHTML=old;}
}

// ---------- Image sources ----------
async function genPhotoBlob(prompt, seed){
  const prov=$('imgProv').value, key=$('imgKey').value.trim();
  if(prov==='hf'){
    if(!key) throw new Error('Isi token Hugging Face di Pengaturan API.');
    const r=await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'image/jpeg'},
      body:JSON.stringify({inputs:prompt,parameters:{seed}})});
    if(!r.ok) throw new Error('Hugging Face '+r.status+': '+(await r.text()).slice(0,120));
    return r.blob();
  }
  const q=encodeURIComponent(prompt);
  const url=key?`https://gen.pollinations.ai/image/${q}?width=1024&height=1024&seed=${seed}&key=${encodeURIComponent(key)}`
               :`https://image.pollinations.ai/prompt/${q}?width=1024&height=1024&nologo=true&seed=${seed}`;
  const r=await fetch(url);
  if(!r.ok) throw new Error('Pollinations '+r.status);
  return r.blob();
}
async function genSvgBlob(prompt){
  const sys='You are an expert vector illustrator. Output ONLY one complete valid SVG (no markdown, no commentary). Use viewBox="0 0 1024 1024", flat vector shapes, paths and gradients only. No <image>, no external references, no text elements, no scripts.';
  const t=await llm(sys,'Create a commercial stock vector illustration: '+prompt);
  const m=t.match(/<svg[\s\S]*<\/svg>/i); if(!m) throw new Error('AI tidak mengembalikan SVG valid.');
  let svg=m[0]; if(!/xmlns=/.test(svg)) svg=svg.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
  svg=svg.replace(/<svg\b([^>]*)>/i,(_,a)=>'<svg'+a.replace(/\s(width|height)="[^"]*"/gi,'')+(/viewBox/i.test(a)?'':' viewBox="0 0 1024 1024"')+' width="1024" height="1024">');
  return new Blob([svg],{type:'image/svg+xml'});
}
const tick=()=>new Promise(r=>setTimeout(r));
function boxBlur(src,w,h,r){
  const tmp=new Uint8ClampedArray(src.length),out=new Uint8ClampedArray(src.length),d=2*r+1;
  for(let y=0;y<h;y++)for(let c=0;c<3;c++){
    const row=y*w; let sum=0;
    for(let x=-r;x<=r;x++)sum+=src[(row+Math.min(Math.max(x,0),w-1))*4+c];
    for(let x=0;x<w;x++){tmp[(row+x)*4+c]=sum/d;sum+=src[(row+Math.min(x+r+1,w-1))*4+c]-src[(row+Math.max(x-r,0))*4+c];}
  }
  for(let x=0;x<w;x++)for(let c=0;c<3;c++){
    let sum=0;
    for(let y=-r;y<=r;y++)sum+=tmp[(Math.min(Math.max(y,0),h-1)*w+x)*4+c];
    for(let y=0;y<h;y++){out[(y*w+x)*4+c]=sum/d;sum+=tmp[(Math.min(y+r+1,h-1)*w+x)*4+c]-tmp[(Math.max(y-r,0)*w+x)*4+c];}
  }
  return out;
}
async function unsharp(canvas,amount,radius){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
  const img=ctx.getImageData(0,0,w,h),o=img.data;
  let bl=boxBlur(o,w,h,radius); await tick(); bl=boxBlur(bl,w,h,radius); await tick();
  for(let i=0;i<o.length;i+=4)for(let c=0;c<3;c++){
    const d=o[i+c]-bl[i+c];
    if(d>3||d<-3){const v=o[i+c]+amount*d;o[i+c]=v<0?0:v>255?255:v;}
  }
  ctx.putImageData(img,0,0);
}
async function blobToCanvas(blob,{isSvg,size,sharp}){
  const mk=n=>{const c=document.createElement('canvas');c.width=c.height=n;return c;};
  const url=URL.createObjectURL(blob);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Gambar tidak bisa dibaca'));i.src=url;});
    if(isSvg){ // vektor dirender langsung pada resolusi target, tanpa upscale
      const c=mk(size),x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,size,size); x.drawImage(img,0,0,size,size); return c;
    }
    const w=img.naturalWidth,h=img.naturalHeight,n0=Math.min(size,Math.max(w,h));
    let cur=mk(n0),x=cur.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,n0,n0);
    const s=Math.max(n0/w,n0/h); x.drawImage(img,(n0-w*s)/2,(n0-h*s)/2,w*s,h*s);
    while(cur.width<size){ // upscale bertahap 1,5x agar lebih halus
      const nx=Math.min(size,Math.round(cur.width*1.5)),c=mk(nx),cx=c.getContext('2d');
      cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high'; cx.drawImage(cur,0,0,nx,nx); cur=c; await tick();
    }
    if(sharp>0) await unsharp(cur,sharp/100*1.2,Math.max(1,Math.round(size/1024)));
    return cur;
  } finally {URL.revokeObjectURL(url);}
}
function issues(a){
  const r=[];
  if(a.size*a.size<4e6)r.push('<4 MP');
  if(a.bytes>45*1048576)r.push('>45 MB');
  if(!a.exifOk)r.push('EXIF gagal');
  if(!a.title||a.title.length>70)r.push('title kosong/>70');
  if(a.keywords.length!==49)r.push('keyword '+a.keywords.length+'/49');
  if(a.filler)r.push('keyword generik');
  if(a.vision===false)r.push('metadata tanpa analisis gambar');
  if(assets.some(o=>o!==a&&o.title.toLowerCase()===a.title.toLowerCase()))r.push('title kembar');
  return r;
}
function badge(a){const i=issues(a);return i.length?`<div class="text-[10px] text-amber-400">⚠ ${esc(i.join('; '))}</div>`:'<div class="text-[10px] text-emerald-400">✅ Siap submit</div>';}

// ---------- Metadata (SEO microstock, 49 keyword, unik per aset) ----------
const CATS={1:'Animals',2:'Buildings and Architecture',3:'Business',4:'Drinks',5:'The Environment',6:'States of Mind',7:'Food',8:'Graphic Resources',9:'Hobbies and Leisure',10:'Industry',11:'Landscapes',12:'Lifestyle',13:'People',14:'Plants and Flowers',15:'Culture and Religion',16:'Science',17:'Social Issues',18:'Sports',19:'Technology',20:'Transport',21:'Travel'};
const BANNED=/\b(midjourney|dall-?e|stable diffusion|flux|chatgpt|openai|gemini|ai generated|generative|ai|disney|marvel|pixar|nike|apple|google)\b/i;
const POOL=['background','design','illustration','graphic','modern','creative','concept','template','banner','decorative','abstract','colorful','digital','art','style','element','pattern','texture','minimal','clean','layout','wallpaper','backdrop','artwork','composition','copy space','geometric','elegant','trendy','simple','business','marketing','advertising','commercial','print','web','poster','card','cover','presentation','symbol','shape','gradient','ornament','set','collection','high quality','professional','creative design','visual'];
function cleanKw(arr){
  const seen=new Set(),out=[];
  for(let k of arr){
    k=String(k).toLowerCase().replace(/[^a-z0-9\- ]/g,' ').replace(/\s+/g,' ').trim();
    if(k.length<2||k.length>30||k.split(' ').length>3||BANNED.test(k)||seen.has(k)) continue;
    seen.add(k); out.push(k);
  }
  return out;
}
function cleanTitle(t){
  t=String(t||'').replace(/["“”]/g,'').replace(/\s+/g,' ').replace(BANNED,'').replace(/\s+/g,' ').replace(/[.,;:\- ]+$/,'').trim();
  if(t.length>70){t=t.slice(0,70);const i=t.lastIndexOf(' ');if(i>40)t=t.slice(0,i);t=t.replace(/[.,;:\- ]+$/,'');}
  return t;
}
const jacc=(a,b)=>{const A=new Set(a),B=new Set(b);let i=0;A.forEach(x=>B.has(x)&&i++);return i/((A.size+B.size-i)||1);};
const tooSimilar=(m,prev)=>prev.some(p=>p.title.toLowerCase()===m.title.toLowerCase()||jacc(p.keywords,m.keywords)>0.75);
function thumb(u){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>{const s=Math.min(1,768/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*s);c.height=Math.round(i.height*s);c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.82));};i.onerror=rej;i.src=u;});}
const META_SYS='You are a senior Adobe Stock metadata specialist. Describe ONLY what is actually visible in the provided image (trust the image over the generation prompt). Return ONLY JSON: {"title":string,"description":string,"category":number,"keywords":string[]}. Rules: title = 55-70 characters, natural descriptive phrase starting with the main subject, then style/context, no keyword stuffing, no trailing period, no brand, trademark, artist or celebrity names, never the words AI, generated, stock or image. description = 1-2 factual sentences, max 200 characters. keywords = EXACTLY 49 unique lowercase English keywords (single words or short 2-word phrases), ordered by relevance: first 10 = main subject, style, dominant colors and core concept; then objects, composition, mood, technique, and buyer use-cases (e.g. copy space, background, banner). Every keyword must be genuinely relevant to this image. No brands, names, camera terms or "ai". category = best Adobe Stock category id: '+Object.entries(CATS).map(([k,v])=>k+'='+v).join(', ')+'. The metadata must be clearly different from sibling images listed by the user.';
async function ensure49(kw,prompt,image){
  let filler=false;
  for(let t=0;t<2&&kw.length<49;t++){
    try{
      const r=parseJSON(await llm('You are an Adobe Stock keyword specialist. Return ONLY JSON: {"keywords":string[]}. Lowercase English, single words or max 2-word phrases, relevant to the image, no brands, no duplicates.',
        `Existing keywords: ${kw.join(', ')}. Add ${49-kw.length+6} NEW relevant keywords not already listed. Context prompt: ${prompt}`,{json:true,image}));
      kw=cleanKw([...kw,...(r.keywords||[])]);
    }catch(e){console.warn(e);}
  }
  if(kw.length<49){filler=true;kw=cleanKw([...kw,...POOL]);}
  return {kw:kw.slice(0,49),filler};
}
function fallbackMeta(prompt){
  const head=prompt.split(/[.,;]/)[0].trim();
  const words=prompt.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2);
  return {title:cleanTitle(head.charAt(0).toUpperCase()+head.slice(1)),description:('High quality '+type+' featuring '+prompt).slice(0,200),
    category:type==='vector'?8:12,keywords:cleanKw([...words,...POOL]).slice(0,49),filler:true,vision:false};
}
async function makeMeta(prompt,dataUrl,prev){
  let img=null; try{img=await thumb(dataUrl);}catch{}
  const sib=prev.length?'Sibling titles already used (do NOT repeat or paraphrase them): '+prev.map(p=>p.title).join(' | '):'No sibling images yet.';
  let m=null,note='',vision=!!img;
  for(let t=0;t<3;t++){
    const user=`Asset type: ${type}. Generation prompt (context only): ${prompt}. ${sib}. ${note}`;
    try{
      let txt;
      try{txt=await llm(META_SYS,user,{json:true,image:img});}
      catch(e){if(!img)throw e;console.warn('Vision gagal, pakai prompt:',e.message);img=null;vision=false;txt=await llm(META_SYS,user+' (No image available: base it on the prompt.)',{json:true});}
      const j=parseJSON(txt),c={title:cleanTitle(j.title),description:String(j.description||'').slice(0,200),
        category:Math.round(+j.category)>=1&&Math.round(+j.category)<=21?Math.round(+j.category):(type==='vector'?8:12),keywords:cleanKw(j.keywords||[])};
      if(!c.title) throw new Error('title kosong');
      m=c; if(!tooSimilar(m,prev)) break;
      note='Your previous attempt was too similar to a sibling. Focus on the distinctive visual details of THIS image (subject, composition, colors, mood) and use a different title and different keywords.';
    }catch(e){console.warn(e);}
  }
  if(!m){const f=fallbackMeta(prompt);f.vision=false;return f;}
  const {kw,filler}=await ensure49(m.keywords,prompt,img);
  return {title:m.title,description:m.description,category:m.category,keywords:kw,filler,vision};
}
function xpDummy(){}
const ascii = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'');
function xp(s){const a=[];for(const ch of s+'\0'){const c=ch.charCodeAt(0);a.push(c&255,c>>8);}return a;}
function injectExif(dataUrl,m){
  const z={},I=piexif.ImageIFD;
  z[I.ImageDescription]=ascii(m.description);
  z[I.XPTitle]=xp(m.title); z[I.XPComment]=xp(m.description); z[I.XPKeywords]=xp(m.keywords.join(';'));
  z[I.Software]='VectorCraft AI Studio';
  z[I.XResolution]=[[300,1]]; z[I.YResolution]=[[300,1]]; z[I.ResolutionUnit]=2;
  const obj={'0th':z,'Exif':{},'GPS':{}};
  let bytes; try{bytes=piexif.dump(obj);}catch{delete z[I.XResolution];delete z[I.YResolution];delete z[I.ResolutionUnit];bytes=piexif.dump(obj);}
  const out=piexif.insert(bytes,dataUrl);
  if(!piexif.load(out)['0th'][I.XPTitle]) throw new Error('verifikasi EXIF gagal');
  return out;
}

// ---------- Batch ----------
async function runBatch(){
  if(running) return;
  const base=$('prompt').value.trim(); if(!base){toast('Isi prompt dulu.',1);return;}
  const n=Math.min(8,Math.max(1,parseInt($('batchN').value)||4));
  running=true; $('genBtn').disabled=true; $('prog').classList.remove('hidden'); $('gallery').innerHTML=''; assets=[];
  const slow=type==='photo'&&$('imgProv').value==='poll'&&!$('imgKey').value.trim();
  const slug=(base.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'asset');
  let ok=0, firstErr='';
  if(variations.length<n&&n>1){$('progTxt').textContent='Membuat variasi prompt otomatis...';try{await fetchVariations(base);}catch(e){toast('Variasi otomatis gagal: '+e.message+'. Prompt yang sama dipakai.',1);}}
  const plist=[base,...variations.filter(v=>v!==base)];
  for(let i=0;i<n;i++){
    const p=plist[i%plist.length];
    $('progTxt').textContent=`Membuat aset ${i+1}/${n}...`; $('progPct').textContent=Math.round(i/n*100)+'%'; $('progBar').style.width=Math.round(i/n*100)+'%';
    try{
      let blob, svgText=null;
      if(type==='vector'){blob=await genSvgBlob(p); svgText=await blob.text();}
      else blob=await genPhotoBlob(p,Math.floor(Math.random()*1e6));
      $('progTxt').textContent=`Upscale & penajaman ${i+1}/${n}...`;
      const canvas=await blobToCanvas(blob,{isSvg:type==='vector',size:+$('outSize').value,sharp:+$('sharp').value});
      const dim=canvas.width, raw=canvas.toDataURL('image/jpeg',0.95); canvas.width=canvas.height=0;
      $('progTxt').textContent=`Menganalisis gambar & menulis metadata ${i+1}/${n}...`;
      const meta=await makeMeta(p,raw,assets);
      let url=raw, exifOk=true;
      try{url=injectExif(raw,meta);}catch(e){exifOk=false;console.warn(e);}
      const a={fileName:`${slug}-${i+1}.jpg`,svgName:`${slug}-${i+1}.svg`,svgText,dataUrl:url,exifOk,prompt:p,size:dim,bytes:Math.round((url.length-url.indexOf(',')-1)*.75),...meta};
      assets.push(a); ok++;
      const c=document.createElement('div'); c.className='bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1.5';
      c.innerHTML=`<img src="${a.dataUrl}" class="w-full h-36 object-cover rounded-lg"><div class="text-[10px] font-mono truncate">${esc(a.fileName)}</div>
        <div class="text-[10px] text-slate-400">${a.size}×${a.size} · ${(a.size*a.size/1e6).toFixed(1)} MP · ${(a.bytes/1048576).toFixed(1)} MB</div>${badge(a)}`;
      $('gallery').appendChild(c);
    }catch(e){
      console.error(e); firstErr=firstErr||e.message; toast(`Aset ${i+1} gagal: ${e.message}`,1);
    }
    if(slow && i<n-1) { for(let s=16;s>0;s--){$('progTxt').textContent=`Pollinations anonim dibatasi 1 request/15 dtk, menunggu ${s}s...`;await sleep(1000);} }
  }
  $('progBar').style.width='100%'; $('progPct').textContent='100%'; $('progTxt').textContent=`Selesai: ${ok}/${n} aset berhasil.`;
  if(ok){addDaily(ok);toast(`${ok} aset berhasil dibuat.`);}
  running=false; $('genBtn').disabled=false;
}

// ---------- Review ----------
function renderReview(){
  const g=$('review');
  if(!assets.length){g.innerHTML='<div class="col-span-full text-center py-12 text-xs text-slate-500">Belum ada aset. Selesaikan Step 2.</div>';return;}
  g.innerHTML=assets.map((a,i)=>`
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
      <div class="flex gap-3"><img src="${a.dataUrl}" class="w-20 h-20 object-cover rounded-lg flex-shrink-0">
        <div class="flex-grow min-w-0"><div class="text-[10px] font-mono text-blue-400 mb-1">${esc(a.fileName)}</div>
        <input class="inp" data-i="${i}" data-f="title" value="${esc(a.title)}"></div></div>
      <textarea class="inp" rows="2" data-i="${i}" data-f="description">${esc(a.description)}</textarea>
      <select class="inp" data-i="${i}" data-f="category">${Object.entries(CATS).map(([k,v])=>`<option value="${k}" ${+k===a.category?'selected':''}>${k}. ${v}</option>`).join('')}</select>
      <textarea class="inp" rows="3" data-i="${i}" data-f="keywords">${esc(a.keywords.join(', '))}</textarea>
      <div class="flex justify-between items-center"><div class="text-[10px] text-slate-500"><span data-count="${i}">${a.keywords.length}</span> keywords · ${a.size}×${a.size}</div><div data-badge="${i}">${badge(a)}</div></div>
    </div>`).join('');
  g.querySelectorAll('[data-i]').forEach(el=>el.addEventListener('input',()=>{
    const a=assets[el.dataset.i], f=el.dataset.f;
    if(f==='keywords'){a.keywords=[...new Set(el.value.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean))].slice(0,49);
      g.querySelector(`[data-count="${el.dataset.i}"]`).textContent=a.keywords.length;}
    else a[f]=f==='category'?+el.value:el.value;
    g.querySelector(`[data-badge="${el.dataset.i}"]`).innerHTML=badge(a);
  }));
}

// ---------- Export ----------
async function downloadZip(){
  if(!assets.length){toast('Belum ada aset.',1);return;}
  const bad=assets.filter(a=>issues(a).length).length; if(bad) toast(bad+' aset belum memenuhi syarat submit, cek Step 3.',1);
  const zip=new JSZip(), jpg=zip.folder('JPG'), svg=type==='vector'?zip.folder('SVG'):null;
  let csv='Filename,Title,Keywords,Category,Releases\n';
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  for(const a of assets){
    let d=a.dataUrl;
    try{d=injectExif(d.startsWith('data:')?d:d,{title:a.title,description:a.description,keywords:a.keywords});}catch{}
    jpg.file(a.fileName,d.split(',')[1],{base64:true});
    if(svg&&a.svgText) svg.file(a.svgName,a.svgText);
    csv+=[q(a.fileName),q(a.title),q(a.keywords.join(', ')),a.category||8,'""'].join(',')+'\n';
  }
  zip.folder('Metadata').file('Adobe_Stock_Metadata.csv','\ufeff'+csv);
  const blob=await zip.generateAsync({type:'blob'});
  const l=document.createElement('a'); l.href=URL.createObjectURL(blob); l.download='VectorCraft_Batch_'+Date.now()+'.zip'; l.click();
  setTimeout(()=>URL.revokeObjectURL(l.href),5000); toast('ZIP diunduh.');
}
// ---------- Stabilitas ----------
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Terjadi error: '+((e.reason&&e.reason.message)||e.reason),1);});
window.addEventListener('error',e=>{console.error(e.error||e.message);});
if(typeof JSZip==='undefined'||typeof piexif==='undefined') toast('Pustaka JSZip/piexif gagal dimuat. Muat ulang halaman.',1);
go(1);

