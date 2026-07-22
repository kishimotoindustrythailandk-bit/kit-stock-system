import { readFile, writeFile } from "node:fs/promises";

const dueSchema = (await readFile("migrations/0002_breezy_roxanne_simpson.sql", "utf8"))
  .replaceAll("CREATE TABLE `", "CREATE TABLE IF NOT EXISTS `")
  .replaceAll("CREATE UNIQUE INDEX `", "CREATE UNIQUE INDEX IF NOT EXISTS `");
const dueSeed = await readFile("migrations/0003_cloud_due_seed.sql", "utf8");
const authSchema = await readFile("migrations/0004_cloudflare_auth.sql", "utf8");

const header = `-- KIT Delivery Due Control: upgrade the existing kit-stock-system D1 database.\n-- Safe to run more than once. Existing stock tables, scans and R2 objects are not deleted.\n\n`;
await writeFile("database-upgrade-due.sql", `${header}${dueSchema}\n${dueSeed}\n${authSchema}`, "utf8");
console.log("Created database-upgrade-due.sql");
