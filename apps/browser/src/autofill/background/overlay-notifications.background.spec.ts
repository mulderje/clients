import { mock, MockProxy } from "jest-mock-extended";

import { CLEAR_NOTIFICATION_LOGIN_DATA_DURATION } from "@bitwarden/common/autofill/constants";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { ServerConfig } from "@bitwarden/common/platform/abstractions/config/server-config";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { EnvironmentServerConfigData } from "@bitwarden/common/platform/models/data/server-config.data";

import AutofillField from "../models/autofill-field";
import AutofillPageDetails from "../models/autofill-page-details";
import { flushPromises, sendMockExtensionMessage } from "../spec/testing-utils";

import NotificationBackground from "./notification.background";
import { OverlayNotificationsBackground } from "./overlay-notifications.background";

describe("OverlayNotificationsBackground", () => {
  let logService: MockProxy<LogService>;
  let configService: MockProxy<ConfigService>;
  let notificationBackground: NotificationBackground;
  let getEnableChangedPasswordPromptSpy: jest.SpyInstance;
  let getEnableAddedLoginPromptSpy: jest.SpyInstance;
  let overlayNotificationsBackground: OverlayNotificationsBackground;

  beforeEach(async () => {
    jest.useFakeTimers();
    logService = mock<LogService>();
    configService = mock<ConfigService>();
    notificationBackground = mock<NotificationBackground>();
    getEnableChangedPasswordPromptSpy = jest
      .spyOn(notificationBackground, "getEnableChangedPasswordPrompt")
      .mockResolvedValue(true);
    getEnableAddedLoginPromptSpy = jest
      .spyOn(notificationBackground, "getEnableAddedLoginPrompt")
      .mockResolvedValue(true);
    overlayNotificationsBackground = new OverlayNotificationsBackground(
      logService,
      configService,
      notificationBackground,
    );
    configService.getFeatureFlag.mockResolvedValue(true);
    await overlayNotificationsBackground.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe("setting up the form submission listeners", () => {
    let fields: MockProxy<AutofillField>[];
    let details: MockProxy<AutofillPageDetails>;

    beforeEach(() => {
      fields = [mock<AutofillField>(), mock<AutofillField>(), mock<AutofillField>()];
      details = mock<AutofillPageDetails>({ fields });
    });

    describe("skipping setting up the web request listeners", () => {
      it("skips setting up listeners when the notification bar is disabled", async () => {
        getEnableChangedPasswordPromptSpy.mockResolvedValue(false);
        getEnableAddedLoginPromptSpy.mockResolvedValue(false);

        sendMockExtensionMessage({
          command: "collectPageDetailsResponse",
          details,
        });
        await flushPromises();

        expect(chrome.webRequest.onCompleted.addListener).not.toHaveBeenCalled();
      });

      describe("when the sender is from an excluded domain", () => {
        const senderHost = "example.com";
        const senderUrl = `https://${senderHost}`;

        beforeEach(() => {
          jest.spyOn(notificationBackground, "getExcludedDomains").mockResolvedValue({
            [senderHost]: null,
          });
        });

        it("skips setting up listeners when the sender is the user's vault", async () => {
          const vault = "https://vault.bitwarden.com";
          const sender = mock<chrome.runtime.MessageSender>({ origin: vault });
          jest
            .spyOn(notificationBackground, "getActiveUserServerConfig")
            .mockResolvedValue(
              mock<ServerConfig>({ environment: mock<EnvironmentServerConfigData>({ vault }) }),
            );

          sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
          await flushPromises();

          expect(chrome.webRequest.onCompleted.addListener).not.toHaveBeenCalled();
        });

        it("skips setting up listeners when the sender is an excluded domain", async () => {
          const sender = mock<chrome.runtime.MessageSender>({ origin: senderUrl });

          sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
          await flushPromises();

          expect(chrome.webRequest.onCompleted.addListener).not.toHaveBeenCalled();
        });

        it("skips setting up listeners when the sender contains a malformed origin", async () => {
          const senderOrigin = "-_-!..exampwle.com";
          const sender = mock<chrome.runtime.MessageSender>({ origin: senderOrigin });

          sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
          await flushPromises();

          expect(chrome.webRequest.onCompleted.addListener).not.toHaveBeenCalled();
        });
      });

      it("skips setting up listeners when the sender tab does not contain page details fields", async () => {
        const sender = mock<chrome.runtime.MessageSender>({ tab: { id: 1 } });
        details.fields = [];

        sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
        await flushPromises();

        expect(chrome.webRequest.onCompleted.addListener).not.toHaveBeenCalled();
      });
    });

    it("sets up the web request listeners", async () => {
      const sender = mock<chrome.runtime.MessageSender>({
        tab: { id: 1 },
        url: "example.com",
      });

      sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
      await flushPromises();

      expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
    });

    it("skips setting up duplicate listeners when the website origin has been previously encountered with fields", async () => {
      const sender = mock<chrome.runtime.MessageSender>({
        tab: { id: 1 },
        url: "example.com",
      });

      sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
      await flushPromises();
      sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
      await flushPromises();
      sendMockExtensionMessage({ command: "collectPageDetailsResponse", details }, sender);
      await flushPromises();

      expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe("storing the modified login form data", () => {
    const sender = mock<chrome.runtime.MessageSender>({ tab: { id: 1 } });

    it("stores the modified login cipher form data", async () => {
      sendMockExtensionMessage(
        {
          command: "formFieldSubmitted",
          uri: "example.com",
          username: "username",
          password: "password",
          newPassword: "newPassword",
        },
        sender,
      );
      await flushPromises();

      expect(
        overlayNotificationsBackground["modifyLoginCipherFormData"].get(sender.tab.id),
      ).toEqual({
        uri: "example.com",
        username: "username",
        password: "password",
        newPassword: "newPassword",
      });
    });

    it("clears the modified login cipher form data after 5 seconds", () => {
      sendMockExtensionMessage(
        {
          command: "formFieldSubmitted",
          uri: "example.com",
          username: "username",
          password: "password",
          newPassword: "newPassword",
        },
        sender,
      );

      jest.advanceTimersByTime(CLEAR_NOTIFICATION_LOGIN_DATA_DURATION);

      expect(overlayNotificationsBackground["modifyLoginCipherFormData"].size).toBe(0);
    });
  });
});
