import{powerOK}from'./core.mjs';
export function encodeOwned(owned,name='共有された手持ち'){
  const bytes=new TextEncoder().encode(JSON.stringify({v:1,type:'owned',name,c:Object.entries(owned).map(([id,p])=>[Number(id),p])}));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function decodeOwned(token,ids){
  if(typeof token!=='string'||token.length>12000||!/^[\w-]+$/.test(token))throw Error('手持ち共有リンクが正しくありません');
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));
  if(data.v!==1||data.type!=='owned'||typeof data.name!=='string'||!data.name.trim()||data.name.length>80||!Array.isArray(data.c)||!data.c.length||data.c.length>1000)throw Error('手持ち共有の形式が正しくありません');
  const owned={};for(const pair of data.c){if(!Array.isArray(pair)||pair.length!==2||!ids.has(pair[0])||!powerOK(pair[1])||Object.hasOwn(owned,pair[0]))throw Error('共有されたカード・戦力を確認してください。カード一覧の更新が必要な場合があります');owned[pair[0]]=pair[1];}
  return{name:data.name,owned};
}
