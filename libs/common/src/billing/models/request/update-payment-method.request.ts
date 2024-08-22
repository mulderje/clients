import { TaxInformation, TokenizedPaymentSource } from "@bitwarden/common/billing/models/domain";
import { ExpandedTaxInfoUpdateRequest } from "@bitwarden/common/billing/models/request/expanded-tax-info-update.request";
import { TokenizedPaymentSourceRequest } from "@bitwarden/common/billing/models/request/tokenized-payment-source.request";

export class UpdatePaymentMethodRequest {
  paymentSource: TokenizedPaymentSourceRequest;
  taxInformation: ExpandedTaxInfoUpdateRequest;

  static from = (paymentSource: TokenizedPaymentSource, taxInformation: TaxInformation) => {
    const request = new UpdatePaymentMethodRequest();
    request.paymentSource = TokenizedPaymentSourceRequest.From(paymentSource);
    request.taxInformation = ExpandedTaxInfoUpdateRequest.From(taxInformation);
    return request;
  };
}
