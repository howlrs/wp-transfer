<?php
require_once 'db-connect.php';
$id = $_POST['update'];
$blacklist = $_POST['blacklist'];
$sql = "UPDATE user SET blacklist = ? WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$blacklist, $id]);
