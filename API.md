# HR 入职资料管理系统 - 接口文档

> Base URL: `/api`
> 全局路由前缀：所有接口已自动添加 `/api` 前缀

---

## 目录

1. [通用说明](#通用说明)
2. [认证鉴权](#认证鉴权)
3. [管理员认证](#管理员认证)
4. [员工资料提交](#员工资料提交)
5. [员工资料查询](#员工资料查询)
6. [员工详情与下载](#员工详情与下载)
7. [查看锁定机制](#查看锁定机制)
8. [管理员管理](#管理员管理)
9. [系统维护](#系统维护)

---

## 通用说明

### 响应格式

所有接口统一返回以下格式：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": { ... }
}
```

### 错误响应

| HTTP 状态码 | 含义 |
|------------|------|
| 400 | 请求参数错误 |
| 401 | 未认证（Token 缺失或过期） |
| 403 | 无权限操作 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 管理员角色

| 角色 | role 值 | 权限范围 |
|------|---------|---------|
| 一级管理员 | `level1` | 全部权限，含管理员 CRUD、清空锁定 |
| 二级管理员 | `level2` | 查看/下载/锁定/删除权限范围内的员工 |
| 三级管理员 | `level3` | 仅查看权限范围内的员工 |

---

## 认证鉴权

需要鉴权的接口需在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

Token 有效期：**2 小时**

---

## 管理员认证

### POST /api/hr/auth/login

管理员登录，获取 JWT Token。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 管理员用户名 |
| password | string | 是 | 管理员密码 |

**请求示例：**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应示例：**

```json
{
  "code": 200,
  "msg": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "role": "level1",
    "username": "admin",
    "hrContacts": ["魏经理", "孙经理"]
  }
}
```

---

### POST /api/hr/auth/change-password

修改管理员密码。**需要 JWT 鉴权。**

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| currentPassword | string | 是 | 当前密码 |
| newPassword | string | 是 | 新密码（至少6位） |

**响应示例：**

```json
{
  "code": 200,
  "msg": "密码修改成功"
}
```

---

## 员工资料提交

### POST /api/hr/employees

员工提交入职资料。**无需鉴权。**

- 若手机号已存在且资料未锁定，则更新资料
- 若手机号已存在且资料已锁定，返回 403
- 若手机号不存在，则创建新员工

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 姓名 |
| phone | string | 是 | 手机号 |
| education | string | 是 | 学历 |
| join_date | string | 是 | 入职日期（YYYY-MM-DD） |
| hr_contact | string | 是 | HR联系人 |
| bank_branch | string | 是 | 开户行信息 |
| files | FileItem[] | 是 | 文件列表 |

**FileItem：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fileType | string | 是 | 文件类型（见下方类型表） |
| fileKey | string | 是 | TOS 存储 key |
| fileName | string | 是 | 文件名 |
| fileSize | number | 是 | 文件大小（字节） |
| fileMimetype | string | 否 | MIME 类型 |
| verificationOverride | boolean | 否 | 签名确认标记（默认 false） |

**文件类型（fileType）：**

| 值 | 说明 | 必填 |
|----|------|------|
| photo | 个人照片 | 是 |
| id_card_front | 身份证正面 | 是 |
| id_card_back | 身份证背面 | 是 |
| diploma | 学历证书 | 是 |
| degree | 学位证书 | 否 |
| master_diploma | 硕士学历证书 | 否 |
| master_degree | 硕士学位证书 | 否 |
| doctor_diploma | 博士学历证书 | 否 |
| doctor_degree | 博士学位证书 | 否 |
| medical_report | 体检报告 | 是 |
| resignation_proof | 离职证明 | 是 |
| bank_card_front | 银行卡正面 | 是 |
| bank_card_back | 银行卡背面 | 是 |
| bank_statement | 银行流水 | 否 |
| signature | 签字确认 | 是 |

**响应示例：**

```json
{
  "code": 200,
  "msg": "提交成功",
  "data": {
    "employee": {
      "id": 1,
      "name": "张三",
      "phone": "13800138000",
      "education": "本科",
      "join_date": "2026-01-01",
      "hr_contact": "魏经理",
      "bank_branch": "中国工商银行北京朝阳支行",
      "status": "submitted",
      "locked": false,
      "lock_source": null,
      "created_at": "2026-01-01T00:00:00Z"
    },
    "files": [
      {
        "id": 1,
        "file_type": "id_card_front",
        "file_key": "uploads/xxx.jpg",
        "file_name": "身份证正面.jpg",
        "file_size": 102400,
        "file_type_ext": "image/jpeg",
        "verification_override": false
      }
    ]
  }
}
```

---

## 员工资料查询

### GET /api/hr/employees/status

查询员工资料状态。**无需鉴权。**

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 员工手机号 |

**响应示例：**

```json
{
  "code": 200,
  "data": {
    "submitted": true,
    "employeeId": 1,
    "name": "张三",
    "locked": false,
    "lockSource": null,
    "status": "submitted"
  }
}
```

---

### GET /api/hr/employees/own-files

获取员工自己的文件列表（含签名 URL）。**无需鉴权。**

- 资料未提交返回空数组
- 手动锁定（manual）时返回 403
- 自动锁定（auto/管理员正在查看）时允许获取

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| phone | string | 是 | 员工手机号 |

**响应示例：**

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "file_type": "id_card_front",
      "file_key": "uploads/xxx.jpg",
      "file_name": "身份证正面.jpg",
      "file_size": 102400,
      "file_type_ext": "image/jpeg",
      "signed_url": "https://tos-xxx/signed-url..."
    }
  ]
}
```

---

### GET /api/hr/employees

获取员工列表。**需要 JWT 鉴权。**

返回当前管理员权限范围内的员工列表。

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 按姓名搜索 |
| phone | string | 否 | 按手机号搜索 |

**响应示例：**

```json
{
  "code": 200,
  "data": {
    "employees": [
      {
        "id": 1,
        "name": "张三",
        "phone": "13800138000",
        "education": "本科",
        "join_date": "2026-01-01",
        "hr_contact": "魏经理",
        "bank_branch": "中国工商银行北京朝阳支行",
        "status": "submitted",
        "locked": false,
        "lock_source": null,
        "viewing_count": 0,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### GET /api/hr/files/:fileId/proxy

文件代理接口，通过文件 ID 从 Storage 下载文件。**无需鉴权。**

用于签名 URL 失败时的降级方案，直接返回文件二进制流。

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| fileId | number | 文件记录 ID |

**响应：** 文件二进制流，Content-Type 根据文件 MIME 类型设置，缓存 5 分钟。

---

## 员工详情与下载

### GET /api/hr/employees/:id

获取员工详情。**需要 JWT 鉴权。**

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**响应示例：**

```json
{
  "code": 200,
  "data": {
    "employee": {
      "id": 1,
      "name": "张三",
      "phone": "13800138000",
      "education": "本科",
      "join_date": "2026-01-01",
      "hr_contact": "魏经理",
      "bank_branch": "中国工商银行北京朝阳支行",
      "status": "submitted",
      "locked": false,
      "lock_source": null,
      "created_at": "2026-01-01T00:00:00Z"
    },
    "files": [
      {
        "id": 1,
        "file_type": "id_card_front",
        "file_key": "uploads/xxx.jpg",
        "file_name": "身份证正面.jpg",
        "file_size": 102400,
        "file_type_ext": "image/jpeg",
        "signed_url": "https://tos-xxx/signed-url...",
        "verification_override": false
      }
    ]
  }
}
```

---

### GET /api/hr/employees/:id/download

打包下载单个员工的所有资料。**需要 JWT 鉴权，三级管理员无权下载。**

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**响应：** ZIP 文件流，Content-Type: `application/zip`

ZIP 内文件命名格式：`{文件类型中文名}_{文件ID}.{扩展名}`

---

### GET /api/hr/employees/download-all

打包下载全部员工的资料。**需要 JWT 鉴权，三级管理员无权下载。**

**响应：** ZIP 文件流，按员工姓名分文件夹。

---

### POST /api/hr/employees/:id/delete

删除员工资料。**需要 JWT 鉴权，三级管理员无权删除。**

- 若该员工正在被**其他管理员查看**，返回 403
- 若仅被当前管理员自己查看，允许删除

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**响应示例：**

```json
{
  "code": 200,
  "msg": "删除成功"
}
```

---

## 查看锁定机制

### POST /api/hr/employees/:id/enter-view

管理员进入员工详情页，自动锁定员工资料。**需要 JWT 鉴权。**

- 增加 viewing_count（引用计数）
- 若 viewing_count > 0，自动锁定员工资料（lock_source=auto）

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**响应示例：**

```json
{
  "code": 200,
  "msg": "进入查看",
  "data": {
    "viewingCount": 1,
    "locked": true,
    "lockSource": "auto"
  }
}
```

---

### POST /api/hr/employees/:id/exit-view

管理员退出员工详情页，自动解锁。**需要 JWT 鉴权。**

- 减少 viewing_count
- 若 viewing_count 降为 0，自动解锁

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**响应示例：**

```json
{
  "code": 200,
  "msg": "退出查看",
  "data": {
    "viewingCount": 0,
    "locked": false,
    "lockSource": null
  }
}
```

---

### POST /api/hr/employees/:id/lock

手动锁定/解锁员工资料。**需要 JWT 鉴权，三级管理员无权操作。**

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 员工 ID |

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 否 | `lock`（默认）或 `unlock` |

**响应示例：**

```json
{
  "code": 200,
  "msg": "锁定成功",
  "data": {
    "locked": true,
    "lockSource": "manual"
  }
}
```

---

### POST /api/hr/clear-locks

一键清空所有自动锁定状态。**需要 JWT 鉴权，仅一级管理员。**

- 清空所有 employee_viewers 记录
- 解锁所有 lock_source=auto 的员工（手动锁定不受影响）

**响应示例：**

```json
{
  "code": 200,
  "msg": "清空成功",
  "data": {
    "clearedViewers": 3,
    "unlockedEmployees": 2
  }
}
```

---

## 管理员管理

> 以下接口仅一级管理员可用

### GET /api/hr/admins

获取管理员列表。

**响应示例：**

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "role": "level1",
      "hr_contacts": ["魏经理", "孙经理"],
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST /api/hr/admins

创建管理员。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码（至少6位） |
| role | string | 是 | 角色：`level2` 或 `level3` |
| hrContacts | string[] | 否 | 负责的 HR 联系人列表 |

**响应示例：**

```json
{
  "code": 200,
  "msg": "创建成功",
  "data": {
    "id": 2,
    "username": "manager1",
    "role": "level2",
    "hr_contacts": ["魏经理"]
  }
}
```

---

### POST /api/hr/admins/:id/update

修改管理员（重置密码/修改 HR 联系人）。

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 管理员 ID |

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| password | string | 否 | 新密码（至少6位） |
| hrContacts | string[] | 否 | HR 联系人列表 |

**响应示例：**

```json
{
  "code": 200,
  "msg": "修改成功"
}
```

---

### POST /api/hr/admins/:id/delete

删除管理员。

**路径参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 管理员 ID |

**响应示例：**

```json
{
  "code": 200,
  "msg": "删除成功"
}
```

---

## 系统维护

### POST /api/hr/cleanup/orphan-files

手动清理孤儿文件（数据库有记录但 Storage 中不存在的文件）。**需要 JWT 鉴权。**

**响应示例：**

```json
{
  "code": 200,
  "msg": "清理完成",
  "data": {
    "totalChecked": 50,
    "orphanCount": 2,
    "cleanedCount": 2
  }
}
```

---

### GET /api/health

健康检查接口。**无需鉴权。**

**响应示例：**

```json
{
  "status": "success",
  "data": "2026-05-13T07:00:00.000Z"
}
```

---

## 数据库表结构

### employees 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | varchar | 姓名 |
| phone | varchar | 手机号（唯一） |
| education | varchar | 学历 |
| join_date | date | 入职日期 |
| hr_contact | varchar | HR联系人 |
| bank_branch | varchar | 开户行 |
| status | varchar | 状态：draft/submitted |
| locked | boolean | 是否锁定 |
| lock_source | varchar | 锁定来源：auto/manual/null |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### employee_files 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| employee_id | integer | 关联员工 ID |
| file_type | varchar | 文件类型 |
| file_key | varchar | TOS 存储 key |
| file_name | varchar | 文件名 |
| file_size | bigint | 文件大小（字节） |
| file_type_ext | varchar | MIME 类型 |
| verification_override | boolean | 签名确认标记 |
| created_at | timestamptz | 创建时间 |

### hr_admins 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| username | varchar | 用户名（唯一） |
| password | varchar | 加密密码 |
| role | varchar | 角色：level1/level2/level3 |
| hr_contacts | text[] | 负责的 HR 联系人 |
| created_by | integer | 创建者 ID |
| created_at | timestamptz | 创建时间 |

### employee_viewers 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| employee_id | integer | 关联员工 ID |
| admin_id | integer | 查看管理员 ID |
| last_active | timestamptz | 最后活跃时间 |
| created_at | timestamptz | 创建时间 |
