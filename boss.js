/* =====================================================================
 * boss.js — Boss（多阶段状态机）
 *   - 至少 3 阶段，按血量阈值切换
 *   - 每阶段不同攻击模式：螺旋 / 瞄准散射 / 密集弹幕+召唤
 *   - 出场 CG 由 game 控制（震撼登场、镜头推进、名字展示）
 * ===================================================================== */
(function (TG) {
  'use strict';

  // 首 Boss 基础定义（新手友好，后续可用 scale 放大）
  const BOSS_DEF = {
    name: '深渊执政官', title: 'Void Archon · 星际守护者之敌',
    maxHp: 1000, r: 46, color: '#ff3a6b', accent: '#ffb0c8', defense: 5,
    phases: [
      // 首战 2 阶段（移除了原第3阶段"密集弹幕+召唤"）
      { at: 1.0,  mode: 'spiral', fireCd: 0.30, bSpeed: 140, dmg: 6 },  // 原0.16/180/8
      { at: 0.45, mode: 'aimed',  fireCd: 0.35, bSpeed: 200, dmg: 8 },  // 原0.22/260/10 @0.6
    ],
  };

  class Boss {
    constructor(game, scale) {
      this.def = BOSS_DEF;
      this.game = game;
      this.scale = scale || 1.0;                  // 难度缩放（首战=1，高难度可放大）
      this.cx = game.W / 2; this.cy = -80;
      this.r = BOSS_DEF.r;
      this.maxHp = Math.round(BOSS_DEF.maxHp * this.scale);
      this.hp = this.maxHp;
      this.defense = BOSS_DEF.defense;            // Boss 防御值（固定，不缩放）
      this.ang = Math.PI / 2;
      this.phaseIdx = 0;
      this.mode = BOSS_DEF.phases[0].mode;
      this.fireCd = BOSS_DEF.phases[0].fireCd / this.scale; // 缩放射速
      this.bSpeed = Math.round(BOSS_DEF.phases[0].bSpeed * this.scale);
      this.dmg = Math.round(BOSS_DEF.phases[0].dmg * this.scale);
      this.fireT = 2.5;                           // 首次攻击延迟（原1.5→2.5 给玩家喘息）
      this.spin = 0;
      this.t = 0;
      this.flashT = 0;
      this.alive = true;
      this.entering = true;        // 出场动画
      this.enterT = 0;
      this.targetY = game.H * 0.16;
      this.summonT = 8;            // 召唤间隔（仅高难度 scale>1 时启用）
      this.invuln = 0;
    }

    update(dt, game) {
      this.t += dt;
      this.spin += dt * 1.5;
      this.flashT = Math.max(0, this.flashT - dt);
      this.invuln = Math.max(0, this.invuln - dt);

      if (this.entering) {
        this.enterT += dt;
        // 从屏幕外缓动下降到目标位置
        const k = Math.min(1, this.enterT / 2.2);
        this.cy = TG.lerp(-80, this.targetY, 1 - Math.pow(1 - k, 3));
        if (k >= 1) { this.entering = false; this.invuln = 0.3; }
        return;
      }

      // 水平游荡
      this.cx = this.game.W / 2 + Math.sin(this.t * 0.6) * (this.game.W * 0.3);

      // 阶段切换（应用 scale 缩放）
      const ratio = this.hp / this.maxHp;
      for (let i = BOSS_DEF.phases.length - 1; i >= 0; i--) {
        if (ratio <= BOSS_DEF.phases[i].at && this.phaseIdx < i) {
          this.phaseIdx = i;
          const ph = BOSS_DEF.phases[i];
          this.mode = ph.mode;
          this.fireCd = ph.fireCd / this.scale;   // 缩放射速
          this.bSpeed = Math.round(ph.bSpeed * this.scale);
          this.dmg = Math.round(ph.dmg * this.scale);
          game.onBossPhase(i);
          break;
        }
      }

      // 攻击
      this.fireT -= dt;
      if (this.fireT <= 0 && this.invuln <= 0) {
        this.attack(game);
        this.fireT = this.fireCd;
      }
      // 高难度（scale > 1.2）时才召唤小怪
      if (this.scale > 1.2 && this.phaseIdx >= 1) {
        this.summonT -= dt;
        if (this.summonT <= 0) {
          TG.enemies.spawn('grunt', this.cx + TG.rand(-40, 40), this.cy + this.r, game.tension, game, game.level);
          this.summonT = 8;
        }
      }
    }

    attack(game) {
      const p = game.player;
      const ox = this.cx, oy = this.cy + this.r;
      const opts = { color: this.def.color, r: 5, life: 4 };
      if (this.mode === 'spiral') {
        // 首战螺旋弹：3 发（原 4 发）
        const n = 3;
        for (let i = 0; i < n; i++) {
          const a = this.spin * 2 + (i / n) * TG.TAU;
          TG.bullets.fire(ox, oy, a, this.bSpeed, 'enemy', this.dmg, opts);
        }
      } else if (this.mode === 'aimed') {
        // 瞄准散射：3 发（原 5 发），角度更宽
        const base = p ? Math.atan2(p.cy - oy, p.cx - ox) : Math.PI / 2;
        for (let i = -1; i <= 1; i++) {
          TG.bullets.fire(ox, oy, base + i * 0.22, this.bSpeed, 'enemy', this.dmg, opts);
        }
      } else { // bullet-hell（仅高难度后备，已不在首战阶段出现）
        const n = Math.min(8, Math.floor(6 * this.scale));
        for (let i = 0; i < n; i++) {
          const a = this.spin * 3 + (i / n) * TG.TAU;
          TG.bullets.fire(ox, oy, a, this.bSpeed, 'enemy', this.dmg, opts);
        }
        // 高难度才加追踪弹
        if (p && this.scale > 1.3) {
          const a = Math.atan2(p.cy - oy, p.cx - ox);
          TG.bullets.fire(ox, oy, a, this.bSpeed * 1.4, 'enemy', this.dmg, { ...opts, homing: 0.6, target: p });
        }
      }
      TG.audio.sfxEnemyShoot();
    }

    takeDamage(d) {
      if (this.invuln > 0 || this.entering) return false;
      // Boss 防御减伤
      const actual = Math.max(1, Math.round(d - this.defense));
      this.hp -= actual;
      this.flashT = 0.1;
      TG.particles.hit(this.cx + TG.rand(-this.r, this.r), this.cy + TG.rand(-this.r, this.r), Math.random() * TG.TAU, this.def.color);
      // 伤害飘字（Boss 命中用黄色）
      TG.floatTexts.spawn(this.cx + TG.rand(-this.r, this.r), this.cy + TG.rand(-this.r, this.r), actual, '#ffd24a');
      if (this.hp <= 0) { this.alive = false; return true; }
      return false;
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.cx, this.cy);
      const pulse = 1 + Math.sin(this.t * 3) * 0.04;
      ctx.scale(pulse, pulse);
      // 外环旋转装甲
      ctx.save();
      ctx.rotate(this.spin);
      ctx.strokeStyle = this.def.accent; ctx.lineWidth = 3;
      ctx.shadowColor = this.def.color; ctx.shadowBlur = 22;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TG.TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (this.r + 14), Math.sin(a) * (this.r + 14), 6, 0, TG.TAU);
        ctx.stroke();
      }
      ctx.restore();
      // 核心
      ctx.shadowColor = this.def.color; ctx.shadowBlur = 30;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, this.r);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.4, this.def.accent);
      g.addColorStop(1, this.def.color);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TG.TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // 阶段指示：内圈数量
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      for (let i = 0; i <= this.phaseIdx; i++) {
        ctx.beginPath(); ctx.arc(0, 0, this.r * (0.55 + i * 0.12), 0, TG.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (this.flashT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TG.TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // Boss 血条（顶部）
      if (!this.entering) this._drawBar(ctx);
    }

    _drawBar(ctx) {
      const w = this.game.W * 0.7, h = 10, x = (this.game.W - w) / 2, y = 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#2a1622';
      ctx.fillRect(x, y, w, h);
      const ratio = Math.max(0, this.hp / this.maxHp);
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#ff3a6b'); grad.addColorStop(1, '#ffb0c8');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w * ratio, h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.def.name + '  ·  ' + Math.ceil(ratio * 100) + '%', this.game.W / 2, y + h / 2);
    }

    hitCircle() { return { x: this.cx, y: this.cy, r: this.r - 4 }; }
  }

  TG.Boss = Boss;
  TG.BOSS_DEF = BOSS_DEF;
})(window.TG = window.TG || {});
