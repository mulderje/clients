import { Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CommandDefinition, MessageListener } from "@bitwarden/common/platform/messaging";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { DialogService, ToastService } from "@bitwarden/components";

@Injectable({
  providedIn: "root",
})
export class SSHAgentService {
  constructor(
    private cipherService: CipherService,
    private logService: LogService,
    private dialogService: DialogService,
    private messageListener: MessageListener,
    private authService: AuthService,
    private accountService: AccountService,
    private toastService: ToastService,
    private i18nService: I18nService,
  ) {
    this.messageListener
      .messages$(new CommandDefinition("sshagent.signrequest"))
      .subscribe((message: any) => {
        (async () => {
          const cipherUuid = message.uuid;
          const id = message.id;

          ipc.platform.focusWindow();

          const activeAccountId = (await firstValueFrom(this.accountService.activeAccount$)).id;
          const isLocked =
            (await firstValueFrom(this.authService.authStatusFor$(activeAccountId))) ==
            AuthenticationStatus.Locked;
          if (isLocked) {
            this.toastService.showToast({
              variant: "info",
              title: null,
              message: this.i18nService.t("sshAgentUnlockRequired"),
            });

            const start = new Date();
            while (
              (await firstValueFrom(this.authService.authStatusFor$(activeAccountId))) ==
              AuthenticationStatus.Locked
            ) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              if (new Date().getTime() - start.getTime() > 1000 * 60 * 5) {
                this.logService.error("[SSH Agent] Timeout waiting for unlock");
                this.toastService.showToast({
                  variant: "error",
                  title: null,
                  message: this.i18nService.t("sshAgentUnlockTimeout"),
                });
                await ipc.platform.sshagent.signRequestResponse(id, false);
                return;
              }
            }
          }

          const decryptedCiphers = await this.cipherService.getAllDecrypted();
          const cipher = decryptedCiphers.find((cipher) => cipher.id == cipherUuid);

          const result = await this.dialogService.openSimpleDialog({
            title: "SSH Agent",
            content: "Allow an application to use the SSH key: " + cipher.name,
            acceptButtonText: "Allow",
            cancelButtonText: "Deny",
            type: "primary",
          });
          await ipc.platform.sshagent.signRequestResponse(id, result);
          ipc.platform.hideWindow();
        })()
          .then(() => {})
          .catch((e) => {
            this.logService.error("Error in SSHAgent sign request: ", e);
          });
      });

    setInterval(async () => {
      const ciphers = await this.cipherService.getAllDecrypted();
      if (ciphers == null) {
        await ipc.platform.sshagent.lock();
        return;
      }

      const noteCiphers = ciphers.filter(
        (cipher) => cipher.type == CipherType.SSHKey && cipher.isDeleted == false,
      );
      const keys = noteCiphers.map((cipher) => {
        return {
          name: cipher.name,
          privateKey: cipher.sshKey.privateKey,
          uuid: cipher.id,
        };
      });
      await ipc.platform.sshagent.setKeys(keys);
    }, 1000);
  }
}
