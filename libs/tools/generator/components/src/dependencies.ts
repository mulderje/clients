import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { safeProvider } from "@bitwarden/angular/platform/utils/safe-provider";
import { JslibServicesModule } from "@bitwarden/angular/services/jslib-services.module";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { StateProvider } from "@bitwarden/common/platform/state";
import {
  CheckboxModule,
  ColorPasswordModule,
  FormFieldModule,
  InputModule,
} from "@bitwarden/components";
import { CredentialGeneratorService } from "@bitwarden/generator-core";

/** Shared module containing generator component dependencies */
@NgModule({
  exports: [
    JslibModule,
    JslibServicesModule,
    FormFieldModule,
    CommonModule,
    ReactiveFormsModule,
    ColorPasswordModule,
    InputModule,
    CheckboxModule,
  ],
  providers: [
    safeProvider({
      provide: CredentialGeneratorService,
      useClass: CredentialGeneratorService,
      deps: [StateProvider, PolicyService],
    }),
  ],
  declarations: [],
})
export class DependenciesModule {
  constructor() {}
}
