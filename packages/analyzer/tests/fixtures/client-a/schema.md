## event

### 0. 備考
* イベント管理テーブル

### 1. id
* イベントID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. title
* イベントタイトル:varchar(255) NOT NULL

### 3. status
* ステータス:tinyint(1) NOT NULL DEFAULT '0'

### 4. cancel_mode
* キャンセルモード:tinyint(1) NOT NULL DEFAULT '0'

### 5. winners_limit
* 当選上限:int(11) NOT NULL DEFAULT '0'

### 6. lottery_exec_flg
* 抽選実行フラグ:tinyint(1) NOT NULL DEFAULT '0'

### 7. created_at
* 作成日時:datetime NOT NULL DEFAULT CURRENT_TIMESTAMP

## event_slot

### 1. id
* スロットID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. event_id
* 親イベントID:int(11) NOT NULL

### 3. slot_date
* スロット日付:date NOT NULL

### 4. slot_time
* スロット時刻:varchar(10) DEFAULT NULL

### 5. time_disp
* 時間表示フラグ:tinyint(1) NOT NULL DEFAULT '1'

## lottery

### 1. id
* 抽選ID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. event_id
* イベントID:int(11) NOT NULL

### 3. user_id
* ユーザーID:int(11) NOT NULL

### 4. invalid
* 無効フラグ:tinyint(1) NOT NULL DEFAULT '0'

## user

### 1. id
* ユーザーID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. name
* 氏名:varchar(100) NOT NULL

### 3. email
* メールアドレス:varchar(255) NOT NULL

### 4. blacklist
* ブラックリスト:tinyint(1) NOT NULL DEFAULT '0'

## information

### 1. id
* お知らせID:int(11) NOT NULL AUTO_INCREMENT
* **キー**: PRIMARY KEY

### 2. title
* タイトル:varchar(255) NOT NULL

### 3. banner
* バナー:varchar(255) DEFAULT NULL

### 4. information
* 本文:text DEFAULT NULL
