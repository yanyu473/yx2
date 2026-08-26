/* =====================================================================
 * particle.js — 粒子系统
 *   类型：爆炸碎片 / 子弹拖尾 / 命中闪光 / 拾取光环 / 护盾环 / 引擎尾焰
 *   单例 ParticleSystem 统一管理 update+render，复用对象池
 * ===================================================================== */
(function (TG) {
  'use strict';

  class Particle {
    constructor() { this.alive = false; }
    spawn(x, y, vx, vy, life, color, size, type, extra) {
      this.alive = true;
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.max = life;
      this.color = color; this.size = size; this.type = type;
      this.extra = extra || {};
      this.rot = Math.random() * TG.TAU;
      this.vr = TG.rand(-6, 6);
    }
    update(dt) {
      if (!this.alive) return;
      this.life -= dt;
      if (this.life <= 0) { this.alive = false; return; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.96; this.vy *= 0.96;
      if (this.extra.gravity) this.vy += this.extra.gravity * dt;
      this.rot += this.vr * dt;
    }
    render(ctx) {
      if (!this.alive) return;
      const t = this.life / this.max; // 1→0
      const a = TG.clamp(t, 0, 1);
      ctx.globalAlpha = a;
      if (this.type === 'spark') {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * a, 0, TG.TAU);
        ctx.fill();
      } else if (this.type === 'ring') {
        const r = this.size * (1 - t) * (this.extra.span || 1) + this.size * 0.3;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2 + 2 * a;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, TG.TAU);
        ctx.stroke();
      } else if (this.type === 'debris') {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
        ctx.restore();
      } else if (this.type === 'flash') {
        const r = this.size * (1 - t * 0.3);
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
        g.addColorStop(0, this.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, TG.TAU);
        ctx.fill();
      } else if (this.type === 'streak') {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * a;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  class ParticleSystem {
    constructor() {
      this.pool = new TG.Pool(() => new Particle(), (p) => { p.alive = false; }, 200);
    }
    clear() { this.pool.clear(); }
    count() { return this.pool.active.length; }

    _emit(x, y, vx, vy, life, color, size, type, extra) {
      const p = this.pool.acquire();
      p.spawn(x, y, vx, vy, life, color, size, type, extra);
      return p;
    }

    // 爆炸：碎片 + 火花 + 闪光环
    explode(x, y, color = '#ff7a1a', power = 1) {
      const n = Math.floor(10 + 14 * power);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TG.TAU;
        const sp = TG.rand(60, 240) * power;
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.3, 0.7),
          TG.pick([color, '#ffd24a', '#ff5a3a']), TG.rand(2, 5), 'spark');
      }
      for (let i = 0; i < Math.floor(6 * power); i++) {
        const a = Math.random() * TG.TAU;
        const sp = TG.rand(40, 160) * power;
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.4, 0.9),
          TG.pick([color, '#8a4a2a']), TG.rand(3, 7), 'debris', { gravity: 120 });
      }
      this._emit(x, y, 0, 0, 0.35, color, 10 * power, 'flash');
      this._emit(x, y, 0, 0, 0.5, color, 26 * power, 'ring', { span: 3 * power });
    }

    // 击中：小型火花
    hit(x, y, ang, color = '#7fffd4') {
      for (let i = 0; i < 6; i++) {
        const a = ang + TG.rand(-1, 1);
        const sp = TG.rand(80, 200);
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.15, 0.35),
          color, TG.rand(1.5, 3), 'spark');
      }
      this._emit(x, y, 0, 0, 0.18, color, 8, 'flash');
    }

    // 枪口闪光
    muzzle(x, y, ang, color = '#9bf6ff') {
      for (let i = 0; i < 4; i++) {
        const a = ang + TG.rand(-0.4, 0.4);
        const sp = TG.rand(120, 280);
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.1, 0.22),
          color, TG.rand(1.5, 3), 'spark');
      }
      this._emit(x, y, 0, 0, 0.12, color, 10, 'flash');
    }

    // 子弹拖尾（轻量）
    trail(x, y, vx, vy, color, size = 2) {
      this._emit(x, y, vx * 0.2, vy * 0.2, 0.22, color, size, 'streak');
    }

    // 拾取光环
    pickup(x, y, color) {
      this._emit(x, y, 0, 0, 0.45, color, 30, 'ring', { span: 2 });
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * TG.TAU;
        const sp = TG.rand(40, 120);
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4, color, 2.5, 'spark');
      }
    }

    // 护盾环（持续型，由玩家每帧调用）
    shieldRing(x, y, r, color) {
      this._emit(x, y, 0, 0, 0.4, color, r, 'ring', { span: 0.6 });
    }

    // 引擎尾焰
    thrust(x, y, ang, color) {
      const a = ang + Math.PI + TG.rand(-0.3, 0.3);
      const sp = TG.rand(40, 110);
      this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.12, 0.26),
        color, TG.rand(1.5, 3), 'spark');
    }

    // 全屏清屏冲击波
    shockwave(x, y, color) {
      for (let i = 0; i < 3; i++) {
        this._emit(x, y, 0, 0, 0.5 + i * 0.15, color, 40 + i * 30, 'ring', { span: 6 });
      }
      this._emit(x, y, 0, 0, 0.4, color, 60, 'flash');
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * TG.TAU;
        const sp = TG.rand(200, 500);
        this._emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, TG.rand(0.4, 0.8),
          TG.pick([color, '#ffffff', '#b06bff']), TG.rand(2, 5), 'spark');
      }
    }

    update(dt) { this.pool.forEach((p) => p.update(dt)); this.pool.sweep((p) => !p.alive); }
    render(ctx) { this.pool.forEach((p) => p.render(ctx)); }
  }

  TG.Particle = Particle;
  TG.particles = new ParticleSystem();

  /* =====================================================================
   * 伤害飘字系统 — 命中时弹出伤害数字，向上飘起+淡出
   * 轻量管理，复用对象池
   * ===================================================================== */
  class FloatText {
    constructor() { this.alive = false; }
    spawn(x, y, text, color) {
      this.alive = true;
      this.x = x; this.y = y;
      this.text = String(text);
      this.color = color || '#ffffff';
      this.life = 0.8; this.max = 0.8;     // 存活时间（秒）
      this.vy = -60;                        // 向上飘起速度
      this.vx = TG.rand(-15, 15);           // 轻微水平偏移
    }
    update(dt) {
      if (!this.alive) return;
      this.life -= dt;
      if (this.life <= 0) { this.alive = false; return; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy *= 0.94;                      // 减速
    }
    render(ctx) {
      if (!this.alive) return;
      const t = this.life / this.max;       // 1→0
      const a = TG.clamp(t, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  class FloatTextSystem {
    constructor() {
      this.pool = new TG.Pool(() => new FloatText(), (f) => { f.alive = false; }, 60);
    }
    clear() { this.pool.clear(); }
    // 生成伤害飘字
    spawn(x, y, text, color) {
      const f = this.pool.acquire();
      f.spawn(x, y, text, color);
      return f;
    }
    update(dt) { this.pool.forEach((f) => f.update(dt)); this.pool.sweep((f) => !f.alive); }
    render(ctx) { this.pool.forEach((f) => f.render(ctx)); }
  }

  TG.FloatText = FloatText;
  TG.floatTexts = new FloatTextSystem();
})(window.TG = window.TG || {});
