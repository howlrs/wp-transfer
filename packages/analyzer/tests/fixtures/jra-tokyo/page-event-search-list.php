<?php
require_once 'db-connect.php';
// イベント検索一覧
$sql = "SELECT * FROM event WHERE status = 1 ORDER BY id DESC";
$stmt = $pdo->query($sql);
$events = $stmt->fetchAll();
