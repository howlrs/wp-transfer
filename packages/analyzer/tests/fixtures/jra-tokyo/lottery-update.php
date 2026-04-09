<?php
require_once 'db-connect.php';
$id = $_POST['update'];
$invalid = $_POST['invalid'];
$sql = "UPDATE lottery SET invalid = ? WHERE id = ?";
$stmt = $pdo->prepare($sql);
$stmt->execute([$invalid, $id]);
