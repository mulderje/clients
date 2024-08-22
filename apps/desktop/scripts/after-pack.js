/* eslint-disable @typescript-eslint/no-var-requires, no-console */
require("dotenv").config();
const child_process = require("child_process");
const path = require("path");

const fse = require("fs-extra");

exports.default = run;

async function run(context) {
  console.log("## After pack");
  // console.log(context);

  if (context.electronPlatformName === "linux") {
    console.log("Creating memory-protection wrapper script");
    const appOutDir = context.appOutDir;
    const oldBin = path.join(appOutDir, context.packager.executableName);
    const newBin = path.join(appOutDir, "bitwarden-app");
    fse.moveSync(oldBin, newBin);
    console.log("Moved binary to bitwarden-app");

    const wrapperScript = path.join(__dirname, "../resources/memory-dump-wrapper.sh");
    const wrapperBin = path.join(appOutDir, context.packager.executableName);
    fse.copyFileSync(wrapperScript, wrapperBin);
    fse.chmodSync(wrapperBin, "755");
    console.log("Copied memory-protection wrapper script");
  }

  if (["darwin", "mas"].includes(context.electronPlatformName)) {
    const identities = getIdentities(process.env.CSC_NAME ?? "");
    if (identities.length === 0) {
      throw new Error("No valid identities found");
    }
    const id = identities[0].id;

    console.log("Signing proxy binary before the main bundle, using identity", id);

    const appName = context.packager.appInfo.productFilename;
    const appPath = `${context.appOutDir}/${appName}.app`;
    const proxyPath = path.join(appPath, "Contents", "MacOS", "desktop_proxy");

    const packageId = "LTZ2PFU5D6.com.bitwarden.desktop";
    const entitlementsName = "entitlements.desktop_proxy.plist";
    const entitlementsPath = path.join(__dirname, "..", "resources", entitlementsName);
    child_process.execSync(
      `codesign -s ${id} -i ${packageId} -f --timestamp --options runtime --entitlements ${entitlementsPath} ${proxyPath}`,
    );
  }
}

function getIdentities(csc_name) {
  const ids = child_process.execSync("/usr/bin/security find-identity -v").toString();

  console.log("CSC Name:", csc_name);
  console.log("Identities:");
  console.log(ids);

  return ids
    .split("\n")
    .filter((line) => line.includes("Apple Development:") && line.includes(csc_name))
    .map((line) => {
      const split = line.trim().split(" ");
      const id = split[1];
      const name = split.slice(2).join(" ").replace(/"/g, "");
      return { id, name };
    });
}
