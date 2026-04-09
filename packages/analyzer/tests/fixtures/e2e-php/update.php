<?php
require_once 'db-connect.php';
$id = $_POST['update'];
$title = $_POST['title'];
$status = $_POST['status'];
$sql = "UPDATE event SET title = ?, status = ? WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$title, $status, $id]);
header("Location: event-list.php");
