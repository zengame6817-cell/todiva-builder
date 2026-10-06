const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let settings={};
export function validImageSettings(value,ids){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('画像設定が正しくありません');
  const result={};
  for(const [id,p] of Object.entries(value)){
    if(!ids.has(Number(id))||!p||![p.zoom,p.x,p.y].every(Number.isFinite)||p.zoom<.5||p.zoom>3||Math.abs(p.x)>100||Math.abs(p.y)>100)throw Error('画像調整の値が正しくありません');
    if(p.src!==undefined&&(typeof p.src!=='string'||p.src.length>250000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(p.src)))throw Error('差し替え画像が正しくありません');
    result[id]={zoom:p.zoom,x:p.x,y:p.y,...(p.src?{src:p.src}:{})};
  }
  return result;
}
export function setImageSettings(value){settings=value||{};}
export function cardImage(card,extra=''){
  const p=settings[card.id]||card.defaultImageAdjustment;
  if(!p)return `<span class="card-image-viewport"><img ${extra} src="${esc(card.image)}" alt="${esc(card.name)}" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return `<span class="card-image-viewport"><img ${extra} src="${esc(p.src||card.image)}" alt="${esc(card.name)}" loading="lazy" referrerpolicy="no-referrer" style="transform:translate(${p.x}%,${p.y}%) scale(${p.zoom});object-fit:cover"></span>`;
}
export function mountImageEditor(root,card,current,onSave,onReset){
  let draft={zoom:1,x:0,y:0,...card.defaultImageAdjustment,...current},alive=true,busy=false;
  root.innerHTML=`<h2>${esc(card.name)}の画像調整</h2><p>${esc(card.cardName)}</p><div class="image-edit-preview"><img alt="調整プレビュー" referrerpolicy="no-referrer"></div><p class="muted">枠の内側に見えている部分が、編成・選択欄・図鑑・手持ちに同じ構図で表示されます。差し替え画像と調整設定はこのブラウザに保存し、バックアップにも含めます。共有リンクには含めません。</p><div class="image-controls">${[['zoom','拡大・縮小',.5,3,.05],['x','左右の位置',-100,100,1],['y','上下の位置',-100,100,1]].map(([key,label,min,max,step])=>`<label>${label} <output data-value="${key}"></output><input type="range" aria-label="${label}" data-image-control="${key}" min="${min}" max="${max}" step="${step}" value="${draft[key]}"></label>`).join('')}</div><div class="row"><button type="button" class="zoom-out">− 縮小</button><button type="button" class="zoom-in">＋ 拡大</button><button type="button" class="center-image">位置を中央に戻す</button></div><label class="image-file-label">画像を差し替え<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="差し替え画像"></label><p class="image-edit-status" role="status"></p><div class="row"><button type="button" class="primary save-image">調整を保存</button><button type="button" class="reset-image">元の画像・表示に戻す</button></div>`;
  const img=root.querySelector('.image-edit-preview img'),status=root.querySelector('.image-edit-status');
  function draw(){if(!alive)return;img.src=draft.src||card.image;img.style.transform=`translate(${draft.x}%,${draft.y}%) scale(${draft.zoom})`;for(const k of ['zoom','x','y']){root.querySelector(`[data-image-control="${k}"]`).value=draft[k];root.querySelector(`[data-value="${k}"]`).textContent=k==='zoom'?Math.round(draft[k]*100)+'%':draft[k]+'%';}}
  root.querySelectorAll('[data-image-control]').forEach(input=>input.oninput=()=>{draft[input.dataset.imageControl]=Number(input.value);draw();});
  root.querySelector('.zoom-in').onclick=()=>{draft.zoom=Math.min(3,Math.round((draft.zoom+.1)*100)/100);draw();};
  root.querySelector('.zoom-out').onclick=()=>{draft.zoom=Math.max(.5,Math.round((draft.zoom-.1)*100)/100);draw();};
  root.querySelector('.center-image').onclick=()=>{draft.x=0;draft.y=0;draw();};
  root.querySelector('input[type=file]').onchange=async e=>{
    busy=true;root.querySelector('.save-image').disabled=true;let bitmap;
    try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('画像は20MB以下にしてください');bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas'),ratio=Math.min(1,800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#242034';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const src=canvas.toDataURL('image/jpeg',.75);if(src.length>250000)throw Error('画像が大きいため、サイズを小さくして選び直してください');if(!alive)return;draft={zoom:1,x:0,y:0,src};draw();status.textContent='差し替え画像を確認して保存してください。';}catch(err){if(alive)status.textContent=err.message;}finally{bitmap?.close();busy=false;if(alive)root.querySelector('.save-image').disabled=false;}
  };
  root.querySelector('.save-image').onclick=()=>{if(!busy)onSave({...draft});};
  root.querySelector('.reset-image').onclick=onReset;
  img.onerror=()=>{if(alive)status.textContent='元画像を読み込めません。画像を差し替えることができます。';};
  draw();return()=>{alive=false;};
}
