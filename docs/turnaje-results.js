// Manual tournament results. Newest tournament has the highest id.
// TODO: move this data to Firebase once the turnaj system tracks final results itself.
const turnajeResults = [
  { id: 1, results: [
    { name: 'Dima', points: 4300 },
    { name: 'Levko', points: 2800 },
    { name: 'Krab', points: 1700 },
  ] },
  { id: 2, results: [
    { name: 'Dima', points: 2000 },
    { name: 'Váňa', points: 1700 },
    { name: 'Misha', points: 1700 },
    { name: 'Miriss', points: 400 },
  ] },
  { id: 3, results: [
    { name: 'Krab', points: 2600 },
    { name: 'Miriss', points: 2600 },
    { name: 'Váňa', points: 1300 },
  ] },
  { id: 4, results: [
    { name: 'Bambus', points: 3200 },
    { name: 'Renda', points: 1900 },
    { name: 'Krab', points: 1300 },
  ] },
  { id: 5, results: [
    { name: 'Dima', points: 3700 },
    { name: 'Krab', points: 2000 },
  ] },
  { id: 6, results: [
    { name: 'Krab', points: 900 },
    { name: 'Váňa', points: 400 },
  ] },
];

function renderTurnajeResults() {
  const container = document.getElementById('turnajeList');
  if (!container) return;

  const sorted = [...turnajeResults].sort((a, b) => b.id - a.id);

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  container.innerHTML = sorted.map(function(turnaj, turnajIndex) {
    const results = [...turnaj.results].sort((a, b) => b.points - a.points);
    let rank = 0;
    const rows = results.map(function(entry, i) {
      if (i === 0 || entry.points !== results[i - 1].points) rank++;
      entry.rank = rank;
      const rankLabel = medals[rank] || (rank + '.');
      return '<div class="turnaj-row rank-' + rank + '">' +
        '<span class="turnaj-rank">' + rankLabel + '</span>' +
        '<span class="turnaj-name">' + entry.name + '</span>' +
        '<span class="turnaj-points">' + entry.points + '</span>' +
      '</div>';
    }).join('');
    const cardClass = 'turnaj-card' + (turnajIndex === 0 ? ' latest' : '');
    return '<div class="' + cardClass + '">' +
      '<div class="turnaj-title">' + turnaj.id + '. turnaj</div>' +
      rows +
    '</div>';
  }).join('');
}

renderTurnajeResults();
