const fs=require('node:fs');
const vm=require('node:vm');

const bankWindow={};
vm.runInNewContext(fs.readFileSync('questions.js','utf8'),{window:bankWindow});
const bank=bankWindow.QUESTION_BANK;
const storage=new Map();
const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
function freshRotation(){const window={localStorage};vm.runInNewContext(fs.readFileSync('question-rotation.js','utf8'),{window,Math,Date,Set,Map,JSON});return window.BravaRotation;}
function assert(condition,message){if(!condition)throw new Error(message);}

for(const mode of ['mc','ojo']){
  const eligible=bank.filter(q=>q.mode===mode),allIds=new Set(),played=[],duplicatesWithinLastThree=[];let withinGameDuplicates=0,adjacentCategoryPairs=0,adjacentDifficultyPairs=0;
  for(let game=0;game<20;game++){
    // Reinicia el contexto para simular que se cierra y vuelve a abrir la aplicación.
    const rotation=freshRotation(),selection=rotation.select(eligible,10,mode,eligible),ids=selection.questions.map(q=>q.id);
    assert(ids.length===10,`${mode}: partida ${game+1} no tiene 10 preguntas`);
    assert(new Set(ids).size===10,`${mode}: duplicado dentro de la partida ${game+1}`);
    for(let i=1;i<selection.questions.length;i++){if(selection.questions[i].category===selection.questions[i-1].category)adjacentCategoryPairs++;if(selection.questions[i].difficulty===selection.questions[i-1].difficulty)adjacentDifficultyPairs++;}
    const recent=new Set(played.slice(-3).flat());
    const overlaps=ids.filter(id=>recent.has(id));
    duplicatesWithinLastThree.push(...overlaps);
    withinGameDuplicates+=10-new Set(ids).size;
    rotation.record(selection);played.push(ids);ids.forEach(id=>allIds.add(id));
  }
  assert(withinGameDuplicates===0,`${mode}: hubo duplicados dentro de una partida`);
  assert(duplicatesWithinLastThree.length===0,`${mode}: se repitió antes de tres partidas: ${duplicatesWithinLastThree.join(',')}`);
  const persistedStats=freshRotation().stats(bank);
  assert(persistedStats.repeatUses===played.flat().length-allIds.size,`${mode}: el contador de repeticiones no cuadra`);
  const summary={mode,partidas:played.length,preguntasJugadas:played.length*10,unicas:[...allIds].length,repeticiones:played.flat().length-allIds.size,duplicadosDentro:withinGameDuplicates,repetidasEnUltimasTres:duplicatesWithinLastThree.length,categoriasConsecutivas:adjacentCategoryPairs,dificultadesConsecutivas:adjacentDifficultyPairs};
  console.log(JSON.stringify(summary));
}

// El tamaño de partida cambia sin vaciar la memoria ni perder el comportamiento tras recarga.
for(const mode of ['mc','ojo']){
  storage.clear();
  for(const count of [10,30,50,10]){
    const rotation=freshRotation(),eligible=bank.filter(q=>q.mode===mode),selection=rotation.select(eligible,count,mode,eligible);
    assert(selection.questions.length===count,`${mode} duración ${count}: selección incompleta`);
    assert(new Set(selection.questions.map(q=>q.id)).size===count,`${mode} duración ${count}: duplicado en partida`);
    rotation.record(selection);
  }
  const afterReload=freshRotation().stats(bank);
  assert(afterReload.history.length===4,`${mode}: historial no sobrevivió a la recarga`);
  assert(afterReload.usedUnique===100,`${mode}: cambiar duración perdió el registro de ids`);
  console.log(JSON.stringify({mode,duraciones:[10,30,50,10],idsUnicosTrasRecarga:afterReload.usedUnique,ultimasPartidas:afterReload.history.length,resultado:'OK'}));
}

storage.clear();
const filterRotation=freshRotation(),mcPool=bank.filter(q=>q.mode==='mc'),filterSelections=[];
for(const difficulty of ['easy','normal','difficult','expert']){
  const eligible=mcPool.filter(q=>q.difficulty===difficulty),selection=filterRotation.select(eligible,5,'mc',mcPool);
  assert(selection.questions.length===5,`filtro ${difficulty}: selección incompleta`);
  filterRotation.record(selection);filterSelections.push(...selection.questions.map(q=>q.id));
}
assert(new Set(filterSelections).size===20,'cambiar la dificultad reinició prematuramente la rotación');
console.log(JSON.stringify({cambioDificultad:['easy','normal','difficult','expert'],preguntasUnicas:new Set(filterSelections).size,resultado:'OK'}));

// Aterriza el historial de la versión anterior para excluir como mínimo su última partida.
storage.clear();
storage.set('cultura-brava-v1',JSON.stringify({mode:'mc',created:12345,questions:bank.filter(q=>q.mode==='mc').slice(0,10)}));
const migrated=freshRotation(),migratedStats=migrated.stats(bank);
assert(migratedStats.usedUnique===10,'no migró la partida guardada antigua');
assert(migratedStats.history[0].migrated===true,'no marcó el historial migrado');
console.log(JSON.stringify({migracionPartidaAnterior:10,resultado:'OK'}));

migrated.reset();
const resetStats=freshRotation().stats(bank);
assert(resetStats.games===0&&resetStats.usedUnique===0,'el reinicio no borró el historial');
console.log(JSON.stringify({reinicioHistorial:'OK'}));
