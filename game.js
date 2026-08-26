/* =====================================================================
 * game.js — 游戏主类
 *   - 状态机：loading/menu/char/level/settings/battle/pause/results/gallery
 *   - 固定步长游戏循环（固定 1/60s 逻辑 + 可变渲染）
 *   - 波次系统 / 紧张度 / 屏幕震动 / 红屏闪 / 慢动作
 *   - 碰撞检测（圆-圆，分阵营）
 *   - BGM 阶段切换 / 成就轮询 / CG 编排
 * ===================================================================== */
(function (TG) {
  'use strict';

  const STEP = 1 / 60;          // 固定逻辑步长
  const STAR_N = 160;           // 背景星数

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      // 先初始化 UI 依赖的数据，再构造 UI（_build 会读取这些字段）
      this.audio = TG.audio;
      this.ach = new TG.Achievement();
      this.bestScore = TG.store.get('tk_best', 0);
      this.selectedChar = 'guardian';
      this.selectedLevel = 'normal';
      this.levelGrow = 1.0;
      this.autoFireDefault = true;
      this.gameMode = 'single';   // 'single' / 'coop' / 'pk'
      this.player2 = null;
      this.score2 = 0;            // P2 分数（PK模式）
      this.state = 'loading';
      this.prevSettings = 'menu';

      this.ui = new TG.UI(this);

      this.input = new Set();
      this.mouse = { x: 0, y: 0, down: false, active: false };
      this._touch = null;

      this._bindInput();
      this._resize();
      window.addEventListener('resize', () => this._resize());

      this.stars = this._makeStars();
      this.shakeT = 0; this.shakeAmp = 0; this.shakeDur = 0;
      this.redFlashV = 0;
      this.timeScale = 1;
      this._newAch = new Set();
      this._acc = 0; this._last = performance.now();
      this._loop = this._loop.bind(this);
      this._initBattleState();
      this.ui.show('loading');   // 初始显示加载界面
      requestAnimationFrame(this._loop);
    }

    _initBattleState() {
      this.player = null;
      this.player2 = null;
      this.boss = null;
      this.score = 0;
      this.score2 = 0;
      this.wave = 0;
      this.combo = 0; this.comboT = 0;
      this.tension = 0;
      this.spawnT = 0;
      this.waveT = 0;
      this.bossOut = false;
      this.level = 1;             // 当前关卡（1 或 2）
      this.maxLevel = 2;          // 最大关卡数
      this.cg = null;            // 当前 CG 状态
      this.cgT = 0;
      this._pkWinner = null;     // PK模式胜者
      this.stats = { kills: 0, eliteKills: 0, maxCombo: 0, tookDamage: false, shieldUsed: 0, clearUsed: 0, powerups: 0 };
      TG.bullets.clear(); TG.enemies.clear(); TG.powerups.clear(); TG.particles.clear(); TG.floatTexts.clear();
    }

    _makeStars() {
      const a = [];
      for (let i = 0; i < STAR_N; i++) {
        a.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2, s: Math.random() * 1.6 + 0.3 });
      }
      return a;
    }

    // ============== 输入 ==============
    _bindInput() {
      const set = this.input;
      addEventListener('keydown', (e) => {
        // 防止空格/方向键滚动页面
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
        set.add(e.code);
        // 技能快捷键
        if (this.state === 'battle' && this.player) {
          // 玩家1技能
          if (e.code === 'KeyQ') this.player.skillShield();
          if (e.code === 'KeyE') this.player.skillClear();
          if (e.code === 'KeyR') this.trySurrender();
          // 玩家2技能（双人模式）
          if (this.player2 && this.player2.alive) {
            if (e.code === 'Period') this.player2.skillShield();        // 句号(.) 护盾
            if (e.code === 'Comma') this.player2.skillClear();         // 逗号(,) 清屏
            if (e.code === 'ControlRight') this._p2Surrender();        // 右Ctrl 投降
            if (e.code === 'Numpad1' || (e.code === 'Slash' && false)) { /* reserved */ }
          }
          // 通用
          if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause(true);
          if (e.code === 'KeyF') {
            this.player.autoFire = !this.player.autoFire;
            this.toast('P1 自动射击：' + (this.player.autoFire ? '开' : '关'));
            if (this.player2) { this.player2.autoFire = this.player.autoFire; }
          }
        } else {
          if (e.code === 'Escape' && this.state !== 'loading' && this.state !== 'menu') this.go('menu');
        }
      });
      addEventListener('keyup', (e) => set.delete(e.code));

      const cv = this.canvas;
      cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) * (this.W / r.width);
        this.mouse.y = (e.clientY - r.top) * (this.H / r.height);
        this.mouse.active = true;
      });
      cv.addEventListener('mousedown', () => { this.mouse.down = true; this.audio.resume(); });
      addEventListener('mouseup', () => this.mouse.down = false);
      cv.addEventListener('mouseleave', () => { this.mouse.active = false; this.mouse.down = false; });

      // 触摸：左半屏拖拽移动，右半屏瞄准射击
      cv.addEventListener('touchstart', (e) => { this._onTouch(e, 'start'); e.preventDefault(); }, { passive: false });
      cv.addEventListener('touchmove', (e) => { this._onTouch(e, 'move'); e.preventDefault(); }, { passive: false });
      cv.addEventListener('touchend', (e) => { this._onTouch(e, 'end'); e.preventDefault(); }, { passive: false });
    }
    _onTouch(e, phase) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const x = (t.clientX - r.left) * (this.W / r.width);
      const y = (t.clientY - r.top) * (this.H / r.height);
      if (phase === 'start') { this._touch = { x, y, side: x < this.W / 2 ? 'move' : 'aim' }; this.audio.resume(); }
      else if (phase === 'move' && this._touch) { this._touch.x = x; this._touch.y = y; }
      else if (phase === 'end') { this._touch = null; this.mouse.down = false; }
      if (this._touch && this._touch.side === 'aim') { this.mouse.x = x; this.mouse.y = y; this.mouse.active = true; this.mouse.down = true; }
    }

    _resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = window.innerWidth; this.H = window.innerHeight;
      this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
      this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.player) { this.player.W = this.W; this.player.H = this.H; }
      if (this.player2) { this.player2.W = this.W; this.player2.H = this.H; }
    }

    // ============== 状态切换 ==============
    go(state) {
      if (state === 'battle') return; // battle 由 startBattle 处理
      this.state = state;
      this.ui.show(state);
      if (state === 'menu') this.resumeMenuMusic();
      else if (state === 'gallery') this.ui.refreshGallery();
      else if (state === 'settings') { /* 保留 prev */ }
    }
    resumeMenuMusic() { if (this.audio.musicOn) this.audio.playMusic('menu'); }

    // 投降：二次确认
    trySurrender() {
      if (this.state !== 'battle') return;
      this.togglePause(true, true); // 静默暂停（不切屏）
      this.ui.showConfirm('P1 确认投降？本局立即结束并结算。', '确认投降', '继续战斗',
        () => { this.ach.check('surrender', 1); this._finishBattle(false, true); },
        () => { this.togglePause(false); });
    }
    // P2 投降
    _p2Surrender() {
      if (this.state !== 'battle') return;
      this.togglePause(true, true);
      this.ui.showConfirm('P2 确认投降？本局立即结束并结算。', '确认投降', '继续战斗',
        () => { this.ach.check('surrender', 1); this._finishBattle(false, true); },
        () => { this.togglePause(false); });
    }

    togglePause(p, silent) {
      if (this.state !== 'battle' && !silent) return;
      if (p) { this._wasBattle = true; this.state = 'pause'; if (!silent) this.ui.show('pause'); }
      else { this.state = 'battle'; this.ui.show('battle'); }
    }

    startBattle() {
      this.audio.resume();
      this._initBattleState();
      // 根据游戏模式创建玩家
      this.player = new TG.Player(this.selectedChar, this, 0);
      this.player.autoFire = this.autoFireDefault;
      if (this.gameMode === 'coop' || this.gameMode === 'pk') {
        this.player2 = new TG.Player(this.selectedChar, this, 1);
        this.player2.autoFire = this.autoFireDefault;
        // P1 已有 player2 引用时重新设置位置
        this.player.cx = this.W * 0.7; this.player.cy = this.H * 0.78;
      }
      this.state = 'battle';
      this.ui.show('battle');
      this.audio.playMusic('calm');
      if (this.gameMode === 'single') {
        this.toast('战线开启 · ' + this.player.char.name);
      } else if (this.gameMode === 'coop') {
        this.toast('双人合作 · ' + this.player.char.name);
      } else if (this.gameMode === 'pk') {
        this.toast('双人对决 · ' + this.player.char.name);
      }
      this.ach.check('battle_start', 1);
    }

    endBattle(toMenu) {
      this._initBattleState();
      if (toMenu === false) {} // 保留对象清理
      this.audio.stopMusic();
    }

    // ============== 战斗事件回调 ==============
    onPlayerDeath(pidx, killerIdx) {
      if (this.cg) return;
      const dead = pidx === 1 ? this.player2 : this.player;
      if (!dead) return;
      TG.particles.explode(dead.cx, dead.cy, dead.color, 2.2);
      TG.audio.sfxBigExplosion();
      this.shake(16, 0.8);

      // PK 模式：一方死亡即结束，另一方获胜
      if (this.gameMode === 'pk') {
        this._pkWinner = killerIdx !== undefined ? killerIdx : (pidx === 0 ? 1 : 0);
        this.cg = 'victory'; this.cgT = 0; // 使用胜利 CG（有人赢了）
        this.audio.stopMusic(); this.audio.playMusic('victory');
        return;
      }
      // Coop 模式：一方死亡后另一方可继续，两方都死才结束
      if (this.gameMode === 'coop') {
        if (this.player.alive === false && (!this.player2 || this.player2.alive === false)) {
          this.cg = 'defeat'; this.cgT = 0;
          this.audio.stopMusic(); this.audio.playMusic('defeat');
        } else {
          this.toast(pidx === 0 ? 'P1 阵亡！P2 继续战斗！' : 'P2 阵亡！P1 继续战斗！');
        }
        return;
      }
      // 单人模式：直接结束
      this.cg = 'defeat'; this.cgT = 0;
      this.audio.stopMusic(); this.audio.playMusic('defeat');
    }
    onBossDeath() {
      this.shake(20, 1.2);
      TG.audio.sfxBigExplosion();
      this.ach.check('boss', 1);
      // 逆血反杀：Boss 死亡时任意存活玩家血量低于 10%
      const alivePlayers = [this.player, this.player2].filter((p) => p && p.alive !== false && p.hp > 0);
      if (alivePlayers.some((p) => p.hp / p.maxHp < 0.1)) {
        this.ach.check('boss_lowhp', 1);
      }
      // 连环爆炸
      for (let i = 0; i < 6; i++) {
        const x = this.boss.cx + TG.rand(-this.boss.r, this.boss.r);
        const y = this.boss.cy + TG.rand(-this.boss.r, this.boss.r);
        setTimeout(() => { TG.particles.explode(x, y, this.boss.def.color, 1.6); TG.audio.sfxExplosion(); }, i * 180);
      }
      // PK 模式无关卡概念，直接胜利
      if (this.gameMode === 'pk') {
        this.cg = 'victory'; this.cgT = 0;
        this.audio.stopMusic(); this.audio.playMusic('victory');
        return;
      }
      // 第1关通关 → 过渡到第2关
      if (this.level < this.maxLevel) {
        this.cg = 'level-transition'; this.cgT = 0;
        this.timeScale = 0.35;
        this.audio.stopMusic(); this.audio.playMusic('victory');
        return;
      }
      // 第2关通关 → 正式胜利
      this.cg = 'victory'; this.cgT = 0;
      this.timeScale = 0.35;
      this.audio.stopMusic(); this.audio.playMusic('victory');
    }
    onBossPhase(i) {
      this.toast('Boss 进入第 ' + (i + 1) + ' 阶段！');
      this.shake(10, 0.4);
      TG.audio.sfxWarning();
    }

    // ============== 关卡过渡 ==============
    _startNextLevel() {
      this.level++;
      // 清场但保留玩家
      TG.bullets.clear(); TG.enemies.clear(); TG.powerups.clear(); TG.particles.clear();
      this.boss = null; this.bossOut = false;
      this.wave = 0; this.waveT = 0; this.spawnT = 2;
      this.tension = 0; this.combo = 0; this.comboT = 0;
      this.timeScale = 1;
      // 玩家恢复部分血量 + 短暂无敌
      if (this.player && this.player.alive !== false) {
        this.player.heal(this.player.maxHp * 0.3);
        this.player.invuln = 2.0;
      }
      if (this.player2 && this.player2.alive !== false) {
        this.player2.heal(this.player2.maxHp * 0.3);
        this.player2.invuln = 2.0;
      }
      // 重置位置
      if (this.player) { this.player.cx = this.W / 2; this.player.cy = this.H * 0.78; }
      this.audio.playMusic('calm');
      this.toast('第 ' + this.level + ' 关 · 深渊反扑！');
      this.shake(6, 0.3);
    }
    onClearScreen() {
      // 清除所有敌人子弹 + 对全屏敌人造成伤害
      let hit = 0;
      TG.bullets.forEach((b) => { if (b.team === 'enemy') { TG.particles.explode(b.x, b.y, b.color, 0.4); b.alive = false; hit++; } });
      TG.enemies.forEach((e) => { if (e.takeDamage(30)) this._onKill(e); });
      // 清屏对 Boss 伤害受限：不超过 Boss 最大血量的 8%（最低 20），防止一击秒杀
      if (this.boss && this.boss.alive) {
        const cap = Math.max(20, Math.round(this.boss.maxHp * 0.08));
        if (this.boss.takeDamage(cap)) this.onBossDeath(); // 若清屏击杀 Boss，走完整死亡流程
      }
      this.toast('全屏清场！');
    }

    // PK模式下清屏：只清敌人子弹，不影响另一方玩家
    onClearScreenPK() {
      TG.bullets.forEach((b) => { if (b.team === 'enemy') { TG.particles.explode(b.x, b.y, b.color, 0.4); b.alive = false; } });
      // PK模式下不刷敌人，所以只清子弹即可
      this.toast('全屏清场！');
    }

    // ============== 击杀处理 ==============
    _onKill(e, killerIdx) {
      this.combo++; this.comboT = 3;
      this.stats.kills++;
      if (this.stats.kills === 1) this.ach.check('first_kill', 1);
      if (e.type === 'elite') this.stats.eliteKills++;
      this.ach.check('kills', this.stats.kills);
      this.ach.check('elite', this.stats.eliteKills);
      if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
      this.ach.check('combo', this.combo);
      // coop 模式共享分数；PK 模式无敌人击杀
      const scorer = this.player;
      const gain = Math.round(e.score * (1 + this.combo * 0.05) * scorer.scoreMul);
      this.score += gain;
      this.ach.check('score', this.score);
      TG.particles.explode(e.cx, e.cy, e.color, 0.9);
      TG.audio.sfxExplosion();
      this.shake(4, 0.18);
      // 道具掉落
      if (Math.random() < 0.22) TG.powerups.spawn(e.cx, e.cy);
      // 连击提示
      if (this.combo > 0 && this.combo % 10 === 0) this.toast(this.combo + ' 连击！');
    }

    // PK 模式下玩家命中另一方得分
    _onPKHit(attackerIdx, dmg) {
      const gain = Math.round(dmg * 10);
      if (attackerIdx === 0) this.score += gain;
      else this.score2 += gain;
      this.ach.check('score', this.score + this.score2);
    }

    // ============== 视觉效果 ==============
    shake(amp, dur) { if (amp > this.shakeAmp) this.shakeAmp = amp; this.shakeDur = Math.max(this.shakeDur, dur); this.shakeT = this.shakeDur; }
    redFlash(v) { this.redFlashV = Math.max(this.redFlashV, v); }

    toast(msg) { this.ui.toast(msg); }

    nearestEnemy(x, y, fromPidx) {
      // PK 模式：返回对方玩家作为目标
      if (this.gameMode === 'pk') {
        const target = fromPidx === 0 ? this.player2 : this.player;
        if (target && target.alive !== false) return target;
        return null;
      }
      let best = null, bd = Infinity;
      TG.enemies.forEach((e) => { const d = TG.dist2(x, y, e.cx, e.cy); if (d < bd) { bd = d; best = e; } });
      if (this.boss && this.boss.alive && !this.boss.entering) {
        const d = TG.dist2(x, y, this.boss.cx, this.boss.cy);
        if (d < bd) best = this.boss;
      }
      return best;
    }

    // ============== 游戏循环 ==============
    _loop(ts) {
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.25) dt = 0.25; // 防止切后台后大跳

      // CG 慢动作等影响逻辑速度
      this._acc += dt * this.timeScale;
      let steps = 0;
      while (this._acc >= STEP && steps < 5) {
        this.update(STEP);
        this._acc -= STEP;
        steps++;
      }
      // 视觉效果衰减用真实时间
      this._updateFx(dt);
      this.render();
      // 成就弹窗轮询
      if (this.ach.hasPop()) {
        const it = this.ach.pop(); this._newAch.add(it.def.id); this.ui.showAchToast(it);
      }
      requestAnimationFrame(this._loop);
    }

    _updateFx(dt) {
      if (this.shakeT > 0) { this.shakeT -= dt; this.shakeDur -= dt; if (this.shakeDur <= 0) this.shakeAmp *= 0.9; }
      if (this.redFlashV > 0) this.redFlashV = Math.max(0, this.redFlashV - dt * 1.5);
      if (this.timeScale < 1 && this.cg !== 'victory' && this.cg !== 'defeat' && this.cg !== 'level-transition') this.timeScale = Math.min(1, this.timeScale + dt * 1.2);
      else if (this.cg === 'victory' || this.cg === 'defeat' || this.cg === 'level-transition') this.timeScale = Math.min(1, this.timeScale + dt * 0.5);
    }

    update(dt) {
      // 背景星滚动（始终）
      this._starSpeed = (this.state === 'battle') ? 1 : 0.4;

      if (this.state === 'battle') this._updateBattle(dt);
      else if (this.state === 'loading') this._updateLoading(dt);
      else if (this.state === 'pause') { /* 暂停不更新逻辑 */ }

      // CG 推进
      if (this.cg) {
        this.cgT += dt;
        if (this.cg === 'victory' && this.cgT > 2.6) { this._finishBattle(true, false); this.cg = null; }
        else if (this.cg === 'defeat' && this.cgT > 2.2) { this._finishBattle(false, false); this.cg = null; }
        else if (this.cg === 'level-transition' && this.cgT > 3.0) { this._startNextLevel(); this.cg = null; }
      }
    }

    _updateLoading(dt) {
      this._loadT = (this._loadT || 0) + dt;
      const tips = ['初始化武器系统…', '校准护盾矩阵…', '链接星河网络…', '装载机甲核心…', '准备完毕'];
      const fill = document.getElementById('load-fill');
      const tip = document.getElementById('load-tip');
      if (fill) fill.style.width = Math.min(100, this._loadT * 40) + '%';
      if (tip && this._loadT < 4) tip.textContent = tips[Math.min(tips.length - 1, Math.floor(this._loadT))];
      if (this._loadT >= 4 && this.state === 'loading') { this.go('menu'); }
    }

    _updateBattle(dt) {
      const p = this.player; if (!p) return;

      // PK 模式下不使用波次/紧张度系统
      if (this.gameMode !== 'pk') {
        // 紧张度：基于分数与波次，第2关额外提升
        this.tension = TG.clamp((this.score / 18000) * this.levelGrow + this.wave * 0.04 + (this.level - 1) * 0.12, 0, 1);
        // BGM 紧张层 & 切换
        if (this.boss && this.boss.alive) {
          if (this.audio.curTrack !== 'boss') this.audio.playMusic('boss');
        } else if (this.tension > 0.55) {
          if (this.audio.curTrack !== 'tense') this.audio.playMusic('tense');
          this.audio.setTenseLayer(true);
        } else {
          if (this.audio.curTrack === 'tense' && this.tension < 0.4) this.audio.playMusic('calm');
          this.audio.setTenseLayer(false);
        }
      }

      // 玩家1（战败 CG 期间停止操控）
      if (this.cg !== 'defeat' && p.alive !== false) p.control(this.input, dt, this.mouse);
      p.update(dt);
      // 玩家2
      if (this.player2) {
        if (this.cg !== 'defeat' && this.player2.alive !== false) this.player2.control(this.input, dt, this.mouse);
        this.player2.update(dt);
      }
      // 触摸移动（仅 P1）
      if (this._touch && this._touch.side === 'move' && p) {
        const a = Math.atan2(this._touch.y - p.cy, this._touch.x - p.cx);
        const d = TG.dist(p.cx, p.cy, this._touch.x, this._touch.y);
        if (d > 8) { const sp = p.speed * p.spdUp * dt; p.cx = TG.clamp(p.cx + Math.cos(a) * sp, p.r, this.W - p.r); p.cy = TG.clamp(p.cy + Math.sin(a) * sp, p.r, this.H - p.r); }
      }

      // 子弹/敌人/道具/粒子
      TG.bullets.update(dt, this);
      if (this.gameMode !== 'pk') {
        TG.enemies.update(dt, this);
        TG.powerups.update(dt, this);
      }
      TG.particles.update(dt);
      TG.floatTexts.update(dt);

      // Boss
      if (this.boss && this.boss.alive) this.boss.update(dt, this);

      // 波次/刷怪（PK 模式跳过）
      if (this.gameMode !== 'pk') this._updateWaves(dt);

      // 连击计时
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

      // 碰撞
      this._collide();

      // HUD
      this.ui.updateHUD();
    }

    _updateWaves(dt) {
      this.waveT += dt;
      this.spawnT -= dt;

      // Boss 触发：第 5 波或分数阈值
      if (!this.bossOut && (this.wave >= 5 || this.score >= 9000)) {
        this.bossOut = true;
        this._spawnBoss();
        return;
      }
      if (this.bossOut && (!this.boss || !this.boss.alive)) return; // Boss 阶段不刷普通怪（除召唤）

      // 普通刷怪节奏（第2关敌人数量 +25%）
      if (this.spawnT <= 0) {
        const n = Math.floor((2 + this.tension * 5) * (1 + (this.level - 1) * 0.25));
        for (let i = 0; i < n; i++) {
          const r = Math.random();
          let type = 'grunt';
          if (this.tension > 0.3 && r < 0.18) type = 'elite';
          else if (r < 0.4) type = 'diver';
          else if (this.tension > 0.2 && r < 0.55) type = 'sniper';
          const x = TG.rand(60, this.W - 60);
          TG.enemies.spawn(type, x, -30, this.tension, this, this.level);
        }
        this.spawnT = TG.lerp(2.6, 0.9, this.tension);
      }

      // 波次推进（每 18s 一波）
      if (this.waveT >= 18) {
        this.waveT = 0; this.wave++;
        this.toast('第 ' + this.level + ' 关 · 第 ' + (this.wave + 1) + ' 波来袭！');
        if (!this.stats.tookDamageThisWave) this.ach.check('nohurt', 0);
        this.stats.tookDamageThisWave = false;
      }
    }

    _spawnBoss() {
      // 难度缩放：easy=0.6, normal=1.0, hard=1.5, inferno=2.0
      // 第2关 Boss scale 额外 +0.3
      const bossScale = TG.clamp(this.levelGrow * (1 + (this.level - 1) * 0.3), 0.6, 3.0);
      this.boss = new TG.Boss(this, bossScale);
      this.audio.stopMusic();
      this.ui.showBossCG(this.boss.def, () => { this.audio.playMusic('boss'); });
      this.shake(8, 0.6);
    }

    // ============== 碰撞 ==============
    _collide() {
      const p = this.player;
      const players = [p];
      if (this.player2) players.push(this.player2);

      // 玩家子弹 vs 敌人 / Boss（coop/single 模式）
      if (this.gameMode !== 'pk') {
        TG.bullets.forEach((b) => {
          if (b.team !== 'player') return;
          TG.enemies.forEach((e) => {
            if (!b.alive || !e.alive) return;
            if (TG.dist2(b.x, b.y, e.cx, e.cy) <= (b.r + e.r) * (b.r + e.r)) {
              if (e.takeDamage(b.dmg)) this._onKill(e, b.owner);
              if (b.pierce > 0) b.pierce--; else b.alive = false;
            }
          });
          // vs Boss
          if (this.boss && this.boss.alive && b.alive) {
            const bs = this.boss.hitCircle();
            if (TG.dist2(b.x, b.y, bs.x, bs.y) <= (b.r + bs.r) * (b.r + bs.r)) {
              if (this.boss.takeDamage(b.dmg)) this.onBossDeath();
              if (b.pierce > 0) b.pierce--; else b.alive = false;
            }
          }
        });

        // 敌人子弹 vs 玩家（所有玩家）
        TG.bullets.forEach((b) => {
          if (b.team !== 'enemy' || !b.alive) return;
          players.forEach((pl) => {
            if (!pl || pl.alive === false) return;
            if (TG.dist2(b.x, b.y, pl.cx, pl.cy) <= (b.r + pl.r - 2) * (b.r + pl.r - 2)) {
              if (pl.shield > 0 || pl.invuln > 0) { b.alive = false; TG.particles.hit(b.x, b.y, Math.random() * TG.TAU, pl.accent); }
              else if (pl.takeDamage(b.dmg)) { b.alive = false; this.stats.tookDamageThisWave = true; }
            }
          });
        });

        // 敌人撞击玩家
        TG.enemies.forEach((e) => {
          if (!e.alive) return;
          players.forEach((pl) => {
            if (!pl || pl.alive === false) return;
            if (TG.dist2(e.cx, e.cy, pl.cx, pl.cy) <= (e.r + pl.r - 2) * (e.r + pl.r - 2)) {
              if (pl.takeDamage(e.dmg)) { this.stats.tookDamageThisWave = true; if (e.takeDamage(999)) this._onKill(e); }
            }
          });
        });

        // Boss 撞击
        if (this.boss && this.boss.alive && !this.boss.entering) {
          const bs = this.boss.hitCircle();
          players.forEach((pl) => {
            if (!pl || pl.alive === false) return;
            if (TG.dist2(bs.x, bs.y, pl.cx, pl.cy) <= (bs.r + pl.r - 4) * (bs.r + pl.r - 4)) pl.takeDamage(12);
          });
        }

        // 道具拾取（所有玩家都可拾取）
        TG.powerups.forEach((pu) => {
          if (!pu.alive) return;
          players.forEach((pl) => {
            if (!pl || pl.alive === false || !pu.alive) return;
            if (TG.dist2(pu.x, pu.y, pl.cx, pl.cy) <= (pu.r + pl.r) * (pu.r + pl.r)) {
              TG.particles.pickup(pu.x, pu.y, pu.color);
              pl.applyPowerup(pu.type);
              pu.alive = false;
            }
          });
        });
      }

      // PK 模式：玩家子弹可打另一方玩家
      if (this.gameMode === 'pk') {
        TG.bullets.forEach((b) => {
          if (b.team !== 'player' || !b.alive) return;
          players.forEach((pl) => {
            if (!pl || pl.alive === false) return;
            // 子弹不能打自己
            if (b.owner === pl.pidx) return;
            if (TG.dist2(b.x, b.y, pl.cx, pl.cy) <= (b.r + pl.r - 2) * (b.r + pl.r - 2)) {
              if (pl.shield > 0 || pl.invuln > 0) {
                b.alive = false;
                TG.particles.hit(b.x, b.y, Math.random() * TG.TAU, pl.accent);
              } else if (pl.takeDamage(b.dmg, b.owner)) {
                b.alive = false;
                this._onPKHit(b.owner, b.dmg);
              }
            }
          });
        });
      }
    }

    // ============== 结算 ==============
    _finishBattle(win, surrendered) {
      // PK 模式：根据胜者判定
      if (this.gameMode === 'pk') {
        win = this._pkWinner === 0;
        const total = this.score + this.score2;
        if (total > this.bestScore) { this.bestScore = total; TG.store.set('tk_best', this.bestScore); }
      } else {
        if (this.score > this.bestScore) { this.bestScore = this.score; TG.store.set('tk_best', this.bestScore); }
      }
      // ====== 通关成就综合检查（在 endBattle 清理前执行） ======
      if (this.gameMode === 'pk' && this._pkWinner !== null) {
        // PK 模式胜者获得决斗之王
        this.ach.check('win', { pk: true });
      } else if (win) {
        // 单人/合作通关：检查多种条件
        this.ach.check('win', {
          coop: this.gameMode === 'coop',
          inferno: this.selectedLevel === 'inferno',
          noItems: this.stats.powerups === 0,           // 苦修战士：整局未拾取道具
          clear3: this.stats.clearUsed >= 3,             // 三重净化：使用 3 次清屏
          noSkill: this.stats.shieldUsed === 0 && this.stats.clearUsed === 0, // 禁欲行者
          noDamage: !this.stats.tookDamage,             // 不坏金身：整局无伤
        });
      }
      this._newAch = new Set();
      this.audio.stopMusic();
      this.endBattle(false);
      this.ui.showResults(win);
      this.state = 'results';
      this.ui.show('results');
      this.timeScale = 1;
    }

    // ============== 渲染 ==============
    render() {
      const ctx = this.ctx;
      ctx.save();
      // 屏幕震动偏移
      let sx = 0, sy = 0;
      if (this.shakeT > 0 && this.shakeAmp > 0.2) {
        const k = Math.max(0, this.shakeT / this.shakeDur) * this.shakeAmp;
        sx = TG.rand(-k, k); sy = TG.rand(-k, k);
      }
      ctx.translate(sx, sy);

      // 背景
      this._renderBg(ctx);

      if (this.state === 'battle' || this.state === 'pause' || this.cg) {
        if (this.gameMode !== 'pk') {
          TG.powerups.render(ctx);
          TG.enemies.render(ctx);
        }
        if (this.boss && this.boss.alive) this.boss.render(ctx);
        if (this.player && this.player.alive !== false) this.player.render(ctx);
        if (this.player2 && this.player2.alive !== false) this.player2.render(ctx);
        TG.bullets.render(ctx);
        TG.particles.render(ctx);
        TG.floatTexts.render(ctx);
      }

      // 红屏闪
      if (this.redFlashV > 0) {
        ctx.fillStyle = `rgba(255,40,60,${this.redFlashV * 0.4})`;
        ctx.fillRect(-sx - 50, -sy - 50, this.W + 100, this.H + 100);
      }

      // CG 覆盖（胜利/失败）
      if (this.cg) this._renderCG(ctx);

      ctx.restore();
    }

    _renderBg(ctx) {
      // 深空渐变
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#05060f'); g.addColorStop(0.5, '#0a0f1f'); g.addColorStop(1, '#070314');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      // 星
      const sp = this._starSpeed || 0.4;
      ctx.fillStyle = '#cfe6ff';
      for (const s of this.stars) {
        let y = (s.y * this.H + performance.now() / 1000 * sp * 40 * s.z) % this.H;
        if (y < 0) y += this.H;
        const x = s.x * this.W;
        ctx.globalAlpha = s.z * 0.9;
        ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
      // 远景网格（战斗时）
      if (this.state === 'battle') {
        ctx.strokeStyle = 'rgba(60,120,200,0.06)'; ctx.lineWidth = 1;
        const off = (performance.now() / 1000 * 30) % 60;
        for (let y = -60 + off; y < this.H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
      }
    }

    _renderCG(ctx) {
      const t = this.cgT;
      if (this.cg === 'victory') {
        const a = Math.min(1, t / 0.5);
        ctx.fillStyle = `rgba(8,20,40,${0.5 * a})`;
        ctx.fillRect(0, 0, this.W, this.H);
        // 光柱
        ctx.save();
        ctx.translate(this.W / 2, this.H / 2);
        ctx.globalAlpha = Math.min(1, t / 0.8);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.H * 0.6);
        grad.addColorStop(0, 'rgba(120,255,200,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.fillRect(-this.W, -this.H, this.W * 2, this.H * 2);
        ctx.restore();
        ctx.fillStyle = '#9bffd8'; ctx.textAlign = 'center'; ctx.font = 'bold 56px "Segoe UI", sans-serif';
        ctx.globalAlpha = Math.min(1, t / 0.6);
        // PK 模式显示胜者
        const cgText = (this.gameMode === 'pk' && this._pkWinner !== null)
          ? 'P' + (this._pkWinner + 1) + '  胜  利'
          : '胜  利';
        ctx.fillText(cgText, this.W / 2, this.H / 2);
        ctx.globalAlpha = 1;
      } else if (this.cg === 'defeat') {
        const a = Math.min(1, t / 0.6);
        ctx.fillStyle = `rgba(20,0,6,${0.6 * a})`;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#ff5a7a'; ctx.textAlign = 'center'; ctx.font = 'bold 56px "Segoe UI", sans-serif';
        ctx.globalAlpha = Math.min(1, t / 0.6);
        ctx.fillText('防 线 失 守', this.W / 2, this.H / 2);
        ctx.globalAlpha = 1;
      } else if (this.cg === 'level-transition') {
        // 关卡过渡 CG：分三段文字
        const a = Math.min(1, t / 0.5);   // 整体暗化
        ctx.fillStyle = `rgba(5,10,25,${0.65 * a})`;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.textAlign = 'center';
        // 副标题
        ctx.font = '20px "Segoe UI", sans-serif';
        ctx.fillStyle = '#7fd8ff';
        if (t > 0.3) {
          ctx.globalAlpha = Math.min(1, (t - 0.3) / 0.4);
          ctx.fillText('— 第 ' + (this.level) + ' 关  通  关 —', this.W / 2, this.H / 2 - 50);
        }
        // 主标题
        ctx.font = 'bold 48px "Segoe UI", sans-serif';
        if (t > 1.0) {
          ctx.globalAlpha = Math.min(1, (t - 1.0) / 0.5);
          // 光晕
          const glow = ctx.createRadialGradient(this.W / 2, this.H / 2, 0, this.W / 2, this.H / 2, 300);
          glow.addColorStop(0, 'rgba(120,180,255,0.3)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glow; ctx.fillRect(0, 0, this.W, this.H);
          ctx.fillStyle = '#9be0ff';
          ctx.fillText('进入第 ' + (this.level + 1) + ' 关', this.W / 2, this.H / 2 + 10);
        }
        // 提示
        if (t > 1.8) {
          ctx.font = '18px "Segoe UI", sans-serif';
          ctx.globalAlpha = Math.min(1, (t - 1.8) / 0.4) * (t > 2.7 ? Math.max(0, 1 - (t - 2.7) / 0.3) : 1);
          ctx.fillStyle = '#ffd24a';
          ctx.fillText('深 渊 反 扑 · 准 备 战 斗', this.W / 2, this.H / 2 + 60);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  TG.Game = Game;
})(window.TG = window.TG || {});
