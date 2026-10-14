/* 裝置能力偵測（Batch 13）：網頁能做什麼、不能做什麼，據實呈現，不假裝。 */
(function () {
  const A = window.AIGPS;
  function caps() {
    const w = window, n = w.navigator || {};
    return { secure: !!w.isSecureContext, mediaSession: 'mediaSession' in n, notification: typeof w.Notification !== 'undefined', notificationPermission: typeof w.Notification !== 'undefined' ? w.Notification.permission : 'unsupported',
      speech: typeof w.speechSynthesis !== 'undefined', serviceWorker: 'serviceWorker' in n, vibrate: 'vibrate' in n, tel: true, controlOtherApps: false, detectRealCalls: false };
  }
  const label = c => [`媒體工作階段 ${c.mediaSession ? '✓' : '✗'}`, `系統通知 ${c.notification ? (c.notificationPermission === 'granted' ? '✓' : '尚未授權') : '✗'}`, `語音合成 ${c.speech ? '✓' : '✗'}`, `撥號（tel:）✓`, `控制其他 App 的音樂 ✗`, `偵測真實來電 ✗`].join('・');
  A.Platform = { caps, label };
})();
