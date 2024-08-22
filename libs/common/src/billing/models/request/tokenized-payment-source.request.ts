import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { TokenizedPaymentSource } from "@bitwarden/common/billing/models/domain";

export class TokenizedPaymentSourceRequest {
  type: PaymentMethodType;
  token: string;

  static From(tokenizedPaymentMethod: TokenizedPaymentSource): TokenizedPaymentSourceRequest {
    const request = new TokenizedPaymentSourceRequest();
    request.type = tokenizedPaymentMethod.type;
    request.token = tokenizedPaymentMethod.token;
    return request;
  }
}
