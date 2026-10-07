import{matchesCard}from'./search.mjs';
import{cardSkills}from'./formation.mjs';
export function skillNames(card,category=''){
  const skills=cardSkills(card);
  return [...new Set((category?(skills[category]||[]):Object.values(skills).flat()).map(s=>s.name).filter(Boolean))];
}
export function skillOptions(cards,category=''){
  return [...new Set(cards.flatMap(c=>skillNames(c,category)))].sort((a,b)=>a.localeCompare(b,'ja'));
}
export function filterCatalog(cards,filters,owned,favorites=[],ownedOnly=false){
  const favorite=new Set(favorites);
  return cards.filter(c=>(!filters.rarity||c.rarity===filters.rarity)&&(!filters.attribute||c.attribute===filters.attribute)&&(!ownedOnly||owned[c.id])&&matchesCard(c,filters.q||'')&&(!filters.skill||skillNames(c,filters.skillCategory).includes(filters.skill)))
    .sort((a,b)=>{
      if(filters.sort==='powerDesc'||filters.sort==='powerAsc'){
        const ap=owned[a.id],bp=owned[b.id];
        if(!ap&&bp)return 1;if(ap&&!bp)return -1;
        const difference=(ap||0)-(bp||0);
        if(difference)return filters.sort==='powerDesc'?-difference:difference;
      }
      return Number(favorite.has(b.id))-Number(favorite.has(a.id));
    });
}
