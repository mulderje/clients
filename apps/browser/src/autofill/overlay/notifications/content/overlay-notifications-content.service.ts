import { EVENTS } from "@bitwarden/common/autofill/constants";

import { NotificationBarIframeInitData } from "../../../notification/abstractions/notification-bar";
import { sendExtensionMessage, setupExtensionDisconnectAction } from "../../../utils";
import {
  NotificationsExtensionMessage,
  OverlayNotificationsContentService as OverlayNotificationsContentServiceInterface,
  OverlayNotificationsExtensionMessageHandlers,
} from "../abstractions/overlay-notifications-content.service";

export class OverlayNotificationsContentService
  implements OverlayNotificationsContentServiceInterface
{
  private readonly sendExtensionMessage = sendExtensionMessage;
  private readonly setupExtensionDisconnectAction = setupExtensionDisconnectAction;
  private notificationBarElement: HTMLElement | null = null;
  private notificationBarIframe: HTMLIFrameElement | null = null;
  private currentNotificationBarType: string | null = null;
  private removeTabFromNotificationQueueTypes = new Set(["add", "change"]);
  private readonly extensionMessageHandlers: OverlayNotificationsExtensionMessageHandlers = {
    openNotificationBar: ({ message }) => this.handleOpenNotificationBarMessage(message),
    closeNotificationBar: () => this.closeNotificationBar(true),
    adjustNotificationBar: ({ message }) => this.adjustNotificationBarHeight(message),
    saveCipherAttemptCompleted: ({ message }) =>
      this.handleSaveCipherAttemptCompletedMessage(message),
  };

  constructor() {}

  get messageHandlers() {
    return this.extensionMessageHandlers;
  }

  private async handleOpenNotificationBarMessage(message: NotificationsExtensionMessage) {
    if (!message.data) {
      return;
    }

    const { type, typeData } = message.data;

    if (type !== this.currentNotificationBarType) {
      await this.closeNotificationBar();
    }
    this.openNotificationBar({
      type,
      isVaultLocked: typeData.isVaultLocked,
      theme: typeData.theme,
      removeIndividualVault: typeData.removeIndividualVault,
      importType: typeData.importType,
      applyRedesign: true,
      launchTimestamp: typeData.launchTimestamp,
    });
  }

  private openNotificationBar(initData: NotificationBarIframeInitData) {
    if (this.notificationBarElement) {
      return;
    }
    const isNotificationFresh =
      initData.launchTimestamp && Date.now() - initData.launchTimestamp < 250;

    this.currentNotificationBarType = initData.type;
    this.notificationBarIframe = globalThis.document.createElement("iframe");
    this.notificationBarIframe.id = "bit-notification-bar-iframe";
    this.notificationBarIframe.src = chrome.runtime.getURL("notification/bar.html");
    this.notificationBarIframe.style.cssText =
      "width: 100%; height: 100%; border: 0; display: block; position:relative; transition: transform 0.15s ease-out, opacity 0.15s ease;";
    this.notificationBarIframe.style.transform = isNotificationFresh
      ? "translateX(100%)"
      : "translateX(0)";
    this.notificationBarIframe.style.opacity = isNotificationFresh ? "1" : "0";

    this.notificationBarElement = globalThis.document.createElement("div");
    this.notificationBarElement.id = "bit-notification-bar";
    this.notificationBarElement.style.cssText =
      "height: 82px; width: 430px; max-width: calc(100% - 20px); min-height: initial; top: 10px; right: 10px; padding: 0; position: fixed; z-index: 2147483647; visibility: visible; overflow: hidden; border-radius: 4px; border: none; background-color: transparent; overflow: hidden; transition: box-shadow 0.15s ease; transition-delay: 0.15s;";

    this.notificationBarElement.appendChild(this.notificationBarIframe);

    this.notificationBarIframe.addEventListener(EVENTS.LOAD, () => {
      this.notificationBarIframe.style.transform = "translateX(0)";
      this.notificationBarIframe.style.opacity = "1";
      this.notificationBarElement.style.boxShadow = "2px 4px 6px 0px #0000001A";
    });

    this.setupInitNotificationBarMessageListener(initData);
    globalThis.document.body.appendChild(this.notificationBarElement);
  }

  private adjustNotificationBarHeight(message: NotificationsExtensionMessage) {
    if (this.notificationBarElement && message.data?.height) {
      this.notificationBarElement.style.height = `${message.data.height}px`;
    }
  }

  private setupInitNotificationBarMessageListener(initData: NotificationBarIframeInitData) {
    if (!this.notificationBarIframe) {
      return;
    }

    const handleInitNotificationBarMessage = (event: MessageEvent) => {
      const { source, data } = event;
      if (
        source !== this.notificationBarIframe.contentWindow ||
        data?.command !== "initNotificationBar"
      ) {
        return;
      }

      this.sendMessageToNotificationBarIframe({ command: "initNotificationBar", initData });
      globalThis.removeEventListener("message", handleInitNotificationBarMessage);
    };

    globalThis.addEventListener("message", handleInitNotificationBarMessage);
  }

  private async closeNotificationBar(closedByUser: boolean = false) {
    if (!this.notificationBarElement) {
      return;
    }

    this.notificationBarIframe.style.transform = "translateX(100%)";
    this.notificationBarElement.remove();
    this.notificationBarElement = null;

    const removeTabFromNotificationQueue =
      closedByUser && this.removeTabFromNotificationQueueTypes.has(this.currentNotificationBarType);
    if (removeTabFromNotificationQueue) {
      void this.sendExtensionMessage("bgRemoveTabFromNotificationQueue");
    }

    this.currentNotificationBarType = null;
  }

  private handleSaveCipherAttemptCompletedMessage(message: NotificationsExtensionMessage) {
    this.sendMessageToNotificationBarIframe({
      command: "saveCipherAttemptCompleted",
      error: message.data?.error,
    });
  }

  private sendMessageToNotificationBarIframe(message: Record<string, any>) {
    if (this.notificationBarIframe) {
      this.notificationBarIframe.contentWindow.postMessage(message, "*");
    }
  }
}
