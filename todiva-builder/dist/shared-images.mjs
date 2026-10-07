import{validImageSettings}from'./card-images.mjs';
export function createSharedImages(config,ids,request=fetch){
  const enabled=config?.enabled===true;
  if(enabled&&(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)||!/^sb_publishable_[\w-]+$/.test(config.publishableKey)))throw Error('共有画像の接続設定を確認してください');
  let rows=new Map();
  async function rpc(name,data={}){
    if(!enabled)throw Error('共有保存先は未設定です');
    const response=await request(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    if(!response.ok){const message=body.message||'';throw Error(message.includes('revision_conflict')?'他の人が先に変更しました。最新の設定を読み込み直してから調整してください。':message.includes('rate_limit')?'少し待ってからもう一度保存してください。':'共有画像を読み込み・保存できません。接続設定や通信を確認してください。');}
    return body;
  }
  function validate(row){if(!ids.has(row.card_id)||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('共有画像データが正しくありません');return {...row,settings:validImageSettings({[row.card_id]:row.settings},ids)[row.card_id]};}
  return{
    enabled,
    get settings(){return Object.fromEntries([...rows.values()].map(row=>[row.card_id,row.settings]));},
    async refresh(){const data=await rpc('builder_image_current');if(!Array.isArray(data)||data.length>ids.size)throw Error('共有画像データが正しくありません');const next=new Map();for(const raw of data){const row=validate(raw);if(next.has(row.card_id))throw Error('共有画像が重複しています');next.set(row.card_id,row);}rows=next;return this.settings;},
    async save(id,settings){const value=validImageSettings({[id]:settings},ids)[id];const row=validate(await rpc('builder_image_save',{p_card_id:id,p_settings:value,p_expected_revision:rows.get(id)?.revision||0}));rows.set(id,row);return row;},
    async history(id){const data=await rpc('builder_image_history',{p_card_id:id});if(!Array.isArray(data))throw Error('履歴を読み込めません');return data;},
    async restore(id,revision){const row=validate(await rpc('builder_image_restore',{p_card_id:id,p_revision:revision,p_expected_revision:rows.get(id)?.revision||0}));rows.set(id,row);return row;}
  };
}
