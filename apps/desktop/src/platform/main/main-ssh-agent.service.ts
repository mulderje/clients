import { ipcMain } from "electron";

import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { sshagent } from "@bitwarden/desktop-napi";

class AgentResponse {
  id: number;
  accepted: boolean;
  timestamp: Date;
}

export class SSHAgent {
  SIGN_TIMEOUT = 60_000;

  private requestResponses: AgentResponse[] = [];
  private request_id = 0;

  constructor(
    private logService: LogService,
    private messagingService: MessagingService,
  ) {}

  init() {
    // handle sign request passing to UI
    sshagent
      .serve(async (err: Error, uuid: string) => {
        // clear all old (> SIGN_TIMEOUT) requests
        this.requestResponses = this.requestResponses.filter(
          (response) => response.timestamp > new Date(Date.now() - this.SIGN_TIMEOUT),
        );

        this.request_id += 1;
        const id_for_this_request = this.request_id;
        this.messagingService.send("sshagent.signrequest", {
          uuid: uuid,
          id: id_for_this_request,
        });

        const start = Date.now();
        while (
          this.requestResponses.filter((response) => response.id == id_for_this_request).length == 0
        ) {
          await new Promise((res) => setTimeout(res, 100));
          if (Date.now() - start > this.SIGN_TIMEOUT) {
            return false;
          }
        }

        const response = this.requestResponses.find(
          (response) => response.id == id_for_this_request,
        );

        this.requestResponses = this.requestResponses.filter(
          (response) => response.id != id_for_this_request,
        );
        return response.accepted;
      })
      .then(() => {})
      .catch((e) => {
        this.logService.error("SSH agent encountered an error: ", e);
      });

    ipcMain.handle(
      "sshagent.setkeys",
      async (event: any, keys: { name: string; privateKey: string; uuid: string }[]) => {
        await sshagent.setKeys(keys);
      },
    );
    ipcMain.handle(
      "sshagent.signrequestresponse",
      async (event: any, { id, accepted }: { id: number; accepted: boolean }) => {
        this.requestResponses.push({ id, accepted, timestamp: new Date() });
      },
    );
    ipcMain.handle(
      "sshagent.generatekey",
      async (event: any, { keyAlgorithm }: { keyAlgorithm: string }) => {
        return await sshagent.generateKeypair(keyAlgorithm);
      },
    );
    ipcMain.handle("sshagent.lock", async (event: any) => {
      return await sshagent.lock();
    });
  }
}
