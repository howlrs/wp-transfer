<?php
require_once 'db-connect.php';
$id = $_POST['delete'];
$sql = "DELETE FROM event WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$id]);
header("Location: page-event-search-list.php");
