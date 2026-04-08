import { describe, it, expect } from "vitest";
import { analyzePhpFile, extractWpVersionFromPhp } from "../src/php-analyzer.js";
import type { PhpFileAnalysis } from "../src/php-analyzer.js";

// ── Helper to build minimal PHP content ──

function phpWrap(body: string): string {
  return `<?php\n${body}\n?>`;
}

describe("analyzePhpFile", () => {
  describe("input parameter extraction", () => {
    it("extracts $_POST params with double quotes", () => {
      const content = phpWrap(`
        $title = $_POST["title"];
        $mode = $_POST["recruiting_mode"];
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.inputParams).toHaveLength(2);
      expect(result.inputParams[0]!.name).toBe("title");
      expect(result.inputParams[0]!.source).toBe("$_POST");
      expect(result.inputParams[1]!.name).toBe("recruiting_mode");
    });

    it("extracts $_POST params with single quotes", () => {
      const content = phpWrap(`$id = $_POST['event_id'];`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.inputParams).toHaveLength(1);
      expect(result.inputParams[0]!.name).toBe("event_id");
      expect(result.inputParams[0]!.source).toBe("$_POST");
    });

    it("extracts $_GET params", () => {
      const content = phpWrap(`$page = $_GET["page"];`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.inputParams).toHaveLength(1);
      expect(result.inputParams[0]!.source).toBe("$_GET");
    });

    it("extracts $_FILES params", () => {
      const content = phpWrap(`$img = $_FILES["banner_img"]["name"];`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.inputParams).toHaveLength(1);
      expect(result.inputParams[0]!.name).toBe("banner_img");
      expect(result.inputParams[0]!.source).toBe("$_FILES");
    });

    it("deduplicates params from the same source", () => {
      const content = phpWrap(`
        $title = $_POST["title"];
        $sql = "INSERT INTO t VALUES ('$title');";
        $x = $_POST["title"];
      `);
      const result = analyzePhpFile(content, "test.php");
      const titles = result.inputParams.filter((p) => p.name === "title");
      expect(titles).toHaveLength(1);
    });
  });

  describe("database operation extraction", () => {
    it("extracts INSERT with columns", () => {
      const content = phpWrap(`
        $sql = "INSERT INTO event(title, status, start_time) VALUES ('$t','$s','$st');";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.dbOperations).toHaveLength(1);
      expect(result.dbOperations[0]!.type).toBe("INSERT");
      expect(result.dbOperations[0]!.table).toBe("event");
      expect(result.dbOperations[0]!.columns).toEqual([
        "title",
        "status",
        "start_time",
      ]);
    });

    it("extracts UPDATE with columns", () => {
      const content = phpWrap(`
        $sql = "UPDATE event SET title='$t', status='1' WHERE id = '$id';";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.dbOperations).toHaveLength(1);
      expect(result.dbOperations[0]!.type).toBe("UPDATE");
      expect(result.dbOperations[0]!.table).toBe("event");
      expect(result.dbOperations[0]!.columns).toContain("title");
      expect(result.dbOperations[0]!.columns).toContain("status");
    });

    it("extracts DELETE", () => {
      const content = phpWrap(`
        $sql = "DELETE FROM event WHERE id='$id';";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.dbOperations).toHaveLength(1);
      expect(result.dbOperations[0]!.type).toBe("DELETE");
      expect(result.dbOperations[0]!.table).toBe("event");
      expect(result.dbOperations[0]!.columns).toEqual([]);
    });

    it("extracts SELECT", () => {
      const content = phpWrap(`
        $sql = "SELECT * FROM event WHERE id='$id';";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.dbOperations).toHaveLength(1);
      expect(result.dbOperations[0]!.type).toBe("SELECT");
      expect(result.dbOperations[0]!.table).toBe("event");
      expect(result.dbOperations[0]!.columns).toEqual(["*"]);
    });

    it("extracts multiple operations from a single file", () => {
      const content = phpWrap(`
        $sql = "SELECT * FROM event WHERE id='$id';";
        $sql = "INSERT INTO event_slot(event_id, time_stamp) VALUES ('$eid','$ts');";
      `);
      const result = analyzePhpFile(content, "event-copy.php");
      expect(result.dbOperations.length).toBeGreaterThanOrEqual(2);
      const types = result.dbOperations.map((o) => o.type);
      expect(types).toContain("SELECT");
      expect(types).toContain("INSERT");
    });
  });

  describe("output type detection", () => {
    it("detects redirect output", () => {
      const content = phpWrap(`
        header('Location: https://jra-event.com/tokyo/');
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.outputType).toBe("redirect");
      expect(result.redirectTarget).toBe("https://jra-event.com/tokyo/");
    });

    it("detects echo output", () => {
      const content = phpWrap(`
        echo "Hello world";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.outputType).toBe("echo");
    });

    it("detects json output", () => {
      const content = phpWrap(`
        echo json_encode($data);
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.outputType).toBe("json");
    });

    it("returns unknown for no output", () => {
      const content = phpWrap(`$x = 1;`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.outputType).toBe("unknown");
    });
  });

  describe("security issue detection", () => {
    it("detects SQL injection via direct variable interpolation", () => {
      const content = phpWrap(`
        $title = $_POST["title"];
        $sql = "INSERT INTO event(title) VALUES ('$title');";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.securityIssues.length).toBeGreaterThan(0);
      expect(
        result.securityIssues.some((s) => s.includes("SQL injection")),
      ).toBe(true);
    });

    it("detects hardcoded credentials", () => {
      const content = phpWrap(`
        $dbh = new PDO('mysql:host=rds.example.com;dbname=test', 'jra', 'PolieF1boh');
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(
        result.securityIssues.some((s) => s.includes("Hardcoded database credentials")),
      ).toBe(true);
    });

    it("detects missing CSRF protection", () => {
      const content = phpWrap(`
        $id = $_POST["delete"];
        $sql = "DELETE FROM event WHERE id='$id';";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(
        result.securityIssues.some((s) => s.includes("CSRF")),
      ).toBe(true);
    });
  });

  describe("purpose inference", () => {
    it("infers purpose from known file names", () => {
      const content = phpWrap(`$id = $_POST["update"];`);
      const result = analyzePhpFile(content, "event-stop.php");
      expect(result.purpose).toBe("Stop/cancel event");
    });

    it("infers purpose from DB operations for unknown files", () => {
      const content = phpWrap(`
        $sql = "INSERT INTO custom_table(name) VALUES ('x');";
      `);
      const result = analyzePhpFile(content, "custom-action.php");
      expect(result.purpose).toContain("create");
    });
  });

  describe("PHP version hint detection", () => {
    it("detects PHP 7.4 arrow function", () => {
      const content = phpWrap(`$double = fn($x) => $x * 2;`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "7.4")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("Arrow function"))).toBe(true);
    });

    it("detects PHP 7.4 typed property", () => {
      const content = phpWrap(`class Foo { public int $id; }`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "7.4")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("Typed property"))).toBe(true);
    });

    it("detects PHP 8.0 match expression", () => {
      const content = phpWrap(`$result = match($status) { 1 => 'active', 0 => 'inactive' };`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "8.0")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("match expression"))).toBe(true);
    });

    it("detects PHP 8.0 null-safe operator", () => {
      const content = phpWrap(`$name = $user?->getName();`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "8.0")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("Null-safe"))).toBe(true);
    });

    it("detects PHP 8.1 readonly keyword", () => {
      const content = phpWrap(`readonly class Config { }`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "8.1")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("readonly"))).toBe(true);
    });

    it("detects PHP 8.1 enum declaration", () => {
      const content = phpWrap(`enum Status: string { case Active = 'active'; }`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "8.1")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("Enum"))).toBe(true);
    });

    it("detects PHP 8.0 attribute syntax", () => {
      const content = phpWrap(`#[Route('/api/users')]\nclass UserController { }`);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.some((h) => h.minVersion === "8.0")).toBe(true);
      expect(result.phpVersionHints.some((h) => h.reason.includes("attribute"))).toBe(true);
    });

    it("returns empty hints for legacy PHP code", () => {
      const content = phpWrap(`
        $title = $_POST["title"];
        $sql = "INSERT INTO event(title) VALUES ('$title');";
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints).toEqual([]);
    });

    it("collects multiple hints from a single file", () => {
      const content = phpWrap(`
        readonly class Config {
          public int $id;
          public function handle(): string {
            return match($this->id) { 1 => 'one', default => 'other' };
          }
        }
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.phpVersionHints.length).toBeGreaterThanOrEqual(3);
      const versions = result.phpVersionHints.map((h) => h.minVersion);
      expect(versions).toContain("7.4");
      expect(versions).toContain("8.0");
      expect(versions).toContain("8.1");
    });
  });

  describe("extractWpVersionFromPhp", () => {
    it("extracts version from wp-includes/version.php content", () => {
      const content = `<?php
/**
 * @global string $wp_version
 */
$wp_version = '6.7';
$wp_db_version = 58975;
`;
      expect(extractWpVersionFromPhp(content)).toBe("6.7");
    });

    it("handles double-quoted version string", () => {
      const content = `$wp_version = "5.9.3";`;
      expect(extractWpVersionFromPhp(content)).toBe("5.9.3");
    });

    it("returns undefined when no version found", () => {
      const content = `<?php echo "hello"; ?>`;
      expect(extractWpVersionFromPhp(content)).toBeUndefined();
    });
  });

  describe("real-world JRA insert.php pattern", () => {
    it("correctly analyzes the insert.php file pattern", () => {
      const content = `
<?php

$title = $_POST["title"];
$recruiting_type = $_POST["recruiting_type"];
$status = 0;

$start_time = str_replace(array("T"), " ", $_POST["start_time"]);
$start_time = $start_time.":00";

$dbh = NULL;
try{
    $dbh = new PDO('mysql:host=rds.example.com;dbname=tokyo', 'jra', 'PolieF1boh',
                   array(PDO::ATTR_EMULATE_PREPARES => false));
}catch( PDOException $e){
    exit;
}

$sql = "INSERT INTO event(
    title,
    recruiting_type,
    status,
    start_time
)
VALUES (
    '$title',
    '$recruiting_type',
    '$status',
    '$start_time'
    );";
try{
    $sth = $dbh->prepare($sql);
    $sth->execute();
    $event_id = $dbh->lastInsertId();
}catch(PDOException $e){
    exit;
}

header('Location: https://jra-event.com/tokyo/');
?>`;

      const result = analyzePhpFile(content, "insert.php");

      expect(result.fileName).toBe("insert.php");
      expect(result.purpose).toBe("Create new record");
      expect(result.outputType).toBe("redirect");
      expect(result.redirectTarget).toBe("https://jra-event.com/tokyo/");

      // Should find POST params
      const postParams = result.inputParams.filter(
        (p) => p.source === "$_POST",
      );
      expect(postParams.length).toBeGreaterThanOrEqual(3);
      expect(postParams.map((p) => p.name)).toContain("title");
      expect(postParams.map((p) => p.name)).toContain("recruiting_type");
      expect(postParams.map((p) => p.name)).toContain("start_time");

      // Should find INSERT operation
      const inserts = result.dbOperations.filter((o) => o.type === "INSERT");
      expect(inserts.length).toBeGreaterThanOrEqual(1);
      expect(inserts[0]!.table).toBe("event");
      expect(inserts[0]!.columns).toContain("title");

      // Should flag security issues
      expect(result.securityIssues.length).toBeGreaterThan(0);
    });
  });
});
