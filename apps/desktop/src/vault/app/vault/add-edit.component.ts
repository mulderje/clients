import { DatePipe } from "@angular/common";
import {
  Component,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from "@angular/core";
import { NgForm } from "@angular/forms";

import { ModalRef } from "@bitwarden/angular/components/modal/modal.ref";
import { ModalService } from "@bitwarden/angular/services/modal.service";
import { AddEditComponent as BaseAddEditComponent } from "@bitwarden/angular/vault/components/add-edit.component";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { EventCollectionService } from "@bitwarden/common/abstractions/event/event-collection.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BroadcasterService } from "@bitwarden/common/platform/abstractions/broadcaster.service";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SendApiService } from "@bitwarden/common/tools/send/services/send-api.service.abstraction";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CollectionService } from "@bitwarden/common/vault/abstractions/collection.service";
import { FolderService } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { SSHKeyData } from "@bitwarden/common/vault/models/data/ssh-key.data";
import { DialogService } from "@bitwarden/components";
import { PasswordRepromptService } from "@bitwarden/vault";

import { SSHGeneratorComponent } from "../../../app/tools/sshkey-generator.component";
import { SSHAgentService } from "../../../platform/services/renderer-ssh-agent.service";
import { CipherType } from "@bitwarden/common/vault/enums";

const BroadcasterSubscriptionId = "AddEditComponent";

@Component({
  selector: "app-vault-add-edit",
  templateUrl: "add-edit.component.html",
})
export class AddEditComponent extends BaseAddEditComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild("form")
  private form: NgForm;
  @ViewChild("sshGenerator", { read: ViewContainerRef, static: true })
  sshGeneratorModalRef: ViewContainerRef;
  private modal: ModalRef = null;
  showPrivateKey = false;

  constructor(
    cipherService: CipherService,
    folderService: FolderService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    auditService: AuditService,
    accountService: AccountService,
    collectionService: CollectionService,
    messagingService: MessagingService,
    eventCollectionService: EventCollectionService,
    policyService: PolicyService,
    passwordRepromptService: PasswordRepromptService,
    private broadcasterService: BroadcasterService,
    private ngZone: NgZone,
    logService: LogService,
    organizationService: OrganizationService,
    sendApiService: SendApiService,
    dialogService: DialogService,
    datePipe: DatePipe,
    configService: ConfigService,
    private sshAgentService: SSHAgentService,
    private modalService: ModalService,
  ) {
    super(
      cipherService,
      folderService,
      i18nService,
      platformUtilsService,
      auditService,
      accountService,
      collectionService,
      messagingService,
      eventCollectionService,
      policyService,
      logService,
      passwordRepromptService,
      organizationService,
      sendApiService,
      dialogService,
      window,
      datePipe,
      configService,
    );
  }

  async ngOnInit() {
    await super.ngOnInit();
    await this.load();
    this.broadcasterService.subscribe(BroadcasterSubscriptionId, async (message: any) => {
      this.ngZone.run(() => {
        switch (message.command) {
          case "windowHidden":
            this.onWindowHidden();
            break;
          default:
        }
      });
    });
    // We use ngOnChanges for everything else instead.
  }

  async ngOnChanges() {
    await this.load();
  }

  ngOnDestroy() {
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  async load() {
    if (
      document.querySelectorAll("app-vault-add-edit .ng-dirty").length === 0 ||
      (this.cipher != null && this.cipherId !== this.cipher.id)
    ) {
      this.cipher = null;
    }
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    super.load();
  }

  onWindowHidden() {
    this.showPassword = false;
    this.showCardNumber = false;
    this.showCardCode = false;
    if (this.cipher !== null && this.cipher.hasFields) {
      this.cipher.fields.forEach((field) => {
        field.showValue = false;
      });
    }
  }

  allowOwnershipOptions(): boolean {
    return (
      (!this.editMode || this.cloneMode) &&
      this.ownershipOptions &&
      (this.ownershipOptions.length > 1 || !this.allowPersonal)
    );
  }

  markPasswordAsDirty() {
    this.form.controls["Login.Password"].markAsDirty();
  }

  openHelpReprompt() {
    this.platformUtilsService.launchUri(
      "https://bitwarden.com/help/managing-items/#protect-individual-items",
    );
  }

  async generateSSHKey() {
    this.modalService.closeAll();

    const [modal, childComponent] = await this.modalService.openViewRef(
      SSHGeneratorComponent,
      this.sshGeneratorModalRef,
      (comp) => {},
    );
    this.modal = modal;

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    childComponent.onSelected.subscribe((value: SSHKeyData) => {
      this.modal.close();
      this.cipher.sshKey.privateKey = value.privateKey;
      this.cipher.sshKey.publicKey = value.publicKey;
      this.cipher.sshKey.keyFingerprint = value.keyFingerprint;
    });

    // eslint-disable-next-line rxjs-angular/prefer-takeuntil
    this.modal.onClosed.subscribe(() => {
      this.modal = null;
    });
  }

  async typeChange() {
    if (this.cipher.type == CipherType.SSHKey) {
      await this.generateSSHKey();
    }
  }

  truncateString(value: string, length: number) {
    return value.length > length ? value.substring(0, length) + "..." : value;
  }

  togglePrivateKey() {
    this.showPrivateKey = !this.showPrivateKey;
  }
}
