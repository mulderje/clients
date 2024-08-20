import { Subject, switchMap, timer } from "rxjs";

import { CLEAR_NOTIFICATION_LOGIN_DATA_DURATION } from "@bitwarden/common/autofill/constants";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";

import { BrowserApi } from "../../platform/browser/browser-api";

import {
  ActiveFormSubmissionRequests,
  ModifyLoginCipherFormData,
  ModifyLoginCipherFormDataForTab,
  OverlayNotificationsBackground as OverlayNotificationsBackgroundInterface,
  OverlayNotificationsExtensionMessage,
  OverlayNotificationsExtensionMessageHandlers,
  WebsiteOriginsWithFields,
} from "./abstractions/overlay-notifications.background";
import NotificationBackground from "./notification.background";

export class OverlayNotificationsBackground implements OverlayNotificationsBackgroundInterface {
  private websiteOriginsWithFields: WebsiteOriginsWithFields = new Map();
  private activeFormSubmissionRequests: ActiveFormSubmissionRequests = new Set();
  private modifyLoginCipherFormData: ModifyLoginCipherFormDataForTab = new Map();
  private clearLoginCipherFormDataSubject: Subject<void> = new Subject();
  private readonly formSubmissionRequestMethods: Set<string> = new Set(["POST", "PUT", "PATCH"]);
  private readonly extensionMessageHandlers: OverlayNotificationsExtensionMessageHandlers = {
    formFieldSubmitted: ({ message, sender }) => this.storeModifiedLoginFormData(message, sender),
    collectPageDetailsResponse: ({ message, sender }) =>
      this.handleCollectPageDetailsResponse(message, sender),
  };

  constructor(
    private logService: LogService,
    private configService: ConfigService,
    private notificationBackground: NotificationBackground,
  ) {}

  /**
   * Initialize the overlay notifications background service.
   */
  async init() {
    const featureFlagActive = await this.configService.getFeatureFlag(
      FeatureFlag.NotificationBarAddLoginImprovements,
    );
    if (!featureFlagActive) {
      return;
    }

    this.setupExtensionListeners();
    this.clearLoginCipherFormDataSubject
      .pipe(switchMap(() => timer(CLEAR_NOTIFICATION_LOGIN_DATA_DURATION)))
      .subscribe(() => this.modifyLoginCipherFormData.clear());
  }

  /**
   * Handles the response from the content script with the page details. Triggers an initialization
   * of the add login or change password notification if the conditions are met.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private async handleCollectPageDetailsResponse(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    if (await this.shouldInitAddLoginOrChangePasswordNotification(message, sender)) {
      this.websiteOriginsWithFields.set(sender.tab.id, this.getTabOriginMatchPattern(sender.url));
      this.setupWebRequestsListeners();
    }
  }

  /**
   * Determines if the add login or change password notification should be initialized. This depends
   * on whether the user has enabled the notification, the sender is not from an excluded domain, the
   * tab's page details contains fillable fields, and the website origin has not been previously stored.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private async shouldInitAddLoginOrChangePasswordNotification(
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) {
    return (
      (await this.isAddLoginOrChangePasswordNotificationEnabled()) &&
      !(await this.isSenderFromExcludedDomain(sender)) &&
      message.details?.fields?.length > 0 &&
      !this.websiteOriginsWithFields.has(sender.tab.id)
    );
  }

  /**
   * Determines if the add login or change password notification is enabled.
   * This is based on the user's settings for the notification.
   */
  private async isAddLoginOrChangePasswordNotificationEnabled() {
    return (
      (await this.notificationBackground.getEnableChangedPasswordPrompt()) ||
      (await this.notificationBackground.getEnableAddedLoginPrompt())
    );
  }

  /**
   * Returns the match pattern for the tab's origin URL.
   *
   * @param url - The URL of the tab
   */
  private getTabOriginMatchPattern(url: string) {
    try {
      if (!url.startsWith("http")) {
        url = `https://${url}`;
      }

      return `${new URL(url).origin}/*`;
    } catch {
      return "";
    }
  }

  /**
   * Stores the login form data that was modified by the user in the content script. This data is
   * used to trigger the add login or change password notification when the form is submitted.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   */
  private storeModifiedLoginFormData = (
    message: OverlayNotificationsExtensionMessage,
    sender: chrome.runtime.MessageSender,
  ) => {
    this.clearLoginCipherFormDataSubject.next();

    const { uri, username, password, newPassword } = message;
    this.modifyLoginCipherFormData.set(sender.tab.id, {
      uri: uri,
      username: username,
      password: password,
      newPassword: newPassword,
    });
  };

  /**
   * Determines if the sender of the message is from an excluded domain. This is used to prevent the
   * add login or change password notification from being triggered on the user's vault domain or
   * other excluded domains.
   *
   * @param sender - The sender of the message
   */
  private async isSenderFromExcludedDomain(sender: chrome.runtime.MessageSender): Promise<boolean> {
    try {
      const senderOrigin = sender.origin;
      const serverConfig = await this.notificationBackground.getActiveUserServerConfig();
      const activeUserVault = serverConfig?.environment?.vault;
      if (activeUserVault === senderOrigin) {
        return true;
      }

      const excludedDomains = await this.notificationBackground.getExcludedDomains();
      if (!excludedDomains) {
        return false;
      }

      const senderDomain = new URL(senderOrigin).hostname;
      return excludedDomains[senderDomain] !== undefined;
    } catch {
      return true;
    }
  }

  /**
   * Initializes the add login or change password notification based on the modified login form data
   * and the tab details. This will trigger the notification to be displayed to the user.
   *
   * @param details - The details of the web response
   * @param modifyLoginData  - The modified login form data
   * @param tab - The tab details
   */
  private triggerNotificationInit = async (
    details: chrome.webRequest.WebResponseDetails,
    modifyLoginData: ModifyLoginCipherFormData,
    tab: chrome.tabs.Tab,
  ) => {
    if (modifyLoginData.newPassword && !modifyLoginData.username) {
      // These notifications are temporarily setup as "messages" to the notification background.
      // This will be structured differently in a future refactor.
      await this.notificationBackground.changedPassword(
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

    if (modifyLoginData.username && (modifyLoginData.password || modifyLoginData.newPassword)) {
      await this.notificationBackground.addLogin(
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

  /**
   * Removes and resets the onBeforeRequest and onCompleted listeners for web requests. This ensures
   * that we are only listening for form submission requests on the tabs that have fillable form fields.
   */
  private setupWebRequestsListeners() {
    chrome.webRequest.onBeforeRequest.removeListener(this.handleOnBeforeRequestEvent);
    chrome.webRequest.onCompleted.removeListener(this.handleOnCompletedRequestEvent);
    if (this.websiteOriginsWithFields.size) {
      const requestFilter: chrome.webRequest.RequestFilter = {
        urls: Array.from(this.websiteOriginsWithFields.values()),
        types: ["main_frame", "sub_frame", "xmlhttprequest"],
      };
      chrome.webRequest.onBeforeRequest.addListener(this.handleOnBeforeRequestEvent, requestFilter);
      chrome.webRequest.onCompleted.addListener(this.handleOnCompletedRequestEvent, requestFilter);
    }
  }

  /**
   * Handles the onBeforeRequest event for web requests. This is used to ensures that the following
   * onCompleted event is only triggered for form submission requests.
   *
   * @param details - The details of the web request
   */
  private handleOnBeforeRequestEvent = (details: chrome.webRequest.WebRequestDetails) => {
    if (this.isValidFormSubmissionRequest(details)) {
      this.activeFormSubmissionRequests.add(details.requestId);
    }
  };

  /**
   * Determines if the web request is a valid form submission request. A valid web request
   * is a POST, PUT, or PATCH request that is not from an invalid host.
   *
   * @param details - The details of the web request
   */
  private isValidFormSubmissionRequest = (details: chrome.webRequest.WebRequestDetails) => {
    return (
      !this.requestHostIsInvalid(details) &&
      this.formSubmissionRequestMethods.has(details.method?.toUpperCase())
    );
  };

  /**
   * Handles the onCompleted event for web requests. This is used to trigger the add login or change
   * password notification when a form submission request is completed.
   *
   * @param details - The details of the web response
   */
  private handleOnCompletedRequestEvent = async (details: chrome.webRequest.WebResponseDetails) => {
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

    const tab = await BrowserApi.getTab(details.tabId);
    if (tab.status !== "complete") {
      await this.delayNotificationInitUntilTabIsComplete(details, modifyLoginData);
      return;
    }

    await this.triggerNotificationInit(details, modifyLoginData, tab);
  };

  /**
   * Delays the initialization of the add login or change password notification
   * until the tab is complete. This is used to ensure that the notification is
   * triggered after the tab has finished loading.
   *
   * @param details - The details of the web response
   * @param modifyLoginData - The modified login form data
   */
  private delayNotificationInitUntilTabIsComplete = async (
    details: chrome.webRequest.WebResponseDetails,
    modifyLoginData: ModifyLoginCipherFormData,
  ) => {
    const handleWebNavigationOnCompleted = async () => {
      chrome.webNavigation.onCompleted.removeListener(handleWebNavigationOnCompleted);
      const tab = await BrowserApi.getTab(details.tabId);
      await this.triggerNotificationInit(details, modifyLoginData, tab);
    };
    chrome.webNavigation.onCompleted.addListener(handleWebNavigationOnCompleted);
  };

  /**
   * Clears the completed web request and removes the modified login form data for the tab.
   *
   * @param details - The details of the web response
   * @param tab - The tab details
   */
  private clearCompletedWebRequest = (
    details: chrome.webRequest.WebResponseDetails,
    tab: chrome.tabs.Tab,
  ) => {
    this.activeFormSubmissionRequests.delete(details.requestId);
    this.modifyLoginCipherFormData.delete(tab.id);
    this.websiteOriginsWithFields.delete(tab.id);
    this.setupWebRequestsListeners();
  };

  /**
   * Determines if the status code of the web response is invalid. An invalid status code is
   * any status code that is not in the 200-299 range.
   *
   * @param statusCode - The status code of the web response
   */
  private isInvalidStatusCode = (statusCode: number) => {
    return statusCode < 200 || statusCode >= 300;
  };

  /**
   * Determines if the host of the web request is invalid. An invalid host is any host that does not
   * start with "http" or a tab id that is less than 0.
   *
   * @param details - The details of the web request
   */
  private requestHostIsInvalid = (details: chrome.webRequest.ResourceRequest) => {
    return !details.url?.startsWith("http") || details.tabId < 0;
  };

  /**
   * Sets up the listeners for the extension messages and the tab events.
   */
  private setupExtensionListeners() {
    BrowserApi.messageListener("overlay-notifications", this.handleExtensionMessage);
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved);
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated);
  }

  /**
   * Handles messages that are sent to the extension background.
   *
   * @param message - The message from the content script
   * @param sender - The sender of the message
   * @param sendResponse - The response to send back to the content script
   */
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

  /**
   * Handles the removal of a tab. This is used to remove the modified login form data for the tab.
   *
   * @param tabId - The id of the tab that was removed
   */
  private handleTabRemoved = (tabId: number) => {
    this.modifyLoginCipherFormData.delete(tabId);
    this.websiteOriginsWithFields.delete(tabId);
    this.setupWebRequestsListeners();
  };

  /**
   * Handles the update of a tab. This is used to remove the modified
   * login form  data for the tab when the tab is loading.
   *
   * @param tabId - The id of the tab that was updated
   * @param changeInfo - The change info of the tab
   */
  private handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    if (changeInfo.status === "loading" && this.websiteOriginsWithFields.has(tabId)) {
      this.websiteOriginsWithFields.delete(tabId);
      this.setupWebRequestsListeners();
    }
  };
}
