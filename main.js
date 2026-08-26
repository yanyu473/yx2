/* main.js — 启动入口
 *   - 实例化 Game
 *   - 首次用户交互时初始化音频并播放主菜单 BGM
 */
(function () {
  'use strict';
  function boot() {
    window.TG_GAME = new TG.Game();
    const startAudio = () => {
      TG.audio.init();
      TG.audio.resume();
      if (TG.audio.musicOn && TG_GAME.state === 'menu') TG.audio.playMusic('menu');
    };
    // 浏览器策略：需用户手势后才能播音
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, startAudio, { once: true, passive: true })
    );
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
