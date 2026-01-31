import { TradeApp } from "./trade/TradeApp.js";

const MODULE_ID = "nwn-trade";

/** Вспомогательное открытие торговли для продавца. */
function openTradeForSeller(seller) {
    if (!seller) {
        return ui.notifications.warn("Не найден продавец.");
    }

    const buyer = game.user.character;
    if (!buyer) {
        return ui.notifications.warn(
            game.i18n.localize("NWNDialog.Trade.NoCharacter") ||
            "У вас нет активного персонажа для торговли."
        );
    }

    const app = new TradeApp({ seller, buyer });
    app.render(true);
}

/** Достаём исходный DOM-ивент из того, что присылает Foundry. */
function getOriginalEvent(evt) {
    if (!evt) return null;
    // V10–V13: clickToken(token, { event })
    if (evt.event) return evt.event;
    if (evt.originalEvent) return evt.originalEvent;
    if (evt.data?.originalEvent) return evt.data.originalEvent;
    return evt;
}

/* ---------- 1. Двойной клик по токену ---------- */
/**
 * Игрок: 2× ЛКМ по NPC без владельцев → бартер.
 * ГМ: Shift + 2× ЛКМ по любому токену → принудительный бартер.
 */
Hooks.on("clickToken", (token, wrapperEvt) => {
    const actor = token?.actor;
    if (!actor) return;

    const user = game.user;
    const buyer = user?.character;
    const ev = getOriginalEvent(wrapperEvt);
    if (!ev) return;

    const isLeft = ev.button === 0 || ev.which === 1;
    const clicks = ev.detail ?? 1;
    const shift = !!ev.shiftKey;

    if (!isLeft || clicks < 2) return; // интересует именно двойной клик

    const isNPCwithoutOwners = !actor.hasPlayerOwner && !user.isGM;
    const gmForce = user.isGM && shift;

    if (!gmForce && !isNPCwithoutOwners) return;
    if (!buyer && !user.isGM) {
        return ui.notifications.warn(
            game.i18n.localize("NWNDialog.Trade.NoCharacter") ||
            "У вас нет активного персонажа для торговли."
        );
    }

    openTradeForSeller(actor);
});

/* ---------- 2. Кнопка в шапке листа актора ---------- */
/**
 * Добавляем кнопку «Бартер» в шапку листа существа.
 */
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    const actor = app.actor;
    if (!actor) return;

    buttons.unshift({
        label: "Бартер",
        class: "nwn-trade-open",
        icon: "fa-solid fa-coins",
        onclick: () => openTradeForSeller(actor)
    });
});

/* ---------- 3. Глобальное API для макросов ---------- */

game.nwnTrade = {
    /** Открыть с конкретным актором-продавцом по ID. */
    open(sellerId) {
        const seller =
            game.actors.get(sellerId) ||
            game.actors.tokens?.get?.(sellerId) ||
            null;
        if (!seller) {
            return ui.notifications.warn("Не найден продавец с таким ID.");
        }
        openTradeForSeller(seller);
    },

    /** Быстро открыть торговлю с выделенным токеном. */
    openWithSelected() {
        const token = canvas.tokens.controlled[0];
        if (!token?.actor) {
            return ui.notifications.warn("Сначала выберите токен на сцене.");
        }
        openTradeForSeller(token.actor);
    }
};
