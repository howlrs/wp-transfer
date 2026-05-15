<?php
require_once 'db-connect.php';
$title = $_POST['title'];
$banner = $_POST['banner'];
$information = $_POST['information'];
$sql = "INSERT INTO information (title, banner, information) VALUES (?, ?, ?)";
$stmt = $pdo->prepare($sql);
$stmt->execute([$title, $banner, $information]);
