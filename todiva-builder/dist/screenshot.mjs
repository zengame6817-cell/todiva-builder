import {matchesCard} from './search.mjs';
export function readPower(text){
  const cleaned=String(text).normalize('NFKC').replace(/,/g,'').trim();
  const match=cleaned.match(/^\s*(\d+(?:\.\d+)?)\s*(?:万)?\s*$/);
  if(!match)return null;
  const raw=Number(match[1]),power=Math.round(raw);
  return power>=1&&power<=9999?{raw,power,rounded:raw!==power}:null;
}
export function confirmedOwned(rows,ids){
  const result={};
  for(const row of rows){if(!row.checked)continue;const id=Number(row.id),power=Number(row.power);
    if(!ids.has(id)||!Number.isInteger(power)||power<1||power>9999)throw Error('登録するカードと1〜9999の整数の戦力を確認してください。');
    if(result[id]!==undefined&&result[id]!==power)throw Error('同じカードに違う戦力があります。登録する行を1つにしてください。');
    result[id]=power;
  }
  if(!Object.keys(result).length)throw Error('登録する行をチェックしてください。');
  return result;
}
let loader;
function loadOCR(){return loader??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{loader=null;reject(Error('読み取り機能を取得できません。通信を確認してください。'));};document.head.append(script);});}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountScreenshot(root,cards,onRegister){
  let bitmap=null,start=null,box=null,rows=[],worker=null,busy=false,disposed=false;
  root.innerHTML=`<h2>スクショから手持ちに登録</h2><p>横6枚の班画面に対応。画像上で、1班のカード6枚と下の戦力をまとめて囲んでください。班ごとに追加できます。</p><p class="muted">戦力を読み取ります。カードは検索して指定してください。スクショはサーバーに送信しません。初回は読み取り機能のダウンロードが必要です。</p><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="取り込むスクショ"><canvas class="import-canvas" aria-label="カードと戦力の範囲をドラッグで選択"></canvas><button type="button" class="primary import-read" disabled>選択した班を読み取る</button><p class="import-status" role="status"></p><div class="import-rows"></div><button type="button" class="primary import-save" hidden>チェックしたカードを登録</button>`;
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),status=root.querySelector('.import-status'),read=root.querySelector('.import-read');
  const bounds=document.createElement('details');bounds.innerHTML='<summary>範囲を数値で調整（画像全体に対する％）</summary>'+[['left','左端',5.5],['right','右端',94.5],['top','上端',20.3],['bottom','下端',32.1]].map(([id,label,value])=>`<label>${label}<input class="bound-${id}" type="number" min="0" max="100" step="0.1" value="${value}"></label>`).join('')+'<button type="button" class="apply-bounds">範囲を適用</button>';canvas.before(bounds);
  bounds.querySelector('button').onclick=()=>{if(!bitmap||busy)return;const values=['left','right','top','bottom'].map(id=>Number(bounds.querySelector('.bound-'+id).value));const[l,r,t,b]=values;if(values.some(v=>!Number.isFinite(v)||v<0||v>100)||r<=l||b<=t){status.textContent='左端＜右端、上端＜下端で指定してください。';return;}box={x:l*canvas.width/100,y:t*canvas.height/100,w:(r-l)*canvas.width/100,h:(b-t)*canvas.height/100};draw();read.disabled=false;};
  function draw(){if(!bitmap)return;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);if(box){ctx.strokeStyle='#4ce2fa';ctx.lineWidth=3;ctx.strokeRect(box.x,box.y,box.w,box.h);for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(box.x+box.w*i/6,box.y);ctx.lineTo(box.x+box.w*i/6,box.y+box.h);ctx.stroke();}}}
  function point(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}
  root.querySelector('input[type=file]').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('画像は20MB以下にしてください。');const next=await createImageBitmap(file);bitmap?.close();bitmap=next;canvas.width=Math.min(1000,bitmap.width);canvas.height=Math.round(bitmap.height*canvas.width/bitmap.width);box=null;read.disabled=true;draw();status.textContent='カードの上端から戦力の下端まで、1班を囲んでください。';}catch(err){status.textContent=err.message;}};
  canvas.onpointerdown=e=>{if(!bitmap||busy)return;start=point(e);canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!start)return;const end=point(e);box={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};draw();};
  canvas.onpointerup=()=>{start=null;read.disabled=busy||!box||box.w<120||box.h<60;};
  canvas.onpointercancel=()=>{start=null;};
  function options(q){return '<option value="">カードを選択</option>'+cards.filter(c=>matchesCard(c,q)).map(c=>`<option value="${c.id}">${escape(c.name)} / ${escape(c.cardName)} / ${c.rarity} / ${escape(c.attribute)}</option>`).join('');}
  function showRows(){root.querySelector('.import-rows').innerHTML=rows.map((r,i)=>`<article class="import-row" data-index="${i}"><img src="${r.image}" alt="読み取りカード${i+1}"><div><label><input type="checkbox" class="include"> ${i+1}枚目を登録</label><input type="search" class="card-query" placeholder="名前・よみがなで検索" aria-label="${i+1}枚目のカード検索"><select class="card-choice" aria-label="${i+1}枚目のカード">${options('')}</select><label>戦力（万）<input type="number" class="card-power" min="1" max="9999" step="1" value="${r.power??''}"></label><small>${escape(r.note)}</small></div></article>`).join('');root.querySelector('.import-save').hidden=!rows.length;};
  root.querySelector('.import-rows').oninput=e=>{const row=e.target.closest('.import-row');if(!row)return;const data=rows[Number(row.dataset.index)];if(e.target.matches('.card-query')){row.querySelector('.card-choice').innerHTML=options(e.target.value);data.id=null;data.checked=false;row.querySelector('.include').checked=false;}if(e.target.matches('.card-power'))data.power=e.target.value;};
  root.querySelector('.import-rows').onchange=e=>{const row=e.target.closest('.import-row');if(!row)return;const data=rows[Number(row.dataset.index)];if(e.target.matches('.card-choice'))data.id=e.target.value;if(e.target.matches('.include'))data.checked=e.target.checked;};
  read.onclick=async()=>{if(!box||busy)return;busy=true;read.disabled=true;const region={...box};try{
    status.textContent='読み取り機能を準備中…';const ocr=await loadOCR();if(disposed)return;worker=await ocr.createWorker('jpn+eng');await worker.setParameters({tessedit_pageseg_mode:'7'});
    const added=[];
    for(let i=0;i<6;i++){
      if(disposed)return;status.textContent=`戦力を読み取り中 ${i+1}/6…`;
      const crop=document.createElement('canvas');crop.width=Math.round(region.w/6);crop.height=Math.round(region.h);crop.getContext('2d').drawImage(canvas,region.x+region.w*i/6,region.y,region.w/6,region.h,0,0,crop.width,crop.height);
      const number=document.createElement('canvas');number.width=360;number.height=90;const nctx=number.getContext('2d');nctx.drawImage(crop,crop.width*.25,crop.height*.85,crop.width*.72,crop.height*.15,0,0,360,90);
      const pixels=nctx.getImageData(0,0,360,90);for(let p=0;p<pixels.data.length;p+=4){const v=Math.min(...pixels.data.slice(p,p+3))>145?0:255;pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=v;}nctx.putImageData(pixels,0,0);
      const {data}=await worker.recognize(number);const power=readPower(data.text);added.push({image:crop.toDataURL('image/jpeg',.8),power:power?.power,id:null,checked:false,note:power?`読み取り候補：${power.raw}万${power.rounded?' → '+power.power+'万（整数に丸めています）':''}。画像と照合してください。`:'読み取れませんでした。画像を確認して戦力を入力してください。'});
    }
    rows.push(...added);showRows();status.textContent='読み取りには誤りがあります。カードと戦力を画像と照合し、登録する行をチェックしてください。既存の手持ち戦力は選択した値に更新されます。';
  }catch(err){status.textContent='読み取りに失敗しました：'+err.message;}finally{await worker?.terminate();worker=null;busy=false;read.disabled=disposed||!box;}};
  root.querySelector('.import-save').onclick=()=>{try{onRegister(confirmedOwned(rows,new Set(cards.map(c=>c.id))));}catch(err){status.textContent=err.message;}};
  return()=>{disposed=true;bitmap?.close();if(worker)worker.terminate().catch(()=>{});};
}


