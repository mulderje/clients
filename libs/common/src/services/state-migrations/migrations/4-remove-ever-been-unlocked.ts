import { MigrationHelper } from "../migration-helper";
import { IRREVERSIBLE, Migrator } from "../migrator";

type ExpectedAccountType = { profile?: { everBeenUnlocked?: boolean } };

export class RemoveEverBeenUnlockedMigrator extends Migrator<3, 4> {
  async migrate(helper: MigrationHelper): Promise<void> {
    const accounts = await helper.getAccounts<ExpectedAccountType>();

    async function removeEverBeenUnlocked(id: string, account: ExpectedAccountType) {
      if (account?.profile?.everBeenUnlocked != null) {
        delete account.profile.everBeenUnlocked;
        return helper.set(id, account);
      }
    }

    Promise.all(accounts.map(async ({ id, account }) => removeEverBeenUnlocked(id, account)));
  }

  rollback(helper: MigrationHelper): Promise<void> {
    throw IRREVERSIBLE;
  }
}
