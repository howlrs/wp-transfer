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
        header('Location: https://example.com/area/');
      `);
      const result = analyzePhpFile(content, "test.php");
      expect(result.outputType).toBe("redirect");
      expect(result.redirectTarget).toBe("https://example.com/area/");
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
        $dbh = new PDO('mysql:host=rds.example.com;dbname=test', 'user', 'password123');
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

  describe("real-world insert.php pattern", () => {
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
    $dbh = new PDO('mysql:host=rds.example.com;dbname=app', 'user', 'password123',
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

header('Location: https://example.com/area/');
?>`;

      const result = analyzePhpFile(content, "insert.php");

      expect(result.fileName).toBe("insert.php");
      expect(result.purpose).toBe("Create new record");
      expect(result.outputType).toBe("redirect");
      expect(result.redirectTarget).toBe("https://example.com/area/");

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

  describe("loop detection", () => {
    it("marks INSERT inside foreach as inLoop", () => {
      const php = `<?php
foreach ($slots as $slot) {
  $sql = "INSERT INTO event_slot (event_id, slot_date) VALUES (?, ?)";
  $stmt->execute();
}`;
      const result = analyzePhpFile(php, "test.php");
      const insert = result.dbOperations.find(op => op.table === "event_slot");
      expect(insert).toBeDefined();
      expect(insert!.inLoop).toBe(true);
    });

    it("marks INSERT outside loop as not inLoop", () => {
      const php = `<?php
$sql = "INSERT INTO event (title) VALUES (?)";
$stmt->execute();`;
      const result = analyzePhpFile(php, "test.php");
      expect(result.dbOperations[0]!.inLoop).toBe(false);
    });

    it("detects nested loops correctly", () => {
      const php = `<?php
foreach ($items as $item) {
  if ($item) {
    $sql = "INSERT INTO items (name) VALUES (?)";
    $stmt->execute();
  }
}`;
      const result = analyzePhpFile(php, "test.php");
      expect(result.dbOperations[0]!.inLoop).toBe(true);
    });

    it("handles for loops", () => {
      const php = `<?php
for ($i = 0; $i < count($arr); $i++) {
  $sql = "UPDATE items SET status = 1 WHERE id = ?";
}`;
      const result = analyzePhpFile(php, "test.php");
      expect(result.dbOperations[0]!.inLoop).toBe(true);
    });
  });
});

describe("form spec extraction", () => {
  it("extracts select elements with options", () => {
    const html = `<?php get_header(); ?>
<form action="/insert.php" method="post">
  <h4>【募集タイプ】</h4>
  <select name="recruiting_type">
    <option value="1">先着順</option>
    <option value="2">抽選</option>
    <option value="3">定時抽選</option>
  </select>
  <input type="submit" value="登録する" />
</form>`;
    const result = analyzePhpFile(html, "page-event.php");
    expect(result.formSpec).toBeDefined();
    expect(result.formSpec!.fields).toHaveLength(1);
    expect(result.formSpec!.fields[0]!.type).toBe("select");
    expect(result.formSpec!.fields[0]!.name).toBe("recruiting_type");
    expect(result.formSpec!.fields[0]!.options).toHaveLength(3);
    expect(result.formSpec!.fields[0]!.options![0]!.label).toBe("先着順");
  });

  it("extracts textarea elements", () => {
    const html = `<form action="/insert.php" method="post">
  <h4>【概要】</h4>
  <textarea rows="5" name="description"></textarea>
  <input type="submit" value="登録" />
</form>`;
    const result = analyzePhpFile(html, "page-event.php");
    expect(result.formSpec).toBeDefined();
    const desc = result.formSpec!.fields.find(f => f.name === "description");
    expect(desc).toBeDefined();
    expect(desc!.type).toBe("textarea");
    expect(desc!.label).toBe("概要");
  });

  it("extracts input elements with types", () => {
    const html = `<form action="/insert.php" method="post">
  <h4>【イベントタイトル】</h4>
  <input type="text" name="title" required="required" />
  <h4>【当選人数】</h4>
  <input type="number" name="winners_limit" required="required" />
  <h4>【開始日時】</h4>
  <input type="datetime-local" name="start_time" required="required" />
  <input type="submit" value="作成" />
</form>`;
    const result = analyzePhpFile(html, "page-event.php");
    expect(result.formSpec).toBeDefined();
    expect(result.formSpec!.fields).toHaveLength(3);
    expect(result.formSpec!.fields[0]!.type).toBe("text");
    expect(result.formSpec!.fields[0]!.required).toBe(true);
    expect(result.formSpec!.fields[1]!.type).toBe("number");
    expect(result.formSpec!.fields[2]!.type).toBe("datetime-local");
  });

  it("extracts array fields (isArray=true)", () => {
    const html = `<form action="/insert.php" method="post">
  <h4>【イベント枠名称】</h4>
  <input type="text" name="event_time_text[]" required="required" />
  <input type="submit" value="作成" />
</form>`;
    const result = analyzePhpFile(html, "page-event.php");
    expect(result.formSpec).toBeDefined();
    const field = result.formSpec!.fields.find(f => f.name === "event_time_text");
    expect(field).toBeDefined();
    expect(field!.isArray).toBe(true);
  });

  it("extracts file upload fields", () => {
    const html = `<form action="/upload.php" method="post" enctype="multipart/form-data">
  <h4>【バナー画像】</h4>
  <input type="file" name="banner_img" accept="image/*" />
  <input type="submit" value="登録する" />
</form>`;
    const result = analyzePhpFile(html, "page-info.php");
    expect(result.formSpec).toBeDefined();
    expect(result.formSpec!.enctype).toBe("multipart/form-data");
    const file = result.formSpec!.fields.find(f => f.name === "banner_img");
    expect(file).toBeDefined();
    expect(file!.type).toBe("file");
    expect(file!.accept).toBe("image/*");
  });

  it("extracts submit button label", () => {
    const html = `<form action="/insert.php" method="post">
  <h4>【タイトル】</h4>
  <input type="text" name="title" />
  <input type="submit" value="コピーする" />
</form>`;
    const result = analyzePhpFile(html, "page-copy.php");
    expect(result.formSpec).toBeDefined();
    expect(result.formSpec!.submitLabel).toBe("コピーする");
  });

  it("extracts select options from PHP templates with embedded PHP tags", () => {
    const html = `<form action="/copy.php" method="post">
  <h4>【募集タイプ】</h4>
  <select id="r_type" name="recruiting_type">
    <option <?php echo $type1 ?> value="1">先着順</option>
    <option <?php echo $type2 ?> value="2">抽選</option>
    <option <?php echo $type3 ?> value="3">定時抽選</option>
  </select>
  <input type="submit" value="コピー" />
</form>`;
    const result = analyzePhpFile(html, "page-event-copy.php");
    expect(result.formSpec).toBeDefined();
    const rt = result.formSpec!.fields.find(f => f.name === "recruiting_type");
    expect(rt).toBeDefined();
    expect(rt!.options).toHaveLength(3);
    expect(rt!.options![0]!.value).toBe("1");
    expect(rt!.options![0]!.label).toBe("先着順");
    expect(rt!.options![1]!.label).toBe("抽選");
    expect(rt!.options![2]!.label).toBe("定時抽選");
  });

  it("returns undefined formSpec for non-template files", () => {
    const php = `<?php
$title = $_POST["title"];
$sql = "INSERT INTO event (title) VALUES ('$title')";
header("Location: /");
?>`;
    const result = analyzePhpFile(php, "insert.php");
    expect(result.formSpec).toBeUndefined();
  });

  it("extracts form spec from real page-event-copy.php pattern", () => {
    const html = `<?php get_header(); ?>
<form action="https://example.com/test/event-copy.php" method="post">
  <h4>【イベントタイトル】</h4>
  <input type="text" name="title" size="10" value="" required="required" />
  <h4>【募集タイプ】</h4>
  <select id="r_type" name="recruiting_type">
    <option value="1">先着順</option>
    <option value="2">抽選</option>
    <option value="3">定時抽選</option>
  </select>
  <h4>【もぎり番号設定】</h4>
  <select id="mogiri_mode" name="mogiri_mode" required="required">
    <option value="1">番号引き換えあり</option>
    <option value="3">番号引き換えなし</option>
  </select>
  <h4>【概要】</h4>
  <textarea id="textarea" rows="5" name="description"></textarea>
  <h4>【開始日時】</h4>
  <input type="datetime-local" name="start_time" value="" required="required">
  <h4>【当選人数】</h4>
  <input type="number" name="winners_limit" value="" required="required">
  <input type="submit" value="コピーする" />
</form>`;
    const result = analyzePhpFile(html, "page-event-copy.php");
    expect(result.formSpec).toBeDefined();
    expect(result.formSpec!.action).toBe("https://example.com/test/event-copy.php");
    expect(result.formSpec!.submitLabel).toBe("コピーする");
    expect(result.formSpec!.fields.length).toBeGreaterThanOrEqual(6);

    const rt = result.formSpec!.fields.find(f => f.name === "recruiting_type");
    expect(rt).toBeDefined();
    expect(rt!.type).toBe("select");
    expect(rt!.options).toHaveLength(3);

    const desc = result.formSpec!.fields.find(f => f.name === "description");
    expect(desc).toBeDefined();
    expect(desc!.type).toBe("textarea");
  });
});
