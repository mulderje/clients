import { MockProxy } from "jest-mock-extended";

import { MigrationHelper } from "../migration-helper";
import { mockMigrationHelper } from "../migration-helper.spec";

import { RemoveEverBeenUnlockedMigrator } from "./4-remove-ever-been-unlocked";

const migrateExampleJSON = {
  authenticatedAccounts: [
    "c493ed01-4e08-4e88-abc7-332f380ca760",
    "23e61a5f-2ece-4f5e-b499-f0bc489482a9",
  ],
  "c493ed01-4e08-4e88-abc7-332f380ca760": {
    profile: {
      otherStuff: "otherStuff",
      everBeenUnlocked: true,
    },
    otherStuff: "otherStuff",
  },
  "23e61a5f-2ece-4f5e-b499-f0bc489482a9": {
    profile: {
      otherStuff: "otherStuff",
      everBeenUnlocked: false,
    },
    otherStuff: "otherStuff",
  },
  otherStuff: "otherStuff",
};

describe("RemoveEverBeenUnlockedMigrator", () => {
  let helper: MockProxy<MigrationHelper>;
  let sut: RemoveEverBeenUnlockedMigrator;

  beforeEach(() => {
    helper = mockMigrationHelper(migrateExampleJSON);
    sut = new RemoveEverBeenUnlockedMigrator(3, 4);
  });

  describe("migrate", () => {
    it("should remove everBeenUnlocked from profile", async () => {
      await sut.migrate(helper);
      expect(helper.set).toHaveBeenCalledTimes(2);
      expect(helper.set).toHaveBeenCalledWith("c493ed01-4e08-4e88-abc7-332f380ca760", {
        profile: {
          otherStuff: "otherStuff",
        },
        otherStuff: "otherStuff",
      });
      expect(helper.set).toHaveBeenCalledWith("23e61a5f-2ece-4f5e-b499-f0bc489482a9", {
        profile: {
          otherStuff: "otherStuff",
        },
        otherStuff: "otherStuff",
      });
    });
  });
});
