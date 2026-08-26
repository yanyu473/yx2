/* =====================================================================
 * enemy.js — 敌人系统
 *   - 普通：多种移动模式（直线/正弦/盘旋）
 *   - 精英：追踪玩家、扇形弹幕
 *   - 拟人化嘲讽：随机弹出文字气泡，带出现/消失动画
 * ===================================================================== */
(function (TG) {
  'use strict';

  // 嘲讽台词池（不同性格）
  const TAUNTS = {
    cocky: ['就这？', '你打不到我~', '哈哈哈', '太慢啦', '挠痒痒呢？', '菜'],
    aggressive: ['受死吧！', '毁灭你！', '碾碎！', '别想逃！', '火火火！'],
    scared: ['别追我！', '救命！', '我错了！', '快跑！', '啊啊啊'],
    boss: ['蝼蚁', '不堪一击', '臣服吧', '星河将熄', '汝等皆是尘埃', '徒劳'],
  };

  const TYPES = {
    grunt:  { hp: 18, speed: 70, dmg: 6, color: '#ff5a8a', score: 60, fireCd: 2.2, bSpeed: 200, r: 16, taunt: 'cocky', defense: 2 },
    diver:  { hp: 14, speed: 120, dmg: 5, color: '#ff8a3a', score: 80, fireCd: 1.8, bSpeed: 240, r: 14, taunt: 'cocky', defense: 1 },
    elite:  { hp: 40, speed: 95, dmg: 8, color: '#b06bff', score: 160, fireCd: 1.6, bSpeed: 230, r: 19, taunt: 'aggressive', homing: 1.2, defense: 5 },
    sniper: { hp: 22, speed: 60, dmg: 10, color: '#3affc0', score: 120, fireCd: 2.6, bSpeed: 320, r: 16, taunt: 'scared', aimed: true, defense: 3 },
  };

  class Enemy {
    constructor() { this.alive = false; }
    spawn(type, x, y, tension, game, level) {
      const def = TYPES[type] || TYPES.grunt;
      const lvl = level || 1;
      // 第2关敌人属性梯度：HP +20%、速度 +12%（克制幅度，不翻倍）
      const lvlHp = 1 + 0.20 * (lvl - 1);
      const lvlSpd = 1 + 0.12 * (lvl - 1);
      this.alive = true;
      this.type = type; this.def = def;
      this.cx = x; this.cy = y;
      this.r = def.r;
      this.ang = Math.PI / 2;        // 朝下
      this.maxHp = def.hp * (1 + tension * 0.5) * lvlHp;
      this.hp = this.maxHp;
      this.speed = def.speed * (1 + tension * 0.35) * lvlSpd;
      this.dmg = def.dmg;
      this.color = def.color;
      this.fireCd = def.fireCd / (1 + tension * 0.4);
      this.bSpeed = def.bSpeed;
      this.fireT = TG.rand(0.5, def.fireCd);
      this.score = def.score;
      this.tauntPool = TAUNTS[def.taunt];
      this.homing = def.homing || 0;
      this.aimed = def.aimed || false;
      this.defense = def.defense || 0;             // 防御值（减伤）
      this.game = game;
      this.t = 0;
      this.flashT = 0;
      this.bubble = null; this.bubbleT = 0;
      // 按敌人类型分配移动模式
      if (type === 'diver') {
        this.pattern = 'dive';           // 冲锋兵：快速俯冲+编织走位
      } else if (type === 'elite') {
        this.pattern = 'kite';           // 精英：保持距离游走（kiting）
      } else if (type === 'sniper') {
        this.pattern = 'snipe';          // 狙击手：拉开距离射击
      } else {
        // 普通兵：多样化随机模式
        this.pattern = TG.pick(['straight', 'sine', 'zigzag', 'arc', 'pause-charge']);
      }
      this.baseX = x; this.phase = Math.random() * TG.TAU;
      this.tauntNext = TG.rand(3, 7);
      this.entryT = 0.6;             // 入场缩放
      this.pauseT = 0;               // 停顿-冲锋模式的计时器
      this.chargeT = 0;               // 冲锋计时器
      this.kiteDist = TG.rand(150, 240); // 精英/狙击手偏好距离
    }

    taunt(force) {
      if (this.bubbleT > 0 && !force) return;
      this.bubble = TG.pick(this.tauntPool);
      this.bubbleT = 2.2;
    }

    update(dt, game) {
      if (!this.alive) return;
      this.t += dt;
      this.entryT = Math.max(0, this.entryT - dt);
      this.flashT = Math.max(0, this.flashT - dt);
      this.bubbleT = Math.max(0, this.bubbleT - dt);
      this.tauntNext -= dt;
      if (this.tauntNext <= 0) {
        if (Math.random() < 0.5) this.taunt();
        this.tauntNext = TG.rand(5, 11);
      }

      const p = game.player;
      const sp = this.speed * dt;

      // ====== 按类型/模式执行移动 ======
      switch (this.pattern) {
        case 'dive':
          // 冲锋兵：快速俯冲 + 轻微编织走位（不再笔直送死）
          this.cy += sp * 1.3;
          this.cx += Math.sin(this.t * 5 + this.phase) * sp * 0.6;
          this.ang = Math.PI / 2 + Math.sin(this.t * 5) * 0.35;
          break;

        case 'kite':
          // 精英：保持距离游走（kiting），太近拉开、太远靠近、适中绕圈
          if (p) {
            const dx = p.cx - this.cx, dy = p.cy - this.cy;
            const d = Math.hypot(dx, dy) || 1;
            if (d < this.kiteDist) {
              // 太近 → 后撤
              this.cx -= (dx / d) * sp;
              this.cy -= (dy / d) * sp * 0.8;
            } else if (d > this.kiteDist + 80) {
              // 太远 → 缓慢逼近
              this.cx += (dx / d) * sp * 0.6;
              this.cy += (dy / d) * sp * 0.6;
            } else {
              // 适中 → 侧向绕圈
              const pa = Math.atan2(dy, dx) + Math.PI / 2;
              this.cx += Math.cos(pa) * sp * 0.7;
              this.cy += Math.sin(pa) * sp * 0.7;
            }
            this.ang = Math.atan2(dy, dx);
          } else {
            this.cy += sp;
          }
          break;

        case 'snipe':
          // 狙击手：拉开距离射击，玩家靠近时快速后撤
          if (p) {
            const dx = p.cx - this.cx, dy = p.cy - this.cy;
            const d = Math.hypot(dx, dy) || 1;
            if (d < this.kiteDist * 0.7) {
              // 玩家逼近 → 快速后撤
              this.cx -= (dx / d) * sp * 1.3;
              this.cy -= (dy / d) * sp * 1.3;
            } else if (d > this.kiteDist * 1.5) {
              // 太远 → 缓慢靠拢
              this.cx += (dx / d) * sp * 0.4;
              this.cy += (dy / d) * sp * 0.4;
            }
            // 偏好在屏幕上半区域
            if (this.cy > game.H * 0.45) this.cy -= sp * 0.5;
            this.ang = Math.atan2(dy, dx);
          } else {
            this.cy += sp * 0.5;
          }
          break;

        case 'zigzag':
          // 普通兵：之字形推进
          this.cy += sp * 0.85;
          this.cx += Math.sin(this.t * 3 + this.phase) * sp * 1.2;
          this.ang = Math.PI / 2 + Math.sin(this.t * 3) * 0.4;
          break;

        case 'arc':
          // 普通兵：弧线包抄（侧向+向下）
          {
            const dir = this.phase < Math.PI ? 1 : -1;
            this.cy += sp * 0.65;
            this.cx += dir * (sp * 0.55 + Math.cos(this.t * 1.5) * sp * 0.3);
            this.ang = Math.PI / 2 + dir * 0.5;
          }
          break;

        case 'pause-charge':
          // 普通兵：间歇停顿再冲刺
          if (this.pauseT > 0) {
            this.pauseT -= dt;
            this.cx += Math.sin(this.t * 4) * sp * 0.15; // 停顿时微抖
          } else if (this.chargeT > 0) {
            this.chargeT -= dt;
            this.cy += sp * 2.6;                          // 快速冲刺
          } else {
            // 随机切换停顿/冲刺
            if (Math.random() < 0.015) this.pauseT = TG.rand(0.5, 1.2);
            else this.chargeT = TG.rand(0.3, 0.6);
            this.cy += sp * 0.3;                          // 慢速漂流
          }
          this.ang = Math.PI / 2;
          break;

        case 'sine':
          // 普通兵：正弦波
          this.cy += sp;
          this.cx = this.baseX + Math.sin(this.t * 2.5 + this.phase) * 60;
          this.ang = Math.PI / 2;
          break;

        case 'orbit':
          // 普通兵：盘旋
          this.cx += Math.cos(this.t * 1.4 + this.phase) * sp;
          this.cy += Math.sin(this.t * 1.4) * 0.4 * sp + sp * 0.5;
          this.ang = Math.atan2(Math.sin(this.t * 1.4), Math.cos(this.t * 1.4 + this.phase));
          break;

        default:
          // 直线推进
          this.cy += sp;
          this.ang = Math.PI / 2;
      }

      // 轻微呼吸抖动（让走位更生动，不影响性能）
      this.cx += Math.sin(this.t * 3 + this.phase) * 0.4;
      this.cy += Math.cos(this.t * 2.5 + this.phase) * 0.4;

      // 简单分离：避免完全重叠扎堆
      this._separate(dt);

      // 边界：左右回弹，越下方消失并扣分提示
      if (this.cx < this.r) { this.cx = this.r; this.baseX = this.r; }
      if (this.cx > game.W - this.r) { this.cx = game.W - this.r; this.baseX = game.W - this.r; }
      if (this.cy > game.H + 40) { this.alive = false; return; }

      // 射击
      this.fireT -= dt;
      if (this.fireT <= 0 && p && this.cy < game.H - 30) {
        this.shoot(game);
        this.fireT = this.fireCd;
      }
    }

    shoot(game) {
      const p = game.player;
      let ang = Math.PI / 2;
      if (this.aimed && p) ang = Math.atan2(p.cy - this.cy, p.cx - this.cx);
      const ox = this.cx + Math.cos(this.ang) * (this.r + 4);
      const oy = this.cy + Math.sin(this.ang) * (this.r + 4);
      const opts = { color: this.color, r: 4, life: 3, homing: this.homing };
      if (this.type === 'elite') {
        // 三连扇形
        for (let i = -1; i <= 1; i++) {
          TG.bullets.fire(ox, oy, ang + i * 0.22, this.bSpeed, 'enemy', this.dmg, opts);
        }
      } else {
        TG.bullets.fire(ox, oy, ang, this.bSpeed, 'enemy', this.dmg, opts);
      }
      TG.audio.sfxEnemyShoot();
    }

    takeDamage(d) {
      // 防御减伤：实际伤害 = max(1, 子弹伤害 − 防御值)
      const actual = Math.max(1, Math.round(d - this.defense));
      this.hp -= actual;
      this.flashT = 0.12;
      TG.particles.hit(this.cx, this.cy, Math.random() * TG.TAU, this.color);
      // 伤害飘字（高伤橙红，普通白色）
      const color = actual >= 15 ? '#ff8a3a' : '#ffffff';
      TG.floatTexts.spawn(this.cx, this.cy - this.r - 4, actual, color);
      if (this.hp <= 0) { this.alive = false; return true; }
      // 受击偶尔嘲讽
      if (Math.random() < 0.18) this.taunt(true);
      return false;
    }

    render(ctx) {
      if (!this.alive) return;
      const scale = 1 - this.entryT / 0.6;  // 入场放大
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.scale(scale, scale);
      ctx.rotate(this.ang + Math.PI / 2);
      if (this.flashT > 0) ctx.globalAlpha = 0.85;
      this._draw(ctx);
      if (this.flashT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5;
        this._shape(ctx, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      // 血条
      if (this.hp < this.maxHp) {
        const w = this.r * 2.2, h = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.cx - w / 2, this.cy - this.r - 10, w, h);
        ctx.fillStyle = this.hp / this.maxHp > 0.4 ? '#7fff8a' : '#ff5a5a';
        ctx.fillRect(this.cx - w / 2, this.cy - this.r - 10, w * (this.hp / this.maxHp), h);
      }

      // 嘲讽气泡
      if (this.bubbleT > 0 && this.bubble) {
        this._drawBubble(ctx);
      }
    }

    _draw(ctx) {
      ctx.shadowColor = this.color; ctx.shadowBlur = 12;
      ctx.fillStyle = this.color;
      this._shape(ctx, this.r);
      ctx.shadowBlur = 0;
      // 核心
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, this.r * 0.25, 0, TG.TAU); ctx.fill();
    }

    _shape(ctx, r) {
      if (this.type === 'elite') {
        // 菱形精英
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
      } else if (this.type === 'sniper') {
        // 六边形
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TG.TAU - Math.PI / 2;
          (i ? ctx.lineTo : ctx.moveTo).call(ctx, Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      } else if (this.type === 'diver') {
        // 三角箭头
        ctx.beginPath();
        ctx.moveTo(0, r); ctx.lineTo(r, -r * 0.7); ctx.lineTo(-r, -r * 0.7); ctx.closePath(); ctx.fill();
      } else {
        // 圆形 grunt
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TG.TAU); ctx.fill();
      }
    }

    _drawBubble(ctx) {
      const txt = this.bubble;
      ctx.font = '13px "Segoe UI", sans-serif';
      const tw = ctx.measureText(txt).width + 16;
      const bx = this.cx - tw / 2, by = this.cy - this.r - 30;
      const a = this.bubbleT > 1.9 ? (2.2 - this.bubbleT) / 0.3 : (this.bubbleT < 0.3 ? this.bubbleT / 0.3 : 1);
      ctx.globalAlpha = TG.clamp(a, 0, 1);
      ctx.fillStyle = 'rgba(12,18,32,0.92)';
      ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
      this._roundRect(ctx, bx, by, tw, 22, 6); ctx.fill(); ctx.stroke();
      // 小尾巴
      ctx.beginPath();
      ctx.moveTo(this.cx - 4, by + 22); ctx.lineTo(this.cx, by + 28); ctx.lineTo(this.cx + 4, by + 22); ctx.closePath();
      ctx.fillStyle = 'rgba(12,18,32,0.92)'; ctx.fill();
      ctx.fillStyle = '#eaf2ff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, this.cx, by + 11);
      ctx.globalAlpha = 1;
    }
    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // 简单分离力：避免敌人完全重叠扎堆
    _separate(dt) {
      const minDist = this.r * 2.4;
      let pushX = 0, pushY = 0;
      TG.enemies.forEach((other) => {
        if (other === this || !other.alive) return;
        const dx = this.cx - other.cx;
        const dy = this.cy - other.cy;
        const d = Math.hypot(dx, dy);
        if (d < minDist && d > 0.1) {
          const force = (minDist - d) / minDist * 35;
          pushX += (dx / d) * force * dt;
          pushY += (dy / d) * force * dt;
        }
      });
      this.cx += pushX;
      this.cy += pushY;
    }

    hitCircle() { return { x: this.cx, y: this.cy, r: this.r - 2 }; }
  }

  class EnemySystem {
    constructor() {
      this.pool = new TG.Pool(() => new Enemy(), (e) => { e.alive = false; }, 40);
    }
    clear() { this.pool.clear(); }
    count() { return this.pool.active.length; }
    spawn(type, x, y, tension, game) {
      const e = this.pool.acquire();
      e.spawn(type, x, y, tension, game);
      return e;
    }
    update(dt, game) {
      this.pool.forEach((e) => e.update(dt, game));
      this.pool.sweep((e) => !e.alive);
    }
    render(ctx) { this.pool.forEach((e) => e.render(ctx)); }
    forEach(fn) { this.pool.forEach(fn); }
  }

  TG.Enemy = Enemy;
  TG.enemies = new EnemySystem();
  TG.ENEMY_TYPES = TYPES;
})(window.TG = window.TG || {});
