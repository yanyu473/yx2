/* =====================================================================
 * player.js — 玩家坦克
 *   - 4 种角色，各自属性/技能侧重不同
 *   - 移动 WASD/方向键；射击 空格/鼠标(瞄准)；技能 Q护盾 E清屏 R投降
 *   - 自动射击开关 / 火力等级 / 护盾 / 道具计时
 * ===================================================================== */
(function (TG) {
  'use strict';

  // 角色定义：HP / 速度 / 火力(基础伤害+射速) / 射速cd / 子弹速度 / 颜色 / 技能侧重
  const CHARS = [
    {
      id: 'guardian', name: '守护者', title: '全能型·均衡战车',
      hp: 120, speed: 175, dmg: 14, fireCd: 0.26, bSpeed: 560, color: '#3ad1ff', accent: '#9bf6ff',
      desc: '攻防均衡的旗舰机型，适合新手与老兵。', tag: '均衡',
    },
    {
      id: 'storm', name: '疾风', title: '突击型·高速游骑',
      hp: 80, speed: 235, dmg: 10, fireCd: 0.18, bSpeed: 640, color: '#7cff8a', accent: '#c8ffd0',
      desc: '机动性极强，快速射击，但身板较脆。', tag: '高速',
    },
    {
      id: 'breaker', name: '重炮', title: '火力型·重型攻坚',
      hp: 150, speed: 140, dmg: 24, fireCd: 0.42, bSpeed: 500, color: '#ffb13a', accent: '#ffe0a0',
      desc: '单发高伤高穿透，移动缓慢，火力压制。', tag: '高伤',
    },
    {
      id: 'phantom', name: '幻影', title: '特战型·量子扰动',
      hp: 95, speed: 200, dmg: 13, fireCd: 0.24, bSpeed: 600, color: '#c06bff', accent: '#e8c8ff',
      desc: '技能冷却更快，护盾与清屏频繁释放。', tag: '特战',
    },
  ];

  class Player {
    constructor(charId, game, pidx) {
      const c = CHARS.find((x) => x.id === charId) || CHARS[0];
      this.char = c;
      this.game = game;
      this.pidx = pidx || 0;  // 0=玩家1, 1=玩家2
      this.W = game.W; this.H = game.H;
      // 双人模式下分屏站位：P1 右下偏移，P2 左下偏移
      if (this.pidx === 1) {
        this.cx = this.W * 0.3; this.cy = this.H * 0.78;
      } else {
        this.cx = game.player2 ? this.W * 0.7 : this.W / 2; // 若有P2则P1偏右，单人居中
        this.cy = this.H * 0.78;
      }
      this.r = 18;                                       // 碰撞半径
      this.maxHp = c.hp; this.hp = c.hp;
      this.speed = c.speed;
      this.dmg = c.dmg;
      this.fireCd = c.fireCd;
      this.bSpeed = c.bSpeed;
      this.color = c.color; this.accent = c.accent;
      this.ang = -Math.PI / 2;                            // 炮塔朝向（默认向上）
      this.fireT = 0;
      this.autoFire = true;
      this.alive = true;                                  // 存活标记
      // 技能冷却（秒）
      this.skShieldCd = 0; this.skShieldMax = c.id === 'phantom' ? 7 : 12;
      this.skClearCd = 0; this.skClearMax = c.id === 'phantom' ? 14 : 20;
      this.shield = 0; this.shieldMax = 4;               // 护盾持续时间
      // 道具增益计时
      this.pwrUp = 1; this.pwrMax = 1;                   // 火力倍率（默认1=满火力）
      this.spdUp = 1; this.spdMax = 1;                  // 速度倍率（默认1=满速度）
      this.scoreMul = 1; this.scoreMulT = 0;
      this.invuln = 1.0;                                  // 出生短暂无敌
      this.thrustT = 0;
      this.flashT = 0;                                    // 受击闪烁
      // 幻影残影系统
      this._trail = [];               // 历史位置记录
      this._trailT = 0;                // 采样计时
      this._lastTrailX = this.cx;     // 上次采样位置
      this._lastTrailY = this.cy;
      // PK 模式下 P2 使用不同的子弹颜色以区分
      if (this.pidx === 1) {
        this.accent = c.id === 'guardian' ? '#ffb13a' : '#ff5a8a';
      }
    }

    // 输入处理（每帧），根据 pidx 使用不同键位
    control(input, dt, mouse) {
      const g = this.game;
      let mx = 0, my = 0;
      if (this.pidx === 0) {
        // 玩家1：WASD
        if (input.has('KeyW')) my -= 1;
        if (input.has('KeyS')) my += 1;
        if (input.has('KeyA')) mx -= 1;
        if (input.has('KeyD')) mx += 1;
      } else {
        // 玩家2：方向键
        if (input.has('ArrowUp')) my -= 1;
        if (input.has('ArrowDown')) my += 1;
        if (input.has('ArrowLeft')) mx -= 1;
        if (input.has('ArrowRight')) mx += 1;
      }
      if (mx || my) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        const sp = this.speed * this.spdUp * dt;
        this.cx = TG.clamp(this.cx + mx * sp, this.r, this.W - this.r);
        this.cy = TG.clamp(this.cy + my * sp, this.r, this.H - this.r);
        // 引擎尾焰
        this.thrustT -= dt;
        if (this.thrustT <= 0) {
          TG.particles.thrust(this.cx, this.cy, Math.atan2(-my, -mx), this.accent);
          this.thrustT = 0.03;
        }
      }
      // 炮塔瞄准：P1 鼠标优先否则自动瞄准；P2 始终自动瞄准最近敌人
      let aimAng = this.ang;
      if (this.pidx === 0 && mouse.active) {
        aimAng = Math.atan2(mouse.y - this.cy, mouse.x - this.cx);
      } else {
        const t = g.nearestEnemy(this.cx, this.cy, this.pidx);
        if (t) aimAng = Math.atan2(t.cy - this.cy, t.cx - this.cx);
      }
      this.ang = TG.turnToward(this.ang, aimAng, 12 * dt);

      // 射击
      this.fireT -= dt;
      let wantShoot = this.autoFire;
      if (this.pidx === 0) {
        wantShoot = input.has('Space') || mouse.down || this.autoFire;
      } else {
        // P2：斜杠键(/) 或 小键盘0(Numpad0)
        wantShoot = input.has('Slash') || input.has('Numpad0') || this.autoFire;
      }
      if (wantShoot && this.fireT <= 0) {
        this.shoot();
        this.fireT = this.fireCd * (this.pwrUp >= 2 ? 0.85 : 1);
      }
    }

    shoot() {
      const g = this.game;
      const ox = this.cx + Math.cos(this.ang) * (this.r + 6);
      const oy = this.cy + Math.sin(this.ang) * (this.r + 6);
      const dmg = this.dmg * this.pwrUp;
      const opts = { color: this.accent, r: 4, pierce: this.pwrUp >= 2 ? 1 : 0, life: 2.2, shape: 'round' };
      // 火力等级越高，散射弹数越多
      const lvl = Math.min(3, Math.floor(this.pwrUp));
      if (lvl <= 1) {
        const b = TG.bullets.fire(ox, oy, this.ang, this.bSpeed, 'player', dmg, opts);
        if (b) b.owner = this.pidx; // 标记子弹所有者（PK模式区分）
      } else {
        const spread = 0.12;
        for (let i = -Math.floor((lvl - 1) / 2); i <= Math.floor((lvl - 1) / 2); i++) {
          const b = TG.bullets.fire(ox, oy, this.ang + i * spread, this.bSpeed, 'player', dmg, opts);
          if (b) b.owner = this.pidx;
        }
      }
      TG.particles.muzzle(ox, oy, this.ang, this.accent);
      TG.audio.sfxShoot();
      g.shake(2, 0.05);
    }

    // 技能：护盾
    skillShield() {
      if (this.skShieldCd > 0 || this.shield > 0) return false;
      this.shield = this.shieldMax;
      this.skShieldCd = this.skShieldMax;
      TG.audio.sfxShield();
      this.game.stats.shieldUsed++;
      this.game.ach.check('shield', this.game.stats.shieldUsed);
      return true;
    }
    // 技能：全屏清屏
    skillClear() {
      if (this.skClearCd > 0) return false;
      this.skClearCd = this.skClearMax;
      TG.audio.sfxClear();
      TG.particles.shockwave(this.cx, this.cy, this.accent);
      this.game.shake(10, 0.4);
      this.game.onClearScreen();
      this.game.stats.clearUsed++;
      this.game.ach.check('clear', this.game.stats.clearUsed);
      return true;
    }

    takeDamage(d, attackerIdx) {
      if (this.invuln > 0 || this.shield > 0) return false;
      this.hp -= d;
      this.flashT = 0.25;
      this.invuln = 0.6;
      TG.audio.sfxHurt();
      this.game.shake(8, 0.25);
      this.game.redFlash(0.5);
      this.game.stats.tookDamage = true;
      this.game.ach.check('hurt', 0);
      if (this.hp <= 0) {
        this.hp = 0; this.alive = false;
        this.game.onPlayerDeath(this.pidx, attackerIdx);
      }
      return true;
    }

    heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }

    applyPowerup(type) {
      const g = this.game;
      switch (type) {
        case 'fire':
          this.pwrUp = Math.min(3, this.pwrUp + 0.5); this.pwrMax = this.pwrUp;
          if (this.pwrUp >= 3) g.ach.unlock('maxfire'); break;
        case 'speed':
          this.spdUp = 1.45; this.spdMax = 1.45; break;
        case 'shield':
          this.shield = Math.max(this.shield, this.shieldMax); break;
        case 'heal':
          this.heal(this.maxHp * 0.35); break;
        case 'score':
          this.scoreMul = 2; this.scoreMulT = 10; break;
      }
      g.stats.powerups++;
      g.ach.check('powerup', g.stats.powerups);
      g.audio.sfxPickup();
      g.toast('拾取道具：' + POWERUP_NAMES[type]);
    }

    update(dt) {
      this.fireT -= 0; // 已在 control 处理
      this.skShieldCd = Math.max(0, this.skShieldCd - dt);
      this.skClearCd = Math.max(0, this.skClearCd - dt);
      this.shield = Math.max(0, this.shield - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.flashT = Math.max(0, this.flashT - dt);
      this.scoreMulT = Math.max(0, this.scoreMulT - dt);
      if (this.scoreMulT <= 0) this.scoreMul = 1;
      if (this.spdMax > 1) { this.spdMax -= dt * 0.0; /* 维持到换档：简化为持续 */ }
      // 护盾环粒子
      if (this.shield > 0) TG.particles.shieldRing(this.cx, this.cy, this.r + 8, this.accent);

      // ====== 幻影残影：记录历史位置 ======
      this._trailT -= dt;
      if (this._trailT <= 0) {
        // 仅在移动时记录残影（位移 >1px 才算移动）
        if (Math.abs(this.cx - this._lastTrailX) > 1 || Math.abs(this.cy - this._lastTrailY) > 1) {
          this._trail.push({ x: this.cx, y: this.cy, ang: this.ang, age: 0 });
          if (this._trail.length > 10) this._trail.shift();   // 限制数量
        }
        this._lastTrailX = this.cx; this._lastTrailY = this.cy;
        this._trailT = 0.04;                                    // 每 40ms 采样
      }
      // 残影老化 + 清理
      for (const t of this._trail) t.age += dt;
      this._trail = this._trail.filter((t) => t.age < 0.3);   // 0.3秒后消失
    }

    render(ctx) {
      // 幻影残影（在车身之前绘制）
      this._renderTrail(ctx);
      ctx.save();
      ctx.translate(this.cx, this.cy);
      // 护盾
      if (this.shield > 0) {
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(performance.now() / 90);
        ctx.strokeStyle = this.accent;
        ctx.lineWidth = 3;
        ctx.shadowColor = this.accent; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(0, 0, this.r + 10, 0, TG.TAU); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // 无敌闪烁
      if (this.invuln > 0 && this.shield <= 0 && Math.floor(this.invuln * 20) % 2 === 0) {
        ctx.globalAlpha = 0.5;
      }
      // 受击红色覆盖
      if (this.flashT > 0) { ctx.globalAlpha *= 0.9; }
      // 车身
      ctx.rotate(this.ang + Math.PI / 2);
      this._drawBody(ctx);
      ctx.restore();

      if (this.flashT > 0) { ctx.globalAlpha = 1; }
    }

    // 绘制幻影残影：历史位置的半透明剪影，随时间淡出
    _renderTrail(ctx) {
      const r = this.r;
      for (const t of this._trail) {
        const a = (1 - t.age / 0.3) * 0.25;  // 最大 25% 透明度，渐隐
        if (a <= 0.01) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(t.x, t.y);
        // 车身剪影
        ctx.rotate(t.ang + Math.PI / 2);
        ctx.shadowColor = this.color; ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        this._roundRect(ctx, -r, -r + 2, r * 2, r * 2 - 4, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        // 炮管剪影
        ctx.rotate(-(t.ang + Math.PI / 2));
        ctx.rotate(t.ang);
        ctx.fillStyle = this.accent;
        ctx.fillRect(0, -3, r + 8, 6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _drawBody(ctx) {
      const r = this.r;
      // 履带
      ctx.fillStyle = '#16243a';
      ctx.fillRect(-r - 4, -r + 2, r * 2 + 8, 5);
      ctx.fillRect(-r - 4, r - 7, r * 2 + 8, 5);
      ctx.fillStyle = '#243a55';
      for (let i = -r; i < r; i += 6) {
        ctx.fillRect(i, -r + 2, 3, 5);
        ctx.fillRect(i, r - 7, 3, 5);
      }
      // 车体
      ctx.shadowColor = this.color; ctx.shadowBlur = 14;
      ctx.fillStyle = this.color;
      this._roundRect(ctx, -r, -r + 2, r * 2, r * 2 - 4, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 装甲条纹
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-r + 3, -r + 6, r * 2 - 6, 3);
      // 核心发光
      ctx.fillStyle = this.accent;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TG.TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TG.TAU); ctx.fill();
      // 炮塔旋转回正以画炮管
      ctx.rotate(-(this.ang + Math.PI / 2));
      // 炮管（朝 ang 方向）
      ctx.rotate(this.ang);
      ctx.fillStyle = this.accent;
      ctx.shadowColor = this.accent; ctx.shadowBlur = 10;
      ctx.fillRect(0, -3, r + 10, 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.fillRect(r + 4, -1.5, 4, 3);
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

    // 碰撞圆
    hitCircle() { return { x: this.cx, y: this.cy, r: this.r - 2 }; }
  }

  const POWERUP_NAMES = { fire: '火力提升', speed: '速度提升', shield: '护盾充能', heal: '生命恢复', score: '分数加倍' };

  TG.Player = Player;
  TG.CHARS = CHARS;
  TG.POWERUP_NAMES = POWERUP_NAMES;
})(window.TG = window.TG || {});
