/* Identifica a quién corresponde el punto ya calculado por las reglas actuales. */
(() => {
  const sameAnswer=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function local(mode,answers,correct){
    if(mode==='mc')return answers.map((answer,index)=>answer===correct?index:-1).filter(index=>index>=0);
    const distances=answers.map(answer=>Math.abs(Number(answer)-correct)),best=Math.min(...distances);
    return answers.map((_,index)=>Math.abs(distances[index]-best)<1e-9?index:-1).filter(index=>index>=0);
  }
  function online(mode,answers,correct){
    if(!Array.isArray(answers)||!answers.length)return [];
    if(mode==='mc')return answers.filter(item=>sameAnswer(item.answer,correct));
    const valid=answers.map(item=>({...item,distance:Math.abs(Number(item.answer)-Number(correct))})).filter(item=>Number.isFinite(item.distance));
    if(!valid.length)return [];
    const best=Math.min(...valid.map(item=>item.distance));
    return valid.filter(item=>item.distance===best);
  }
  window.BravaRoundResults={local,online};
})();
