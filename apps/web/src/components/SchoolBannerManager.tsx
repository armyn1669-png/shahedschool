"use client";
import {useEffect,useRef,useState,type FormEvent,type PointerEvent as ReactPointerEvent} from "react";
type Banner={id:number;title:string;body:string;imageData:string;linkText:string;linkUrl:string};
/* Student-hero display ratios (from styles.css + StudentDashboard):
   desktop content ~1060px wide, hero min-height 220px -> 24/5;
   mobile ~366px wide, min-height 140px -> 13/5. The editor frame and the
   final preview use these exact ratios, so the admin sees what students see. */
const DESKTOP_RATIO=24/5;
const MOBILE_RATIO=13/5;
const MAX_DATA_URL=1_600_000; /* /api/banners rejects longer imageData */
const EXPORT_WIDTH=1600;
type Offset={x:number;y:number};
type FrameSize={w:number;h:number};
export function SchoolBannerManager(){
const[banners,setBanners]=useState<Banner[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
const[title,setTitle]=useState(""),[body,setBody]=useState(""),[linkText,setLinkText]=useState(""),[linkUrl,setLinkUrl]=useState("");
const[src,setSrc]=useState(""),[imgSize,setImgSize]=useState<FrameSize>({w:0,h:0});
const[zoom,setZoom]=useState(1),[offset,setOffset]=useState<Offset>({x:0,y:0});
const[frameSize,setFrameSize]=useState<FrameSize>({w:900,h:900/DESKTOP_RATIO});
const[previewUrl,setPreviewUrl]=useState("");
const frameRef=useRef<HTMLElement|null>(null);
const imgRef=useRef<HTMLImageElement|null>(null);
const dragRef=useRef<{id:number;startX:number;startY:number;start:Offset}|null>(null);
const[dragging,setDragging]=useState(false);
async function load(){const r=await fetch("/api/banners",{cache:"no-store"});const d=await r.json();if(r.ok)setBanners(d.banners||[])}
useEffect(()=>{void load()},[]);
useEffect(()=>{const el=frameRef.current;if(!el||typeof ResizeObserver==="undefined")return;const ro=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect&&rect.width>0)setFrameSize({w:rect.width,h:rect.height})});ro.observe(el);return()=>ro.disconnect()},[src]);
useEffect(()=>()=>{if(src)URL.revokeObjectURL(src)},[src]);
function clampOffset(o:Offset,z:number,f:FrameSize,img:FrameSize):Offset{
  if(!img.w||!img.h||!f.w||!f.h)return{x:0,y:0};
  const scale=Math.max(f.w/img.w,f.h/img.h)*z;
  const maxX=Math.max(0,(img.w*scale-f.w)/2),maxY=Math.max(0,(img.h*scale-f.h)/2);
  return{x:Math.max(-maxX,Math.min(maxX,o.x)),y:Math.max(-maxY,Math.min(maxY,o.y))};
}
function applyZoom(z:number){const next=Math.max(1,Math.min(3,z));setZoom(next);setOffset(old=>clampOffset(old,next,frameSize,imgSize));}
function exportCropped(img:HTMLImageElement,f:FrameSize,z:number,o:Offset):string{
  const iw=img.naturalWidth,ih=img.naturalHeight;
  if(!iw||!ih||!f.w||!f.h)throw new Error("تصویری انتخاب نشده است.");
  const ratio=f.w/f.h;
  const total=Math.max(f.w/iw,f.h/ih)*z;
  const dw=iw*total,dh=ih*total;
  const left=f.w/2+o.x-dw/2,top=f.h/2+o.y-dh/2;
  const sx=Math.max(0,-left/total),sy=Math.max(0,-top/total);
  const sw=Math.min(iw-sx,f.w/total),sh=Math.min(ih-sy,f.h/total);
  if(sw<=0||sh<=0)throw new Error("برش بنر معتبر نیست؛ تصویر را دوباره تنظیم کنید.");
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("مرورگر برش تصویر را پشتیبانی نمی‌کند.");
  for(const[outW,quality]of[[EXPORT_WIDTH,0.85],[EXPORT_WIDTH,0.7],[EXPORT_WIDTH,0.55],[1200,0.7],[1200,0.55]] as const){
    const outH=Math.max(1,Math.round(outW/ratio));
    canvas.width=outW;canvas.height=outH;
    ctx.drawImage(img,sx,sy,sw,sh,0,0,outW,outH);
    const data=canvas.toDataURL("image/jpeg",quality);
    if(data.length<=MAX_DATA_URL)return data;
  }
  throw new Error("تصویر برش‌خورده هنوز خیلی بزرگ است؛ تصویر دیگری انتخاب کنید.");
}
function exportCurrent():string{
  const img=imgRef.current;
  if(!img)throw new Error("تصویری انتخاب نشده است.");
  return exportCropped(img,frameSize,zoom,offset);
}
function refreshPreview(){
  if(!src)return;
  try{setPreviewUrl(exportCurrent())}catch{/* keep the last good preview */}
}
useEffect(()=>{if(src)refreshPreview()},[frameSize]);
function onPickFile(file:File|undefined){
  setError("");
  if(!file)return;
  if(file.size>2_000_000){setError("تصویر بنر باید کمتر از ۲ مگابایت باشد.");return}
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("تصویر باید JPG، PNG یا WebP باشد.");return}
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    if(src)URL.revokeObjectURL(src);
    imgRef.current=img;
    setImgSize({w:img.naturalWidth,h:img.naturalHeight});
    setSrc(url);setZoom(1);setOffset({x:0,y:0});setPreviewUrl("");
    window.setTimeout(()=>{try{setPreviewUrl(exportCropped(img,frameSize,1,{x:0,y:0}))}catch{}},0);
  };
  img.onerror=()=>{URL.revokeObjectURL(url);setError("تصویر بارگیری نشد.")};
  img.src=url;
}
function onPointerDown(e:ReactPointerEvent<HTMLElement>){
  if(!src)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  dragRef.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,start:offset};
  setDragging(true);
}
function onPointerMove(e:ReactPointerEvent<HTMLElement>){
  const drag=dragRef.current;
  if(!drag||drag.id!==e.pointerId)return;
  setOffset(clampOffset({x:drag.start.x+(e.clientX-drag.startX),y:drag.start.y+(e.clientY-drag.startY)},zoom,frameSize,imgSize));
}
function endDrag(e:ReactPointerEvent<HTMLElement>){
  if(dragRef.current?.id!==e.pointerId)return;
  dragRef.current=null;setDragging(false);refreshPreview();
}
async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");
  try{
    if(!src)throw new Error("برای بنر باید تصویر دلخواهتان را بارگذاری کنید.");
    if(!title.trim())throw new Error("عنوان بنر را بنویسید.");
    const imageData=exportCurrent();
    const r=await fetch("/api/banners",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:title.trim(),body:body.trim(),imageData,linkText:linkText.trim(),linkUrl:linkUrl.trim()})}),d=await r.json();
    if(!r.ok)throw new Error(d.error);
    e.currentTarget.reset();
    if(src)URL.revokeObjectURL(src);
    imgRef.current=null;
    setSrc("");setImgSize({w:0,h:0});setZoom(1);setOffset({x:0,y:0});setPreviewUrl("");
    setTitle("");setBody("");setLinkText("");setLinkUrl("");
    await load();
  }catch(x){setError(x instanceof Error?x.message:"ذخیره بنر انجام نشد.")}
  finally{setBusy(false)}
}
async function remove(id:number){setBusy(true);try{const r=await fetch(`/api/banners?id=${id}`,{method:"DELETE"}),d=await r.json();if(!r.ok)throw new Error(d.error);await load()}catch(x){setError(x instanceof Error?x.message:"حذف بنر انجام نشد.")}finally{setBusy(false)}}
const heroCopy=<><h2>{title.trim()||"عنوان بنر"}</h2>{body.trim()&&<p>{body.trim()}</p>}{linkText.trim()&&<span className="student-hero-link-text">{linkText.trim()} ←</span>}</>;
return <section className="banner-manager"><div><h2>بنرهای صفحهٔ دانش‌آموز</h2><p>{banners.length} از ۵ بنر · بنرها هر ۱۰ ثانیه عوض می‌شوند و امکان ورق‌زدن هم دارند.</p></div>{error&&<p className="auth-error">{error}</p>}
<form onSubmit={submit}>
<label>عنوان<input className="auth-input" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={100}/></label>
<label>متن کوتاه<input className="auth-input" value={body} onChange={e=>setBody(e.target.value)} maxLength={400}/></label>
<label>تصویر<input className="auth-input" type="file" accept="image/png,image/jpeg,image/webp" required onChange={e=>{onPickFile(e.target.files?.[0]);}} /></label>
{src&&<div className="banner-editor">
  <h3>پیش‌نمایش و برش بنر</h3>
  <p>تصویر را داخل قاب بکشید تا جابه‌جا شود و با لغزنده بزرگ یا کوچکش کنید. قاب دقیقاً همان اندازه‌ای است که بنر روی صفحهٔ دانش‌آموز دارد و متن روی آن هم همان‌طور دیده می‌شود.</p>
  <section ref={frameRef} className={`student-hero banner-editor-frame${dragging?" dragging":""}`} style={{aspectRatio:`${DESKTOP_RATIO}`,minHeight:0}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <div className="student-hero-clickarea">
      <img src={src} alt="" draggable={false} style={{transform:`translate(${offset.x}px, ${offset.y}px) scale(${zoom})`}}/>
      <div className="student-hero-shade"/>
      <div className="student-hero-copy">{heroCopy}</div>
    </div>
  </section>
  <div className="banner-editor-controls">
    <button type="button" onClick={()=>applyZoom(zoom-0.25)} disabled={zoom<=1}>− کوچک‌تر</button>
    <label>بزرگ‌نمایی<input type="range" min={1} max={3} step={0.05} value={zoom} onChange={e=>applyZoom(Number(e.target.value))} onMouseUp={refreshPreview} onTouchEnd={refreshPreview}/><span className="banner-editor-zoom-value">{Math.round(zoom*100)}٪</span></label>
    <button type="button" onClick={()=>applyZoom(zoom+0.25)} disabled={zoom>=3}>+ بزرگ‌تر</button>
    <button type="button" className="banner-editor-reset" onClick={()=>{setZoom(1);setOffset({x:0,y:0});refreshPreview()}}>بازنشانی</button>
  </div>
  {previewUrl&&<div className="banner-editor-previews">
    <div><small>پیش‌نمایش نهایی — دسکتاپ</small>
      <section className="student-hero" style={{aspectRatio:`${DESKTOP_RATIO}`,minHeight:0}}><div className="student-hero-clickarea"><img src={previewUrl} alt=""/><div className="student-hero-shade"/><div className="student-hero-copy">{heroCopy}</div></div></section>
    </div>
    <div className="banner-editor-mobile"><small>پیش‌نمایش نهایی — موبایل</small>
      <section className="student-hero" style={{aspectRatio:`${MOBILE_RATIO}`,minHeight:0}}><div className="student-hero-clickarea"><img src={previewUrl} alt=""/><div className="student-hero-shade"/><div className="student-hero-copy">{heroCopy}</div></div></section>
    </div>
  </div>}
</div>}
<label>متن دکمه (اختیاری)<input className="auth-input" value={linkText} onChange={e=>setLinkText(e.target.value)} maxLength={40}/></label>
<label>پیوند دکمه<input className="auth-input" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://... یا /مسیر"/></label>
<button className="auth-submit" disabled={busy||banners.length>=5}>{busy?"در حال ذخیره…":"افزودن بنر"}</button>
</form>
<div className="banner-manager-list">{banners.map(b=><article key={b.id}><strong>{b.title}</strong><button disabled={busy} onClick={()=>void remove(b.id)}>حذف</button></article>)}</div></section>}
