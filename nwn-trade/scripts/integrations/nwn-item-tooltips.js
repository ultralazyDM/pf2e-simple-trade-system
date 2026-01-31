// modules/nwn-trade/scripts/app/integrations/nwn-item-tooltips.js
// v1.3 — имя, описание, редкость, масса/объём, ЛОКАЛИЗОВАННЫЕ теги PF2e, цены (база/купить/продать).
(function () {
    const MOD = "nwn-trade";
    const CSS = `
  .nwn-item-tip{position:fixed; z-index:99999; max-width:460px; pointer-events:none;
    background: rgba(12,12,16,0.98); border:1px solid rgba(255,255,255,0.08);
    border-radius:12px; box-shadow:0 10px 28px rgba(0,0,0,0.45); padding:12px 14px;
    color:#e9e9ef; font-family: var(--font-primary); }
  .nwn-item-tip h4{margin:0 0 6px; font-size:14px; line-height:1.15}
  .nwn-item-tip .desc{opacity:.85; font-size:12px; line-height:1.25}
  .nwn-item-tip .row{margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center}
  .nwn-item-tip .pill{border:1px solid rgba(255,255,255,.10); border-radius:7px; padding:2px 8px; font-size:12px}
  .nwn-item-tip .pill.rarity-common{border-color:#6d7380}
  .nwn-item-tip .pill.rarity-uncommon{border-color:#4aa3ff}
  .nwn-item-tip .pill.rarity-rare{border-color:#c678dd}
  .nwn-item-tip .pill.rarity-unique{border-color:#f5c542}
  .nwn-item-tip .tags{display:flex; gap:6px; flex-wrap:wrap}
  .nwn-item-tip .tags .tag{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
     border-radius:6px; padding:1px 6px; font-size:11px}
  `;
    let styleEl;
    function ensureStyle() { if (styleEl) return; styleEl = document.createElement("style"); styleEl.id = "nwn-item-tooltips"; styleEl.textContent = CSS; document.head.appendChild(styleEl); }

    const COIN = { cp: 1, sp: 10, gp: 100, pp: 1000 };
    function priceToCp(p) {
        if (!p) return 0; if (typeof p === "number") return Math.max(0, Math.round(p));
        if (typeof p === "string") { const m = p.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(cp|sp|gp|pp)$/); if (m) return Math.round(Number(m[1]) * (COIN[m[2]] || 1)); return 0; }
        const v = p.value || p; let cp = 0; for (const k of ["pp", "gp", "sp", "cp"]) { const n = Number(v?.[k] ?? 0); if (n) cp += Math.round(n * COIN[k]); } return cp;
    }
    function roundBy(stepCp, cp) { if (!stepCp || stepCp <= 1) return Math.round(cp); return Math.round(cp / stepCp) * stepCp; }
    function stringifyCoins(cp) {
        cp = Math.max(0, Math.round(cp)); const parts = []; const pp = Math.floor(cp / 1000); cp %= 1000; const gp = Math.floor(cp / 100); cp %= 100; const sp = Math.floor(cp / 10); cp %= 10;
        if (pp) parts.push(`${pp} pp`); if (gp) parts.push(`${gp} gp`); if (sp) parts.push(`${sp} sp`); if (cp) parts.push(`${cp} cp`); return parts.join(" ") || "0 cp";
    }

    async function resolveItemFromEl(app, el) {
        let uu = el?.dataset?.uuid || el?.getAttribute?.("data-uuid"); if (uu) { try { const d = await fromUuid(uu); if (d) return d; } catch { } }
        let cur = el; for (let i = 0; i < 4 && cur; i++, cur = cur.parentElement) {
            uu = cur.dataset?.uuid || cur.getAttribute?.("data-uuid"); if (uu) { try { const d = await fromUuid(uu); if (d) return d; } catch { } }
            const id = cur.dataset?.itemId || cur.getAttribute?.("data-item-id");
            if (id) { const s = app?.sellerActor?.items?.get?.(id); if (s) return s; const b = app?.buyerActor?.items?.get?.(id); if (b) return b; const g = game.items?.get?.(id); if (g) return g; }
        }
        return null;
    }

    function parseCategoryMults(txt) {
        const res = []; if (!txt) return res; for (const ln of String(txt).split(/\r?\n/)) {
            const m = ln.trim().match(/^(.+?)\s*[x×*]\s*([0-9.]+)$/i); if (m) res.push([m[1].trim().toLowerCase(), Number(m[2])]);
        } return res;
    }

    function computePrices(app, item) {
        try {
            const cfg = app?._traderCfg || {}; const step = (cfg.roundingStepCp ?? 1) | 0; const catMults = parseCategoryMults(cfg.categoryMultipliers);
            const baseCp = priceToCp(item?.system?.price ?? item?.price);
            let profMult = 1.0; try {
                const map = cfg.profMultipliers || { 0: 1.2, 1: 1.1, 2: 1.0, 3: 0.9, 4: 0.8 }; const src = cfg.profSource || "buyer";
                let rank = 2; if (src === "fixed") rank = Number(cfg.profFixedRank ?? 2);
                else if (src === "buyer") rank = Number(app?.buyerActor?.system?.skills?.soc?.rank ?? app?.buyerActor?.system?.skills?.diplomacy?.rank ?? 0);
                else if (src === "seller") rank = Number(app?.sellerActor?.system?.skills?.soc?.rank ?? app?.sellerActor?.system?.skills?.diplomacy?.rank ?? 0);
                profMult = Number(map[rank] ?? 1.0);
            } catch { }
            let catMult = 1.0; try {
                const slug = String(item?.system?.slug ?? item?.system?.slug?.value ?? "").toLowerCase();
                for (const [pat, m] of catMults) { if (pat && slug.includes(pat)) { catMult = m; break; } }
            } catch { }
            const buyM = Number(cfg.buyMultiplier ?? 1.00), sellM = Number(cfg.sellMultiplier ?? 0.50);
            const haggle = Number(app?._hagglePct ?? 0);
            const buyCp = roundBy(step, baseCp * profMult * catMult * buyM * (1 - haggle / 100));
            const sellCp = roundBy(step, baseCp * profMult * catMult * sellM);
            return { buyCp, sellCp, baseCp };
        } catch { return { buyCp: 0, sellCp: 0, baseCp: 0 }; }
    }

    // ---- PF2e метаданные ----
    function getRarity(item) {
        const r = item?.system?.traits?.rarity?.value ?? item?.system?.traits?.rarity ?? item?.system?.rarity?.value ?? item?.system?.rarity;
        const v = String(r || "common").toLowerCase(); return ["common", "uncommon", "rare", "unique"].includes(v) ? v : "common";
    }
    function getWeight(item) {
        const w = item?.system?.weight?.value ?? item?.system?.weight ?? item?.system?.bulk?.value ?? item?.system?.bulk ?? null;
        if (w == null) return null; if (typeof w === "object") { const val = w.value ?? w.normal ?? w.light ?? w.heavy; return val ?? JSON.stringify(w); } return w;
    }

    function collectTraitSlugs(item) {
        const res = new Set(); const v = item?.system?.traits?.value; if (Array.isArray(v)) v.forEach(t => res.add(String(t).toLowerCase()));
        const oth = item?.system?.traits?.other?.value; if (Array.isArray(oth)) oth.forEach(t => res.add(String(t).toLowerCase()));
        return [...res].slice(0, 16);
    }
    const startsWithKey = (s) => typeof s === "string" && /^(PF2E\.|ITEM\.|TYPES\.|ACTOR\.|TRAIT\.)/i.test(s);

    function buildTraitDictionaries(item) {
        const PF = globalThis.CONFIG?.PF2E || {};
        // Собираем типовые словари + специализированные
        return [
            PF.traits,
            PF.weaponTraits, PF.armorTraits, PF.equipmentTraits, PF.consumableTraits,
            PF.featTraits, PF.spellTraits, PF.spellOtherTraits,
            PF.magicTraditions, PF.damageTypes, PF.damageTraits,
            PF.preciousMaterials, PF.preciousMaterialGrades,
            PF.runes, PF.weaponGroups, PF.armorGroups
        ].filter(Boolean);
    }

    function localizeTrait(slug, item) {
        const key = String(slug).toLowerCase();
        // 1) Пытаемся найти в словарях
        for (const dict of buildTraitDictionaries(item)) {
            const v = dict?.[key];
            if (v) {
                if (typeof v === "string") {
                    // если значение — i18n-ключ, локализуем
                    if (startsWithKey(v)) { const loc = game.i18n.localize(v); if (loc && loc !== v) return loc; }
                    return v;
                }
                if (typeof v === "object" && v.label) {
                    const lab = v.label;
                    if (startsWithKey(lab)) { const loc = game.i18n.localize(lab); if (loc && loc !== lab) return loc; }
                    return lab;
                }
            }
        }
        // 2) Пробуем прямой i18n-ключ вида PF2E.TraitXxx
        const pascal = key.replace(/(^|-)(\w)/g, (_m, _d, c) => c.toUpperCase());
        const i18nKey = `PF2E.Trait${pascal}`;
        const loc = game.i18n.localize(i18nKey);
        if (loc && loc !== i18nKey) return loc;
        // 3) Аккуратный фолбэк
        return key.replace(/-/g, " ").replace(/^(\w)/, m => m.toUpperCase());
    }

    function getTraitLabels(item) { return [...new Set(collectTraitSlugs(item).map(s => localizeTrait(s, item)).filter(Boolean))]; }

    // ---- Показ/скрытие ----
    let tip, timer, lastTarget;
    function ensureTip() { if (tip) return tip; tip = document.createElement("div"); tip.className = "nwn-item-tip"; tip.style.display = "none"; document.body.appendChild(tip); return tip; }
    function hideTip() { if (timer) { clearTimeout(timer); timer = null; } if (tip) { tip.style.display = "none"; tip.textContent = ""; } lastTarget = null; }
    function scheduleShow(app, el, ev) {
        if (lastTarget === el) return; lastTarget = el; if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                ensureStyle(); ensureTip();
                const item = await resolveItemFromEl(app, el); if (!item) return;
                const rawDesc = String(item?.system?.description?.value ?? item?.system?.description ?? "")
                    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                const short = rawDesc.length > 320 ? (rawDesc.slice(0, 320) + "…") : (rawDesc || game.i18n.localize("No description"));

                const { buyCp, sellCp, baseCp } = computePrices(app, item);
                const rarity = getRarity(item); const weight = getWeight(item); const traits = getTraitLabels(item);
                const rarityLabel = { common: "Обычный", uncommon: "Необычный", rare: "Редкий", unique: "Уникальный" }[rarity] || rarity;
                const traitsHtml = traits.map(t => `<span class="tag">${foundry.utils.escapeHTML(String(t))}</span>`).join("");

                tip.innerHTML = `
          <h4>${foundry.utils.escapeHTML(item.name || "Предмет")}</h4>
          <div class="row">
            <span class="pill rarity-${rarity}">Редкость: ${rarityLabel}</span>
            ${weight != null ? `<span class="pill">Масса: ${foundry.utils.escapeHTML(String(weight))}</span>` : ""}
          </div>
          ${traits.length ? `<div class="row tags">${traitsHtml}</div>` : ""}
          <div class="desc" style="margin-top:8px">${foundry.utils.escapeHTML(short)}</div>
          <div class="row">
            <span class="pill">База: ${stringifyCoins(baseCp)}</span>
            <span class="pill">Купить: ${stringifyCoins(buyCp)}</span>
            <span class="pill">Продать: ${stringifyCoins(sellCp)}</span>
          </div>`;
                positionNear(ev?.clientX ?? 0, ev?.clientY ?? 0);
                tip.style.display = "block";
            } catch (e) { console.warn("[nwn-tooltips] show failed", e); }
        }, 600);
    }
    function positionNear(x, y) {
        const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight; let left = x + 16, top = y + 16;
        const vw = window.innerWidth, vh = window.innerHeight; if (left + w + pad > vw) left = Math.max(pad, vw - w - pad); if (top + h + pad > vh) top = Math.max(pad, vh - h - pad);
        tip.style.left = left + "px"; tip.style.top = top + "px";
    }

    Hooks.on("renderTradeApp", (app, html) => {
        const root = html?.[0]; if (!root) return;
        root.addEventListener("pointermove", ev => { if (!tip || tip.style.display === "none") return; positionNear(ev.clientX, ev.clientY); });
        root.addEventListener("pointerleave", hideTip);
        root.addEventListener("scroll", hideTip, true);
        root.addEventListener("pointerenter", (ev) => {
            const el = ev.target; if (!(el instanceof HTMLElement)) return;
            if (el.closest?.(".nwn-slot, .item, [data-item-id], [data-uuid]")) scheduleShow(app, el, ev);
        }, true);
        root.addEventListener("pointerout", (ev) => { const to = ev.relatedTarget; if (tip && to && tip.contains(to)) return; hideTip(); }, true);
    });

    Hooks.once("ready", () => console.info("[nwn-item-tooltips] v1.3 loaded"));
})();
