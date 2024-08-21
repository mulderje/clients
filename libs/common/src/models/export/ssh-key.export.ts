import { SSHKeyView } from "@bitwarden/common/vault/models/view/ssh-key.view";

import { EncString } from "../../platform/models/domain/enc-string";
import { SSHKey as SSHKeyDomain } from "../../vault/models/domain/ssh-key";

import { safeGetString } from "./utils";

export class SSHKeyExport {
  static template(): SSHKeyExport {
    const req = new SSHKeyExport();
    req.privateKey = "";
    req.publicKey = "";
    req.keyFingerprint = "";
    return req;
  }

  static toView(req: SSHKeyExport, view = new SSHKeyView()) {
    view.privateKey = req.privateKey;
    view.publicKey = req.publicKey;
    view.keyFingerprint = req.keyFingerprint;
    return view;
  }

  static toDomain(req: SSHKeyExport, domain = new SSHKeyDomain()) {
    domain.privateKey = req.privateKey != null ? new EncString(req.privateKey) : null;
    domain.publicKey = req.publicKey != null ? new EncString(req.publicKey) : null;
    domain.keyFingerprint = req.keyFingerprint != null ? new EncString(req.keyFingerprint) : null;
    return domain;
  }

  privateKey: string;
  publicKey: string;
  keyFingerprint: string;

  constructor(o?: SSHKeyView | SSHKeyDomain) {
    if (o == null) {
      return;
    }

    this.privateKey = safeGetString(o.privateKey);
    this.publicKey = safeGetString(o.publicKey);
    this.keyFingerprint = safeGetString(o.keyFingerprint);
  }
}
