import { Subject, switchMap, timer } from "rxjs";

import { LogService } from "@bitwarden/common/platform/abstractions/log.service";

import { BrowserApi } from "../../platform/browser/browser-api";

import {
  ActiveFormSubmissionRequests,
  ModifyLoginCipherFormData,
  OverlayNotificationsBackground as OverlayNotificationsBackgroundInterface,
  OverlayNotificationsExtensionMessage,
  OverlayNotificationsExtensionMessageHandlers,
  WebsiteOriginsWithFields,
} from "./abstractions/overlay-notifications.background";
import NotificationBackground from "./notification.background";

export class OverlayNotificationsBackground implements OverlayNotificationsBackgroundInterface {
  private websiteOriginsWithFields: WebsiteOriginsWithFields = new Map();
  private activeFormSubmissionRequests: ActiveFormSubmissionRequests = new Set();
  private modifyLoginCipherFormData: ModifyLoginCipherFormData = new Map();
  private clearLoginCipherFormDataSubject: Subject<void> = new Subject();
  private readonly clearLoginCipherTimeoutDuration: number = 5000;
  private readonly formSubmissionRequestMethods: Set<string> = new Set(["POST", "PUT", "PATCH"]);
  private readonly extensionMessageHandlers: OverlayNotificationsExtensionMessageHandlers = {
    formFieldSubmitted: ({ message, sender }) => this.handleFormFieldSubmitted(message, sender),
    collectPageDetailsResponse: ({ message, sender }) =>
      this.handleCollectPageDetailsResponse(message, sender),
  };

  constructor(
    private logService: LogService,
    private notificationsBackground: NotificationBackground,
  ) {}

  init() {
    this.setupExtensionListeners();
    this.clearLoginCipherFormDataSubject
      .pipe(switchMap(() => timer(this.clearLoginCipherTimeoutDuration)))
      .subscribe(() => this.clearLoginCipherFormData());
  }

  private handleFormFieldSubmitted(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    // console.log("form field submitted", message, sender);
    this.storeModifiedLoginFormData(message, sender.tab.id);
  }

  private storeModifiedLoginFormData = (
    message: OverlayNotificationsExtensionMessage,
    tabId: chrome.tabs.Tab["id"],
  ) => {
    this.clearLoginCipherFormDataSubject.next();

    const { uri, username, password, newPassword } = message;
    this.modifyLoginCipherFormData.set(tabId, {
      uri: uri,
      username: username,
      password: password,
      newPassword: newPassword,
    });
  };

  private clearLoginCipherFormData = () => {
    this.modifyLoginCipherFormData.clear();
  };

  private async handleCollectPageDetailsResponse(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    // console.log("collect page details response", message, sender);
    if (
      !(await this.isAddLoginOrChangePasswordNotificationEnabled()) ||
      (await this.isSenderFromExcludedDomain(sender))
    ) {
      return;
    }

    if (!message.details?.fields?.length) {
      return;
    }

    if (this.websiteOriginsWithFields.has(sender.tab.id)) {
      return;
    }

    this.websiteOriginsWithFields.set(sender.tab.id, this.getTabOriginMatchPattern(sender.url));
    this.resetWebRequestsListeners();
  }

  private async isSenderFromExcludedDomain(sender: chrome.runtime.MessageSender): Promise<boolean> {
    try {
      const senderOrigin = sender.origin;
      const serverConfig = await this.notificationsBackground.getActiveUserServerConfig();
      const activeUserVault = serverConfig?.environment?.vault;
      if (activeUserVault === senderOrigin) {
        return true;
      }

      const excludedDomains = await this.notificationsBackground.getExcludedDomains();
      if (!excludedDomains) {
        return false;
      }

      const senderDomain = new URL(senderOrigin).hostname;
      return excludedDomains[senderDomain] !== undefined;
    } catch {
      return true;
    }
  }

  private async isAddLoginOrChangePasswordNotificationEnabled() {
    if (await this.notificationsBackground.getEnableChangedPasswordPrompt()) {
      return true;
    }

    return await this.notificationsBackground.getEnableAddedLoginPrompt();
  }

  private clearWebRequestsListenersOnWebsiteOrigin(tabId: chrome.tabs.Tab["id"]) {
    if (!this.websiteOriginsWithFields.has(tabId)) {
      return;
    }

    this.websiteOriginsWithFields.delete(tabId);
    this.resetWebRequestsListeners();
  }

  private resetWebRequestsListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(this.handleOnBeforeRequestEvent);
    chrome.webRequest.onCompleted.removeListener(this.handleOnCompletedRequestEvent);
    // console.log("rest web", this.websiteOriginsWithFields);
    if (!this.websiteOriginsWithFields.size) {
      return;
    }

    const requestFilter: chrome.webRequest.RequestFilter = {
      urls: Array.from(this.websiteOriginsWithFields.values()),
      types: ["main_frame", "sub_frame", "xmlhttprequest"],
    };
    chrome.webRequest.onBeforeRequest.addListener(this.handleOnBeforeRequestEvent, requestFilter);
    chrome.webRequest.onCompleted.addListener(this.handleOnCompletedRequestEvent, requestFilter);
  }

  private setupExtensionListeners() {
    BrowserApi.messageListener("overlay-notifications", this.handleExtensionMessage);
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved);
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated);
  }

  private handleTabRemoved = (tabId: number) => {
    this.modifyLoginCipherFormData.delete(tabId);
    this.websiteOriginsWithFields.delete(tabId);
    this.resetWebRequestsListeners();
  };

  private handleTabUpdated = (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ) => {
    if (changeInfo.status === "loading") {
      this.clearWebRequestsListenersOnWebsiteOrigin(tabId);
    }
  };

  private handleOnBeforeRequestEvent = (details: chrome.webRequest.WebRequestDetails) => {
    // console.log("onBefore", details);
    if (this.requestHostIsInvalid(details) || !this.isFormSubmissionRequest(details)) {
      return;
    }

    this.activeFormSubmissionRequests.add(details.requestId);
  };

  private isFormSubmissionRequest = (details: chrome.webRequest.WebRequestDetails) => {
    return this.formSubmissionRequestMethods.has(details.method?.toUpperCase());
  };

  private handleOnCompletedRequestEvent = async (details: chrome.webRequest.WebResponseDetails) => {
    // console.log("onCompleted", details);

    if (
      this.requestHostIsInvalid(details) ||
      this.isInvalidStatusCode(details.statusCode) ||
      !this.activeFormSubmissionRequests.has(details.requestId)
    ) {
      return;
    }

    const modifyLoginData = this.modifyLoginCipherFormData.get(details.tabId);
    if (!modifyLoginData) {
      return;
    }

    // console.log("submit notification with login data", modifyLoginData);

    const tab = await BrowserApi.getTab(details.tabId);
    if (
      (await this.notificationsBackground.getEnableChangedPasswordPrompt()) &&
      modifyLoginData.newPassword &&
      !modifyLoginData.username
    ) {
      await this.notificationsBackground.changedPassword(
        {
          command: "bgChangedPassword",
          data: {
            url: modifyLoginData.uri,
            currentPassword: modifyLoginData.password,
            newPassword: modifyLoginData.newPassword,
          },
        },
        { tab },
      );
      this.clearCompletedWebRequest(details, tab);
      return;
    }

    if (
      (await this.notificationsBackground.getEnableAddedLoginPrompt()) &&
      modifyLoginData.username &&
      (modifyLoginData.password || modifyLoginData.newPassword)
    ) {
      await this.notificationsBackground.addLogin(
        {
          command: "bgAddLogin",
          login: {
            url: modifyLoginData.uri,
            username: modifyLoginData.username,
            password: modifyLoginData.password || modifyLoginData.newPassword,
          },
        },
        { tab },
      );
      this.clearCompletedWebRequest(details, tab);
    }
  };

  private isInvalidStatusCode = (statusCode: number) => {
    return statusCode < 200 || statusCode >= 300;
  };

  private requestHostIsInvalid = (details: chrome.webRequest.ResourceRequest) => {
    return !details.url?.startsWith("http") || details.tabId < 0;
  };

  private clearCompletedWebRequest = (
    details: chrome.webRequest.WebResponseDetails,
    tab: chrome.tabs.Tab,
  ) => {
    this.activeFormSubmissionRequests.delete(details.requestId);
    this.modifyLoginCipherFormData.delete(tab.id);
    this.websiteOriginsWithFields.delete(tab.id);
    this.resetWebRequestsListeners();
  };

  private getTabOriginMatchPattern(url: string) {
    try {
      if (!url.startsWith("http")) {
        url = `https://${url}`;
      }

      const parsedUrl = new URL(url);
      return `${parsedUrl.origin}/*`;
    } catch {
      return "";
    }
  }

  private handleExtensionMessage = (
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    const handler: CallableFunction = this.extensionMessageHandlers[message.command];
    if (!handler) {
      return null;
    }

    const messageResponse = handler({ message, sender });
    if (typeof messageResponse === "undefined") {
      return null;
    }

    Promise.resolve(messageResponse)
      .then((response) => sendResponse(response))
      .catch((error) => this.logService.error(error));
    return true;
  };
}
