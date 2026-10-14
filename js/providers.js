/* Provider abstraction（規格 §0）：UI 只認介面，不寫死任何外部 API。 */
(function () {
  const A = window.AIGPS;
  const CONTRACT = {
    location: ['start', 'stop'], map: ['getTile'], routing: ['calculate', 'reroute'],
    search: ['query', 'nearby'], traffic: ['getEvents'], weather: ['getCurrent'],
    parking: ['nearby'], ai: ['parse'], lanes: ['forManeuver'], alerts: ['getAlerts'], media: ['play', 'pause', 'next', 'prev', 'state'], phone: ['dial', 'state'], notifications: ['notify']
  };
  const reg = {};
  A.Providers = {
    register(kind, impl) {
      if (!CONTRACT[kind]) throw new Error('未知 Provider 類型：' + kind);
      const miss = CONTRACT[kind].filter(m => typeof impl[m] !== 'function');
      if (miss.length) throw new Error(kind + ' 缺少方法：' + miss.join(', '));
      reg[kind] = impl; A.Log.info('Provider 註冊：' + kind, impl.name);
    },
    get: kind => reg[kind] || null,
    list: () => Object.keys(CONTRACT).map(k => ({ kind: k, name: reg[k] && reg[k].name, isDemo: !!(reg[k] && reg[k].isDemo) }))
  };
})();
