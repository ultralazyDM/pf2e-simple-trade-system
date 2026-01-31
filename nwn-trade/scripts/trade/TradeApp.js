const MODULE_ID = "nwn-trade";
const modPath = () => game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;

/* -------- Coin icons (PF2e fixed paths) -------- */
function coinIconsInitial() {
    return {
        pp: "systems/pf2e/icons/equipment/treasure/currency/platinum-pieces.webp",
        gp: "systems/pf2e/icons/equipment/treasure/currency/gold-pieces.webp",
        sp: "systems/pf2e/icons/equipment/treasure/currency/silver-pieces.webp",
        cp: "systems/pf2e/icons/equipment/treasure/currency/copper-pieces.webp"
    };
}

/* -------- Data helpers -------- */
function readCoins(actor) {
    const sys = actor?.system ?? {};
    const cur = sys.currency ?? sys.currencies ?? sys.treasure ?? {};
    let pp = Number(cur.pp ?? cur.platinum ?? 0) || 0;
    let gp = Number(cur.gp ?? cur.gold ?? 0) || 0;
    let sp = Number(cur.sp ?? cur.silver ?? 0) || 0;
    let cp = Number(cur.cp ?? cur.copper ?? 0) || 0;

    const byName = (n) => {
        n = String(n || "").toLowerCase();
        if (n.includes("plat") || n.includes("плат")) return "pp";
        if (n.includes("gold") || n.includes("зол")) return "gp";
        if (n.includes("silver") || n.includes("сереб")) return "sp";
        if (n.includes("copper") || n.includes("мед")) return "cp";
        return null;
    };
    for (const it of actor?.items ?? []) {
        if ((it.type ?? it?.system?.type) !== "treasure") continue;
        const isCoins =
            (it.system?.stackGroup ?? "") === "coins" || /coin|монет/i.test(it.name);
        if (!isCoins) continue;
        const denom =
            String(
                it.system?.denomination ??
                it.system?.denomination?.value ??
                it.system?.coinType ??
                it.system?.currency ??
                ""
            ).toLowerCase() || byName(it.name);
        const qty =
            Number(it.system?.quantity ?? it.system?.qty ?? it.system?.stackSize ?? 0) ||
            0;
        if (denom === "pp") pp += qty;
        else if (denom === "gp") gp += qty;
        else if (denom === "sp") sp += qty;
        else if (denom === "cp") cp += qty;
    }
    return { pp, gp, sp, cp };
}

function readSellableItems(actor) {
    const deny = new Set(["melee", "spell", "action", "feat", "effect", "lore", "condition", "ritual"]);
    return (actor?.items ?? [])
        .filter((i) => {
            const t = i.type ?? i?.system?.type ?? "";
            if (deny.has(t)) return false;
            if (t === "treasure" && (i.system?.stackGroup ?? "") === "coins") return false;
            return [
                "weapon",
                "armor",
                "equipment",
                "consumable",
                "treasure",
                "backpack",
                "shield",
                "wand",
                "staff",
                "ammunition",
                "rune"
            ].includes(t);
        })
        .map((i) => ({
            id: i.id,
            name: i.name,
            img: i.img || "icons/svg/mystery-man.svg",
            qty: Number(i.system?.quantity ?? i.system?.qty ?? 1) || 1,
            type: i.type,
            _ref: i
        }));
}

function priceToCp(item) {
    const sys = item?._ref?.system ?? item?.system ?? {};
    const cv = Number(sys?.price?.copperValue ?? NaN);
    if (Number.isFinite(cv)) return Math.max(0, cv);
    const pv = sys?.price?.value;
    if (typeof pv === "number") return Math.max(0, Math.round(pv * 100));
    if (typeof pv === "string") {
        const m = pv.match(/([\d.]+)\s*(pp|gp|sp|cp)/i);
        if (m) {
            const val = Number(m[1]) || 0;
            const u = m[2].toLowerCase();
            const mult = u === "pp" ? 1000 : u === "gp" ? 100 : u === "sp" ? 10 : 1;
            return Math.max(0, Math.round(val * mult));
        }
    }
    if (pv && typeof pv === "object") {
        const pp = Number(pv.pp ?? 0) || 0,
            gp = Number(pv.gp ?? 0) || 0,
            sp = Number(pv.sp ?? 0) || 0,
            cp = Number(pv.cp ?? 0) || 0;
        return Math.max(0, pp * 1000 + gp * 100 + sp * 10 + cp);
    }
    const alt = Number(sys?.value?.value ?? NaN);
    if (Number.isFinite(alt)) return Math.max(0, Math.round(alt * 100));
    return 0;
}

function stackToOffer(offer, item, qty = 1) {
    let row = offer.find((r) => r.id === item.id);
    if (!row) {
        row = {
            id: item.id,
            name: item.name,
            img: item.img,
            qty: 0,
            priceCp: priceToCp(item),
            kind: "item",
            totalCp: 0
        };
        offer.push(row);
    }
    row.qty = Math.min((row.qty || 0) + qty, item.qty);
    row.totalCp = row.qty * (row.priceCp || 0);
}

function cpToChangeNoPP(cp) {
    let rest = Math.max(0, Math.round(cp));
    const gp = Math.floor(rest / 100);
    rest -= gp * 100;
    const sp = Math.floor(rest / 10);
    rest -= sp * 10;
    return { gp, sp, cp: rest };
}
function pushCoins(offer, denom, qty) {
    if (!qty) return;
    const id = `coin-${denom}`;
    let row = offer.find((r) => r.id === id && r.kind === "coin");
    if (!row) {
        row = {
            id,
            name: denom.toUpperCase(),
            img: coinIconsInitial()[denom],
            qty: 0,
            priceCp: { gp: 100, sp: 10, cp: 1 }[denom],
            kind: "coin",
            totalCp: 0
        };
        offer.push(row);
    }
    row.qty += qty;
    row.totalCp = row.qty * row.priceCp;
}
function cpToMixedNoPP(cp) {
    const mix = cpToChangeNoPP(cp);
    const any = mix.gp > 0 || mix.sp > 0 || mix.cp > 0;
    const showCp = mix.cp > 0 || (!mix.gp && !mix.sp);
    return { ...mix, any, showCp };
}

/* currency helpers */
function getCurrency(actor) {
    const cur = foundry.utils.duplicate(
        actor.system?.currency ?? actor.system?.currencies ?? {}
    );
    return {
        gp: Number(cur.gp ?? cur.gold ?? 0) || 0,
        sp: Number(cur.sp ?? cur.silver ?? 0) || 0,
        cp: Number(cur.cp ?? cur.copper ?? 0) || 0
    };
}
async function setCurrency(actor, next) {
    const data = {
        "system.currency.gp": Math.max(0, Number(next.gp || 0)),
        "system.currency.sp": Math.max(0, Number(next.sp || 0)),
        "system.currency.cp": Math.max(0, Number(next.cp || 0))
    };
    await actor.update(data);
}

async function transferItem(fromActor, toActor, itemId, qty) {
    const src = fromActor.items.get(itemId);
    if (!src) return;
    const qPath =
        "quantity" in (src.system ?? {})
            ? "system.quantity"
            : "qty" in (src.system ?? {})
                ? "system.qty"
                : null;
    const curQty = Number(foundry.utils.getProperty(src, qPath) ?? 1) || 1;
    const moveQty = Math.min(qty || 1, curQty);
    const data = src.toObject();
    if (qPath) foundry.utils.setProperty(data, qPath, moveQty);
    delete data._id;
    await toActor.createEmbeddedDocuments("Item", [data]);
    if (curQty > moveQty && qPath) {
        const patch = {};
        patch[qPath] = curQty - moveQty;
        await src.update(patch);
    } else {
        await src.delete();
    }
}

/* =================== APP =================== */
export class TradeApp extends Application {
    get template() {
        return `${modPath()}/templates/trade.html`;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "nwn-trade-app",
            classes: ["nwn-trade", "sheet", "app"],
            title:
                game.i18n.localize("NWNDialog.Trade.Tab.Barter") ?? "Бартер",
            width: 1200,
            height: 780,
            resizable: true
        });
    }

    /** Кнопки в верхней шапке окна (рядом с "Закрыть"). */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift({
            label: "Тёмная тема",
            class: "toggle-theme",
            icon: "fa-solid fa-moon",
            onclick: () => {
                const outer = this.element;
                const root = outer.find(".nwn-trade");
                root.toggleClass("dark");
                outer.toggleClass("dark");
            }
        });
        return buttons;
    }

    constructor({ seller, buyer, ...opts } = {}) {
        super(opts);
        this.seller = seller ?? null;
        this.buyer = buyer ?? null;
        this.offerLeft = []; // buyer -> seller
        this.offerRight = []; // seller -> buyer
        this._coinIcons = coinIconsInitial();

        const rerenderIf = (actor) => {
            if (!this.rendered) return;
            if (actor?.id === this.seller?.id || actor?.id === this.buyer?.id)
                this.render(false);
        };
        this._onActorUpdate = rerenderIf;
        Hooks.on("updateActor", this._onActorUpdate);
        Hooks.on("createItem", (i) => rerenderIf(i?.actor));
        Hooks.on("updateItem", (i) => rerenderIf(i?.actor));
        Hooks.on("deleteItem", (i) => rerenderIf(i?.actor));
    }

    close(options) {
        Hooks.off("updateActor", this._onActorUpdate);
        Hooks.off("createItem", this._onActorUpdate);
        Hooks.off("updateItem", this._onActorUpdate);
        Hooks.off("deleteItem", this._onActorUpdate);
        return super.close(options);
    }

    _recalc() {
        for (const arr of [this.offerLeft, this.offerRight]) {
            for (const r of arr) r.totalCp = (r.priceCp || 0) * (r.qty || 0);
        }
    }
    _totals() {
        this._recalc();
        const left = this.offerLeft.reduce((s, r) => s + (r.totalCp || 0), 0);
        const right = this.offerRight.reduce((s, r) => s + (r.totalCp || 0), 0);
        return { left, right };
    }
    _balance() {
        const { left, right } = this._totals();
        const diff = left - right;
        if (diff === 0) return;
        const c = cpToChangeNoPP(Math.abs(diff));
        if (diff > 0) {
            pushCoins(this.offerRight, "gp", c.gp);
            pushCoins(this.offerRight, "sp", c.sp);
            pushCoins(this.offerRight, "cp", c.cp);
        } else {
            pushCoins(this.offerLeft, "gp", c.gp);
            pushCoins(this.offerLeft, "sp", c.sp);
            pushCoins(this.offerLeft, "cp", c.cp);
        }
    }

    async getData() {
        const { left, right } = this._totals();
        const leftMixed = cpToMixedNoPP(left);
        const rightMixed = cpToMixedNoPP(right);
        this._cache = {
            buyer: readSellableItems(this.buyer),
            seller: readSellableItems(this.seller)
        };
        return {
            ui: {
                sellerName: this.seller?.name ?? "",
                sellerPortrait: this.seller?.img || "icons/svg/mystery-man.svg",
                buyerName: this.buyer?.name ?? "",
                buyerPortrait: this.buyer?.img || "icons/svg/mystery-man.svg"
            },
            coins: { seller: readCoins(this.seller), buyer: readCoins(this.buyer) },
            coinIcons: this._coinIcons,
            items: this._cache,
            offer: {
                left: this.offerLeft,
                right: this.offerRight,
                leftTotal: left,
                rightTotal: right,
                leftMixed,
                rightMixed
            }
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Клик по слотам инвентаря -> добавить в корзину
        html.on("click", ".nwn-inv-left  .nwn-cell[data-item-id]", (e) => {
            const id = e.currentTarget.dataset.itemId;
            const it = this._cache?.buyer?.find((i) => i.id === id);
            if (it) {
                stackToOffer(this.offerLeft, it, 1);
                this.render(false);
            }
        });
        html.on("click", ".nwn-inv-right .nwn-cell[data-item-id]", (e) => {
            const id = e.currentTarget.dataset.itemId;
            const it = this._cache?.seller?.find((i) => i.id === id);
            if (it) {
                stackToOffer(this.offerRight, it, 1);
                this.render(false);
            }
        });

        // Уменьшение количества / удаление из корзины (клик или ПКМ)
        const dec = (side, id) => {
            const arr = side === "left" ? this.offerLeft : this.offerRight;
            const row = arr.find((r) => r.id === id);
            if (!row) return;
            row.qty -= 1;
            row.totalCp = row.qty * (row.priceCp || 0);
            if (row.qty <= 0) arr.splice(arr.indexOf(row), 1);
            this.render(false);
        };
        html.on("click contextmenu", ".nwn-slots[data-side] .nwn-slot[data-id]", (e) => {
            const side = e.currentTarget.closest("[data-side]").dataset.side;
            dec(side, e.currentTarget.dataset.id);
        });

        // DnD
        const setDragPayload = (el, get) => {
            el.attr("draggable", "true").on("dragstart", (ev) => {
                const dt = ev.originalEvent.dataTransfer;
                dt.effectAllowed = "copy";
                dt.setData("text/plain", JSON.stringify(get(ev)));
            });
        };
        setDragPayload(
            html.find(".nwn-cell[data-item-id], .nwn-cell[data-item-id] *"),
            (ev) => {
                const cell = ev.currentTarget.closest(".nwn-cell[data-item-id]");
                return {
                    type: "nwn-trade-item",
                    itemId: cell.dataset.itemId,
                    side: cell.closest(".nwn-inv-left") ? "leftSrc" : "rightSrc"
                };
            }
        );
        setDragPayload(
            html.find(".nwn-slot[data-id], .nwn-slot[data-id] *"),
            (ev) => {
                const slot = ev.currentTarget.closest(".nwn-slot[data-id]");
                const side = slot.closest("[data-side]").dataset.side;
                return { type: "nwn-trade-offer", id: slot.dataset.id, side };
            }
        );
        const dragOver = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            (ev.currentTarget.closest("[data-side]") ?? ev.currentTarget).classList.add(
                "dnd-over"
            );
        };
        const dragLeave = (ev) => {
            (ev.currentTarget.closest("[data-side]") ?? ev.currentTarget).classList.remove(
                "dnd-over"
            );
        };
        const parse = (ev) => {
            try {
                return JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
            } catch {
                return null;
            }
        };
        html.on(
            "dragover",
            ".nwn-slots[data-side], .nwn-slots[data-side] .nwn-slot",
            dragOver
        );
        html.on(
            "dragleave",
            ".nwn-slots[data-side], .nwn-slots[data-side] .nwn-slot",
            dragLeave
        );
        html.on(
            "drop",
            ".nwn-slots[data-side], .nwn-slots[data-side] .nwn-slot",
            (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const side = (
                    ev.currentTarget.closest("[data-side]") ?? ev.currentTarget
                ).dataset.side;
                const p = parse(ev);
                if (!p) return;
                if (p.type === "nwn-trade-item") {
                    if (side === "left" && p.side === "leftSrc") {
                        const it = this._cache?.buyer?.find((i) => i.id === p.itemId);
                        if (it) stackToOffer(this.offerLeft, it, 1);
                    }
                    if (side === "right" && p.side === "rightSrc") {
                        const it = this._cache?.seller?.find((i) => i.id === p.itemId);
                        if (it) stackToOffer(this.offerRight, it, 1);
                    }
                    this.render(false);
                }
            }
        );
        html.on("dragover", ".nwn-inv-left, .nwn-inv-right", dragOver);
        html.on("dragleave", ".nwn-inv-left, .nwn-inv-right", dragLeave);
        html.on("drop", ".nwn-inv-left, .nwn-inv-right", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const side = ev.currentTarget.classList.contains("nwn-inv-left")
                ? "left"
                : "right";
            const p = parse(ev);
            if (!p) return;
            if (p.type === "nwn-trade-offer" && p.side === side) dec(side, p.id);
        });

        // Балансировка
        html.find("[data-action='balance']").on("click", () => {
            this._balance();
            this.render(false);
        });

        // Финализация сделки
        html.find("[data-action='finalize']").on("click", async () => {
            const buyer = this.buyer,
                seller = this.seller;
            if (!buyer || !seller) return;

            for (const row of this.offerLeft)
                if (row.kind === "item")
                    await transferItem(buyer, seller, row.id, row.qty);
            for (const row of this.offerRight)
                if (row.kind === "item")
                    await transferItem(seller, buyer, row.id, row.qty);

            const leftCoins = this.offerLeft
                .filter((r) => r.kind === "coin")
                .reduce((a, r) => {
                    a[r.name.toLowerCase()] =
                        (a[r.name.toLowerCase()] || 0) + r.qty;
                    return a;
                }, {});
            const rightCoins = this.offerRight
                .filter((r) => r.kind === "coin")
                .reduce((a, r) => {
                    a[r.name.toLowerCase()] =
                        (a[r.name.toLowerCase()] || 0) + r.qty;
                    return a;
                }, {});
            const bCur = getCurrency(buyer),
                sCur = getCurrency(seller);
            bCur.gp -= leftCoins.gp || 0;
            bCur.sp -= leftCoins.sp || 0;
            bCur.cp -= leftCoins.cp || 0;
            sCur.gp += leftCoins.gp || 0;
            sCur.sp += leftCoins.sp || 0;
            sCur.cp += leftCoins.cp || 0;
            sCur.gp -= rightCoins.gp || 0;
            sCur.sp -= rightCoins.sp || 0;
            sCur.cp -= rightCoins.cp || 0;
            bCur.gp += rightCoins.gp || 0;
            bCur.sp += rightCoins.sp || 0;
            bCur.cp += rightCoins.cp || 0;
            await setCurrency(buyer, bCur);
            await setCurrency(seller, sCur);

            const totals = this._totals();
            const msg = `<b>${buyer.name}</b> заключил сделку с <b>${seller.name}</b>. Итого: игрок отдаёт ${totals.left} cp, получает ${totals.right} cp (без учёта платины).`;
            ChatMessage.create({ content: msg, speaker: { alias: "Торговля" } });

            this.close();
        });
    }
}
