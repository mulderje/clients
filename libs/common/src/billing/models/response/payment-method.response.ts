import { BaseResponse } from "../../../models/response/base.response";

import { PaymentSourceResponse } from "./payment-source.response";
import { TaxInfoResponse } from "./tax-info.response";

export class PaymentMethodResponse extends BaseResponse {
  accountCredit: number;
  paymentSource?: PaymentSourceResponse;
  taxInformation?: TaxInfoResponse;

  constructor(response: any) {
    super(response);
    this.accountCredit = this.getResponseProperty("AccountCredit");

    const paymentMethod = this.getResponseProperty("PaymentSource");
    if (paymentMethod) {
      this.paymentSource = new PaymentSourceResponse(paymentMethod);
    }

    const taxInformation = this.getResponseProperty("TaxInformation");
    if (taxInformation) {
      this.taxInformation = new TaxInfoResponse(taxInformation);
    }
  }
}
