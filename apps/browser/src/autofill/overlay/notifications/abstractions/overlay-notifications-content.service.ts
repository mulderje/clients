export type NotificationTypeData = {
  isVaultLocked?: boolean;
  theme?: string;
  removeIndividualVault?: boolean;
  importType?: string;
};

export type NotificationsExtensionMessage = {
  command: string;
  data?: {
    type?: string;
    typeData?: NotificationTypeData;
    height?: number;
    error?: string;
  };
};

type OverlayNotificationsExtensionMessageParam = {
  message: NotificationsExtensionMessage;
};
type OverlayNotificationsExtensionSenderParam = {
  sender: chrome.runtime.MessageSender;
};
export type OverlayNotificationsExtensionMessageParams = OverlayNotificationsExtensionMessageParam &
  OverlayNotificationsExtensionSenderParam;

export type OverlayNotificationsExtensionMessageHandlers = {
  [key: string]: ({ message, sender }: OverlayNotificationsExtensionMessageParams) => any;
  openNotificationBar: ({ message }: OverlayNotificationsExtensionMessageParam) => Promise<void>;
  closeNotificationBar: () => Promise<void>;
  adjustNotificationBar: ({ message }: OverlayNotificationsExtensionMessageParam) => void;
  saveCipherAttemptCompleted: ({ message }: OverlayNotificationsExtensionMessageParam) => void;
};

export interface OverlayNotificationsContentService {
  messageHandlers: OverlayNotificationsExtensionMessageHandlers;
}
