
export class TradeSettingsApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "nwn-trade-settings",
      title: game.i18n.localize("NWNTrade.Settings.Title") || "Trade Settings",
      template: `${game.modules.get("nwn-trade")?.path ?? "modules/nwn-trade"}/templates/trade-settings.html`,
      width: 460
    });
  }
}
