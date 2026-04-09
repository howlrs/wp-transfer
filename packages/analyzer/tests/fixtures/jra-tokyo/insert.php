<?php
require_once 'db-connect.php';
$title = $_POST['title'];
$status = $_POST['status'];
$cancel_mode = $_POST['cancel_mode'];
$winners_limit = $_POST['winners_limit'];
$lottery_exec_flg = $_POST['lottery_exec_flg'];

$sql = "INSERT INTO event (title, status, cancel_mode, winners_limit, lottery_exec_flg) VALUES (?, ?, ?, ?, ?)";
$stmt = $pdo->prepare($sql);
$stmt->execute([$title, $status, $cancel_mode, $winners_limit, $lottery_exec_flg]);
$event_id = $pdo->lastInsertId();

foreach ($_POST['slots'] as $slot) {
    $sql2 = "INSERT INTO event_slot (event_id, slot_date, slot_time, time_disp) VALUES (?, ?, ?, 1)";
    $stmt2 = $pdo->prepare($sql2);
    $stmt2->execute([$event_id, $slot['date'], $slot['time']]);
}
header("Location: page-event-search-list.php");
