/* nwn-trade :: Торговля/Бартер, v3.6
   – Торговля: быстрые сделки кликом + превью цены на бейдже (не мешает тултипам PF2e).
   – Бартер: чипы ×1/×10/½/Max, Alt=½, Ctrl/Cmd=×10 — БЕЗ диалога, сразу в корзину.
   – Режим не сбрасывается.
   – Осторожный ховер-тултип (имя, редкость, масса, теги, описание, цены), рендерится в <body>, игнорирует скрытые фильтром.
*/
(() => {
    const MOD = "nwn-trade";
    const $ = (r, s) => r?.querySelector(s);
    const $$ = (r, s) => Array.from(r?.querySelectorAll(s) || []);
    const TXT = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    const ESC = (s) => (globalThis?.foundry?.utils?.escapeHTML?.(s) ?? String(s));

    const RE_TRADE_TEXT = /^(торговля|обмен|exchange|trade|retail|obmen)$/i;
    const RE_BARTER_TEXT = /^(бартер|barter)$/i;
    const TRADE_TABS = new Set(["trade", "exchange", "retail", "obmen"]);
    const BARTER_TABS = new Set(["barter"]);

    Hooks.on("renderTradeApp", (app, html) => {
        try {
            const root = html?.[0]; if (!root) return;
            root.classList.add("nwn-retail");
            ensureCSS();
            wireTabs(root, app);

            const startMode = app.__nwnRetailMode || detectModeFromTabs(root) || "barter";
            applyMode(root, app, startMode, { setTabActive: true });

            hookInventoryInteractions(root, app);
            installHoverTooltip(root, app);
        } catch (e) { console.error(`[${MOD}] retail-mode v3.6`, e); }
    });

    /* ---------- вкладки ---------- */
    function findTabItems(root) {
        const items = $$(root, ".tabs .item, .tabs [data-tab], .item[data-tab]");
        return items.filter(el => {
            const k = String(el.dataset?.tab || "").toLowerCase();
            const t = TXT(el);
            return TRADE_TABS.has(k) || BARTER_TABS.has(k) || RE_TRADE_TEXT.test(t) || RE_BARTER_TEXT.test(t);
        });
    }
    function wireTabs(root, app) {
        if (root.__nwnRetailTabsWired) return;
        root.__nwnRetailTabsWired = true;

        const items = findTabItems(root);
        items.forEach(el => el.addEventListener("click", () => {
            const k = String(el.dataset?.tab || "").toLowerCase();
            const t = TXT(el);
            if (TRADE_TABS.has(k) || RE_TRADE_TEXT.test(t)) applyMode(root, app, "trade", { setTabActive: true });
            else if (BARTER_TABS.has(k) || RE_BARTER_TEXT.test(t)) applyMode(root, app, "barter", { setTabActive: true });
        }, true));

        const mo = new MutationObserver(() => {
            if (root.__nwnApplying) return;
            const detected = detectModeFromTabs(root);
            const preferred = app.__nwnRetailMode;
            if (preferred && detected && preferred !== detected) {
                applyMode(root, app, preferred, { setTabActive: true });
                return;
            }
            if (detected) applyMode(root, app, detected, { setTabActive: false });
        });
        mo.observe(root.querySelector(".tabs") || root, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-pressed"] });
        root.__nwnRetailTabsMO = mo;
    }
    function detectModeFromTabs(root) {
        let trade = false, barter = false;
        for (const el of findTabItems(root)) {
            const k = String(el.dataset?.tab || "").toLowerCase();
            const t = TXT(el);
            const isTrade = TRADE_TABS.has(k) || RE_TRADE_TEXT.test(t);
            const isBarter = BARTER_TABS.has(k) || RE_BARTER_TEXT.test(t);
            const active = el.classList.contains("active") || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true";
            if (isTrade && active) trade = true;
            if (isBarter && active) barter = true;
        }
        if (trade && !barter) return "trade";
        if (barter && !trade) return "barter";
        return null;
    }
    function setTabsActive(root, mode) {
        root.__nwnApplying = true;
        try {
            for (const el of findTabItems(root)) {
                const k = String(el.dataset?.tab || "").toLowerCase();
                const t = TXT(el);
                const on = (mode === "trade" && (TRADE_TABS.has(k) || RE_TRADE_TEXT.test(t)))
                    || (mode === "barter" && (BARTER_TABS.has(k) || RE_BARTER_TEXT.test(t)));
                el.classList.toggle("active", on);
                if (on) el.setAttribute("aria-selected", "true"); else el.removeAttribute("aria-selected");
            }
        } finally { root.__nwnApplying = false; }
    }

    /* ---------- режим ---------- */
    function ensureCSS() {
        if (document.getElementById("nwn-retail-css")) return;
        const s = document.createElement("style");
        s.id = "nwn-retail-css";
        s.textContent = `
      .nwn-retail .nwn-retail-hint{display:inline-block;flex:0 0 auto;width:auto;max-width:100%;margin:0 0 8px;padding:6px 10px;border:1px solid var(--color-border-dark-4);border-radius:8px;font-size:12px;opacity:.85}
      .nwn-retail[data-nwn-mode="trade"] [data-area="give"],
      .nwn-retail[data-nwn-mode="trade"] [data-area="take"]{display:none!important}
      .nwn-retail[data-nwn-mode="trade"] .nwn-retail-side{flex:1 1 0; min-width:0}
      .nwn-retail[data-nwn-mode="trade"] .nwn-retail-grid{display:flex; gap:12px}

      .nwn-cell-wrap{position:relative}
      .nwn-qbadge{position:absolute; right:6px; bottom:6px; padding:2px 6px; font-size:11px; border-radius:6px;
                  background:rgba(0,0,0,.55); border:1px solid var(--color-border-dark-4); color:#fff; z-index:2}
      .nwn-qbadge:not(.interactive){pointer-events:none}
      .nwn-chips{display:flex; gap:4px; align-items:center}
      .nwn-chip{display:inline-block; padding:1px 6px; font-size:11px; border-radius:5px; background:rgba(255,255,255,.12);
                border:1px solid rgba(255,255,255,.25); cursor:pointer; user-select:none}
      .nwn-chip:hover{background:rgba(255,255,255,.18)}
      .nwn-chip:active{transform:translateY(1px)}

      /* Тултип (в body), не перехватывает события мыши */
      .nwn-item-tip{
        position: fixed;
        z-index: 100000;
        max-width: 460px;
        background: rgba(18,18,22,.97);
        color: #fff;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 10px;
        box-shadow: 0 12px 36px rgba(0,0,0,.45);
        padding: 10px 12px;
        pointer-events: none;
      }
      .nwn-item-tip h4{ margin: 0 0 6px; font-weight: 700; }
      .nwn-item-tip .row{ display:flex; gap:8px; flex-wrap:wrap; margin:4px 0 8px; }
      .nwn-item-tip .pill{ padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #222; border: 1px solid rgba(255,255,255,.08); }
      .nwn-item-tip .muted{ opacity:.9; font-size: 12px; }
    `;
        document.head.appendChild(s);
    }
    function applyMode(root, app, mode, { setTabActive = false } = {}) {
        mode = mode === "trade" ? "trade" : "barter";
        if (root.dataset.nwnMode === mode && !setTabActive) return;

        app.__nwnRetailMode = mode;
        root.dataset.nwnMode = mode;

        if (setTabActive) setTabsActive(root, mode);

        const showBarter = (mode === "barter");
        toggleBaskets(root, showBarter);
        toggleFooterButtons(root, showBarter);
        ensureHint(root, showBarter);
        layoutSides(root, showBarter);
    }
    function toggleFooterButtons(root, showBarter) {
        const footer = root.querySelector(".trade-footer, .nwn-trade-footer") || root;
        const btns = Array.from(footer?.querySelectorAll("button, a") || []);
        const match = (b, ...names) => names.includes(TXT(b).toLowerCase());
        const cmp = btns.find(b => match(b, "сравнить", "compare"));
        const exch = btns.find(b => match(b, "обменять", "exchange"));
        [cmp, exch].forEach(b => { if (b) b.style.display = showBarter ? "" : "none"; });
    }
    function ensureHint(root, _showBarter) {
        for (const el of document.querySelectorAll(".nwn-retail-hint")) if (!root.contains(el)) el.remove();
        const content = root.querySelector(".window-content") || root;
        let hint = root.querySelector(".nwn-retail-hint");
        if (!hint) { hint = document.createElement("div"); hint.className = "nwn-retail-hint"; content.prepend(hint); }
        else if (!content.contains(hint)) content.prepend(hint);
        hint.textContent = "ЛКМ — 1; Ctrl/Cmd — ×10; Alt — половина; Shift — ввести. В Бартере доступны чипы ×1/×10/½/Max на карточке.";
    }

    /* ---------- скрытие корзин + раскладка ---------- */
    function toggleBaskets(root, showBarter) {
        const give = root.querySelector('[data-area="give"]');
        const take = root.querySelector('[data-area="take"]');
        [give, take].forEach(el => { if (el) el.style.display = showBarter ? "" : "none"; });

        hideBetweenByStructure(root, showBarter);
        hideBetweenByGeometry(root, showBarter);
    }
    function findSideContainers(root) {
        const content = root.querySelector(".window-content") || root;
        const reInv = /(инвентарь игрока|inventory)/i;
        const reShop = /(товары торговца|seller|shop)/i;
        const heads = $$(content, "legend, .legend, .header, .title, h2, h3");
        const hInv = heads.find(h => reInv.test(TXT(h)));
        const hShop = heads.find(h => reShop.test(TXT(h)));
        const invCont = hInv ? (hInv.closest(".panel, section, fieldset, .card, .group") || hInv.parentElement) : null;
        const shopCont = hShop ? (hShop.closest(".panel, section, fieldset, .card, .group") || hShop.parentElement) : null;
        const common = invCont && shopCont ? closestCommon(invCont, shopCont) : null;
        return [invCont, shopCont, common];
    }
    function closestCommon(a, b) { const s = new Set(); for (let x = a; x; x = x.parentElement) s.add(x); for (let y = b; y; y = y.parentElement) if (s.has(y)) return y; return null; }
    function hideBetweenByStructure(root, showBarter) {
        const [invCont, shopCont, common] = findSideContainers(root);
        if (!invCont || !shopCont || !common) return;
        const kids = Array.from(common.children).filter(n => n.nodeType === 1);
        const iA = kids.findIndex(n => n.contains(invCont));
        const iB = kids.findIndex(n => n.contains(shopCont));
        if (iA < 0 || iB < 0 || iA >= iB) return;
        for (let i = iA + 1; i <= iB - 1; i++) kids[i].style.display = showBarter ? "" : "none";
    }
    function hideBetweenByGeometry(root, showBarter) {
        const [invCont, shopCont] = findSideContainers(root);
        if (!invCont || !shopCont) return;
        const invBox = invCont.getBoundingClientRect();
        const shopBox = shopCont.getBoundingClientRect();
        const leftX = invBox.right + 5, rightX = shopBox.left - 5;

        const content = root.querySelector(".window-content") || root;
        for (const el of $$(content, "*")) {
            if (!(el instanceof HTMLElement)) continue;
            if (el.contains(invCont) || el.contains(shopCont) || invCont.contains(el) || shopCont.contains(el)) continue;
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            if (r.width < 80 || r.height < 80) continue;
            const centerX = r.left + r.width / 2;
            const between = centerX > leftX && centerX < rightX;
            const vertOK = !(r.bottom < Math.min(invBox.top, shopBox.top) || r.top > Math.max(invBox.bottom, shopBox.bottom));
            if (between && vertOK) el.style.display = showBarter ? "" : "none";
        }
    }
    function layoutSides(root, showBarter) {
        const [invCont, shopCont, common] = findSideContainers(root);
        if (!invCont || !shopCont || !common) return;
        invCont.classList.toggle("nwn-retail-side", !showBarter);
        shopCont.classList.toggle("nwn-retail-side", !showBarter);
        common.classList.toggle("nwn-retail-grid", !showBarter);
        if (showBarter) {
            invCont.style.removeProperty("flex"); shopCont.style.removeProperty("flex");
            common.style.removeProperty("display"); common.style.removeProperty("gap");
            for (const el of Array.from(common.children)) el.style.removeProperty("display");
        } else {
            invCont.style.display = ""; shopCont.style.display = "";
        }
    }

    /* ---------- быстрые сделки / бартер ---------- */
    function unitPriceCp(app, item, area) {
        const base = app._baseItemPriceCopper(item);
        const cfg = app._traderCfg || app._loadTraderConfig?.() || {};
        let cp = app._applyPriceModifiers(base, item, area, cfg);
        const p = app._hagglePercent || 0;
        if (p) {
            if (area === "take") cp = Math.max(0, Math.floor(cp * (1 - p / 100)));
            else if (area === "give") cp = Math.max(0, Math.floor(cp * (1 + p / 100)));
        }
        return cp;
    }
    function computeQty(ev, have) {
        if (ev.shiftKey) return null;
        if (ev.altKey) return Math.max(1, Math.ceil(have / 2));
        const isCtrl = ev.ctrlKey || ev.metaKey;
        if (isCtrl) return Math.max(1, Math.min(10, have));
        return 1;
    }

    // универсально: добавить qty в корзину «give/take» (если есть быстрый метод — используем; иначе эмулируем клики)
    async function addToBarterBasket(app, cell, qty) {
        qty = Math.max(1, qty | 0);
        const area = cell.dataset.area || cell.closest?.("[data-area]")?.dataset?.area || "";
        const isSeller = area === "seller";
        const actor = isSeller ? app.sellerActor : app.buyerActor;
        const item = actor?.items?.get?.(cell.dataset.itemId) || actor?.items?.find?.(i => i.id === cell.dataset.itemId);
        if (!item) return;

        const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? cell?.dataset?.qty ?? 1) || 1;
        const q = Math.max(1, Math.min(qty, have));

        // 1) если у приложения есть явный API — используем
        const direct = app._barterAddItem || app._addToBasket || app.addToBasket;
        if (typeof direct === "function") {
            try {
                const target = isSeller ? "take" : "give";
                await direct.call(app, { actor, item, qty: q, target });
                return;
            } catch (e) { console.warn(`[${MOD}] direct basket add failed, fallback to clicks`, e); }
        }

        // 2) иначе — «кликаем» q раз (обычный клик в бартере = +1 в корзину)
        for (let i = 0; i < q; i++) {
            cell.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 10));
        }
    }

    function hookInventoryInteractions(root, app) {
        if (root.__nwnRetailClicksWired) return;
        root.__nwnRetailClicksWired = true;

        const gridEls = $$(root, ".grid");

        // бейдж / чипы
        const onEnter = (ev) => {
            const cell = ev.target?.closest?.(".grid .cell, .cell, .item, [data-item-id]");
            if (!cell) return;
            root.__nwnHoverCell = cell;
            cell.classList.add("nwn-cell-wrap");
            updateBadge(root, app, cell, ev);
        };
        const onLeave = (ev) => {
            const cell = ev.target?.closest?.(".grid .cell, .cell, .item, [data-item-id]");
            if (!cell) return;
            root.__nwnHoverCell = null;
            const b = cell.querySelector(".nwn-qbadge"); if (b) b.remove();
            cell.classList.remove("nwn-cell-wrap");
        };
        gridEls.forEach(g => {
            g.addEventListener("pointerenter", onEnter, true);
            g.addEventListener("pointerleave", onLeave, true);
            g.addEventListener("mousemove", (e) => { if (root.__nwnHoverCell) updateBadge(root, app, root.__nwnHoverCell, e); }, true);
        });
        const keyUpd = (e) => { if (root.__nwnHoverCell) updateBadge(root, app, root.__nwnHoverCell, e); };
        root.addEventListener("keydown", keyUpd, true);
        root.addEventListener("keyup", keyUpd, true);

        // клики по чипам
        root.addEventListener("click", async (ev) => {
            const chip = ev.target?.closest?.(".nwn-chip"); if (!chip) return;
            ev.stopImmediatePropagation(); ev.stopPropagation(); ev.preventDefault();
            const cell = chip.closest(".nwn-cell-wrap") || chip.closest(".cell") || chip.closest("[data-item-id]");
            if (!cell) return;

            const mode = root.dataset.nwnMode || "barter";
            if (mode !== "barter") return; // чипы только в бартере

            const qStr = chip.dataset.q || "1";
            let qty = qStr === "half" ? NaN : Number(qStr);
            if (isNaN(qty)) {
                const area = cell.dataset.area || cell.closest?.("[data-area]")?.dataset?.area || "";
                const isSeller = area === "seller";
                const actor = isSeller ? app.sellerActor : app.buyerActor;
                const item = actor?.items?.get?.(cell.dataset.itemId) || actor?.items?.find?.(i => i.id === cell.dataset.itemId);
                const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? cell?.dataset?.qty ?? 1) || 1;
                qty = Math.max(1, Math.ceil(have / 2));
            }
            await addToBarterBasket(app, cell, qty);
        }, true);

        // клики по ячейке
        const onClick = async (ev) => {
            const mode = root.dataset.nwnMode || "barter";
            const cell = ev.target?.closest?.(".grid .cell, .cell, .item, [data-item-id]");
            if (!cell) return;

            if (mode === "barter") {
                // Ctrl/Cmd — ×10 без диалога. Alt — половина без диалога. Shift — штатный диалог (ничего не делаем)
                if (ev.ctrlKey || ev.metaKey || ev.altKey) {
                    const area = cell.dataset.area || cell.closest?.("[data-area]")?.dataset?.area || "";
                    const isSeller = area === "seller";
                    const actor = isSeller ? app.sellerActor : app.buyerActor;
                    const item = actor?.items?.get?.(cell.dataset.itemId) || actor?.items?.find?.(i => i.id === cell.dataset.itemId);
                    const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? cell?.dataset?.qty ?? 1) || 1;
                    const qty = ev.altKey ? Math.max(1, Math.ceil(have / 2)) : Math.max(1, Math.min(10, have));
                    ev.stopImmediatePropagation(); ev.preventDefault();
                    await addToBarterBasket(app, cell, qty);
                    return;
                }
                return; // обычный бартер: стандартный клик = +1
            }

            // Торговля — быстрые сделки
            ev.stopImmediatePropagation(); ev.stopPropagation(); ev.preventDefault();

            const area = cell.dataset.area || cell.closest?.("[data-area]")?.dataset?.area || "";
            const isSeller = area === "seller";
            const actor = isSeller ? app.sellerActor : app.buyerActor;
            const item = actor?.items?.get?.(cell.dataset.itemId) || actor?.items?.find?.(i => i.id === cell.dataset.itemId);
            if (!item) return;

            const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? cell.dataset?.qty ?? 1) || 1;
            let qty = computeQty(ev, have);
            if (qty === null) {
                qty = await app._askQuantity({ initial: 1, min: 1, max: Math.max(1, have) });
                if (!qty) return;
            }

            try {
                if (isSeller) await quickBuy(app, item, qty);
                else await quickSell(app, item, qty);
                app.__nwnRetailMode = "trade";
                app.render(true);
            } catch (e) { console.error(`[${MOD}] quick trade`, e); }
        };
        gridEls.forEach(g => g.addEventListener("click", onClick, true));
    }

    function updateBadge(root, app, cell, ev) {
        try {
            const mode = root.dataset.nwnMode || "barter";
            const area = cell.dataset.area || cell.closest?.("[data-area]")?.dataset?.area || "";
            const isSeller = area === "seller";
            const actor = isSeller ? app.sellerActor : app.buyerActor;
            const item = actor?.items?.get?.(cell.dataset.itemId) || actor?.items?.find?.(i => i.id === cell.dataset.itemId);
            if (!item) return;

            const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? cell.dataset?.qty ?? 1) || 1;

            let badge = cell.querySelector(".nwn-qbadge");
            if (!badge) { badge = document.createElement("div"); badge.className = "nwn-qbadge"; cell.appendChild(badge); }

            if (mode === "trade") {
                badge.classList.remove("interactive");
                const per = unitPriceCp(app, item, isSeller ? "take" : "give");
                const qty = computeQty(ev, have);
                const text = qty === null
                    ? "Shift → ввести"
                    : `${isSeller ? "Купить" : "Продать"}: ×${qty} = ${app._formatGoldString?.(per * qty) || (per * qty + " cp")}`;
                if (badge.textContent !== text) badge.textContent = text;
            } else {
                if (!badge.classList.contains("interactive") || badge.dataset.mode !== "chips") {
                    badge.classList.add("interactive");
                    badge.dataset.mode = "chips";
                    badge.innerHTML = `
            <div class="nwn-chips">
              <span class="nwn-chip" data-q="1">×1</span>
              <span class="nwn-chip" data-q="10">×10</span>
              <span class="nwn-chip" data-q="half">½</span>
              <span class="nwn-chip" data-q="${have}">Max</span>
            </div>`;
                }
            }
        } catch (_) { }
    }

    /* ---------- быстрые операции (торговля) ---------- */
    async function quickBuy(app, item, qty) {
        qty = Math.max(1, Number(qty) || 1);
        const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? 1) || 1;
        if (have < qty) { ui.notifications?.warn?.("У торговца недостаточно этого товара."); return; }

        const per = unitPriceCp(app, item, "take");
        const total = per * qty;

        const buyerCp = app._coinsToCopper(app._coinsFor(app.buyerActor).flat);
        if (buyerCp < total) { ui.notifications?.warn?.(`Не хватает средств (нужно ${app._formatGoldString(total)}).`); return; }

        await app._moveItemsBetweenActors(app.sellerActor, app.buyerActor, [{ id: item.id, qty }]);
        await app._applyCoinsDelta(app.buyerActor, app._copperToCoins(-total));
        await app._applyCoinsDelta(app.sellerActor, app._copperToCoins(+total));

        ui.notifications?.info?.(`Куплено: ${item.name} × ${qty} за ${app._formatGoldString(total)}.`);
    }
    async function quickSell(app, item, qty) {
        qty = Math.max(1, Number(qty) || 1);
        const have = Number(item?.system?.quantity?.value ?? item?.system?.quantity ?? 1) || 1;
        if (have < qty) { ui.notifications?.warn?.("У вас недостаточно этого предмета."); return; }

        const per = unitPriceCp(app, item, "give");
        const total = per * qty;

        await app._moveItemsBetweenActors(app.buyerActor, app.sellerActor, [{ id: item.id, qty }]);
        await app._applyCoinsDelta(app.sellerActor, app._copperToCoins(-total));
        await app._applyCoinsDelta(app.buyerActor, app._copperToCoins(+total));

        ui.notifications?.info?.(`Продано: ${item.name} × ${qty} за ${app._formatGoldString(total)}.`);
    }

    /* ---------- Ховер-тултип (осторожный) ---------- */
    function installHoverTooltip(root, app) {
        if (root.__nwnTooltipWired) return;
        root.__nwnTooltipWired = true;

        const scope = root.querySelector(".window-content") || root;

        let tip = document.getElementById("nwn-item-tip");
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "nwn-item-tip";
            tip.className = "nwn-item-tip";
            tip.style.display = "none";
            document.body.appendChild(tip);
        }

        let overCell = null, timer = null, visible = false;

        const findItemById = (id) =>
            app?.buyerActor?.items?.get?.(id) || app?.sellerActor?.items?.get?.(id) || null;

        const onOver = (ev) => {
            // игнор: чипы/бейдж, чтобы не мигал
            if (ev.target?.closest?.(".nwn-qbadge, .nwn-chip")) return;

            const cell = ev.target.closest?.("[data-item-id]");
            if (!cell || cell.classList.contains("nwn-hide-by-filter")) return;
            if (overCell === cell) return;

            overCell = cell;
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const id = overCell?.dataset?.itemId;
                if (!id) return;
                const item = findItemById(id);
                if (!item) return;

                renderTip(app, tip, item);
                tip.style.display = "block";
                visible = true;
                placeNearCursor(tip, ev.clientX, ev.clientY);
            }, 200);
        };
        const onMove = (ev) => { if (visible) placeNearCursor(tip, ev.clientX, ev.clientY); };
        const onOut = (ev) => {
            if (overCell && ev.relatedTarget && overCell.contains(ev.relatedTarget)) return;
            clearTimeout(timer); overCell = null; visible = false; tip.style.display = "none";
        };

        scope.addEventListener("mouseover", onOver);
        scope.addEventListener("mousemove", onMove);
        scope.addEventListener("mouseout", onOut);

        Hooks.once("closeTradeApp", () => { tip.style.display = "none"; });
    }

    function placeNearCursor(tip, cx, cy) {
        const padX = 18, padY = 16;
        const w = tip.offsetWidth || 360;
        const h = tip.offsetHeight || 120;
        let x = cx + padX, y = cy + padY;
        if (x + w > window.innerWidth - 8) x = Math.max(8, cx - w - 12);
        if (y + h > window.innerHeight - 8) y = Math.max(8, cy - h - 12);
        if (y < 8) y = 8; if (x < 8) x = 8;
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
    }

    function renderTip(app, tip, item) {
        const sys = item.system ?? {};

        // Редкость (локализация по возможности)
        const rarityRaw = (sys?.traits?.rarity || sys?.rarity || "common").toString();
        const rarityLoc = game.i18n?.localize?.(`PF2E.Item.Rarity.${rarityRaw}`) || rarityRaw;

        // Масса (bulk/weight)
        const weight = sys?.weight?.value ?? sys?.weight ?? 0;

        // Тэги PF2e
        let traits = [];
        if (Array.isArray(sys?.traits?.value)) traits = sys.traits.value;
        else if (Array.isArray(sys?.traits)) traits = sys.traits;
        const traitsNice = traits
            .map(t => game.i18n?.localize?.(`PF2E.Trait${String(t).toUpperCase()}`) || String(t))
            .filter(Boolean);

        // Цены
        let buy = null, sell = null;
        try {
            buy = unitPriceCp(app, item, "take");
            sell = unitPriceCp(app, item, "give");
        } catch { }

        tip.innerHTML = `
          <h4>${ESC(item.name)}</h4>
          <div class="row">
            <span class="pill">${ESC(game.i18n?.localize?.("PF2E.Item.RarityLabel") || "Редкость")}: ${ESC(rarityLoc)}</span>
            <span class="pill">${ESC(game.i18n?.localize?.("PF2E.BulkLabel") || "Масса")}: ${weight}</span>
          </div>
          ${traitsNice.length ? `<div class="row">${traitsNice.map(t => `<span class="pill">${ESC(t)}</span>`).join("")}</div>` : ""}
          ${sys?.description?.value ? `<div class="muted">${sys.description.value}</div>` : ""}
          <div class="row">
            ${buy != null ? `<span class="pill">${ESC(game.i18n?.localize?.("NWNDialog.Price.Buy") || "Купить")}: ${app._formatGoldString?.(buy) || `${buy} р`}</span>` : ""}
            ${sell != null ? `<span class="pill">${ESC(game.i18n?.localize?.("NWNDialog.Price.Sell") || "Продать")}: ${app._formatGoldString?.(sell) || `${sell} р`}</span>` : ""}
          </div>
        `;
    }

    Hooks.once("ready", () => console.info("[nwn-retail-mode v3.6] ready"));
})();
