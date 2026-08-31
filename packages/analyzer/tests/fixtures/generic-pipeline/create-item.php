<?php
require_once 'db-connect.php';

$name = $_POST['name'];
$active = $_POST['active'];
$sql = "INSERT INTO catalog_item (name, active) VALUES (?, ?)";
$statement = $pdo->prepare($sql);
$statement->execute([$name, $active]);

header("Location: catalog.php");
