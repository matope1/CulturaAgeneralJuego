const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
for (const file of ['questions.js', 'questions-ojo-extra.js']) {
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window });
}
const all = window.QUESTION_BANK;
const ojo = all.filter(q => q.mode === 'ojo');
const added = window.BRAVA_OJO_EXTRA;
const normalize = text => text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ids = new Set();
const exactQuestions = new Set();
const categories = {};
const difficulties = {};
const errors = [];

for (const q of all) {
  if (!q.id || ids.has(q.id)) errors.push(`ID ausente o duplicado: ${q.id}`);
  ids.add(q.id);
}
for (const q of ojo) {
  const text = normalize(q.q);
  if (exactQuestions.has(text)) errors.push(`Pregunta duplicada: ${q.q}`);
  exactQuestions.add(text);
  if (!Number.isFinite(q.a)) errors.push(`Respuesta no numérica: ${q.id}`);
  if (!q.unit || !q.category || !q.difficulty || !q.e || !q.s) errors.push(`Campo de pregunta incompleto: ${q.id}`);
  categories[q.category] = (categories[q.category] || 0) + 1;
  difficulties[q.difficulty] = (difficulties[q.difficulty] || 0) + 1;
}

// Revisa similitud textual alta entre preguntas nuevas para detectar reformulaciones obvias.
const tokens = text => new Set(normalize(text).split(' ').filter(w => w.length > 3));
const similarities = [];
for (let i = 0; i < added.length; i++) {
  const a = tokens(added[i].q);
  for (let j = i + 1; j < added.length; j++) {
    const b = tokens(added[j].q);
    const intersection = [...a].filter(w => b.has(w)).length;
    const score = intersection / Math.max(1, new Set([...a, ...b]).size);
    if (score >= 0.78) similarities.push({ a: added[i].id, b: added[j].id, score: Number(score.toFixed(2)) });
  }
}

if (errors.length) {
  console.error(JSON.stringify({ errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    originalOjo: ojo.length - added.length,
    added: added.length,
    totalOjo: ojo.length,
    allIdsUnique: ids.size === all.length,
    duplicateQuestions: 0,
    incompleteOrNonNumeric: 0,
    closeWordingPairs: similarities,
    categories,
    difficulties
  }, null, 2));
}
