/* 車道指引（Batch 6）。目前沒有真實車道資料，使用「Demo 車道資料」，UI 一律標示 DEMO，不假裝是真實資料。
   可用車道＝允許該轉向的車道；推薦車道＝可用車道中最適合的一條（左轉取最左、右轉取最右）。 */
(function () {
  const A = window.AIGPS, APP = ['N', 'E', 'S', 'W'];
  const T = [
    [['left'], ['straight'], ['straight'], ['straight', 'right']],
    [['left'], ['left', 'straight'], ['straight'], ['right']],
    [['uturn', 'left'], ['straight'], ['straight'], ['right']],
    [['left'], ['straight'], ['straight', 'right'], ['right']]
  ];
  const table = { demo: true, junctions: {} };           // Demo JSON：每個格線路口、四個進入方向
  for (let x = -1000; x <= 1000; x += 200) for (let y = -1000; y <= 1000; y += 200) {
    const j = {}; APP.forEach((a, i) => { j[a] = T[(Math.abs(x / 200) * 3 + Math.abs(y / 200) * 5 + i) % 4]; }); table.junctions[x + ',' + y] = j;
  }
  const approachOf = hd => APP[Math.round(((hd % 360) + 360) % 360 / 90) % 4];
  function forManeuver(m) {
    if (!m || !m.pt || m.inHd == null || !['left', 'right', 'uturn'].includes(m.dir)) return null;
    const x = Math.round(m.pt[0]), y = Math.round(m.pt[1]), j = table.junctions[x + ',' + y]; if (!j) return null;
    const ap = approachOf(m.inHd), arrows = j[ap], avail = arrows.map(a => a.includes(m.dir)), idx = avail.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (!idx.length) return null;
    const rec = m.dir === 'right' ? idx[idx.length - 1] : idx[0];
    return { demo: true, junction: { x, y }, approach: ap, want: m.dir, lanes: arrows.map((a, i) => ({ arrows: a, available: avail[i], recommended: i === rec })) };
  }
  A.Lanes = { name: 'Demo Lanes（非真實車道資料）', isDemo: true, table, approachOf, forManeuver, has: m => !!forManeuver(m) };
  A.Providers.register('lanes', A.Lanes);
})();
