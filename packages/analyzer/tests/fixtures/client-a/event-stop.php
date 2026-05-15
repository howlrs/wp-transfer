<?php
require_once 'db-connect.php';
$id = $_POST['update'];
$sql = "UPDATE event SET status = 0 WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$id]);
header("Location: page-event-search-list.php");
