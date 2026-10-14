/* 首頁：依資料包狀態引導（規格 §2：首次啟動 → 資料包檢查 → 完整／不完整／過期） */
(function () {
  const A = window.AIGPS, S = A.State, $ = id => document.getElementById(id);
  /* 純函式：某資料包的最新「正式」版本（不含測試用損壞版） */
  function latestVersion(idx, id) {
    const p = (idx && idx.packages || []).find(x => x.id === id); if (!p) return null;
    return p.versions.filter(v => !v.testOnly).map(v => v.version).sort().pop() || null;
  }
  const VIEW = {
    none: { cls: '', title: '第一次使用：先下載離線資料包', text: '資料包讓搜尋、路線規劃與導航在沒有網路時也能運作。下載並驗證一次後，日常使用不需要網路。', btns: [['downloads.html', '前往下載中心', true]] },
    downloading: { cls: '', title: '資料包下載中', text: '下載完成並通過驗證後，就能離線導航。你可以先到下載中心查看進度。', btns: [['downloads.html', '查看進度', true]] },
    updating: { cls: '', title: '資料包更新中', text: '更新期間仍可使用目前的資料包；驗證通過後才會切換。', btns: [['downloads.html', '查看進度', true]] },
    limited: { cls: 'warn', title: '資料包不完整', text: '缺少必要元件，部分功能無法使用。請重新下載或更新資料包。', btns: [['downloads.html', '前往下載中心', true]] },
    error: { cls: 'warn', title: '資料包有問題', text: '資料包損壞、遺失，或與目前 App 版本不相容。請到下載中心安裝新版資料包；舊版仍保留供回復。', btns: [['downloads.html', '前往下載中心', true]] }
  };
  function render(s) {
    const st = s.offlinePackageStatus, p = s.offlinePackage; let v = VIEW[st];
    if (st === 'ready') v = { cls: 'ok', title: '離線導航就緒', text: `資料包 ${p.id} v${p.version}${p.demo ? '（Demo 資料）' : ''}。搜尋、路線、警示、天氣都可離線使用。`, btns: [['search.html', '搜尋目的地', true], ['navigation.html', '開始導航', false]] };
    if (st === 'error' && p && p.incompatible) v = Object.assign({}, v, { title: '資料包與此 App 不相容', text: `此資料包使用資料格式 v${p.schema}，目前 App 需要 v${A.VERSION.dataSchema}。請到下載中心安裝新版資料包。` });
    $('homeCard').className = 'card hero ' + (v.cls || ''); $('homeTitle').textContent = v.title; $('homeText').textContent = v.text;
    $('homeBtns').innerHTML = v.btns.map(([h, t, pr]) => `<a class="btnlink${pr ? ' primary' : ''}" href="${h}">${t}</a>`).join('');
  }
  let checked = '';
  async function checkUpdate() {
    const s = S.get(), p = s.offlinePackage, el = $('homeUpd'); if (!p || !navigator.onLine || checked === p.version) return; checked = p.version;
    try { const latest = latestVersion(await A.PM.listAvailable(), p.id); el.innerHTML = latest && latest > p.version ? `有新版資料包 v${latest} 可更新（目前 v${p.version}）。<a href="downloads.html">前往更新</a>` : ''; } catch (_) { el.textContent = ''; }
  }
  A.Home = { latestVersion };
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { render(S.get()); checkUpdate(); }, 250);   // 等資料包狀態讀取完成，避免閃爍
    S.subscribe((s, ch) => { if (ch.includes('offlinePackage') || ch.includes('offlinePackageStatus')) { render(s); checkUpdate(); } });
  });
})();
