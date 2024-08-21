import { DIALOG_DATA, DialogConfig, DialogRef } from "@angular/cdk/dialog";
import { Component, Inject, ViewChild } from "@angular/core";

import {
  ManageTaxInformationComponent,
  SelectPaymentMethodComponent,
} from "@bitwarden/angular/billing/components";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/organization/organization-api.service.abstraction";
import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { TaxInformation } from "@bitwarden/common/billing/models/domain";
import { PaymentRequest } from "@bitwarden/common/billing/models/request/payment.request";
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
    @Inject(DIALOG_DATA) protected dialogParams: AdjustPaymentDialogV2Params,
    private dialogRef: DialogRef<AdjustPaymentDialogV2ResultType>,
    private i18nService: I18nService,
    private organizationApiService: OrganizationApiServiceAbstraction,
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

    const request = new PaymentRequest();

    const { token, type } = await this.selectPaymentMethod.tokenizePaymentMethod();
    request.paymentToken = token;
    request.paymentMethodType = type;

    const taxInformation = this.manageTaxInformation.getTaxInformation();
    request.country = taxInformation.country;
    request.postalCode = taxInformation.postalCode;

    if (!this.dialogParams.organizationId) {
      await this.apiService.postAccountPayment(request);
    } else {
      if (taxInformation.includeTaxId) {
        request.taxId = taxInformation.taxId;
        request.line1 = taxInformation.line1;
        request.line2 = taxInformation.line2;
        request.city = taxInformation.city;
        request.state = taxInformation.state;
      }

      await this.organizationApiService.updatePayment(this.dialogParams.organizationId, request);
    }

    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("updatedPaymentMethod"),
    });

    this.dialogRef.close(AdjustPaymentDialogV2ResultType.Submitted);
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
