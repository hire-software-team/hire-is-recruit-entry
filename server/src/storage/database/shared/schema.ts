import { pgTable, serial, timestamp, varchar, integer, text, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { index } from "drizzle-orm/pg-core"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 员工信息表
export const employees = pgTable(
	"employees",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		name: varchar("name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 20 }).notNull(),
		status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, submitted, completed
			education: varchar("education", { length: 20 }),
			join_date: varchar("join_date", { length: 20 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("employees_phone_idx").on(table.phone),
		index("employees_status_idx").on(table.status),
		index("employees_created_at_idx").on(table.created_at),
	]
);

// 员工文件表
export const employeeFiles = pgTable(
	"employee_files",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		employee_id: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
		file_type: varchar("file_type", { length: 50 }).notNull(), // id_card_front, id_card_back, degree_cert_1, degree_cert_2, degree_cert_3, degree_cert_4, medical_report, resignation_proof
		file_key: text("file_key").notNull(), // 对象存储的key
		file_name: varchar("file_name", { length: 255 }).notNull(), // 原始文件名
		file_size: integer("file_size").notNull(), // 文件大小（字节）
		file_type_ext: varchar("file_type_ext", { length: 20 }).notNull(), // 文件扩展名 (jpg, png, pdf)
		verification_override: boolean("verification_override").default(false), // 是否申诉覆盖AI校验
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("employee_files_employee_id_idx").on(table.employee_id),
		index("employee_files_file_type_idx").on(table.file_type),
	]
);

// 管理员账号表
export const adminUsers = pgTable(
	"admin_users",
	{
		id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
		username: varchar("username", { length: 100 }).notNull().unique(),
		password: varchar("password", { length: 255 }).notNull(), // 加密后的密码
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("admin_users_username_idx").on(table.username),
	]
);
