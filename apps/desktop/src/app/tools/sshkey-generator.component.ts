import { Component, EventEmitter, OnInit, Output } from "@angular/core";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SSHKeyData } from "@bitwarden/common/vault/models/data/ssh-key.data";

const SSH_PRIVATE_KEY_TRUNCATE_LENGTH = 100;

@Component({
  selector: "app-ssh-generator",
  templateUrl: "sshkey-generator.component.html",
})
export class SSHGeneratorComponent implements OnInit {
  selectedKeyType: string = "ed25519";
  sshKeyTypes: string[] = ["ed25519", "rsa2048", "rsa3072", "rsa4096"];
  showOptions: boolean = false;
  showPrivateKey: boolean = false;

  privateKey: string = "";
  publicKey: string = "";
  fingerprint: string = "";

  @Output() onSelected = new EventEmitter<SSHKeyData>();

  constructor(
    private i18nService: I18nService,
    private platformUtilsService: PlatformUtilsService,
  ) {}

  async ngOnInit() {
    await this.regenerate();
  }

  i18nSSHKeyType(keyType: string): string {
    return this.i18nService.t(`sshKeyAlgorithm${keyType.toUpperCase()}`);
  }

  truncatedSSHPrivateKey(key: string): string {
    return key.substring(0, SSH_PRIVATE_KEY_TRUNCATE_LENGTH) + "...";
  }

  toggleOptions() {
    this.showOptions = !this.showOptions;
  }

  togglePrivateKeyVisibility() {
    this.showPrivateKey = !this.showPrivateKey;
  }

  select() {
    const sshKeyData = new SSHKeyData();
    sshKeyData.privateKey = this.privateKey;
    sshKeyData.publicKey = this.publicKey;
    sshKeyData.keyFingerprint = this.fingerprint;
    this.onSelected.emit(sshKeyData);
  }

  async regenerate(showNotification: boolean = false) {
    const generatedKey = await ipc.platform.sshagent.generateKey(this.selectedKeyType);
    this.privateKey = generatedKey.privateKey;
    this.publicKey = generatedKey.publicKey;
    this.fingerprint = generatedKey.keyFingerprint;

    if (showNotification) {
      this.platformUtilsService.showToast("info", null, this.i18nService.t("sshKeyGenerated"));
    }
  }

  async copy(value: string, typeI18nKey: string, aType: string): Promise<boolean> {
    if (value == null) {
      return false;
    }

    this.platformUtilsService.copyToClipboard(value, null);
    this.platformUtilsService.showToast(
      "info",
      null,
      this.i18nService.t("valueCopied", this.i18nService.t(typeI18nKey)),
    );
  }

  privateKeyVisibilityFilter(value: string, visibility: boolean): string {
    if (visibility) {
      return value;
    }

    // split by lines, if start with --- leave as is (start end end of private key), otherwise replace with *
    const lines = value.split("\n");
    return lines
      .map((line) => {
        if (line.startsWith("--")) {
          return line;
        }
        return "*".repeat(line.length);
      })
      .join("\n");
  }
}
