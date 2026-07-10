import { prisma } from "../../lib/prisma";
import { reconcileUserGroupInheritance } from "../../lib/server/inheritance/groups";
import { reconcileUserLabelInheritance } from "../../lib/server/inheritance/labels";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    await reconcileUserGroupInheritance(user.id);
    await reconcileUserLabelInheritance(user.id);
  }
  console.log(`Reconciled inheritance for ${users.length} user${users.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
