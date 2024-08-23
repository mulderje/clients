import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { PaymentSourceResponse } from "@bitwarden/common/billing/models/response/payment-source.response";

export class PaymentSource {
  type: PaymentMethodType;
  description: string;
  needsVerification: boolean;

  static from(response: PaymentSourceResponse | undefined) {
    if (response === undefined) {
      return null;
    }
    return {
      ...response,
    };
  }
}
