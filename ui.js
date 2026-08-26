/* =====================================================================
 * ui.js — 界面状态机（DOM 覆盖层）
 *   屏幕：loading / menu / char / level / settings / pause / results / gallery
 *   组件：HUD / 技能冷却 / 成就弹窗 / 提示条 / 确认框 / Boss 出场 CG
 *   所有屏幕由 JS 动态构建，便于单文件内联
 * ===================================================================== */
(function (TG) {
  'use strict';

  // 构造一个带 sci-fi 样式的按钮
  function btn(label, sub, onClick) {
    const b = document.createElement('button');
    b.className = 'tg-btn';
    const s1 = document.createElement('span'); s1.className = 'tg-btn-label'; s1.textContent = label;
    b.appendChild(s1);
    if (sub) { const s2 = document.createElement('span'); s2.className = 'tg-btn-sub'; s2.textContent = sub; b.appendChild(s2); }
    b.addEventListener('mouseenter', () => TG.audio.sfxHover());
    b.addEventListener('click', () => { TG.audio.sfxClick(); onClick && onClick(); });
    return b;
  }

  class UI {
    constructor(game) {
      this.game = game;
      this.root = document.getElementById('ui-root');
      this.screens = {};
      this.hudEl = null;
      this.toastT = 0;
      this._build();
    }

    // ---------- 构建所有屏幕 ----------
    _build() {
      this._css(); // 注入少量动态样式（主体样式在 style.css）
      this._buildLoading();
      this._buildMenu();
      this._buildChar();
      this._buildMode();
      this._buildLevel();
      this._buildTutorial();
      this._buildSettings();
      this._buildPause();
      this._buildResults();
      this._buildGallery();
      this._buildHUD();
      this._buildToasts();
      this._buildConfirm();
      this._buildBossCG();
    }

    _css() { /* 主样式已在 style.css，此处留空占位 */ }

    _screen(id, cls) {
      const d = document.createElement('div');
      d.className = 'screen ' + (cls || '');
      d.id = 'screen-' + id;
      this.root.appendChild(d);
      this.screens[id] = d;
      return d;
    }

    // ---- Loading ----
    _buildLoading() {
      const s = this._screen('loading');
      s.innerHTML = `
        <div class="load-wrap">
          <div class="load-ring"></div>
          <h1 class="game-title">坦克大战 <span class="sub">星际守护者</span></h1>
          <div class="load-bar"><i id="load-fill"></i></div>
          <p class="load-tip" id="load-tip">初始化武器系统…</p>
        </div>`;
    }

    // ---- 主菜单 ----
    _buildMenu() {
      const s = this._screen('menu');
      s.innerHTML = `
        <div class="meteor-layer" id="meteor-layer"></div>
        <div class="menu-bg-glow"></div>
        <h1 class="game-title big">坦克大战<span class="sub">星际守护者</span></h1>
        <p class="game-tagline">深空防线 · 霓虹机甲 · 守护星河</p>
        <div class="menu-btns" id="menu-btns"></div>
        <div class="menu-foot" id="menu-foot"></div>`;
      const box = s.querySelector('#menu-btns');
      box.appendChild(btn('开始游戏', 'START', () => this.game.go('char')));
      box.appendChild(btn('游戏简介', 'TUTORIAL', () => this.game.go('tutorial')));
      box.appendChild(btn('勋章展馆', 'TROPHIES', () => this.game.go('gallery')));
      box.appendChild(btn('设置', 'OPTIONS', () => this.game.go('settings')));
      box.appendChild(btn('退出', 'QUIT', () => this._confirmExit()));
      s.querySelector('#menu-foot').textContent = `最高分：${this.game.bestScore}  ·  勋章：${this.game.ach.count()}/${this.game.ach.all().length}`;
    }
    _confirmExit() {
      this.showConfirm('退出游戏？（可关闭标签页）', '回到主菜单', '取消', () => { /* nothing */ });
    }

    // ---- 角色选择 ----
    _buildChar() {
      const s = this._screen('char');
      s.innerHTML = `
        <h2 class="screen-title">选择你的战车</h2>
        <p class="screen-hint">单击选中 · 双击确认</p>
        <div class="char-grid" id="char-grid"></div>
        <div class="screen-actions" id="char-actions"></div>`;
      this._refreshChars();
      const act = s.querySelector('#char-actions');
      act.appendChild(btn('返回', 'BACK', () => this.game.go('menu')));
      act.appendChild(btn('下一步 ▶ 选择模式', 'NEXT', () => this.game.go('mode')));
    }
    _refreshChars() {
      const grid = this.screens.char.querySelector('#char-grid');
      grid.innerHTML = '';
      TG.CHARS.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'char-card';
        if (this.game.selectedChar === c.id) card.classList.add('selected');
        const bars = this._statBars(c);
        card.innerHTML = `
          <div class="char-avatar" style="--cc:${c.color};--ca:${c.accent}"><canvas width="120" height="120"></canvas></div>
          <h3>${c.name}</h3>
          <p class="char-title">${c.title}</p>
          <span class="char-tag">${c.tag}</span>
          <div class="char-stats">${bars}</div>
          <p class="char-desc">${c.desc}</p>`;
        card.addEventListener('mouseenter', () => TG.audio.sfxHover());
        // 单击：仅选中角色（不跳转）
        card.addEventListener('click', () => {
          TG.audio.sfxClick();
          this.game.selectedChar = c.id;
          this._refreshChars();
        });
        // 双击：选中角色并跳转到模式选择
        card.addEventListener('dblclick', () => {
          TG.audio.sfxClick();
          this.game.selectedChar = c.id;
          this.game.go('mode');
        });
        grid.appendChild(card);
        this._drawAvatar(card.querySelector('canvas'), c);
      });
    }
    _statBars(c) {
      const stat = (label, val, max, color) => `
        <div class="stat"><span>${label}</span><div class="bar"><i style="width:${(val / max) * 100}%;background:${color}"></i></div></div>`;
      return stat('生命', c.hp, 160, '#ff5a8a') + stat('速度', c.speed, 240, '#7cff8a') +
        stat('火力', c.dmg, 26, '#ffb13a') + stat('射速', 1 / c.fireCd, 6, '#3ad1ff');
    }
    _drawAvatar(cv, c) {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 120, 120);
      const t = performance.now() / 1000;
      ctx.save(); ctx.translate(60, 64); ctx.rotate(t * 0.4);
      ctx.shadowColor = c.color; ctx.shadowBlur = 16;
      ctx.fillStyle = c.color;
      ctx.fillRect(-22, -16, 44, 32);
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TG.TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(60, 64); ctx.rotate(-Math.PI / 2 + Math.sin(t) * 0.2);
      ctx.fillStyle = c.accent; ctx.fillRect(0, -3, 36, 6);
      ctx.restore();
      // 不断刷新
      if (!cv._raf) {
        const loop = () => { this._drawAvatarFrame(cv, c); cv._raf = requestAnimationFrame(loop); };
        cv._raf = requestAnimationFrame(loop);
      }
    }
    _drawAvatarFrame(cv, c) {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 120, 120);
      const t = performance.now() / 1000;
      ctx.save(); ctx.translate(60, 66);
      ctx.fillStyle = '#16243a'; ctx.fillRect(-30, -20, 60, 8); ctx.fillRect(-30, 12, 60, 8);
      ctx.save(); ctx.rotate(t * 0.4);
      ctx.shadowColor = c.color; ctx.shadowBlur = 14; ctx.fillStyle = c.color;
      ctx.fillRect(-22, -14, 44, 28);
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TG.TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.rotate(-Math.PI / 2 + Math.sin(t) * 0.25);
      ctx.fillStyle = c.accent; ctx.shadowColor = c.accent; ctx.shadowBlur = 10;
      ctx.fillRect(0, -3, 34, 6); ctx.shadowBlur = 0;
      ctx.restore();
      ctx.restore();
    }

    // ---- 模式选择 ----
    _buildMode() {
      const s = this._screen('mode');
      s.innerHTML = `
        <h2 class="screen-title">选择游戏模式</h2>
        <div class="mode-grid" id="mode-grid"></div>
        <div class="screen-actions" id="mode-actions"></div>`;
      const grid = s.querySelector('#mode-grid');
      const MODES = [
        { id: 'single', name: '单人模式', desc: '独自迎战，守护星河。', tag: '1P', icon: '🎮' },
        { id: 'coop', name: '双人合作', desc: '两名玩家同阵营，共同对抗AI敌人通关。', tag: '2P COOP', icon: '🤝' },
        { id: 'pk', name: '双人对决', desc: '两名玩家互相对抗，击杀对方获分，比积分定胜负。', tag: '2P PK', icon: '⚔' },
      ];
      MODES.forEach((m) => {
        const card = document.createElement('div');
        card.className = 'mode-card';
        if (this.game.gameMode === m.id) card.classList.add('selected');
        card.innerHTML = `
          <div class="mode-icon">${m.icon}</div>
          <h3>${m.name}</h3>
          <span class="mode-tag">${m.tag}</span>
          <p>${m.desc}</p>`;
        card.addEventListener('mouseenter', () => TG.audio.sfxHover());
        card.addEventListener('click', () => {
          TG.audio.sfxClick();
          this.game.gameMode = m.id;
          this._refreshModes();
        });
        grid.appendChild(card);
      });
      this._refreshModes();
      const act = s.querySelector('#mode-actions');
      act.appendChild(btn('返回', 'BACK', () => this.game.go('char')));
      act.appendChild(btn('下一步 ▶ 选择难度', 'NEXT', () => this.game.go('level')));
    }
    _refreshModes() {
      const grid = this.screens.mode.querySelector('#mode-grid');
      if (!grid) return;
      const modes = ['single', 'coop', 'pk'];
      [...grid.children].forEach((card, i) => {
        card.classList.toggle('selected', this.game.gameMode === modes[i]);
      });
    }

    // ---- 关卡/难度选择 ----
    _buildLevel() {
      const s = this._screen('level');
      s.innerHTML = `
        <h2 class="screen-title">选择战线难度</h2>
        <div class="level-grid" id="level-grid"></div>
        <div class="screen-actions" id="level-actions"></div>`;
      const grid = s.querySelector('#level-grid');
      const LEVELS = [
        { id: 'easy', name: '巡弋战线', desc: '敌人稀少，节奏舒缓，适合热身。', tag: '★', grow: 0.6 },
        { id: 'normal', name: '标准防线', desc: '均衡的紧张度成长，推荐。', tag: '★★', grow: 1.0 },
        { id: 'hard', name: '深渊突袭', desc: '敌人凶猛密集，弹幕如雨。', tag: '★★★', grow: 1.5 },
        { id: 'inferno', name: '炼狱终局', desc: '极限挑战，唯有守护者可存。', tag: '★★★★', grow: 2.0 },
      ];
      LEVELS.forEach((l) => {
        const card = document.createElement('div');
        card.className = 'level-card';
        if (this.game.selectedLevel === l.id) card.classList.add('selected');
        card.innerHTML = `
          <div class="level-thumb"><canvas width="180" height="100"></canvas><span class="level-tag">${l.tag}</span></div>
          <h3>${l.name}</h3>
          <p>${l.desc}</p>`;
        card.addEventListener('mouseenter', () => TG.audio.sfxHover());
        card.addEventListener('click', () => {
          TG.audio.sfxClick();
          this.game.selectedLevel = l.id;
          this.game.levelGrow = l.grow;
          this._refreshLevels();
        });
        grid.appendChild(card);
      });
      this._refreshLevels();
      const act = s.querySelector('#level-actions');
      act.appendChild(btn('返回', 'BACK', () => this.game.go('mode')));
      act.appendChild(btn('出击！', 'DEPLOY', () => this.game.startBattle()));
    }
    _refreshLevels() {
      const grid = this.screens.level.querySelector('#level-grid');
      [...grid.children].forEach((card, i) => {
        const lv = ['easy', 'normal', 'hard', 'inferno'][i];
        card.classList.toggle('selected', this.game.selectedLevel === lv);
        const cv = card.querySelector('canvas');
        if (!cv._raf) {
          const loop = () => { this._drawLevelThumb(cv, i); cv._raf = requestAnimationFrame(loop); };
          cv._raf = requestAnimationFrame(loop);
        }
      });
    }
    _drawLevelThumb(cv, i) {
      const ctx = cv.getContext('2d');
      const W = 180, H = 100;
      ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);
      const t = performance.now() / 1000;
      const colors = ['#3ad1ff', '#7cff8a', '#ffb13a', '#ff3a6b'];
      const c = colors[i];
      // 星点
      ctx.fillStyle = '#2a3a55';
      for (let k = 0; k < 30; k++) {
        const x = (k * 53 + t * 20) % W, y = (k * 37) % H;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t + k));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
      // 中心机甲轮廓
      ctx.save(); ctx.translate(W / 2, H / 2 + Math.sin(t * 2) * 4);
      ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c;
      ctx.fillRect(-16, -12, 32, 24);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TG.TAU); ctx.fill();
      ctx.restore();
    }

    // ---- 游戏简介 / 教程 ----
    _buildTutorial() {
      const s = this._screen('tutorial');
      s.innerHTML = `
        <h2 class="screen-title">游戏简介</h2>
        <div class="tutorial-wrap">
          <div class="tut-section">
            <h3>🎮 目标</h3>
            <p>单人/合作：击败Boss守护星河，通过波次推进最终防线。</p>
            <p>PK对决：两名玩家互相对抗，击杀对方获分，比积分定胜负。</p>
          </div>
          <div class="tut-section">
            <h3>🕹 移动</h3>
            <div class="tut-keys">
              <div class="tut-key-group"><span class="tut-label">玩家1</span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
              <div class="tut-key-group"><span class="tut-label">玩家2</span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></div>
            </div>
          </div>
          <div class="tut-section">
            <h3>🔫 射击</h3>
            <div class="tut-keys">
              <div class="tut-key-group"><span class="tut-label">玩家1</span><kbd>空格</kbd><kbd>鼠标左键</kbd></div>
              <div class="tut-key-group"><span class="tut-label">玩家2</span><kbd>/</kbd><kbd>Numpad0</kbd></div>
              <div class="tut-key-group"><span class="tut-label">自动射击</span><kbd>F</kbd> 开关</div>
            </div>
            <p class="tut-note">P1 使用鼠标瞄准，P2 自动瞄准最近敌人/PK对手。</p>
          </div>
          <div class="tut-section">
            <h3>⚡ 技能</h3>
            <div class="tut-keys">
              <div class="tut-key-group"><span class="tut-label">技能</span><span class="tut-col">护盾</span><span class="tut-col">清屏</span><span class="tut-col">投降</span></div>
              <div class="tut-key-group"><span class="tut-label">玩家1</span><kbd>Q</kbd><kbd>E</kbd><kbd>R</kbd></div>
              <div class="tut-key-group"><span class="tut-label">玩家2</span><kbd>.</kbd><kbd>,</kbd><kbd>右Ctrl</kbd></div>
            </div>
          </div>
          <div class="tut-section">
            <h3>⏸ 暂停</h3>
            <p><kbd>Esc</kbd> 或 <kbd>P</kbd> 暂停游戏</p>
          </div>
          <div class="tut-section">
            <h3>🤝 双人模式总览</h3>
            <p>· <b>合作模式</b>：P1（WASD+鼠标）与 P2（方向键）同阵营对抗AI。</p>
            <p>· <b>PK模式</b>：双方互相对抗，子弹可伤害对方，击杀对方获胜。</p>
            <p>· 双人模式下左下角显示 P1 信息，右下角显示 P2 信息。</p>
          </div>
        </div>
        <div class="screen-actions" id="tut-actions"></div>`;
      s.querySelector('#tut-actions').appendChild(btn('返回', 'BACK', () => this.game.go('menu')));
    }

    // ---- 设置 ----
    _buildSettings() {
      const s = this._screen('settings');
      s.innerHTML = `
        <h2 class="screen-title">设置</h2>
        <div class="settings">
          <div class="set-row"><span>音量</span><input type="range" id="set-vol" min="0" max="1" step="0.05"></div>
          <div class="set-row"><span>背景音乐</span><label class="switch"><input type="checkbox" id="set-music"><i></i></label></div>
          <div class="set-row"><span>音效</span><label class="switch"><input type="checkbox" id="set-sfx"><i></i></label></div>
          <div class="set-row"><span>自动射击</span><label class="switch"><input type="checkbox" id="set-auto"><i></i></label></div>
        </div>
        <div class="screen-actions" id="set-actions"></div>`;
      const vol = s.querySelector('#set-vol'); vol.value = this.game.audio.volume;
      vol.addEventListener('input', () => this.game.audio.setVolume(parseFloat(vol.value)));
      const mus = s.querySelector('#set-music'); mus.checked = this.game.audio.musicOn;
      mus.addEventListener('change', () => { this.game.audio.musicOn = mus.checked; if (!mus.checked) this.game.audio.stopMusic(); else this.game.resumeMenuMusic(); });
      const sfx = s.querySelector('#set-sfx'); sfx.checked = this.game.audio.sfxOn;
      sfx.addEventListener('change', () => { this.game.audio.sfxOn = sfx.checked; });
      const aut = s.querySelector('#set-auto'); aut.checked = this.game.autoFireDefault;
      aut.addEventListener('change', () => { this.game.autoFireDefault = aut.checked; if (this.game.player) this.game.player.autoFire = aut.checked; });
      s.querySelector('#set-actions').appendChild(btn('返回', 'BACK', () => this.game.go(this.game.prevSettings || 'menu')));
    }

    // ---- 暂停 ----
    _buildPause() {
      const s = this._screen('pause');
      s.innerHTML = `<h2 class="screen-title">已暂停</h2><div class="menu-btns" id="pause-btns"></div>`;
      const b = s.querySelector('#pause-btns');
      b.appendChild(btn('继续游戏', 'RESUME', () => this.game.togglePause(false)));
      b.appendChild(btn('重新开始', 'RESTART', () => this.game.startBattle()));
      b.appendChild(btn('返回主菜单', 'MENU', () => { this.game.endBattle(false); this.game.go('menu'); }));
      b.appendChild(btn('设置', 'OPTIONS', () => { this.game.prevSettings = 'pause'; this.game.go('settings'); }));
    }

    // ---- 结算 ----
    _buildResults() {
      const s = this._screen('results');
      s.innerHTML = `
        <div class="res-wrap" id="res-wrap"></div>
        <div class="screen-actions" id="res-actions"></div>`;
    }
    showResults(win) {
      const wrap = this.screens.results.querySelector('#res-wrap');
      const g = this.game;
      const newAch = g.ach.all().filter((d) => g.ach.isUnlocked(d.id) && g._newAch.has(d.id));
      // PK 模式特殊结算
      if (g.gameMode === 'pk') {
        const winner = g._pkWinner;
        const winText = winner === 0 ? 'P1 胜利' : 'P2 胜利';
        wrap.innerHTML = `
          <div class="res-banner ${win ? 'win' : 'lose'}">${winText}</div>
          <div class="res-stats">
            <div><span>P1 得分</span><b>${g.score}</b></div>
            <div><span>P2 得分</span><b>${g.score2}</b></div>
            <div><span>最高分</span><b>${g.bestScore}</b></div>
          </div>
          ${newAch.length ? `<div class="res-ach"><h4>获得勋章</h4>${newAch.map((d) => `<div class="res-ach-item"><span class="ach-ico">${d.icon}</span><div><b>${d.name}</b><small>${g.ach.unlocked[d.id]}</small></div></div>`).join('')}</div>` : ''}`;
      } else {
        wrap.innerHTML = `
          <div class="res-banner ${win ? 'win' : 'lose'}">${win ? '胜利' : '防线失守'}</div>
          <div class="res-stats">
            <div><span>最终得分</span><b>${g.score}</b></div>
            <div><span>最高分</span><b>${g.bestScore}</b></div>
            <div><span>击杀数</span><b>${g.stats.kills}</b></div>
            <div><span>精英击杀</span><b>${g.stats.eliteKills}</b></div>
            <div><span>最高连击</span><b>${g.stats.maxCombo}</b></div>
            <div><span>波次</span><b>${g.wave}</b></div>
          </div>
          ${newAch.length ? `<div class="res-ach"><h4>获得勋章</h4>${newAch.map((d) => `<div class="res-ach-item"><span class="ach-ico">${d.icon}</span><div><b>${d.name}</b><small>${g.ach.unlocked[d.id]}</small></div></div>`).join('')}</div>` : ''}`;
      }
      const act = this.screens.results.querySelector('#res-actions');
      act.innerHTML = '';
      act.appendChild(btn('再来一局', 'RETRY', () => g.startBattle()));
      act.appendChild(btn('返回菜单', 'MENU', () => { g.go('menu'); }));
    }

    // ---- 勋章展馆（时间轴） ----
    _buildGallery() {
      const s = this._screen('gallery');
      s.innerHTML = `<h2 class="screen-title">勋章展馆 <span class="ach-count" id="ach-count"></span></h2><div class="gallery-scroll" id="gallery-scroll"></div><div class="screen-actions" id="ach-actions"></div>`;
      s.querySelector('#ach-actions').appendChild(btn('返回', 'BACK', () => this.game.go('menu')));
    }
    refreshGallery() {
      const wrap = this.screens.gallery.querySelector('#gallery-scroll');
      wrap.innerHTML = '';
      const a = this.game.ach;
      const unlocked = a.unlockedSorted();  // 按时间排序的已解锁成就
      const locked = a.lockedList();        // 未解锁成就

      // 时间轴区域
      let timelineHtml = '<div class="timeline"><div class="timeline-line"></div>';
      if (unlocked.length === 0) {
        timelineHtml += '<div class="timeline-empty">暂无已解锁勋章，开始游戏获取吧！</div>';
      } else {
        unlocked.forEach((item) => {
          timelineHtml += `
            <div class="timeline-node">
              <div class="timeline-dot"></div>
              <div class="timeline-card">
                <div class="ach-ico">${item.def.icon}</div>
                <div class="ach-info">
                  <b>${item.def.name}</b>
                  <p>${item.def.desc}</p>
                  <small>获得于 ${item.time}</small>
                </div>
              </div>
            </div>`;
        });
      }
      timelineHtml += '</div>';

      // 未解锁区域
      let lockedHtml = '';
      if (locked.length > 0) {
        lockedHtml = '<div class="ach-locked-section"><h3 class="locked-title">未解锁</h3><div class="ach-locked-grid">';
        locked.forEach((d) => {
          lockedHtml += `
            <div class="ach-card locked">
              <div class="ach-ico lock">🔒</div>
              <div class="ach-info"><b>${d.name}</b><p>${d.desc}</p><small>— 未解锁 —</small></div>
            </div>`;
        });
        lockedHtml += '</div></div>';
      }

      wrap.innerHTML = timelineHtml + lockedHtml;
      this.screens.gallery.querySelector('#ach-count').textContent = `${a.count()}/${a.all().length}`;
    }

    // ---- HUD ----
    _buildHUD() {
      const h = document.createElement('div'); h.className = 'hud'; h.id = 'hud';
      h.innerHTML = `
        <div class="hud-top">
          <div class="hud-score"><span>分数</span><b id="hud-score">0</b></div>
          <div class="hud-wave"><span>关卡</span><b id="hud-wave">1·1</b></div>
          <div class="hud-tension"><span>紧张度</span><div class="t-bar"><i id="hud-tension"></i></div></div>
          <div class="hud-best"><span>最高</span><b id="hud-best">0</b></div>
        </div>
        <div class="hud-bot" id="hud-bot">
          <div class="hud-player-block p1" id="hud-p1">
            <div class="hud-player-label">P1</div>
            <div class="hud-hp"><span>护甲</span><div class="hp-bar"><i id="hud-hp"></i><small id="hud-hp-txt"></small></div></div>
            <div class="hud-skills">
              <div class="skill" id="sk-shield"><span class="sk-key">Q</span><span class="sk-name">护盾</span><div class="sk-cd"></div></div>
              <div class="skill" id="sk-clear"><span class="sk-key">E</span><span class="sk-name">清屏</span><div class="sk-cd"></div></div>
              <div class="skill" id="sk-surrender"><span class="sk-key">R</span><span class="sk-name">投降</span><div class="sk-cd"></div></div>
            </div>
          </div>
          <div class="hud-player-block p2" id="hud-p2">
            <div class="hud-player-label">P2</div>
            <div class="hud-hp"><span>护甲</span><div class="hp-bar"><i id="hud-hp2"></i><small id="hud-hp2-txt"></small></div></div>
            <div class="hud-skills">
              <div class="skill" id="sk-shield2"><span class="sk-key">.</span><span class="sk-name">护盾</span><div class="sk-cd"></div></div>
              <div class="skill" id="sk-clear2"><span class="sk-key">,</span><span class="sk-name">清屏</span><div class="sk-cd"></div></div>
              <div class="skill" id="sk-surrender2"><span class="sk-key">右Ctrl</span><span class="sk-name">投降</span><div class="sk-cd"></div></div>
            </div>
          </div>
          <div class="hud-combo" id="hud-combo"></div>
        </div>`;
      this.root.appendChild(h); this.hudEl = h;
      // P1 技能点击
      h.querySelector('#sk-shield').addEventListener('click', () => this.game.player && this.game.player.skillShield());
      h.querySelector('#sk-clear').addEventListener('click', () => this.game.player && this.game.player.skillClear());
      h.querySelector('#sk-surrender').addEventListener('click', () => this.game.trySurrender());
      // P2 技能点击
      h.querySelector('#sk-shield2').addEventListener('click', () => this.game.player2 && this.game.player2.skillShield());
      h.querySelector('#sk-clear2').addEventListener('click', () => this.game.player2 && this.game.player2.skillClear());
      h.querySelector('#sk-surrender2').addEventListener('click', () => this.game._p2Surrender && this.game._p2Surrender());
    }
    updateHUD() {
      const g = this.game, p = g.player; if (!p) return;
      const $ = (id) => this.hudEl.querySelector(id);
      const isDual = g.gameMode === 'coop' || g.gameMode === 'pk';

      // 顶部信息
      if (g.gameMode === 'pk') {
        $('#hud-score').textContent = 'P1:' + g.score + '  P2:' + g.score2;
        $('#hud-wave').textContent = 'PK';
        $('#hud-tension').style.width = '0%';
      } else {
        $('#hud-score').textContent = g.score;
        $('#hud-wave').textContent = '第' + g.level + '关 · ' + (g.wave + 1) + '波';
        $('#hud-tension').style.width = (g.tension * 100).toFixed(0) + '%';
      }
      $('#hud-best').textContent = g.bestScore;

      // P1 信息
      this._updatePlayerHUD(p, '#hud-hp', '#hud-hp-txt', '#sk-shield', '#sk-clear');

      // P2 信息（双人模式）
      const p2Block = $('#hud-p2');
      if (isDual && g.player2) {
        p2Block.style.display = 'flex';
        this._updatePlayerHUD(g.player2, '#hud-hp2', '#hud-hp2-txt', '#sk-shield2', '#sk-clear2');
      } else {
        p2Block.style.display = 'none';
      }

      // 连击
      const cb = $('#hud-combo'); if (g.combo > 1) { cb.textContent = g.combo + ' COMBO'; cb.style.opacity = 1; } else cb.style.opacity = 0;
    }
    // 更新单个玩家的 HUD 信息
    _updatePlayerHUD(p, hpSel, hpTxtSel, shieldSel, clearSel) {
      const $ = (id) => this.hudEl.querySelector(id);
      const hpR = Math.max(0, p.hp / p.maxHp);
      $(hpSel).style.width = (hpR * 100) + '%';
      $(hpTxtSel).textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
      this._skillCD(shieldSel, p.skShieldCd, p.skShieldMax, p.shield > 0 ? '激活' : '');
      this._skillCD(clearSel, p.skClearCd, p.skClearMax);
    }
    _skillCD(sel, cd, max, active) {
      const el = this.hudEl.querySelector(sel);
      if (!el) return;
      const fill = el.querySelector('.sk-cd');
      const r = cd > 0 ? cd / max : 0;
      fill.style.height = (r * 100) + '%';
      el.classList.toggle('cooling', cd > 0);
      el.classList.toggle('active', !!active);
    }

    // ---- 提示条 / 成就弹窗 / 确认框 ----
    _buildToasts() {
      const t = document.createElement('div'); t.className = 'toast'; t.id = 'toast'; this.root.appendChild(t);
      const at = document.createElement('div'); at.className = 'ach-toast'; at.id = 'ach-toast'; this.root.appendChild(at);
    }
    toast(msg) {
      const t = this.hudEl ? this.root.querySelector('#toast') : null;
      if (!t) return;
      t.textContent = msg; t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove('show'), 1600);
    }
    showAchToast(item) {
      const t = this.root.querySelector('#ach-toast');
      t.innerHTML = `<div class="ach-toast-ico">${item.def.icon}</div><div><b>解锁勋章</b><p>${item.def.name}</p><small>${item.time}</small></div>`;
      t.classList.add('show');
      clearTimeout(this._achT);
      this._achT = setTimeout(() => t.classList.remove('show'), 3200);
    }

    _buildConfirm() {
      const c = document.createElement('div'); c.className = 'confirm'; c.id = 'confirm';
      c.innerHTML = `<div class="confirm-box"><h3 id="cf-title"></h3><div class="confirm-btns" id="cf-btns"></div></div>`;
      this.root.appendChild(c);
    }
    showConfirm(title, yesLabel, noLabel, onYes, onNo) {
      const c = this.root.querySelector('#confirm');
      c.querySelector('#cf-title').textContent = title;
      const box = c.querySelector('#cf-btns'); box.innerHTML = '';
      box.appendChild(btn(yesLabel || '确认', null, () => { c.classList.remove('show'); onYes && onYes(); }));
      box.appendChild(btn(noLabel || '取消', null, () => { c.classList.remove('show'); onNo && onNo(); }));
      c.classList.add('show');
    }

    // ---- Boss 出场 CG ----
    _buildBossCG() {
      const c = document.createElement('div'); c.className = 'boss-cg'; c.id = 'boss-cg';
      c.innerHTML = `
        <div class="boss-cg-flash"></div>
        <div class="boss-cg-lines"></div>
        <div class="boss-cg-text">
          <p class="bcg-warn">⚠ WARNING ⚠</p>
          <h2 class="bcg-name"></h2>
          <p class="bcg-title"></p>
        </div>`;
      this.root.appendChild(c);
    }
    showBossCG(def, onDone) {
      const c = this.root.querySelector('#boss-cg');
      c.querySelector('.bcg-name').textContent = def.name;
      c.querySelector('.bcg-title').textContent = def.title;
      c.classList.add('show');
      TG.audio.sfxBossRoar();
      clearTimeout(this._bcgT);
      this._bcgT = setTimeout(() => { c.classList.remove('show'); onDone && onDone(); }, 2600);
    }

    // ---- 屏幕切换（带过渡） ----
    show(name) {
      Object.values(this.screens).forEach((s) => s.classList.remove('show'));
      if (this.screens[name]) this.screens[name].classList.add('show');
      const isBattle = name === 'battle';
      this.hudEl.classList.toggle('show', isBattle);
      if (name === 'gallery') this.refreshGallery();
      if (name === 'menu') { this._buildMenuFoot(); this._startMeteors(); }
      else this._stopMeteors();
      if (name === 'char') this._refreshChars();
      if (name === 'mode') this._refreshModes();
    }
    _buildMenuFoot() {
      const f = this.screens.menu.querySelector('#menu-foot');
      if (f) f.textContent = `最高分：${this.game.bestScore}  ·  勋章：${this.game.ach.count()}/${this.game.ach.all().length}`;
    }

    // ---- 流星动画管理 ----
    _startMeteors() {
      const layer = this.screens.menu.querySelector('#meteor-layer');
      if (!layer) return;
      this._stopMeteors(); // 先清理旧的定时器
      const spawn = () => {
        if (this.game.state !== 'menu') return; // 仅主菜单生成
        if (layer.children.length < 4) {        // 限制同屏流星数量
          const m = document.createElement('div');
          m.className = 'meteor';
          const W = window.innerWidth, H = window.innerHeight;
          // 随机起始位置：从屏幕右上区域进入
          m.style.left = (W * 0.35 + Math.random() * W * 0.65) + 'px';
          m.style.top = (-30 - Math.random() * H * 0.15) + 'px';
          // 随机角度：向左下方飞（120°~160°）
          const rot = 120 + Math.random() * 40;
          // 飞行距离：足够飞出屏幕
          const dist = Math.max(W, H) * 1.6;
          m.style.setProperty('--rot', rot + 'deg');
          m.style.setProperty('--dist', dist + 'px');
          // 随机时长（0.7s~1.5s），随机大小
          const dur = 700 + Math.random() * 800;
          const scale = 0.7 + Math.random() * 0.8;
          m.style.width = (160 * scale) + 'px';
          m.style.animation = `meteorStreak ${dur}ms linear forwards`;
          layer.appendChild(m);
          m.addEventListener('animationend', () => m.remove());
        }
        // 随机间隔生成下一颗（1.2s~4s）
        this._meteorTimer = setTimeout(spawn, 1200 + Math.random() * 2800);
      };
      // 首颗延迟 300ms
      this._meteorTimer = setTimeout(spawn, 300);
    }
    _stopMeteors() {
      if (this._meteorTimer) { clearTimeout(this._meteorTimer); this._meteorTimer = null; }
      const layer = this.screens.menu && this.screens.menu.querySelector('#meteor-layer');
      if (layer) layer.innerHTML = '';
    }
  }

  TG.UI = UI;
})(window.TG = window.TG || {});
