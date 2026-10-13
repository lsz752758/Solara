/* Solara 音频播放修复补丁 (2026-10-13)
 * 1. 网易云/酷我音频统一走站内 /proxy 代理，避免浏览器直连被防盗链或网络抖动卡住
 * 2. waitForAudioReady 增加 15 秒超时，不再无限转圈
 * 加载顺序：在 js/index.js 之后引入，覆盖同名全局函数
 */
(function () {
  'use strict';

  // --- 1. 音频地址走站内代理 ---
  window.buildAudioProxyUrl = function (url) {
    if (!url || typeof url !== 'string') return url;
    try {
      var parsedUrl = new URL(url, window.location.href);
      if (/(^|\.)(kuwo\.cn|music\.126\.net)$/i.test(parsedUrl.hostname)) {
        return '/proxy?target=' + encodeURIComponent(parsedUrl.toString());
      }
      return parsedUrl.toString();
    } catch (e) {
      if (window.console) console.warn('无法解析音频地址，跳过代理', e);
      return url;
    }
  };

  // --- 2. 音频就绪等待加超时 ---
  window.waitForAudioReady = function (player, timeoutMs) {
    if (!player) return Promise.resolve();
    if (player.readyState >= 1) return Promise.resolve();
    timeoutMs = timeoutMs || 15000;
    return new Promise(function (resolve, reject) {
      var timer = null;
      function cleanup() {
        if (timer) clearTimeout(timer);
        player.removeEventListener('loadedmetadata', onLoaded);
        player.removeEventListener('error', onError);
      }
      function onLoaded() { cleanup(); resolve(); }
      function onError() { cleanup(); reject(new Error('音频加载失败')); }
      function onTimeout() { cleanup(); reject(new Error('音频加载超时(15秒)，请检查网络后重试')); }
      timer = setTimeout(onTimeout, timeoutMs);
      player.addEventListener('loadedmetadata', onLoaded, { once: true });
      player.addEventListener('error', onError, { once: true });
    });
  };

  // --- 3. 歌词加载防串：fetch 返回后确认仍是当前歌曲才更新显示 ---
  window.loadLyrics = async function (song) {
    try {
      var lyricUrl = window.API.getLyric(song);
      if (window.debugLog) window.debugLog('获取歌词URL: ' + lyricUrl);

      var lyricData = await window.API.fetchJson(lyricUrl);

      // 关键修复：返回时如果已切歌，丢弃旧歌词，不覆盖显示
      if (window.state && window.state.currentSong !== song) {
        if (window.debugLog) window.debugLog('歌词已过期（切歌），丢弃');
        return;
      }

      if (lyricData && lyricData.lyric) {
        window.parseLyrics(lyricData.lyric);
        window.dom.lyrics.classList.remove('empty');
        window.dom.lyrics.dataset.placeholder = 'default';
        if (window.debugLog) window.debugLog('歌词加载成功: ' + window.state.lyricsData.length + ' 行');
      } else {
        window.setLyricsContentHtml('<div>暂无歌词</div>');
        window.dom.lyrics.classList.add('empty');
        window.dom.lyrics.dataset.placeholder = 'message';
        window.state.lyricsData = [];
        window.state.currentLyricLine = -1;
        if (window.debugLog) window.debugLog('歌词加载失败: 无歌词数据');
      }
    } catch (error) {
      if (window.console) console.error('加载歌词失败:', error);
      // 出错时同样确认未切歌再显示错误态
      if (window.state && window.state.currentSong !== song) return;
      window.setLyricsContentHtml('<div>歌词加载失败</div>');
      window.dom.lyrics.classList.add('empty');
      window.dom.lyrics.dataset.placeholder = 'message';
      window.state.lyricsData = [];
      window.state.currentLyricLine = -1;
      if (window.debugLog) window.debugLog('歌词加载失败: ' + error);
    }
  };

  if (window.console) console.log('[audio-fix] 音频代理补丁已加载（含歌词防串修复）');
})();
