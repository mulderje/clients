import * as http from "http";

import { ipcMain } from "electron";
import { firstValueFrom } from "rxjs";

import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { MessageSender } from "@bitwarden/common/platform/messaging";

/**
 * The SSO Localhost login service uses a local host listener as fallback in case scheme handling deeplinks does not work.
 * This way it is possible to log in with SSO on appimage, snap, and electron dev using the same methods that the cli uses.
 */
export class SSOLocalhostCallbackService {
  private ssoRedirectUri = "";

  constructor(
    private environmentService: EnvironmentService,
    private messagingService: MessageSender,
  ) {
    ipcMain.handle("openSsoPrompt", async (event, { codeChallenge, state }) => {
      const { ssoCode } = await this.openSsoPrompt(codeChallenge, state);
      this.messagingService.send("ssoCallback", {
        code: ssoCode,
        state: state,
        redirectUri: this.ssoRedirectUri,
      });
    });
  }

  private async openSsoPrompt(
    codeChallenge: string,
    state: string,
  ): Promise<{ ssoCode: string; orgIdentifier: string }> {
    const env = await firstValueFrom(this.environmentService.environment$);

    return new Promise((resolve, reject) => {
      const callbackServer = http.createServer((req, res) => {
        // after 5 minutes, close the server
        setTimeout(
          () => {
            callbackServer.close(() => reject());
          },
          5 * 60 * 1000,
        );

        const urlString = "http://localhost" + req.url;
        const url = new URL(urlString);
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        const orgIdentifier = this.getOrgIdentifierFromState(receivedState);
        res.setHeader("Content-Type", "text/html");
        if (code != null && receivedState != null && this.checkState(receivedState, state)) {
          res.writeHead(200);
          res.end(
            "<html><head><title>Success | Bitwarden Desktop</title></head><body>" +
              "<h1>Successfully authenticated with the Bitwarden desktop app</h1>" +
              "<p>You may now close this tab and return to the app.</p>" +
              "</body></html>",
          );
          callbackServer.close(() =>
            resolve({
              ssoCode: code,
              orgIdentifier: orgIdentifier,
            }),
          );
        } else {
          res.writeHead(400);
          res.end(
            "<html><head><title>Failed | Bitwarden Desktop</title></head><body>" +
              "<h1>Something went wrong logging into the Bitwarden desktop app</h1>" +
              "<p>You may now close this tab and return to the app.</p>" +
              "</body></html>",
          );
          callbackServer.close(() => reject());
        }
      });
      let foundPort = false;
      const webUrl = env.getWebVaultUrl();
      for (let port = 8065; port <= 8070; port++) {
        try {
          this.ssoRedirectUri = "http://localhost:" + port;
          callbackServer.listen(port, () => {
            this.messagingService.send("launchUri", {
              url:
                webUrl +
                "/#/sso?clientId=" +
                "desktop" +
                "&redirectUri=" +
                encodeURIComponent(this.ssoRedirectUri) +
                "&state=" +
                state +
                "&codeChallenge=" +
                codeChallenge,
            });
          });
          foundPort = true;
          break;
        } catch {
          // Ignore error since we run the same command up to 5 times.
        }
      }
      if (!foundPort) {
        reject();
      }
    });
  }

  private getOrgIdentifierFromState(state: string): string {
    if (state === null || state === undefined) {
      return null;
    }

    const stateSplit = state.split("_identifier=");
    return stateSplit.length > 1 ? stateSplit[1] : null;
  }

  private checkState(state: string, checkState: string): boolean {
    if (state === null || state === undefined) {
      return false;
    }
    if (checkState === null || checkState === undefined) {
      return false;
    }

    const stateSplit = state.split("_identifier=");
    const checkStateSplit = checkState.split("_identifier=");
    return stateSplit[0] === checkStateSplit[0];
  }
}