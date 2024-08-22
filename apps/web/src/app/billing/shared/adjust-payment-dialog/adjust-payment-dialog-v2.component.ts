import { DIALOG_DATA, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject, ViewChild } from "@angular/core";

import {
  ManageTaxInformationComponent,
  SelectPaymentMethodComponent,
} from "@bitwarden/angular/billing/components";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { BillingApiServiceAbstraction } from "@bitwarden/common/billing/abstractions";
import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { TaxInformation, TokenizedPaymentSource } from "@bitwarden/common/billing/models/domain";
import { PaymentRequest } from "@bitwarden/common/billing/models/request/payment.request";
import { UpdatePaymentMethodRequest } from "@bitwarden/common/billing/models/request/update-payment-method.request";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { DialogService, ToastService } from "@bitwarden/components";

export interface AdjustPaymentDialogV2Params {
  existingPaymentMethodType?: PaymentMethodType;
  existingTaxInformation?: TaxInformation;
  organizationId?: string;
}

export enum AdjustPaymentDialogV2ResultType {
  Closed = "closed",
  Submitted = "submitted",
}

@Component({
  templateUrl: "./adjust-payment-dialog-v2.component.html",
})
export class AdjustPaymentDialogV2Component {
  @ViewChild(ManageTaxInformationComponent) manageTaxInformation: ManageTaxInformationComponent;
  @ViewChild(SelectPaymentMethodComponent) selectPaymentMethod: SelectPaymentMethodComponent;

  protected readonly PaymentMethodType = PaymentMethodType;
  protected readonly ResultType = AdjustPaymentDialogV2ResultType;

  constructor(
    private apiService: ApiService,
    private billingApiService: BillingApiServiceAbstraction,
    @Inject(DIALOG_DATA) protected dialogParams: AdjustPaymentDialogV2Params,
    private dialogRef: DialogRef<AdjustPaymentDialogV2ResultType>,
    private i18nService: I18nService,
    private toastService: ToastService,
  ) {}

  onCountrySelected = (country: string) => {
    if (country === "US") {
      this.selectPaymentMethod.showBankAccount = !!this.dialogParams.organizationId;
    } else {
      this.selectPaymentMethod.showBankAccount = false;
      if (this.selectPaymentMethod.selected === PaymentMethodType.BankAccount) {
        this.selectPaymentMethod.select(PaymentMethodType.Card);
      }
    }
  };

  submit = async () => {
    if (!this.manageTaxInformation.touch()) {
      return;
    }

    const paymentSource = await this.selectPaymentMethod.tokenize();
    const taxInformation = this.manageTaxInformation.getTaxInformation();

    if (!this.dialogParams.organizationId) {
      await this.updatePremiumUserPaymentMethod(paymentSource, taxInformation);
    }

    const request = UpdatePaymentMethodRequest.from(paymentSource, taxInformation);

    await this.billingApiService.updateOrganizationPaymentMethod(
      this.dialogParams.organizationId,
      request,
    );

    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("updatedPaymentMethod"),
    });

    this.dialogRef.close(AdjustPaymentDialogV2ResultType.Submitted);
  };

  private updatePremiumUserPaymentMethod = async (
    { type, token }: TokenizedPaymentSource,
    { country, postalCode }: TaxInformation,
  ) => {
    const paymentRequest = new PaymentRequest();
    paymentRequest.paymentToken = token;
    paymentRequest.paymentMethodType = type;
    paymentRequest.country = country;
    paymentRequest.postalCode = postalCode;
    await this.apiService.postAccountPayment(paymentRequest);
  };

  static open = (
    dialogService: DialogService,
    dialogConfig: DialogConfig<AdjustPaymentDialogV2Params>,
  ) =>
    dialogService.open<AdjustPaymentDialogV2ResultType>(
      AdjustPaymentDialogV2Component,
      dialogConfig,
    );
}
