/* Demo Data Provider：一律標示 demo:true，不冒充真實資料。
   Batch 0 僅提供「誠實的未實作」回應；後續批次逐步補上 Demo 行為。 */
(function () {
  const A = window.AIGPS;
  const make = (name, methods, batch) => {
    const o = { name, isDemo: true };
    methods.forEach(m => (o[m] = async () => ({ ok: false, demo: true, reason: 'NOT_IMPLEMENTED', plannedBatch: batch })));
    return o;
  };
  A.Providers.register('location', make('Demo Location', ['start', 'stop'], 1));
  A.Providers.register('map', make('Demo Map', ['getTile'], 1));
  A.Providers.register('routing', make('Demo Routing', ['calculate', 'reroute'], 4));
  A.Providers.register('search', make('Demo Search', ['query', 'nearby'], 3));
  A.Providers.register('traffic', make('Demo Traffic', ['getEvents'], 7));
  A.Providers.register('weather', make('Demo Weather', ['getCurrent'], 10));
  A.Providers.register('parking', make('Demo Parking', ['nearby'], 10));
  A.Providers.register('ai', make('Demo Intent Parser', ['parse'], 12));
})();

/* Demo 地圖資料（Batch 1）：本地座標（公尺，x 向東、y 向北）。純屬示意，非真實地圖。 */
(function () {
  const A = window.AIGPS;
  A.DemoData = {
    demo: true,
    origin: { lat: 25.033, lng: 121.5654 },   // 僅作為 Demo 座標換算原點
    extent: 1000, grid: 200, major: 400,
    route: [[-800, -800], [-800, -200], [-200, -200], [-200, 400], [600, 400], [600, 800]]
  };
})();

/* Demo 離線交通事件（Batch 7）：屬於「已知的離線事件」，不是即時資料。 */
window.AIGPS.DemoData.offlineEvents = [
  { id: 'off1', type: 'construction', a: [0, 200], b: [0, 400], label: '道路施工（離線資料，Demo）' }
];
