const fs=require('node:fs');
const vm=require('node:vm');
const window={};
for(const file of ['questions.js','questions-ojo-extra.js']){
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{window});
}
const rows=window.BRAVA_OJO_EXTRA.map(q=>({
  id:q.id,mode:q.mode,category:q.category,difficulty:q.difficulty,question:q.q,
  answer:q.a,options:null,unit:q.unit,tolerance:q.tol,explanation:q.e,source:q.s
}));
const json=JSON.stringify(rows).replace(/'/g,"''");
const sql=`-- ${rows.length} nuevas preguntas A Ojo. Ejecutar después de las migraciones 0001–0003.
insert into public.game_questions(id,mode,category,difficulty,question,answer,options,unit,tolerance,explanation,source)
select id,mode,category,difficulty,question,answer,options,unit,tolerance,explanation,source
from jsonb_to_recordset('${json}'::jsonb) as q(
  id text,mode text,category text,difficulty text,question text,answer jsonb,
  options jsonb,unit text,tolerance numeric,explanation text,source text
)
on conflict(id) do nothing;
`;
fs.writeFileSync('supabase/migrations/0004_ojo_extra_questions.sql',sql);
console.log(JSON.stringify({migration:'supabase/migrations/0004_ojo_extra_questions.sql',questions:rows.length}));
