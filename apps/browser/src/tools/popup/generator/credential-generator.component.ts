import { Component } from "@angular/core";

import { PassphraseComponent } from "@bitwarden/generator-components";

@Component({
  standalone: true,
  selector: "credential-generator",
  templateUrl: "credential-generator.component.html",
  imports: [PassphraseComponent],
})
export class CredentialGeneratorComponent {}
