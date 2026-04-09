<?php
require_once 'db-connect.php';
// イベント登録
$title = $_POST['title'];
$status = $_POST['status'];
$sql = "INSERT INTO event (title, status, created_at) VALUES (?, ?, NOW())";
$stmt = $pdo->prepare($sql);
$stmt->execute([$title, $status]);
$event_id = $pdo->lastInsertId();

foreach ($_POST['slots'] as $slot) {
    $sql2 = "INSERT INTO event_slot (event_id, slot_date) VALUES (?, ?)";
    $stmt2 = $pdo->prepare($sql2);
    $stmt2->execute([$event_id, $slot]);
}
header("Location: event-list.php");
