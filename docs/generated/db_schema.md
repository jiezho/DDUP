# DDUP 数据库 Schema（自动生成）

## audit_logs

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| space_id | CHAR(32) | 否 | 否 |  | spaces.id |
| user_id | VARCHAR(200) | 否 | 否 |  |  |
| action | VARCHAR(100) | 否 | 否 |  |  |
| resource_type | VARCHAR(100) | 否 | 否 |  |  |
| resource_id | VARCHAR(200) | 否 | 否 |  |  |
| payload | JSON | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |

## chat_cards

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| message_id | CHAR(32) | 否 | 否 |  | chat_messages.id |
| type | VARCHAR(50) | 否 | 否 |  |  |
| data | JSON | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |

## chat_messages

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| session_id | CHAR(32) | 否 | 否 |  | chat_sessions.id |
| role | VARCHAR(50) | 否 | 否 |  |  |
| text | VARCHAR | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |

## chat_sessions

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| space_id | CHAR(32) | 否 | 否 |  | spaces.id |
| user_id | VARCHAR(200) | 否 | 否 |  |  |
| title | VARCHAR(200) | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |

## space_members

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| space_id | CHAR(32) | 否 | 否 |  | spaces.id |
| user_id | VARCHAR(200) | 否 | 否 |  |  |
| role | VARCHAR(50) | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |

## spaces

| 字段 | 类型 | 可空 | 主键 | 默认值 | 外键 |
|---|---|---:|---:|---|---|
| id | CHAR(32) | 否 | 是 |  |  |
| name | VARCHAR(200) | 否 | 否 |  |  |
| type | VARCHAR(50) | 否 | 否 |  |  |
| owner_user_id | VARCHAR(200) | 否 | 否 |  |  |
| created_at | DATETIME | 否 | 否 | now() |  |
