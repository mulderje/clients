import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { PaymentSourceResponse } from "@bitwarden/common/billing/models/response/payment-source.response";

export class MaskedPaymentMethod {
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
