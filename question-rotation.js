/* Rotación persistente del modo local. El historial se comparte entre duraciones y modos. */
(() => {
  const KEY='cultura-brava-rotation-v1';
  const MODES=['mc','ojo'];
  const blank=()=>({version:1,games:0,cycles:{mc:1,ojo:1},cycleUsed:{mc:[],ojo:[]},everUsed:[],lastUsed:{},repeatCounts:{},repeatUses:0,history:[]});
  const store=window.localStorage;
  const read=()=>{try{const raw=JSON.parse(store.getItem(KEY));if(raw&&raw.version===1){const state=blank();return {...state,...raw,cycles:{...state.cycles,...raw.cycles},cycleUsed:{...state.cycleUsed,...raw.cycleUsed},lastUsed:raw.lastUsed||{},repeatCounts:raw.repeatCounts||{},history:Array.isArray(raw.history)?raw.history:[]};}
    // Primera ejecución de la memoria: migra las preguntas de la partida local guardada.
    const state=blank(),old=JSON.parse(store.getItem('cultura-brava-v1')||'null');
    if(old&&MODES.includes(old.mode)&&Array.isArray(old.questions)){const ids=[...new Set(old.questions.map(q=>q.id).filter(Boolean))];state.games=1;state.everUsed=ids;state.cycleUsed[old.mode]=ids;ids.forEach(id=>state.lastUsed[id]=1);state.history=[{game:1,mode:old.mode,count:ids.length,ids,repeatedIds:[],cycle:1,at:new Date(old.created||Date.now()).toISOString(),migrated:true}];write(state);}
    return state;
  }catch{return blank()}};
  const write=state=>{try{store.setItem(KEY,JSON.stringify(state));return true}catch{return false}};
  const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  function recentIds(history,mode,count=3){return new Set(history.filter(g=>g.mode===mode).slice(-count).flatMap(g=>g.ids||[]))}
  function select(input,count,mode,modePool=input){
    if(!MODES.includes(mode))throw new Error('Modo de rotación desconocido.');
    const eligible=[...new Map(input.map(q=>[q.id,q])).values()];
    if(count<1||count>eligible.length)throw new Error('No hay preguntas suficientes para esta partida.');
    const state=read(),used=new Set(state.cycleUsed[mode]||[]),recent=recentIds(state.history,mode),chosen=[],chosenIds=new Set();
    let lastCategory=null,lastDifficulty=null;
    while(chosen.length<count){
      const remaining=eligible.filter(q=>!chosenIds.has(q.id));
      const tiers=[
        remaining.filter(q=>!used.has(q.id)&&!recent.has(q.id)),
        remaining.filter(q=>!used.has(q.id)&&recent.has(q.id)),
        remaining.filter(q=> used.has(q.id)&&!recent.has(q.id)),
        remaining.filter(q=> used.has(q.id)&& recent.has(q.id))
      ];
      let tierIndex=tiers.findIndex(t=>t.length);if(tierIndex<0)break;
      let candidates=tiers[tierIndex];
      if(lastCategory!==null){
        let other=candidates.filter(q=>q.category!==lastCategory);
        if(!other.length){const maxTier=tierIndex<2?1:3,next=tiers.findIndex((t,i)=>i>tierIndex&&i<=maxTier&&t.some(q=>q.category!==lastCategory));if(next>=0){tierIndex=next;candidates=tiers[next];other=candidates.filter(q=>q.category!==lastCategory);}}
        if(other.length)candidates=other;
      }
      if(lastDifficulty!==null){
        let other=candidates.filter(q=>q.difficulty!==lastDifficulty);
        if(!other.length){const maxTier=tierIndex<2?1:3,next=tiers.findIndex((t,i)=>i>tierIndex&&i<=maxTier&&t.some(q=>q.difficulty!==lastDifficulty&&(lastCategory===null||q.category!==lastCategory)));if(next>=0){tierIndex=next;candidates=tiers[next];other=candidates.filter(q=>q.difficulty!==lastDifficulty&&(lastCategory===null||q.category!==lastCategory));}}
        if(other.length)candidates=other;
      }
      if(tierIndex>=2){const oldest=Math.min(...candidates.map(q=>state.lastUsed[q.id]??0));candidates=candidates.filter(q=>(state.lastUsed[q.id]??0)===oldest);}
      const q=shuffle(candidates)[0];chosen.push(q);chosenIds.add(q.id);lastCategory=q.category;lastDifficulty=q.difficulty;
    }
    const repeatedIds=chosen.filter(q=>state.lastUsed[q.id]!==undefined).map(q=>q.id);
    const modeIds=new Set(modePool.map(q=>q.id));
    const cycleAfter=new Set([...used,...chosen.map(q=>q.id)].filter(id=>modeIds.has(id)));
    return {questions:chosen,repeatedIds,crossedCycle:cycleAfter.size>=modeIds.size,mode};
  }
  function record(selection){
    const state=read(),{questions,mode,repeatedIds=[]}=selection;
    const ids=questions.map(q=>q.id),nextGame=state.games+1;
    if(selection.crossedCycle){state.cycles[mode]=(state.cycles[mode]||1)+1;state.cycleUsed[mode]=[...new Set(ids)];}
    else state.cycleUsed[mode]=[...new Set([...(state.cycleUsed[mode]||[]),...ids])];
    state.games=nextGame;
    for(const id of ids){
      if(!state.everUsed.includes(id))state.everUsed.push(id);
      state.lastUsed[id]=nextGame;
    }
    for(const id of repeatedIds)state.repeatCounts[id]=(state.repeatCounts[id]||0)+1;
    state.repeatUses+=repeatedIds.length;
    state.history.push({game:nextGame,mode,count:ids.length,ids,repeatedIds:[...repeatedIds],cycle:state.cycles[mode],at:new Date().toISOString()});
    state.history=state.history.slice(-100);
    write(state);
    return state.history[state.history.length-1];
  }
  function stats(bank){
    const state=read(),byMode={};
    for(const mode of MODES){const eligible=bank.filter(q=>q.mode===mode),cycle=new Set(state.cycleUsed[mode]||[]),recent=recentIds(state.history,mode);byMode[mode]={total:eligible.length,usedUnique:eligible.filter(q=>state.everUsed.includes(q.id)).length,availableThisCycle:eligible.filter(q=>!cycle.has(q.id)).length,availableWithoutRecent:eligible.filter(q=>!cycle.has(q.id)&&!recent.has(q.id)).length,cycle:state.cycles[mode]};}
    const repeated=Object.entries(state.repeatCounts).map(([id,repeats])=>({id,uses:repeats+1,repeats,question:bank.find(q=>q.id===id)?.q||id})).sort((a,b)=>b.repeats-a.repeats);
    return {games:state.games,usedUnique:new Set(state.everUsed).size,repeatUses:state.repeatUses,repeated,byMode,history:state.history.slice(-5).reverse().map(g=>({...g,questions:g.ids.map(id=>bank.find(q=>q.id===id)?.q||id)}))};
  }
  function reset(){write(blank());}
  window.BravaRotation={select,record,stats,reset,key:KEY};
})();
