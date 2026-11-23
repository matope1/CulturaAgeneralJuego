// Rebuild supabase/seed_questions.sql from the bank that questions.js actually exports.
const fs = require('node:fs');
const vm = require('node:vm');

const browserWindow = {};
vm.runInNewContext(fs.readFileSync('questions.js', 'utf8'), { window: browserWindow });
const rows = browserWindow.QUESTION_BANK.map(q => ({
  id:q.id, mode:q.mode, category:q.category, difficulty:q.difficulty,
  question:q.q, answer:q.a, options:q.o ?? null, unit:q.unit ?? null,
  tolerance:q.tol ?? 0, explanation:q.e, source:q.s
}));
const json = JSON.stringify(rows).replaceAll("'", "''");
const sql = `-- ${rows.length} preguntas activas. Ejecutar después de 0001_online_rooms.sql.
insert into public.game_questions(id,mode,category,difficulty,question,answer,options,unit,tolerance,explanation,source)
select id,mode,category,difficulty,question,answer,options,unit,tolerance,explanation,source
from jsonb_to_recordset('${json}'::jsonb) as q(id text,mode text,category text,difficulty text,question text,answer jsonb,options jsonb,unit text,tolerance numeric,explanation text,source text)
on conflict(id) do update set mode=excluded.mode,category=excluded.category,difficulty=excluded.difficulty,
  question=excluded.question,answer=excluded.answer,options=excluded.options,unit=excluded.unit,
  tolerance=excluded.tolerance,explanation=excluded.explanation,source=excluded.source;
`;
fs.writeFileSync('supabase/seed_questions.sql', sql);
console.log(`Escritas ${rows.length} preguntas en supabase/seed_questions.sql`);
