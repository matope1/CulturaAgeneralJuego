const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('round-results.js','utf8'),{window});
const result=window.BravaRoundResults;

assert.deepEqual(Array.from(result.local('ojo',[94,101,106],100)),[1],'A Ojo debe elegir la distancia mínima');
assert.deepEqual(Array.from(result.local('ojo',[98,102,107],100)),[0,1],'A Ojo debe mostrar todos los empatados');
assert.deepEqual(Array.from(result.local('mc',['no','sí','sí'],'sí')),[1,2],'El Sabiondo da punto a cada acierto');
assert.deepEqual(Array.from(result.local('mc',['no','tampoco'],'sí')),[],'El Sabiondo puede terminar sin ganadores');

const onlineAnswers=(values)=>values.map(([playerId,name,answer])=>({playerId,name,answer}));
assert.deepEqual(Array.from(result.online('ojo',onlineAnswers([['a','Ana',94],['b','Beto',101],['c','Cris',106]]),100).map(x=>x.playerId)),['b'],'Online A Ojo debe coincidir con la menor distancia');
assert.deepEqual(Array.from(result.online('ojo',onlineAnswers([['a','Ana',98],['b','Beto',102],['c','Cris',107]]),100).map(x=>x.playerId)),['a','b'],'Online A Ojo debe conservar empates');
assert.deepEqual(Array.from(result.online('mc',onlineAnswers([['a','Ana','no'],['b','Beto','sí'],['c','Cris','sí']]),'sí').map(x=>x.playerId)),['b','c'],'Online El Sabiondo debe marcar todos los aciertos');
assert.deepEqual(Array.from(result.online('mc',onlineAnswers([['a','Ana','no']]),'sí')),[],'Online El Sabiondo debe indicar cero ganadores');
assert.deepEqual(Array.from(result.online('ojo',onlineAnswers([['a','Ana','sin cifra']]),100)),[],'A Ojo no debe inventar ganador si no hay cifra válida');

console.log('OK: ganador único, empate y ausencia de aciertos/distancias válidas en local y online.');
