<?php
require_once 'db-connect.php';
$id = $_POST['update'];
$title = $_POST['title'];
$status = $_POST['status'];
$cancel_mode = $_POST['cancel_mode'];
$sql = "UPDATE event SET title = ?, status = ?, cancel_mode = ? WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$title, $status, $cancel_mode, $id]);
header("Location: page-event-search-list.php");
