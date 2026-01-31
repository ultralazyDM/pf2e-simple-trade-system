// modules/nwn-trade/scripts/app/integrations/RuntimeTradeIntegration.js
import { TradeApp } from "../trade/TradeApp.js";

function resolveBuyerActor({ user = game.user } = {}) {
    // 1) Явный персонаж пользователя
    if (user?.character) return user.character;

    // 2) Любой контролируемый сейчас токен игрока (не NPC)
    const controlledPC =
        canvas.tokens?.controlled?.find(t => t?.actor && t.actor.type !== "npc")?.actor;
    if (controlledPC) return controlledPC;

    // 3) Любой актер-персонаж, которым владеет пользователь
    const owned = game.actors?.contents?.find(
        a => a?.type !== "npc" && a.testUserPermission?.(user, "OWNER")
    );
    if (owned) return owned;

    // 4) Любой активный игрокский персонаж на сцене
    const scenePC =
        canvas.scene?.tokens?.find(td => {
            const a = td.actor;
            return a && a.type !== "npc" && td.hasPlayerOwner;
        })?.actor;
    if (scenePC) return scenePC;

    // 5) Любой персонаж в мире (на худой конец)
    const anyPC = game.actors?.contents?.find(a => a?.type !== "npc");
    if (anyPC) return anyPC;

    return null;
}

/**
 * Открыть окно торговли при goto === "trade".
 * `actor` — продавец (NPC) из диалога, `tokenDoc` — его токен.
 */
export async function openTradeWindow(actor, tokenDoc = null, user = game.user) {
    const sellerActor = tokenDoc?.actor ?? actor ?? null;
    const buyerActor = resolveBuyerActor({ user });

    if (!sellerActor || !buyerActor) {
        const msg =
            game.i18n.localize("NWNDialog.Trade.ErrNoBuyer") ||
            "Не найден покупатель: выберите или назначьте персонажа игрока.";
        ui.notifications.warn(msg);
        console.warn("[NWNDialog] openTradeWindow: sellerActor=", sellerActor, "buyerActor=", buyerActor);
        return;
    }

    // Закрыть старое окно для этого продавца (если было)
    const appId = `nwn-trade-${sellerActor?.uuid ?? sellerActor?.id}`;
    for (const win of Object.values(ui.windows)) {
        if (win?.options?.id === appId) await win.close({ force: true });
    }

    const app = new TradeApp(
        {
            buyerActorId: buyerActor.id,
            sellerActorId: sellerActor.id
        },
        { id: appId }
    );
    app.render(true);
}
