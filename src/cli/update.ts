import type { Command } from "commander";
import {
  buildUpdatePlan,
  formatCommand,
  getPackageDir,
  runUpdatePlan,
} from "../update/self.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Update aac based on the current installation method")
    .option("--dry-run", "print the update plan without executing it")
    .action(async (opts: { dryRun?: boolean }) => {
      const packageDir = getPackageDir(import.meta.url);
      const scriptPath = process.argv[1] ?? import.meta.url;
      const plan = buildUpdatePlan(packageDir, scriptPath);

      console.log(plan.summary);
      for (const command of plan.commands) {
        const suffix = command.cwd ? `  (cwd: ${command.cwd})` : "";
        console.log(`- ${formatCommand(command)}${suffix}`);
      }

      if (opts.dryRun) return;

      try {
        runUpdatePlan(plan);
        console.log("aac update completed.");
      } catch (err) {
        console.error(`aac update failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
