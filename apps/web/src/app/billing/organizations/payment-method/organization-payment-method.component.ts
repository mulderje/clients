import { Component } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { from, lastValueFrom, switchMap } from "rxjs";

import { BillingApiServiceAbstraction } from "@bitwarden/common/billing/abstractions";
import { PaymentMethodType } from "@bitwarden/common/billing/enums";
import { PaymentSource, TaxInformation } from "@bitwarden/common/billing/models/domain";
import { VerifyBankAccountRequest } from "@bitwarden/common/billing/models/request/verify-bank-account.request";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DialogService, ToastService } from "@bitwarden/components";

import {
  AdjustPaymentDialogV2Component,
  AdjustPaymentDialogV2ResultType,
} from "../../shared/adjust-payment-dialog/adjust-payment-dialog-v2.component";

@Component({
  templateUrl: "./organization-payment-method.component.html",
})
export class OrganizationPaymentMethodComponent {
  organizationId: string;

  accountCredit: number;
  paymentSource?: PaymentSource;
  taxInformation: TaxInformation;

  loading = true;

  protected readonly Math = Math;

  constructor(
    private activatedRoute: ActivatedRoute,
    private billingApiService: BillingApiServiceAbstraction,
    private dialogService: DialogService,
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
    private router: Router,
    private toastService: ToastService,
  ) {
    this.activatedRoute.params
      .pipe(
        takeUntilDestroyed(),
        switchMap(({ organizationId }) => {
          if (this.platformUtilsService.isSelfHost()) {
            return from(this.router.navigate(["/settings/subscription"]));
          }
          this.organizationId = organizationId;
          return from(this.load());
        }),
      )
      .subscribe();
  }

  protected load = async (): Promise<void> => {
    const response = await this.billingApiService.getOrganizationPaymentMethod(this.organizationId);
    this.accountCredit = response.accountCredit;
    this.paymentSource = PaymentSource.from(response.paymentSource);
    this.taxInformation = TaxInformation.from(response.taxInformation);
    this.loading = false;
  };

  protected updatePaymentSource = async (): Promise<void> => {
    const dialogRef = AdjustPaymentDialogV2Component.open(this.dialogService, {
      data: {
        existingPaymentMethodType: this.paymentSource?.type,
        existingTaxInformation: this.taxInformation,
        organizationId: this.organizationId,
      },
    });

    const result = await lastValueFrom(dialogRef.closed);

    if (result === AdjustPaymentDialogV2ResultType.Submitted) {
      await this.load();
    }
  };

  protected updateTaxInformation = async (taxInformation: TaxInformation): Promise<void> => {
    await this.billingApiService.updateOrganizationTaxInformation(
      this.organizationId,
      taxInformation,
    );
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("taxInfoUpdated"),
    });
  };

  protected verifyBankAccount = async (amount1: number, amount2: number): Promise<void> => {
    const request = new VerifyBankAccountRequest(amount1, amount2);
    await this.billingApiService.verifyOrganizationBankAccount(this.organizationId, request);
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("verifiedBankAccount"),
    });
  };

  protected get accountCreditHeaderText(): string {
    const key = this.accountCredit <= 0 ? "accountBalance" : "accountCredit";
    return this.i18nService.t(key);
  }

  protected get paymentSourceClasses() {
    if (this.paymentSource == null) {
      return [];
    }
    switch (this.paymentSource.type) {
      case PaymentMethodType.Card:
        return ["bwi-credit-card"];
      case PaymentMethodType.BankAccount:
        return ["bwi-bank"];
      case PaymentMethodType.Check:
        return ["bwi-money"];
      case PaymentMethodType.PayPal:
        return ["bwi-paypal text-primary"];
      default:
        return [];
    }
  }

  protected get updatePaymentSourceButtonText(): string {
    const key = this.paymentSource == null ? "addPaymentMethod" : "changePaymentMethod";
    return this.i18nService.t(key);
  }
}
