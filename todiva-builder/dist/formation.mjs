export const positionLabel=index=>index<4?'前衛':'後衛';
export function cardSkills(card){
  if(card.skillDetails)return card.skillDetails;
  const passive=(card.skills?.passive||'').split('\n');
  return {unique:[],active:[],passive:passive[0]?[{name:passive[0],description:passive.slice(1).join('\n'),requiresRear:passive.slice(1).join('\n').includes('増援'),positionCheck:passive[0].includes('エントリー')}]:[]};
}
export function skillSummary(squads,byId){
  const groups={passive:new Map(),active:new Map(),unique:new Map()},warnings=[],missing=[];
  squads.forEach((row,i)=>row.forEach((slot,j)=>{
    if(!slot)return;
    const card=byId.get(slot.id);if(!card)return;
    const skills=cardSkills(card);
    if(!skills.passive.length)missing.push({squad:i,slot:j,name:card.name});
    for(const [type,list]of Object.entries(skills)){
      const seen=new Set();
      for(const skill of list){
        if(!skill.name||seen.has(skill.name))continue;seen.add(skill.name);
        const record=groups[type].get(skill.name)||{name:skill.name,count:0,front:0,rear:0,needsRear:0,frontNeedsRear:0,positionCheck:false,description:skill.description};
        record.count++;record[j<4?'front':'rear']++;
        if(skill.requiresRear){record.needsRear++;if(j<4)record.frontNeedsRear++}
        record.positionCheck ||= skill.positionCheck;
        groups[type].set(skill.name,record);
        if(j<4&&(skill.requiresRear||skill.positionCheck))warnings.push({squad:i,slot:j,name:card.name,skill:skill.name,requiresRear:skill.requiresRear});
      }
    }
  }));
  return {groups:Object.fromEntries(Object.entries(groups).map(([type,map])=>[type,[...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ja'))])),warnings,missing};
}
