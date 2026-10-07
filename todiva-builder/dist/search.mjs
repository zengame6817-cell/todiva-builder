// Readings are explicit so unusual character names are searchable reliably.
const readings={
  '冠氷尋':'かむらいじん','磴塔真':'いしばしとうま','歩二魁斗':'ふじかいと',
  '御堂亜嵐':'みどうあらん','黒鷺玲音':'くろさぎれお','灰園翔平':'はいぞのしょうへい',
  '艸楽陽':'さがらはる','音無叶空':'おとなしとわ','白波蓮':'しらなみれん',
  '星喰大我':'ほしばみたいが','針条律':'しんじょうりつ','加賀見昴流':'かがみすばる',
  '草薙伯玖':'くさなぎはく','殊玉善治':'ことだまぜんじ','観月累':'みづきるい',
  '衣佐美佑理':'いさみゆうり','桐崎次郎':'きりさきじろう','金剛座丈':'こんごうざじょう',
  '煤原未桜':'すすはらみお','幻海シオン':'げんかいしおん',
};
export function normalizeSearch(value){
  return String(value??'').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))
    .replace(/[\s・･【】〖〗「」『』、。,\.\-_]/g,'');
}
const cache=new WeakMap();
function searchText(card){
  if(cache.has(card))return cache.get(card);
  let name=String(card.name||'').replace(/\s/g,'');
  for(const [kanji,kana]of Object.entries(readings))name=name.replaceAll(kanji,kana);
  const terms=[card.name,name,card.cardName,...(card.aliases||[]),...Object.values(card.skills||{})];
  // Short and full forms of Romeo both find the same cards.
  if(String(card.name).includes('ロミオ'))terms.push('ロミオ・ルッチ','ロミオ・スコーピウス・ルッチ');
  const text=normalizeSearch(terms.join(' '));cache.set(card,text);return text;
}
export function matchesCard(card,query){
  const tokens=String(query??'').trim().split(/[\s　]+/).map(normalizeSearch).filter(Boolean);
  return tokens.every(token=>searchText(card).includes(token));
}
export function selectionPowerLabel(cardId,owned){
  return Number.isInteger(owned[cardId])?`登録戦力：${owned[cardId].toLocaleString('ja-JP')}万`:'未所持・戦力未登録';
}
