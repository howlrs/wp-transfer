## event

### 1. id
* イベントID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. title
* イベントタイトル:varchar(255) NOT NULL

### 3. status
* ステータス:tinyint(1) NOT NULL DEFAULT '0'

### 4. created_at
* 作成日時:datetime NOT NULL DEFAULT CURRENT_TIMESTAMP

## event_slot

### 1. id
* スロットID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. event_id
* 親イベントID:int(11) NOT NULL

### 3. slot_date
* スロット日付:date NOT NULL
