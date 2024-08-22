import { PaymentMethodType } from "@bitwarden/common/billing/enums";

export type TokenizedPaymentSource = {
  type: PaymentMethodType;
  token: string;
};
