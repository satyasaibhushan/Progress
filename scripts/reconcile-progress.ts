import { prisma } from "../lib/prisma";
import { reconcileUserProgress } from "../lib/server/progress/reconcile";
import { reconcileUserLabelInheritance } from "../lib/server/inheritance/labels";
import { reconcileUserGroupInheritance } from "../lib/server/inheritance/groups";
import { reconcileUserDateBounds } from "../lib/server/inheritance/bounds";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true } });

  for (const user of users) {
    await reconcileUserGroupInheritance(user.id);
    await reconcileUserDateBounds(user.id);
    await reconcileUserLabelInheritance(user.id);
    await reconcileUserProgress(user.id);
  }

  console.log(`Reconciled progress for ${users.length} user${users.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
