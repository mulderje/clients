import { mock, MockProxy } from "jest-mock-extended";

import AutofillInit from "../../../content/autofill-init";
import { DomQueryService } from "../../../services/abstractions/dom-query.service";
import { flushPromises, sendMockExtensionMessage } from "../../../spec/testing-utils";
import { NotificationTypeData } from "../abstractions/overlay-notifications-content.service";

import { OverlayNotificationsContentService } from "./overlay-notifications-content.service";

describe("OverlayNotificationsContentService", () => {
  let overlayNotificationsContentService: OverlayNotificationsContentService;
  let domQueryService: MockProxy<DomQueryService>;
  let autofillInit: AutofillInit;
  let bodyAppendChildSpy: jest.SpyInstance;

  beforeEach(() => {
    domQueryService = mock<DomQueryService>();
    overlayNotificationsContentService = new OverlayNotificationsContentService();
    autofillInit = new AutofillInit(
      domQueryService,
      null,
      null,
      overlayNotificationsContentService,
    );
    autofillInit.init();
    bodyAppendChildSpy = jest.spyOn(globalThis.document.body, "appendChild");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("opening the notification bar", () => {
    it("skips opening the notification bar if the init data is not present in the message", async () => {
      sendMockExtensionMessage({ command: "openNotificationBar" });
      await flushPromises();

      expect(bodyAppendChildSpy).not.toHaveBeenCalled();
    });

    it("closes the notification bar if the notification bar type has changed", async () => {
      overlayNotificationsContentService["currentNotificationBarType"] = "add";
      const closeNotificationBarSpy = jest.spyOn(
        overlayNotificationsContentService as any,
        "closeNotificationBar",
      );

      sendMockExtensionMessage({
        command: "openNotificationBar",
        data: {
          type: "change",
          typeData: mock<NotificationTypeData>(),
        },
      });
      await flushPromises();

      expect(closeNotificationBarSpy).toHaveBeenCalled();
    });

    it("creates the notification bar elements and appends them to the body", async () => {
      sendMockExtensionMessage({
        command: "openNotificationBar",
        data: {
          type: "change",
          typeData: mock<NotificationTypeData>(),
        },
      });
      await flushPromises();

      expect(overlayNotificationsContentService["notificationBarElement"]).toMatchSnapshot();
    });

    it("sets up a slide in animation when the notification is fresh", async () => {
      sendMockExtensionMessage({
        command: "openNotificationBar",
        data: {
          type: "change",
          typeData: mock<NotificationTypeData>({
            launchTimestamp: Date.now(),
          }),
        },
      });
      await flushPromises();

      expect(
        overlayNotificationsContentService["notificationBarIframeElement"].style.transform,
      ).toBe("translateX(100%)");
    });

    it("triggers the iframe animation on load of the element", async () => {
      sendMockExtensionMessage({
        command: "openNotificationBar",
        data: {
          type: "change",
          typeData: mock<NotificationTypeData>(),
        },
      });
      await flushPromises();

      overlayNotificationsContentService["notificationBarIframeElement"].dispatchEvent(
        new Event("load"),
      );

      expect(
        overlayNotificationsContentService["notificationBarIframeElement"].style.transform,
      ).toBe("translateX(0)");
    });
  });

  describe("closing the notification bar", () => {});

  describe("adjusting the notification bar's height", () => {});

  describe("when a save cipher attempt is completed", () => {});
});
